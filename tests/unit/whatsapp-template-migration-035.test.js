'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const {
    DEFAULT_BODIES,
    TEMPLATE_DEFINITIONS,
    validateTemplateBody
} = require('../../src/services/whatsapp-template-service');
const { classifyMigration } = require('../../scripts/production-migration-gate');

const ROOT = path.join(__dirname, '..', '..');
const FILE = '035-central-whatsapp-template-defaults.sql';
const source = fs.readFileSync(path.join(ROOT, 'database', 'migrations', FILE), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'database', 'migration-manifest.json'), 'utf8'));
const ids = TEMPLATE_DEFINITIONS.map((definition) => definition.id);

test('035 is an exact, fail-closed nine-row platform template update', () => {
    assert.match(source, /LOGIC_FIT_CONTROLLED_TEMPLATE_UPDATE:\s*whatsapp-platform-defaults/i);
    assert.match(source, /SET\s+XACT_ABORT\s+ON/i);
    assert.match(source, /UPDATE\s+target[\s\S]*FROM\s+dbo\.whatsapp_message_templates/i);
    assert.doesNotMatch(source, /\b(?:DROP|TRUNCATE|DELETE)\b/i);
    assert.doesNotMatch(source, /INSERT\s+INTO\s+dbo\.whatsapp_message_templates/i);
    for (const id of ids) assert.match(source, new RegExp(`'${id}'`));
});

test('035 manifest checksum and safety classification are exact', () => {
    const entry = manifest.migrations[FILE];
    assert.equal(entry.version, '035');
    assert.equal(entry.controlledTemplateUpdate, true);
    assert.equal(entry.checksum, crypto.createHash('sha256').update(source).digest('hex'));
    const result = classifyMigration({ fileName: FILE, version: '035', source, checksum: entry.checksum }, entry);
    assert.equal(result.classification, 'SAFE_AUTOMATIC');
    assert.equal(result.rlsImpact, false);
});

test('035 candidate bodies pass the central variable validator and carry matching hashes', () => {
    for (const definition of TEMPLATE_DEFINITIONS) {
        const body = DEFAULT_BODIES[definition.id];
        assert.doesNotThrow(() => validateTemplateBody(definition.id, body));
        // SQL Server hashes NVARCHAR bytes as UTF-16LE; keep the migration
        // guard aligned with the bytes actually persisted in the table.
        const hash = crypto.createHash('sha256').update(Buffer.from(body, 'utf16le')).digest('hex');
        assert.match(source, new RegExp(`'${hash}'`, 'i'));
    }
});

test('035 captures protected metadata and leaves history to the ledger runner', () => {
    assert.match(source, /DECLARE\s+@Before[\s\S]*updated_by_user_id/i);
    assert.match(source, /current_row\.template_id\s+<>\s+before_row\.template_id/i);
    assert.match(source, /current_row\.is_active\s+<>\s+before_row\.is_active/i);
    assert.doesNotMatch(source, /CREATE\s+(?:TABLE|INDEX)|ALTER\s+TABLE/i);
    const gate = fs.readFileSync(path.join(ROOT, 'scripts', 'production-migration-gate.js'), 'utf8');
    assert.match(gate, /MigrationId,ProductVersion/);
});
