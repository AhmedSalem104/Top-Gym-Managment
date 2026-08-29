'use strict';

// Compatibility facade for the original backup endpoints. The old service
// used a global archive and a global restore, which are not safe in a
// multi-tenant database. New callers should use backup-recovery-service.
const { getPool, sql } = require('../database');
const { ensureExpensesTable } = require('./finance-service');
const { ensurePaymentTransactionsTable } = require('./member-service');
const { ensureAttendanceTable } = require('./attendance-service');
const { prepareLibraryData } = require('./library-service');
const { ensureCoachingTables } = require('./coaching-service');
const { ensureDayPassTables } = require('../repositories/day-pass.repository');
const { ensureStoreTables } = require('./store-service');
const { ensureBrandingTables } = require('./branding-service');
const { getSafeErrorMessage } = require('../utils/error-response');
const { getTenantContext } = require('../tenancy/tenant-context');
const { buildTenantBackupArtifact, inspectTenantBackupBuffer } = require('./backup-recovery-service');

function safeOperationalError(error, fallback = 'Backup operation failed.') {
    const statusCode = Number(error?.statusCode);
    if (statusCode >= 400 && statusCode < 500 && error?.expose === true) {
        return getSafeErrorMessage(error, statusCode);
    }
    return fallback;
}

async function ensureBackupOperationsTable({ readOnly = false } = {}) {
    if (readOnly || getTenantContext()?.readOnlyBaseline) return;
    await (await getPool()).request().batch(`
        IF OBJECT_ID(N'dbo.gym_backup_operations', N'U') IS NULL
        BEGIN
            CREATE TABLE dbo.gym_backup_operations (
                id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_backup_operations PRIMARY KEY,
                operation_type VARCHAR(20) NOT NULL,
                file_name NVARCHAR(260) NULL,
                source_generated_at DATETIME2(0) NULL,
                row_count INT NOT NULL CONSTRAINT DF_gym_backup_operations_rows DEFAULT (0),
                table_counts NVARCHAR(MAX) NULL,
                status VARCHAR(20) NOT NULL CONSTRAINT DF_gym_backup_operations_status DEFAULT ('success'),
                details NVARCHAR(1000) NULL,
                created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_backup_operations_created DEFAULT (SYSUTCDATETIME()),
                CONSTRAINT CK_gym_backup_operations_type CHECK (operation_type IN ('download', 'inspect', 'restore')),
                CONSTRAINT CK_gym_backup_operations_status CHECK (status IN ('success', 'failed'))
            );
        END;
        IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_gym_backup_operations_created' AND object_id=OBJECT_ID(N'dbo.gym_backup_operations'))
            CREATE INDEX IX_gym_backup_operations_created ON dbo.gym_backup_operations(created_at DESC, id DESC);
    `);
}

async function ensureBackupArchivesTable({ readOnly = false } = {}) {
    if (readOnly || getTenantContext()?.readOnlyBaseline) return;
    await (await getPool()).request().batch(`
        IF OBJECT_ID(N'dbo.gym_backup_archives', N'U') IS NULL
        BEGIN
            CREATE TABLE dbo.gym_backup_archives (
                id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_backup_archives PRIMARY KEY,
                backup_day DATE NOT NULL,
                file_name NVARCHAR(260) NOT NULL,
                backup_format VARCHAR(10) NOT NULL,
                generated_at DATETIME2(0) NOT NULL,
                content VARBINARY(MAX) NOT NULL,
                content_bytes BIGINT NOT NULL,
                row_count INT NOT NULL CONSTRAINT DF_gym_backup_archives_rows DEFAULT (0),
                table_counts NVARCHAR(MAX) NULL,
                created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_backup_archives_created DEFAULT (SYSUTCDATETIME()),
                CONSTRAINT CK_gym_backup_archives_format CHECK (backup_format IN ('json.gz', 'bak')),
                CONSTRAINT UQ_gym_backup_archives_day_format UNIQUE (backup_day, backup_format)
            );
        END;
        IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_gym_backup_archives_created' AND object_id=OBJECT_ID(N'dbo.gym_backup_archives'))
            CREATE INDEX IX_gym_backup_archives_created ON dbo.gym_backup_archives(created_at DESC, id DESC);
    `);
}

function totalRows(tableCounts = {}) {
    return Object.values(tableCounts).reduce((sum, value) => sum + Number(value || 0), 0);
}

async function recordBackupOperation({ operationType, fileName = null, sourceGeneratedAt = null, tableCounts = {}, status = 'success', details = null, readOnly = false } = {}) {
    // Manual downloads and all other GET paths remain side-effect free.
    if (readOnly || getTenantContext()?.readOnlyBaseline) return false;
    await ensureBackupOperationsTable();
    await (await getPool()).request()
        .input('operationType', sql.VarChar(20), operationType)
        .input('fileName', sql.NVarChar(260), String(fileName || '').slice(0, 260) || null)
        .input('sourceGeneratedAt', sql.DateTime2(0), sourceGeneratedAt ? new Date(sourceGeneratedAt) : null)
        .input('rowCount', sql.Int, totalRows(tableCounts))
        .input('tableCounts', sql.NVarChar(sql.MAX), JSON.stringify(tableCounts))
        .input('status', sql.VarChar(20), status)
        .input('details', sql.NVarChar(1000), String(details || '').slice(0, 1000) || null)
        .query(`INSERT INTO dbo.gym_backup_operations
                    (operation_type,file_name,source_generated_at,row_count,table_counts,status,details)
                VALUES (@operationType,@fileName,@sourceGeneratedAt,@rowCount,@tableCounts,@status,@details);`);
    return true;
}

// The legacy global tables have no tenant ownership metadata. They are not
// exposed through the new routes; returning an empty list avoids leaking old
// cross-tenant records while preserving the compatibility method signature.
async function getBackupHistory() { return []; }
async function getScheduledBackupHistory() { return []; }

function legacyArchiveError() {
    const error = new Error('Legacy global backup archives are no longer available.');
    error.statusCode = 410;
    error.expose = true;
    error.code = 'LEGACY_BACKUP_ARCHIVE_UNSUPPORTED';
    return error;
}

async function getBackupArchive() { throw legacyArchiveError(); }
async function deleteBackupArchive() { throw legacyArchiveError(); }
async function createScheduledBackupArchive() { throw legacyArchiveError(); }

async function inspectBackupBuffer(input, { expectedTenantId = null } = {}) {
    return inspectTenantBackupBuffer(input, { expectedTenantId });
}

// Keep this method for callers that still use the old direct download route,
// but delegate all reads to the tenant-scoped, explicit-column engine. The
// readOnly guards below are intentionally retained to protect the route from
// schema/seed side effects and to preserve the read-only safety contract.
async function createBackup({ format = 'json.gz', readOnly = false } = {}) {
    const backupFormat = String(format).toLowerCase() === 'bak' ? 'bak' : 'json.gz';
    await ensureExpensesTable({ readOnly });
    await ensurePaymentTransactionsTable({ readOnly });
    await ensureAttendanceTable({ readOnly });
    await prepareLibraryData({ readOnly });
    await ensureCoachingTables({ readOnly });
    await ensureDayPassTables({ readOnly });
    await ensureStoreTables({ readOnly });
    await ensureBrandingTables({ readOnly });
    const backup = await buildTenantBackupArtifact({ format: backupFormat });
    return {
        buffer: backup.buffer,
        format: backup.format,
        backupDay: backup.backupDay,
        filename: backup.filename,
        generatedAt: backup.generatedAt,
        rowCounts: backup.rowCounts
    };
}

// Global restore was intentionally removed. The controller uses the logical
// tenant restore service, which validates tenant ownership and creates a
// pre-restore safety backup before any tenant rows are changed.
async function restoreBackup() {
    const error = new Error('Global backup restore is disabled; restore a verified tenant backup instead.');
    error.statusCode = 410;
    error.expose = true;
    error.code = 'GLOBAL_BACKUP_RESTORE_DISABLED';
    throw error;
}

module.exports = {
    createBackup,
    createScheduledBackupArchive,
    deleteBackupArchive,
    ensureBackupOperationsTable,
    ensureBackupArchivesTable,
    getBackupArchive,
    getBackupHistory,
    getScheduledBackupHistory,
    inspectBackupBuffer,
    recordBackupOperation,
    restoreBackup,
    safeOperationalError
};
