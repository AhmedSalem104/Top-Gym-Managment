'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '..', '..', 'scripts', 'production-migration-gate.js'), 'utf8');

test('migration apply resolves SQL from the verified migration directory', () => {
    assert.match(source, /fs\.readFileSync\(path\.join\(MIGRATIONS_DIR, migration\.id\), 'utf8'\)/);
    assert.doesNotMatch(source, /fs\.readFileSync\(migration\.path, 'utf8'\)/);
});
