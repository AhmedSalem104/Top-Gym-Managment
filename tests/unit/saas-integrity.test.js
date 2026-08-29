'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
    SAAS_SCHEMA_SQL,
    isDuplicateSqlError
} = require('../../src/services/saas-service');
const fs = require('node:fs');
const path = require('node:path');

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

test('payment-proof reads propagate read-only mode to schema readiness', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../src/services/saas-service.js'), 'utf8');
    assert.match(source, /async function getPaymentProofFile\(proofId, tenantId = null, \{ readOnly = false \} = \{\}\)/);
    assert.match(source, /async function getPaymentProofFile[\s\S]*?ensureSaasTables\(\{ readOnly \}\)/);
});
