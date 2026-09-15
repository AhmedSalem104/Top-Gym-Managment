'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const root = path.join(__dirname, '..', '..');
const planCatalog = require('../../src/services/saas-plan-catalog');
const featureCatalog = require('../../src/services/feature-catalog');
const capabilityService = require('../../src/services/capability-service');

function loadPermissions() {
    const source = fs.readFileSync(path.join(root, 'public/js/core/permissions.js'), 'utf8');
    const context = { window: {}, console, Date };
    vm.runInNewContext(source, context, { filename: 'permissions.js' });
    return context.window.topGymPermissions;
}

function entitlementEnvelope(planCode, tenantType) {
    const plan = planCatalog.PLAN_CONFIGURATIONS.find((item) => item.code === planCode);
    return {
        tenantStatus: 'active',
        subscription: { status: 'active', plan: { code: planCode, name: plan.name } },
        entitlements: {
            tenantType,
            features: planCatalog.featureFlagsForPlan(planCode),
            featureCatalog: featureCatalog.getFeatureCatalog({ tenantType })
        }
    };
}

test('frontend feature visibility follows the effective plan matrix for Gym and Trainer', () => {
    const permissions = loadPermissions();
    for (const plan of planCatalog.PLAN_CONFIGURATIONS) {
        for (const tenantType of ['gym', 'independent_trainer']) {
            permissions.setEntitlements(entitlementEnvelope(plan.code, tenantType), 'ready');
            const user = { role: 'Owner', tenantType };
            for (const feature of featureCatalog.FEATURE_CATALOG) {
                const expected = planCatalog.featureFlagsForPlan(plan.code)[feature.key] === true
                    && feature.tenantTypes.includes(tenantType);
                const access = permissions.getFeatureAccess(feature.key, user);
                assert.equal(access.allowed, expected, `${plan.code}:${tenantType}:${feature.key}`);
                assert.equal(access.state, expected ? 'available' : 'not_included', `${plan.code}:${tenantType}:${feature.key}:state`);
            }
        }
    }
});

test('frontend entitlement resolution fails closed for partial envelopes and separates expiry/suspension', () => {
    const permissions = loadPermissions();
    const gym = { role: 'Owner', tenantType: 'gym' };
    const envelope = entitlementEnvelope('business', 'gym');
    delete envelope.entitlements.features.inventory;
    permissions.setEntitlements(envelope, 'ready');
    assert.equal(permissions.getFeatureAccess('inventory', gym).allowed, false);

    permissions.setEntitlements({ ...envelope, subscription: { status: 'expired', plan: { code: 'business', name: 'Business' } } }, 'ready');
    assert.equal(permissions.getFeatureAccess('inventory', gym).state, 'expired');
    permissions.setEntitlements({ ...envelope, tenantStatus: 'suspended', subscription: { status: 'active', plan: { code: 'business', name: 'Business' } } }, 'ready');
    assert.equal(permissions.getFeatureAccess('inventory', gym).state, 'suspended');
});

test('server-side direct feature API checks remain blocked independently of navigation', () => {
    assert.throws(
        () => capabilityService.assertCapabilityAccess({ tenantType: 'gym', path: '/commerce/stock', features: { inventory: false } }),
        (error) => error.code === 'SAAS_FEATURE_NOT_INCLUDED' && error.statusCode === 403
    );
    assert.throws(
        () => capabilityService.assertCapabilityAccess({ tenantType: 'independent_trainer', path: '/branches', features: { branches: true } }),
        (error) => error.code === 'CAPABILITY_NOT_ENABLED' && error.statusCode === 503
    );
});

test('all application access surfaces consume the central entitlement contract', () => {
    const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
    const auth = read('public/js/auth-ui.js');
    const permissions = read('public/js/core/permissions.js');
    const tabs = read('public/js/page-tabs.js');
    const assistant = read('public/js/smart-assistant.js');
    const trainer = read('public/js/trainer-studio-v2.js');

    assert.match(auth, /\/api\/saas\/entitlements/);
    assert.match(auth, /\[data-page-tab\], \[data-page-tab-link\], \[data-entitlement-feature\]/);
    assert.match(permissions, /getFeatureAccess/);
    assert.match(tabs, /topgym:entitlements-updated/);
    assert.match(tabs, /feature-access-state/);
    assert.match(assistant, /ACTION_FEATURES/);
    assert.match(assistant, /canUseFeature/);
    assert.match(trainer, /trainerFeatureAccess/);
});
