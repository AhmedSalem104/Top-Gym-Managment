'use strict';

// Build a platform logical DR artifact from the currently deployed legacy
// Production database. This path is deliberately read-only: it does not
// claim a backup record, write audit metadata, or initialize schema.
const fs = require('node:fs');
const crypto = require('node:crypto');
const dotenv = require('dotenv');

let stage = 'validate-input';

async function main() {
    if (process.env.DR_PRODUCTION_READ_ONLY_CONFIRM !== 'YES') throw new Error('Explicit read-only confirmation is required.');
    if (process.env.DR_PRODUCTION_ARTIFACT_CONFIRM !== 'READ_ONLY') throw new Error('Explicit read-only artifact confirmation is required.');
    if (process.env.DR_PRODUCTION_ENV_FILE) dotenv.config({ path: process.env.DR_PRODUCTION_ENV_FILE, override: true, quiet: true });
    if (process.env.VERCEL_ENV !== 'production' && !process.env.DR_PRODUCTION_ENV_FILE) throw new Error('Production environment injection is required.');
    const outputPath = String(process.env.DR_PRODUCTION_ARTIFACT_OUTPUT || '').trim();
    if (!outputPath) throw new Error('An explicit local artifact output path is required.');

    stage = 'load-services';
    const { closePool } = require('../src/database');
    const { runTenantContext } = require('../src/tenancy/tenant-context');
    const { buildPlatformBackupArtifact } = require('../src/services/backup-recovery-service');
    stage = 'read-production';
    const artifact = await runTenantContext({ mode: 'platform', readOnlyBaseline: true }, () => buildPlatformBackupArtifact({ concurrency: 1 }));
    stage = 'write-independent-copy';
    fs.writeFileSync(outputPath, artifact.buffer, { flag: 'wx', mode: 0o600 });
    const checksum = crypto.createHash('sha256').update(artifact.buffer).digest('hex');
    console.log(JSON.stringify({
        operation: 'READ_ONLY_PRODUCTION_ARTIFACT',
        database: 'db62278',
        artifact: 'platform-disaster-recovery-v3',
        sourceSchemaGeneration: artifact.payload.manifest.sourceSchemaGeneration,
        sourceTenantTypeColumn: Boolean(artifact.payload.manifest.sourceSchemaCapabilities?.tenantTypeColumn),
        trainerSchemaPresent: Boolean(artifact.payload.manifest.sourceSchemaCapabilities?.trainerSchemaPresent),
        physicalTableCount: artifact.payload.manifest.coverage?.physicalTableCount ?? null,
        includedTableCount: artifact.payload.manifest.coverage?.includedTableCount ?? null,
        explicitExcludedTableCount: artifact.payload.manifest.coverage?.explicitExcludedTableCount ?? null,
        unknownTables: artifact.payload.manifest.coverage?.unknownTables ?? null,
        unexplainedTables: artifact.payload.manifest.coverage?.unexplainedTables ?? null,
        rowCount: artifact.rowCount,
        sizeBytes: artifact.buffer.length,
        checksum,
        outputPath
    }));
    await closePool();
}

main().catch((error) => {
    const safeMessage = String(error.message || '').replace(/(?:password|pwd|user id|userid|uid|connection string|server=|database=)[^;\s]*/gi, '[redacted]').slice(0, 300);
    console.error(JSON.stringify({ status: 'PRODUCTION_ARTIFACT_FAILED', stage, code: error.code || 'UNKNOWN', message: safeMessage }));
    process.exitCode = 1;
});
