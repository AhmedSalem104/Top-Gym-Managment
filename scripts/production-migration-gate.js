'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const CONTROL_ROOT = path.resolve(__dirname, '..');
const APP_ROOT = path.resolve(process.env.RELEASE_APP_ROOT || CONTROL_ROOT);
const MIGRATIONS_DIR = path.resolve(process.env.RELEASE_MIGRATIONS_DIR || path.join(APP_ROOT, 'database', 'migrations'));
const MANIFEST_PATH = path.resolve(process.env.RELEASE_MANIFEST_PATH || path.join(APP_ROOT, 'database', 'migration-manifest.json'));
const { closePool, getPool, sql } = require(path.join(APP_ROOT, 'src', 'database'));
const { runTenantContext } = require(path.join(APP_ROOT, 'src', 'tenancy', 'tenant-context'));
const { auditMigrationText, parseMigrationVersion } = require(path.join(CONTROL_ROOT, 'scripts', 'audit-database-readiness'));
const tenantService = require(path.join(APP_ROOT, 'src', 'services', 'tenant-service'));
const { tenantSecuritySnapshotIsReady, getTenantSecuritySnapshot } = tenantService;
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
    const files = fs.readdirSync(MIGRATIONS_DIR)
        .filter((fileName) => fileName.toLowerCase().endsWith('.sql'))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const seenVersions = new Set();
    return files.map((fileName) => {
        const version = parseMigrationVersion(fileName);
        if (version == null) fail(`Migration filename is invalid: ${fileName}`, 'MIGRATION_FILENAME_INVALID');
        const normalizedVersion = String(version).padStart(3, '0');
        if (seenVersions.has(normalizedVersion)) fail(`Duplicate migration version: ${normalizedVersion}`, 'MIGRATION_VERSION_DUPLICATE');
        seenVersions.add(normalizedVersion);
        const source = fs.readFileSync(path.join(MIGRATIONS_DIR, fileName), 'utf8');
        const checksum = crypto.createHash('sha256').update(source).digest('hex');
        return { fileName, version: normalizedVersion, path: path.join(MIGRATIONS_DIR, fileName), source, checksum };
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

async function resolveExistingBootstrapTenant(pool) {
    const result = await pool.request()
        .input('slug', sql.VarChar(80), 'top-gym')
        .query(`
            SELECT TOP (1) id
            FROM dbo.gym_tenants
            WHERE slug=@slug AND status IN ('trial','active','suspended','expired')
            ORDER BY id ASC;
        `);
    const tenantId = Number(result.recordset[0]?.id || 0);
    if (!Number.isInteger(tenantId) || tenantId <= 0) fail('Existing bootstrap tenant could not be resolved.', 'MIGRATION_BOOTSTRAP_TENANT_MISSING');
    return tenantId;
}

async function assertMigrationLedgerExists(pool) {
    const result = await pool.request().query(`
        SELECT CASE WHEN OBJECT_ID(N'${HISTORY_TABLE}', N'U') IS NULL THEN 0 ELSE 1 END AS present;
    `);
    if (Number(result.recordset[0]?.present) !== 1) fail('Production migration ledger is missing; refusing to create it during a release.', 'MIGRATION_LEDGER_MISSING');
}

async function recordMigrationHistory(executor, migrationId) {
    await executor.request()
        .input('migrationId', sql.NVarChar(150), migrationId)
        .input('productVersion', sql.NVarChar(64), 'logic-fit-production-release')
        .query(`
            IF NOT EXISTS (SELECT 1 FROM ${HISTORY_TABLE} WHERE MigrationId=@migrationId)
                INSERT INTO ${HISTORY_TABLE}(MigrationId,ProductVersion)
                VALUES (@migrationId,@productVersion);
        `);
}

async function applyMigrationUnit(migration) {
    const pool = await getPool();
    await assertMigrationLedgerExists(pool);
    const tenantId = await resolveExistingBootstrapTenant(pool);
    return runTenantContext({ mode: 'platform', tenantId, readOnlyBaseline: false }, async () => {
        const transaction = pool.rawTransaction();
        let committed = false;
        try {
            await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
            if (await hasMigrationHistory(transaction, migration.id)) {
                await transaction.rollback();
                const snapshot = await getTenantSecuritySnapshot(pool);
                return {
                    only: migration.version,
                    migration: migration.id,
                    executedMigrations: [],
                    skippedMigrations: [migration.id],
                    excludedMigrations: [],
                    registryRlsRebuilt: false,
                    tenantReady: tenantSecuritySnapshotIsReady(snapshot)
                };
            }
            await transaction.request().batch(`
                EXEC sys.sp_set_session_context @key=N'tenant_id', @value=${tenantId};
                EXEC sys.sp_set_session_context @key=N'tenant_mode', @value=N'platform';
            `);
            await transaction.request().batch(migration.source);
            await tenantService.ensureTenantColumnsAndRls(tenantId, { executor: transaction });
            await recordMigrationHistory(transaction, migration.id);
            await transaction.commit();
            committed = true;
        } catch (error) {
            if (!committed) await transaction.rollback().catch(() => {});
            throw error;
        }
        const snapshot = await getTenantSecuritySnapshot(pool);
        return {
            only: migration.version,
            migration: migration.id,
            executedMigrations: [migration.id],
            skippedMigrations: [],
            excludedMigrations: [],
            registryRlsRebuilt: true,
            tenantReady: tenantSecuritySnapshotIsReady(snapshot)
        };
    });
}

async function buildMigrationPlan({ expected = [] } = {}) {
    const manifest = loadManifest();
    const migrations = discoverMigrations();
    const applied = await runTenantContext({ mode: 'platform', tenantId: 1, readOnlyBaseline: true }, async () => readAppliedMigrations(await getPool()));
    const managedNames = new Set(Object.keys(manifest.migrations));
    const managedVersions = migrations
        .filter((migration) => managedNames.has(migration.fileName))
        .map((migration) => Number(migration.version));
    const highestManagedVersion = managedVersions.length ? Math.max(...managedVersions) : 0;
    const unmanifestedFuture = migrations.find((migration) => Number(migration.version) > highestManagedVersion && !managedNames.has(migration.fileName));
    if (unmanifestedFuture) fail(`Migration ${unmanifestedFuture.fileName} is not registered in the release manifest.`, 'MIGRATION_MANIFEST_ENTRY_MISSING');
    const pending = [];
    // The manifest is the version-controlled safety allow-list for the
    // current release scope. Older migrations remain in Git for historical
    // reference but are not rediscovered as new work; the ledger remains the
    // only source of truth for whether a managed migration was applied.
    for (const migration of migrations.filter((item) => managedNames.has(item.fileName))) {
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
    if (expected.length && (pending.length !== expected.length || pending.some((migration) => !expected.includes(migration.version)))) {
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
        const result = await applyMigrationUnit({ ...migration, source: fs.readFileSync(migration.path, 'utf8') });
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
