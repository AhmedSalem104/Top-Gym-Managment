'use strict';

const crypto = require('node:crypto');
const { promisify } = require('node:util');
const { gzip, gunzip } = require('node:zlib');
const { getPool, sql } = require('../database');
const { parseConnectionString } = require('../database/pool');
const { currentTenantId, getTenantContext, runTenantContext } = require('../tenancy/tenant-context');
const { resolveTenantType } = require('../tenancy/tenant-types');
const { config } = require('../config/env');
const { createObjectStorageService } = require('./object-storage-service');
const { TENANT_TABLES } = require('./tenant-service');
const { safeErrorCode } = require('../utils/error-response');
const {
    PLATFORM_BACKUP_EXCLUDED_TABLES,
    PLATFORM_GLOBAL_BACKUP_TABLES,
    LEGACY_BACKUP_EXCLUDED_TABLES,
    LEGACY_BACKUP_TABLES,
    TENANT_BACKUP_REGISTRY_VERSION,
    TENANT_BACKUP_TABLES,
    classifyPlatformTable,
    getPlatformBackupCoverage,
    getTenantBackupCoverage
} = require('./backup-registry');

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);
const BACKUP_VERSION = 3;
const SUPPORTED_BACKUP_VERSIONS = Object.freeze(new Set([2, BACKUP_VERSION]));
const SCHEMA_VERSION = '009';
const REQUIRED_RESTORE_VERSION = 'logic-fit-platform-logical-v3';
const MAX_BACKUP_UPLOAD_BYTES = 25 * 1024 * 1024;
const MAX_BACKUP_JSON_BYTES = 80 * 1024 * 1024;
const MAX_BACKUP_ROWS = 150000;
const BACKUP_CATEGORY = 'backups';
const LEGACY_SCHEMA_SNAPSHOT_VERSION = 1;
const SAFE_SCHEMA_TYPES = new Set([
    'bigint', 'bit', 'char', 'date', 'datetime', 'datetime2', 'decimal',
    'float', 'int', 'money', 'nchar', 'ntext', 'numeric', 'nvarchar',
    'real', 'smalldatetime', 'smallint', 'smallmoney', 'text', 'time',
    'timestamp', 'tinyint', 'uniqueidentifier', 'varbinary', 'varchar',
    'binary', 'datetimeoffset', 'xml'
]);
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
const SENSITIVE_COLUMN_PATTERN = /(^|_)(?:password|token|secret|api_key|private_key|encryption_key|credential|credentials|otp)(?:_|$)/i;

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
    const rawColumn = String(value || '').trim();
    const column = rawColumn.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
    const compactColumn = column.replaceAll('_', '');
    return PLATFORM_SENSITIVE_COLUMNS.has(column)
        || SENSITIVE_COLUMN_PATTERN.test(column)
        || ['passwordhash', 'passwordsalt', 'passwordresettoken', 'refreshtoken', 'sessiontoken', 'apikey'].includes(compactColumn);
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

function getDailyBackupCycleHttpStatus(result) {
    const tenantFailed = Number(result?.tenantFailed || 0) > 0;
    const platformFailed = result?.platform?.status === 'failed';
    const scheduledFailed = Array.isArray(result?.scheduledPlatform)
        && result.scheduledPlatform.some((item) => item?.status === 'failed' || item?.record?.status === 'FAILED');
    const retentionFailed = Number(result?.retention?.failed || 0) > 0;
    return tenantFailed || platformFailed || scheduledFailed || retentionFailed ? 503 : 200;
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

function schemaSnapshotDigest(snapshot) {
    return crypto.createHash('sha256').update(jsonStringify(snapshot || null)).digest('hex');
}

function rowsDigest(rows) {
    return crypto.createHash('sha256').update(jsonStringify(Array.isArray(rows) ? rows : [])).digest('hex');
}

function canonicalRows(rows) {
    return (Array.isArray(rows) ? rows : []).slice().sort((left, right) => {
        const a = jsonStringify(left);
        const b = jsonStringify(right);
        return a < b ? -1 : a > b ? 1 : 0;
    });
}

function releaseIdentifier() {
    const value = process.env.VERCEL_GIT_COMMIT_SHA || process.env.APP_RELEASE_ID || '';
    return /^[A-Za-z0-9._-]{1,128}$/.test(String(value)) ? String(value) : null;
}

function buildTableInventory(tables, definitionsByScope) {
    const inventory = { global: [], tenant: [] };
    if (Array.isArray(definitionsByScope.legacy)) inventory.legacy = [];
    for (const scope of Object.keys(inventory)) {
        const scopeTables = normalizedTableMap(tables?.[scope]);
        for (const definition of definitionsByScope[scope] || []) {
            const rows = Array.isArray(scopeTables[definition.key]) ? scopeTables[definition.key] : [];
            inventory[scope].push({
                key: definition.key,
                table: definition.table,
                rowCount: rows.length,
                sha256: rowsDigest(rows)
            });
        }
    }
    return inventory;
}

function tableChecksumsFromInventory(inventory) {
    return Object.fromEntries(Object.entries(inventory || {}).map(([scope, items]) => [
        scope,
        Object.fromEntries((items || []).map((item) => [item.key, item.sha256]))
    ]));
}

function buildPlatformManifest({ tables, tableCounts, now, definitionsByScope = null, sourceSchemaGeneration = 'modern', sourceSchemaCapabilities = null, coverage = null, legacySchemaSnapshot = null }) {
    const definitions = definitionsByScope || {
        global: PLATFORM_GLOBAL_BACKUP_TABLES,
        tenant: TENANT_BACKUP_TABLES
    };
    const inventory = buildTableInventory(tables, {
        global: definitions.global || [],
        tenant: definitions.tenant || [],
        ...(Array.isArray(definitions.legacy) ? { legacy: definitions.legacy } : {})
    });
    const excludedTables = [
        ...PLATFORM_BACKUP_EXCLUDED_TABLES,
        ...LEGACY_BACKUP_EXCLUDED_TABLES
    ];
    return {
        backupFormatVersion: BACKUP_VERSION,
        requiredRestoreVersion: REQUIRED_RESTORE_VERSION,
        registryVersion: TENANT_BACKUP_REGISTRY_VERSION,
        backupType: 'platform-disaster-recovery',
        createdAt: new Date(now).toISOString(),
        includesGlobalControlPlane: true,
        includesTenantData: true,
        excludesSecrets: true,
        excludedTables,
        tenantCount: Array.isArray(tables?.global?.gym_tenants) ? tables.global.gym_tenants.length : 0,
        tableInventory: inventory,
        tableChecksums: tableChecksumsFromInventory(inventory),
        tableCounts,
        rowCount: Object.values(tableCounts || {}).reduce((sum, counts) => sum + totalRows(counts), 0),
        sourceSchemaGeneration,
        sourceSchemaCapabilities: sourceSchemaCapabilities || undefined,
        coverage: coverage || undefined,
        legacySchemaSnapshot: legacySchemaSnapshot || undefined,
        legacySchemaSnapshotSha256: legacySchemaSnapshot ? schemaSnapshotDigest(legacySchemaSnapshot) : undefined
    };
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
    if (!SUPPORTED_BACKUP_VERSIONS.has(Number(payload.version))) {
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

function validatePlatformTenantReferences(globalTables, tenantTables) {
    const tenantIds = new Set((Array.isArray(globalTables.gym_tenants) ? globalTables.gym_tenants : [])
        .map((row) => Number(row.id))
        .filter((id) => Number.isInteger(id) && id > 0));
    for (const rows of [...Object.values(globalTables), ...Object.values(tenantTables)]) {
        for (const [rowIndex, row] of rows.entries()) {
            const tenantKey = Object.keys(row).find((column) => column.toLowerCase() === 'tenant_id');
            // Platform-scoped records may intentionally carry a NULL
            // tenant_id (for example platform audit events). Validate only
            // concrete tenant references; a non-null reference must still
            // resolve to a tenant in the same platform snapshot.
            if (tenantKey && row[tenantKey] !== null && row[tenantKey] !== undefined
                && !tenantIds.has(Number(row[tenantKey]))) {
                throw backupError('The platform backup contains a row for an unknown gym.', 400, 'PLATFORM_BACKUP_TENANT_REFERENCE_INVALID');
            }
        }
    }
    return true;
}

function validatePlatformBackupPayload(payload, { requireCompleteRegistry = true } = {}) {
    if (!payload || payload.format !== 'logic-fit-platform-backup') {
        throw backupError('The uploaded file is not a Logic Fit platform backup.', 400, 'PLATFORM_BACKUP_FORMAT_UNSUPPORTED');
    }
    if (payload.backupType !== 'platform-disaster-recovery') {
        throw backupError('The platform backup type is invalid.', 400, 'PLATFORM_BACKUP_TYPE_INVALID');
    }
    const payloadVersion = Number(payload.version);
    if (!SUPPORTED_BACKUP_VERSIONS.has(payloadVersion)) {
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
    const legacyTables = normalizedTableMap(tables.legacy);
    const legacySource = manifest.sourceSchemaGeneration === 'legacy-pre-trainer';
    const knownGlobalKeys = new Set(PLATFORM_GLOBAL_BACKUP_TABLES.map((item) => item.key));
    const knownTenantKeys = new Set(TENANT_BACKUP_TABLES.map((item) => item.key));
    const knownLegacyKeys = new Set(LEGACY_BACKUP_TABLES.map((item) => item.key));
    const unknownGlobal = Object.keys(globalTables).filter((key) => !knownGlobalKeys.has(key));
    const unknownTenant = Object.keys(tenantTables).filter((key) => !knownTenantKeys.has(key));
    const unknownLegacy = Object.keys(legacyTables).filter((key) => !knownLegacyKeys.has(key));
    if (unknownGlobal.length || unknownTenant.length || unknownLegacy.length) {
        throw backupError('The platform backup contains an unknown table.', 400, 'PLATFORM_BACKUP_TABLE_NOT_ALLOWED');
    }
    if (requireCompleteRegistry && !legacySource) {
        const missingGlobal = PLATFORM_GLOBAL_BACKUP_TABLES.map((item) => item.key)
            .filter((key) => !Object.prototype.hasOwnProperty.call(globalTables, key));
        const missingTenant = TENANT_BACKUP_TABLES.map((item) => item.key)
            .filter((key) => !Object.prototype.hasOwnProperty.call(tenantTables, key));
        if (missingGlobal.length || missingTenant.length) {
            throw backupError('The platform backup is incomplete for the current registry.', 400, 'PLATFORM_BACKUP_REGISTRY_INCOMPLETE');
        }
    }
    const counts = { global: {}, tenant: {}, ...(legacySource ? { legacy: {} } : {}) };
    let rowCount = 0;
    for (const [key, rows] of Object.entries(globalTables)) {
        if (!Array.isArray(rows) || rows.some((row) => !row || typeof row !== 'object' || Array.isArray(row))) {
            throw backupError('The platform backup has an invalid global table.', 400, 'PLATFORM_BACKUP_TABLE_INVALID');
        }
        for (const [rowIndex, row] of rows.entries()) {
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
    for (const [key, rows] of Object.entries(legacyTables)) {
        const definition = LEGACY_BACKUP_TABLES.find((item) => item.key === key);
        if (!definition || !Array.isArray(rows) || rows.some((row) => !row || typeof row !== 'object' || Array.isArray(row))) {
            throw backupError('The platform backup has an invalid legacy table.', 400, 'PLATFORM_BACKUP_TABLE_INVALID');
        }
        for (const [rowIndex, row] of rows.entries()) {
            if (Object.keys(row).some(isSensitiveColumn)) {
                throw backupError('The platform backup contains a sensitive credential column.', 400, 'PLATFORM_BACKUP_SECRET_COLUMN');
            }
            if (String(definition.ownership || '').startsWith('direct:')) {
                const tenantKey = Object.keys(row).find((column) => column.toLowerCase() === 'tenantid' || column.toLowerCase() === 'tenant_id');
                // Legacy TenantId columns are not guaranteed to use the
                // modern INT tenant key (the deployed schema includes legacy
                // GUID-backed records). Presence is required; the source
                // value is retained exactly and is not coerced to a modern
                // gym_tenants.id.
                if (tenantKey === undefined) {
                    throw backupError(`The legacy platform backup contains a row without valid tenant ownership in ${key} at ordinal ${rowIndex}; columns=${Object.keys(row).join(',')}.`, 400, 'PLATFORM_BACKUP_TENANT_COLUMN_INVALID');
                }
            }
        }
        counts.legacy[key] = rows.length;
        rowCount += rows.length;
    }
    if (rowCount > MAX_BACKUP_ROWS) throw backupError('The platform backup exceeds the safe row limit.', 400, 'BACKUP_ROW_LIMIT_EXCEEDED');
    const manifestCounts = normalizedTableMap(manifest.tableCounts);
    if (!manifestCounts.global || typeof manifestCounts.global !== 'object' || Array.isArray(manifestCounts.global)
        || !manifestCounts.tenant || typeof manifestCounts.tenant !== 'object' || Array.isArray(manifestCounts.tenant)
        || (legacySource && (!manifestCounts.legacy || typeof manifestCounts.legacy !== 'object' || Array.isArray(manifestCounts.legacy)))) {
        throw backupError('The platform backup table counts are incomplete.', 400, 'PLATFORM_BACKUP_MANIFEST_INVALID');
    }
    if (requireCompleteRegistry && !legacySource) {
        const missingGlobalCounts = PLATFORM_GLOBAL_BACKUP_TABLES.map((item) => item.key)
            .filter((key) => !Object.prototype.hasOwnProperty.call(manifestCounts.global, key));
        const missingTenantCounts = TENANT_BACKUP_TABLES.map((item) => item.key)
            .filter((key) => !Object.prototype.hasOwnProperty.call(manifestCounts.tenant, key));
        if (missingGlobalCounts.length || missingTenantCounts.length) {
            throw backupError('The platform backup manifest does not cover the current registry.', 400, 'PLATFORM_BACKUP_REGISTRY_INCOMPLETE');
        }
    }
    for (const scope of ['global', 'tenant', ...(legacySource ? ['legacy'] : [])]) {
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
    // Modern platform/control-plane references must resolve to the snapshot's
    // gym_tenants ids. Legacy tables may use a separate historical key type;
    // they are validated through their own source relationships and are not
    // compared to modern INT tenant ids.
    validatePlatformTenantReferences(globalTables, tenantTables);
    const digest = String(payload.integrity?.sha256 || '').toLowerCase();
    if (String(payload.integrity?.algorithm || '').toLowerCase() !== 'sha256' || !/^[a-f0-9]{64}$/.test(digest)) {
        throw backupError('The platform backup integrity manifest is invalid.', 400, 'PLATFORM_BACKUP_INTEGRITY_INVALID');
    }
    if (payloadDigest(tables) !== digest) {
        throw backupError('The platform backup content failed its integrity check.', 400, 'PLATFORM_BACKUP_CHECKSUM_MISMATCH');
    }
    if (payloadVersion >= 3) {
        if (legacySource) validateLegacySchemaSnapshot(manifest, legacyTables);
        const inventory = manifest.tableInventory;
        const checksums = manifest.tableChecksums;
        if (!inventory || typeof inventory !== 'object' || Array.isArray(inventory)
            || !Array.isArray(inventory.global) || !Array.isArray(inventory.tenant)
            || (legacySource && !Array.isArray(inventory.legacy))
            || !checksums || typeof checksums !== 'object' || Array.isArray(checksums)
            || !checksums.global || typeof checksums.global !== 'object'
            || !checksums.tenant || typeof checksums.tenant !== 'object'
            || (legacySource && (!checksums.legacy || typeof checksums.legacy !== 'object'))
            || manifest.backupFormatVersion !== 3
            || manifest.requiredRestoreVersion !== REQUIRED_RESTORE_VERSION
            || !Array.isArray(manifest.excludedTables)
            || !PLATFORM_BACKUP_EXCLUDED_TABLES.every((table) => manifest.excludedTables.includes(table))
            || !LEGACY_BACKUP_EXCLUDED_TABLES.every((table) => manifest.excludedTables.includes(table))) {
            throw backupError('The platform backup table inventory is incomplete or unsafe.', 400, 'PLATFORM_BACKUP_INVENTORY_INVALID');
        }
        const inventoryScopes = [
            ['global', PLATFORM_GLOBAL_BACKUP_TABLES],
            ['tenant', TENANT_BACKUP_TABLES],
            ...(legacySource ? [['legacy', LEGACY_BACKUP_TABLES]] : [])
        ];
        for (const [scope, definitions] of inventoryScopes) {
            const rowsByKey = scope === 'global' ? globalTables : tenantTables;
            const scopedRows = scope === 'global' ? globalTables : scope === 'tenant' ? tenantTables : legacyTables;
            const presentDefinitions = definitions.filter((definition) => Object.prototype.hasOwnProperty.call(scopedRows, definition.key));
            const inventoryByKey = new Map(inventory[scope].map((item) => [String(item?.key || ''), item]));
            if (requireCompleteRegistry && !legacySource && inventoryByKey.size !== definitions.length) {
                throw backupError('The platform backup inventory does not cover the current registry.', 400, 'PLATFORM_BACKUP_INVENTORY_INVALID');
            }
            for (const [key, rows] of Object.entries(scopedRows)) {
                const item = inventoryByKey.get(key);
                if (!item || item.table !== definitions.find((definition) => definition.key === key)?.table
                    || Number(item.rowCount) !== rows.length
                    || item.sha256 !== rowsDigest(rows)
                    || checksums[scope][key] !== item.sha256) {
                    throw backupError('The platform backup table inventory does not match its records.', 400, 'PLATFORM_BACKUP_INVENTORY_INVALID');
                }
            }
            if (requireCompleteRegistry && !legacySource) {
                for (const definition of definitions) {
                    if (!inventoryByKey.has(definition.key)
                        || !Object.prototype.hasOwnProperty.call(checksums[scope], definition.key)) {
                        throw backupError('The platform backup inventory does not cover the current registry.', 400, 'PLATFORM_BACKUP_INVENTORY_INVALID');
                    }
                }
            }
            if (legacySource) {
                for (const definition of presentDefinitions) {
                    if (!inventoryByKey.has(definition.key) || !Object.prototype.hasOwnProperty.call(checksums[scope], definition.key)) {
                        throw backupError('The legacy platform backup inventory does not cover a present source table.', 400, 'PLATFORM_BACKUP_INVENTORY_INVALID');
                    }
                }
            }
        }
        if (legacySource) {
            const coverage = manifest.coverage;
            if (!coverage || Number(coverage.unknownTables || 0) !== 0 || Number(coverage.unexplainedTables || 0) !== 0) {
                throw backupError('The legacy platform backup coverage manifest is incomplete.', 400, 'PLATFORM_BACKUP_INVENTORY_INVALID');
            }
        }
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
            name: String(tenant.name || '').slice(0, 160),
            tenantType: resolveTenantType(tenant.tenantType)
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
        SELECT t.name AS table_name, c.name, ty.name AS typeName, c.max_length AS maxLength,
               c.precision, c.scale, c.is_identity AS isIdentity, c.is_computed AS isComputed,
               CASE WHEN c.system_type_id = 189 THEN 1 ELSE 0 END AS isRowVersion
        FROM sys.columns AS c
        INNER JOIN sys.tables AS t ON t.object_id=c.object_id
        INNER JOIN sys.schemas AS s ON s.schema_id=t.schema_id
        INNER JOIN sys.types AS ty ON ty.user_type_id=c.user_type_id
        WHERE s.name=N'dbo' AND t.name IN (${literals})
        ORDER BY t.name, c.column_id;
    `);
    const metadata = new Map(names.map((name) => [name, []]));
    for (const row of result.recordset) {
        const table = String(row.table_name);
        if (metadata.has(table)) metadata.get(table).push({
            name: String(row.name),
            typeName: String(row.typeName || ''),
            maxLength: row.maxLength == null ? null : Number(row.maxLength),
            precision: row.precision == null ? null : Number(row.precision),
            scale: row.scale == null ? null : Number(row.scale),
            isIdentity: Boolean(row.isIdentity),
            isComputed: Boolean(row.isComputed),
            isRowVersion: Boolean(row.isRowVersion)
        });
    }
    return metadata;
}

function snapshotIdentifier(value) {
    const name = String(value || '');
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
        throw backupError('Backup schema metadata contains an unsafe identifier.', 400, 'BACKUP_SCHEMA_METADATA_INVALID');
    }
    return name;
}

function snapshotExpression(value, { required = false } = {}) {
    const expression = value == null ? '' : String(value).trim();
    if (!expression) {
        if (required) throw backupError('Backup schema metadata contains a missing expression.', 400, 'BACKUP_SCHEMA_METADATA_INVALID');
        return null;
    }
    // Expressions come from trusted SQL metadata, but a restored artifact is
    // still treated as untrusted input. Do not allow batch separators,
    // comments or a second statement to cross the local restore boundary.
    if (expression.length > 4000 || /;|--|\/\*|\*\//.test(expression)) {
        throw backupError('Backup schema metadata contains an unsafe expression.', 400, 'BACKUP_SCHEMA_METADATA_INVALID');
    }
    return expression;
}

function schemaSnapshotType(column) {
    const type = String(column?.type || '').trim().toLowerCase();
    if (!SAFE_SCHEMA_TYPES.has(type)) throw backupError('Backup schema metadata contains an unsupported SQL type.', 400, 'BACKUP_SCHEMA_METADATA_INVALID');
    const maxLength = Number(column?.maxLength);
    const precision = Number(column?.precision);
    const scale = Number(column?.scale);
    if (['varchar', 'char', 'nvarchar', 'nchar', 'varbinary', 'binary'].includes(type)) {
        const length = maxLength === -1 ? 'MAX' : Math.max(1, Number.isFinite(maxLength) ? maxLength : 1);
        const normalizedLength = ['nvarchar', 'nchar'].includes(type) && length !== 'MAX' ? Math.max(1, Math.floor(length / 2)) : length;
        return `${type}(${normalizedLength})`;
    }
    if (['decimal', 'numeric'].includes(type)) return `${type}(${Math.max(1, precision || 18)},${Math.max(0, scale || 0)})`;
    if (['datetime2', 'datetimeoffset', 'time'].includes(type)) return `${type}(${Math.max(0, Math.min(7, scale || 0))})`;
    if (type === 'float' && precision > 0) return `${type}(${Math.max(1, Math.min(53, precision))})`;
    return type;
}

async function loadSchemaSnapshot(pool, definitions) {
    const names = safeTableNames(definitions).map(snapshotIdentifier);
    if (!names.length) return { formatVersion: LEGACY_SCHEMA_SNAPSHOT_VERSION, schema: 'dbo', tables: [] };
    const literals = names.map((name) => `N'${name.replaceAll("'", "''")}'`).join(',');
    // A transaction owns one SQL connection. Run metadata reads sequentially
    // so SQL Server/node-mssql cannot reject concurrent requests on that
    // connection with EREQINPROG.
    const columnsResult = await pool.request().query(`
            SELECT c.object_id,t.name AS table_name,c.column_id,c.name AS column_name,ty.name AS type_name,
                   c.max_length,c.precision,c.scale,c.is_nullable,c.is_identity,c.is_computed,
                   CASE WHEN c.system_type_id=189 THEN 1 ELSE 0 END AS is_rowversion,
                   CONVERT(nvarchar(80),ic.seed_value) AS identity_seed,
                   CONVERT(nvarchar(80),ic.increment_value) AS identity_increment,
                   dc.name AS default_name,dc.definition AS default_definition,
                   cc.definition AS computed_definition
            FROM sys.columns c
            INNER JOIN sys.tables t ON t.object_id=c.object_id
            INNER JOIN sys.schemas s ON s.schema_id=t.schema_id
            INNER JOIN sys.types ty ON ty.user_type_id=c.user_type_id
            LEFT JOIN sys.identity_columns ic ON ic.object_id=c.object_id AND ic.column_id=c.column_id
            LEFT JOIN sys.default_constraints dc ON dc.parent_object_id=c.object_id AND dc.parent_column_id=c.column_id
            LEFT JOIN sys.computed_columns cc ON cc.object_id=c.object_id AND cc.column_id=c.column_id
            WHERE s.name=N'dbo' AND t.name IN (${literals})
            ORDER BY t.name,c.column_id;
        `);
    const keysResult = await pool.request().query(`
            SELECT kc.parent_object_id AS object_id,kc.type,kc.name,
                   STRING_AGG(c.name,N'|') WITHIN GROUP (ORDER BY ic.key_ordinal) AS key_columns
            FROM sys.key_constraints kc
            INNER JOIN sys.index_columns ic ON ic.object_id=kc.parent_object_id AND ic.index_id=kc.unique_index_id AND ic.key_ordinal>0
            INNER JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id
            INNER JOIN sys.tables t ON t.object_id=kc.parent_object_id
            INNER JOIN sys.schemas s ON s.schema_id=t.schema_id
            WHERE s.name=N'dbo' AND t.name IN (${literals})
            GROUP BY kc.parent_object_id,kc.type,kc.name;
        `);
    const indexesResult = await pool.request().query(`
            SELECT i.object_id,i.name,i.type_desc,i.is_unique,i.is_primary_key,i.is_unique_constraint,i.is_disabled,
                   i.has_filter,i.filter_definition,
                   STRING_AGG(c.name,N'|') WITHIN GROUP (ORDER BY ic.key_ordinal) AS key_columns
            FROM sys.indexes i
            INNER JOIN sys.tables t ON t.object_id=i.object_id
            INNER JOIN sys.schemas s ON s.schema_id=t.schema_id
            LEFT JOIN sys.index_columns ic ON ic.object_id=i.object_id AND ic.index_id=i.index_id AND ic.key_ordinal>0
            LEFT JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id
            WHERE s.name=N'dbo' AND t.name IN (${literals}) AND i.name IS NOT NULL AND i.is_hypothetical=0
            GROUP BY i.object_id,i.name,i.type_desc,i.is_unique,i.is_primary_key,i.is_unique_constraint,i.is_disabled,i.has_filter,i.filter_definition;
        `);
    const foreignKeysResult = await pool.request().query(`
            SELECT fk.parent_object_id AS object_id,fk.name,
                   rs.name AS referenced_schema,rt.name AS referenced_table,
                   STRING_AGG(pc.name,N'|') WITHIN GROUP (ORDER BY fkc.constraint_column_id) AS columns,
                   STRING_AGG(rc.name,N'|') WITHIN GROUP (ORDER BY fkc.constraint_column_id) AS referenced_columns,
                   fk.is_disabled
            FROM sys.foreign_keys fk
            INNER JOIN sys.tables pt ON pt.object_id=fk.parent_object_id
            INNER JOIN sys.schemas ps ON ps.schema_id=pt.schema_id
            INNER JOIN sys.tables rt ON rt.object_id=fk.referenced_object_id
            INNER JOIN sys.schemas rs ON rs.schema_id=rt.schema_id
            INNER JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id=fk.object_id
            INNER JOIN sys.columns pc ON pc.object_id=fkc.parent_object_id AND pc.column_id=fkc.parent_column_id
            INNER JOIN sys.columns rc ON rc.object_id=fkc.referenced_object_id AND rc.column_id=fkc.referenced_column_id
            WHERE ps.name=N'dbo' AND pt.name IN (${literals})
            GROUP BY fk.parent_object_id,fk.name,rs.name,rt.name,fk.is_disabled;
        `);
    const checksResult = await pool.request().query(`
            SELECT cc.parent_object_id AS object_id,cc.name,cc.definition,cc.is_disabled
            FROM sys.check_constraints cc
            INNER JOIN sys.tables t ON t.object_id=cc.parent_object_id
            INNER JOIN sys.schemas s ON s.schema_id=t.schema_id
            WHERE s.name=N'dbo' AND t.name IN (${literals});
        `);
    const byObject = (rows) => {
        const map = new Map();
        for (const row of rows.recordset) {
            const key = Number(row.object_id);
            const list = map.get(key) || [];
            list.push(row);
            map.set(key, list);
        }
        return map;
    };
    const tableObjects = await pool.request().query(`
        SELECT t.object_id,t.name
        FROM sys.tables t INNER JOIN sys.schemas s ON s.schema_id=t.schema_id
        WHERE s.name=N'dbo' AND t.name IN (${literals}) ORDER BY t.name;
    `);
    const columnsByObject = byObject(columnsResult);
    const keysByObject = byObject(keysResult);
    const indexesByObject = byObject(indexesResult);
    const foreignKeysByObject = byObject(foreignKeysResult);
    const checksByObject = byObject(checksResult);
    const split = (value) => String(value || '').split('|').filter(Boolean).map(snapshotIdentifier);
    const tables = tableObjects.recordset.map((table) => {
        const objectId = Number(table.object_id);
        const columns = (columnsByObject.get(objectId) || []).map((column) => ({
            ordinal: Number(column.column_id),
            name: snapshotIdentifier(column.column_name),
            type: String(column.type_name),
            maxLength: Number(column.max_length),
            precision: Number(column.precision || 0),
            scale: Number(column.scale || 0),
            nullable: Boolean(column.is_nullable),
            identity: Boolean(column.is_identity),
            identitySeed: column.identity_seed == null ? null : String(column.identity_seed),
            identityIncrement: column.identity_increment == null ? null : String(column.identity_increment),
            computed: Boolean(column.is_computed),
            rowVersion: Boolean(column.is_rowversion),
            defaultName: column.default_name ? snapshotIdentifier(column.default_name) : null,
            defaultDefinition: column.default_definition ? snapshotExpression(column.default_definition) : null,
            computedDefinition: column.computed_definition ? snapshotExpression(column.computed_definition, { required: true }) : null
        }));
        return {
            schema: 'dbo',
            table: snapshotIdentifier(table.name),
            columns,
            primaryKeys: (keysByObject.get(objectId) || []).filter((row) => row.type === 'PK').map((row) => ({ name: snapshotIdentifier(row.name), columns: split(row.key_columns) })),
            uniqueConstraints: (keysByObject.get(objectId) || []).filter((row) => row.type === 'UQ').map((row) => ({ name: snapshotIdentifier(row.name), columns: split(row.key_columns) })),
            indexes: (indexesByObject.get(objectId) || []).map((row) => ({ name: snapshotIdentifier(row.name), type: String(row.type_desc), unique: Boolean(row.is_unique), primaryKey: Boolean(row.is_primary_key), uniqueConstraint: Boolean(row.is_unique_constraint), disabled: Boolean(row.is_disabled), filterDefinition: row.filter_definition ? snapshotExpression(row.filter_definition, { required: true }) : null, columns: split(row.key_columns) })),
            foreignKeys: (foreignKeysByObject.get(objectId) || []).map((row) => ({ name: snapshotIdentifier(row.name), referencedSchema: snapshotIdentifier(row.referenced_schema), referencedTable: snapshotIdentifier(row.referenced_table), columns: split(row.columns), referencedColumns: split(row.referenced_columns), disabled: Boolean(row.is_disabled) })),
            checks: (checksByObject.get(objectId) || []).map((row) => ({ name: snapshotIdentifier(row.name), definition: snapshotExpression(row.definition, { required: true }), disabled: Boolean(row.is_disabled) }))
        };
    });
    return { formatVersion: LEGACY_SCHEMA_SNAPSHOT_VERSION, schema: 'dbo', tables };
}

function validateLegacySchemaSnapshot(manifest, legacyTables) {
    const snapshot = manifest?.legacySchemaSnapshot;
    if (!snapshot || Number(snapshot.formatVersion) !== LEGACY_SCHEMA_SNAPSHOT_VERSION || snapshot.schema !== 'dbo' || !Array.isArray(snapshot.tables)) {
        throw backupError('The legacy platform backup schema snapshot is incomplete.', 400, 'PLATFORM_BACKUP_SCHEMA_SNAPSHOT_INVALID');
    }
    const expectedTables = new Set(Object.keys(legacyTables).map((key) => key.startsWith('legacy:') ? key.slice('legacy:'.length).toLowerCase() : key.toLowerCase()));
    const seenTables = new Set();
    for (const table of snapshot.tables) {
        const tableName = snapshotIdentifier(table?.table);
        const tableKey = tableName.toLowerCase();
        if (seenTables.has(tableKey) || !expectedTables.has(tableKey) || !Array.isArray(table.columns) || !table.columns.length) {
            throw backupError('The legacy platform backup schema snapshot does not match its data inventory.', 400, 'PLATFORM_BACKUP_SCHEMA_SNAPSHOT_INVALID');
        }
        seenTables.add(tableKey);
        const seenColumns = new Set();
        for (const column of table.columns) {
            const name = snapshotIdentifier(column?.name).toLowerCase();
            if (seenColumns.has(name) || !SAFE_SCHEMA_TYPES.has(String(column?.type || '').toLowerCase())) {
                throw backupError('The legacy platform backup schema snapshot contains an invalid column.', 400, 'PLATFORM_BACKUP_SCHEMA_SNAPSHOT_INVALID');
            }
            seenColumns.add(name);
            schemaSnapshotType(column);
            if (column.computed) snapshotExpression(column.computedDefinition, { required: true });
            if (column.defaultDefinition) snapshotExpression(column.defaultDefinition, { required: true });
        }
        const validateKeyList = (items) => {
            for (const item of Array.isArray(items) ? items : []) {
                snapshotIdentifier(item?.name);
                if (!Array.isArray(item?.columns) || !item.columns.length) throw backupError('The legacy platform backup schema snapshot contains an invalid key.', 400, 'PLATFORM_BACKUP_SCHEMA_SNAPSHOT_INVALID');
                item.columns.forEach(snapshotIdentifier);
            }
        };
        validateKeyList(table.primaryKeys);
        validateKeyList(table.uniqueConstraints);
        for (const index of Array.isArray(table.indexes) ? table.indexes : []) {
            snapshotIdentifier(index?.name);
            if (!Array.isArray(index?.columns) || !index.columns.length) throw backupError('The legacy platform backup schema snapshot contains an invalid index.', 400, 'PLATFORM_BACKUP_SCHEMA_SNAPSHOT_INVALID');
            index.columns.forEach(snapshotIdentifier);
            if (index.filterDefinition) snapshotExpression(index.filterDefinition, { required: true });
        }
        for (const foreignKey of Array.isArray(table.foreignKeys) ? table.foreignKeys : []) {
            snapshotIdentifier(foreignKey?.name);
            snapshotIdentifier(foreignKey?.referencedSchema);
            snapshotIdentifier(foreignKey?.referencedTable);
            if (!Array.isArray(foreignKey?.columns) || !Array.isArray(foreignKey?.referencedColumns) || foreignKey.columns.length !== foreignKey.referencedColumns.length || !foreignKey.columns.length) {
                throw backupError('The legacy platform backup schema snapshot contains an invalid foreign key.', 400, 'PLATFORM_BACKUP_SCHEMA_SNAPSHOT_INVALID');
            }
            foreignKey.columns.forEach(snapshotIdentifier);
            foreignKey.referencedColumns.forEach(snapshotIdentifier);
        }
        for (const check of Array.isArray(table.checks) ? table.checks : []) {
            snapshotIdentifier(check?.name);
            snapshotExpression(check?.definition, { required: true });
        }
    }
    if (seenTables.size !== expectedTables.size) throw backupError('The legacy platform backup schema snapshot omits a data table.', 400, 'PLATFORM_BACKUP_SCHEMA_SNAPSHOT_INVALID');
    const digest = String(manifest.legacySchemaSnapshotSha256 || '').toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(digest) || schemaSnapshotDigest(snapshot) !== digest) {
        throw backupError('The legacy platform backup schema snapshot failed its integrity check.', 400, 'PLATFORM_BACKUP_SCHEMA_SNAPSHOT_CHECKSUM_MISMATCH');
    }
    return snapshot;
}

function metadataColumns(metadata, table, { excludeSensitive = false } = {}) {
    const columns = metadata.get(table) || [];
    if (!columns.length) throw backupError('A required backup table is missing.', 503, 'BACKUP_TABLE_MISSING');
    return columns.filter((column) => !column.isComputed && !column.isRowVersion
        && (!excludeSensitive || !isSensitiveColumn(column.name)));
}

function nullParameterType(column) {
    const type = String(column?.typeName || '').toLowerCase();
    const maxLength = Number(column?.maxLength);
    const length = maxLength === -1 ? sql.MAX : Math.max(1, Number.isFinite(maxLength) ? maxLength : 1);
    const nationalLength = length === sql.MAX ? sql.MAX : Math.max(1, Math.floor(length / 2));
    if (type === 'nvarchar') return sql.NVarChar(nationalLength);
    if (type === 'nchar') return sql.NChar(nationalLength);
    if (type === 'varchar') return sql.VarChar(length);
    if (type === 'char') return sql.Char(length);
    if (type === 'varbinary') return sql.VarBinary(length);
    if (type === 'binary') return sql.Binary(length);
    if (type === 'bigint') return sql.BigInt;
    if (type === 'int') return sql.Int;
    if (type === 'smallint') return sql.SmallInt;
    if (type === 'tinyint') return sql.TinyInt;
    if (type === 'bit') return sql.Bit;
    if (type === 'uniqueidentifier') return sql.UniqueIdentifier;
    if (type === 'decimal' || type === 'numeric') return sql.Decimal(Math.max(1, Number(column?.precision) || 18), Math.max(0, Number(column?.scale) || 0));
    if (type === 'float') return sql.Float;
    if (type === 'real') return sql.Real;
    if (type === 'money') return sql.Money;
    if (type === 'smallmoney') return sql.SmallMoney;
    if (type === 'date') return sql.Date;
    if (type === 'datetime') return sql.DateTime;
    if (type === 'datetime2') return sql.DateTime2(Math.max(0, Math.min(7, Number(column?.scale) || 0)));
    if (type === 'smalldatetime') return sql.SmallDateTime;
    if (type === 'time') return sql.Time(Math.max(0, Math.min(7, Number(column?.scale) || 0)));
    if (type === 'text') return sql.Text;
    if (type === 'ntext') return sql.NText;
    if (type === 'xml') return sql.Xml;
    return sql.NVarChar(1);
}

function hasTenantColumn(columns) {
    return columns.some((column) => ['tenant_id', 'tenantid'].includes(column.name.toLowerCase()));
}

function tenantColumnName(columns) {
    return columns.find((column) => ['tenant_id', 'tenantid'].includes(column.name.toLowerCase()))?.name || null;
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
        predicate = ` WHERE ${quoteIdentifier(tenantColumnName(columns))}=@tenantId`;
    }
    const result = await request.query(`SELECT ${projection} FROM dbo.${quoteIdentifier(definition.table)}${predicate};`);
    return canonicalRows(result.recordset);
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

async function getPlatformBackupCoverageStatus({ readOnly = false, executor = null } = {}) {
    assertPlatformScope();
    if (!executor) await ensureRecoveryTables({ readOnly });
    const pool = executor || await getPool();
    const tablesResult = await pool.request().query(`
        SELECT t.name
        FROM sys.tables AS t
        INNER JOIN sys.schemas AS s ON s.schema_id=t.schema_id
        WHERE s.name=N'dbo' AND t.is_ms_shipped=0
        ORDER BY t.name;
    `);
    const tenantTablesResult = await pool.request().query(`
        SELECT DISTINCT t.name
        FROM sys.tables AS t
        INNER JOIN sys.columns AS c ON c.object_id=t.object_id
        INNER JOIN sys.schemas AS s ON s.schema_id=t.schema_id
        WHERE s.name=N'dbo' AND t.is_ms_shipped=0 AND REPLACE(LOWER(c.name),N'_',N'')=N'tenantid'
        ORDER BY t.name;
    `);
    const existingTables = tablesResult.recordset.map((row) => String(row.name));
    const tenantTables = tenantTablesResult.recordset.map((row) => String(row.name));
    const tenantTypeResult = await pool.request().query(`
        SELECT CASE WHEN COL_LENGTH(N'dbo.gym_tenants', N'tenant_type') IS NOT NULL THEN 1 ELSE 0 END AS tenant_type_column;
    `);
    const tenantTypeColumn = Boolean(tenantTypeResult.recordset[0]?.tenant_type_column);
    const legacyNameSet = new Set(LEGACY_BACKUP_TABLES.map((item) => item.table.toLowerCase()));
    const legacySource = !tenantTypeColumn || existingTables.some((table) => legacyNameSet.has(table.toLowerCase()));
    const sourceSchemaGeneration = legacySource ? 'legacy-pre-trainer' : 'modern-phase3-8';
    const coverage = getPlatformBackupCoverage({ existingTables, tenantTables, sourceSchemaGeneration });
    const globalDefinitions = PLATFORM_GLOBAL_BACKUP_TABLES.filter((definition) => existingTables.some((table) => table.toLowerCase() === definition.table.toLowerCase()));
    const tenantDefinitions = TENANT_BACKUP_TABLES.filter((definition) => existingTables.some((table) => table.toLowerCase() === definition.table.toLowerCase()));
    const legacyDefinitions = LEGACY_BACKUP_TABLES.filter((definition) => existingTables.some((table) => table.toLowerCase() === definition.table.toLowerCase()));
    const classifications = existingTables.map((table) => classifyPlatformTable(table, { hasTenantId: tenantTables.some((candidate) => candidate.toLowerCase() === table.toLowerCase()) }));
    const classificationCounts = classifications.reduce((result, item) => {
        result[item.classification] = (result[item.classification] || 0) + 1;
        return result;
    }, {});
    const trainerExpectedTables = ['saas_plan_tenant_types', 'trainer_client_profiles', 'trainer_packages', 'trainer_package_purchases', 'trainer_package_usage', 'coaching_sessions'];
    const presentTrainerTables = trainerExpectedTables.filter((table) => existingTables.some((candidate) => candidate.toLowerCase() === table));
    return {
        ...coverage,
        sourceSchemaGeneration,
        sourceSchemaCapabilities: {
            tenantTypeColumn,
            trainerSchemaPresent: presentTrainerTables.length > 0,
            presentTrainerTables,
            absentTrainerTables: trainerExpectedTables.filter((table) => !presentTrainerTables.includes(table))
        },
        definitionsByScope: {
            global: globalDefinitions,
            tenant: tenantDefinitions,
            ...(legacySource ? { legacy: legacyDefinitions } : {})
        },
        classificationCounts,
        classifications,
        existingTableCount: existingTables.length,
        tenantTableCount: tenantTables.length,
        existingTables,
        tenantTables
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
        SELECT TOP (1) id, name, slug, tenant_type, status
        FROM dbo.gym_tenants
        WHERE id=@tenantId;
    `);
    const tenant = result.recordset[0];
    if (!tenant) throw backupError('The requested gym does not exist.', 404, 'TENANT_NOT_FOUND');
    return { id: Number(tenant.id), name: tenant.name, slug: tenant.slug, tenantType: resolveTenantType(tenant.tenant_type), status: tenant.status };
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

async function decodePlatformBackupBuffer(input, { requireCompleteRegistry = true } = {}) {
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
        payload,
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
    const inspected = await decodePlatformBackupBuffer(input, { requireCompleteRegistry });
    const { payload, ...metadata } = inspected;
    return metadata;
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

function assertBackupNotExpired(record, now = Date.now()) {
    if (record?.expiresAt == null) return;
    const expiry = new Date(record.expiresAt).getTime();
    if (!Number.isFinite(expiry)) {
        throw backupError('The verified backup metadata is invalid.', 503, 'BACKUP_METADATA_INCOMPLETE');
    }
    if (expiry <= new Date(now).getTime()) {
        throw backupError('This backup has expired and is no longer available.', 410, 'BACKUP_EXPIRED');
    }
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
    assertBackupNotExpired(record);
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

async function insertTenantRows(transaction, definition, rows, metadata, { credentialHash = null, forceCredentialReset = false } = {}) {
    if (!rows.length) return;
    const columns = metadataColumns(metadata, definition.table);
    const isUserTable = definition.table === 'gym_users';
    const insertColumns = columns.filter((column) => rows.some((row) => Object.prototype.hasOwnProperty.call(row, column.name)
        || Object.prototype.hasOwnProperty.call(row, column.name.toLowerCase())));
    if (credentialHash) {
        const credentialColumns = columns.filter((column) => {
            const name = column.name.toLowerCase();
            return name === 'password_hash' || name === 'passwordhash' || name === 'must_change_password' || name === 'mustchangepassword';
        });
        for (const column of credentialColumns) {
            if (!insertColumns.includes(column)) insertColumns.push(column);
        }
    }
    if (!insertColumns.length) return;
    const quotedTable = `dbo.${quoteIdentifier(definition.table)}`;
    const quotedColumns = insertColumns.map((column) => quoteIdentifier(column.name)).join(', ');
    const usesIdentity = insertColumns.some((column) => column.isIdentity);
    try {
        for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
            const row = rows[rowIndex];
            const request = transaction.request();
            const values = insertColumns.map((column, columnIndex) => {
                const sourceKey = Object.keys(row).find((key) => key.toLowerCase() === column.name.toLowerCase());
                let value = restoreScalar(sourceKey === undefined ? null : row[sourceKey]);
                const normalizedColumnName = column.name.toLowerCase();
                if (credentialHash && (normalizedColumnName === 'password_hash' || normalizedColumnName === 'passwordhash')) value = credentialHash;
                if (credentialHash && (normalizedColumnName === 'must_change_password' || normalizedColumnName === 'mustchangepassword')) value = true;
                if (isUserTable && forceCredentialReset && normalizedColumnName === 'password_changed_at') value = null;
                const parameter = `restore_${rowIndex}_${columnIndex}`;
                if (value === null) request.input(parameter, nullParameterType(column), null);
                else request.input(parameter, value);
                return `@${parameter}`;
            });
            // Keep IDENTITY_INSERT in the same batch as the INSERT. The
            // database wrapper prefixes requests with SESSION_CONTEXT calls;
            // keeping the SET/INSERT/SET sequence together guarantees that
            // SQL Server applies it to the same session and batch.
            const identityPrefix = usesIdentity ? `SET IDENTITY_INSERT ${quotedTable} ON;` : '';
            const identitySuffix = usesIdentity ? `SET IDENTITY_INSERT ${quotedTable} OFF;` : '';
            await request.query(`${identityPrefix}INSERT INTO ${quotedTable} (${quotedColumns}) VALUES (${values.join(', ')});${identitySuffix}`);
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

function platformRestoreDefinitions({ includeExcluded = false, includeLegacy = false, existingTables = null } = {}) {
    const definitions = [
        ...PLATFORM_GLOBAL_BACKUP_TABLES.map((definition) => ({ ...definition, tenantScoped: false, restorePolicy: 'platform' })),
        ...TENANT_BACKUP_TABLES
    ];
    if (includeLegacy) definitions.push(...LEGACY_BACKUP_TABLES.map((definition) => ({
        ...definition,
        tenantScoped: false,
        restorePolicy: 'legacy'
    })));
    if (includeExcluded) definitions.push(...PLATFORM_BACKUP_EXCLUDED_TABLES.map((table) => ({
        key: `excluded:${table}`,
        table,
        tenantScoped: false,
        restorePolicy: 'rebuild'
    })));
    const existing = existingTables && new Set(existingTables.map((table) => String(table).toLowerCase()));
    const seen = new Set();
    return definitions.filter((definition) => {
        const table = String(definition.table).toLowerCase();
        if (seen.has(table) || (existing && !existing.has(table))) return false;
        seen.add(table);
        return true;
    });
}

function snapshotColumnDefinition(column) {
    const name = quoteIdentifier(snapshotIdentifier(column.name));
    if (column.computed) return `${name} AS ${snapshotExpression(column.computedDefinition, { required: true })}`;
    const type = schemaSnapshotType(column);
    let identity = '';
    if (column.identity) {
        const seed = String(column.identitySeed || '1');
        const increment = String(column.identityIncrement || '1');
        if (!/^-?\d+(?:\.\d+)?$/.test(seed) || !/^-?\d+(?:\.\d+)?$/.test(increment)) {
            throw backupError('The legacy schema identity metadata is invalid.', 400, 'PLATFORM_BACKUP_SCHEMA_SNAPSHOT_INVALID');
        }
        identity = ` IDENTITY(${seed},${increment})`;
    }
    const nullability = column.nullable ? ' NULL' : ' NOT NULL';
    const defaultName = column.defaultName ? ` CONSTRAINT ${quoteIdentifier(snapshotIdentifier(column.defaultName))}` : '';
    const defaultDefinition = column.defaultDefinition ? ` DEFAULT ${snapshotExpression(column.defaultDefinition, { required: true })}` : '';
    return `${name} ${type}${identity}${nullability}${defaultName}${defaultDefinition}`;
}

function schemaSnapshotColumns(columns) {
    return (Array.isArray(columns) ? columns : []).map((column) => quoteIdentifier(snapshotIdentifier(column))).join(',');
}

async function ensureLegacySchema(transaction, snapshot) {
    if (!snapshot) return;
    validateLegacySchemaSnapshot({ legacySchemaSnapshot: snapshot, legacySchemaSnapshotSha256: schemaSnapshotDigest(snapshot) }, Object.fromEntries((snapshot.tables || []).map((table) => [`legacy:${table.table}`, []])));
    const tables = snapshot.tables || [];
    for (const table of tables) {
        const tableName = snapshotIdentifier(table.table);
        if (!Array.isArray(table.columns) || !table.columns.length) throw backupError('The legacy schema snapshot has no columns.', 400, 'PLATFORM_BACKUP_SCHEMA_SNAPSHOT_INVALID');
        const columnSql = [...table.columns]
            .sort((left, right) => Number(left.ordinal || 0) - Number(right.ordinal || 0))
            .map(snapshotColumnDefinition)
            .join(',');
        await transaction.request().query(`
            IF OBJECT_ID(N'dbo.${tableName.replaceAll("'", "''")}', N'U') IS NULL
            BEGIN
                CREATE TABLE dbo.${quoteIdentifier(tableName)} (${columnSql});
            END;
        `);
    }
    for (const table of tables) {
        const tableName = snapshotIdentifier(table.table);
        for (const key of Array.isArray(table.primaryKeys) ? table.primaryKeys : []) {
            const constraint = snapshotIdentifier(key.name);
            const columns = schemaSnapshotColumns(key.columns);
            await transaction.request().query(`
                IF NOT EXISTS (SELECT 1 FROM sys.key_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.${tableName}') AND name=N'${constraint.replaceAll("'", "''")}')
                    ALTER TABLE dbo.${quoteIdentifier(tableName)} ADD CONSTRAINT ${quoteIdentifier(constraint)} PRIMARY KEY CLUSTERED (${columns});
            `);
        }
        for (const key of Array.isArray(table.uniqueConstraints) ? table.uniqueConstraints : []) {
            const constraint = snapshotIdentifier(key.name);
            const columns = schemaSnapshotColumns(key.columns);
            await transaction.request().query(`
                IF NOT EXISTS (SELECT 1 FROM sys.key_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.${tableName}') AND name=N'${constraint.replaceAll("'", "''")}')
                    ALTER TABLE dbo.${quoteIdentifier(tableName)} ADD CONSTRAINT ${quoteIdentifier(constraint)} UNIQUE (${columns});
            `);
        }
        for (const check of Array.isArray(table.checks) ? table.checks : []) {
            if (check.disabled) continue;
            const constraint = snapshotIdentifier(check.name);
            const definition = snapshotExpression(check.definition, { required: true });
            await transaction.request().query(`
                IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.${tableName}') AND name=N'${constraint.replaceAll("'", "''")}')
                    ALTER TABLE dbo.${quoteIdentifier(tableName)} ADD CONSTRAINT ${quoteIdentifier(constraint)} CHECK ${definition};
            `);
        }
    }
    for (const table of tables) {
        const tableName = snapshotIdentifier(table.table);
        for (const foreignKey of Array.isArray(table.foreignKeys) ? table.foreignKeys : []) {
            if (foreignKey.disabled) continue;
            const constraint = snapshotIdentifier(foreignKey.name);
            const referencedSchema = snapshotIdentifier(foreignKey.referencedSchema);
            const referencedTable = snapshotIdentifier(foreignKey.referencedTable);
            const columns = schemaSnapshotColumns(foreignKey.columns);
            const referencedColumns = schemaSnapshotColumns(foreignKey.referencedColumns);
            await transaction.request().query(`
                IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'dbo.${tableName}') AND name=N'${constraint.replaceAll("'", "''")}')
                    ALTER TABLE dbo.${quoteIdentifier(tableName)} ADD CONSTRAINT ${quoteIdentifier(constraint)} FOREIGN KEY (${columns}) REFERENCES ${quoteIdentifier(referencedSchema)}.${quoteIdentifier(referencedTable)} (${referencedColumns});
            `);
        }
    }
    for (const table of tables) {
        const tableName = snapshotIdentifier(table.table);
        for (const index of Array.isArray(table.indexes) ? table.indexes : []) {
            if (index.disabled || index.primaryKey || index.uniqueConstraint || !index.columns?.length) continue;
            const indexName = snapshotIdentifier(index.name);
            const columns = schemaSnapshotColumns(index.columns);
            const unique = index.unique ? 'UNIQUE ' : '';
            const type = String(index.type || '').toUpperCase() === 'CLUSTERED' ? 'CLUSTERED' : 'NONCLUSTERED';
            const filter = index.filterDefinition ? ` WHERE ${snapshotExpression(index.filterDefinition, { required: true })}` : '';
            await transaction.request().query(`
                IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.${tableName}') AND name=N'${indexName.replaceAll("'", "''")}')
                    CREATE ${unique}${type} INDEX ${quoteIdentifier(indexName)} ON dbo.${quoteIdentifier(tableName)} (${columns})${filter};
            `);
        }
    }
}

function assertSafePlatformRestoreTarget() {
    const target = String(process.env.DR_RESTORE_TARGET || '').trim().toLowerCase();
    if (!['local', 'test'].includes(target)) {
        throw backupError('Platform logical restore is allowed only for an explicitly named local or test target.', 403, 'PLATFORM_RESTORE_TARGET_UNSAFE');
    }
    if (config.nodeEnv === 'production' || process.env.VERCEL === '1') {
        throw backupError('Platform logical restore is disabled in production-hosted processes.', 403, 'PLATFORM_RESTORE_TARGET_UNSAFE');
    }
    if (String(process.env.DR_RESTORE_CONFIRM || '').trim().toUpperCase() !== 'YES') {
        throw backupError('Platform logical restore requires an explicit local/test confirmation.', 400, 'PLATFORM_RESTORE_CONFIRMATION_REQUIRED');
    }
    const connection = parseConnectionString(process.env.MSSQL_CONNECTION_STRING || config.mssqlConnectionString);
    const database = String(connection.database || '').trim().toLowerCase();
    const server = String(connection.server || '').trim().toLowerCase();
    const localServer = /^(localhost|127\.0\.0\.1|::1|\.|\(local\))(\\[^,]+)?$/i.test(server);
    if (!localServer || database === 'db62278' || /(^|[_-])prod(uction)?([_-]|$)/i.test(database)) {
        throw backupError('Platform logical restore requires a local SQL Server database and refuses the known Production target.', 403, 'PLATFORM_RESTORE_TARGET_UNSAFE');
    }
    return { target, database: connection.database };
}

async function verifyPlatformRestoredCounts(transaction, definitions, payload) {
    const verifiedCounts = { global: {}, tenant: {}, ...(payload.tables?.legacy ? { legacy: {} } : {}) };
    for (const scope of ['global', 'tenant', ...(payload.tables?.legacy ? ['legacy'] : [])]) {
        const scopeRows = normalizedTableMap(payload.tables?.[scope]);
        const scopeCounts = normalizedTableMap(payload.manifest?.tableCounts?.[scope]);
        const scopeDefinitions = scope === 'global'
            ? PLATFORM_GLOBAL_BACKUP_TABLES
            : scope === 'tenant' ? TENANT_BACKUP_TABLES : LEGACY_BACKUP_TABLES;
        for (const definition of scopeDefinitions) {
            if (!Object.prototype.hasOwnProperty.call(scopeRows, definition.key)) continue;
            if (!definitions.some((item) => item.table === definition.table)) {
                throw backupError('The restore target is missing a required backup table.', 503, 'RESTORE_TABLE_MISSING');
            }
            const result = await transaction.request()
                .query(`SELECT COUNT_BIG(*) AS total FROM dbo.${quoteIdentifier(definition.table)};`);
            const actual = Number(result.recordset[0]?.total || 0);
            const expected = Number(scopeCounts[definition.key] || 0);
            if (actual !== expected) throw backupError('The restored platform data failed table-count integrity validation.', 503, 'PLATFORM_RESTORE_COUNT_MISMATCH');
            verifiedCounts[scope][definition.key] = actual;
        }
    }
    return verifiedCounts;
}

async function restorePlatformBackup(input, {
    actorUserId = null,
    reason = '',
    clearTarget = false
} = {}) {
    assertPlatformScope();
    const target = assertSafePlatformRestoreTarget();
    if (clearTarget !== true) throw backupError('Platform restore must explicitly authorize clearing the isolated target.', 400, 'PLATFORM_RESTORE_CLEAR_CONFIRMATION_REQUIRED');
    const normalizedReason = String(reason || '').trim().slice(0, 1000) || 'Local/test application-level disaster recovery drill';
    const inspected = input?.payload
        ? { ...input, rowCount: input.rowCount ?? Number(input.payload.manifest?.rowCount || 0) }
        : await decodePlatformBackupBuffer(input, { requireCompleteRegistry: true });
    validatePlatformBackupPayload(inspected.payload, { requireCompleteRegistry: true });
    const legacySource = inspected.payload.manifest?.sourceSchemaGeneration === 'legacy-pre-trainer';
    await ensureRecoveryTables();

    const pool = await getPool();
    const transaction = pool.transaction();
    let committed = false;
    try {
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        await transaction.request()
            .input('lockResource', sql.NVarChar(255), 'logic-fit:platform-recovery')
            .query(`
                DECLARE @lockResult INT;
                EXEC @lockResult = sys.sp_getapplock
                    @Resource=@lockResource,
                    @LockMode='Exclusive',
                    @LockOwner='Transaction',
                    @LockTimeout=0;
                IF @lockResult < 0 THROW 51091, 'Another platform recovery operation is active.', 1;
        `);
        if (legacySource) await ensureLegacySchema(transaction, inspected.payload.manifest.legacySchemaSnapshot);
        const coverage = await getPlatformBackupCoverageStatus({ executor: transaction });
        if (coverage.status !== 'covered') throw backupError('The restore target schema is not covered by the platform backup registry.', 503, 'PLATFORM_RESTORE_COVERAGE_MISMATCH');
        const clearDefinitions = platformRestoreDefinitions({ includeExcluded: true, includeLegacy: legacySource, existingTables: coverage.existingTables });
        const restoreDefinitions = platformRestoreDefinitions({ includeLegacy: legacySource, existingTables: coverage.existingTables });
        const metadata = await loadTableMetadata(transaction, restoreDefinitions);
        const clearOrder = await loadRestoreOrder(transaction, clearDefinitions);
        for (const definition of [...clearOrder].reverse()) {
            await transaction.request().query(`DELETE FROM dbo.${quoteIdentifier(definition.table)};`);
        }
        const { hashPassword } = require('./auth-service');
        const credentialHash = await hashPassword(crypto.randomBytes(32).toString('base64url'));
        const restoreOrder = await loadRestoreOrder(transaction, restoreDefinitions);
        const globalKeys = new Set(PLATFORM_GLOBAL_BACKUP_TABLES.map((item) => item.key));
        const tenantKeys = new Set(TENANT_BACKUP_TABLES.map((item) => item.key));
        for (const definition of restoreOrder) {
            const scope = globalKeys.has(definition.key) ? 'global' : tenantKeys.has(definition.key) ? 'tenant' : 'legacy';
            const rows = inspected.payload.tables?.[scope]?.[definition.key];
            if (!rows) continue;
            await insertTenantRows(transaction, definition, rows, metadata, {
                credentialHash: ['gym_users', 'DomainUsers'].includes(definition.table) ? credentialHash : null,
                forceCredentialReset: ['gym_users', 'DomainUsers'].includes(definition.table)
            });
        }
        const verifiedCounts = await verifyPlatformRestoredCounts(transaction, restoreDefinitions, inspected.payload);
        await transaction.request()
            .input('actorUserId', sql.Int, actorUserId == null ? null : Number(actorUserId))
            .input('reason', sql.NVarChar(1000), normalizedReason)
            .input('metadata', sql.NVarChar(sql.MAX), jsonStringify({
                target: target.target,
                database: target.database,
                rowCount: inspected.rowCount,
                credentialsReset: true,
                countsVerified: true
            }))
            .query(`
                INSERT INTO dbo.gym_platform_backup_audit_log
                    (backup_id,event_type,actor_user_id,reason,result,safe_metadata_json)
                VALUES (NULL,'PLATFORM_RESTORE_COMPLETED',@actorUserId,@reason,'success',@metadata);
            `);
        await transaction.commit();
        committed = true;
        return {
            restored: true,
            target: target.target,
            database: target.database,
            generatedAt: inspected.generatedAt || inspected.payload.generatedAt || null,
            rowCount: inspected.rowCount,
            tableCounts: verifiedCounts,
            credentialsReset: true,
            integrity: inspected.integrity || { algorithm: 'sha256', verified: true }
        };
    } catch (error) {
        if (!committed) await transaction.rollback().catch(() => {});
        throw error;
    }
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
    const transaction = pool.transaction();
    let committed = false;
    let tables;
    let legacySchemaSnapshot = null;
    try {
        // A platform artifact must represent one coherent logical snapshot.
        // SERIALIZABLE prevents a tenant row from being added/deleted between
        // the registry check and the table reads. The platform RLS context is
        // still applied to every transaction request by the database wrapper.
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const coverage = await getPlatformBackupCoverageStatus({ executor: transaction });
        if (coverage.status !== 'covered') {
            throw backupError('The platform backup registry does not cover the current database schema.', 503, 'PLATFORM_BACKUP_COVERAGE_MISMATCH');
        }
        const pool = transaction;
        const definitionsByScope = coverage.definitionsByScope || { global: PLATFORM_GLOBAL_BACKUP_TABLES, tenant: TENANT_BACKUP_TABLES };
        const globalDefinitions = definitionsByScope.global || [];
        const tenantDefinitions = definitionsByScope.tenant || [];
        const legacyDefinitions = definitionsByScope.legacy || [];
        // Keep the canonical global metadata contract intact. Absent modern
        // tables are represented by empty metadata entries and are never read
        // because globalDefinitions is already filtered to the source schema.
        const globalMetadata = await loadTableMetadata(pool, PLATFORM_GLOBAL_BACKUP_TABLES);
        const tenantMetadata = await loadTableMetadata(pool, tenantDefinitions);
        const legacyMetadata = await loadTableMetadata(pool, legacyDefinitions);
        legacySchemaSnapshot = legacyDefinitions.length ? await loadSchemaSnapshot(pool, legacyDefinitions) : null;
        const globalRows = await mapWithConcurrency(globalDefinitions, async (definition) => [
            definition.key,
            await readTableRows(pool, { ...definition, tenantScoped: false }, globalMetadata, { excludeSensitive: true })
        ], 1);
        const tenantRows = await mapWithConcurrency(tenantDefinitions, async (definition) => [
            definition.key,
            await readTableRows(pool, definition, tenantMetadata, { allTenants: true, excludeSensitive: true })
        ], 1);
        const legacyRows = await mapWithConcurrency(legacyDefinitions, async (definition) => [
            definition.key,
            await readTableRows(pool, { ...definition, tenantScoped: false }, legacyMetadata, { allTenants: true, excludeSensitive: true })
        ], 1);
        tables = {
            global: Object.fromEntries(globalRows),
            tenant: Object.fromEntries(tenantRows),
            ...(legacyDefinitions.length ? { legacy: Object.fromEntries(legacyRows) } : {})
        };
        // Keep the source-schema coverage in the manifest, not in the data
        // digest. It is metadata-only and proves why absent future tables were
        // not treated as unknown legacy data.
        var sourceCoverage = {
            sourceSchemaGeneration: coverage.sourceSchemaGeneration,
            physicalTableCount: coverage.existingTableCount,
            includedTableCount: globalDefinitions.length + tenantDefinitions.length + legacyDefinitions.length,
            explicitExcludedTableCount: coverage.excludedTables.length + coverage.legacyExcludedTables.length,
            unknownTables: coverage.unclassifiedTables.length,
            unexplainedTables: coverage.unregisteredTenantTables.length,
            includedTables: [...globalDefinitions, ...tenantDefinitions, ...legacyDefinitions].map((definition) => ({ table: definition.table, classification: definition.classification || (globalDefinitions.includes(definition) ? 'GLOBAL_REQUIRED' : tenantDefinitions.includes(definition) ? 'TENANT_REQUIRED' : 'LEGACY_REQUIRED') })),
            excludedTables: [...coverage.excludedTables, ...coverage.legacyExcludedTables],
            absentModernTables: coverage.absentModernTables || [],
            absentTrainerTables: coverage.sourceSchemaCapabilities?.absentTrainerTables || []
        };
        await transaction.commit();
        committed = true;
    } catch (error) {
        if (!committed) await transaction.rollback().catch(() => {});
        throw error;
    }
    const coverage = sourceCoverage || null;
    const definitionsByScope = coverage?.sourceSchemaGeneration === 'legacy-pre-trainer'
        ? {
            global: PLATFORM_GLOBAL_BACKUP_TABLES.filter((definition) => Object.prototype.hasOwnProperty.call(tables.global || {}, definition.key)),
            tenant: TENANT_BACKUP_TABLES.filter((definition) => Object.prototype.hasOwnProperty.call(tables.tenant || {}, definition.key)),
            legacy: LEGACY_BACKUP_TABLES.filter((definition) => Object.prototype.hasOwnProperty.call(tables.legacy || {}, definition.key))
        }
        : { global: PLATFORM_GLOBAL_BACKUP_TABLES, tenant: TENANT_BACKUP_TABLES };
    const tableCounts = Object.fromEntries(Object.entries(definitionsByScope).map(([scope, definitions]) => [
        scope,
        Object.fromEntries(definitions.map((definition) => [definition.key, tables[scope]?.[definition.key]?.length || 0]))
    ]));
    const payload = {
        format: 'logic-fit-platform-backup',
        version: BACKUP_VERSION,
        backupType: 'platform-disaster-recovery',
        generatedAt: new Date(now).toISOString(),
        applicationVersion: require('../../package.json').version,
        releaseId: releaseIdentifier(),
        schemaVersion: SCHEMA_VERSION,
        manifest: buildPlatformManifest({
            tables,
            tableCounts,
            now,
            definitionsByScope,
            sourceSchemaGeneration: coverage?.sourceSchemaGeneration || 'modern-phase3-8',
            sourceSchemaCapabilities: coverage?.sourceSchemaCapabilities || null,
            coverage,
            legacySchemaSnapshot
        }),
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
    assertBackupNotExpired(record);
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
    const [tenantSummary, tenantLatest, platformSummary, platformVerified, restoreRehearsal, recentFailures, platformFailures, registryCoverage, platformCoverage] = await Promise.all([
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
        getTenantBackupCoverageStatus({ readOnly }),
        getPlatformBackupCoverageStatus({ readOnly })
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
        registryCoverage,
        platformCoverage
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
        restorePlatformBackup,
        cleanupExpiredBackups: (options = {}) => cleanupExpiredBackups({ ...options, storageService }),
        getPlatformBackupHealth: (options = {}) => getPlatformBackupHealth({ ...options, storageService }),
        getTenantBackupCoverageStatus,
        getPlatformBackupCoverageStatus,
        getDailyBackupCycleHttpStatus,
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
    buildPlatformManifest,
    buildTenantBackupArtifact,
    buildTenantBackupPayload,
    loadTableMetadata,
    loadSchemaSnapshot,
    readTableRows,
    rowsDigest,
    schemaSnapshotDigest,
    createBackupRecoveryService,
    createPlatformBackup,
    createTenantBackup,
    deletePlatformArtifactAndVerify,
    deleteTenantArtifactAndVerify,
    ensureRecoveryTables,
    getPlatformBackupHealth,
    getPlatformBackupCoverageStatus,
    getDailyBackupCycleHttpStatus,
    getTenantBackupCoverageStatus,
    inspectPlatformBackupBuffer,
    validatePlatformBackupPayload,
    validatePlatformTenantReferences,
    getPlatformBackupHistory,
    getPlatformBackupRecord,
    getPlatformBackupAudit,
    downloadPlatformBackup,
    restorePlatformBackup,
    assertBackupNotExpired,
    cleanupExpiredBackups,
    getRetentionPolicy,
    getScheduledPlatformBackupTypes,
    getTenantBackupHistory,
    getTenantBackupRecord,
    getTenantBackupAudit,
    inspectTenantBackupBuffer,
    mapWithConcurrency,
    metadataColumns,
    normalizeBackupFormat,
    normalizeRetryCount,
    payloadDigest,
    runDailyBackupCycle,
    validateTenantBackupPayload,
    verifyStoredPlatformObject,
    verifyStoredTenantObject,
    canonicalRows,
    downloadTenantBackup,
    deleteTenantBackup,
    restoreTenantBackup,
    restoreTenantBackupRecord,
    writeTenantBackupAudit,
    writePlatformBackupAudit
};
