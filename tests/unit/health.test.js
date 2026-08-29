'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createHealthHandler, createLivenessHandler } = require('../../src/routes');

function responseDouble() {
    return {
        statusCode: 200,
        body: null,
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

test('liveness handler is tenant-neutral and does not require a database', async () => {
    const response = responseDouble();
    const handler = createLivenessHandler();
    await handler({ requestId: 'live-test' }, response);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, {
        ok: true,
        status: 'alive',
        checks: { application: { status: 'healthy' } },
        requestId: 'live-test'
    });
});

test('health handler reports safe application and database status', async () => {
    const response = responseDouble();
    let tick = 10;
    const handler = createHealthHandler({
        getPool: async () => ({ request: () => ({ query: async () => ({ recordset: [{ ok: 1 }] }) }) }),
        now: () => (tick += 7)
    });

    await handler({ requestId: 'health-test' }, response);

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, {
        ok: true,
        status: 'healthy',
        database: 'connected',
        checks: {
            application: { status: 'healthy' },
            database: { status: 'healthy', durationMs: 7 },
            storage: { status: 'not_configured' }
        },
        requestId: 'health-test'
    });
});

test('health handler returns 503 without exposing database errors', async () => {
    const response = responseDouble();
    let tick = 100;
    const handler = createHealthHandler({
        getPool: async () => { throw new Error('secret connection string details'); },
        now: () => (tick += 11)
    });

    await handler({ requestId: 'health-failure-test' }, response);

    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.body, {
        ok: false,
        status: 'degraded',
        database: 'unavailable',
        checks: {
            application: { status: 'healthy' },
            database: { status: 'unhealthy', durationMs: 11 },
            storage: { status: 'not_configured' }
        },
        requestId: 'health-failure-test'
    });
    assert.doesNotMatch(JSON.stringify(response.body), /secret connection string/i);
});
