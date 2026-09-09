'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('standalone server has a graceful HTTP and SQL shutdown path', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../server.js'), 'utf8');
    assert.match(source, /const \{ closePool, getPool, initDatabase \} = require\('\.\/src\/database'\)/);
    assert.match(source, /httpServer = app\.listen\(port/);
    assert.match(source, /async function gracefulShutdown\(signal = 'shutdown'\)/);
    assert.match(source, /httpServer\.close\(\(error\) =>/);
    assert.match(source, /await closePool\(\)/);
    assert.match(source, /process\.once\('SIGTERM', handleSignal\)/);
    assert.match(source, /process\.once\('SIGINT', handleSignal\)/);
    assert.match(source, /await gracefulShutdown\('startup_failure'\)/);
});
