'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('PlatformAdmin tenant directory supports a server-side tenant-type filter', () => {
    const service = read('src/services/platform-admin-service.js');
    const controller = read('src/controllers/platform-admin.controller.js');
    const html = read('public/platform-admin.html');
    const script = read('public/js/platform-admin.js');
    assert.match(service, /tenantType = ''/);
    assert.match(service, /TENANT_TYPE_VALUES\.includes/);
    assert.match(service, /@tenantType='' OR t\.tenant_type=@tenantType/);
    assert.match(controller, /tenantType: request\.query\?\.tenantType/);
    assert.match(html, /id="tenantTypeFilter"/);
    assert.match(script, /tenantTypeFilter.*tenantType/);
});

test('PlatformAdmin plan management exposes compatibility while backend remains authoritative', () => {
    const saas = read('src/services/saas-service.js');
    const script = read('public/js/platform-admin.js');
    assert.match(saas, /assertPlanCompatibilityCanChange/);
    assert.match(saas, /assertPlanCompatibleForTenantType/);
    assert.match(saas, /compatibleTenantTypes/);
    assert.match(script, /planCompatibilityFields/);
    assert.match(script, /compatibleTenantType_independent_trainer/);
    assert.match(script, /compatibleTenantTypes/);
});

test('PlatformAdmin provisioning keeps Gym as the default and validates explicit types server-side', () => {
    const saas = read('src/services/saas-service.js');
    const controller = read('src/controllers/platform-admin.controller.js');
    const script = read('public/js/platform-admin.js');
    assert.match(saas, /tenantType = TENANT_TYPES\.GYM/);
    assert.match(saas, /const normalizedTenantType = resolveTenantType\(tenantType\)/);
    assert.match(controller, /tenantType: request\.body\?\.tenantType/);
    assert.match(script, /name="tenantType"/);
});

test('PlatformAdmin type changes are not exposed as a tenant profile mutation', () => {
    const service = read('src/services/platform-admin-service.js');
    const controller = read('src/controllers/platform-admin.controller.js');
    assert.doesNotMatch(service, /UPDATE dbo\.gym_tenants[\s\S]{0,500}tenant_type\s*=/i);
    assert.doesNotMatch(controller, /tenant_type\s*=/i);
});
