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
