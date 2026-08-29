'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const {
    auditDatabaseReadiness,
    auditMigrationText,
    parseMigrationVersion
} = require('../../scripts/audit-database-readiness');

test('database readiness audit finds the canonical migration set safe at source level', () => {
    const report = auditDatabaseReadiness({ rootDir: path.join(__dirname, '..', '..') });
    assert.equal(report.staticStatus, 'PASS');
    assert.deepEqual(report.migrationFiles, [
        '005-member-feedback.sql',
        '006-permissions.sql',
        '007-store.sql'
    ]);
    assert.deepEqual(report.migrationFindings, []);
    assert.equal(report.schemaReview.status, 'REQUIRES STAGING VERIFICATION');
    assert.equal(report.liveVerification, 'REQUIRES STAGING/PRODUCTION VERIFICATION');
    assert.equal(report.runtimeSchemaChecks.tenantStatusConstraintOnlyReplacedWhenOutdated, true);
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
