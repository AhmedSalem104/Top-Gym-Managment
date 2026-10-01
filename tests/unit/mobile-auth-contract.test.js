'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const { createAuthController } = require('../../src/controllers/auth.controller');
const { createAuthApiMiddleware } = require('../../src/middleware/auth.middleware');
const { getTenantContext } = require('../../src/tenancy/tenant-context');
const { readBearerToken, AUTH_SCHEMA_SQL } = require('../../src/services/auth-service');
const { classifyMigration } = require('../../scripts/production-migration-gate');
const manifest = JSON.parse(read('database/migration-manifest.json'));
const refreshMigration = read('database/migrations/040-mobile-refresh-sessions.sql');
const refreshMigrationName = '040-mobile-refresh-sessions.sql';

function responseDouble() {
    return {
        statusCode: 200,
        headers: {},
        body: undefined,
        set(name, value) { this.headers[name] = value; return this; },
        status(code) { this.statusCode = code; return this; },
        json(value) { this.body = value; return this; },
        send(value) { this.body = value; return this; }
    };
}

function authRequest({ method = 'GET', pathName = '/mobile/auth/session', token = 'a'.repeat(64), body = {}, query = {} } = {}) {
    return {
        method,
        path: pathName,
        body,
        query,
        socket: { remoteAddress: '127.0.0.1' },
        get(name) {
            if (String(name).toLowerCase() === 'authorization') return token ? `Bearer ${token}` : '';
            return '';
        }
    };
}

test('mobile refresh-session migration is checksummed, additive, safe, and covered by a versioned manifest entry', () => {
    const checksum = crypto.createHash('sha256').update(refreshMigration).digest('hex');
    assert.equal(manifest.migrations[refreshMigrationName].checksum, checksum);
    const result = classifyMigration({ fileName: refreshMigrationName, version: '040', source: refreshMigration, checksum }, manifest.migrations[refreshMigrationName]);
    assert.equal(result.classification, 'SAFE_AUTOMATIC');
    assert.equal(result.rlsImpact, false);
    assert.match(refreshMigration, /IF OBJECT_ID\(N'dbo\.gym_mobile_refresh_sessions', N'U'\) IS NULL/i);
    assert.match(refreshMigration, /FK_gym_mobile_refresh_sessions_user[\s\S]*REFERENCES dbo\.gym_users\(id\) ON DELETE CASCADE/i);
    assert.match(refreshMigration, /IX_gym_mobile_refresh_sessions_user_expiry/);
    assert.doesNotMatch(refreshMigration, /\b(?:DROP|TRUNCATE)\s+TABLE\b/i);
});

test('mobile refresh-session schema is not created or repaired by runtime auth initialization', () => {
    assert.doesNotMatch(AUTH_SCHEMA_SQL, /gym_mobile_refresh_sessions/i);
    assert.doesNotMatch(read('database/schema.sql'), /gym_mobile_refresh_sessions/i);
    assert.match(read('src/services/auth-service.js'), /INSERT INTO dbo\.gym_mobile_refresh_sessions/);
    assert.doesNotMatch(read('src/services/auth-service.js'), /CREATE\s+TABLE\s+dbo\.gym_mobile_refresh_sessions/i);
    assert.doesNotMatch(read('src/services/auth-service.js'), /ALTER\s+TABLE\s+dbo\.gym_mobile_refresh_sessions/i);
});

test('mobile login route is additive and all four endpoints are registered', () => {
    const routes = read('src/routes/auth.routes.js');
    for (const route of [
        "app.post('/api/mobile/auth/login'",
        "app.post('/api/mobile/auth/refresh'",
        "app.get('/api/mobile/auth/session'",
        "app.post('/api/mobile/auth/logout'"
    ]) assert.ok(routes.includes(route));
    assert.ok(routes.includes("app.post('/api/auth/login'"));
});

for (const role of ['Owner', 'Assistant', 'PlatformAdmin']) {
    test(`mobile login issues the established mobile envelope for ${role}`, async () => {
        const user = {
            id: 17,
            name: 'QA User',
            role,
            permissions: ['members'],
            _primaryTenant: role === 'PlatformAdmin' ? null : { id: 23, name: 'QA Gym', tenantType: 'gym' }
        };
        const controller = createAuthController({
            allowLoginAttempt: async () => true,
            authService: { mobileLogin: async () => ({ accessToken: 'opaque-access', refreshToken: 'opaque-refresh', expiresAt: new Date('2026-10-01T12:15:00Z'), user }) }
        });
        const response = responseDouble();
        await controller.mobileLogin({ body: { email: 'qa@example.test', password: 'not-logged' } }, response);

        assert.equal(response.statusCode, 200);
        assert.equal(response.body.accessToken, 'opaque-access');
        assert.equal(response.body.refreshToken, 'opaque-refresh');
        assert.equal(response.body.session.user.role, role);
        assert.equal(response.body.session.workspace, role === 'PlatformAdmin' ? 'platform' : 'gym');
        assert.equal(response.headers['Cache-Control'], 'no-store, no-cache, must-revalidate, private');
        assert.equal(response.headers['Set-Cookie'], undefined);
    });
}

test('invalid mobile credentials propagate the canonical authentication error', async () => {
    const invalid = Object.assign(new Error('Invalid credentials'), { statusCode: 401, code: 'INVALID_CREDENTIALS' });
    const controller = createAuthController({
        allowLoginAttempt: async () => true,
        authService: { mobileLogin: async () => { throw invalid; } }
    });
    await assert.rejects(controller.mobileLogin({ body: { email: 'qa@example.test', password: 'wrong' } }, responseDouble()), (error) => error === invalid);
});

test('mobile login rate limit remains enforced before authentication', async () => {
    const controller = createAuthController({
        allowLoginAttempt: async () => false,
        authService: { mobileLogin: async () => { throw new Error('must not authenticate'); } }
    });
    const response = responseDouble();
    await controller.mobileLogin({ body: { email: 'qa@example.test' } }, response);
    assert.equal(response.statusCode, 429);
    assert.equal(response.headers['Retry-After'], '900');
    assert.equal(response.body.code, 'LOGIN_RATE_LIMITED');
});

test('mobile refresh rotates token pair through service and never cache-stores the response', async () => {
    const seen = [];
    const controller = createAuthController({
        authService: { mobileRefresh: async (token) => {
            seen.push(token);
            return { accessToken: 'next-access', refreshToken: 'next-refresh', expiresAt: new Date('2026-10-01T12:15:00Z'), user: { id: 17, name: 'QA User', role: 'Owner', permissions: ['*'] } };
        } }
    });
    const response = responseDouble();
    await controller.mobileRefresh({ body: { refreshToken: 'prior-refresh' } }, response);
    assert.deepEqual(seen, ['prior-refresh']);
    assert.equal(response.body.accessToken, 'next-access');
    assert.equal(response.body.refreshToken, 'next-refresh');
    assert.equal(response.headers['Cache-Control'], 'no-store, no-cache, must-revalidate, private');
});

test('mobile logout revokes bearer access and refresh sessions through the service', async () => {
    const revoked = [];
    const controller = createAuthController({
        authService: {
            readBearerToken,
            mobileLogout: async (...tokens) => revoked.push(tokens)
        }
    });
    const response = responseDouble();
    await controller.mobileLogout({ get: (name) => name.toLowerCase() === 'authorization' ? `Bearer ${'a'.repeat(64)}` : '', body: { refreshToken: 'b'.repeat(96) } }, response);
    assert.deepEqual(revoked, [['a'.repeat(64), 'b'.repeat(96)]]);
    assert.equal(response.statusCode, 204);
});

test('bearer mobile session restores Owner and Assistant inside the server-resolved tenant and checks RLS readiness', async () => {
    for (const role of ['Owner', 'Assistant']) {
        const calls = [];
        const middleware = createAuthApiMiddleware({
            authService: {
                ensureAuthReady: async () => calls.push('auth-ready'),
                readBearerToken,
                readSessionCookie: () => '',
                getSessionUser: async (token) => token === 'a'.repeat(64) ? { id: 17, role, permissions: [] } : null,
                withPermissions: async (user) => user
            },
            tenantService: {
                resolveTenantForUser: async (userId, slug, options) => {
                    calls.push({ userId, slug, options });
                    return { id: 23, status: 'active' };
                },
                assertTenantIsolationReady: async () => calls.push('rls-ready')
            },
            isAuthorizedCronRequest: () => false
        });
        const request = authRequest();
        const response = responseDouble();
        let context;
        await middleware(request, response, () => { context = getTenantContext(); });
        assert.equal(request.auth.id, 17);
        assert.equal(request.auth.role, role);
        assert.equal(context.tenantId, 23);
        assert.equal(context.userId, 17);
        assert.equal(context.mode, 'tenant');
        assert.ok(calls.includes('rls-ready'));
    }
});

test('bearer mobile session keeps Platform Admin in platform scope without resolving a tenant', async () => {
    let tenantLookups = 0;
    let context;
    const middleware = createAuthApiMiddleware({
        authService: {
            ensureAuthReady: async () => {}, readBearerToken, readSessionCookie: () => '',
            getSessionUser: async () => ({ id: 1, role: 'PlatformAdmin', permissions: ['*'] }),
            withPermissions: async (user) => user
        },
        tenantService: { resolveTenantForUser: async () => { tenantLookups += 1; return null; } },
        isAuthorizedCronRequest: () => false
    });
    const request = authRequest();
    await middleware(request, responseDouble(), () => { context = getTenantContext(); });
    assert.equal(request.auth.role, 'PlatformAdmin');
    assert.equal(context.tenantId, null);
    assert.equal(context.mode, 'platform');
    assert.equal(tenantLookups, 0);
});

test('invalid or revoked bearer access is rejected with 401 and never enters the application handler', async () => {
    const middleware = createAuthApiMiddleware({
        authService: {
            ensureAuthReady: async () => {}, readBearerToken, readSessionCookie: () => '',
            getSessionUser: async () => null
        },
        tenantService: {},
        isAuthorizedCronRequest: () => false
    });
    const response = responseDouble();
    let nextCalled = false;
    await middleware(authRequest({ token: 'revoked-access' }), response, () => { nextCalled = true; });
    assert.equal(response.statusCode, 401);
    assert.equal(response.body.code, 'AUTH_REQUIRED');
    assert.equal(nextCalled, false);
});

test('tenantless mobile session is rejected with 403 and cannot bypass the tenant isolation boundary', async () => {
    let rlsCalled = false;
    const middleware = createAuthApiMiddleware({
        authService: {
            ensureAuthReady: async () => {}, readBearerToken, readSessionCookie: () => '',
            getSessionUser: async () => ({ id: 17, role: 'Assistant' }),
            withPermissions: async (user) => user
        },
        tenantService: {
            resolveTenantForUser: async () => null,
            assertTenantIsolationReady: async () => { rlsCalled = true; }
        },
        isAuthorizedCronRequest: () => false
    });
    const response = responseDouble();
    let nextCalled = false;
    await middleware(authRequest(), response, () => { nextCalled = true; });
    assert.equal(response.statusCode, 403);
    assert.equal(response.body.code, 'TENANT_ACCESS_REQUIRED');
    assert.equal(rlsCalled, false);
    assert.equal(nextCalled, false);
});

test('web cookie login response contract remains unchanged and does not expose mobile tokens', async () => {
    let cookie;
    const controller = createAuthController({
        allowLoginAttempt: async () => true,
        authService: {
            login: async () => ({ token: 'web-cookie-session', expiresAt: new Date('2026-10-08T12:00:00Z'), user: { id: 17, role: 'Owner' } }),
            appendCookie: (_response, value) => { cookie = value; },
            sessionCookie: (token) => `topgym_session=${token}; HttpOnly; SameSite=Lax`
        }
    });
    const response = responseDouble();
    await controller.login({ body: { email: 'owner@example.test', password: 'secret' }, ip: '127.0.0.1' }, response);
    assert.equal(cookie, 'topgym_session=web-cookie-session; HttpOnly; SameSite=Lax');
    assert.deepEqual(Object.keys(response.body).sort(), ['expiresAt', 'user']);
    assert.equal(response.body.user.role, 'Owner');
    assert.equal(response.body.accessToken, undefined);
    assert.equal(response.headers['Cache-Control'], 'no-store, no-cache, must-revalidate, private');
});
