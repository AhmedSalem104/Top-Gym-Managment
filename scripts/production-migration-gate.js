'use strict';

require('dotenv').config();

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { closePool, getPool } = require('../src/database');
const { runTenantContext } = require('../src/tenancy/tenant-context');
const { migrateOnly } = require('./migrate-tenancy');
const { auditMigrationText, parseMigrationVersion } = require('./audit-database-readiness');
const { tenantSecuritySnapshotIsReady, getTenantSecuritySnapshot } = require('../src/services/tenant-service');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'database', 'migration-manifest.json');
const HISTORY_TABLE = 'dbo.__TenantEFMigrationsHistory';
const PRODUCTION_CONFIRMATION = 'I_UNDERSTAND_PRODUCTION_MIGRATION';
const FORBIDDEN_VERSIONS = new Set(['029', '030']);

function fail(message, code = 'PRODUCTION_MIGRATION_GATE_FAILED') {
    const error = new Error(message);
    error.code = code;
    throw error;
}

function parseArgs(argv = process.argv.slice(2)) {
    if (argv.includes('--plan') && argv.includes('--apply')) fail('Migration gate mode is ambiguous.', 'MIGRATION_GATE_ARGUMENT_INVALID');
    const mode = argv.includes('--apply') ? 'apply' : 'plan';
    const expectedIndex = argv.indexOf('--expected-pending');
    if (expectedIndex >= 0 && (!argv[expectedIndex + 1] || String(argv[expectedIndex + 1]).startsWith('--'))) fail('Expected pending migration versions are missing.', 'MIGRATION_GATE_ARGUMENT_INVALID');
    const expected = expectedIndex >= 0 ? String(argv[expectedIndex + 1]).split(',').map((value) => value.trim()).filter(Boolean) : [];
    if (expected.some((value) => !/^\d{3}$/.test(value))) fail('Expected migration versions are invalid.', 'MIGRATION_GATE_ARGUMENT_INVALID');
    const known = new Set(['--plan', '--apply', '--json', '--expected-pending']);
    for (let index = 0; index < argv.length; index += 1) {
        if (argv[index] === '--expected-pending') {
            index += 1;
            continue;
        }
        if (!known.has(argv[index])) fail('Unknown migration gate argument.', 'MIGRATION_GATE_ARGUMENT_INVALID');
    }
    return { mode, expected, json: argv.includes('--json') };
}

function loadManifest() {
    let manifest;
    try {
        manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    } catch (_) {
        fail('Migration manifest is unavailable.', 'MIGRATION_MANIFEST_MISSING');
    }
    if (!manifest || manifest.schemaVersion !== 1 || !manifest.migrations || typeof manifest.migrations !== 'object') {
        fail('Migration manifest is invalid.', 'MIGRATION_MANIFEST_INVALID');
    }
    return manifest;
}

function discoverMigrations() {
    const directory = path.join(ROOT, 'database', 'migrations');
    const files = fs.readdirSync(directory)
        .filter((fileName) => fileName.toLowerCase().endsWith('.sql'))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const seenVersions = new Set();
    return files.map((fileName) => {
        const version = parseMigrationVersion(fileName);
        if (version == null) fail(`Migration filename is invalid: ${fileName}`, 'MIGRATION_FILENAME_INVALID');
        const normalizedVersion = String(version).padStart(3, '0');
        if (seenVersions.has(normalizedVersion)) fail(`Duplicate migration version: ${normalizedVersion}`, 'MIGRATION_VERSION_DUPLICATE');
        seenVersions.add(normalizedVersion);
        const source = fs.readFileSync(path.join(directory, fileName), 'utf8');
        const checksum = crypto.createHash('sha256').update(source).digest('hex');
        return { fileName, version: normalizedVersion, path: path.join(directory, fileName), source, checksum };
    });
}

function classifyMigration(migration, manifestEntry) {
    if (!manifestEntry) return { classification: 'REQUIRES_REVIEW', reason: 'manifest_entry_missing' };
    if (manifestEntry.version !== migration.version || manifestEntry.checksum !== migration.checksum) {
        return { classification: 'BLOCKED', reason: 'manifest_checksum_mismatch' };
    }
    const audit = auditMigrationText(migration.fileName, migration.source);
    if (audit.status !== 'PASS') return { classification: 'REQUIRES_REVIEW', reason: 'static_sql_audit_failed', findings: audit.findings };
    if (manifestEntry.destructive === true || manifestEntry.requiresMaintenanceMode === true || manifestEntry.transactional !== true || manifestEntry.backwardCompatible !== true) {
        return { classification: 'REQUIRES_REVIEW', reason: 'migration_metadata_requires_review' };
    }
    if (manifestEntry.requiresBackup !== true) return { classification: 'BLOCKED', reason: 'backup_gate_not_declared' };
    return { classification: 'SAFE_AUTOMATIC', reason: 'reviewed_additive_transactional_migration', rlsImpact: Boolean(manifestEntry.rlsImpact) };
}

async function readAppliedMigrations(pool) {
    const existence = await pool.request().query(`
        SELECT CASE WHEN OBJECT_ID(N'${HISTORY_TABLE}', N'U') IS NULL THEN 0 ELSE 1 END AS present;
    `);
    if (Number(existence.recordset[0]?.present) !== 1) fail('Production migration ledger is missing; refusing to infer history from filenames.', 'MIGRATION_LEDGER_MISSING');
    const result = await pool.request().query(`SELECT MigrationId,ProductVersion FROM ${HISTORY_TABLE};`);
    return new Map(result.recordset.map((row) => [String(row.MigrationId), String(row.ProductVersion || '')]));
}

async function buildMigrationPlan({ expected = [] } = {}) {
    const manifest = loadManifest();
    const migrations = discoverMigrations();
    const applied = await runTenantContext({ mode: 'platform', tenantId: 1, readOnlyBaseline: true }, async () => readAppliedMigrations(await getPool()));
    const pending = [];
    for (const migration of migrations) {
        if (applied.has(migration.fileName)) continue;
        const entry = manifest.migrations[migration.fileName];
        const safety = classifyMigration(migration, entry);
        if (FORBIDDEN_VERSIONS.has(migration.version)) fail(`Forbidden historical migration is pending: ${migration.version}`, 'FORBIDDEN_MIGRATION_PENDING');
        if (safety.classification !== 'SAFE_AUTOMATIC') fail(`Pending migration ${migration.fileName} is not safe for automatic execution.`, 'MIGRATION_REQUIRES_REVIEW');
        pending.push({
            id: migration.fileName,
            version: migration.version,
            checksum: migration.checksum,
            classification: safety.classification,
            rlsImpact: safety.rlsImpact
        });
    }
    if (expected.length && pending.length && pending.some((migration) => !expected.includes(migration.version))) {
        fail('Pending migrations differ from the explicitly expected release set.', 'UNEXPECTED_PENDING_MIGRATION');
    }
    return {
        status: 'PASS',
        ledger: 'verified',
        migrationsInGit: migrations.length,
        appliedCount: applied.size,
        pending
    };
}

async function applyPendingMigrations({ expected = [] } = {}) {
    if (String(process.env.MIGRATION_ENV || '').trim().toLowerCase() !== 'production') fail('Production migration requires MIGRATION_ENV=production.', 'MIGRATION_TARGET_INVALID');
    if (String(process.env.MIGRATION_PRODUCTION_CONFIRM || '').trim() !== PRODUCTION_CONFIRMATION) fail('Production migration requires explicit confirmation.', 'MIGRATION_CONFIRMATION_MISSING');
    if (String(process.env.RELEASE_MIGRATION_APPLY_CONFIRM || '').trim() !== 'YES') fail('Release migration apply confirmation is missing.', 'MIGRATION_APPLY_CONFIRMATION_MISSING');
    const plan = await buildMigrationPlan({ expected });
    const applied = [];
    for (const migration of plan.pending) {
        const entry = loadManifest().migrations[migration.id];
        const result = await migrateOnly({
            id: migration.id,
            version: migration.version,
            path: path.join(ROOT, 'database', 'migrations', migration.id),
            excluded: [...FORBIDDEN_VERSIONS].filter((version) => version !== migration.version).map((version) => `${version}.sql`)
        });
        applied.push({ id: migration.id, version: migration.version, checksum: entry.checksum, executed: result.executedMigrations.length === 1 });
    }
    const finalPlan = await buildMigrationPlan({ expected });
    if (finalPlan.pending.length) fail('Pending migrations remain after execution.', 'MIGRATION_LEDGER_INCOMPLETE');
    return { status: 'PASS', applied, pending: finalPlan.pending, ledger: 'verified' };
}

async function main() {
    const args = parseArgs();
    const expected = args.expected;
    const result = args.mode === 'apply' ? await applyPendingMigrations({ expected }) : await buildMigrationPlan({ expected });
    process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (require.main === module) {
    main()
        .catch((error) => {
            process.stderr.write(`${JSON.stringify({ status: 'FAIL', code: error.code || 'PRODUCTION_MIGRATION_GATE_FAILED' })}\n`);
            process.exitCode = 1;
        })
        .finally(() => closePool().catch(() => {}));
}

module.exports = { applyPendingMigrations, buildMigrationPlan, classifyMigration, discoverMigrations, loadManifest, parseArgs };
