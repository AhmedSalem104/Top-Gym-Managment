'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

test('cache rate-limit adapter sends only an opaque key and validates atomic gateway results', () => {
    const script = String.raw`
        const assert = require('node:assert/strict');
        process.env.CACHE_ENABLED = 'true';
        process.env.CACHE_GATEWAY_URL = 'https://cache.invalid';
        process.env.CACHE_GATEWAY_TOKEN = 'unit-test-gateway-key';
        delete process.env.RATE_LIMIT_SHARED_ENABLED;
        const { config } = require('./src/config/env');
        assert.equal(config.rateLimitSharedEnabled, false);
        const cache = require('./src/services/cache-service');
        let request;
        global.fetch = async (url, options) => {
            request = { url, options, body: JSON.parse(options.body) };
            return { ok: true, json: async () => ({ count: 4, resetInMs: 30000 }) };
        };
        (async () => {
            const result = await cache.incrementRateLimit('sensitive:ip:192.0.2.7', 60000);
            assert.equal(result.count, 4);
            assert.ok(result.resetAt > Date.now());
            assert.equal(request.url, 'https://cache.invalid/rate-limit/increment');
            assert.equal(request.body.windowMs, 60000);
            assert.match(request.body.key, /^logicfit:v1:development:ratelimit:[a-f0-9]{64}$/);
            assert.ok(!JSON.stringify(request).includes('192.0.2.7'));
            global.fetch = async () => ({ ok: true, json: async () => ({ count: 0, resetInMs: 0 }) });
            await assert.rejects(cache.incrementRateLimit('sensitive:ip:test', 60000));
            global.fetch = async () => ({ ok: true, json: async () => ({ count: 2, resetInMs: 1.5 }) });
            await assert.rejects(cache.incrementRateLimit('sensitive:ip:test', 60000));
            await assert.rejects(cache.incrementRateLimit('sensitive:ip:test', 50));
        })().catch((error) => { console.error(error); process.exitCode = 1; });
    `;
    const result = spawnSync(process.execPath, ['-e', script], { cwd: process.cwd(), encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('server enables the adapter only by explicit configuration and maps the middleware window contract', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../../server.js'), 'utf8');
    assert.match(source, /config\.rateLimitSharedEnabled\s*\?/);
    assert.match(source, /increment:\s*\(key,\s*options\)\s*=>\s*cacheService\.incrementRateLimit\(key,\s*options\.windowMs\)/);
    assert.match(source, /requireSharedStore:\s*true/);
});
