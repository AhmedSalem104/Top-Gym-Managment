'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Phase 3 keeps Trainer registration on a separate trusted route boundary', () => {
    const routes = read('src/routes/gym-registration.routes.js');
    const controller = read('src/controllers/gym-registration.controller.js');
    const middleware = read('src/middleware/auth.middleware.js');

    assert.match(routes, /\/api\/public\/trainer-registration\/catalog/);
    assert.match(routes, /TENANT_TYPES\.INDEPENDENT_TRAINER/);
    assert.match(controller, /service\.createRequest\(request\.body \|\| \{\}, request\.get\('idempotency-key'\), tenantType\)/);
    assert.match(middleware, /publicTrainerRegistrationPath/);
    assert.doesNotMatch(routes, /request\.body[^\n]*tenantType/);
});

test('Phase 3 migration is additive, idempotent, and constrains registration types', () => {
    const migration = read('database/migrations/016-independent-trainer-registration.sql');
    assert.match(migration, /COL_LENGTH\([^\n]+tenant_type/);
    assert.match(migration, /UPDATE dbo\.saas_gym_registration_requests/);
    assert.match(migration, /tenant_type IN \(('{2})?gym\1, \1independent_trainer\1\)/);
    assert.match(migration, /DF_saas_registration_tenant_type/);
    assert.match(migration, /CK_saas_registration_tenant_type/);
    assert.match(migration, /IX_saas_registration_tenant_type_queue/);
    assert.doesNotMatch(migration, /DROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX)/i);
});

test('Phase 3 provisioning receives tenant type from trusted service arguments', () => {
    const service = read('src/services/saas-service.js');
    const registration = read('src/services/gym-registration-service.js');
    assert.match(service, /tenantType = TENANT_TYPES\.GYM/);
    assert.match(service, /const normalizedTenantType = resolveTenantType\(tenantType\)/);
    assert.match(service, /INSERT INTO dbo\.gym_tenants \(name,slug,tenant_type,status\)/);
    assert.match(registration, /const normalizedTenantType = registrationTypeFromRoute/);
    assert.match(registration, /tenant_type/);
    assert.match(registration, /tenantType: normalizedTenantType/);
});

test('Trainer workspace keeps future operational areas honest and avoids invented KPI data', () => {
    const page = read('public/trainer-workspace.html');
    const script = read('public/js/trainer-workspace.js');
    assert.match(page, /data-trainer-workspace/);
    assert.match(script, /independent_trainer/);
    assert.match(script, /\/api\/auth\/session/);
    assert.match(script, /\/api\/saas\/subscription/);
    assert.doesNotMatch(page, /fake|mock/i);
    assert.match(script, /\/api\/trainer\/reports\/summary/);
    assert.match(page, /ما يحتاج انتباهك|الأولوية محسوبة/);
});

test('Phase 3 keeps the existing Gym registration page and API intact', () => {
    const gymPage = read('public/register-gym.html');
    const trainerPage = read('public/register-trainer.html');
    const routes = read('src/routes/gym-registration.routes.js');
    assert.match(gymPage, /gymRegistrationForm/);
    assert.match(gymPage, /registration-type-switch/);
    assert.match(gymPage, /href="\/register-trainer"/);
    assert.match(trainerPage, /data-registration-type="independent_trainer"/);
    assert.match(trainerPage, /href="\/register-gym"/);
    assert.match(routes, /\/api\/public\/gym-registration\/catalog/);
    assert.match(routes, /\/api\/public\/gym-registration\/requests/);
    assert.match(routes, /\/api\/platform-admin\/gym-registration-requests/);
});
