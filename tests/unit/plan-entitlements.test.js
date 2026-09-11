'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const catalog = require('../../src/services/feature-catalog');
const capabilityService = require('../../src/services/capability-service');

const migrationPath = path.join(__dirname, '../../database/migrations/030-plan-entitlements.sql');
const migrationSql = fs.readFileSync(migrationPath, 'utf8');
const saasServiceSource = fs.readFileSync(path.join(__dirname, '../../src/services/saas-service.js'), 'utf8');

test('feature catalog is unique and covers every shipped Gym and Trainer capability', () => {
    const keys = catalog.FEATURE_CATALOG.map((feature) => feature.key);
    assert.equal(new Set(keys).size, keys.length);

    for (const key of capabilityService.GYM_CAPABILITIES) {
        assert.ok(catalog.FEATURE_BY_KEY.has(key), `missing Gym catalog feature: ${key}`);
        assert.ok(catalog.FEATURE_BY_KEY.get(key).tenantTypes.includes('gym'), `Gym feature is not Gym-compatible: ${key}`);
    }
    for (const key of capabilityService.IMPLEMENTED_CAPABILITIES_BY_TENANT_TYPE.independent_trainer) {
        assert.ok(catalog.FEATURE_BY_KEY.has(key), `missing Trainer catalog feature: ${key}`);
        assert.ok(catalog.FEATURE_BY_KEY.get(key).tenantTypes.includes('independent_trainer'), `Trainer feature is not Trainer-compatible: ${key}`);
    }
    assert.ok(!catalog.FEATURE_BY_KEY.get('branches').tenantTypes.includes('independent_trainer'));
    assert.ok(!catalog.FEATURE_BY_KEY.get('members').tenantTypes.includes('independent_trainer'));
});

test('legacy aliases normalize into the canonical catalog', () => {
    assert.equal(catalog.normalizeFeatureKey('intelligence'), 'ai');
    assert.equal(catalog.normalizeFeatureKey('prioritySupport'), 'prioritySupport');
    assert.equal(catalog.hasFeature('intelligence'), true);
    assert.equal(catalog.hasFeature('not-a-feature'), false);
    assert.deepEqual(catalog.getFeatureCatalog({ tenantType: 'independent_trainer' }).some((feature) => feature.key === 'branches'), false);
});

test('route enforcement uses canonical feature keys, including catalog-only routes', () => {
    assert.equal(capabilityService.requiredCapability('/bar/recipes'), 'bar');
    assert.equal(capabilityService.requiredCapability('/branches'), 'branches');
    assert.equal(capabilityService.requiredCapability('/trainer/clients'), 'clients');
    assert.equal(capabilityService.requiredCapability('/trainer/package-purchases'), 'packages');
    assert.equal(capabilityService.requiredCapability('/trainer/package-purchases/12/payments'), 'payments');
    assert.equal(capabilityService.requiredCapability('/auth/users'), 'team');
    assert.equal(capabilityService.requiredCapability('/portal/analytics'), 'portal');
    assert.equal(capabilityService.requiredFeature('/memberships/12/branches'), 'branches');
    assert.equal(capabilityService.requiredFeature('/memberships/12/payments'), 'members');

    assert.throws(
        () => capabilityService.assertCapabilityAccess({ tenantType: 'gym', path: '/bar/recipes', features: { bar: false } }),
        (error) => error.code === 'SAAS_FEATURE_NOT_INCLUDED' && error.statusCode === 403
    );
    assert.throws(
        () => capabilityService.assertCapabilityAccess({ tenantType: 'independent_trainer', path: '/branches' }),
        (error) => error.code === 'CAPABILITY_NOT_ENABLED' && error.statusCode === 503
    );
    assert.throws(
        () => capabilityService.assertCapabilityAccess({ tenantType: 'independent_trainer', path: '/trainer/clients', features: { clients: false } }),
        (error) => error.code === 'SAAS_FEATURE_NOT_INCLUDED' && error.statusCode === 403
    );
});

test('every tenant domain route resolves to a central capability or feature', () => {
    const routeRoot = path.join(__dirname, '../../src/routes');
    const ignoredPrefixes = ['/auth/', '/public/', '/health', '/platform', '/saas/', '/phone/'];
    const files = fs.readdirSync(routeRoot).filter((file) => file.endsWith('.js'));
    const uncovered = [];
    for (const file of files) {
        const source = fs.readFileSync(path.join(routeRoot, file), 'utf8');
        for (const match of source.matchAll(/app\.(?:get|post|put|patch|delete)\(['"](\/api\/[^'"`]+)['"]/g)) {
            const apiPath = match[1];
            const routePath = apiPath.replace(/^\/api/, '').replace(/\/:[^/]+/g, '/1');
            if (ignoredPrefixes.some((prefix) => routePath.startsWith(prefix))) continue;
            if (!capabilityService.requiredCapability(routePath) && !capabilityService.requiredFeature(routePath)) {
                uncovered.push(`${file}:${apiPath}`);
            }
        }
    }
    assert.deepEqual(uncovered, []);
});

test('Trainer client limits remain backward-compatible with legacy max_members', () => {
    assert.deepEqual(
        capabilityService.resolveEffectiveLimits({
            tenantType: 'independent_trainer',
            planLimits: { maxMembers: 25 },
            requirePlan: true
        }),
        { maxMembers: 25, maxUsers: null, maxAiGenerations: null, maxStorageMb: null, maxBranches: null, maxClients: 25 }
    );
    assert.equal(
        capabilityService.resolveEffectiveLimits({
            tenantType: 'independent_trainer',
            planLimits: { maxMembers: 25, maxClients: 40 },
            overrideLimits: { maxClients: 12 },
            requirePlan: true
        }).maxClients,
        12
    );
});

test('plan entitlement migration is additive, idempotent, and preserves explicit false flags', () => {
    assert.match(migrationSql, /OBJECT_ID\(N'dbo\.saas_plan_features'/);
    assert.match(migrationSql, /IF OBJECT_ID\(N'dbo\.saas_plan_features', N'U'\) IS NULL/);
    assert.match(migrationSql, /max_clients/);
    assert.match(migrationSql, /max_clients_snapshot/);
    assert.match(migrationSql, /lifecycle_status/);
    assert.match(migrationSql, /false'' THEN 0/);
    assert.match(migrationSql, /ON DELETE NO ACTION/);
    assert.doesNotMatch(migrationSql, /DROP\s+TABLE/i);
    assert.doesNotMatch(migrationSql, /TRUNCATE\s+TABLE/i);
});

test('plan lifecycle is soft-delete based and audited', () => {
    assert.match(saasServiceSource, /async function setPlanStatus\(/);
    assert.match(saasServiceSource, /LAST_ACTIVE_PLAN/);
    assert.match(saasServiceSource, /WITH \(UPDLOCK,HOLDLOCK\)/);
    assert.match(saasServiceSource, /action: `plan_\$\{nextStatus\}`/);
    assert.match(saasServiceSource, /return setPlanStatus\(id, 'archived'/);
    assert.doesNotMatch(saasServiceSource, /DELETE\s+FROM\s+dbo\.saas_plans/i);
});
