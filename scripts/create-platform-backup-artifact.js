'use strict';

// Local/test-only helper for producing a verified platform logical DR file.
// It deliberately does not use object storage and refuses the known
// Production database. The caller supplies the connection only for this
// process; no configuration file is changed.
const fs = require('node:fs');
const path = require('node:path');
const { buildPlatformBackupArtifact } = require('../src/services/backup-recovery-service');
const { closePool } = require('../src/database');
const { parseConnectionString } = require('../src/database/pool');
const { runTenantContext } = require('../src/tenancy/tenant-context');

function assertLocalTarget() {
    const target = String(process.env.DR_BACKUP_TARGET || '').trim().toLowerCase();
    if (!['local', 'test'].includes(target)) throw new Error('DR_BACKUP_TARGET must be local or test.');
    const connection = parseConnectionString(process.env.MSSQL_CONNECTION_STRING);
    const database = String(connection.database || '').trim().toLowerCase();
    const server = String(connection.server || '').trim().toLowerCase();
    const localServer = /^(localhost|127\.0\.0\.1|::1|\.|\(local\))(\\[^,]+)?$/i.test(server);
    if (!localServer || database === 'db62278' || /(^|[_-])prod(uction)?([_-]|$)/i.test(database)) {
        throw new Error('Platform backup artifact creation requires a local SQL Server target.');
    }
    return { target, database: connection.database };
}

async function main() {
    const output = process.argv[2];
    if (!output) throw new Error('Usage: node scripts/create-platform-backup-artifact.js <output-file>');
    const target = assertLocalTarget();
    const artifact = await runTenantContext({ mode: 'platform' }, () => buildPlatformBackupArtifact({ concurrency: 1 }));
    const outputPath = path.resolve(output);
    fs.writeFileSync(outputPath, artifact.buffer, { flag: 'wx' });
    console.log(JSON.stringify({
        created: true,
        target: target.target,
        database: target.database,
        fileName: path.basename(outputPath),
        compressedBytes: artifact.buffer.length,
        rowCount: artifact.rowCount,
        tableCounts: artifact.rowCounts,
        checksumVerified: true,
        backupFormatVersion: artifact.payload.manifest.backupFormatVersion,
        requiredRestoreVersion: artifact.payload.manifest.requiredRestoreVersion
    }));
}

main().catch((error) => {
    console.error(JSON.stringify({ created: false, code: error.code || 'PLATFORM_BACKUP_ARTIFACT_FAILED', message: error.message }));
    process.exitCode = 1;
}).finally(() => closePool().catch(() => {}));
