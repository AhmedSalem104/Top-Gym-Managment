'use strict';

// VPS entrypoint. It reuses the verified application-level DR scheduler and
// private object-storage contract; it does not create a second backup system.
// Install it only after the VPS path/storage provider has been inspected.
require('dotenv').config();

const { closePool, getPool } = require('../src/database');
const { runTenantContext } = require('../src/tenancy/tenant-context');
const { createBackupRecoveryService } = require('../src/services/backup-recovery-service');
const { createConfiguredObjectStorageService } = require('../src/services/object-storage-service');
const { acquireJobLock, writeJobResult } = require('./server-job-utils');

async function main() {
    const release = await acquireJobLock('backup');
    try {
        const storage = createConfiguredObjectStorageService({ nodeEnv: process.env.NODE_ENV || 'production', isVercel: false });
        if (!storage.isConfigured) {
            const error = new Error('Private backup storage is not configured.');
            error.code = 'BACKUP_STORAGE_NOT_CONFIGURED';
            throw error;
        }
        // A platform context is required so the scheduler can enumerate all
        // eligible tenants without inheriting a web request tenant.
        const result = await runTenantContext({ mode: 'platform', tenantId: null }, async () => {
            const service = createBackupRecoveryService({ storageService: storage });
            return service.runDailyBackupCycle();
        });
        const failed = Number(result.tenantFailed || 0) + (result.platform?.status === 'failed' ? 1 : 0) + Number(result.retention?.failed || 0);
        writeJobResult({
            job: 'backup',
            status: failed === 0 ? 'success' : 'failed',
            eligibleTenants: result.eligibleTenants,
            tenantSucceeded: result.tenantSucceeded,
            tenantFailed: result.tenantFailed,
            failed,
            platformStatus: result.platform?.status || null,
            retentionDeleted: result.retention?.deleted || 0,
            providerStatus: result.providerStatus || storage.providerStatus
        });
        if (failed > 0) process.exitCode = 1;
    } finally {
        await release();
    }
}

main().catch((error) => {
    writeJobResult({ job: 'backup', status: 'failed', code: error.code || 'BACKUP_JOB_FAILED', message: error.message });
    process.exitCode = 1;
}).finally(() => closePool().catch(() => {}));
