'use strict';

const crypto = require('node:crypto');
const { promisify } = require('node:util');
const { gzip, gunzip } = require('node:zlib');
const { getPool, sql } = require('../database');
const { currentTenantId, getTenantContext, runTenantContext } = require('../tenancy/tenant-context');
const { config } = require('../config/env');
const { createObjectStorageService } = require('./object-storage-service');
const { TENANT_TABLES } = require('./tenant-service');
const { safeErrorCode } = require('../utils/error-response');
const {
    PLATFORM_GLOBAL_BACKUP_TABLES,
    TENANT_BACKUP_REGISTRY_VERSION,
    TENANT_BACKUP_TABLES,
    getTenantBackupCoverage
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
const PLATFORM_SENSITIVE_COLUMNS = new Set([
    'password_hash',
    'password_salt',
    'session_token',
    'token_hash',
    'api_key',
    'secret'
]);
const SENSITIVE_COLUMN_PATTERN = /(^|_)(?:password|salt|token|secret|api_key|private_key|encryption_key|credential|credentials|otp)(?:_|$)/i;

let recoverySchemaPromise;

function backupError(message, statusCode = 500, code = 'BACKUP_OPERATION_FAILED') {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.expose = statusCode < 500;
    error.code = code;
    return error;
}

function recoveryErrorCode(error, fallback) {
    return safeErrorCode(error, fallback);
}

function isSensitiveColumn(value) {
    const column = String(value || '').trim().toLowerCase();
    return PLATFORM_SENSITIVE_COLUMNS.has(column) || SENSITIVE_COLUMN_PATTERN.test(column);
}

function normalizePositiveInteger(value, fallback, maximum = Number.MAX_SAFE_INTEGER) {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? Math.min(number, maximum) : fallback;
}

function normalizeRetryCount(value, fallback = 1, maximum = 3) {
    const number = Number(value);
    return Number.isInteger(number) && number >= 0 ? Math.min(number, maximum) : fallback;
}

function normalizeBackupFormat(value) {
    const format = String(value || 'json.gz').trim().toLowerCase();
    if (format === 'json.gz') return format;
    if (format === 'bak') {
        throw backupError(
            'Native SQL Server .bak backups are not available in the current deployment; use the verified logical .json.gz backup.',
            409,
            'BACKUP_NATIVE_FORMAT_UNAVAILABLE'
        );
    }
    throw backupError(
        'The requested backup format is not supported.',
        400,
        'BACKUP_FORMAT_UNSUPPORTED'
    );
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

function getScheduledPlatformBackupTypes(now = new Date(), {
    weekly = config.backupEnablePlatformWeekly,
    monthly = config.backupEnablePlatformMonthly
} = {}) {
    const date = new Date(now);
    if (Number.isNaN(date.getTime())) throw backupError('Backup date is invalid.', 400, 'INVALID_BACKUP_DATE');
    const types = [];
    // Vercel cron schedules are UTC based. Keeping the calendar rule in UTC
    // makes retries deterministic regardless of server region or DST.
    if (Boolean(monthly) && date.getUTCDate() === 1) types.push('platform_monthly');
    if (Boolean(weekly) && date.getUTCDay() === 0) types.push('platform_weekly');
    return types;
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

function validateTenantBackupPayload(payload, { expectedTenantId = null, requireCompleteRegistry = false } = {}) {
    if (!payload || payload.format !== 'logic-fit-tenant-backup') {
        throw backupError('The uploaded file is not a Logic Fit tenant backup.', 400, 'BACKUP_FORMAT_UNSUPPORTED');
    }
    if (payload.backupType !== 'tenant') {
        throw backupError('The tenant backup type is invalid.', 400, 'BACKUP_TYPE_INVALID');
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
    const manifest = payload.manifest;
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)
        || Number(manifest.registryVersion) !== TENANT_BACKUP_REGISTRY_VERSION
        || Number(manifest.tenantId) !== tenantId
        || !Number.isInteger(Number(manifest.rowCount))
        || Number(manifest.rowCount) < 0
        || !manifest.tableCounts || typeof manifest.tableCounts !== 'object' || Array.isArray(manifest.tableCounts)) {
        throw backupError('The backup manifest is incomplete or unsafe.', 400, 'BACKUP_MANIFEST_INVALID');
    }
    const tables = normalizedTableMap(payload.tables);
    const knownKeys = new Set(TENANT_BACKUP_TABLES.map((item) => item.key));
    const unknownTables = Object.keys(tables).filter((key) => !knownKeys.has(key));
    if (unknownTables.length) throw backupError('The backup contains an unknown table.', 400, 'BACKUP_TABLE_NOT_ALLOWED');
    if (requireCompleteRegistry) {
        const missingTables = TENANT_BACKUP_TABLES.map((item) => item.key).filter((key) => !Object.prototype.hasOwnProperty.call(tables, key));
        if (missingTables.length) throw backupError('The backup is incomplete for the current tenant registry.', 400, 'BACKUP_REGISTRY_INCOMPLETE');
    }
    if (!Array.isArray(tables.members)) throw backupError('The backup members table is missing.', 400, 'BACKUP_MEMBERS_TABLE_MISSING');

    const counts = {};
    let rowCount = 0;
    for (const [key, rows] of Object.entries(tables)) {
        const definition = TENANT_BACKUP_TABLES.find((item) => item.key === key);
        if (!definition) throw backupError('The backup table is not registered.', 400, 'BACKUP_TABLE_NOT_ALLOWED');
        if (!Array.isArray(rows)) throw backupError('A backup table has an invalid shape.', 400, 'BACKUP_TABLE_INVALID');
        if (rows.some((row) => !row || typeof row !== 'object' || Array.isArray(row))) {
            throw backupError('A backup row has an invalid shape.', 400, 'BACKUP_ROW_INVALID');
        }
        const tableRows = rows.map((row) => {
            if (Object.keys(row).some(isSensitiveColumn)) {
                throw backupError('The backup contains a sensitive credential column.', 400, 'BACKUP_SENSITIVE_COLUMN');
            }
            const tenantKey = Object.keys(row).find((name) => name.toLowerCase() === 'tenant_id');
            if (definition.tenantScoped && tenantKey === undefined) {
                throw backupError('The backup contains a row without tenant ownership.', 400, 'BACKUP_TENANT_COLUMN_MISSING');
            }
            if (tenantKey !== undefined && Number(row[tenantKey]) !== tenantId) {
                throw backupError('The backup contains records from another gym.', 403, 'BACKUP_CROSS_TENANT_RECORD');
            }
            return row;
        });
        counts[key] = tableRows.length;
        rowCount += tableRows.length;
        if (rowCount > MAX_BACKUP_ROWS) throw backupError('The backup exceeds the safe row limit.', 400, 'BACKUP_ROW_LIMIT_EXCEEDED');
    }

    if (requireCompleteRegistry) {
        const missingCounts = TENANT_BACKUP_TABLES.map((item) => item.key)
            .filter((key) => !Object.prototype.hasOwnProperty.call(manifest.tableCounts, key));
        if (missingCounts.length) throw backupError('The backup manifest does not cover the current tenant registry.', 400, 'BACKUP_REGISTRY_INCOMPLETE');
    }
    {
        for (const [key, count] of Object.entries(counts)) {
            if (!Object.prototype.hasOwnProperty.call(manifest.tableCounts, key)
                || Number(manifest.tableCounts[key]) !== Number(count)) {
                throw backupError('The backup manifest counts do not match its records.', 400, 'BACKUP_MANIFEST_INVALID');
            }
        }
        if (Number(manifest.rowCount) !== rowCount) {
            throw backupError('The backup manifest row count is invalid.', 400, 'BACKUP_MANIFEST_INVALID');
        }
    }

    const digest = String(payload.integrity?.sha256 || '').toLowerCase();
    if (String(payload.integrity?.algorithm || '').toLowerCase() !== 'sha256' || !/^[a-f0-9]{64}$/.test(digest)) {
        throw backupError('The backup integrity manifest is invalid.', 400, 'BACKUP_INTEGRITY_INVALID');
    }
    if (payloadDigest(tables) !== digest) {
        throw backupError('The backup content failed its integrity check.', 400, 'BACKUP_CHECKSUM_MISMATCH');
    }
    return { tenantId, tableCounts: counts, rowCount, integrity: { algorithm: 'sha256', verified: true } };
}

function validatePlatformBackupPayload(payload, { requireCompleteRegistry = true } = {}) {
    if (!payload || payload.format !== 'logic-fit-platform-backup') {
        throw backupError('The uploaded file is not a Logic Fit platform backup.', 400, 'PLATFORM_BACKUP_FORMAT_UNSUPPORTED');
    }
    if (payload.backupType !== 'platform-disaster-recovery') {
        throw backupError('The platform backup type is invalid.', 400, 'PLATFORM_BACKUP_TYPE_INVALID');
    }
    if (Number(payload.version) !== BACKUP_VERSION) {
        throw backupError('The platform backup version is not supported.', 400, 'PLATFORM_BACKUP_VERSION_UNSUPPORTED');
    }
    const manifest = payload.manifest;
    if (!manifest || Number(manifest.registryVersion) !== TENANT_BACKUP_REGISTRY_VERSION
        || manifest.includesGlobalControlPlane !== true
        || manifest.includesTenantData !== true
        || manifest.excludesSecrets !== true) {
        throw backupError('The platform backup manifest is incomplete or unsafe.', 400, 'PLATFORM_BACKUP_MANIFEST_INVALID');
    }
    const tables = normalizedTableMap(payload.tables);
    const globalTables = normalizedTableMap(tables.global);
    const tenantTables = normalizedTableMap(tables.tenant);
    const knownGlobalKeys = new Set(PLATFORM_GLOBAL_BACKUP_TABLES.map((item) => item.key));
    const knownTenantKeys = new Set(TENANT_BACKUP_TABLES.map((item) => item.key));
    const unknownGlobal = Object.keys(globalTables).filter((key) => !knownGlobalKeys.has(key));
    const unknownTenant = Object.keys(tenantTables).filter((key) => !knownTenantKeys.has(key));
    if (unknownGlobal.length || unknownTenant.length) {
        throw backupError('The platform backup contains an unknown table.', 400, 'PLATFORM_BACKUP_TABLE_NOT_ALLOWED');
    }
    if (requireCompleteRegistry) {
        const missingGlobal = PLATFORM_GLOBAL_BACKUP_TABLES.map((item) => item.key)
            .filter((key) => !Object.prototype.hasOwnProperty.call(globalTables, key));
        const missingTenant = TENANT_BACKUP_TABLES.map((item) => item.key)
            .filter((key) => !Object.prototype.hasOwnProperty.call(tenantTables, key));
        if (missingGlobal.length || missingTenant.length) {
            throw backupError('The platform backup is incomplete for the current registry.', 400, 'PLATFORM_BACKUP_REGISTRY_INCOMPLETE');
        }
    }
    const counts = { global: {}, tenant: {} };
    let rowCount = 0;
    for (const [key, rows] of Object.entries(globalTables)) {
        if (!Array.isArray(rows) || rows.some((row) => !row || typeof row !== 'object' || Array.isArray(row))) {
            throw backupError('The platform backup has an invalid global table.', 400, 'PLATFORM_BACKUP_TABLE_INVALID');
        }
        for (const row of rows) {
            if (Object.keys(row).some(isSensitiveColumn)) {
                throw backupError('The platform backup contains a sensitive credential column.', 400, 'PLATFORM_BACKUP_SECRET_COLUMN');
            }
        }
        counts.global[key] = rows.length;
        rowCount += rows.length;
    }
    for (const [key, rows] of Object.entries(tenantTables)) {
        const definition = TENANT_BACKUP_TABLES.find((item) => item.key === key);
        if (!definition || !Array.isArray(rows) || rows.some((row) => !row || typeof row !== 'object' || Array.isArray(row))) {
            throw backupError('The platform backup has an invalid tenant table.', 400, 'PLATFORM_BACKUP_TABLE_INVALID');
        }
        for (const row of rows) {
            const tenantKey = Object.keys(row).find((name) => name.toLowerCase() === 'tenant_id');
            if (definition.tenantScoped && (tenantKey === undefined || !Number.isInteger(Number(row[tenantKey])) || Number(row[tenantKey]) <= 0)) {
                throw backupError('The platform backup contains a row without valid tenant ownership.', 400, 'PLATFORM_BACKUP_TENANT_COLUMN_INVALID');
            }
        }
        counts.tenant[key] = rows.length;
        rowCount += rows.length;
    }
    if (rowCount > MAX_BACKUP_ROWS) throw backupError('The platform backup exceeds the safe row limit.', 400, 'BACKUP_ROW_LIMIT_EXCEEDED');
    const manifestCounts = normalizedTableMap(manifest.tableCounts);
    if (!manifestCounts.global || typeof manifestCounts.global !== 'object' || Array.isArray(manifestCounts.global)
        || !manifestCounts.tenant || typeof manifestCounts.tenant !== 'object' || Array.isArray(manifestCounts.tenant)) {
        throw backupError('The platform backup table counts are incomplete.', 400, 'PLATFORM_BACKUP_MANIFEST_INVALID');
    }
    if (requireCompleteRegistry) {
        const missingGlobalCounts = PLATFORM_GLOBAL_BACKUP_TABLES.map((item) => item.key)
            .filter((key) => !Object.prototype.hasOwnProperty.call(manifestCounts.global, key));
        const missingTenantCounts = TENANT_BACKUP_TABLES.map((item) => item.key)
            .filter((key) => !Object.prototype.hasOwnProperty.call(manifestCounts.tenant, key));
        if (missingGlobalCounts.length || missingTenantCounts.length) {
            throw backupError('The platform backup manifest does not cover the current registry.', 400, 'PLATFORM_BACKUP_REGISTRY_INCOMPLETE');
        }
    }
    for (const scope of ['global', 'tenant']) {
        const expectedCounts = normalizedTableMap(manifestCounts[scope]);
        for (const [key, count] of Object.entries(counts[scope])) {
            if (Object.prototype.hasOwnProperty.call(expectedCounts, key) && Number(expectedCounts[key]) !== count) {
                throw backupError('The platform backup manifest counts do not match its records.', 400, 'PLATFORM_BACKUP_MANIFEST_INVALID');
            }
        }
    }
    if (Number(manifest.rowCount) !== rowCount) {
        throw backupError('The platform backup manifest row count is invalid.', 400, 'PLATFORM_BACKUP_MANIFEST_INVALID');
    }
    const tenantIds = new Set((Array.isArray(globalTables.gym_tenants) ? globalTables.gym_tenants : [])
        .map((row) => Number(row.id))
        .filter((id) => Number.isInteger(id) && id > 0));
    for (const rows of Object.values(tenantTables)) {
        for (const row of rows) {
            const tenantKey = Object.keys(row).find((column) => column.toLowerCase() === 'tenant_id');
            if (tenantKey && !tenantIds.has(Number(row[tenantKey]))) {
                throw backupError('The platform backup contains a row for an unknown gym.', 400, 'PLATFORM_BACKUP_TENANT_REFERENCE_INVALID');
            }
        }
    }
    const digest = String(payload.integrity?.sha256 || '').toLowerCase();
    if (String(payload.integrity?.algorithm || '').toLowerCase() !== 'sha256' || !/^[a-f0-9]{64}$/.test(digest)) {
        throw backupError('The platform backup integrity manifest is invalid.', 400, 'PLATFORM_BACKUP_INTEGRITY_INVALID');
    }
    if (payloadDigest(tables) !== digest) {
        throw backupError('The platform backup content failed its integrity check.', 400, 'PLATFORM_BACKUP_CHECKSUM_MISMATCH');
    }
    return { tableCounts: counts, rowCount, integrity: { algorithm: 'sha256', verified: true } };
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
        SELECT t.name AS table_name, c.name, c.is_identity AS isIdentity, c.is_computed AS isComputed,
               CASE WHEN c.system_type_id = 189 THEN 1 ELSE 0 END AS isRowVersion
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
            isComputed: Boolean(row.isComputed),
            isRowVersion: Boolean(row.isRowVersion)
        });
    }
    return metadata;
}

function metadataColumns(metadata, table, { excludeSensitive = false } = {}) {
    const columns = metadata.get(table) || [];
    if (!columns.length) throw backupError('A required backup table is missing.', 503, 'BACKUP_TABLE_MISSING');
    return columns.filter((column) => !column.isComputed && !column.isRowVersion
        && (!excludeSensitive || !PLATFORM_SENSITIVE_COLUMNS.has(String(column.name).toLowerCase())));
}

function hasTenantColumn(columns) {
    return columns.some((column) => column.name.toLowerCase() === 'tenant_id');
}

async function readTableRows(pool, definition, metadata, { tenantId = null, allTenants = false, excludeSensitive = false } = {}) {
    const columns = metadataColumns(metadata, definition.table, { excludeSensitive });
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

async function getTenantBackupCoverageStatus({ readOnly = false } = {}) {
    assertPlatformScope();
    await ensureRecoveryTables({ readOnly });
    const pool = await getPool();
    const result = await pool.request().query(`
        SELECT DISTINCT t.name
        FROM sys.tables AS t
        INNER JOIN sys.columns AS c ON c.object_id=t.object_id
        INNER JOIN sys.schemas AS s ON s.schema_id=t.schema_id
        WHERE s.name=N'dbo' AND c.name=N'tenant_id'
        ORDER BY t.name;
    `);
    const discoveredTenantTables = result.recordset.map((row) => String(row.name));
    const inventory = [...new Set([...TENANT_TABLES, ...discoveredTenantTables])];
    const coverage = getTenantBackupCoverage({
        tenantTables: inventory,
        existingTables: discoveredTenantTables
    });
    const excluded = new Set(coverage.excludedTables.map((table) => String(table).toLowerCase()));
    const registered = new Set(TENANT_TABLES.map((table) => String(table).toLowerCase()));
    const unregisteredPhysicalTenantTables = discoveredTenantTables
        .filter((table) => !registered.has(table.toLowerCase()) && !excluded.has(table.toLowerCase()))
        .sort();
    const hasGap = coverage.uncoveredTenantTables.length > 0
        || coverage.missingPhysicalTables.length > 0
        || unregisteredPhysicalTenantTables.length > 0;
    return {
        status: hasGap ? 'attention' : 'covered',
        registryVersion: coverage.registryVersion,
        applicationInventoryCount: TENANT_TABLES.length,
        discoveredTenantTableCount: discoveredTenantTables.length,
        discoveredTenantTables,
        unregisteredPhysicalTenantTables,
        registryTables: coverage.registryTables,
        excludedTables: coverage.excludedTables,
        uncoveredTenantTables: coverage.uncoveredTenantTables,
        missingPhysicalTables: coverage.missingPhysicalTables
    };
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

async function buildTenantBackupArtifact({ tenantId = null, format = 'json.gz', now = new Date(), concurrency = 2, transaction = null } = {}) {
    const trustedTenantId = tenantScopeId(tenantId);
    const normalizedFormat = normalizeBackupFormat(format);
    const pool = await getPool();
    // A recovery lock owns a transaction. Reuse that transaction for the
    // read set instead of borrowing another pool connection; this avoids a
    // pool-size-one deadlock and makes the lock cover the complete snapshot
    // assembly. Requests on one transaction are intentionally sequential.
    const db = transaction || pool;
    const tenant = await loadTenantReference(db, trustedTenantId);
    const metadata = await loadTableMetadata(db, TENANT_BACKUP_TABLES);
    const definitions = TENANT_BACKUP_TABLES;
    const rows = await mapWithConcurrency(definitions, async (definition) => [
        definition.key,
        await readTableRows(db, definition, metadata, { tenantId: trustedTenantId, excludeSensitive: true })
    ], transaction ? 1 : concurrency);
    const tables = Object.fromEntries(rows);
    const payload = buildTenantBackupPayload({ tenant, tables, generatedAt: now });
    const json = jsonStringify(payload);
    if (Buffer.byteLength(json, 'utf8') > MAX_BACKUP_JSON_BYTES) throw backupError('The backup exceeds the safe size limit.', 400, 'BACKUP_SIZE_LIMIT_EXCEEDED');
    const buffer = await gzipAsync(Buffer.from(json, 'utf8'));
    return {
        buffer,
        payload,
        format: normalizedFormat,
        filename: backupFileName('tenant', trustedTenantId, normalizedFormat, now),
        generatedAt: payload.generatedAt,
        backupDay: backupDayKey(now),
        checksum: crypto.createHash('sha256').update(buffer).digest('hex'),
        rowCounts: payload.manifest.tableCounts,
        rowCount: payload.manifest.rowCount,
        tenantId: trustedTenantId
    };
}

async function inspectTenantBackupBuffer(input, { expectedTenantId = null, requireCompleteRegistry = false } = {}) {
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
    const validation = validateTenantBackupPayload(payload, { expectedTenantId, requireCompleteRegistry });
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

async function inspectPlatformBackupBuffer(input, { requireCompleteRegistry = true } = {}) {
    const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input || []);
    if (!buffer.length || buffer.length > MAX_BACKUP_UPLOAD_BYTES) throw backupError('The platform backup file is empty or too large.', 400, 'PLATFORM_BACKUP_FILE_SIZE_INVALID');
    if (buffer[0] !== 0x1f || buffer[1] !== 0x8b) throw backupError('The platform backup must be gzip-compressed JSON.', 400, 'PLATFORM_BACKUP_COMPRESSION_INVALID');
    let jsonBuffer;
    try {
        jsonBuffer = await gunzipAsync(buffer, { maxOutputLength: MAX_BACKUP_JSON_BYTES });
    } catch (_) {
        throw backupError('The platform backup compression is invalid.', 400, 'PLATFORM_BACKUP_COMPRESSION_INVALID');
    }
    let payload;
    try { payload = JSON.parse(jsonBuffer.toString('utf8')); } catch (_) { throw backupError('The platform backup JSON is invalid.', 400, 'PLATFORM_BACKUP_JSON_INVALID'); }
    const validation = validatePlatformBackupPayload(payload, { requireCompleteRegistry });
    return {
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

function mapRecord(row, scope = 'tenant', { includeStorageKey = false } = {}) {
    if (!row) return null;
    const mapped = {
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
    if (includeStorageKey) mapped.storageKey = row.storage_key || null;
    return mapped;
}

function recordColumnList(scope = 'tenant') {
    return `${scope === 'tenant' ? 'id,tenant_id,' : 'id,'}backup_type,backup_day,status,backup_version,schema_version,backup_format,file_name,storage_key,content_type,size_bytes,checksum_sha256,manifest_json,row_count,table_counts_json,attempt_count,error_code,started_at,completed_at,verified_at,expires_at,created_at,updated_at`;
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

async function verifyStoredTenantObject(storage, { tenantId, key, expectedSize, expectedChecksum, returnBody = false } = {}) {
    const head = await storage.headPrivateObject({ tenantId, key });
    if (!head) throw backupError('The stored backup artifact is missing.', 503, 'BACKUP_ARTIFACT_MISSING');
    // HEAD metadata is useful for an existence/size check, but it is not an
    // integrity proof: a stale or tampered sidecar/provider metadata record
    // could still contain a valid-looking checksum. Always hash the bytes
    // returned by the provider before marking a backup VERIFIED.
    const object = await storage.getPrivateObject({ tenantId, key });
    if (!object || !Buffer.isBuffer(object.body)) throw backupError('The storage provider cannot verify the backup artifact.', 503, 'BACKUP_ARTIFACT_UNVERIFIABLE');
    const actualChecksum = crypto.createHash('sha256').update(object.body).digest('hex');
    const actualSize = object.body.length;
    if (head.size != null && Number(head.size) !== actualSize) {
        throw backupError('The stored backup size does not match its content.', 503, 'BACKUP_ARTIFACT_SIZE_MISMATCH');
    }
    if (actualChecksum !== String(expectedChecksum).toLowerCase() || actualSize !== Number(expectedSize)) {
        throw backupError('The stored backup checksum does not match.', 503, 'BACKUP_ARTIFACT_CHECKSUM_MISMATCH');
    }
    const inspected = await inspectTenantBackupBuffer(object.body, {
        expectedTenantId: tenantId,
        requireCompleteRegistry: true
    });
    return {
        checksum: actualChecksum,
        size: actualSize,
        rowCount: inspected.rowCount,
        ...(returnBody ? { body: object.body, contentType: object.contentType || null } : {})
    };
}

async function verifyStoredPlatformObject(storage, { key, expectedSize, expectedChecksum, returnBody = false } = {}) {
    const head = await storage.headPrivatePlatformObject({ key });
    if (!head) throw backupError('The stored platform backup artifact is missing.', 503, 'BACKUP_ARTIFACT_MISSING');
    const object = await storage.getPrivatePlatformObject({ key });
    if (!object || !Buffer.isBuffer(object.body)) throw backupError('The storage provider cannot verify the platform backup artifact.', 503, 'BACKUP_ARTIFACT_UNVERIFIABLE');
    const actualChecksum = crypto.createHash('sha256').update(object.body).digest('hex');
    const actualSize = object.body.length;
    if (head.size != null && Number(head.size) !== actualSize) {
        throw backupError('The stored platform backup size does not match its content.', 503, 'BACKUP_ARTIFACT_SIZE_MISMATCH');
    }
    if (actualChecksum !== String(expectedChecksum).toLowerCase() || actualSize !== Number(expectedSize)) {
        throw backupError('The stored platform backup checksum does not match.', 503, 'BACKUP_ARTIFACT_CHECKSUM_MISMATCH');
    }
    const inspected = await inspectPlatformBackupBuffer(object.body);
    return {
        checksum: actualChecksum,
        size: actualSize,
        rowCount: inspected.rowCount,
        ...(returnBody ? { body: object.body, contentType: object.contentType || null } : {})
    };
}

async function deleteTenantArtifactAndVerify(storage, { tenantId, key } = {}) {
    if (!key) return { status: 'not_stored' };
    const deleted = await storage.deletePrivateObject({ tenantId, key });
    const remaining = await storage.headPrivateObject({ tenantId, key });
    if (remaining) {
        throw backupError('The private backup artifact could not be confirmed as deleted.', 503, 'BACKUP_ARTIFACT_DELETE_UNCONFIRMED');
    }
    return { status: deleted ? 'deleted' : 'missing' };
}

async function deletePlatformArtifactAndVerify(storage, { key } = {}) {
    if (!key) return { status: 'not_stored' };
    const deleted = await storage.deletePrivatePlatformObject({ key });
    const remaining = await storage.headPrivatePlatformObject({ key });
    if (remaining) {
        throw backupError('The private platform backup artifact could not be confirmed as deleted.', 503, 'BACKUP_ARTIFACT_DELETE_UNCONFIRMED');
    }
    return { status: deleted ? 'deleted' : 'missing' };
}

async function createTenantBackup({ tenantId = null, backupType = 'tenant_manual', format = 'json.gz', actorUserId = null, reason = '', now = new Date(), concurrency = 2, storageService = null } = {}) {
    const trustedTenantId = tenantScopeId(tenantId);
    if (!['tenant_daily', 'tenant_manual', 'tenant_pre_restore'].includes(backupType)) throw backupError('The tenant backup type is invalid.', 400, 'BACKUP_TYPE_INVALID');
    const normalizedReason = String(reason || '').trim().slice(0, 1000);
    if (backupType === 'tenant_manual' && !normalizedReason) throw backupError('A reason is required before starting a manual backup.', 400, 'BACKUP_REASON_REQUIRED');
    await ensureRecoveryTables();
    const normalizedFormat = normalizeBackupFormat(format);
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
    let stored = null;
    try {
        await writeTenantBackupAudit({
            tenantId: trustedTenantId,
            backupId: claim.record.id,
            eventType: 'BACKUP_CREATED',
            actorUserId,
            reason: normalizedReason,
            metadata: { backupType, format: normalizedFormat }
        });
        const backup = await withTenantRecoveryLock(
            trustedTenantId,
            (transaction) => buildTenantBackupArtifact({ tenantId: trustedTenantId, format: normalizedFormat, now, concurrency, transaction })
        );
        stored = await storage.putPrivateObject({
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
            reason: normalizedReason,
            metadata: { sizeBytes: backup.buffer.length, rowCount: backup.rowCount, checksumVerified: true }
        });
        return { idempotent: false, record: { ...claim.record, status: 'VERIFIED', storageKey: undefined, sizeBytes: backup.buffer.length, checksum: backup.checksum }, providerStatus: storage.providerStatus };
    } catch (error) {
        const errorCode = recoveryErrorCode(error, 'BACKUP_STORAGE_FAILED');
        let artifactCleanup = 'not_needed';
        if (stored?.key) {
            try {
                artifactCleanup = (await deleteTenantArtifactAndVerify(storage, { tenantId: trustedTenantId, key: stored.key })).status;
            } catch (_) {
                artifactCleanup = 'pending';
            }
        }
        const failureValues = { status: 'FAILED', errorCode, completedAt: new Date(now) };
        if (stored?.key && ['deleted', 'missing'].includes(artifactCleanup)) failureValues.storageKey = null;
        await updateTenantRecord(trustedTenantId, claim.record.id, failureValues).catch(() => {});
        await writeTenantBackupAudit({
            tenantId: trustedTenantId,
            backupId: claim.record.id,
            eventType: 'BACKUP_FAILED',
            actorUserId,
            reason: normalizedReason,
            result: 'failed',
            metadata: { errorCode, artifactCleanup }
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

async function getTenantBackupRecord(id, { tenantId = null, readOnly = false, includeStorageKey = false } = {}) {
    const trustedTenantId = tenantScopeId(tenantId);
    const normalizedId = Number(id);
    if (!Number.isInteger(normalizedId) || normalizedId <= 0) throw backupError('The backup id is invalid.', 400, 'INVALID_BACKUP_ID');
    await ensureRecoveryTables({ readOnly });
    const result = await (await getPool()).request().input('id', sql.BigInt, normalizedId).input('tenantId', sql.Int, trustedTenantId).query(`${recordSelect('tenant')} WHERE id=@id AND tenant_id=@tenantId;`);
    return mapRecord(result.recordset[0], 'tenant', { includeStorageKey });
}

async function getTenantBackupAudit({ tenantId = null, limit = 50, readOnly = false } = {}) {
    const trustedTenantId = tenantScopeId(tenantId);
    await ensureRecoveryTables({ readOnly });
    const safeLimit = normalizePositiveInteger(limit, 50, 200);
    const result = await (await getPool()).request()
        .input('tenantId', sql.Int, trustedTenantId)
        .input('limit', sql.Int, safeLimit)
        .query(`SELECT TOP (@limit) id,backup_id,event_type,actor_user_id,reason,result,safe_metadata_json,created_at
                FROM dbo.gym_backup_audit_log
                WHERE tenant_id=@tenantId ORDER BY created_at DESC,id DESC;`);
    return result.recordset.map((row) => ({
        id: Number(row.id),
        backupId: row.backup_id == null ? null : Number(row.backup_id),
        eventType: row.event_type,
        actorUserId: row.actor_user_id == null ? null : Number(row.actor_user_id),
        reason: row.reason || '',
        result: row.result,
        metadata: safeJson(row.safe_metadata_json),
        createdAt: row.created_at
    }));
}

async function downloadTenantBackup(id, { tenantId = null, readOnly = false, actorUserId = null, auditDownload = false, storageService = null } = {}) {
    const trustedTenantId = tenantScopeId(tenantId);
    const record = await getTenantBackupRecord(id, { tenantId: trustedTenantId, readOnly, includeStorageKey: true });
    if (!record) throw backupError('The requested backup is not available.', 404, 'BACKUP_NOT_FOUND');
    if (record.format !== 'json.gz') throw backupError('The requested backup format is not supported.', 409, 'BACKUP_FORMAT_UNSUPPORTED');
    if (record.status !== 'VERIFIED') throw backupError('Only verified backups can be downloaded.', 409, 'BACKUP_NOT_VERIFIED');
    if (!record.storageKey || !record.checksum || !Number.isInteger(Number(record.sizeBytes)) || Number(record.sizeBytes) <= 0) {
        throw backupError('The verified backup metadata is incomplete.', 503, 'BACKUP_METADATA_INCOMPLETE');
    }
    const storage = storageService || createObjectStorageService();
    const verified = await verifyStoredTenantObject(storage, {
        tenantId: trustedTenantId,
        key: record.storageKey,
        expectedSize: record.sizeBytes,
        expectedChecksum: record.checksum,
        returnBody: true
    });
    if (record.rowCount != null && Number(record.rowCount) !== Number(verified.rowCount)) {
        throw backupError('The backup metadata does not match its verified artifact.', 503, 'BACKUP_METADATA_MISMATCH');
    }
    if (auditDownload) {
        // Ordinary GETs run in a read-only context. A download is an explicit
        // user action, so its audit insert is isolated in a write-enabled
        // tenant context without changing the data-read path itself.
        await runTenantContext({ tenantId: trustedTenantId, userId: actorUserId, mode: 'tenant', readOnlyBaseline: false }, () => writeTenantBackupAudit({
            tenantId: trustedTenantId,
            backupId: record.id,
            eventType: 'BACKUP_DOWNLOADED',
            actorUserId,
            metadata: { sizeBytes: verified.size, checksumVerified: true, manifestVerified: true }
        }));
    }
    return { record, body: verified.body, contentType: verified.contentType || 'application/gzip', fileName: record.fileName };
}

function restoreScalar(value) {
    if (value === undefined || value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
    if (value && value.type === 'Buffer' && Array.isArray(value.data)) return Buffer.from(value.data);
    throw backupError('The backup contains an unsupported value.', 400, 'BACKUP_VALUE_INVALID');
}

async function loadRestoreOrder(pool, definitions) {
    const names = safeTableNames(definitions);
    if (!names.length) return [];
    const literals = names.map((name) => `N'${name.replaceAll("'", "''")}'`).join(',');
    const result = await pool.request().query(`
        SELECT childTable.name AS child_table, parentTable.name AS parent_table
        FROM sys.foreign_keys AS foreignKey
        INNER JOIN sys.tables AS childTable ON childTable.object_id=foreignKey.parent_object_id
        INNER JOIN sys.tables AS parentTable ON parentTable.object_id=foreignKey.referenced_object_id
        INNER JOIN sys.schemas AS childSchema ON childSchema.schema_id=childTable.schema_id
        INNER JOIN sys.schemas AS parentSchema ON parentSchema.schema_id=parentTable.schema_id
        WHERE childSchema.name=N'dbo' AND parentSchema.name=N'dbo'
          AND childTable.name IN (${literals}) AND parentTable.name IN (${literals});
    `);
    const definitionByTable = new Map(definitions.map((item) => [item.table, item]));
    const adjacency = new Map(definitions.map((item) => [item.table, new Set()]));
    const indegree = new Map(definitions.map((item) => [item.table, 0]));
    for (const row of result.recordset) {
        const child = String(row.child_table);
        const parent = String(row.parent_table);
        if (child === parent || !definitionByTable.has(child) || !definitionByTable.has(parent)) continue;
        const children = adjacency.get(parent);
        if (children.has(child)) continue;
        children.add(child);
        indegree.set(child, indegree.get(child) + 1);
    }
    const queue = definitions.filter((item) => indegree.get(item.table) === 0).map((item) => item.table);
    const ordered = [];
    while (queue.length) {
        const table = queue.shift();
        ordered.push(definitionByTable.get(table));
        for (const child of adjacency.get(table) || []) {
            indegree.set(child, indegree.get(child) - 1);
            if (indegree.get(child) === 0) queue.push(child);
        }
    }
    // Self-references/cycles are rare in the tenant catalog. Preserve the
    // registry order for any cycle so the operation remains deterministic;
    // the transaction will roll back if the database cannot accept it.
    for (const definition of definitions) if (!ordered.includes(definition)) ordered.push(definition);
    return ordered;
}

async function acquireTenantRecoveryLock(transaction, tenantId) {
    const result = await transaction.request()
        .input('lockResource', sql.NVarChar(255), `logic-fit:tenant-recovery:${tenantId}`)
        .query(`
            DECLARE @lockResult INT;
            EXEC @lockResult = sys.sp_getapplock
                @Resource=@lockResource,
                @LockMode='Exclusive',
                @LockOwner='Transaction',
                @LockTimeout=0;
            SELECT @lockResult AS lock_result;
        `);
    if (Number(result.recordset[0]?.lock_result) < 0) {
        throw backupError('Another backup or restore is using this gym. Try again shortly.', 409, 'BACKUP_TENANT_BUSY');
    }
}

async function withTenantRecoveryLock(tenantId, callback) {
    const pool = await getPool();
    const transaction = pool.transaction();
    let started = false;
    let committed = false;
    try {
        await transaction.begin();
        started = true;
        await acquireTenantRecoveryLock(transaction, tenantId);
        const result = await callback(transaction);
        await transaction.commit();
        committed = true;
        return result;
    } catch (error) {
        if (started && !committed) await transaction.rollback().catch(() => {});
        throw error;
    }
}

async function insertTenantRows(transaction, definition, rows, metadata) {
    if (!rows.length) return;
    const columns = metadataColumns(metadata, definition.table);
    const insertColumns = columns.filter((column) => rows.some((row) => Object.prototype.hasOwnProperty.call(row, column.name)
        || Object.prototype.hasOwnProperty.call(row, column.name.toLowerCase())));
    if (!insertColumns.length) return;
    const quotedTable = `dbo.${quoteIdentifier(definition.table)}`;
    const quotedColumns = insertColumns.map((column) => quoteIdentifier(column.name)).join(', ');
    const usesIdentity = insertColumns.some((column) => column.isIdentity);
    if (usesIdentity) await transaction.request().query(`SET IDENTITY_INSERT ${quotedTable} ON;`);
    try {
        for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
            const row = rows[rowIndex];
            const request = transaction.request();
            const values = insertColumns.map((column, columnIndex) => {
                const sourceKey = Object.keys(row).find((key) => key.toLowerCase() === column.name.toLowerCase());
                const value = restoreScalar(sourceKey === undefined ? null : row[sourceKey]);
                const parameter = `restore_${rowIndex}_${columnIndex}`;
                if (value === null) request.input(parameter, sql.NVarChar(1), null);
                else request.input(parameter, value);
                return `@${parameter}`;
            });
            await request.query(`INSERT INTO ${quotedTable} (${quotedColumns}) VALUES (${values.join(', ')});`);
        }
    } finally {
        if (usesIdentity) await transaction.request().query(`SET IDENTITY_INSERT ${quotedTable} OFF;`).catch(() => {});
    }
}

async function verifyRestoredTenantCounts(transaction, definitions, payload, tenantId) {
    const verifiedCounts = {};
    for (const definition of definitions) {
        if (!Object.prototype.hasOwnProperty.call(payload.tables, definition.key)) continue;
        const result = await transaction.request()
            .input('tenantId', sql.Int, tenantId)
            .query(`SELECT COUNT_BIG(*) AS total FROM dbo.${quoteIdentifier(definition.table)} WHERE [tenant_id]=@tenantId;`);
        const actual = Number(result.recordset[0]?.total || 0);
        const expected = Number(payload.manifest?.tableCounts?.[definition.key] || 0);
        if (actual !== expected) throw backupError('The restored gym data failed integrity validation.', 503, 'RESTORE_COUNT_MISMATCH');
        verifiedCounts[definition.key] = actual;
    }
    return verifiedCounts;
}

async function restoreTenantBackup(input, {
    tenantId = null,
    actorUserId = null,
    reason = '',
    fileName = 'tenant-backup.json.gz',
    sourceBackupId = null,
    storageService = null
} = {}) {
    const trustedTenantId = tenantScopeId(tenantId);
    const normalizedSourceBackupId = Number.isInteger(Number(sourceBackupId)) && Number(sourceBackupId) > 0 ? Number(sourceBackupId) : null;
    const normalizedReason = String(reason || '').trim().slice(0, 1000);
    if (!normalizedReason) throw backupError('A reason is required before restoring a gym backup.', 400, 'BACKUP_RESTORE_REASON_REQUIRED');
    const inspected = input?.payload
        ? input
        : await inspectTenantBackupBuffer(input, { expectedTenantId: trustedTenantId });
    validateTenantBackupPayload(inspected.payload, { expectedTenantId: trustedTenantId, requireCompleteRegistry: true });
    await ensureRecoveryTables();
    await writeTenantBackupAudit({
        tenantId: trustedTenantId,
        backupId: normalizedSourceBackupId,
        eventType: 'RESTORE_REQUESTED',
        actorUserId,
        reason: normalizedReason,
        metadata: { fileName: String(fileName || '').slice(0, 260), rowCount: inspected.rowCount }
    });

    // A restore is blocked unless a verified pre-restore copy can be stored.
    // This prevents a failed logical restore from becoming an irreversible
    // destructive action when private storage is not configured.
    let safetyBackup;
    try {
        safetyBackup = await createTenantBackup({
            tenantId: trustedTenantId,
            backupType: 'tenant_pre_restore',
            actorUserId,
            reason: `Pre-restore safety copy: ${normalizedReason}`,
            storageService
        });
    } catch (error) {
        await writeTenantBackupAudit({
            tenantId: trustedTenantId,
            backupId: normalizedSourceBackupId,
            eventType: 'RESTORE_FAILED',
            actorUserId,
            reason: normalizedReason,
            result: 'failed',
            metadata: { errorCode: recoveryErrorCode(error, 'RESTORE_SAFETY_BACKUP_FAILED') }
        }).catch(() => {});
        throw error;
    }

    const pool = await getPool();
    const transaction = pool.transaction();
    let committed = false;
    try {
        await transaction.begin();
        await acquireTenantRecoveryLock(transaction, trustedTenantId);
        const metadata = await loadTableMetadata(transaction, TENANT_BACKUP_TABLES);
        const order = await loadRestoreOrder(transaction, TENANT_BACKUP_TABLES);
        for (const definition of [...order].reverse()) {
            if (!Object.prototype.hasOwnProperty.call(inspected.payload.tables, definition.key)) continue;
            const columns = metadataColumns(metadata, definition.table);
            if (!hasTenantColumn(columns)) throw backupError('A restore table is not tenant-scoped.', 503, 'RESTORE_TABLE_NOT_TENANT_SCOPED');
            await transaction.request()
                .input('tenantId', sql.Int, trustedTenantId)
                .query(`DELETE FROM dbo.${quoteIdentifier(definition.table)} WHERE [tenant_id]=@tenantId;`);
        }
        for (const definition of order) {
            const rows = inspected.payload.tables[definition.key];
            if (!rows) continue;
            await insertTenantRows(transaction, definition, rows, metadata);
        }
        const verifiedCounts = await verifyRestoredTenantCounts(transaction, order, inspected.payload, trustedTenantId);
        await transaction.commit();
        committed = true;
        await writeTenantBackupAudit({
            tenantId: trustedTenantId,
            backupId: normalizedSourceBackupId,
            eventType: 'RESTORE_COMPLETED',
            actorUserId,
            reason: normalizedReason,
            metadata: { rowCount: inspected.rowCount, verifiedCounts, safetyBackupId: safetyBackup.record?.id || null }
        });
        return {
            restored: true,
            tenantId: trustedTenantId,
            rowCount: inspected.rowCount,
            tableCounts: verifiedCounts,
            generatedAt: inspected.generatedAt,
            safetyBackupId: safetyBackup.record?.id || null,
            integrity: inspected.integrity
        };
    } catch (error) {
        if (!committed) {
            try { await transaction.rollback(); } catch (_) { /* preserve original restore failure */ }
        }
        await writeTenantBackupAudit({
            tenantId: trustedTenantId,
            backupId: normalizedSourceBackupId,
            eventType: 'RESTORE_FAILED',
            actorUserId,
            reason: normalizedReason,
            result: 'failed',
            metadata: { errorCode: recoveryErrorCode(error, 'RESTORE_FAILED'), safetyBackupId: safetyBackup.record?.id || null }
        }).catch(() => {});
        throw error;
    }
}

async function restoreTenantBackupRecord(id, options = {}) {
    const downloaded = await downloadTenantBackup(id, options);
    return restoreTenantBackup(downloaded.body, {
        ...options,
        tenantId: options.tenantId,
        fileName: downloaded.fileName,
        sourceBackupId: id
    });
}

async function deleteTenantBackup(id, { tenantId = null, actorUserId = null, reason = '', storageService = null } = {}) {
    const trustedTenantId = tenantScopeId(tenantId);
    const normalizedReason = String(reason || '').trim().slice(0, 1000);
    if (!normalizedReason) throw backupError('A reason is required before deleting a backup.', 400, 'BACKUP_DELETE_REASON_REQUIRED');
    await ensureRecoveryTables();
    const storage = storageService || createObjectStorageService();
    const claim = await withTenantRecoveryLock(trustedTenantId, async (transaction) => {
        const recordQuery = await transaction.request()
            .input('id', sql.BigInt, Number(id))
            .input('tenantId', sql.Int, trustedTenantId)
            .query(`${recordSelect('tenant').replace(' FROM dbo.gym_backup_records', ' FROM dbo.gym_backup_records WITH (UPDLOCK,HOLDLOCK)')} WHERE id=@id AND tenant_id=@tenantId;`);
        const record = mapRecord(recordQuery.recordset[0], 'tenant', { includeStorageKey: true });
        if (!record) throw backupError('The requested backup is not available.', 404, 'BACKUP_NOT_FOUND');
        if (['RUNNING', 'UPLOADED', 'VERIFYING'].includes(record.status)) throw backupError('This backup is still being processed.', 409, 'BACKUP_BUSY');
        if (record.status === 'DELETED') return { id: Number(id), alreadyDeleted: true, storageKey: null };
        if (record.errorCode === 'BACKUP_DELETE_IN_PROGRESS'
            && record.updatedAt
            && Date.now() - new Date(record.updatedAt).getTime() < 30 * 60 * 1000) {
            throw backupError('Another deletion is already processing this backup. Try again shortly.', 409, 'BACKUP_BUSY');
        }
        const result = await transaction.request()
            .input('id', sql.BigInt, Number(id))
            .input('tenantId', sql.Int, trustedTenantId)
            .query("UPDATE dbo.gym_backup_records SET status='EXPIRED',error_code='BACKUP_DELETE_IN_PROGRESS',expires_at=SYSUTCDATETIME(),updated_at=SYSUTCDATETIME() WHERE id=@id AND tenant_id=@tenantId AND status NOT IN ('RUNNING','UPLOADED','VERIFYING','DELETED');");
        if (!result.rowsAffected.some((count) => Number(count) > 0)) throw backupError('The backup could not be claimed for deletion.', 409, 'BACKUP_DELETE_CONFLICT');
        return { id: Number(id), alreadyDeleted: false, storageKey: record.storageKey };
    });
    if (claim.alreadyDeleted) return { id: Number(id), deleted: true, idempotent: true };

    let artifactCleanup;
    try {
        artifactCleanup = await deleteTenantArtifactAndVerify(storage, { tenantId: trustedTenantId, key: claim.storageKey });
    } catch (error) {
        const errorCode = recoveryErrorCode(error, 'BACKUP_DELETE_FAILED');
        await updateTenantRecord(trustedTenantId, Number(id), { status: 'EXPIRED', errorCode, expiresAt: new Date() }).catch(() => {});
        await writeTenantBackupAudit({
            tenantId: trustedTenantId,
            backupId: Number(id),
            eventType: 'BACKUP_DELETED',
            actorUserId,
            reason: normalizedReason,
            result: 'failed',
            metadata: { artifact: 'pending', errorCode }
        }).catch(() => {});
        throw error;
    }

    const update = await (await getPool()).request()
        .input('id', sql.BigInt, Number(id))
        .input('tenantId', sql.Int, trustedTenantId)
        .query("UPDATE dbo.gym_backup_records SET status='DELETED',error_code=NULL,updated_at=SYSUTCDATETIME() WHERE id=@id AND tenant_id=@tenantId AND status='EXPIRED' AND error_code='BACKUP_DELETE_IN_PROGRESS';");
    if (!update.rowsAffected.some((count) => Number(count) > 0)) {
        throw backupError('The backup metadata could not be finalized after artifact deletion.', 503, 'BACKUP_DELETE_FINALIZE_FAILED');
    }
    await writeTenantBackupAudit({
        tenantId: trustedTenantId,
        backupId: Number(id),
        eventType: 'BACKUP_DELETED',
        actorUserId,
        reason: normalizedReason,
        metadata: { artifact: artifactCleanup.status }
    });
    return { id: Number(id), deleted: true };
}

async function claimPlatformRecord({ backupType, backupDay, fileName, format, actorUserId = null, backupVersion = BACKUP_VERSION, schemaVersion = SCHEMA_VERSION, expiresAt = null } = {}) {
    const pool = await getPool();
    const transaction = pool.transaction();
    await transaction.begin();
    try {
        const deduplicateByDay = ['platform_daily', 'platform_weekly', 'platform_monthly'].includes(backupType);
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
                ${deduplicateByDay ? `SELECT TOP (1) @id=id FROM dbo.gym_platform_backup_records WITH (UPDLOCK,HOLDLOCK)
                WHERE backup_type=@backupType AND backup_day=@backupDay;` : ''}
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
    const normalizedFormat = normalizeBackupFormat(format);
    const pool = await getPool();
    const globalMetadata = await loadTableMetadata(pool, PLATFORM_GLOBAL_BACKUP_TABLES);
    const tenantMetadata = await loadTableMetadata(pool, TENANT_BACKUP_TABLES);
    const globalRows = await mapWithConcurrency(PLATFORM_GLOBAL_BACKUP_TABLES, async (definition) => [
        definition.key,
        await readTableRows(pool, { ...definition, tenantScoped: false }, globalMetadata, { excludeSensitive: true })
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
    validatePlatformBackupPayload(payload, { requireCompleteRegistry: true });
    const json = jsonStringify(payload);
    if (Buffer.byteLength(json, 'utf8') > MAX_BACKUP_JSON_BYTES) throw backupError('The platform backup exceeds the safe size limit.', 400, 'BACKUP_SIZE_LIMIT_EXCEEDED');
    const buffer = await gzipAsync(Buffer.from(json, 'utf8'));
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
    const normalizedReason = String(reason || '').trim().slice(0, 1000);
    if (backupType === 'platform_manual' && !normalizedReason) throw backupError('A reason is required before starting a manual platform backup.', 400, 'BACKUP_REASON_REQUIRED');
    await ensureRecoveryTables();
    const normalizedFormat = normalizeBackupFormat(format);
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
    let stored = null;
    try {
        await writePlatformBackupAudit({
            backupId: claim.record.id,
            eventType: 'PLATFORM_BACKUP_STARTED',
            actorUserId,
            reason: normalizedReason,
            metadata: { backupType, format: normalizedFormat }
        });
        const backup = await buildPlatformBackupArtifact({ format: normalizedFormat, now, concurrency });
        stored = await storage.putPrivatePlatformObject({
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
        await verifyStoredPlatformObject(storage, {
            key: stored.key,
            expectedSize: backup.buffer.length,
            expectedChecksum: backup.checksum
        });
        await updatePlatformRecord(claim.record.id, { status: 'VERIFIED', completedAt: new Date(now), verifiedAt: new Date(now) });
        await writePlatformBackupAudit({
            backupId: claim.record.id,
            eventType: 'PLATFORM_BACKUP_COMPLETED',
            actorUserId,
            reason: normalizedReason,
            metadata: { sizeBytes: backup.buffer.length, rowCount: backup.rowCount, checksumVerified: true }
        });
        return { idempotent: false, record: { ...claim.record, status: 'VERIFIED', sizeBytes: backup.buffer.length, checksum: backup.checksum }, providerStatus: storage.providerStatus };
    } catch (error) {
        const errorCode = recoveryErrorCode(error, 'BACKUP_STORAGE_FAILED');
        let artifactCleanup = 'not_needed';
        if (stored?.key) {
            try {
                artifactCleanup = (await deletePlatformArtifactAndVerify(storage, { key: stored.key })).status;
            } catch (_) {
                artifactCleanup = 'pending';
            }
        }
        const failureValues = { status: 'FAILED', errorCode, completedAt: new Date(now) };
        if (stored?.key && ['deleted', 'missing'].includes(artifactCleanup)) failureValues.storageKey = null;
        await updatePlatformRecord(claim.record.id, failureValues).catch(() => {});
        await writePlatformBackupAudit({
            backupId: claim.record.id,
            eventType: 'PLATFORM_BACKUP_FAILED',
            actorUserId,
            reason: normalizedReason,
            result: 'failed',
            metadata: { errorCode, artifactCleanup }
        }).catch(() => {});
        throw error;
    }
}

async function getPlatformBackupHistory({ limit = 30, readOnly = false } = {}) {
    assertPlatformScope();
    await ensureRecoveryTables({ readOnly });
    const safeLimit = normalizePositiveInteger(limit, 30, 100);
    const result = await (await getPool()).request()
        .input('limit', sql.Int, safeLimit)
        .query(`${recordSelect('platform')} ORDER BY created_at DESC,id DESC OFFSET 0 ROWS FETCH NEXT @limit ROWS ONLY;`);
    return result.recordset.map((row) => mapRecord(row, 'platform'));
}

async function getPlatformBackupRecord(id, { readOnly = false, includeStorageKey = false } = {}) {
    assertPlatformScope();
    const normalizedId = Number(id);
    if (!Number.isInteger(normalizedId) || normalizedId <= 0) throw backupError('The platform backup id is invalid.', 400, 'INVALID_BACKUP_ID');
    await ensureRecoveryTables({ readOnly });
    const result = await (await getPool()).request()
        .input('id', sql.BigInt, normalizedId)
        .query(`${recordSelect('platform')} WHERE id=@id;`);
    return mapRecord(result.recordset[0], 'platform', { includeStorageKey });
}

async function getPlatformBackupAudit({ limit = 50, readOnly = false } = {}) {
    assertPlatformScope();
    await ensureRecoveryTables({ readOnly });
    const safeLimit = normalizePositiveInteger(limit, 50, 200);
    const result = await (await getPool()).request()
        .input('limit', sql.Int, safeLimit)
        .query(`SELECT TOP (@limit) id,backup_id,event_type,actor_user_id,reason,result,safe_metadata_json,created_at
                FROM dbo.gym_platform_backup_audit_log ORDER BY created_at DESC,id DESC;`);
    return result.recordset.map((row) => ({
        id: Number(row.id),
        backupId: row.backup_id == null ? null : Number(row.backup_id),
        eventType: row.event_type,
        actorUserId: row.actor_user_id == null ? null : Number(row.actor_user_id),
        reason: row.reason || '',
        result: row.result,
        metadata: safeJson(row.safe_metadata_json),
        createdAt: row.created_at
    }));
}

async function downloadPlatformBackup(id, { readOnly = false, actorUserId = null, auditDownload = false, storageService = null } = {}) {
    const record = await getPlatformBackupRecord(id, { readOnly, includeStorageKey: true });
    if (!record) throw backupError('The requested platform backup is not available.', 404, 'BACKUP_NOT_FOUND');
    if (record.format !== 'json.gz') throw backupError('The requested backup format is not supported.', 409, 'BACKUP_FORMAT_UNSUPPORTED');
    if (record.status !== 'VERIFIED') throw backupError('Only verified backups can be downloaded.', 409, 'BACKUP_NOT_VERIFIED');
    const storage = storageService || createObjectStorageService();
    if (!record.storageKey || !record.checksum || !Number.isInteger(Number(record.sizeBytes)) || Number(record.sizeBytes) <= 0) {
        throw backupError('The verified platform backup metadata is incomplete.', 503, 'BACKUP_METADATA_INCOMPLETE');
    }
    const verified = await verifyStoredPlatformObject(storage, {
        key: record.storageKey,
        expectedSize: record.sizeBytes,
        expectedChecksum: record.checksum,
        returnBody: true
    });
    if (record.rowCount != null && Number(record.rowCount) !== Number(verified.rowCount)) {
        throw backupError('The platform backup metadata does not match its verified artifact.', 503, 'BACKUP_METADATA_MISMATCH');
    }
    if (auditDownload) {
        // Platform download routes are normal GETs and therefore inherit a
        // read-only request context. Audit the deliberate download in an
        // explicit platform context rather than mutating the read path.
        await runTenantContext({ tenantId: null, userId: actorUserId, mode: 'platform', readOnlyBaseline: false }, () => writePlatformBackupAudit({
            backupId: record.id,
            eventType: 'PLATFORM_BACKUP_DOWNLOADED',
            actorUserId,
            metadata: { sizeBytes: verified.size, checksumVerified: true, manifestVerified: true }
        }));
    }
    return { record, body: verified.body, contentType: verified.contentType || 'application/gzip', fileName: record.fileName };
}

async function claimTenantRetentionRecord(pool, tenantId, id) {
    const transaction = pool.transaction();
    let started = false;
    let committed = false;
    try {
        await transaction.begin();
        started = true;
        const result = await transaction.request()
            .input('id', sql.BigInt, id)
            .input('tenantId', sql.Int, tenantId)
            .query(`
                DECLARE @status VARCHAR(20)=NULL;
                DECLARE @errorCode VARCHAR(100)=NULL;
                DECLARE @updatedAt DATETIME2(0)=NULL;
                DECLARE @claimed BIT=0;
                SELECT TOP (1) @status=status,@errorCode=error_code,@updatedAt=updated_at
                FROM dbo.gym_backup_records WITH (UPDLOCK,HOLDLOCK)
                WHERE id=@id AND tenant_id=@tenantId AND status IN ('VERIFIED','FAILED','EXPIRED');
                IF @status IN ('VERIFIED','FAILED')
                BEGIN
                    UPDATE dbo.gym_backup_records
                    SET status='EXPIRED',error_code='BACKUP_DELETE_IN_PROGRESS',updated_at=SYSUTCDATETIME()
                    WHERE id=@id AND tenant_id=@tenantId AND status IN ('VERIFIED','FAILED');
                    SET @claimed=1;
                END
                ELSE IF @status='EXPIRED' AND (@errorCode IS NULL OR @errorCode<>'BACKUP_DELETE_IN_PROGRESS' OR @updatedAt < DATEADD(minute,-30,SYSUTCDATETIME()))
                BEGIN
                    UPDATE dbo.gym_backup_records
                    SET status='EXPIRED',error_code='BACKUP_DELETE_IN_PROGRESS',updated_at=SYSUTCDATETIME()
                    WHERE id=@id AND tenant_id=@tenantId AND status='EXPIRED';
                    SET @claimed=1;
                END
                SELECT TOP (1) id,status,storage_key
                FROM dbo.gym_backup_records
                WHERE @claimed=1 AND id=@id AND tenant_id=@tenantId AND status='EXPIRED' AND error_code='BACKUP_DELETE_IN_PROGRESS';
            `);
        await transaction.commit();
        committed = true;
        const row = result.recordset[0];
        return row ? { claimed: true, storageKey: row.storage_key || null } : { claimed: false, storageKey: null };
    } catch (error) {
        if (started && !committed) await transaction.rollback().catch(() => {});
        throw error;
    }
}

async function claimPlatformRetentionRecord(pool, id) {
    const transaction = pool.transaction();
    let started = false;
    let committed = false;
    try {
        await transaction.begin();
        started = true;
        const result = await transaction.request()
            .input('id', sql.BigInt, id)
            .query(`
                DECLARE @status VARCHAR(20)=NULL;
                DECLARE @errorCode VARCHAR(100)=NULL;
                DECLARE @updatedAt DATETIME2(0)=NULL;
                DECLARE @claimed BIT=0;
                SELECT TOP (1) @status=status,@errorCode=error_code,@updatedAt=updated_at
                FROM dbo.gym_platform_backup_records WITH (UPDLOCK,HOLDLOCK)
                WHERE id=@id AND status IN ('VERIFIED','FAILED','EXPIRED');
                IF @status IN ('VERIFIED','FAILED')
                BEGIN
                    UPDATE dbo.gym_platform_backup_records
                    SET status='EXPIRED',error_code='BACKUP_DELETE_IN_PROGRESS',updated_at=SYSUTCDATETIME()
                    WHERE id=@id AND status IN ('VERIFIED','FAILED');
                    SET @claimed=1;
                END
                ELSE IF @status='EXPIRED' AND (@errorCode IS NULL OR @errorCode<>'BACKUP_DELETE_IN_PROGRESS' OR @updatedAt < DATEADD(minute,-30,SYSUTCDATETIME()))
                BEGIN
                    UPDATE dbo.gym_platform_backup_records
                    SET status='EXPIRED',error_code='BACKUP_DELETE_IN_PROGRESS',updated_at=SYSUTCDATETIME()
                    WHERE id=@id AND status='EXPIRED';
                    SET @claimed=1;
                END
                SELECT TOP (1) id,status,storage_key
                FROM dbo.gym_platform_backup_records
                WHERE @claimed=1 AND id=@id AND status='EXPIRED' AND error_code='BACKUP_DELETE_IN_PROGRESS';
            `);
        await transaction.commit();
        committed = true;
        const row = result.recordset[0];
        return row ? { claimed: true, storageKey: row.storage_key || null } : { claimed: false, storageKey: null };
    } catch (error) {
        if (started && !committed) await transaction.rollback().catch(() => {});
        throw error;
    }
}

async function cleanupExpiredBackups({ now = new Date(), concurrency = 2, storageService = null, limit = 200, actorUserId = null, reason = '' } = {}) {
    assertPlatformScope();
    await ensureRecoveryTables();
    const storage = storageService || createObjectStorageService();
    if (storage.isConfigured === false) {
        return {
            tenant: [],
            platform: [],
            deleted: 0,
            failed: 0,
            skipped: true,
            errorCode: 'BACKUP_STORAGE_NOT_CONFIGURED'
        };
    }
    const safeLimit = normalizePositiveInteger(limit, 200, 500);
    const pool = await getPool();
    const [tenantResult, platformResult] = await Promise.all([
        pool.request().input('now', sql.DateTime2(0), now).input('limit', sql.Int, safeLimit).query(`
            SELECT TOP (@limit) id,tenant_id,status,storage_key,checksum_sha256,size_bytes
            FROM dbo.gym_backup_records
            WHERE expires_at IS NOT NULL AND expires_at <= @now AND status IN ('VERIFIED','FAILED','EXPIRED')
            ORDER BY expires_at,id;`),
        pool.request().input('now', sql.DateTime2(0), now).input('limit', sql.Int, safeLimit).query(`
            SELECT TOP (@limit) id,status,storage_key,checksum_sha256,size_bytes
            FROM dbo.gym_platform_backup_records
            WHERE expires_at IS NOT NULL AND expires_at <= @now AND status IN ('VERIFIED','FAILED','EXPIRED')
            ORDER BY expires_at,id;`)
    ]);
    const tenantResults = await mapWithConcurrency(tenantResult.recordset, async (row) => {
        const tenantId = Number(row.tenant_id);
        const id = Number(row.id);
        try {
            const claim = await claimTenantRetentionRecord(pool, tenantId, id);
            if (!claim.claimed) return { id, tenantId, status: 'skipped' };
            const artifactCleanup = await deleteTenantArtifactAndVerify(storage, { tenantId, key: claim.storageKey });
            const update = await pool.request()
                .input('id', sql.BigInt, id)
                .input('tenantId', sql.Int, tenantId)
                .query("UPDATE dbo.gym_backup_records SET status='DELETED',error_code=NULL,updated_at=SYSUTCDATETIME() WHERE id=@id AND tenant_id=@tenantId AND status='EXPIRED' AND error_code='BACKUP_DELETE_IN_PROGRESS';");
            if (!update.rowsAffected.some((count) => Number(count) > 0)) return { id, tenantId, status: 'skipped' };
            await writeTenantBackupAudit({
                tenantId,
                backupId: id,
                eventType: 'BACKUP_DELETED',
                actorUserId,
                reason,
                metadata: { retention: true, artifact: artifactCleanup.status }
            });
            return { id, tenantId, status: 'deleted' };
        } catch (error) {
            const errorCode = recoveryErrorCode(error, 'RETENTION_DELETE_FAILED');
            await pool.request().input('id', sql.BigInt, id).input('tenantId', sql.Int, tenantId).input('errorCode', sql.VarChar(100), errorCode).query("UPDATE dbo.gym_backup_records SET status='EXPIRED',error_code=@errorCode,updated_at=SYSUTCDATETIME() WHERE id=@id AND tenant_id=@tenantId AND status='EXPIRED';").catch(() => {});
            await writeTenantBackupAudit({ tenantId, backupId: id, eventType: 'BACKUP_DELETED', actorUserId, reason, result: 'failed', metadata: { retention: true, errorCode } }).catch(() => {});
            return { id, tenantId, status: 'failed', errorCode };
        }
    }, concurrency);
    const platformResults = await mapWithConcurrency(platformResult.recordset, async (row) => {
        const id = Number(row.id);
        try {
            const claim = await claimPlatformRetentionRecord(pool, id);
            if (!claim.claimed) return { id, status: 'skipped' };
            const artifactCleanup = await deletePlatformArtifactAndVerify(storage, { key: claim.storageKey });
            const update = await pool.request()
                .input('id', sql.BigInt, id)
                .query("UPDATE dbo.gym_platform_backup_records SET status='DELETED',error_code=NULL,updated_at=SYSUTCDATETIME() WHERE id=@id AND status='EXPIRED' AND error_code='BACKUP_DELETE_IN_PROGRESS';");
            if (!update.rowsAffected.some((count) => Number(count) > 0)) return { id, status: 'skipped' };
            await writePlatformBackupAudit({
                backupId: id,
                eventType: 'PLATFORM_BACKUP_DELETED',
                actorUserId,
                reason,
                metadata: { retention: true, artifact: artifactCleanup.status }
            });
            return { id, status: 'deleted' };
        } catch (error) {
            const errorCode = recoveryErrorCode(error, 'RETENTION_DELETE_FAILED');
            await pool.request().input('id', sql.BigInt, id).input('errorCode', sql.VarChar(100), errorCode).query("UPDATE dbo.gym_platform_backup_records SET status='EXPIRED',error_code=@errorCode,updated_at=SYSUTCDATETIME() WHERE id=@id AND status='EXPIRED';").catch(() => {});
            await writePlatformBackupAudit({ backupId: id, eventType: 'PLATFORM_BACKUP_DELETED', actorUserId, reason, result: 'failed', metadata: { retention: true, errorCode } }).catch(() => {});
            return { id, status: 'failed', errorCode };
        }
    }, concurrency);
    return {
        tenant: tenantResults,
        platform: platformResults,
        deleted: tenantResults.filter((item) => item.status === 'deleted').length + platformResults.filter((item) => item.status === 'deleted').length,
        failed: tenantResults.filter((item) => item.status === 'failed').length + platformResults.filter((item) => item.status === 'failed').length
    };
}

async function runDailyBackupCycle({
    storageService = null,
    now = new Date(),
    concurrency = config.backupSchedulerConcurrency,
    retryCount = config.backupSchedulerRetryCount,
    scheduleWeekly = config.backupEnablePlatformWeekly,
    scheduleMonthly = config.backupEnablePlatformMonthly
} = {}) {
    assertPlatformScope();
    await ensureRecoveryTables();
    const pool = await getPool();
    const tenants = (await pool.request().query(`SELECT id,slug,status FROM dbo.gym_tenants WHERE status IN ('trial','active') ORDER BY id;`)).recordset
        .map((tenant) => ({ id: Number(tenant.id), slug: tenant.slug, status: tenant.status }));
    const storage = storageService || createObjectStorageService();
    // Do not create a failed metadata row for every tenant on every cron run
    // while the production storage provider is intentionally unconfigured.
    // The health surface still reports the missing provider, and a configured
    // scheduler can retry the complete cycle later without noisy state.
    if (storage.isConfigured === false) {
        const unavailable = tenants.map((tenant) => ({
            tenantId: tenant.id,
            slug: tenant.slug,
            status: 'failed',
            errorCode: 'BACKUP_STORAGE_NOT_CONFIGURED'
        }));
        return {
            backupDay: backupDayKey(now),
            eligibleTenants: tenants.length,
            tenantResults: unavailable,
            tenantSucceeded: 0,
            tenantFailed: unavailable.length,
            platform: { status: 'failed', errorCode: 'BACKUP_STORAGE_NOT_CONFIGURED' },
            scheduledPlatform: [],
            retention: { tenant: [], platform: [], deleted: 0, failed: 0, skipped: true, errorCode: 'BACKUP_STORAGE_NOT_CONFIGURED' },
            providerStatus: storage.providerStatus
        };
    }
    const tenantResults = await mapWithConcurrency(tenants, async (tenant) => {
        let lastError = null;
        for (let attempt = 0; attempt <= normalizeRetryCount(retryCount, 1, 3); attempt += 1) {
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
        return { tenantId: tenant.id, slug: tenant.slug, status: 'failed', errorCode: recoveryErrorCode(lastError, 'BACKUP_FAILED') };
    }, concurrency);
    let platform = null;
    try {
        platform = await createPlatformBackup({ backupType: 'platform_daily', now, concurrency, storageService: storage });
    } catch (error) {
        platform = { status: 'failed', errorCode: recoveryErrorCode(error, 'PLATFORM_BACKUP_FAILED') };
    }
    const scheduledPlatform = [];
    for (const backupType of getScheduledPlatformBackupTypes(now, { weekly: scheduleWeekly, monthly: scheduleMonthly })) {
        try {
            scheduledPlatform.push({
                backupType,
                ...(await createPlatformBackup({ backupType, now, concurrency, storageService: storage }))
            });
        } catch (error) {
            // A weekly/monthly snapshot must not turn a successful daily run
            // into a global failure. The failed day remains retryable.
            scheduledPlatform.push({
                backupType,
                status: 'failed',
                errorCode: recoveryErrorCode(error, 'PLATFORM_BACKUP_FAILED')
            });
        }
    }
    const retention = await cleanupExpiredBackups({ now, concurrency, storageService: storage }).catch((error) => ({
        tenant: [],
        platform: [],
        deleted: 0,
        failed: 1,
        errorCode: recoveryErrorCode(error, 'RETENTION_CLEANUP_FAILED')
    }));
    return {
        backupDay: backupDayKey(now),
        eligibleTenants: tenants.length,
        tenantResults,
        tenantSucceeded: tenantResults.filter((item) => item.status === 'success').length,
        tenantFailed: tenantResults.filter((item) => item.status === 'failed').length,
        platform,
        scheduledPlatform,
        retention,
        providerStatus: storage.providerStatus
    };
}

async function getPlatformBackupHealth({ readOnly = false, limit = 20, now = new Date(), storageService = null } = {}) {
    assertPlatformScope();
    await ensureRecoveryTables({ readOnly });
    const safeLimit = normalizePositiveInteger(limit, 20, 100);
    const pool = await getPool();
    const backupDay = backupDayKey(now);
    const [tenantSummary, tenantLatest, platformSummary, platformVerified, restoreRehearsal, recentFailures, platformFailures, registryCoverage] = await Promise.all([
        pool.request().input('backupDay', sql.Date, dateValue(backupDay)).query(`
            SELECT COUNT_BIG(*) AS eligible_tenants,
                   SUM(CASE WHEN r.id IS NOT NULL AND r.status='VERIFIED' THEN 1 ELSE 0 END) AS verified_today,
                   SUM(CASE WHEN r.id IS NOT NULL AND r.status='FAILED' THEN 1 ELSE 0 END) AS failed_today,
                   SUM(CASE WHEN r.id IS NULL THEN 1 ELSE 0 END) AS missing_today
            FROM dbo.gym_tenants t
            LEFT JOIN dbo.gym_backup_records r
              ON r.tenant_id=t.id AND r.backup_type='tenant_daily' AND r.backup_day=@backupDay
            WHERE t.status IN ('trial','active');
        `),
        pool.request().input('limit', sql.Int, safeLimit).query(`
            WITH ranked AS (
                SELECT r.id,r.tenant_id,r.status,r.backup_day,r.size_bytes,r.verified_at,r.created_at,t.slug,
                       ROW_NUMBER() OVER (PARTITION BY r.tenant_id ORDER BY r.backup_day DESC,r.id DESC) AS row_number
                FROM dbo.gym_backup_records r INNER JOIN dbo.gym_tenants t ON t.id=r.tenant_id
                WHERE r.backup_type='tenant_daily'
            )
            SELECT id,tenant_id,status,backup_day,size_bytes,verified_at,created_at,slug
            FROM ranked WHERE row_number=1 ORDER BY backup_day DESC,tenant_id OFFSET 0 ROWS FETCH NEXT @limit ROWS ONLY;
        `),
        pool.request().query(`SELECT TOP (1) id,backup_type,backup_day,status,size_bytes,verified_at,created_at FROM dbo.gym_platform_backup_records ORDER BY created_at DESC,id DESC;`),
        pool.request().query(`SELECT TOP (1) id,backup_type,backup_day,status,size_bytes,verified_at,created_at FROM dbo.gym_platform_backup_records WHERE status='VERIFIED' ORDER BY verified_at DESC,created_at DESC,id DESC;`),
        pool.request().query(`SELECT TOP (1) created_at FROM dbo.gym_platform_backup_audit_log WHERE event_type IN ('PLATFORM_RESTORE_REHEARSAL_COMPLETED','PLATFORM_RESTORE_COMPLETED') AND result='success' ORDER BY created_at DESC,id DESC;`),
        pool.request().input('limit', sql.Int, safeLimit).query(`SELECT TOP (@limit) id,tenant_id,status,error_code,created_at FROM dbo.gym_backup_records WHERE status='FAILED' ORDER BY created_at DESC,id DESC;`),
        pool.request().input('limit', sql.Int, safeLimit).query(`SELECT TOP (@limit) id,status,error_code,created_at FROM dbo.gym_platform_backup_records WHERE status='FAILED' ORDER BY created_at DESC,id DESC;`),
        getTenantBackupCoverageStatus({ readOnly })
    ]);
    const summary = tenantSummary.recordset[0] || {};
    return {
        providerStatus: storageService?.providerStatus || 'not_configured',
        offsiteStatus: storageService?.offsiteStatus || 'not_configured',
        scheduledPolicy: {
            daily: true,
            weekly: Boolean(config.backupEnablePlatformWeekly),
            monthly: Boolean(config.backupEnablePlatformMonthly),
            weeklyDay: 'UTC Sunday',
            monthlyDay: 'UTC first day'
        },
        summary: {
            eligibleTenants: Number(summary.eligible_tenants || 0),
            verifiedToday: Number(summary.verified_today || 0),
            failedToday: Number(summary.failed_today || 0),
            missingToday: Number(summary.missing_today || 0),
            backupDay
        },
        tenantDaily: tenantLatest.recordset.map((row) => ({ id: Number(row.id), tenantId: Number(row.tenant_id), slug: row.slug, status: row.status, backupDay: row.backup_day, sizeBytes: row.size_bytes == null ? null : Number(row.size_bytes), verifiedAt: row.verified_at, createdAt: row.created_at })),
        lastPlatformBackup: mapRecord(platformSummary.recordset[0], 'platform'),
        lastVerifiedPlatformBackup: mapRecord(platformVerified.recordset[0], 'platform'),
        lastRestoreRehearsalAt: restoreRehearsal.recordset[0]?.created_at || null,
        recentFailures: recentFailures.recordset.map((row) => ({ id: Number(row.id), tenantId: Number(row.tenant_id), status: row.status, errorCode: row.error_code, createdAt: row.created_at })),
        platformFailures: platformFailures.recordset.map((row) => ({ id: Number(row.id), status: row.status, errorCode: row.error_code, createdAt: row.created_at })),
        registryCoverage
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
        getTenantBackupAudit,
        downloadTenantBackup: (id, options = {}) => downloadTenantBackup(id, { ...options, storageService }),
        deleteTenantBackup: (id, options = {}) => deleteTenantBackup(id, { ...options, storageService }),
        restoreTenantBackup: (input, options = {}) => restoreTenantBackup(input, { ...options, storageService }),
        restoreTenantBackupRecord: (id, options = {}) => restoreTenantBackupRecord(id, { ...options, storageService }),
        getPlatformBackupHistory,
        getPlatformBackupRecord,
        getPlatformBackupAudit,
        downloadPlatformBackup: (id, options = {}) => downloadPlatformBackup(id, { ...options, storageService }),
        cleanupExpiredBackups: (options = {}) => cleanupExpiredBackups({ ...options, storageService }),
        getPlatformBackupHealth: (options = {}) => getPlatformBackupHealth({ ...options, storageService }),
        getTenantBackupCoverageStatus,
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
    deletePlatformArtifactAndVerify,
    deleteTenantArtifactAndVerify,
    ensureRecoveryTables,
    getPlatformBackupHealth,
    getTenantBackupCoverageStatus,
    inspectPlatformBackupBuffer,
    validatePlatformBackupPayload,
    getPlatformBackupHistory,
    getPlatformBackupRecord,
    getPlatformBackupAudit,
    downloadPlatformBackup,
    cleanupExpiredBackups,
    getRetentionPolicy,
    getScheduledPlatformBackupTypes,
    getTenantBackupHistory,
    getTenantBackupRecord,
    getTenantBackupAudit,
    inspectTenantBackupBuffer,
    mapWithConcurrency,
    normalizeBackupFormat,
    normalizeRetryCount,
    payloadDigest,
    runDailyBackupCycle,
    validateTenantBackupPayload,
    verifyStoredPlatformObject,
    verifyStoredTenantObject,
    downloadTenantBackup,
    deleteTenantBackup,
    restoreTenantBackup,
    restoreTenantBackupRecord,
    writeTenantBackupAudit,
    writePlatformBackupAudit
};
