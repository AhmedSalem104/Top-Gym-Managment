'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { assertSafeDatabaseTarget, normalizedHost } = require('../../scripts/verification-target');

const LOCAL_CONNECTION = 'Server=127.0.0.1;Database=logicfit_qa;User Id=qa_user;Password=qa_password;Encrypt=True;TrustServerCertificate=False;';
const STAGING_CONNECTION = 'Server=staging-sql.example;Database=logicfit_stage;User Id=qa_user;Password=qa_password;Encrypt=True;TrustServerCertificate=False;';

test('verification target host normalization preserves loopback IPv6', () => {
    assert.equal(normalizedHost('::1'), '::1');
    assert.equal(normalizedHost('[::1]'), '::1');
    assert.equal(normalizedHost('staging-sql.example:1433'), 'staging-sql.example');
});

test('verification database target accepts an explicitly confirmed local target', () => {
    assert.deepEqual(assertSafeDatabaseTarget({
        connectionString: LOCAL_CONNECTION,
        environment: 'local',
        confirmation: 'local',
        purpose: 'Synthetic QA'
    }), { environment: 'local', localTarget: true });
});

test('verification database target requires explicit staging confirmation and host allow-list', () => {
    assert.throws(() => assertSafeDatabaseTarget({
        connectionString: STAGING_CONNECTION,
        environment: 'staging',
        confirmation: 'staging',
        purpose: 'Synthetic QA'
    }), /allowed staging database host/);
    assert.throws(() => assertSafeDatabaseTarget({
        connectionString: STAGING_CONNECTION,
        environment: 'staging',
        confirmation: 'staging',
        allowedHosts: 'other-sql.example',
        purpose: 'Synthetic QA'
    }), /allowed staging database host/);
    assert.deepEqual(assertSafeDatabaseTarget({
        connectionString: STAGING_CONNECTION,
        environment: 'staging',
        confirmation: 'staging',
        allowedHosts: 'staging-sql.example',
        purpose: 'Synthetic QA'
    }), { environment: 'staging', localTarget: false });
});

test('verification database target rejects production-like environments and names', () => {
    assert.throws(() => assertSafeDatabaseTarget({
        connectionString: LOCAL_CONNECTION,
        environment: 'production',
        confirmation: 'production',
        purpose: 'Synthetic QA'
    }), /explicit local, development, test, or staging/);
    assert.throws(() => assertSafeDatabaseTarget({
        connectionString: 'Server=prod-sql.example;Database=logicfit_stage;User Id=qa_user;Password=qa_password;',
        environment: 'staging',
        confirmation: 'staging',
        allowedHosts: 'prod-sql.example',
        purpose: 'Synthetic QA'
    }), /production-like/);
});
