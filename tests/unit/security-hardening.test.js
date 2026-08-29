'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
    createLoginAttemptGuard,
    createSensitiveRateLimit,
    trimMap
} = require('../../src/middleware/rate-limit.middleware');
const { isSameOriginRequest } = require('../../src/middleware/auth.middleware');
const { securityHeaders } = require('../../src/middleware/security.middleware');
const { parseScryptHash, readSessionCookie, verifyPassword } = require('../../src/services/auth-service');
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

function headerResponseDouble() {
    return {
        headers: {},
        set(values, value) {
            if (typeof values === 'string') this.headers[values] = value;
            else Object.assign(this.headers, values);
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

test('state-changing cross-site Fetch Metadata requests fail closed', () => {
    const request = (headers) => ({
        get: (name) => headers[String(name).toLowerCase()] || ''
    });
    assert.equal(isSameOriginRequest(request({ 'sec-fetch-site': 'cross-site' })), false);
    assert.equal(isSameOriginRequest(request({ 'sec-fetch-site': 'same-origin' })), true);
    assert.equal(isSameOriginRequest(request({})), true);
});

test('HSTS is emitted only for confirmed HTTPS requests', () => {
    const secure = headerResponseDouble();
    securityHeaders({ secure: true }, secure, () => {});
    assert.equal(secure.headers['Strict-Transport-Security'], 'max-age=31536000; includeSubDomains');

    const local = headerResponseDouble();
    securityHeaders({ secure: false }, local, () => {});
    assert.equal(local.headers['Strict-Transport-Security'], undefined);
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

test('password verification accepts the current scrypt format and rejects unsafe parameters', async () => {
    const encoded = 'scrypt$32768$8$1$c2FsdC1mb3ItdGVzdA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    assert.deepEqual(parseScryptHash(encoded), {
        N: 32768,
        r: 8,
        p: 1,
        salt: Buffer.from('salt-for-test'),
        expected: Buffer.alloc(64)
    });
    assert.equal(parseScryptHash('scrypt$16777216$8$1$c2FsdC1mb3ItdGVzdA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'), null);
    assert.equal(parseScryptHash('scrypt$32768$8$1$%%%$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'), null);
    assert.equal(await verifyPassword('not-the-password', encoded), false);
});
