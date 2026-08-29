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
    assert.match(block, /saas_tenant_subscriptions SET status='expired'/);
    assert.match(block, /INSERT INTO dbo\.saas_tenant_subscriptions/);
    assert.match(block, /UPDATE dbo\.gym_tenants SET status='active'/);
    assert.match(block, /action: 'subscription_approved'/);
    assert.match(block, /executor: transaction/);
});

test('subscription lifecycle and enforcement have explicit expiry, recovery and limit guards', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../src/services/saas-service.js'), 'utf8');

    assert.match(source, /async function syncExpiredTenants\(\{ force = false \} = \{\}\)/);
    assert.match(source, /status='expired', updated_at=SYSUTCDATETIME\(\)/);
    assert.match(source, /async function getCurrentSubscription\(tenantId = currentTenantId\(\{ required: true \}\), \{ readOnly = false \} = \{\}\)/);
    assert.match(source, /async function enforceTenantAccess\(tenantId, \{ path = '', method = 'GET', readOnly = false \} = \{\}\)/);
    assert.match(source, /if \(!subscription \|\| !\['active', 'trial'\]\.includes\(subscription\.status\)/);
    assert.match(source, /if \(canRecover\) return \{ tenantStatus: tenant\.status, subscription, recovery: true \}/);
    assert.match(source, /async function enforceRequestLimit\(tenantId, \{ path = '', method = 'GET', incomingBytes = 0, access = null \} = \{\}\)/);
    assert.match(source, /usage\[resource\] >= max/);
    assert.match(source, /SAAS_PLAN_LIMIT_REACHED/);
    assert.match(source, /SAAS_STORAGE_LIMIT_REACHED/);
    assert.match(source, /overrides\?\.maxMembers \?\? base\.maxMembers/);
    assert.match(source, /features = \{ \.\.\.baseFeatures, \.\.\.\(overrides\?\.features \|\| \{\}\) \}/);
});
