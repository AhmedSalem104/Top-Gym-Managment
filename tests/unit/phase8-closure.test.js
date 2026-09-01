'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Phases 3-8 migrations are additive and contain no destructive SQL', () => {
    const migrations = ['016-independent-trainer-registration.sql', '017-trainer-client-profile.sql', '018-trainer-commercial-operations.sql', '019-trainer-portal-foundation.sql']
        .map((file) => read(`database/migrations/${file}`)).join('\n');
    assert.doesNotMatch(migrations, /\b(?:DROP\s+(?:TABLE|COLUMN|INDEX|CONSTRAINT)|TRUNCATE\s+TABLE|sp_rename)\b/i);
    assert.match(migrations, /IF OBJECT_ID/i);
    assert.match(migrations, /tenant_id/i);
});

test('All newly introduced Trainer commercial tables are tenant-scoped and registered', () => {
    const migration = read('database/migrations/018-trainer-commercial-operations.sql');
    const tenantService = read('src/services/tenant-service.js');
    const backupRegistry = read('src/services/backup-registry.js');
    for (const table of ['trainer_packages', 'trainer_package_purchases', 'coaching_sessions', 'trainer_package_usage']) {
        assert.match(migration, new RegExp(`CREATE TABLE dbo\\.${table}[\\s\\S]*?tenant_id`, 'i'));
        assert.match(tenantService, new RegExp(`['"]${table}['"]`));
        assert.match(backupRegistry, new RegExp(`['"]${table}['"]`));
    }
});

test('Trainer APIs keep tenant type, tenant context and capability enforcement server-side', () => {
    const routes = read('src/routes/trainer.routes.js');
    const trainerService = read('src/services/trainer-service.js');
    const capabilities = read('src/services/capability-service.js');
    const auth = read('src/middleware/auth.middleware.js');
    const permissions = read('src/permissions/route-permissions.js');
    assert.match(routes, /trainerOnly/);
    assert.match(routes, /\/api\/trainer\/reports\/summary/);
    assert.match(trainerService, /currentTenantId\(\{ required: true \}\)/);
    assert.match(trainerService, /tenant\.tenant_type/);
    assert.match(capabilities, /resolveEffectiveCapabilities/);
    assert.match(auth, /enforceTenantAccess/);
    assert.match(permissions, /trainer.*reports.*summary/);
});

test('Trainer payments and package usage use shared ledger, transactions and idempotency', () => {
    const commerce = read('src/services/trainer-commerce-service.js');
    assert.match(commerce, /gym_payment_transactions/);
    assert.match(commerce, /withTransaction/);
    assert.match(commerce, /idempotency_key_hash/);
    assert.match(commerce, /trainer_package_usage/);
    assert.match(commerce, /SESSION_COMPLETED_IMMUTABLE/);
});

test('Trainer reports filter real tenant data and voided ledger rows', () => {
    const service = read('src/services/trainer-service.js');
    assert.match(service, /async function getReports/);
    assert.match(service, /t\.tenant_id=@tenantId/);
    assert.match(service, /t\.paid_at >= @fromDate/);
    assert.match(service, /CASE WHEN t\.is_voided=0 THEN t\.amount_paid/);
    assert.match(service, /reportDateRange/);
});

test('Trainer portal reuses the shared portal and keeps private storage as the media boundary', () => {
    const portal = read('src/services/member-portal-service.js');
    const storage = read('src/services/object-storage-service.js');
    assert.match(portal, /portalMode: 'trainer_client'/);
    assert.equal(fs.existsSync(path.join(root, 'public', 'trainer-portal.html')), false);
    assert.match(storage, /private/);
});

test('Node runtime contract remains explicit and password data is not added to Trainer surfaces', () => {
    const packageJson = JSON.parse(read('package.json'));
    const trainerPage = read('public/trainer-workspace.html');
    const trainerScript = read('public/js/trainer-workspace.js');
    assert.equal(packageJson.engines?.node, '24.x');
    assert.doesNotMatch(`${trainerPage}\n${trainerScript}`, /passwordHash|password_hash|temporaryPassword|temp_password/i);
});
