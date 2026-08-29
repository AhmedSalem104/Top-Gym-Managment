'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');

const {
    aggregate,
    compareValue,
    parseServerTiming,
    requireTargetUrl,
    runRoutes,
    validateTarget
} = require('../../scripts/performance-baseline');
const { assertReadOnlySql, hasPersistentSqlMutation } = require('../../src/database/pool');
const { readOnlyBaselineGuard } = require('../../src/middleware/read-only-baseline.middleware');
const { runTenantContext } = require('../../src/tenancy/tenant-context');
const { ensureMembershipCodeStorage } = require('../../src/services/membership-code-service');
const { ensureAlertContactTables } = require('../../src/services/alert-contact-service');

function withEnvironment(values, callback) {
    const previous = new Map(Object.keys(values).map((key) => [key, process.env[key]]));
    try {
        for (const [key, value] of Object.entries(values)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
        return callback();
    } finally {
        for (const [key, value] of previous) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    }
}

test('baseline parser exposes only safe Server-Timing metrics', () => {
    assert.deepEqual(parseServerTiming('app;dur=10.25, db;dur=6.50, db-work;dur=8.75, db-queries;desc="2", sql;desc="secret"'), {
        appMs: 10.25,
        dbMs: 6.5,
        dbWorkMs: 8.75,
        dbQueries: 2
    });
});

test('aggregate separates total, database, and network/application measurements', () => {
    const result = aggregate([
        { status: 200, durationMs: 100, payloadBytes: 20, timeout: false, timing: { appMs: 80, dbMs: 50, dbWorkMs: 60, dbQueries: 2 } },
        { status: 500, durationMs: 120, payloadBytes: 30, timeout: false, timing: { appMs: 90, dbMs: 70, dbWorkMs: 75, dbQueries: 3 } },
        { status: 0, durationMs: 200, payloadBytes: 0, timeout: true, timing: {} }
    ]);

    assert.equal(result.totalRequests, 3);
    assert.equal(result.successfulRequests, 1);
    assert.equal(result.failedRequests, 2);
    assert.equal(result.timeoutCount, 1);
    assert.equal(result.statusDistribution['200'], 1);
    assert.equal(result.statusDistribution['500'], 1);
    assert.equal(result.statusDistribution['0'], 1);
    assert.equal(result.dbTiming, 'AVAILABLE');
    assert.equal(result.serverApplicationOverheadMs.average, 25);
    assert.equal(result.applicationNetworkOverheadMs.average, 50);
    assert.equal(result.responseSizeBytes.average, 16.67);
});

test('baseline runner sends only GET requests and does not retain response bodies', async () => {
    const requests = [];
    const server = http.createServer((request, response) => {
        requests.push({ method: request.method, cookie: request.headers.cookie || null });
        response.setHeader('Content-Type', 'application/json');
        response.setHeader('Server-Timing', 'app;dur=10, db;dur=6, db-work;dur=8, db-queries;desc="2"');
        response.end(JSON.stringify({ id: 7, memberName: 'fixture-only' }));
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    try {
        const result = await runRoutes(baseUrl, 'session=redacted-test-value', [{
            name: 'fixture',
            path: '/api/fixture',
            captureBody: (body) => Number(body?.id || 0) || null
        }], {
            samples: 3,
            warmups: 1,
            concurrency: 2,
            timeoutMs: 2_000,
            delayMs: 0
        });
        const route = result.results[0];
        assert.equal(requests.length, 4);
        assert.ok(requests.every((item) => item.method === 'GET'));
        assert.ok(requests.every((item) => item.cookie === 'session=redacted-test-value'));
        assert.equal(route.totalRequests, 3);
        assert.equal(route.warmup.totalRequests, 1);
        assert.equal(route.successfulRequests, 3);
        assert.equal(route.dbTiming, 'AVAILABLE');
        assert.equal(route.dbLatencyMs.p95, 6);
        assert.equal(route.responseSizeBytes.max, 36);
        assert.equal(Object.prototype.hasOwnProperty.call(route, 'responseBody'), false);
        assert.equal(Object.prototype.hasOwnProperty.call(route, 'body'), false);
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
});

test('baseline runner does not follow redirects to another target', async () => {
    const paths = [];
    const server = http.createServer((request, response) => {
        paths.push(request.url);
        if (request.url === '/api/fixture') {
            response.writeHead(302, { Location: 'https://unapproved.example/api/fixture' });
            response.end();
            return;
        }
        response.writeHead(500);
        response.end();
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    try {
        const result = await runRoutes(baseUrl, '', [{ name: 'fixture', path: '/api/fixture' }], {
            samples: 1,
            warmups: 1,
            concurrency: 1,
            timeoutMs: 2_000,
            delayMs: 0
        });
        assert.deepEqual(paths, ['/api/fixture', '/api/fixture']);
        assert.equal(result.results[0].statusDistribution['302'], 1);
        assert.equal(result.results[0].failedRequests, 1);
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
});

test('read-only guard rejects accidental write methods', () => {
    let nextCalled = false;
    const response = {
        statusCode: 200,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.payload = payload;
            return this;
        }
    };
    readOnlyBaselineGuard({ method: 'POST', get: () => 'read-only' }, response, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(response.statusCode, 405);
    assert.equal(response.payload.code, 'BASELINE_READ_ONLY');
});

test('database guard blocks persistent SQL mutations but permits temporary query state', () => {
    assert.equal(hasPersistentSqlMutation('SELECT * FROM dbo.members WHERE id=@id;'), false);
    assert.equal(hasPersistentSqlMutation('SELECT * INTO #member_rows FROM source_rows; INSERT INTO @ids VALUES (1); DROP TABLE #member_rows;'), false);
    assert.equal(hasPersistentSqlMutation("UPDATE dbo.members SET full_name='x' WHERE id=@id;"), true);
    assert.equal(hasPersistentSqlMutation('CREATE TABLE dbo.baseline_probe (id int);'), true);
    assert.equal(hasPersistentSqlMutation("SELECT 'UPDATE dbo.members SET full_name = ''x''' AS sample;"), false);
    assert.throws(() => assertReadOnlySql('DELETE FROM dbo.members WHERE id=@id;', { readOnlyBaseline: true }), (error) => error.code === 'BASELINE_SQL_WRITE_BLOCKED' && error.statusCode === 405);
});

test('membership-code storage setup is skipped in a read-only tenant context', async () => {
    const result = await runTenantContext({ tenantId: 1, mode: 'tenant', readOnlyBaseline: true }, () => ensureMembershipCodeStorage());
    assert.equal(result, undefined);
});

test('alert-contact storage setup is skipped in a read-only tenant context', async () => {
    const result = await runTenantContext({ tenantId: 1, mode: 'tenant', readOnlyBaseline: true }, () => ensureAlertContactTables());
    assert.equal(result, undefined);
});

test('target guard blocks production-like or unapproved external targets', () => {
    withEnvironment({ PERF_BASELINE_ENV: undefined, PERF_BASELINE_CONFIRM: undefined, PERF_BASELINE_ALLOWED_HOSTS: undefined, VERCEL_ENV: undefined }, () => {
        assert.equal(validateTarget('http://127.0.0.1:3010').environment, 'local');
        assert.throws(() => validateTarget('https://staging.logicfit.example'), /PERF_BASELINE_ENV must be/);
    });

    withEnvironment({ PERF_BASELINE_ENV: 'staging', PERF_BASELINE_CONFIRM: 'staging', PERF_BASELINE_ALLOWED_HOSTS: 'staging.logicfit.example,production.logicfit.example', VERCEL_ENV: 'preview' }, () => {
        assert.equal(validateTarget('https://staging.logicfit.example').environment, 'staging');
        assert.throws(() => validateTarget('https://production.logicfit.example'), /Production-like/);
        assert.throws(() => validateTarget('https://gym-membership-app-smoky.vercel.app'), /Production-like/);
        assert.throws(() => validateTarget('https://admin.voltyks.app'), /Production-like/);
        assert.throws(() => validateTarget('https://gym-membership-evbhm7puy-ahmedsalem104s-projects.vercel.app'), /Production-like/);
        assert.throws(() => validateTarget('https://other.logicfit.example'), /ALLOWED_HOSTS/);
    });
});

test('target guard is evaluated before an unauthenticated run can be skipped', () => {
    withEnvironment({ PERF_BASELINE_ENV: 'staging', PERF_BASELINE_CONFIRM: 'staging', PERF_BASELINE_ALLOWED_HOSTS: 'app.logicfit.example', VERCEL_ENV: 'production', QA_BASE_URL: 'https://app.logicfit.example' }, () => {
        assert.throws(() => validateTarget(process.env.QA_BASE_URL), /Production-like/);
    });
});

test('an authenticated baseline requires an explicit prepared target URL', () => {
    assert.equal(requireTargetUrl('', false), '');
    assert.throws(() => requireTargetUrl('', true), /QA_BASE_URL is required/);
});

test('comparison marks small changes as statistically insignificant for baseline purposes', () => {
    assert.equal(compareValue(100, 102).interpretation, 'NO SIGNIFICANT CHANGE');
    assert.equal(compareValue(100, 80).interpretation, 'IMPROVEMENT');
    assert.equal(compareValue(100, 130).interpretation, 'REGRESSION');
});
