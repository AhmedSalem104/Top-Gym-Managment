'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const { parseConnectionString } = require('../../src/database/pool');

const connectionString = 'Server=localhost,1433;Database=logic_fit_test;User Id=test-user;Password=test-password;Encrypt=False;TrustServerCertificate=True;';

test('SQL pool keeps the existing conservative defaults', () => {
    const parsed = parseConnectionString(connectionString);
    assert.deepEqual(parsed.pool, { max: 10, min: 0, idleTimeoutMillis: 30_000 });
    assert.equal(parsed.connectionTimeout, 30_000);
    assert.equal(parsed.requestTimeout, 120_000);
});

test('SQL pool environment overrides are bounded and min never exceeds max', () => {
    const script = `
        const { parseConnectionString } = require('./src/database/pool');
        const parsed = parseConnectionString(${JSON.stringify(connectionString)});
        process.stdout.write(JSON.stringify(parsed.pool));
    `;
    const result = spawnSync(process.execPath, ['-e', script], {
        cwd: require('node:path').join(__dirname, '..', '..'),
        env: {
            ...process.env,
            MSSQL_POOL_MAX: '250',
            MSSQL_POOL_MIN: '80',
            MSSQL_POOL_IDLE_TIMEOUT_MS: '10'
        },
        encoding: 'utf8'
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { max: 100, min: 80, idleTimeoutMillis: 1_000 });
});

test('SQL connection and request timeouts are finite and bounded', () => {
    const script = `
        const { config } = require('./src/config/env');
        process.stdout.write(JSON.stringify({ connection: config.mssqlConnectionTimeout, request: config.mssqlRequestTimeout }));
    `;
    const result = spawnSync(process.execPath, ['-e', script], {
        cwd: require('node:path').join(__dirname, '..', '..'),
        env: {
            ...process.env,
            MSSQL_CONNECTION_TIMEOUT: '-10',
            MSSQL_REQUEST_TIMEOUT: '999999999'
        },
        encoding: 'utf8'
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { connection: 1_000, request: 600_000 });
});

test('SQL connection string rejects an invalid port early', () => {
    assert.throws(
        () => parseConnectionString('Server=localhost,99999;Database=logic_fit_test;User Id=test;Password=test;'),
        /port is invalid/i
    );
});

test('production performance metrics require an explicit second opt-in', () => {
    const script = `
        const { config } = require('./src/config/env');
        process.stdout.write(String(config.performanceMetricsEnabled));
    `;
    const baseEnvironment = {
        ...process.env,
        NODE_ENV: 'production',
        PERFORMANCE_METRICS: 'true'
    };
    const disabled = spawnSync(process.execPath, ['-e', script], {
        cwd: require('node:path').join(__dirname, '..', '..'),
        env: { ...baseEnvironment, PERFORMANCE_METRICS_PRODUCTION: 'false' },
        encoding: 'utf8'
    });
    const enabled = spawnSync(process.execPath, ['-e', script], {
        cwd: require('node:path').join(__dirname, '..', '..'),
        env: { ...baseEnvironment, PERFORMANCE_METRICS_PRODUCTION: 'true' },
        encoding: 'utf8'
    });
    assert.equal(disabled.status, 0, disabled.stderr);
    assert.equal(enabled.status, 0, enabled.stderr);
    assert.equal(disabled.stdout, 'false');
    assert.equal(enabled.stdout, 'true');
});

test('trusted proxy hops are bounded and default to one only in production', () => {
    const script = `
        const { config } = require('./src/config/env');
        process.stdout.write(JSON.stringify({ nodeEnv: config.nodeEnv, hops: config.trustProxyHops }));
    `;
    const development = spawnSync(process.execPath, ['-e', script], {
        cwd: require('node:path').join(__dirname, '..', '..'),
        env: { ...process.env, NODE_ENV: 'development', TRUST_PROXY_HOPS: '99' },
        encoding: 'utf8'
    });
    const production = spawnSync(process.execPath, ['-e', script], {
        cwd: require('node:path').join(__dirname, '..', '..'),
        env: { ...process.env, NODE_ENV: 'production', TRUST_PROXY_HOPS: '' },
        encoding: 'utf8'
    });
    assert.equal(development.status, 0, development.stderr);
    assert.equal(production.status, 0, production.stderr);
    assert.deepEqual(JSON.parse(development.stdout), { nodeEnv: 'development', hops: 3 });
    assert.deepEqual(JSON.parse(production.stdout), { nodeEnv: 'production', hops: 1 });
});
