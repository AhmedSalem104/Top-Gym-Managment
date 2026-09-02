'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const test = require('node:test');

const {
    auditDatabaseReadiness,
    auditMigrationText,
    parseMigrationVersion
} = require('../../scripts/audit-database-readiness');
const { assertMigrationTarget } = require('../../scripts/migrate-tenancy');

const connectionString = 'Server=localhost,1433;Database=logic_fit_test;User Id=test-user;Password=test-password;Encrypt=True;TrustServerCertificate=True;';
const externalConnectionString = 'Server=sql.staging.example,1433;Database=logic_fit_test;User Id=test-user;Password=test-password;Encrypt=True;TrustServerCertificate=False;';

test('database readiness audit finds the canonical migration set safe at source level', () => {
    const report = auditDatabaseReadiness({ rootDir: path.join(__dirname, '..', '..') });
    assert.equal(report.staticStatus, 'PASS');
    assert.deepEqual(report.migrationFiles, [
        '005-member-feedback.sql',
        '006-permissions.sql',
        '007-store.sql',
        '008-backup-recovery.sql',
        '009-platform-backup-audit.sql',
        '010-private-object-storage-metadata.sql',
        '011-commercial-portal-and-registration.sql',
        '012-payment-ledger-integrity.sql',
        '013-phase0-security-preconditions.sql',
        '014-tenant-type-foundation.sql',
        '015-plan-tenant-type-compatibility.sql',
        '016-independent-trainer-registration.sql',
        '017-trainer-client-profile.sql',
        '018-trainer-commercial-operations.sql',
        '019-trainer-portal-foundation.sql',
        '020-branch-foundation.sql',
        '021-membership-branch-attendance.sql',
        '022-financial-branch-attribution.sql',
        '023-stock-locations-and-transfers.sql',
        '024-bar-pos-recipes.sql',
        '025-bar-modifiers.sql',
        '026-branch-plan-limits.sql'
    ]);
    assert.deepEqual(report.migrationFindings, []);
    assert.equal(report.schemaReview.status, 'REQUIRES STAGING VERIFICATION');
    assert.equal(report.liveVerification, 'REQUIRES STAGING/PRODUCTION VERIFICATION');
    assert.equal(report.runtimeSchemaChecks.tenantStatusConstraintOnlyReplacedWhenOutdated, true);
});

test('migration runner applies the canonical commercial base before trainer registration extensions', () => {
    const runner = fs.readFileSync(path.join(__dirname, '..', '..', 'scripts', 'migrate-tenancy.js'), 'utf8');
    const baseMigration = runner.indexOf('BASE_COMMERCIAL_MIGRATION_PATH');
    const phase2Migration = runner.indexOf('PHASE2_PLAN_COMPATIBILITY_MIGRATION_PATH');
    const baseBatch = runner.indexOf('baseCommercialMigration');
    const phase2Batch = runner.indexOf('phase2PlanCompatibilityMigration');
    assert.ok(baseMigration >= 0);
    assert.ok(baseBatch >= 0);
    assert.ok(phase2Migration >= 0);
    assert.ok(phase2Batch >= 0);
    assert.ok(baseBatch < phase2Batch);
});

test('database readiness audit requires guards for additive migration operations', () => {
    const unsafe = auditMigrationText('fixture.sql', `
        CREATE TABLE dbo.fixture (id INT NOT NULL);
        ALTER TABLE dbo.fixture ADD name NVARCHAR(40) NULL;
        CREATE INDEX IX_fixture_name ON dbo.fixture(name);
        INSERT INTO dbo.fixture(id) VALUES (1);
    `);
    assert.equal(unsafe.status, 'FAIL');
    assert.deepEqual(unsafe.findings.map((finding) => finding.code), [
        'UNGUARDED_CREATE_TABLE',
        'UNGUARDED_ALTER_COLUMN',
        'UNGUARDED_CREATE_INDEX',
        'UNGUARDED_SEED_INSERT'
    ]);
});

test('database readiness audit rejects destructive migration statements', () => {
    const unsafe = auditMigrationText('fixture.sql', 'DROP TABLE dbo.fixture; TRUNCATE TABLE dbo.other;');
    assert.equal(unsafe.status, 'FAIL');
    assert.deepEqual(unsafe.findings.map((finding) => finding.code), ['DROP_TABLE', 'TRUNCATE_TABLE']);
});

test('migration versions are parsed without treating arbitrary SQL files as migrations', () => {
    assert.equal(parseMigrationVersion('007-store.sql'), 7);
    assert.equal(parseMigrationVersion('readme.sql'), null);
    assert.equal(parseMigrationVersion('8.sql'), null);
});

test('migration target guard fails closed for unidentified external targets', () => {
    assert.deepEqual(assertMigrationTarget({ connectionString }), { environment: 'local', localTarget: true });
    assert.throws(
        () => assertMigrationTarget({ connectionString: externalConnectionString }),
        /MIGRATION_ENV must explicitly identify/i
    );
    assert.throws(
        () => assertMigrationTarget({ connectionString: externalConnectionString, environment: 'development' }),
        /NON_PRODUCTION_CONFIRM/i
    );
});

test('migration target guard requires explicit production confirmation', () => {
    assert.deepEqual(assertMigrationTarget({ connectionString: externalConnectionString, environment: 'staging' }), { environment: 'staging', localTarget: false });
    assert.throws(
        () => assertMigrationTarget({ connectionString: externalConnectionString, environment: 'production' }),
        /PRODUCTION_CONFIRM/i
    );
    assert.deepEqual(assertMigrationTarget({
        connectionString: externalConnectionString,
        environment: 'production',
        productionConfirmation: 'I_UNDERSTAND_PRODUCTION_MIGRATION'
    }), { environment: 'production', localTarget: false });
});
