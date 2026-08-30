'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const service = require('../../src/services/member-subscription-service');

const schema = fs.readFileSync(path.join(__dirname, '../../database/migrations/011-commercial-portal-and-registration.sql'), 'utf8');
const source = fs.readFileSync(path.join(__dirname, '../../src/services/member-subscription-service.js'), 'utf8');

test('member request pending uniqueness is scoped by request type', () => {
    assert.match(schema, /ON dbo\.gym_member_subscription_requests\(tenant_id, member_id, request_type\)/);
    assert.doesNotMatch(schema, /ON dbo\.gym_member_subscription_requests\(tenant_id, member_id\)\s*WHERE status='pending'/);
    assert.equal(service.normalizeRequestType('membership'), 'membership');
    assert.equal(service.normalizeRequestType('renewal'), 'renewal');
});

test('future request types are schema-compatible but unsupported flows fail closed', () => {
    assert.throws(() => service.normalizeRequestType('freeze'), (error) => error.code === 'MEMBER_SUBSCRIPTION_REQUEST_TYPE_UNSUPPORTED');
    assert.match(source, /pending uniqueness by request_type/);
    assert.match(source, /SUPPORTED_REQUEST_TYPES/);
});

test('portal request scope comes from the resolved session and tenant is explicit in every query', () => {
    assert.match(source, /commercialService\.withPortalSession\(request/);
    assert.match(source, /const tenantId = currentTenantId\(\{ required: true \}\)/);
    assert.match(source, /WHERE id=@memberId AND tenant_id=@tenantId/);
    assert.match(source, /WHERE r\.id=@requestId AND r\.tenant_id=@tenantId/);
    assert.doesNotMatch(source, /tenantId:\s*body\.tenantId/);
    assert.doesNotMatch(source, /memberId:\s*body\.memberId/);
});

test('approval locks the request, verifies its private proof, and reuses the membership transaction helper', () => {
    assert.match(source, /getRequestRow\(requestId, tenantId, \{ transaction, lock: true \}\)/);
    assert.match(source, /storage\.getPrivateObject\(\{ tenantId, key: requestRow\.storage_key \}\)/);
    assert.match(source, /memberService\.createMembershipFromApprovedRequest\(\{/);
    assert.match(source, /status='approved'/);
    assert.match(source, /sourceRequestId: locked\.id/);
    assert.match(source, /saasService\.recordAudit\(\{/);
});

test('member proof upload is private, checks integrity, and only records verified storage', () => {
    assert.match(source, /category: 'payment-proofs'/);
    assert.match(source, /storage\.verifyPrivateObject\(\{/);
    assert.match(source, /storage_verified_at=SYSUTCDATETIME\(\)/);
    assert.match(source, /storage\.deletePrivateObject/);
    assert.match(source, /idempotencyKeyHash/);
});

test('idempotency keys are stored as a scoped digest, never as the raw key', () => {
    const raw = 'member-request-test-key-001';
    const digest = service.idempotencyKeyHash(raw, 11, 42, 'membership');
    assert.match(digest, /^[a-f0-9]{64}$/);
    assert.notEqual(digest, raw);
    assert.throws(() => service.idempotencyKeyHash('short', 11, 42, 'membership'), (error) => error.code === 'INVALID_IDEMPOTENCY_KEY');
});
