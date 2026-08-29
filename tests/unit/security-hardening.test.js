'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
    createLoginAttemptGuard,
    createSensitiveRateLimit,
    trimMap
} = require('../../src/middleware/rate-limit.middleware');
const { readSessionCookie } = require('../../src/services/auth-service');
const { isAuthorizedCronRequest } = require('../../src/middleware/cron.middleware');

function requestFor(ip, body = {}) {
    return { method: 'POST', ip, socket: { remoteAddress: ip }, body };
}

function responseDouble() {
    return {
        headers: {},
        statusCode: 200,
        body: null,
        set(name, value) {
            this.headers[name] = value;
            return this;
        },
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(value) {
            this.body = value;
            return this;
        }
    };
}

test('bounded in-memory stores evict oldest keys instead of growing without a cap', () => {
    const map = new Map([['first', 1], ['second', 2], ['third', 3]]);
    trimMap(map, 2);
    assert.deepEqual([...map.keys()], ['second', 'third']);
});

test('sensitive rate limiter bounds unique key memory', () => {
    const limiter = createSensitiveRateLimit({ windowMs: 60_000, max: 1, cleanupMs: Number.POSITIVE_INFINITY, maxEntries: 2 });
    let nextCalls = 0;
    const next = () => { nextCalls += 1; };

    limiter(requestFor('ip-a'), responseDouble(), next);
    limiter(requestFor('ip-b'), responseDouble(), next);
    limiter(requestFor('ip-c'), responseDouble(), next);

    const evictedKeyResponse = responseDouble();
    limiter(requestFor('ip-a'), evictedKeyResponse, next);
    assert.equal(evictedKeyResponse.statusCode, 200);
    assert.equal(nextCalls, 4);
});

test('login attempt guard bounds unique key memory', () => {
    const guard = createLoginAttemptGuard({ windowMs: 60_000, max: 1, cleanupMs: Number.POSITIVE_INFINITY, maxEntries: 2 });
    const attempt = (ip) => guard(requestFor(ip), 'owner@example.com');
    assert.equal(attempt('ip-a'), true);
    assert.equal(attempt('ip-b'), true);
    assert.equal(attempt('ip-c'), true);
    assert.equal(attempt('ip-a'), true);
});

test('malformed session cookies fail closed without throwing', () => {
    const request = (cookie) => ({ get: (name) => name === 'cookie' ? cookie : '' });
    assert.equal(readSessionCookie(request('topgym_session=%ZZ')), '');
    assert.equal(readSessionCookie(request('topgym_session=' + 'x'.repeat(513))), '');
    assert.equal(readSessionCookie(request('topgym_session=abc%2D123')), 'abc-123');
});

test('production cron requests fail closed when the secret is missing', () => {
    const request = { get: () => 'vercel-cron/1.0' };
    assert.equal(isAuthorizedCronRequest(request, { config: { nodeEnv: 'production', cronSecret: '' } }), false);
});

test('cron authorization accepts the configured secret and rejects near matches', () => {
    const request = (authorization) => ({ get: (name) => name === 'authorization' ? authorization : '' });
    const config = { nodeEnv: 'production', cronSecret: 'safe-test-secret' };
    assert.equal(isAuthorizedCronRequest(request('Bearer safe-test-secret'), { config }), true);
    assert.equal(isAuthorizedCronRequest(request('Bearer safe-test-secreT'), { config }), false);
    assert.equal(isAuthorizedCronRequest(request('vercel-cron/1.0'), { config }), false);
});
