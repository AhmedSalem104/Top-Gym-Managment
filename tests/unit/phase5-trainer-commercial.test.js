'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const migration = read('database/migrations/018-trainer-commercial-operations.sql');
const service = read('src/services/trainer-commerce-service.js');
const trainerService = read('src/services/trainer-service.js');
const routes = read('src/routes/trainer.routes.js');
const controller = read('src/controllers/trainer.controller.js');
const tenantService = read('src/services/tenant-service.js');
const backupRegistry = read('src/services/backup-registry.js');
const capabilities = read('src/services/capability-service.js');

test('Phase 5 uses additive tenant-scoped package, session and usage tables', () => {
    for (const table of ['trainer_packages', 'trainer_package_purchases', 'coaching_sessions', 'trainer_package_usage']) {
        assert.match(migration, new RegExp(`OBJECT_ID\\(N'dbo\\.${table}', N'U'\\) IS NULL`, 'i'));
        assert.match(migration, new RegExp(`CREATE TABLE dbo\\.${table}`, 'i'));
        assert.match(migration, new RegExp(`${table}.*tenant_id`, 'is'));
        assert.match(tenantService, new RegExp(`'${table}'`));
        assert.match(backupRegistry, new RegExp(`'${table}'`));
    }
    assert.doesNotMatch(migration, /DROP\s+(?:TABLE|COLUMN|INDEX|CONSTRAINT)/i);
    assert.match(migration, /membership_id\s+INT\s+NULL/i);
    assert.match(migration, /trainer_package_purchase_id\s+INT\s+NULL/i);
    assert.match(migration, /CK_gym_payment_transactions_owner_ref/i);
});

test('Trainer commerce routes have explicit capability-owned API boundaries', () => {
    for (const pathFragment of ['packages', 'package-purchases', 'payments', 'sessions']) {
        assert.match(routes, new RegExp(`/api/trainer/${pathFragment}`));
    }
    assert.match(controller, /trainerCommerceService\.createPurchase/);
    assert.match(controller, /trainerCommerceService\.setSessionStatus/);
    assert.match(service, /trainerService\.assertTrainerTenant/);
    assert.match(service, /currentTenantId\(\{ required: true \}\)/);
    assert.match(service, /tenant_id=@tenantId/);
    assert.match(service, /idempotency_key_hash/);
});

test('Package purchases reuse the existing payment ledger and session completion consumes once', () => {
    assert.match(service, /gym_payment_transactions/);
    assert.match(service, /transactionType = 'payment'/);
    assert.match(service, /trainer_package_usage/);
    assert.match(service, /sessions_remaining>0/);
    assert.match(service, /SESSION_COMPLETED_IMMUTABLE/);
    assert.match(service, /PAYMENT_IDEMPOTENCY_CONFLICT/);
});

test('Phase 5 enables only shipped Trainer commercial capabilities', () => {
    assert.match(capabilities, /'ai', 'library', 'branding', 'sessions', 'packages', 'payments'/);
    assert.match(capabilities, /shared client portal is now adapted/i);
});

test('Trainer reports use the shared financial ledger and tenant-scoped route', () => {
    assert.match(routes, /\/api\/trainer\/reports\/summary/);
    assert.match(controller, /trainerService\.getReports/);
    assert.match(trainerService, /t\.paid_at >= @fromDate/);
    assert.match(trainerService, /t\.is_voided=0/);
    assert.match(capabilities, /trainer.*reports/);
});
