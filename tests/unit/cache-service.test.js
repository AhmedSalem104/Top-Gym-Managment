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

test('disabled cache coalesces concurrent producers for the same key', async () => {
    let calls = 0;
    let releaseProducer;
    const producerGate = new Promise((resolve) => { releaseProducer = resolve; });
    const producer = async () => {
        calls += 1;
        await producerGate;
        return { shared: true };
    };

    const first = cacheService.getOrSet('logicfit:v1:development:platform:test:global', producer);
    const second = cacheService.getOrSet('logicfit:v1:development:platform:test:global', producer);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls, 1);
    releaseProducer();
    assert.deepEqual(await Promise.all([first, second]), [{ shared: true }, { shared: true }]);
    assert.equal(cacheService.metrics().enabled, false);
});

test('gateway outage opens a short circuit and falls back without retrying each cache operation', () => {
    const child = spawnSync(process.execPath, ['-e', `
        let networkCalls = 0;
        global.fetch = async () => { networkCalls += 1; throw new Error('gateway offline'); };
        const cache = require('./src/services/cache-service');
        (async () => {
            const result = await cache.getOrSet('logicfit:v1:test:tenant:10:demo:global', async () => ({ ok: true }), 5);
            const second = await cache.getOrSet('logicfit:v1:test:tenant:10:other:global', async () => ({ ok: 'fallback' }), 5);
            const status = await cache.health();
            const metrics = cache.metrics();
            if (!result || result.ok !== true || second.ok !== 'fallback') process.exit(1);
            if (networkCalls !== 1 || metrics.errors !== 1 || metrics.skippedWhileUnavailable < 3) process.exit(2);
            if (status.status !== 'degraded') process.exit(3);
        })().catch(() => process.exit(1));
    `], {
        cwd: process.cwd(),
        env: { ...process.env, CACHE_ENABLED: 'true', CACHE_GATEWAY_URL: 'http://127.0.0.1:9', CACHE_GATEWAY_TOKEN: 'test-only', CACHE_GATEWAY_TIMEOUT_MS: '50' },
        encoding: 'utf8'
    });
    assert.equal(child.status, 0, child.stderr || child.stdout);
});

test('cache gateway recovery is probed once after the outage cooldown', () => {
    const child = spawnSync(process.execPath, ['-e', `
        let now = 1_000;
        const originalNow = Date.now;
        Date.now = () => now;
        let networkCalls = 0;
        global.fetch = async (url) => {
            networkCalls += 1;
            if (networkCalls === 1) return new Response('unavailable', { status: 503 });
            if (String(url).endsWith('/set')) return Response.json({ ok: true });
            if (String(url).endsWith('/ping')) return Response.json({ ok: true });
            return Response.json({ hit: false });
        };
        const cache = require('./src/services/cache-service');
        (async () => {
            await cache.getOrSet('logicfit:v1:test:tenant:10:initial:global', async () => ({ value: 1 }), 5);
            if (networkCalls !== 1) process.exit(1);
            now += 5_000;
            await cache.getOrSet('logicfit:v1:test:tenant:10:recovered:global', async () => ({ value: 2 }), 5);
            const status = await cache.health();
            if (networkCalls !== 4 || status.status !== 'healthy') process.exit(2);
            Date.now = originalNow;
        })().catch(() => process.exit(3));
    `], {
        cwd: process.cwd(),
        env: { ...process.env, CACHE_ENABLED: 'true', CACHE_GATEWAY_URL: 'http://cache.test', CACHE_GATEWAY_TOKEN: 'test-only', CACHE_GATEWAY_TIMEOUT_MS: '50' },
        encoding: 'utf8'
    });
    assert.equal(child.status, 0, child.stderr || child.stdout);
});

test('concurrent callers share a single half-open recovery probe per process', () => {
    const child = spawnSync(process.execPath, ['-e', `
        let now = 1_000;
        const originalNow = Date.now;
        Date.now = () => now;
        let networkCalls = 0;
        let markProbeStarted;
        let releaseProbe;
        const probeStarted = new Promise((resolve) => { markProbeStarted = resolve; });
        const probeGate = new Promise((resolve) => { releaseProbe = resolve; });
        global.fetch = async () => {
            networkCalls += 1;
            if (networkCalls === 1) return new Response('unavailable', { status: 503 });
            markProbeStarted();
            await probeGate;
            return Response.json({ hit: false });
        };
        const cache = require('./src/services/cache-service');
        (async () => {
            await cache.get('logicfit:v1:test:tenant:10:outage:global');
            now += 5_000;
            const probe = cache.get('logicfit:v1:test:tenant:10:probe:global');
            await probeStarted;
            const callers = await Promise.all(Array.from({ length: 50 }, (_, index) =>
                cache.get('logicfit:v1:test:tenant:10:parallel-' + index + ':global')
            ));
            if (networkCalls !== 2 || callers.some((value) => value !== undefined)) process.exit(1);
            releaseProbe();
            await probe;
            if (cache.metrics().skippedWhileUnavailable < 50) process.exit(2);
            Date.now = originalNow;
        })().catch(() => process.exit(3));
    `], {
        cwd: process.cwd(),
        env: { ...process.env, CACHE_ENABLED: 'true', CACHE_GATEWAY_URL: 'http://cache.test', CACHE_GATEWAY_TOKEN: 'test-only', CACHE_GATEWAY_TIMEOUT_MS: '1000' },
        encoding: 'utf8'
    });
    assert.equal(child.status, 0, child.stderr || child.stdout);
});
