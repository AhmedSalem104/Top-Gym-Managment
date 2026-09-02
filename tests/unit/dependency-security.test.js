'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const lockfile = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));

test('dependency security keeps Express 4 compatible and pins patched qs', () => {
    assert.match(packageJson.dependencies.express, /^\^4\./);
    assert.equal(packageJson.overrides?.qs, '6.16.0');
    assert.equal(lockfile.packages['node_modules/express'].version, '4.22.2');
    assert.equal(lockfile.packages['node_modules/qs'].version, '6.16.0');
    assert.equal(lockfile.packages['node_modules/body-parser'].dependencies.qs, '~6.15.1');
});
