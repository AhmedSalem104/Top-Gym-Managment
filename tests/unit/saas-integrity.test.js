'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
    SAAS_SCHEMA_SQL,
    calculateApprovedSubscriptionExpiry,
    isDuplicateSqlError
} = require('../../src/services/saas-service');
const fs = require('node:fs');
const path = require('node:path');

test('SaaS subscription requests enforce one pending request per tenant', () => {
    assert.match(SAAS_SCHEMA_SQL, /HAVING COUNT_BIG\(\*\) > 1/);
    assert.match(SAAS_SCHEMA_SQL, /THROW 51008/);
    assert.match(SAAS_SCHEMA_SQL, /\)\s*\n\s*BEGIN\s*\n\s*THROW 51008/);
    assert.doesNotMatch(SAAS_SCHEMA_SQL, /\)\s*\n\s*;THROW 51008/);
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

test('platform reads receive the request read-only mode', () => {
    const serviceSource = fs.readFileSync(path.join(__dirname, '../../src/services/saas-service.js'), 'utf8');
    const platformController = fs.readFileSync(path.join(__dirname, '../../src/controllers/platform.controller.js'), 'utf8');
    const platformAdminController = fs.readFileSync(path.join(__dirname, '../../src/controllers/platform-admin.controller.js'), 'utf8');

    assert.match(serviceSource, /async function listTenants\(\{ readOnly = false \} = \{\}\) \{\s*if \(!readOnly\) await syncExpiredTenants\(\);/);
    assert.match(serviceSource, /async function getPlatformOverview\(\{ readOnly = false \} = \{\}\) \{\s*if \(!readOnly\) await syncExpiredTenants\(\);/);
    assert.match(platformController, /getPlatformOverview\(\{ readOnly: request\.readOnlyRequest \}\)/);
    assert.match(platformController, /listTenants\(\{ readOnly: request\.readOnlyRequest \}\)/);
    assert.match(platformController, /listAudit\(\{ limit: request\.query\?\.limit, readOnly: request\.readOnlyRequest \}\)/);
    assert.match(platformAdminController, /listAudit\(\{ limit: request\.query\?\.limit, readOnly: request\.readOnlyRequest \}\)/);
});

test('platform subscription requests use bounded server-side pagination', () => {
    const serviceSource = fs.readFileSync(path.join(__dirname, '../../src/services/saas-service.js'), 'utf8');
    const platformController = fs.readFileSync(path.join(__dirname, '../../src/controllers/platform.controller.js'), 'utf8');
    const platformAdminController = fs.readFileSync(path.join(__dirname, '../../src/controllers/platform-admin.controller.js'), 'utf8');
    const platformAdminClient = fs.readFileSync(path.join(__dirname, '../../public/js/platform-admin.js'), 'utf8');

    assert.match(serviceSource, /async function listPlatformRequests\(\{ status = '', page = 1, pageSize = 25, requestId = null, readOnly = false, includePagination = false \} = \{\}\)/);
    assert.match(serviceSource, /COUNT_BIG\(\*\) OVER\(\) AS total_count/);
    assert.match(serviceSource, /OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY/);
    assert.match(serviceSource, /const normalizedPageSize = Math\.min\(100, Math\.max\(1, Number\(pageSize\) \|\| 25\)\)/);
    assert.match(serviceSource, /listPlatformRequests\(\{ requestId: id \}\)/);
    assert.match(platformController, /includePagination: true/);
    assert.match(platformAdminController, /includePagination: true/);
    assert.match(platformAdminClient, /requestPage: 1/);
    assert.match(platformAdminClient, /data-request-page/);
});

test('tenant subscription history uses bounded server-side pagination', () => {
    const serviceSource = fs.readFileSync(path.join(__dirname, '../../src/services/saas-service.js'), 'utf8');
    const controllerSource = fs.readFileSync(path.join(__dirname, '../../src/controllers/saas.controller.js'), 'utf8');
    const clientSource = fs.readFileSync(path.join(__dirname, '../../public/js/pages/saas/saas.js'), 'utf8');
    const platformServiceSource = fs.readFileSync(path.join(__dirname, '../../src/services/platform-admin-service.js'), 'utf8');
    const platformControllerSource = fs.readFileSync(path.join(__dirname, '../../src/controllers/platform-admin.controller.js'), 'utf8');
    const platformClientSource = fs.readFileSync(path.join(__dirname, '../../public/js/platform-admin.js'), 'utf8');

    assert.match(serviceSource, /async function listTenantRequests\(tenantId = currentTenantId\(\{ required: true \}\), \{ readOnly = false, page = 1, pageSize = 25, requestId = null, includePagination = false \} = \{\}\)/);
    assert.match(serviceSource, /listTenantRequests\(id, \{ readOnly, page, pageSize, includePagination: true \}\)/);
    assert.match(serviceSource, /WHERE r\.tenant_id=@tenantId AND \(@requestId IS NULL OR r\.id=@requestId\)/);
    assert.match(serviceSource, /OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY/);
    assert.match(serviceSource, /requestsPagination: requestPage\.pagination/);
    assert.match(controllerSource, /page: request\.query\?\.page/);
    assert.match(controllerSource, /includePagination: true/);
    assert.match(clientSource, /saas\/subscription\?page=\$\{state\.requestPage\}&pageSize=25/);
    assert.match(clientSource, /data-saas-request-page/);
    assert.match(platformServiceSource, /async function getTenantProfile\(tenantId, \{ readOnly = false, paymentsPage = 1, paymentsPageSize = 25 \} = \{\}\)/);
    assert.match(platformServiceSource, /listTenantRequests\(id, \{ readOnly, page: paymentsPage, pageSize: paymentsPageSize, includePagination: true \}\)/);
    assert.match(platformServiceSource, /paymentsPagination: requests\.pagination/);
    assert.match(platformControllerSource, /paymentsPage: request\.query\?\.paymentsPage/);
    assert.match(platformClientSource, /profilePaymentsPage: 1/);
    assert.match(platformClientSource, /data-profile-payments-page/);
});

test('subscription rejection updates the request and audit atomically', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../src/services/saas-service.js'), 'utf8');
    const start = source.indexOf('async function rejectRequest');
    const end = source.indexOf('\nfunction normalizeTenantInput', start);
    const block = source.slice(start, end);

    assert.notEqual(start, -1);
    assert.notEqual(end, -1);
    assert.match(block, /if \(!Number\.isInteger\(id\) \|\| id <= 0\)/);
    assert.match(block, /await withTransaction\(async \(transaction\)/);
    assert.match(block, /WITH \(UPDLOCK,HOLDLOCK\)/);
    assert.match(block, /WHERE id=@requestId AND status='pending'/);
    assert.match(block, /executor: transaction/);
    assert.match(block, /publishSubscriptionDecision\(\{ type: 'saas_subscription_request_rejected'/);
});

test('subscription approval locks the request and commits the state transition atomically', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../src/services/saas-service.js'), 'utf8');
    const start = source.indexOf('async function approveRequest');
    const end = source.indexOf('\nasync function rejectRequest', start);
    const block = source.slice(start, end);

    assert.notEqual(start, -1);
    assert.notEqual(end, -1);
    assert.match(block, /await withTransaction\(async \(transaction\)/);
    assert.match(block, /FROM dbo\.saas_subscription_requests r WITH \(UPDLOCK,HOLDLOCK\)/);
    assert.match(block, /if \(request\.status !== 'pending'\)/);
    assert.match(block, /if \(!request\.proof_id\)/);
    assert.match(block, /status='approved'/);
    assert.match(block, /const term = selectPlanTerm\(requestedPlan, request\.term_code \|\| request\.billing_period, \{ allowLegacy: true \}\)/);
    assert.match(block, /const expectedPricing = priceSaasTerm\(term\)/);
    assert.match(block, /FROM dbo\.saas_tenant_subscriptions WITH \(UPDLOCK,HOLDLOCK\)/);
    assert.match(block, /status IN \('active','suspended'\) AND source='manual'/);
    assert.match(block, /price_snapshot>0 AND expires_at>@approvalTime/);
    assert.match(block, /calculateApprovedSubscriptionExpiry\(now, currentPaidSubscription, term\)/);
    assert.match(block, /input\('durationMonthsSnapshot', sql\.Int, snapshot\.durationMonths\)/);
    assert.match(block, /saas_tenant_subscriptions SET status='expired'/);
    assert.match(block, /INSERT INTO dbo\.saas_tenant_subscriptions/);
    assert.match(block, /UPDATE dbo\.gym_tenants SET status='active'/);
    assert.match(block, /action: 'subscription_approved'/);
    assert.match(block, /executor: transaction/);
    assert.match(block, /publishSubscriptionDecision\(\{ type: 'saas_subscription_request_approved'/);
});

test('sequential paid subscription approvals accumulate expiry from the remaining paid term', () => {
    const firstApprovalTime = new Date('2026-09-28T12:00:00.000Z');
    const firstExpiry = calculateApprovedSubscriptionExpiry(firstApprovalTime, null, { code: 'monthly', durationMonths: 1 });
    assert.equal(firstExpiry.toISOString(), '2026-10-28T12:00:00.000Z');

    const secondExpiry = calculateApprovedSubscriptionExpiry(firstApprovalTime, {
        status: 'active',
        source: 'manual',
        price_snapshot: 1499,
        expires_at: firstExpiry
    }, { code: 'quarterly', durationMonths: 3 });
    assert.equal(secondExpiry.toISOString(), '2027-01-28T12:00:00.000Z');
    assert.notEqual(secondExpiry.toISOString(), '2026-12-28T12:00:00.000Z');
});

test('paid remaining term carries across same or different plan because expiry is plan-independent', () => {
    const now = new Date('2026-09-28T12:00:00.000Z');
    const currentPaid = { status: 'active', source: 'manual', price_snapshot: 3999, expires_at: '2026-10-28T12:00:00.000Z' };
    assert.equal(calculateApprovedSubscriptionExpiry(now, currentPaid, { code: 'quarterly', durationMonths: 3 }).toISOString(), '2027-01-28T12:00:00.000Z');
    assert.equal(calculateApprovedSubscriptionExpiry(now, currentPaid, { code: 'semiannual', durationMonths: 6 }).toISOString(), '2027-04-28T12:00:00.000Z');
    assert.equal(calculateApprovedSubscriptionExpiry(now, { ...currentPaid, status: 'suspended' }, { code: 'quarterly', durationMonths: 3 }).toISOString(), '2027-01-28T12:00:00.000Z');
});

test('trial, expired, complimentary, or missing subscriptions do not extend the new paid term', () => {
    const now = new Date('2026-09-28T12:00:00.000Z');
    const term = { code: 'quarterly', durationMonths: 3 };
    const expected = '2026-12-28T12:00:00.000Z';
    for (const current of [
        null,
        { status: 'trial', source: 'trial', price_snapshot: 0, expires_at: '2026-10-28T12:00:00.000Z' },
        { status: 'active', source: 'trial', price_snapshot: 1499, expires_at: '2026-10-28T12:00:00.000Z' },
        { status: 'expired', source: 'manual', price_snapshot: 1499, expires_at: '2026-09-27T12:00:00.000Z' },
        { status: 'active', source: 'manual', price_snapshot: 1499, expires_at: '2026-09-27T12:00:00.000Z' },
        { status: 'active', source: 'admin', price_snapshot: 1499, expires_at: '2026-10-28T12:00:00.000Z' },
        { status: 'active', source: 'manual', price_snapshot: 0, expires_at: '2026-10-28T12:00:00.000Z' }
    ]) {
        assert.equal(calculateApprovedSubscriptionExpiry(now, current, term).toISOString(), expected);
    }
});

test('approval uses approval time when paid expiry is earlier and does not depend on scheduled plan changes', () => {
    const now = new Date('2026-09-28T12:00:00.000Z');
    const stalePaid = { status: 'active', source: 'manual', price_snapshot: 1499, expires_at: '2026-09-28T11:59:59.000Z' };
    assert.equal(calculateApprovedSubscriptionExpiry(now, stalePaid, { code: 'monthly', durationMonths: 1 }).toISOString(), '2026-10-28T12:00:00.000Z');

    const service = fs.readFileSync(path.join(__dirname, '../../src/services/saas-service.js'), 'utf8');
    const start = service.indexOf('async function approveRequest');
    const end = service.indexOf('\nasync function rejectRequest', start);
    const approval = service.slice(start, end);
    assert.doesNotMatch(approval, /saas_subscription_changes/);
});

test('subscription lifecycle and enforcement have explicit expiry, recovery and limit guards', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../src/services/saas-service.js'), 'utf8');

    assert.match(source, /async function syncExpiredTenants\(\{ force = false \} = \{\}\)/);
    assert.match(source, /status='expired', updated_at=SYSUTCDATETIME\(\)/);
    assert.match(source, /async function getCurrentSubscription\(tenantId = currentTenantId\(\{ required: true \}\), \{ readOnly = false, includeOverrides = false \} = \{\}\)/);
    assert.match(source, /async function enforceTenantAccess\(tenantId, \{ path = '', method = 'GET', readOnly = false, tenant: tenantContext = null \} = \{\}\)/);
    assert.match(source, /if \(!subscription \|\| !\['active', 'trial'\]\.includes\(subscription\.status\)/);
    assert.match(source, /if \(canRecover\) return \{ tenantStatus: resolvedTenant\.status, subscription, recovery: true \}/);
    assert.match(source, /async function enforceRequestLimit\(tenantId, \{ path = '', method = 'GET', incomingBytes = 0, access = null \} = \{\}\)/);
    assert.match(source, /usage\[resource\] >= max/);
    assert.match(source, /SAAS_PLAN_LIMIT_REACHED/);
    assert.match(source, /SAAS_STORAGE_LIMIT_REACHED/);
    assert.match(source, /resolveEffectiveLimits\(/);
    assert.match(source, /overrideLimits: overrides/);
    assert.match(source, /applyCoreFeatureEntitlements\(\s*\{\s*\.\.\.baseFeatures,\s*\.\.\.\(overrides\?\.features \|\| \{\}\)\s*\}/);
});
