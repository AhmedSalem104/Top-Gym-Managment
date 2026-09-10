'use strict';

require('dotenv').config();

const { closePool, getPool, sql } = require('../src/database');
const { runTenantContext } = require('../src/tenancy/tenant-context');
const { createBackupRecoveryService } = require('../src/services/backup-recovery-service');
const { createConfiguredObjectStorageService } = require('../src/services/object-storage-service');

async function verifyProductionBackup() {
    if (String(process.env.PRODUCTION_BACKUP_VERIFY_CONFIRM || '').trim() !== 'YES') {
        const error = new Error('Production backup verification requires explicit confirmation.');
        error.code = 'BACKUP_VERIFY_CONFIRMATION_MISSING';
        throw error;
    }
    const startedAt = new Date(String(process.env.BACKUP_STARTED_AT || ''));
    if (Number.isNaN(startedAt.getTime())) {
        const error = new Error('Backup verification requires a valid start marker.');
        error.code = 'BACKUP_START_MARKER_INVALID';
        throw error;
    }
    return runTenantContext({ mode: 'platform', tenantId: null, readOnlyBaseline: true }, async () => {
        const pool = await getPool();
        const row = (await pool.request().input('startedAt', sql.DateTime2(3), startedAt).query(`
            SELECT TOP (1) id,status,size_bytes,checksum_sha256,verified_at,created_at
            FROM dbo.gym_platform_backup_records
            WHERE backup_type='platform_daily' AND status='VERIFIED'
              AND (
                created_at>=@startedAt
                OR started_at>=@startedAt
                OR updated_at>=@startedAt
                OR (backup_day=CONVERT(date,SYSUTCDATETIME()) AND verified_at>=DATEADD(hour,-24,SYSUTCDATETIME()))
              )
            ORDER BY verified_at DESC,updated_at DESC,created_at DESC,id DESC;
        `)).recordset[0];
        if (!row || !row.verified_at || Number(row.size_bytes || 0) <= 0 || !/^[a-f0-9]{64}$/i.test(String(row.checksum_sha256 || ''))) {
            const error = new Error('A newly verified platform backup record was not found.');
            error.code = 'BACKUP_VERIFICATION_RECORD_MISSING';
            throw error;
        }
        const storage = createConfiguredObjectStorageService({
            nodeEnv: process.env.NODE_ENV || 'production',
            isVercel: false
        });
        if (!storage.isConfigured) {
            const error = new Error('Configured private backup storage is unavailable.');
            error.code = 'BACKUP_STORAGE_NOT_CONFIGURED';
            throw error;
        }
        const service = createBackupRecoveryService({ storageService: storage });
        // downloadPlatformBackup re-reads the private object and hashes its
        // bytes before returning; the body is discarded immediately.
        await service.downloadPlatformBackup(Number(row.id), { readOnly: true, auditDownload: false });
        const health = await service.getPlatformBackupHealth({ readOnly: true });
        if (health.summary.missingToday !== 0 || health.summary.failedToday !== 0 || health.lastVerifiedPlatformBackup?.status !== 'VERIFIED') {
            const error = new Error('Backup coverage or verification health is incomplete.');
            error.code = 'BACKUP_COVERAGE_INCOMPLETE';
            throw error;
        }
        return {
            status: 'PASS',
            backupRecordVerified: true,
            checksumVerified: true,
            sizeBytes: Number(row.size_bytes),
            verifiedAt: row.verified_at,
            eligibleTenants: health.summary.eligibleTenants,
            missingToday: health.summary.missingToday,
            failedToday: health.summary.failedToday,
            providerStatus: storage.providerStatus
        };
    });
}

if (require.main === module) {
    verifyProductionBackup()
        .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
        .catch((error) => {
            process.stderr.write(`${JSON.stringify({ status: 'FAIL', code: error.code || 'PRODUCTION_BACKUP_VERIFY_FAILED' })}\n`);
            process.exitCode = 1;
        })
        .finally(() => closePool().catch(() => {}));
}

module.exports = { verifyProductionBackup };
