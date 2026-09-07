'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

process.env.CACHE_ENABLED = 'false';
process.env.CACHE_GATEWAY_URL = '';
process.env.CACHE_GATEWAY_TOKEN = '';

const cacheService = require('../../src/services/cache-service');

test('cache keys are tenant-safe and scope-sensitive', () => {
    const gymA = cacheService.tenantKey({ tenantId: 10, resource: 'sections', scope: { branchId: 1, includeInactive: 0 } });
    const gymB = cacheService.tenantKey({ tenantId: 11, resource: 'sections', scope: { branchId: 1, includeInactive: 0 } });
    const otherBranch = cacheService.tenantKey({ tenantId: 10, resource: 'sections', scope: { branchId: 2, includeInactive: 0 } });
    assert.notEqual(gymA, gymB);
    assert.notEqual(gymA, otherBranch);
    assert.match(gymA, /^logicfit:v1:development:tenant:10:sections:/u);
});

test('platform keys stay outside tenant namespaces', () => {
    const key = cacheService.platformKey({ resource: 'plans', scope: { visibility: 'active' } });
    assert.match(key, /^logicfit:v1:development:platform:plans:/u);
    assert.doesNotMatch(key, /tenant:/u);
});

test('disabled cache falls back to the producer without network calls', async () => {
    let calls = 0;
    const result = await cacheService.getOrSet('logicfit:v1:development:tenant:10:test:global', async () => {
        calls += 1;
        return { ok: true };
    });
    assert.deepEqual(result, { ok: true });
    assert.equal(calls, 1);
    assert.equal(cacheService.metrics().enabled, false);
});

test('gateway failure falls back to the producer instead of failing the request', () => {
    const child = spawnSync(process.execPath, ['-e', `
        global.fetch = async () => { throw new Error('gateway offline'); };
        const cache = require('./src/services/cache-service');
        (async () => {
            const result = await cache.getOrSet('logicfit:v1:test:tenant:10:demo:global', async () => ({ ok: true }), 5);
            if (!result || result.ok !== true || cache.metrics().errors < 2) process.exit(1);
        })().catch(() => process.exit(1));
    `], {
        cwd: process.cwd(),
        env: { ...process.env, CACHE_ENABLED: 'true', CACHE_GATEWAY_URL: 'http://127.0.0.1:9', CACHE_GATEWAY_TOKEN: 'test-only', CACHE_GATEWAY_TIMEOUT_MS: '50' },
        encoding: 'utf8'
    });
    assert.equal(child.status, 0, child.stderr || child.stdout);
});
