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

const BACKUP_HEAP_MB = 640;

function relaunchWithBoundedBackupHeap() {
    const hasHeapLimit = process.execArgv.some((argument) => /^--max-old-space-size=\d+$/.test(argument))
        || /(?:^|\s)--max-old-space-size=\d+(?:\s|$)/.test(String(process.env.NODE_OPTIONS || ''));
    if (hasHeapLimit || process.env.LOGIC_FIT_BACKUP_HEAP_REEXEC === '1') return false;
    const { spawnSync } = require('node:child_process');
    const result = spawnSync(process.execPath, [
        `--max-old-space-size=${BACKUP_HEAP_MB}`,
        __filename,
        ...process.argv.slice(2)
    ], {
        stdio: 'inherit',
        env: { ...process.env, LOGIC_FIT_BACKUP_HEAP_REEXEC: '1' }
    });
    if (result.error) {
        process.stderr.write('BACKUP_HEAP_REEXEC_FAILED\n');
        process.exitCode = 1;
    } else {
        process.exitCode = Number.isInteger(result.status) ? result.status : 1;
    }
    return true;
}

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

if (relaunchWithBoundedBackupHeap()) {
    process.exit(process.exitCode || 0);
} else {
    main().catch((error) => {
        writeJobResult({ job: 'backup', status: 'failed', code: error.code || 'BACKUP_JOB_FAILED', message: error.message });
        process.exitCode = 1;
    }).finally(() => closePool().catch(() => {}));
}
