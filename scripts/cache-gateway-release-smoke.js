'use strict';

const crypto = require('node:crypto');
const { config } = require('../src/config/env');
const cache = require('../src/services/cache-service');

function validateConfig() {
    let gatewayUrl;
    try { gatewayUrl = new URL(config.cacheGatewayUrl); } catch (_) { throw new Error('invalid-config'); }
    if (!config.cacheEnabled || !config.cacheGatewayToken
        || gatewayUrl.protocol !== 'http:'
        || gatewayUrl.hostname !== '127.0.0.1'
        || gatewayUrl.port !== '9400'
        || (gatewayUrl.pathname !== '/' && gatewayUrl.pathname !== '')) {
        throw new Error('invalid-config');
    }
}

async function verifyApplicationHealth() {
    const port = Number(process.env.PORT || 3017);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('invalid-port');
    for (let attempt = 0; attempt < 2; attempt += 1) {
        if (attempt) await new Promise((resolve) => setTimeout(resolve, 5_100));
        try {
            const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(4000) });
            if (!response.ok) continue;
            const result = await response.json();
            if (result?.checks?.cache?.enabled === true && result.checks.cache.status === 'healthy') return;
        } catch (_) { /* The next bounded probe can recover after the cache circuit cooldown. */ }
    }
    throw new Error('application-cache-health-failed');
}

async function run() {
    validateConfig();
    if (process.argv.includes('--validate-config')) {
        return;
    }

    const nonce = crypto.randomUUID();
    const key = cache.platformKey({ resource: 'release-smoke', scope: { nonce } });
    let cleanupOk = false;
    try {
        const health = await cache.health();
        if (health.enabled !== true || health.status !== 'healthy') throw new Error('ping-failed');
        if (!await cache.set(key, { nonce, probe: true }, 30)) throw new Error('set-failed');
        const value = await cache.get(key);
        if (value?.nonce !== nonce || value.probe !== true) throw new Error('get-failed');

        // Exercise Redis EVAL only when the application has explicitly enabled
        // shared rate limiting. The synthetic counter expires after one second.
        if (config.rateLimitSharedEnabled) {
            const counter = await cache.incrementRateLimit(`release-smoke:${nonce}`, 1000);
            if (counter.count !== 1 || counter.resetAt <= Date.now() || counter.resetAt > Date.now() + 1000) {
                throw new Error('rate-limit-acl-failed');
            }
        }

        cleanupOk = await cache.delete(key);
        if (!cleanupOk) throw new Error('cleanup-failed');
        if (!process.argv.includes('--skip-application-health')) await verifyApplicationHealth();
    } finally {
        if (!cleanupOk) await cache.delete(key).catch(() => false);
    }
    process.stdout.write('CACHE_GATEWAY_RELEASE_SMOKE=PASS\n');
}

run().catch(() => {
    process.stderr.write('CACHE_GATEWAY_RELEASE_SMOKE=FAIL\n');
    process.exitCode = 1;
});
