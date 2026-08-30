'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..', '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('commercial migration defines separate platform and tenant request boundaries', () => {
    const migration = read('database/migrations/011-commercial-portal-and-registration.sql');
    for (const table of [
        'saas_plan_terms',
        'saas_platform_payment_methods',
        'saas_gym_registration_requests',
        'saas_gym_registration_payment_proofs',
        'gym_member_subscription_requests',
        'gym_member_subscription_payment_proofs',
        'gym_member_portal_sessions',
        'gym_member_portal_visit_daily',
        'gym_member_portal_visit_visitors'
    ]) {
        assert.match(migration, new RegExp(`CREATE TABLE dbo\\.${table}\\b`));
    }
    assert.match(migration, /unique_visitors_estimate BIGINT/);
    assert.match(migration, /authenticated_members BIGINT/);
    assert.match(migration, /ON dbo\.gym_member_subscription_requests\(tenant_id, member_id, request_type\)/);
    assert.doesNotMatch(migration, /ON dbo\.gym_member_subscription_requests\(tenant_id\)\s+WHERE status='pending'/i);
});

test('commercial runtime schema is applied by the guarded migration workflow', () => {
    const schema = read('src/services/commercial-schema.js');
    const server = read('server.js');
    const migrationRunner = read('scripts/migrate-tenancy.js');
    assert.match(schema, /ensureCommercialTables/);
    assert.match(schema, /011-commercial-portal-and-registration\.sql/);
    assert.match(schema, /if \(readOnly\) return/);
    assert.match(server, /commercialSchema\.ensureCommercialTables\(\)/);
    assert.match(migrationRunner, /commercialSchema\.ensureCommercialTables\(\)/);
});

test('new tenant-scoped commercial tables are part of the RLS inventory', () => {
    const tenantService = read('src/services/tenant-service.js');
    for (const table of [
        'gym_member_subscription_requests',
        'gym_member_subscription_payment_proofs',
        'gym_member_portal_sessions',
        'gym_member_portal_visit_daily',
        'gym_member_portal_visit_visitors'
    ]) {
        assert.match(tenantService, new RegExp(`'${table}'`));
    }
});

test('portal analytics keeps page views, estimated visitors and authenticated members separate', () => {
    const service = read('src/services/commercial-service.js');
    const controller = read('src/controllers/member-portal.controller.js');
    assert.match(service, /pageViews: sum\('pageViews'\)/);
    assert.match(service, /uniqueVisitors: sum\('uniqueVisitors'\)/);
    assert.match(service, /authenticatedMembers: sum\('authenticatedMembers'\)/);
    assert.match(service, /visitorHash = hashToken\(`visitor:/);
    assert.match(service, /memberHash = hashToken\(`member:/);
    assert.match(controller, /getPortalAnalytics\(/);
});

test('portal sessions are hashed, HttpOnly and resolved without a client tenant trust boundary', () => {
    const service = read('src/services/commercial-service.js');
    const middleware = read('src/middleware/auth.middleware.js');
    assert.match(service, /createHmac\('sha256'/);
    assert.match(service, /token_hash/);
    assert.match(service, /HttpOnly; SameSite=Lax/);
    assert.match(service, /runTenantContext\(\{ tenantId: null, mode: 'platform'/);
    assert.match(middleware, /memberPortalSessionPath/);
    assert.match(middleware, /runTenantContext\(\{ tenantId: null, mode: 'public'/);
    assert.doesNotMatch(service, /SELECT[\s\S]{0,300}WHERE tenant_id=@tenantId[\s\S]{0,300}request\.query/);
});

test('tenant payment methods are identity-backed and excluded from generic public branding', () => {
    const branding = read('src/services/branding-service.js');
    const portal = read('src/services/member-portal-service.js');
    assert.match(branding, /paymentMethods: \[\]/);
    assert.match(branding, /delete publicPublished\.identity\.paymentMethods/);
    assert.match(branding, /async function getTenantPaymentMethods/);
    assert.match(portal, /getTenantPaymentMethods\(\{ readOnly: true \}\)/);
    assert.doesNotMatch(portal, /01015819700|01005376843/);
});

test('owner identity editor manages tenant payment methods without hard-coded account data', () => {
    const editor = read('public/js/pages/branding/branding.js');
    const page = read('public/index.html');
    assert.match(page, /id="brandingPaymentMethods"/);
    assert.match(page, /id="brandingAddPaymentMethod"/);
    assert.match(editor, /data-branding-payment-field/);
    assert.match(editor, /function handlePaymentMethodChange/);
    assert.match(editor, /function addPaymentMethod/);
    assert.match(editor, /function removePaymentMethod/);
    assert.doesNotMatch(editor, /01015819700|01005376843/);
    assert.doesNotMatch(page, /01015819700|01005376843/);
});

test('member request validation rejects inactive plans and types server-side', () => {
    const service = read('src/services/member-subscription-service.js');
    assert.match(service, /plan\.active === false/);
    assert.match(service, /type\.active === false/);
    assert.match(service, /MEMBERSHIP_PLAN_NOT_AVAILABLE/);
    assert.match(service, /MEMBERSHIP_TYPE_NOT_AVAILABLE/);
});
