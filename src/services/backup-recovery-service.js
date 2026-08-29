'use strict';

const crypto = require('node:crypto');
const { promisify } = require('node:util');
const { gzip, gunzip } = require('node:zlib');
const { getPool, sql } = require('../database');
const { currentTenantId, getTenantContext, runTenantContext } = require('../tenancy/tenant-context');
const { config } = require('../config/env');
const { createObjectStorageService } = require('./object-storage-service');
const {
    PLATFORM_GLOBAL_BACKUP_TABLES,
    TENANT_BACKUP_REGISTRY_VERSION,
    TENANT_BACKUP_TABLES
} = require('./backup-registry');

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);
const BACKUP_VERSION = 2;
const SCHEMA_VERSION = '009';
const MAX_BACKUP_UPLOAD_BYTES = 25 * 1024 * 1024;
const MAX_BACKUP_JSON_BYTES = 80 * 1024 * 1024;
const MAX_BACKUP_ROWS = 150000;
const BACKUP_CATEGORY = 'backups';
const ACTIVE_TENANT_STATUSES = Object.freeze(['trial', 'active']);
const RECOVERY_STATUSES = Object.freeze(['PENDING', 'RUNNING', 'UPLOADED', 'VERIFYING', 'VERIFIED', 'FAILED', 'EXPIRED', 'DELETED']);

let recoverySchemaPromise;

function backupError(message, statusCode = 500, code = 'BACKUP_OPERATION_FAILED') {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.expose = statusCode < 500;
    error.code = code;
    return error;
}

function normalizePositiveInteger(value, fallback, maximum = Number.MAX_SAFE_INTEGER) {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? Math.min(number, maximum) : fallback;
}

function retentionDays(name, fallback) {
    return normalizePositiveInteger(process.env[name], fallback, 3650);
}

function getRetentionPolicy() {
    return Object.freeze({
        tenant_daily: retentionDays('BACKUP_TENANT_DAILY_RETENTION_DAYS', 30),
        tenant_manual: retentionDays('BACKUP_TENANT_MANUAL_RETENTION_DAYS', 30),
        tenant_pre_restore: retentionDays('BACKUP_TENANT_PRE_RESTORE_RETENTION_DAYS', 30),
        platform_daily: retentionDays('BACKUP_PLATFORM_DAILY_RETENTION_DAYS', 30),
        platform_weekly: retentionDays('BACKUP_PLATFORM_WEEKLY_RETENTION_DAYS', 84),
        platform_monthly: retentionDays('BACKUP_PLATFORM_MONTHLY_RETENTION_DAYS', 365),
        platform_manual: retentionDays('BACKUP_PLATFORM_MANUAL_RETENTION_DAYS', 30)
    });
}

function retentionExpiry(backupType, now = new Date()) {
    const days = getRetentionPolicy()[backupType] || 30;
    return new Date(new Date(now).getTime() + days * 24 * 60 * 60 * 1000);
}

function backupDayKey(value = new Date()) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw backupError('Backup date is invalid.', 400, 'INVALID_BACKUP_DATE');
    return date.toISOString().slice(0, 10);
}

function dateValue(day) {
    return new Date(`${day}T00:00:00.000Z`);
}

function totalRows(tableCounts = {}) {
    return Object.values(tableCounts).reduce((sum, value) => sum + Number(value || 0), 0);
}

function jsonStringify(value) {
    return JSON.stringify(value, (_, item) => typeof item === 'bigint' ? item.toString() : item);
}

function payloadDigest(tables) {
    return crypto.createHash('sha256').update(jsonStringify(tables)).digest('hex');
}

function normalizedTableMap(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function validateTenantBackupPayload(payload, { expectedTenantId = null } = {}) {
    if (!payload || payload.format !== 'logic-fit-tenant-backup') {
        throw backupError('The uploaded file is not a Logic Fit tenant backup.', 400, 'BACKUP_FORMAT_UNSUPPORTED');
    }
    if (Number(payload.version) !== BACKUP_VERSION) {
        throw backupError('The backup version is not supported.', 400, 'BACKUP_VERSION_UNSUPPORTED');
    }
    const tenantId = Number(payload.tenant?.id);
    if (!Number.isInteger(tenantId) || tenantId <= 0) {
        throw backupError('The backup tenant reference is invalid.', 400, 'BACKUP_TENANT_REFERENCE_INVALID');
    }
    if (expectedTenantId != null && tenantId !== Number(expectedTenantId)) {
        throw backupError('The backup belongs to another gym.', 403, 'BACKUP_TENANT_MISMATCH');
    }
    const tables = normalizedTableMap(payload.tables);
    const knownKeys = new Set(TENANT_BACKUP_TABLES.map((item) => item.key));
    const unknownTables = Object.keys(tables).filter((key) => !knownKeys.has(key));
    if (unknownTables.length) throw backupError('The backup contains an unknown table.', 400, 'BACKUP_TABLE_NOT_ALLOWED');
    if (!Array.isArray(tables.members)) throw backupError('The backup members table is missing.', 400, 'BACKUP_MEMBERS_TABLE_MISSING');

    const counts = {};
    let rowCount = 0;
    for (const [key, rows] of Object.entries(tables)) {
        if (!Array.isArray(rows)) throw backupError('A backup table has an invalid shape.', 400, 'BACKUP_TABLE_INVALID');
        if (rows.some((row) => !row || typeof row !== 'object' || Array.isArray(row))) {
            throw backupError('A backup row has an invalid shape.', 400, 'BACKUP_ROW_INVALID');
        }
        const tableRows = rows.map((row) => {
            const tenantKey = Object.keys(row).find((name) => name.toLowerCase() === 'tenant_id');
            if (tenantKey !== undefined && Number(row[tenantKey]) !== tenantId) {
                throw backupError('The backup contains records from another gym.', 403, 'BACKUP_CROSS_TENANT_RECORD');
            }
            return row;
        });
        counts[key] = tableRows.length;
        rowCount += tableRows.length;
        if (rowCount > MAX_BACKUP_ROWS) throw backupError('The backup exceeds the safe row limit.', 400, 'BACKUP_ROW_LIMIT_EXCEEDED');
    }

    const digest = String(payload.integrity?.sha256 || '').toLowerCase();
    if (String(payload.integrity?.algorithm || '').toLowerCase() !== 'sha256' || !/^[a-f0-9]{64}$/.test(digest)) {
        throw backupError('The backup integrity manifest is invalid.', 400, 'BACKUP_INTEGRITY_INVALID');
    }
    if (payloadDigest(tables) !== digest) {
        throw backupError('The backup content failed its integrity check.', 400, 'BACKUP_CHECKSUM_MISMATCH');
    }
    if (payload.manifest?.tenantId != null && Number(payload.manifest.tenantId) !== tenantId) {
        throw backupError('The backup manifest tenant does not match its records.', 400, 'BACKUP_MANIFEST_INVALID');
    }
    return { tenantId, tableCounts: counts, rowCount, integrity: { algorithm: 'sha256', verified: true } };
}

function buildTenantBackupPayload({ tenant, tables, generatedAt = new Date() } = {}) {
    const normalizedTenantId = Number(tenant?.id);
    if (!Number.isInteger(normalizedTenantId) || normalizedTenantId <= 0) {
        throw backupError('A valid tenant is required for a backup.', 500, 'BACKUP_TENANT_REQUIRED');
    }
    const tableCounts = Object.fromEntries(Object.entries(tables || {}).map(([key, rows]) => [key, Array.isArray(rows) ? rows.length : 0]));
    const payload = {
        format: 'logic-fit-tenant-backup',
        version: BACKUP_VERSION,
        backupType: 'tenant',
        generatedAt: new Date(generatedAt).toISOString(),
        applicationVersion: require('../../package.json').version,
        schemaVersion: SCHEMA_VERSION,
        tenant: {
            id: normalizedTenantId,
            slug: String(tenant.slug || '').slice(0, 80),
            name: String(tenant.name || '').slice(0, 160)
        },
        manifest: {
            registryVersion: TENANT_BACKUP_REGISTRY_VERSION,
            tenantId: normalizedTenantId,
            tableCounts,
            rowCount: totalRows(tableCounts)
        },
        tables,
        integrity: {
            algorithm: 'sha256',
            sha256: payloadDigest(tables)
        }
    };
    validateTenantBackupPayload(payload, { expectedTenantId: normalizedTenantId });
    return payload;
}

function quoteIdentifier(value) {
    const name = String(value || '');
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw backupError('Backup schema metadata is invalid.', 500, 'BACKUP_SCHEMA_METADATA_INVALID');
    return `[${name}]`;
}

function safeTableNames(definitions) {
    return definitions.map((item) => String(item.table)).filter((name) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name));
}

async function loadTableMetadata(pool, definitions) {
    const names = safeTableNames(definitions);
    if (!names.length) return new Map();
    const literals = names.map((name) => `N'${name.replaceAll("'", "''")}'`).join(',');
    const result = await pool.request().query(`
        SELECT t.name AS table_name, c.name, c.is_identity AS isIdentity, c.is_computed AS isComputed
        FROM sys.columns AS c
        INNER JOIN sys.tables AS t ON t.object_id=c.object_id
        INNER JOIN sys.schemas AS s ON s.schema_id=t.schema_id
        WHERE s.name=N'dbo' AND t.name IN (${literals})
        ORDER BY t.name, c.column_id;
    `);
    const metadata = new Map(names.map((name) => [name, []]));
    for (const row of result.recordset) {
        const table = String(row.table_name);
        if (metadata.has(table)) metadata.get(table).push({
            name: String(row.name),
            isIdentity: Boolean(row.isIdentity),
            isComputed: Boolean(row.isComputed)
        });
    }
    return metadata;
}

function metadataColumns(metadata, table) {
    const columns = metadata.get(table) || [];
    if (!columns.length) throw backupError('A required backup table is missing.', 503, 'BACKUP_TABLE_MISSING');
    return columns.filter((column) => !column.isComputed);
}

function hasTenantColumn(columns) {
    return columns.some((column) => column.name.toLowerCase() === 'tenant_id');
}

async function readTableRows(pool, definition, metadata, { tenantId = null, allTenants = false } = {}) {
    const columns = metadataColumns(metadata, definition.table);
    if (definition.tenantScoped && !hasTenantColumn(columns)) {
        throw backupError('A backup table is not tenant-scoped yet.', 503, 'BACKUP_TABLE_NOT_TENANT_SCOPED');
    }
    const projection = columns.map((column) => quoteIdentifier(column.name)).join(', ');
    const request = pool.request();
    let predicate = '';
    if (definition.tenantScoped && !allTenants) {
        if (!Number.isInteger(Number(tenantId)) || Number(tenantId) <= 0) throw backupError('A trusted tenant is required.', 500, 'BACKUP_TENANT_REQUIRED');
        request.input('tenantId', sql.Int, Number(tenantId));
        predicate = ' WHERE [tenant_id]=@tenantId';
    }
    const result = await request.query(`SELECT ${projection} FROM dbo.${quoteIdentifier(definition.table)}${predicate};`);
    return result.recordset;
}

async function mapWithConcurrency(items, worker, concurrency = 2) {
    const values = Array.isArray(items) ? items : [];
    const output = new Array(values.length);
    let cursor = 0;
    const workerCount = Math.min(values.length || 1, normalizePositiveInteger(concurrency, 2, 8));
    await Promise.all(Array.from({ length: workerCount }, async () => {
        while (true) {
            const index = cursor++;
            if (index >= values.length) return;
            output[index] = await worker(values[index], index);
        }
    }));
    return output;
}

function tenantScopeId(explicitTenantId = null) {
    const context = getTenantContext();
    const explicit = explicitTenantId == null ? null : Number(explicitTenantId);
    if (explicit != null && (!Number.isInteger(explicit) || explicit <= 0)) throw backupError('Tenant reference is invalid.', 400, 'INVALID_BACKUP_TENANT');
    if (context?.mode === 'platform') {
        if (explicit == null) throw backupError('A target tenant is required from platform scope.', 400, 'BACKUP_TARGET_TENANT_REQUIRED');
        return explicit;
    }
    if (context?.mode !== 'tenant') throw backupError('Tenant context is required for this backup operation.', 500, 'TENANT_CONTEXT_REQUIRED');
    const trusted = currentTenantId({ required: true });
    if (explicit != null && explicit !== trusted) throw backupError('The requested tenant is not the active tenant.', 403, 'BACKUP_TENANT_MISMATCH');
    return trusted;
}

function assertPlatformScope() {
    if (getTenantContext()?.mode !== 'platform') throw backupError('Platform context is required for this operation.', 403, 'PLATFORM_SCOPE_REQUIRED');
}

function recoverySchemaSql() {
    return `
IF OBJECT_ID(N'dbo.gym_backup_records', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_backup_records (
        id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_backup_records PRIMARY KEY,
        tenant_id INT NOT NULL,
        backup_type VARCHAR(32) NOT NULL,
        backup_day DATE NOT NULL,
        status VARCHAR(20) NOT NULL CONSTRAINT DF_gym_backup_records_status DEFAULT ('PENDING'),
        backup_version INT NOT NULL CONSTRAINT DF_gym_backup_records_version DEFAULT (1),
        schema_version VARCHAR(64) NULL,
        backup_format VARCHAR(20) NOT NULL CONSTRAINT DF_gym_backup_records_format DEFAULT ('json.gz'),
        file_name NVARCHAR(260) NOT NULL,
        storage_key NVARCHAR(512) NULL,
        content_type VARCHAR(100) NULL,
        size_bytes BIGINT NULL,
        checksum_sha256 CHAR(64) NULL,
        manifest_json NVARCHAR(MAX) NULL,
        row_count BIGINT NOT NULL CONSTRAINT DF_gym_backup_records_rows DEFAULT (0),
        table_counts_json NVARCHAR(MAX) NULL,
        attempt_count INT NOT NULL CONSTRAINT DF_gym_backup_records_attempts DEFAULT (0),
        error_code VARCHAR(100) NULL,
        started_at DATETIME2(0) NULL,
        completed_at DATETIME2(0) NULL,
        verified_at DATETIME2(0) NULL,
        expires_at DATETIME2(0) NULL,
        created_by_user_id INT NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_backup_records_created DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_backup_records_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_gym_backup_records_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.gym_tenants(id),
        CONSTRAINT CK_gym_backup_records_type CHECK (backup_type IN ('tenant_daily', 'tenant_manual', 'tenant_pre_restore')),
        CONSTRAINT CK_gym_backup_records_status CHECK (status IN ('PENDING', 'RUNNING', 'UPLOADED', 'VERIFYING', 'VERIFIED', 'FAILED', 'EXPIRED', 'DELETED')),
        CONSTRAINT CK_gym_backup_records_format CHECK (backup_format IN ('json.gz', 'bak')),
        CONSTRAINT CK_gym_backup_records_size CHECK (size_bytes IS NULL OR size_bytes >= 0)
    );
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_gym_backup_records_tenant_status_date' AND object_id=OBJECT_ID(N'dbo.gym_backup_records'))
    CREATE INDEX IX_gym_backup_records_tenant_status_date ON dbo.gym_backup_records(tenant_id, status, backup_day DESC, id DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'UQ_gym_backup_records_tenant_daily_day' AND object_id=OBJECT_ID(N'dbo.gym_backup_records'))
    CREATE UNIQUE INDEX UQ_gym_backup_records_tenant_daily_day ON dbo.gym_backup_records(tenant_id, backup_type, backup_day) WHERE backup_type='tenant_daily';
IF OBJECT_ID(N'dbo.gym_backup_audit_log', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_backup_audit_log (
        id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_backup_audit_log PRIMARY KEY,
        tenant_id INT NOT NULL,
        backup_id BIGINT NULL,
        event_type VARCHAR(40) NOT NULL,
        actor_user_id INT NULL,
        reason NVARCHAR(1000) NULL,
        result VARCHAR(20) NOT NULL CONSTRAINT DF_gym_backup_audit_result DEFAULT ('success'),
        safe_metadata_json NVARCHAR(MAX) NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_backup_audit_created DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_gym_backup_audit_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.gym_tenants(id),
        CONSTRAINT CK_gym_backup_audit_result CHECK (result IN ('success', 'failed', 'blocked'))
    );
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_gym_backup_audit_tenant_date' AND object_id=OBJECT_ID(N'dbo.gym_backup_audit_log'))
    CREATE INDEX IX_gym_backup_audit_tenant_date ON dbo.gym_backup_audit_log(tenant_id, created_at DESC, id DESC);
IF OBJECT_ID(N'dbo.gym_platform_backup_records', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_platform_backup_records (
        id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_platform_backup_records PRIMARY KEY,
        backup_type VARCHAR(32) NOT NULL,
        backup_day DATE NOT NULL,
        status VARCHAR(20) NOT NULL CONSTRAINT DF_gym_platform_backup_status DEFAULT ('PENDING'),
        backup_version INT NOT NULL CONSTRAINT DF_gym_platform_backup_version DEFAULT (1),
        schema_version VARCHAR(64) NULL,
        backup_format VARCHAR(20) NOT NULL CONSTRAINT DF_gym_platform_backup_format DEFAULT ('json.gz'),
        file_name NVARCHAR(260) NOT NULL,
        storage_key NVARCHAR(512) NULL,
        content_type VARCHAR(100) NULL,
        size_bytes BIGINT NULL,
        checksum_sha256 CHAR(64) NULL,
        manifest_json NVARCHAR(MAX) NULL,
        row_count BIGINT NOT NULL CONSTRAINT DF_gym_platform_backup_rows DEFAULT (0),
        table_counts_json NVARCHAR(MAX) NULL,
        attempt_count INT NOT NULL CONSTRAINT DF_gym_platform_backup_attempts DEFAULT (0),
        error_code VARCHAR(100) NULL,
        started_at DATETIME2(0) NULL,
        completed_at DATETIME2(0) NULL,
        verified_at DATETIME2(0) NULL,
        expires_at DATETIME2(0) NULL,
        created_by_user_id INT NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_platform_backup_created DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_platform_backup_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT CK_gym_platform_backup_type CHECK (backup_type IN ('platform_daily', 'platform_weekly', 'platform_monthly', 'platform_manual')),
        CONSTRAINT CK_gym_platform_backup_status CHECK (status IN ('PENDING', 'RUNNING', 'UPLOADED', 'VERIFYING', 'VERIFIED', 'FAILED', 'EXPIRED', 'DELETED')),
        CONSTRAINT CK_gym_platform_backup_format CHECK (backup_format IN ('json.gz', 'bak')),
        CONSTRAINT CK_gym_platform_backup_size CHECK (size_bytes IS NULL OR size_bytes >= 0)
    );
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_gym_platform_backup_status_date' AND object_id=OBJECT_ID(N'dbo.gym_platform_backup_records'))
    CREATE INDEX IX_gym_platform_backup_status_date ON dbo.gym_platform_backup_records(status, backup_day DESC, id DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'UQ_gym_platform_backup_daily_day' AND object_id=OBJECT_ID(N'dbo.gym_platform_backup_records'))
    CREATE UNIQUE INDEX UQ_gym_platform_backup_daily_day ON dbo.gym_platform_backup_records(backup_type, backup_day) WHERE backup_type IN ('platform_daily', 'platform_weekly', 'platform_monthly');
IF OBJECT_ID(N'dbo.gym_platform_backup_audit_log', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_platform_backup_audit_log (
        id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_platform_backup_audit_log PRIMARY KEY,
        backup_id BIGINT NULL,
        event_type VARCHAR(40) NOT NULL,
        actor_user_id INT NULL,
        reason NVARCHAR(1000) NULL,
        result VARCHAR(20) NOT NULL CONSTRAINT DF_gym_platform_backup_audit_result DEFAULT ('success'),
        safe_metadata_json NVARCHAR(MAX) NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_platform_backup_audit_created DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT CK_gym_platform_backup_audit_result CHECK (result IN ('success', 'failed', 'blocked'))
    );
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_gym_platform_backup_audit_date' AND object_id=OBJECT_ID(N'dbo.gym_platform_backup_audit_log'))
    CREATE INDEX IX_gym_platform_backup_audit_date ON dbo.gym_platform_backup_audit_log(created_at DESC, id DESC);
`;
}

async function ensureRecoveryTables({ readOnly = false } = {}) {
    if (readOnly || getTenantContext()?.readOnlyBaseline) return;
    if (!recoverySchemaPromise) {
        recoverySchemaPromise = getPool().then((pool) => pool.request().batch(recoverySchemaSql())).catch((error) => {
            recoverySchemaPromise = undefined;
            throw error;
        });
    }
    return recoverySchemaPromise;
}

function backupFileName(scope, id, format, now) {
    const timestamp = new Date(now).toISOString().replaceAll(/[-:]/g, '').replace('T', '_').replace(/\.\d{3}Z$/, 'Z');
    const suffix = format === 'bak' ? 'bak' : 'json.gz';
    return `logic-fit-${scope}-${id}-${timestamp}.${suffix}`;
}

async function loadTenantReference(pool, tenantId) {
    const result = await pool.request().input('tenantId', sql.Int, tenantId).query(`
        SELECT TOP (1) id, name, slug, status
        FROM dbo.gym_tenants
        WHERE id=@tenantId;
    `);
    const tenant = result.recordset[0];
    if (!tenant) throw backupError('The requested gym does not exist.', 404, 'TENANT_NOT_FOUND');
    return { id: Number(tenant.id), name: tenant.name, slug: tenant.slug, status: tenant.status };
}

async function buildTenantBackupArtifact({ tenantId = null, format = 'json.gz', now = new Date(), concurrency = 2 } = {}) {
    const trustedTenantId = tenantScopeId(tenantId);
    const pool = await getPool();
    const tenant = await loadTenantReference(pool, trustedTenantId);
    const metadata = await loadTableMetadata(pool, TENANT_BACKUP_TABLES);
    const definitions = TENANT_BACKUP_TABLES;
    const rows = await mapWithConcurrency(definitions, async (definition) => [
        definition.key,
        await readTableRows(pool, definition, metadata, { tenantId: trustedTenantId })
    ], concurrency);
    const tables = Object.fromEntries(rows);
    const payload = buildTenantBackupPayload({ tenant, tables, generatedAt: now });
    const json = jsonStringify(payload);
    if (Buffer.byteLength(json, 'utf8') > MAX_BACKUP_JSON_BYTES) throw backupError('The backup exceeds the safe size limit.', 400, 'BACKUP_SIZE_LIMIT_EXCEEDED');
    const buffer = await gzipAsync(Buffer.from(json, 'utf8'));
    return {
        buffer,
        payload,
        format: String(format).toLowerCase() === 'bak' ? 'bak' : 'json.gz',
        filename: backupFileName('tenant', trustedTenantId, String(format).toLowerCase() === 'bak' ? 'bak' : 'json.gz', now),
        generatedAt: payload.generatedAt,
        backupDay: backupDayKey(now),
        checksum: crypto.createHash('sha256').update(buffer).digest('hex'),
        rowCounts: payload.manifest.tableCounts,
        rowCount: payload.manifest.rowCount,
        tenantId: trustedTenantId
    };
}

async function inspectTenantBackupBuffer(input, { expectedTenantId = null } = {}) {
    const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input || []);
    if (!buffer.length || buffer.length > MAX_BACKUP_UPLOAD_BYTES) throw backupError('The backup file is empty or too large.', 400, 'BACKUP_FILE_SIZE_INVALID');
    if (buffer[0] !== 0x1f || buffer[1] !== 0x8b) throw backupError('The backup must be gzip-compressed JSON.', 400, 'BACKUP_COMPRESSION_INVALID');
    let jsonBuffer;
    try {
        jsonBuffer = await gunzipAsync(buffer, { maxOutputLength: MAX_BACKUP_JSON_BYTES });
    } catch (_) {
        throw backupError('The backup compression is invalid.', 400, 'BACKUP_COMPRESSION_INVALID');
    }
    let payload;
    try { payload = JSON.parse(jsonBuffer.toString('utf8')); } catch (_) { throw backupError('The backup JSON is invalid.', 400, 'BACKUP_JSON_INVALID'); }
    const validation = validateTenantBackupPayload(payload, { expectedTenantId });
    return {
        payload,
        tenantId: validation.tenantId,
        generatedAt: payload.generatedAt || null,
        compressedBytes: buffer.length,
        jsonBytes: jsonBuffer.length,
        rowCount: validation.rowCount,
        tableCounts: validation.tableCounts,
        artifactChecksum: crypto.createHash('sha256').update(buffer).digest('hex'),
        integrity: validation.integrity
    };
}

function metadataJson(payload) {
    return jsonStringify({
        format: payload.format,
        version: payload.version,
        backupType: payload.backupType,
        generatedAt: payload.generatedAt,
        schemaVersion: payload.schemaVersion,
        registryVersion: payload.manifest?.registryVersion,
        tenantId: payload.manifest?.tenantId,
        tableCounts: payload.manifest?.tableCounts,
        rowCount: payload.manifest?.rowCount
    }).slice(0, 1_000_000);
}

function safeJson(value, fallback = {}) {
    try { return JSON.parse(value || ''); } catch (_) { return fallback; }
}

function mapRecord(row, scope = 'tenant') {
    if (!row) return null;
    return {
        id: Number(row.id),
        tenantId: row.tenant_id == null ? null : Number(row.tenant_id),
        backupType: row.backup_type,
        backupDay: row.backup_day,
        status: row.status,
        backupVersion: Number(row.backup_version || 0),
        schemaVersion: row.schema_version,
        format: row.backup_format,
        fileName: row.file_name,
        contentType: row.content_type,
        sizeBytes: row.size_bytes == null ? null : Number(row.size_bytes),
        checksum: row.checksum_sha256 || null,
        manifest: safeJson(row.manifest_json),
        rowCount: Number(row.row_count || 0),
        tableCounts: safeJson(row.table_counts_json),
        attemptCount: Number(row.attempt_count || 0),
        errorCode: row.error_code || null,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        verifiedAt: row.verified_at,
        expiresAt: row.expires_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        scope
    };
}

function recordColumnList(scope = 'tenant') {
    return `${scope === 'tenant' ? 'id,tenant_id,' : 'id,'}backup_type,backup_day,status,backup_version,schema_version,backup_format,file_name,content_type,size_bytes,checksum_sha256,manifest_json,row_count,table_counts_json,attempt_count,error_code,started_at,completed_at,verified_at,expires_at,created_at,updated_at`;
}

function recordSelect(scope = 'tenant') {
    const table = scope === 'platform' ? 'gym_platform_backup_records' : 'gym_backup_records';
    return `SELECT ${recordColumnList(scope)} FROM dbo.${table}`;
}

async function claimTenantRecord({ tenantId, backupType, backupDay, fileName, format, actorUserId = null, backupVersion = BACKUP_VERSION, schemaVersion = SCHEMA_VERSION, expiresAt = null } = {}) {
    const pool = await getPool();
    const transaction = pool.transaction();
    await transaction.begin();
    try {
        const request = transaction.request()
            .input('tenantId', sql.Int, tenantId)
            .input('backupType', sql.VarChar(32), backupType)
            .input('backupDay', sql.Date, dateValue(backupDay))
            .input('fileName', sql.NVarChar(260), fileName)
            .input('format', sql.VarChar(20), format)
            .input('actorUserId', sql.Int, actorUserId == null ? null : Number(actorUserId))
            .input('backupVersion', sql.Int, backupVersion)
            .input('schemaVersion', sql.VarChar(64), schemaVersion)
            .input('expiresAt', sql.DateTime2(0), expiresAt);
        const deduplicateByDay = backupType === 'tenant_daily';
        const result = await request.query(`
            DECLARE @id BIGINT = NULL;
            DECLARE @claimed BIT = 0;
            ${deduplicateByDay ? `SELECT TOP (1) @id=id
            FROM dbo.gym_backup_records WITH (UPDLOCK,HOLDLOCK)
            WHERE tenant_id=@tenantId AND backup_type=@backupType AND backup_day=@backupDay;` : ''}
            IF @id IS NULL
            BEGIN
                INSERT INTO dbo.gym_backup_records
                    (tenant_id,backup_type,backup_day,status,backup_version,schema_version,backup_format,file_name,attempt_count,expires_at,created_by_user_id,started_at)
                VALUES
                    (@tenantId,@backupType,@backupDay,'RUNNING',@backupVersion,@schemaVersion,@format,@fileName,1,@expiresAt,@actorUserId,SYSUTCDATETIME());
                SET @id=SCOPE_IDENTITY();
                SET @claimed=1;
            END
            ELSE IF EXISTS (SELECT 1 FROM dbo.gym_backup_records WHERE id=@id AND status IN ('PENDING','FAILED'))
            BEGIN
                UPDATE dbo.gym_backup_records
                SET status='RUNNING', file_name=@fileName, backup_format=@format, attempt_count=attempt_count+1,
                    error_code=NULL, started_at=SYSUTCDATETIME(), updated_at=SYSUTCDATETIME(), expires_at=@expiresAt,
                    created_by_user_id=COALESCE(@actorUserId,created_by_user_id)
                WHERE id=@id;
                SET @claimed=1;
            END
            ELSE IF EXISTS (SELECT 1 FROM dbo.gym_backup_records WHERE id=@id AND status='RUNNING' AND updated_at < DATEADD(minute,-30,SYSUTCDATETIME()))
            BEGIN
                UPDATE dbo.gym_backup_records
                SET status='RUNNING', file_name=@fileName, backup_format=@format, attempt_count=attempt_count+1,
                    error_code=NULL, started_at=SYSUTCDATETIME(), updated_at=SYSUTCDATETIME(), expires_at=@expiresAt
                WHERE id=@id;
                SET @claimed=1;
            END;
            SELECT @claimed AS claimed, ${recordColumnList('tenant')}
            FROM dbo.gym_backup_records WHERE id=@id;
        `);
        await transaction.commit();
        const row = result.recordset[0];
        return { claimed: Boolean(Number(row?.claimed || 0)), record: mapRecord(row) };
    } catch (error) {
        try { await transaction.rollback(); } catch (_) { /* preserve original error */ }
        throw error;
    }
}

async function updateTenantRecord(tenantId, id, values = {}) {
    const allowed = {
        status: ['status', sql.VarChar(20)],
        storageKey: ['storage_key', sql.NVarChar(512)],
        contentType: ['content_type', sql.VarChar(100)],
        sizeBytes: ['size_bytes', sql.BigInt],
        checksum: ['checksum_sha256', sql.Char(64)],
        manifestJson: ['manifest_json', sql.NVarChar(sql.MAX)],
        rowCount: ['row_count', sql.BigInt],
        tableCountsJson: ['table_counts_json', sql.NVarChar(sql.MAX)],
        errorCode: ['error_code', sql.VarChar(100)],
        completedAt: ['completed_at', sql.DateTime2(0)],
        verifiedAt: ['verified_at', sql.DateTime2(0)],
        expiresAt: ['expires_at', sql.DateTime2(0)]
    };
    const request = (await getPool()).request().input('id', sql.BigInt, Number(id)).input('tenantId', sql.Int, tenantId);
    const assignments = [];
    let index = 0;
    for (const [key, [column, type]] of Object.entries(allowed)) {
        if (!Object.prototype.hasOwnProperty.call(values, key)) continue;
        const parameter = `v${index++}`;
        request.input(parameter, type, values[key] == null ? null : values[key]);
        assignments.push(`${column}=@${parameter}`);
    }
    if (!assignments.length) return;
    await request.query(`UPDATE dbo.gym_backup_records SET ${assignments.join(',')},updated_at=SYSUTCDATETIME() WHERE id=@id AND tenant_id=@tenantId;`);
}

async function updatePlatformRecord(id, values = {}) {
    const allowed = {
        status: ['status', sql.VarChar(20)],
        storageKey: ['storage_key', sql.NVarChar(512)],
        contentType: ['content_type', sql.VarChar(100)],
        sizeBytes: ['size_bytes', sql.BigInt],
        checksum: ['checksum_sha256', sql.Char(64)],
        manifestJson: ['manifest_json', sql.NVarChar(sql.MAX)],
        rowCount: ['row_count', sql.BigInt],
        tableCountsJson: ['table_counts_json', sql.NVarChar(sql.MAX)],
        errorCode: ['error_code', sql.VarChar(100)],
        completedAt: ['completed_at', sql.DateTime2(0)],
        verifiedAt: ['verified_at', sql.DateTime2(0)],
        expiresAt: ['expires_at', sql.DateTime2(0)]
    };
    const request = (await getPool()).request().input('id', sql.BigInt, Number(id));
    const assignments = [];
    let index = 0;
    for (const [key, [column, type]] of Object.entries(allowed)) {
        if (!Object.prototype.hasOwnProperty.call(values, key)) continue;
        const parameter = `v${index++}`;
        request.input(parameter, type, values[key] == null ? null : values[key]);
        assignments.push(`${column}=@${parameter}`);
    }
    if (!assignments.length) return;
    await request.query(`UPDATE dbo.gym_platform_backup_records SET ${assignments.join(',')},updated_at=SYSUTCDATETIME() WHERE id=@id;`);
}

async function writeTenantBackupAudit({ tenantId, backupId = null, eventType, actorUserId = null, reason = null, result = 'success', metadata = {} } = {}) {
    const pool = await getPool();
    await pool.request()
        .input('tenantId', sql.Int, tenantId)
        .input('backupId', sql.BigInt, backupId == null ? null : Number(backupId))
        .input('eventType', sql.VarChar(40), String(eventType || 'BACKUP_EVENT').slice(0, 40))
        .input('actorUserId', sql.Int, actorUserId == null ? null : Number(actorUserId))
        .input('reason', sql.NVarChar(1000), String(reason || '').slice(0, 1000) || null)
        .input('result', sql.VarChar(20), result)
        .input('metadata', sql.NVarChar(sql.MAX), jsonStringify(metadata).slice(0, 4000))
        .query(`INSERT INTO dbo.gym_backup_audit_log (tenant_id,backup_id,event_type,actor_user_id,reason,result,safe_metadata_json)
                VALUES (@tenantId,@backupId,@eventType,@actorUserId,@reason,@result,@metadata);`);
}

async function writePlatformBackupAudit({ backupId = null, eventType, actorUserId = null, reason = null, result = 'success', metadata = {} } = {}) {
    assertPlatformScope();
    const pool = await getPool();
    await pool.request()
        .input('backupId', sql.BigInt, backupId == null ? null : Number(backupId))
        .input('eventType', sql.VarChar(40), String(eventType || 'PLATFORM_BACKUP_EVENT').slice(0, 40))
        .input('actorUserId', sql.Int, actorUserId == null ? null : Number(actorUserId))
        .input('reason', sql.NVarChar(1000), String(reason || '').slice(0, 1000) || null)
        .input('result', sql.VarChar(20), result)
        .input('metadata', sql.NVarChar(sql.MAX), jsonStringify(metadata).slice(0, 4000))
        .query(`INSERT INTO dbo.gym_platform_backup_audit_log (backup_id,event_type,actor_user_id,reason,result,safe_metadata_json)
                VALUES (@backupId,@eventType,@actorUserId,@reason,@result,@metadata);`);
}

async function verifyStoredTenantObject(storage, { tenantId, key, expectedSize, expectedChecksum } = {}) {
    const head = await storage.headPrivateObject({ tenantId, key });
    if (!head) throw backupError('The stored backup artifact is missing.', 503, 'BACKUP_ARTIFACT_MISSING');
    let actualChecksum = String(head.checksum || '').toLowerCase();
    let actualSize = Number(head.size);
    if (!/^[a-f0-9]{64}$/.test(actualChecksum) || !Number.isFinite(actualSize)) {
        const object = await storage.getPrivateObject({ tenantId, key });
        if (!object || !Buffer.isBuffer(object.body)) throw backupError('The storage provider cannot verify the backup artifact.', 503, 'BACKUP_ARTIFACT_UNVERIFIABLE');
        actualChecksum = crypto.createHash('sha256').update(object.body).digest('hex');
        actualSize = object.body.length;
    }
    if (actualChecksum !== String(expectedChecksum).toLowerCase() || actualSize !== Number(expectedSize)) {
        throw backupError('The stored backup checksum does not match.', 503, 'BACKUP_ARTIFACT_CHECKSUM_MISMATCH');
    }
    return { checksum: actualChecksum, size: actualSize };
}

async function createTenantBackup({ tenantId = null, backupType = 'tenant_manual', format = 'json.gz', actorUserId = null, reason = '', now = new Date(), concurrency = 2, storageService = null } = {}) {
    const trustedTenantId = tenantScopeId(tenantId);
    if (!['tenant_daily', 'tenant_manual', 'tenant_pre_restore'].includes(backupType)) throw backupError('The tenant backup type is invalid.', 400, 'BACKUP_TYPE_INVALID');
    await ensureRecoveryTables();
    const normalizedFormat = String(format).toLowerCase() === 'bak' ? 'bak' : 'json.gz';
    const backupDay = backupDayKey(now);
    const fileName = backupFileName('tenant', trustedTenantId, normalizedFormat, now);
    const claim = await claimTenantRecord({
        tenantId: trustedTenantId,
        backupType,
        backupDay,
        fileName,
        format: normalizedFormat,
        actorUserId,
        expiresAt: retentionExpiry(backupType, now)
    });
    if (!claim.claimed) return { idempotent: true, record: claim.record, providerStatus: 'not_requested' };

    const storage = storageService || createObjectStorageService();
    try {
        await writeTenantBackupAudit({
            tenantId: trustedTenantId,
            backupId: claim.record.id,
            eventType: 'BACKUP_CREATED',
            actorUserId,
            reason,
            metadata: { backupType, format: normalizedFormat }
        });
        const backup = await buildTenantBackupArtifact({ tenantId: trustedTenantId, format: normalizedFormat, now, concurrency });
        const stored = await storage.putPrivateObject({
            tenantId: trustedTenantId,
            category: BACKUP_CATEGORY,
            objectName: fileName,
            contentType: 'application/gzip',
            body: backup.buffer,
            checksum: backup.checksum
        });
        await updateTenantRecord(trustedTenantId, claim.record.id, {
            status: 'UPLOADED',
            storageKey: stored.key,
            contentType: stored.contentType,
            sizeBytes: backup.buffer.length,
            checksum: backup.checksum,
            manifestJson: metadataJson(backup.payload),
            rowCount: backup.rowCount,
            tableCountsJson: jsonStringify(backup.rowCounts)
        });
        await updateTenantRecord(trustedTenantId, claim.record.id, { status: 'VERIFYING' });
        await verifyStoredTenantObject(storage, {
            tenantId: trustedTenantId,
            key: stored.key,
            expectedSize: backup.buffer.length,
            expectedChecksum: backup.checksum
        });
        await updateTenantRecord(trustedTenantId, claim.record.id, {
            status: 'VERIFIED',
            completedAt: new Date(now),
            verifiedAt: new Date(now)
        });
        await writeTenantBackupAudit({
            tenantId: trustedTenantId,
            backupId: claim.record.id,
            eventType: 'BACKUP_VERIFIED',
            actorUserId,
            reason,
            metadata: { sizeBytes: backup.buffer.length, rowCount: backup.rowCount, checksumVerified: true }
        });
        return { idempotent: false, record: { ...claim.record, status: 'VERIFIED', storageKey: undefined, sizeBytes: backup.buffer.length, checksum: backup.checksum }, providerStatus: storage.providerStatus };
    } catch (error) {
        await updateTenantRecord(trustedTenantId, claim.record.id, { status: 'FAILED', errorCode: String(error.code || 'BACKUP_STORAGE_FAILED').slice(0, 100), completedAt: new Date(now) }).catch(() => {});
        await writeTenantBackupAudit({
            tenantId: trustedTenantId,
            backupId: claim.record.id,
            eventType: 'BACKUP_FAILED',
            actorUserId,
            reason,
            result: 'failed',
            metadata: { errorCode: String(error.code || 'BACKUP_STORAGE_FAILED').slice(0, 100) }
        }).catch(() => {});
        throw error;
    }
}

async function getTenantBackupHistory({ tenantId = null, limit = 30, readOnly = false } = {}) {
    const trustedTenantId = tenantScopeId(tenantId);
    await ensureRecoveryTables({ readOnly });
    const safeLimit = normalizePositiveInteger(limit, 30, 100);
    const result = await (await getPool()).request().input('tenantId', sql.Int, trustedTenantId).input('limit', sql.Int, safeLimit).query(`${recordSelect('tenant')} WHERE tenant_id=@tenantId ORDER BY created_at DESC,id DESC OFFSET 0 ROWS FETCH NEXT @limit ROWS ONLY;`);
    return result.recordset.map((row) => mapRecord(row));
}

async function getTenantBackupRecord(id, { tenantId = null, readOnly = false } = {}) {
    const trustedTenantId = tenantScopeId(tenantId);
    const normalizedId = Number(id);
    if (!Number.isInteger(normalizedId) || normalizedId <= 0) throw backupError('The backup id is invalid.', 400, 'INVALID_BACKUP_ID');
    await ensureRecoveryTables({ readOnly });
    const result = await (await getPool()).request().input('id', sql.BigInt, normalizedId).input('tenantId', sql.Int, trustedTenantId).query(`${recordSelect('tenant')} WHERE id=@id AND tenant_id=@tenantId;`);
    return mapRecord(result.recordset[0]);
}

async function downloadTenantBackup(id, { tenantId = null, readOnly = false, storageService = null } = {}) {
    const trustedTenantId = tenantScopeId(tenantId);
    const record = await getTenantBackupRecord(id, { tenantId: trustedTenantId, readOnly });
    if (!record) throw backupError('The requested backup is not available.', 404, 'BACKUP_NOT_FOUND');
    if (record.status !== 'VERIFIED') throw backupError('Only verified backups can be downloaded.', 409, 'BACKUP_NOT_VERIFIED');
    const raw = await (storageService || createObjectStorageService()).getPrivateObject({ tenantId: trustedTenantId, key: record.storageKey });
    if (!raw || !Buffer.isBuffer(raw.body)) throw backupError('The backup artifact is not available.', 404, 'BACKUP_ARTIFACT_MISSING');
    const checksum = crypto.createHash('sha256').update(raw.body).digest('hex');
    if (checksum !== String(record.checksum || '').toLowerCase()) throw backupError('The backup artifact failed integrity verification.', 503, 'BACKUP_ARTIFACT_CHECKSUM_MISMATCH');
    return { record, body: raw.body, contentType: raw.contentType || 'application/gzip', fileName: record.fileName };
}

async function claimPlatformRecord({ backupType, backupDay, fileName, format, actorUserId = null, backupVersion = BACKUP_VERSION, schemaVersion = SCHEMA_VERSION, expiresAt = null } = {}) {
    const pool = await getPool();
    const transaction = pool.transaction();
    await transaction.begin();
    try {
        const result = await transaction.request()
            .input('backupType', sql.VarChar(32), backupType)
            .input('backupDay', sql.Date, dateValue(backupDay))
            .input('fileName', sql.NVarChar(260), fileName)
            .input('format', sql.VarChar(20), format)
            .input('actorUserId', sql.Int, actorUserId == null ? null : Number(actorUserId))
            .input('backupVersion', sql.Int, backupVersion)
            .input('schemaVersion', sql.VarChar(64), schemaVersion)
            .input('expiresAt', sql.DateTime2(0), expiresAt)
            .query(`
                DECLARE @id BIGINT=NULL; DECLARE @claimed BIT=0;
                SELECT TOP (1) @id=id FROM dbo.gym_platform_backup_records WITH (UPDLOCK,HOLDLOCK)
                WHERE backup_type=@backupType AND backup_day=@backupDay;
                IF @id IS NULL
                BEGIN
                    INSERT INTO dbo.gym_platform_backup_records
                        (backup_type,backup_day,status,backup_version,schema_version,backup_format,file_name,attempt_count,expires_at,created_by_user_id,started_at)
                    VALUES (@backupType,@backupDay,'RUNNING',@backupVersion,@schemaVersion,@format,@fileName,1,@expiresAt,@actorUserId,SYSUTCDATETIME());
                    SET @id=SCOPE_IDENTITY(); SET @claimed=1;
                END
                ELSE IF EXISTS (SELECT 1 FROM dbo.gym_platform_backup_records WHERE id=@id AND status IN ('PENDING','FAILED'))
                BEGIN
                    UPDATE dbo.gym_platform_backup_records SET status='RUNNING',file_name=@fileName,backup_format=@format,attempt_count=attempt_count+1,error_code=NULL,started_at=SYSUTCDATETIME(),updated_at=SYSUTCDATETIME(),expires_at=@expiresAt WHERE id=@id;
                    SET @claimed=1;
                END
                ELSE IF EXISTS (SELECT 1 FROM dbo.gym_platform_backup_records WHERE id=@id AND status='RUNNING' AND updated_at < DATEADD(minute,-30,SYSUTCDATETIME()))
                BEGIN
                    UPDATE dbo.gym_platform_backup_records SET status='RUNNING',file_name=@fileName,backup_format=@format,attempt_count=attempt_count+1,error_code=NULL,started_at=SYSUTCDATETIME(),updated_at=SYSUTCDATETIME(),expires_at=@expiresAt WHERE id=@id;
                    SET @claimed=1;
                END;
                SELECT @claimed AS claimed, ${recordColumnList('platform')}
                FROM dbo.gym_platform_backup_records WHERE id=@id;
            `);
        await transaction.commit();
        const row = result.recordset[0];
        return { claimed: Boolean(Number(row?.claimed || 0)), record: mapRecord(row, 'platform') };
    } catch (error) {
        try { await transaction.rollback(); } catch (_) { /* preserve original error */ }
        throw error;
    }
}

async function buildPlatformBackupArtifact({ format = 'json.gz', now = new Date(), concurrency = 2 } = {}) {
    assertPlatformScope();
    const pool = await getPool();
    const globalMetadata = await loadTableMetadata(pool, PLATFORM_GLOBAL_BACKUP_TABLES);
    const tenantMetadata = await loadTableMetadata(pool, TENANT_BACKUP_TABLES);
    const globalRows = await mapWithConcurrency(PLATFORM_GLOBAL_BACKUP_TABLES, async (definition) => [
        definition.key,
        await readTableRows(pool, { ...definition, tenantScoped: false }, globalMetadata)
    ], concurrency);
    const tenantRows = await mapWithConcurrency(TENANT_BACKUP_TABLES, async (definition) => [
        definition.key,
        await readTableRows(pool, definition, tenantMetadata, { allTenants: true })
    ], concurrency);
    const tables = {
        global: Object.fromEntries(globalRows),
        tenant: Object.fromEntries(tenantRows)
    };
    const tableCounts = {
        global: Object.fromEntries(globalRows.map(([key, rows]) => [key, rows.length])),
        tenant: Object.fromEntries(tenantRows.map(([key, rows]) => [key, rows.length]))
    };
    const payload = {
        format: 'logic-fit-platform-backup',
        version: BACKUP_VERSION,
        backupType: 'platform-disaster-recovery',
        generatedAt: new Date(now).toISOString(),
        applicationVersion: require('../../package.json').version,
        schemaVersion: SCHEMA_VERSION,
        manifest: {
            registryVersion: TENANT_BACKUP_REGISTRY_VERSION,
            includesGlobalControlPlane: true,
            includesTenantData: true,
            excludesSecrets: true,
            tableCounts,
            rowCount: totalRows(tableCounts.global) + totalRows(tableCounts.tenant)
        },
        tables,
        integrity: {
            algorithm: 'sha256',
            sha256: payloadDigest(tables)
        }
    };
    const json = jsonStringify(payload);
    if (Buffer.byteLength(json, 'utf8') > MAX_BACKUP_JSON_BYTES) throw backupError('The platform backup exceeds the safe size limit.', 400, 'BACKUP_SIZE_LIMIT_EXCEEDED');
    const buffer = await gzipAsync(Buffer.from(json, 'utf8'));
    const normalizedFormat = String(format).toLowerCase() === 'bak' ? 'bak' : 'json.gz';
    return {
        buffer,
        payload,
        format: normalizedFormat,
        filename: backupFileName('platform', 'dr', normalizedFormat, now),
        generatedAt: payload.generatedAt,
        backupDay: backupDayKey(now),
        checksum: crypto.createHash('sha256').update(buffer).digest('hex'),
        rowCounts: tableCounts,
        rowCount: payload.manifest.rowCount
    };
}

async function createPlatformBackup({ backupType = 'platform_daily', format = 'json.gz', actorUserId = null, reason = '', now = new Date(), concurrency = 2, storageService = null } = {}) {
    assertPlatformScope();
    if (!['platform_daily', 'platform_weekly', 'platform_monthly', 'platform_manual'].includes(backupType)) throw backupError('The platform backup type is invalid.', 400, 'BACKUP_TYPE_INVALID');
    await ensureRecoveryTables();
    const normalizedFormat = String(format).toLowerCase() === 'bak' ? 'bak' : 'json.gz';
    const backupDay = backupDayKey(now);
    const fileName = backupFileName('platform', 'dr', normalizedFormat, now);
    const claim = await claimPlatformRecord({
        backupType,
        backupDay,
        fileName,
        format: normalizedFormat,
        actorUserId,
        expiresAt: retentionExpiry(backupType, now)
    });
    if (!claim.claimed) return { idempotent: true, record: claim.record, providerStatus: 'not_requested' };
    const storage = storageService || createObjectStorageService();
    try {
        await writePlatformBackupAudit({
            backupId: claim.record.id,
            eventType: 'PLATFORM_BACKUP_STARTED',
            actorUserId,
            reason,
            metadata: { backupType, format: normalizedFormat }
        });
        const backup = await buildPlatformBackupArtifact({ format: normalizedFormat, now, concurrency });
        const stored = await storage.putPrivatePlatformObject({
            category: BACKUP_CATEGORY,
            objectName: backup.filename,
            contentType: 'application/gzip',
            body: backup.buffer,
            checksum: backup.checksum
        });
        await updatePlatformRecord(claim.record.id, {
            status: 'UPLOADED',
            storageKey: stored.key,
            contentType: stored.contentType,
            sizeBytes: backup.buffer.length,
            checksum: backup.checksum,
            manifestJson: metadataJson(backup.payload),
            rowCount: backup.rowCount,
            tableCountsJson: jsonStringify(backup.rowCounts)
        });
        await updatePlatformRecord(claim.record.id, { status: 'VERIFYING' });
        const head = await storage.headPrivatePlatformObject({ key: stored.key });
        if (!head || String(head.checksum || '').toLowerCase() !== backup.checksum || Number(head.size) !== backup.buffer.length) throw backupError('The platform backup artifact failed verification.', 503, 'BACKUP_ARTIFACT_CHECKSUM_MISMATCH');
        await updatePlatformRecord(claim.record.id, { status: 'VERIFIED', completedAt: new Date(now), verifiedAt: new Date(now) });
        await writePlatformBackupAudit({
            backupId: claim.record.id,
            eventType: 'PLATFORM_BACKUP_COMPLETED',
            actorUserId,
            reason,
            metadata: { sizeBytes: backup.buffer.length, rowCount: backup.rowCount, checksumVerified: true }
        });
        return { idempotent: false, record: { ...claim.record, status: 'VERIFIED', sizeBytes: backup.buffer.length, checksum: backup.checksum }, providerStatus: storage.providerStatus };
    } catch (error) {
        await updatePlatformRecord(claim.record.id, { status: 'FAILED', errorCode: String(error.code || 'BACKUP_STORAGE_FAILED').slice(0, 100), completedAt: new Date(now) }).catch(() => {});
        await writePlatformBackupAudit({
            backupId: claim.record.id,
            eventType: 'PLATFORM_BACKUP_FAILED',
            actorUserId,
            reason,
            result: 'failed',
            metadata: { errorCode: String(error.code || 'BACKUP_STORAGE_FAILED').slice(0, 100) }
        }).catch(() => {});
        throw error;
    }
}

async function runDailyBackupCycle({ storageService = null, now = new Date(), concurrency = 2, retryCount = 1 } = {}) {
    assertPlatformScope();
    await ensureRecoveryTables();
    const pool = await getPool();
    const tenants = (await pool.request().query(`SELECT id,slug,status FROM dbo.gym_tenants WHERE status IN ('trial','active') ORDER BY id;`)).recordset
        .map((tenant) => ({ id: Number(tenant.id), slug: tenant.slug, status: tenant.status }));
    const storage = storageService || createObjectStorageService();
    const tenantResults = await mapWithConcurrency(tenants, async (tenant) => {
        let lastError = null;
        for (let attempt = 0; attempt <= normalizePositiveInteger(retryCount, 1, 3); attempt += 1) {
            try {
                const result = await runTenantContext({ mode: 'tenant', tenantId: tenant.id }, () => createTenantBackup({
                    tenantId: tenant.id,
                    backupType: 'tenant_daily',
                    actorUserId: null,
                    now,
                    concurrency,
                    storageService: storage
                }));
                return { tenantId: tenant.id, slug: tenant.slug, status: 'success', attempt: attempt + 1, backup: result.record };
            } catch (error) {
                lastError = error;
                if (error.code === 'OBJECT_STORAGE_PROVIDER_NOT_CONFIGURED' || error.code === 'BACKUP_STORAGE_NOT_CONFIGURED') break;
            }
        }
        return { tenantId: tenant.id, slug: tenant.slug, status: 'failed', errorCode: String(lastError?.code || 'BACKUP_FAILED').slice(0, 100) };
    }, concurrency);
    let platform = null;
    try {
        platform = await createPlatformBackup({ backupType: 'platform_daily', now, concurrency, storageService: storage });
    } catch (error) {
        platform = { status: 'failed', errorCode: String(error.code || 'PLATFORM_BACKUP_FAILED').slice(0, 100) };
    }
    return {
        backupDay: backupDayKey(now),
        eligibleTenants: tenants.length,
        tenantResults,
        tenantSucceeded: tenantResults.filter((item) => item.status === 'success').length,
        tenantFailed: tenantResults.filter((item) => item.status === 'failed').length,
        platform,
        providerStatus: storage.providerStatus
    };
}

async function getPlatformBackupHealth({ readOnly = false, limit = 20, storageService = null } = {}) {
    assertPlatformScope();
    await ensureRecoveryTables({ readOnly });
    const safeLimit = normalizePositiveInteger(limit, 20, 100);
    const pool = await getPool();
    const [tenantSummary, platformSummary, recentFailures] = await Promise.all([
        pool.request().input('limit', sql.Int, safeLimit).query(`
            SELECT TOP (@limit) r.tenant_id,r.status,r.backup_day,r.size_bytes,r.verified_at,r.created_at,t.slug
            FROM dbo.gym_backup_records r INNER JOIN dbo.gym_tenants t ON t.id=r.tenant_id
            WHERE r.backup_type='tenant_daily' ORDER BY r.backup_day DESC,r.tenant_id,r.id DESC;
        `),
        pool.request().query(`SELECT TOP (1) id,backup_type,backup_day,status,size_bytes,verified_at,created_at FROM dbo.gym_platform_backup_records ORDER BY created_at DESC,id DESC;`),
        pool.request().query(`SELECT TOP (20) id,tenant_id,status,error_code,created_at FROM dbo.gym_backup_records WHERE status='FAILED' ORDER BY created_at DESC,id DESC;`)
    ]);
    return {
        providerStatus: storageService?.providerStatus || 'not_configured',
        tenantDaily: tenantSummary.recordset.map((row) => ({ tenantId: Number(row.tenant_id), slug: row.slug, status: row.status, backupDay: row.backup_day, sizeBytes: row.size_bytes == null ? null : Number(row.size_bytes), verifiedAt: row.verified_at, createdAt: row.created_at })),
        lastPlatformBackup: mapRecord(platformSummary.recordset[0], 'platform'),
        recentFailures: recentFailures.recordset.map((row) => ({ id: Number(row.id), tenantId: Number(row.tenant_id), status: row.status, errorCode: row.error_code, createdAt: row.created_at }))
    };
}

function createBackupRecoveryService({ storageService = createObjectStorageService() } = {}) {
    return {
        providerStatus: storageService.providerStatus,
        isStorageConfigured: Boolean(storageService.isConfigured),
        ensureRecoveryTables,
        buildTenantBackupArtifact,
        buildPlatformBackupArtifact,
        inspectTenantBackupBuffer,
        createTenantBackup: (options = {}) => createTenantBackup({ ...options, storageService }),
        createPlatformBackup: (options = {}) => createPlatformBackup({ ...options, storageService }),
        runDailyBackupCycle: (options = {}) => runDailyBackupCycle({ ...options, storageService }),
        getTenantBackupHistory,
        getTenantBackupRecord,
        downloadTenantBackup: (id, options = {}) => downloadTenantBackup(id, { ...options, storageService }),
        getPlatformBackupHealth: (options = {}) => getPlatformBackupHealth({ ...options, storageService }),
        getRetentionPolicy
    };
}

module.exports = {
    BACKUP_VERSION,
    MAX_BACKUP_JSON_BYTES,
    MAX_BACKUP_ROWS,
    MAX_BACKUP_UPLOAD_BYTES,
    RECOVERY_STATUSES,
    buildPlatformBackupArtifact,
    buildTenantBackupArtifact,
    buildTenantBackupPayload,
    createBackupRecoveryService,
    createPlatformBackup,
    createTenantBackup,
    ensureRecoveryTables,
    getPlatformBackupHealth,
    getRetentionPolicy,
    getTenantBackupHistory,
    getTenantBackupRecord,
    inspectTenantBackupBuffer,
    mapWithConcurrency,
    payloadDigest,
    runDailyBackupCycle,
    validateTenantBackupPayload,
    downloadTenantBackup,
    writeTenantBackupAudit,
    writePlatformBackupAudit
};
