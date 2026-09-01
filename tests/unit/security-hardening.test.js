'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
    createLoginAttemptGuard,
    createBackupActionRateLimit,
    createMemoryRateLimitStore,
    createSensitiveRateLimit,
    trimMap
} = require('../../src/middleware/rate-limit.middleware');
const { createAuthApiMiddleware, isSameOriginRequest } = require('../../src/middleware/auth.middleware');
const { securityHeaders } = require('../../src/middleware/security.middleware');
const { parseScryptHash, readSessionCookie, verifyPassword } = require('../../src/services/auth-service');
const { isAuthorizedCronRequest } = require('../../src/middleware/cron.middleware');
const { getTenantContext } = require('../../src/tenancy/tenant-context');
const { getTenantSecuritySnapshot, TENANT_TABLES, tenantSecuritySnapshotIsReady } = require('../../src/services/tenant-service');

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

test('sensitive rate limiter bounds unique key memory', async () => {
    const limiter = createSensitiveRateLimit({ windowMs: 60_000, max: 1, cleanupMs: Number.POSITIVE_INFINITY, maxEntries: 2 });
    let nextCalls = 0;
    const next = () => { nextCalls += 1; };

    await limiter(requestFor('ip-a'), responseDouble(), next);
    await limiter(requestFor('ip-b'), responseDouble(), next);
    await limiter(requestFor('ip-c'), responseDouble(), next);

    const evictedKeyResponse = responseDouble();
    await limiter(requestFor('ip-a'), evictedKeyResponse, next);
    assert.equal(evictedKeyResponse.statusCode, 200);
    assert.equal(nextCalls, 4);
});

test('backup action rate limiter scopes expensive actions to the trusted tenant/user context', async () => {
    const limiter = createBackupActionRateLimit({ windowMs: 60_000, max: 1, cleanupMs: Number.POSITIVE_INFINITY, maxEntries: 10 });
    const request = (tenantId) => ({ ...requestFor('ip-backup'), tenant: { id: tenantId }, auth: { id: 42 } });
    let nextCalls = 0;
    await limiter(request(7), responseDouble(), () => { nextCalls += 1; });
    const blocked = responseDouble();
    await limiter(request(7), blocked, () => { nextCalls += 1; });
    const otherTenant = responseDouble();
    await limiter(request(8), otherTenant, () => { nextCalls += 1; });
    assert.equal(blocked.statusCode, 429);
    assert.equal(blocked.body.code, 'BACKUP_RATE_LIMITED');
    assert.equal(otherTenant.statusCode, 200);
    assert.equal(nextCalls, 2);
});

test('login attempt guard bounds unique key memory', async () => {
    const guard = createLoginAttemptGuard({ windowMs: 60_000, max: 1, cleanupMs: Number.POSITIVE_INFINITY, maxEntries: 2 });
    const attempt = (ip) => guard(requestFor(ip), 'owner@example.com');
    assert.equal(await attempt('ip-a'), true);
    assert.equal(await attempt('ip-b'), true);
    assert.equal(await attempt('ip-c'), true);
    assert.equal(await attempt('ip-a'), true);
});

test('rate-limit policy accepts an async atomic store without changing local semantics', async () => {
    const calls = [];
    const store = {
        increment: async (key, options) => {
            calls.push({ key, windowMs: options.windowMs });
            return { count: 1, resetAt: Date.now() + options.windowMs };
        }
    };
    const limiter = createSensitiveRateLimit({ max: 1, store, fallbackStore: createMemoryRateLimitStore() });
    let nextCalls = 0;
    await limiter(requestFor('ip-async'), responseDouble(), () => { nextCalls += 1; });
    assert.equal(nextCalls, 1);
    assert.equal(calls.length, 1);
    assert.match(calls[0].key, /^sensitive:ip:/);
});

test('rate-limit policy fails closed when configured and fallback stores fail', async () => {
    const unavailable = { increment: async () => { throw new Error('backend unavailable'); } };
    const response = responseDouble();
    const limiter = createSensitiveRateLimit({ store: unavailable, fallbackStore: unavailable });
    await limiter(requestFor('ip-failure'), response, () => { throw new Error('must not bypass'); });
    assert.equal(response.statusCode, 503);
    assert.equal(response.body.code, 'RATE_LIMIT_UNAVAILABLE');
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

test('public state-changing routes enforce the same-origin boundary before allow-listing', async () => {
    const middleware = createAuthApiMiddleware({
        authService: {},
        tenantService: {
            resolvePublicTenant: async () => { throw new Error('public route must be rejected before tenant resolution'); }
        },
        isAuthorizedCronRequest: () => false
    });
    const request = {
        method: 'POST',
        path: '/member-portal/lookup',
        query: {},
        body: {},
        get: (name) => String(name).toLowerCase() === 'sec-fetch-site' ? 'cross-site' : ''
    };
    const response = responseDouble();
    let nextCalled = false;
    await middleware(request, response, () => { nextCalled = true; });

    assert.equal(response.statusCode, 403);
    assert.equal(response.body.code, 'CROSS_ORIGIN_REQUEST');
    assert.equal(nextCalled, false);
});

test('tenant isolation readiness requires an enabled policy covering every scoped table', () => {
    const ready = { policy_enabled: 1, security_function_present: 1, schema_contract_ready: 1, actual_tenant_tables: TENANT_TABLES.length, registry_tenant_tables: TENANT_TABLES.length, protected_tables: TENANT_TABLES.length, unprotected_tenant_tables: 0, missing_registry_entries: 0, missing_registry_tables: 0, disabled_required_policies: 0, invalid_predicates: 0, schema_security_mismatch: 0 };
    assert.equal(tenantSecuritySnapshotIsReady(ready), true);
    assert.equal(tenantSecuritySnapshotIsReady({ ...ready, policy_enabled: 0 }), false);
    assert.equal(tenantSecuritySnapshotIsReady({ ...ready, protected_tables: 70 }), false);
    assert.equal(tenantSecuritySnapshotIsReady({ ...ready, missing_registry_entries: 1 }), false);
    assert.equal(tenantSecuritySnapshotIsReady({ ...ready, security_function_present: 0 }), false);
    assert.equal(tenantSecuritySnapshotIsReady({ ...ready, schema_contract_ready: 0 }), false);
});

test('tenant security inspection discovers schema tables instead of trusting only the registry', async () => {
    const policy = [
        { policy_name: 'gym_tenant_security_policy', policy_schema: 'dbo', schema_name: 'dbo', table_name: 'members', is_enabled: 1, predicate_type_desc: 'FILTER', operation: null, predicate_definition: 'dbo.gym_tenant_access_predicate(tenant_id)' },
        { policy_name: 'gym_tenant_security_policy', policy_schema: 'dbo', schema_name: 'dbo', table_name: 'members', is_enabled: 1, predicate_type_desc: 'BLOCK', operation: 'AFTER INSERT', predicate_definition: 'dbo.gym_tenant_access_predicate(tenant_id)' },
        { policy_name: 'gym_tenant_security_policy', policy_schema: 'dbo', schema_name: 'dbo', table_name: 'members', is_enabled: 1, predicate_type_desc: 'BLOCK', operation: 'AFTER UPDATE', predicate_definition: 'dbo.gym_tenant_access_predicate(tenant_id)' }
    ];
    const fakePool = {
        request: () => ({
            query: async () => ({
                recordsets: [
                    [
                        { schema_name: 'dbo', name: 'members', is_nullable: 0, data_type: 'int' },
                        { schema_name: 'dbo', name: 'gym_user_tenants', is_nullable: 0, data_type: 'int' },
                        { schema_name: 'dbo', name: 'unregistered_future_table', is_nullable: 0, data_type: 'int' }
                    ],
                    [{ schema_name: 'dbo', name: 'members' }],
                    policy,
                    [{ name: 'gym_tenant_access_predicate', schema_name: 'dbo', type: 'IF', is_ms_shipped: 0, is_schema_bound: 1 }],
                    [{ schema_contract_ready: 1 }]
                ]
            })
        })
    };
    const snapshot = await getTenantSecuritySnapshot(fakePool);
    assert.deepEqual(snapshot.actualTenantTables, ['dbo.members', 'dbo.unregistered_future_table']);
    assert.deepEqual(snapshot.globalTenantColumnTables, ['dbo.gym_user_tenants']);
    assert.deepEqual(snapshot.missingRegistryEntries, ['dbo.unregistered_future_table']);
    assert.deepEqual(snapshot.unprotectedTenantTables, ['dbo.unregistered_future_table']);
    assert.equal(tenantSecuritySnapshotIsReady(snapshot), false);
});

test('authenticated tenant requests fail closed when the isolation policy is unavailable', async () => {
    const isolationError = new Error('Tenant data isolation is not ready.');
    isolationError.statusCode = 503;
    isolationError.code = 'TENANT_ISOLATION_NOT_READY';
    let nextError;
    const middleware = createAuthApiMiddleware({
        authService: {
            getSessionUser: async () => ({ id: 17, role: 'Owner' }),
            readSessionCookie: () => 'session-token',
            withPermissions: async (user) => user
        },
        tenantService: {
            resolveTenantForUser: async () => ({ id: 23, status: 'active' }),
            assertTenantIsolationReady: async () => { throw isolationError; }
        },
        isAuthorizedCronRequest: () => false
    });
    const request = {
        method: 'GET',
        path: '/members',
        query: {},
        body: {},
        get: () => '',
        socket: { remoteAddress: '127.0.0.1' }
    };

    await middleware(request, responseDouble(), (error) => { nextError = error; });

    assert.equal(nextError, isolationError);
});

test('forced-password sessions cannot call normal tenant APIs server-side', async () => {
    let nextCalled = false;
    const middleware = createAuthApiMiddleware({
        authService: {
            getSessionUser: async () => ({ id: 17, role: 'Owner', mustChangePassword: true }),
            readSessionCookie: () => 'session-token',
            withPermissions: async (user) => user
        },
        tenantService: {
            resolveTenantForUser: async () => ({ id: 23, status: 'active' }),
            assertTenantIsolationReady: async () => {}
        },
        isAuthorizedCronRequest: () => false
    });
    const request = { method: 'GET', path: '/members', query: {}, body: {}, get: () => '', socket: { remoteAddress: '127.0.0.1' } };
    const response = responseDouble();
    await middleware(request, response, () => { nextCalled = true; });
    assert.equal(response.statusCode, 403);
    assert.equal(response.body.code, 'PASSWORD_CHANGE_REQUIRED');
    assert.equal(nextCalled, false);
});

test('normal GET requests use a read-only tenant context and do not touch sessions', async () => {
    const observed = {};
    const middleware = createAuthApiMiddleware({
        authService: {
            ensureAuthReady: async () => { observed.ensureAuthReady = true; },
            readSessionCookie: () => 'session-token',
            getSessionUser: async (token, options) => {
                observed.session = { token, options };
                return { id: 17, role: 'Owner' };
            },
            withPermissions: async (user, options) => {
                observed.permissions = options;
                return user;
            }
        },
        tenantService: {
            resolveTenantForUser: async (userId, slug, options) => {
                observed.tenant = { userId, slug, options };
                return { id: 23, status: 'active' };
            }
        },
        saasService: {
            enforceTenantAccess: async (tenantId, options) => {
                observed.saas = { tenantId, options };
                return { subscription: { status: 'active' }, entitlements: { features: {} } };
            },
            enforceRequestLimit: async () => {}
        },
        isAuthorizedCronRequest: () => false
    });
    const request = {
        method: 'GET',
        path: '/members',
        query: {},
        body: {},
        ip: '127.0.0.1',
        get: () => '',
        socket: { remoteAddress: '127.0.0.1' }
    };
    const response = responseDouble();
    let nextContext;
    await middleware(request, response, () => {
        nextContext = getTenantContext();
    });

    assert.equal(request.readOnlyRequest, true);
    assert.equal(observed.ensureAuthReady, undefined);
    assert.deepEqual(observed.session.options, {
        includePermissions: false,
        ensureReady: false,
        touch: false,
        readOnly: true
    });
    assert.deepEqual(observed.tenant.options, { readOnly: true });
    assert.equal(observed.saas.options.readOnly, true);
    assert.equal(observed.permissions.readOnly, true);
    assert.equal(nextContext.readOnlyBaseline, false);
});

test('the explicit performance baseline header is the only source of strict SQL baseline mode', async () => {
    const observed = {};
    const middleware = createAuthApiMiddleware({
        authService: {
            getSessionUser: async (token, options) => {
                observed.session = { token, options };
                return { id: 17, role: 'Owner' };
            },
            readSessionCookie: () => 'session-token',
            withPermissions: async (user, options) => {
                observed.permissions = options;
                return user;
            }
        },
        tenantService: {
            resolveTenantForUser: async (userId, slug, options) => {
                observed.tenant = { userId, slug, options };
                return { id: 23, status: 'active' };
            }
        },
        saasService: {
            enforceTenantAccess: async (tenantId, options) => {
                observed.saas = { tenantId, options };
                return { subscription: { status: 'active' }, entitlements: { features: {} } };
            },
            enforceRequestLimit: async () => {}
        },
        isAuthorizedCronRequest: () => false
    });
    const request = {
        method: 'GET',
        path: '/members',
        readOnlyBaseline: true,
        query: {},
        body: {},
        get: (name) => String(name).toLowerCase() === 'x-logic-fit-baseline' ? 'read-only' : '',
        socket: { remoteAddress: '127.0.0.1' }
    };
    let context;
    await middleware(request, responseDouble(), () => {
        context = getTenantContext();
    });

    assert.equal(request.readOnlyRequest, true);
    assert.equal(observed.session.options.readOnly, true);
    assert.equal(observed.permissions.readOnly, true);
    assert.equal(observed.tenant.options.readOnly, true);
    assert.equal(observed.saas.options.readOnly, true);
    assert.equal(context.readOnlyBaseline, true);
});

test('tenant access failure explains the missing membership mapping without claiming SaaS expiry', async () => {
    const middleware = createAuthApiMiddleware({
        authService: {
            getSessionUser: async () => ({ id: 17, role: 'Owner' }),
            withPermissions: async (user) => user,
            readSessionCookie: () => 'session-token'
        },
        tenantService: {
            resolveTenantForUser: async () => null
        },
        isAuthorizedCronRequest: () => false
    });
    const request = {
        method: 'GET',
        path: '/permissions',
        query: {},
        body: {},
        get: () => '',
        socket: { remoteAddress: '127.0.0.1' }
    };
    const response = responseDouble();

    await middleware(request, response, () => {});

    assert.equal(response.statusCode, 403);
    assert.equal(response.body.code, 'TENANT_ACCESS_REQUIRED');
    assert.equal(response.body.error, 'الحساب غير مرتبط بجيم نشط، أو أن الجيم المطلوب لا يطابق عضوية الحساب.');
});

test('the authorized backup cron remains the explicit state-changing GET exception', async () => {
    let context;
    const middleware = createAuthApiMiddleware({
        authService: {},
        tenantService: {
            resolvePublicTenant: async () => { throw new Error('backup cron must not resolve a public/default tenant'); }
        },
        isAuthorizedCronRequest: () => true
    });
    const request = {
        method: 'GET',
        path: '/backup/daily',
        query: {},
        body: {},
        get: () => '',
        socket: { remoteAddress: '127.0.0.1' }
    };
    await middleware(request, responseDouble(), () => {
        context = getTenantContext();
    });

    assert.equal(request.readOnlyRequest, false);
    assert.equal(context.tenantId, null);
    assert.equal(context.mode, 'platform');
    assert.equal(context.readOnlyBaseline, false);
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
