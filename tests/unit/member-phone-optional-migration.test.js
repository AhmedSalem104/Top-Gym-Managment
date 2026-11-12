'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { classifyMigration } = require('../../scripts/production-migration-gate');

const root = path.resolve(__dirname, '../..');
const fileName = '042-optional-member-phone.sql';
const migration = fs.readFileSync(path.join(root, 'database/migrations', fileName), 'utf8');
const checksum = crypto.createHash('sha256').update(migration).digest('hex');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'database/migration-manifest.json'), 'utf8'));

test('optional member phone migration is guarded, checksummed, and safe for the release gate', () => {
    const entry = manifest.migrations[fileName];
    assert.equal(entry.checksum, checksum);
    assert.equal(entry.version, '042');
    assert.equal(classifyMigration({ fileName, version: '042', source: migration, checksum }, entry).classification, 'SAFE_AUTOMATIC');
    assert.match(migration, /IF OBJECT_ID\(N'dbo\.members', N'U'\) IS NULL/u);
    assert.match(migration, /IF COL_LENGTH\(N'dbo\.members', N'phone'\) IS NULL/u);
    assert.match(migration, /is_nullable=0[\s\S]*?ALTER TABLE dbo\.members ALTER COLUMN phone NVARCHAR\(30\) NULL/u);
    assert.doesNotMatch(migration, /\b(?:DROP|DELETE|TRUNCATE)\b/iu);
});
