'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.join(__dirname, '..', '..');
const read = (relativePath) => fs.readFileSync(path.join(rootDir, relativePath), 'utf8');

test('one object-storage service is wired into branding and SaaS private uploads', () => {
    const server = read('server.js');
    assert.match(server, /brandingService\.configureObjectStorageService\(objectStorageService\)/);
    assert.match(server, /saasService\.configureObjectStorageService\(objectStorageService\)/);
    assert.match(server, /driver: config\.objectStorageDriver/);
});

test('new branding and payment-proof writes persist verified private metadata, not new SQL blobs', () => {
    const branding = read('src/services/branding-service.js');
    const saas = read('src/services/saas-service.js');
    assert.match(branding, /category: 'branding'/);
    assert.match(branding, /verifyPrivateObject/);
    assert.match(branding, /content=NULL/);
    assert.match(saas, /category: 'payment-proofs'/);
    assert.match(saas, /verifyPrivateObject/);
    assert.match(saas, /content=NULL/);
});

test('private storage has no public URL escape hatch and metadata migration is additive', () => {
    const storage = read('src/services/object-storage-service.js');
    const migration = read('database/migrations/010-private-object-storage-metadata.sql');
    assert.match(storage, /Private objects do not expose public URLs/);
    assert.match(migration, /COL_LENGTH/);
    assert.doesNotMatch(migration, /DROP TABLE|TRUNCATE TABLE|DELETE FROM/i);
    assert.match(migration, /content VARBINARY\(MAX\) NULL/);
});
