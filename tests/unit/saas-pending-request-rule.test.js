'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..', '..');
const service = fs.readFileSync(path.join(root, 'src/services/saas-service.js'), 'utf8');
const start = service.indexOf('async function submitSubscriptionRequest');
const end = service.indexOf('\nasync function listPlatformRequests', start);
const submit = service.slice(start, end);

test('a tenant lock serializes submissions before the canonical pending-row check', () => {
    const tenantLock = submit.indexOf('FROM dbo.gym_tenants WITH (UPDLOCK,HOLDLOCK)');
    const pendingLock = submit.indexOf("FROM dbo.saas_subscription_requests r WITH (UPDLOCK,HOLDLOCK) WHERE r.tenant_id=@tenantId AND r.status='pending'");
    assert.ok(tenantLock >= 0 && pendingLock > tenantLock);
    assert.match(submit, /if \(pending\.recordset\[0\]\) throw saasError\([^\n]*SAAS_REQUEST_ALREADY_PENDING/);
});

test('incomplete pending rows are rejected rather than reused or completed', () => {
    assert.doesNotMatch(submit, /incompleteRequest|subscription_request_completed/);
    assert.doesNotMatch(submit, /UPDATE dbo\.saas_subscription_requests SET[\s\S]*?status='pending'/);
    assert.match(service, /CREATE UNIQUE INDEX UQ_saas_requests_pending_tenant ON dbo\.saas_subscription_requests\(tenant_id\) WHERE status='pending'/);
});
