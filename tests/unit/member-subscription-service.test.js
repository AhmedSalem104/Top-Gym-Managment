'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const service = require('../../src/services/member-subscription-service');
const memberService = require('../../src/services/member-service');

const schema = fs.readFileSync(path.join(__dirname, '../../database/migrations/011-commercial-portal-and-registration.sql'), 'utf8');
const source = fs.readFileSync(path.join(__dirname, '../../src/services/member-subscription-service.js'), 'utf8');
const memberSource = fs.readFileSync(path.join(__dirname, '../../src/services/member-service.js'), 'utf8');

test('member request pending uniqueness is scoped by request type', () => {
    assert.match(schema, /ON dbo\.gym_member_subscription_requests\(tenant_id, member_id, request_type\)/);
    assert.doesNotMatch(schema, /ON dbo\.gym_member_subscription_requests\(tenant_id, member_id\)\s*WHERE status='pending'/);
    assert.equal(service.normalizeRequestType('membership'), 'membership');
    assert.equal(service.normalizeRequestType('extension'), 'extension');
    assert.equal(service.normalizeRequestType('renewal'), 'renewal');
});

test('member payment collection date is captured on the request and carried into approval', () => {
    assert.match(schema, /payment_date DATE NULL/);
    assert.match(source, /paymentDate: formatDateOnly\(row\.payment_date\)/);
    assert.match(source, /const paymentDate = normalizePaymentDate\(body\.paymentDate \|\| body\.paidAt\)/);
    assert.match(source, /paymentDateOverride \|\| formatDateOnly\(locked\.payment_date\)/);
    assert.match(source, /paymentDate,/);
    assert.match(memberSource, /function requiredPaymentCollectionDate\(value\)/);
    assert.match(memberSource, /requiredPaymentCollectionDate\(body\.paidAt \|\| body\.paymentDate\)/);
    assert.doesNotMatch(memberSource, /paymentDateDefault \|\| current\.paid_at/);
    assert.match(memberSource, /const collectionDate = requiredPaymentCollectionDate\(paymentDate\)/);
    assert.match(memberSource, /paidAt: collectionDate/);
});

test('future request types are schema-compatible but unsupported flows fail closed', () => {
    assert.throws(() => service.normalizeRequestType('freeze'), (error) => error.code === 'MEMBER_SUBSCRIPTION_REQUEST_TYPE_UNSUPPORTED');
    assert.match(source, /pending uniqueness by request_type/);
    assert.match(source, /SUPPORTED_REQUEST_TYPES/);
    assert.match(source, /request_type IN \('membership','extension','renewal'\)/);
});

test('portal request scope comes from the resolved session and tenant is explicit in every query', () => {
    assert.match(source, /commercialService\.withPortalSession\(request/);
    assert.match(source, /const tenantId = currentTenantId\(\{ required: true \}\)/);
    assert.match(source, /WHERE id=@memberId AND tenant_id=@tenantId/);
    assert.match(source, /WHERE r\.id=@requestId AND r\.tenant_id=@tenantId/);
    assert.doesNotMatch(source, /tenantId:\s*body\.tenantId/);
    assert.doesNotMatch(source, /memberId:\s*body\.memberId/);
});

test('portal request history selects and returns the review reason for rejected requests', () => {
    assert.match(source, /r\.review_notes/);
    assert.match(source, /reviewNotes: row\.review_notes \|\| ''/);
    assert.equal(
        service.requestFromRow({ id: 9, status: 'rejected', member_id: 41, review_notes: 'إثبات الدفع غير مرفق.' }).reviewNotes,
        'إثبات الدفع غير مرفق.'
    );
});

test('approval locks the request, verifies its private proof, and reuses the membership transaction helper', () => {
    assert.match(source, /getRequestRow\(requestId, tenantId, \{ transaction, lock: true \}\)/);
    assert.match(source, /storage\.getPrivateObject\(\{ tenantId, key: requestRow\.storage_key \}\)/);
    assert.match(source, /memberService\.createMembershipFromApprovedRequest\(\{/);
    assert.match(source, /status='approved'/);
    assert.match(source, /sourceRequestId: locked\.id/);
    assert.match(source, /saasService\.recordAudit\(\{/);
});

test('renewal dates continue after the effective membership period and use today only after expiry', () => {
    assert.deepEqual(
        memberService.calculateRenewalWindow({
            currentEndDate: '2026-09-10',
            durationMode: 'months',
            durationValue: 1,
            today: '2026-08-31'
        }),
        {
            effectiveEndDate: '2026-09-10',
            startDate: '2026-09-11',
            endDate: '2026-10-10'
        }
    );
    assert.deepEqual(
        memberService.calculateRenewalWindow({
            currentEndDate: '2026-09-30',
            durationMode: 'months',
            durationValue: 1,
            today: '2026-09-01'
        }),
        {
            effectiveEndDate: '2026-09-30',
            startDate: '2026-10-01',
            endDate: '2026-10-30'
        }
    );
    assert.deepEqual(
        memberService.calculateRenewalWindow({
            currentEndDate: '2026-08-20',
            durationMode: 'months',
            durationValue: 1,
            today: '2026-08-31'
        }),
        {
            effectiveEndDate: '2026-08-20',
            startDate: '2026-08-31',
            endDate: '2026-09-29'
        }
    );
});

test('renewal dates include recorded freeze days and are guarded by a valid duration snapshot', () => {
    assert.deepEqual(
        memberService.calculateRenewalWindow({
            currentEndDate: '2026-09-10',
            freezeDays: 5,
            durationMode: 'days',
            durationValue: 15,
            today: '2026-08-31'
        }),
        {
            effectiveEndDate: '2026-09-15',
            startDate: '2026-09-16',
            endDate: '2026-09-30'
        }
    );
    assert.throws(
        () => memberService.calculateRenewalWindow({ currentEndDate: '2026-09-10', durationMode: 'weeks', durationValue: 1, today: '2026-08-31' }),
        (error) => error.code === 'MEMBERSHIP_RENEWAL_SNAPSHOT_INVALID'
    );
});

test('portal operation is selected from membership state and blocks active freezes', () => {
    assert.equal(
        memberService.membershipRequestScenario({ today: '2026-09-01' }).requestType,
        'membership'
    );
    assert.equal(
        memberService.membershipRequestScenario({
            currentMembership: { id: 10, end_date: '2026-09-29', cancelled_at: null },
            today: '2026-09-01'
        }).requestType,
        'extension'
    );
    assert.equal(
        memberService.membershipRequestScenario({
            currentMembership: { id: 10, end_date: '2026-08-20', cancelled_at: null },
            today: '2026-09-01'
        }).requestType,
        'renewal'
    );
    assert.throws(
        () => memberService.membershipRequestScenario({
            currentMembership: { id: 10, end_date: '2026-09-29', cancelled_at: null },
            activeFreeze: { id: 3 },
            today: '2026-09-01'
        }),
        (error) => error.code === 'MEMBERSHIP_FREEZE_ACTIVE' && error.statusCode === 409
    );
});

test('approval recomputes renewal dates inside the membership transaction and persists the authoritative window', () => {
    assert.match(memberSource, /function calculateRenewalWindow\(/);
    assert.match(memberSource, /async function resolveRenewalDates\(/);
    assert.match(memberSource, /MEMBER_RENEWAL_REQUIRES_EXISTING/);
    assert.match(source, /durationMode: locked\.duration_mode/);
    assert.match(source, /durationValue: Number\(locked\.duration_value\)/);
    assert.match(source, /SET request_type=@requestType,start_date=@startDate,end_date=@endDate/);
    assert.match(memberSource, /normalizedRequestType = scenario\.requestType/);
    assert.match(memberSource, /\['extension', 'renewal'\]\.includes\(normalizedRequestType\)/);
    assert.match(source, /createdResult\.requestType/);
});

test('member proof upload is private, checks integrity, and only records verified storage', () => {
    assert.match(source, /category: 'payment-proofs'/);
    assert.match(source, /storage\.verifyPrivateObject\(\{/);
    assert.match(source, /storage_verified_at=SYSUTCDATETIME\(\)/);
    assert.match(source, /storage\.deletePrivateObject/);
    assert.match(source, /idempotencyKeyHash/);
});

test('member request creation requires a verified proof and persists it atomically with the request', () => {
    assert.match(source, /async function createPortalRequest\(request, body = \{\}, proofInput = null\)/);
    assert.match(source, /Payment proof is required before submitting the request/);
    assert.match(source, /storage\.putPrivateObject\(\{/);
    assert.match(source, /await storage\.verifyPrivateObject\(\{/);
    assert.match(source, /INSERT INTO dbo\.gym_member_subscription_payment_proofs/);
    assert.match(source, /objectReferenced = true/);
});

test('direct request creation without a proof is rejected before session or database work', async () => {
    await assert.rejects(
        service.createPortalRequest({}, {}),
        (error) => error.code === 'PAYMENT_PROOF_REQUIRED' && error.statusCode === 422
    );
});

test('member approval keeps the proof checksum alias used by the final integrity check', () => {
    assert.match(source, /p\.file_size AS proof_file_size,p\.sha256 AS proof_sha256/);
    assert.match(source, /String\(requestRow\.proof_sha256 \|\| ''\)\.trim\(\)\.toLowerCase\(\)/);
    assert.match(source, /Number\(initialProof\?\.proof_file_size\)/);
    assert.match(source, /initialProof\?\.proof_sha256/);
});

test('idempotency keys are stored as a scoped digest, never as the raw key', () => {
    const raw = 'member-request-test-key-001';
    const digest = service.idempotencyKeyHash(raw, 11, 42, 'membership');
    assert.match(digest, /^[a-f0-9]{64}$/);
    assert.notEqual(digest, raw);
    assert.throws(() => service.idempotencyKeyHash('short', 11, 42, 'membership'), (error) => error.code === 'INVALID_IDEMPOTENCY_KEY');
});
