'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
    SAAS_SCHEMA_SQL,
    isDuplicateSqlError
} = require('../../src/services/saas-service');

test('SaaS subscription requests enforce one pending request per tenant', () => {
    assert.match(SAAS_SCHEMA_SQL, /HAVING COUNT_BIG\(\*\) > 1/);
    assert.match(SAAS_SCHEMA_SQL, /THROW 51008/);
    assert.match(SAAS_SCHEMA_SQL, /CREATE UNIQUE INDEX UQ_saas_requests_pending_tenant ON dbo\.saas_subscription_requests\(tenant_id\) WHERE status='pending'/);
});

test('duplicate SQL errors are recognized for the pending-request race guard', () => {
    assert.equal(isDuplicateSqlError({ number: 2601 }), true);
    assert.equal(isDuplicateSqlError({ number: 2627 }), true);
    assert.equal(isDuplicateSqlError({ number: 547 }), false);
    assert.equal(isDuplicateSqlError(null), false);
});
