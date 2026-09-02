'use strict';

// Local/test-only application-level platform DR restore drill. The service
// performs the destructive operation only after validating the artifact and
// the explicit local/test target guard. Never point this helper at Production.
const fs = require('node:fs');
const path = require('node:path');
const { restorePlatformBackup } = require('../src/services/backup-recovery-service');
const { closePool } = require('../src/database');
const { runTenantContext } = require('../src/tenancy/tenant-context');

async function main() {
    const input = process.argv[2];
    if (!input) throw new Error('Usage: node scripts/restore-platform-backup.js <verified-platform-artifact.json.gz>');
    const buffer = fs.readFileSync(path.resolve(input));
    const result = await runTenantContext({ mode: 'platform' }, () => restorePlatformBackup(buffer, {
        reason: 'Local/test application-level disaster recovery restore drill',
        clearTarget: true
    }));
    console.log(JSON.stringify({
        restored: result.restored,
        target: result.target,
        database: result.database,
        generatedAt: result.generatedAt,
        rowCount: result.rowCount,
        tableCounts: result.tableCounts,
        credentialsReset: result.credentialsReset,
        integrity: result.integrity
    }));
}

main().catch((error) => {
    console.error(JSON.stringify({ restored: false, code: error.code || 'PLATFORM_RESTORE_FAILED', message: error.message }));
    process.exitCode = 1;
}).finally(() => closePool().catch(() => {}));
