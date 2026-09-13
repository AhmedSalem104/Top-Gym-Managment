'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '..', '..', 'scripts', 'production-migration-gate.js'), 'utf8');
const migration = fs.readFileSync(path.join(__dirname, '..', '..', 'database', 'migrations', '031-central-notifications.sql'), 'utf8');
const legacyBranchMigration = fs.readFileSync(path.join(__dirname, '..', '..', 'database', 'migrations', '033-top-gym-legacy-branch-attribution.sql'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'database', 'migration-manifest.json'), 'utf8'));
const { classifyMigration } = require('../../scripts/production-migration-gate');

test('migration apply resolves SQL from the verified migration directory', () => {
    assert.match(source, /fs\.readFileSync\(path\.join\(MIGRATIONS_DIR, migration\.id\), 'utf8'\)/);
    assert.doesNotMatch(source, /fs\.readFileSync\(migration\.path, 'utf8'\)/);
    assert.match(source, /async function hasMigrationHistory\(executor, migrationId\)/);
});

test('central notification foreign keys avoid SQL Server multiple cascade paths', () => {
    assert.match(migration, /FK_saas_notifications_recipient[\s\S]*ON DELETE NO ACTION/i);
    assert.match(migration, /FK_saas_notifications_actor[\s\S]*ON DELETE NO ACTION/i);
    assert.equal(manifest.migrations['031-central-notifications.sql'].checksum,
        require('node:crypto').createHash('sha256').update(migration).digest('hex'));
});

test('legacy branch backfill is explicitly classified through the reviewed data-backfill policy', () => {
    const checksum = require('node:crypto').createHash('sha256').update(legacyBranchMigration).digest('hex');
    const result = classifyMigration({
        fileName: '033-top-gym-legacy-branch-attribution.sql',
        version: '033',
        source: legacyBranchMigration,
        checksum
    }, manifest.migrations['033-top-gym-legacy-branch-attribution.sql']);
    assert.equal(result.classification, 'SAFE_AUTOMATIC');
    assert.equal(result.rlsImpact, false);
});
