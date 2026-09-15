'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const catalog = require('../../src/services/saas-plan-catalog');
const featureCatalog = require('../../src/services/feature-catalog');
const capabilityService = require('../../src/services/capability-service');

const root = path.join(__dirname, '..', '..');
const migration = fs.readFileSync(path.join(root, 'database', 'migrations', '036-saas-plans-phase2.sql'), 'utf8');
const branchCoreMigration = fs.readFileSync(path.join(root, 'database', 'migrations', '037-gym-core-branches-entitlement.sql'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'database', 'migration-manifest.json'), 'utf8'));
const saasService = fs.readFileSync(path.join(root, 'src', 'services', 'saas-service.js'), 'utf8');
const intelligenceService = fs.readFileSync(path.join(root, 'src', 'services', 'intelligence-service.js'), 'utf8');

test('Phase 2 catalog contains exactly the approved plans, terms, limits and feature matrix', () => {
    assert.deepEqual(catalog.PLAN_CONFIGURATIONS.map((plan) => plan.code), ['starter', 'basic', 'pro', 'business']);
    const expectedPrices = {
        starter: [299, 799, 1499, 2699],
        basic: [599, 1599, 2999, 5499],
        pro: [999, 2699, 4999, 8999],
        business: [1499, 3999, 7499, 13499]
    };
    const expectedLimits = {
        starter: { maxMembers: 150, maxClients: 50, maxUsers: 2, maxBranches: 1, maxAiGenerations: 50, maxStorageMb: 1024 },
        basic: { maxMembers: 500, maxClients: 150, maxUsers: 5, maxBranches: 2, maxAiGenerations: 200, maxStorageMb: 5120 },
        pro: { maxMembers: 1500, maxClients: 500, maxUsers: 15, maxBranches: 5, maxAiGenerations: 750, maxStorageMb: 20480 },
        business: { maxMembers: null, maxClients: null, maxUsers: null, maxBranches: null, maxAiGenerations: 2000, maxStorageMb: 51200 }
    };
    for (const plan of catalog.PLAN_CONFIGURATIONS) {
        assert.deepEqual(plan.terms.map((term) => term.code), catalog.BILLING_TERM_CODES);
        assert.deepEqual(plan.terms.map((term) => term.price), expectedPrices[plan.code]);
        assert.deepEqual(plan.limits, expectedLimits[plan.code]);
        assert.equal(new Set(plan.featureKeys).size, plan.featureKeys.length);
        assert.ok(plan.featureKeys.every((key) => featureCatalog.FEATURE_KEYS.includes(key)));
        assert.equal(plan.compatibleTenantTypes.length, 2);
    }
    assert.equal(new Set(featureCatalog.FEATURE_KEYS).size, 31);
    assert.equal(catalog.featureFlagsForPlan('business').prioritySupport, true);
    assert.equal(catalog.featureFlagsForPlan('pro').prioritySupport, false);
    for (const code of ['starter', 'basic', 'pro', 'business']) {
        assert.equal(catalog.featureFlagsForPlan(code).branches, true, `${code}:branches`);
    }
    assert.deepEqual(featureCatalog.CORE_FEATURE_KEYS_BY_TENANT_TYPE.independent_trainer, []);
});

test('feature visibility is catalog-driven by tenant type, not by plan name', () => {
    const business = catalog.featureFlagsForPlan('business');
    const gymCatalog = new Set(featureCatalog.getFeatureCatalog({ tenantType: 'gym' }).map((item) => item.key));
    const trainerCatalog = new Set(featureCatalog.getFeatureCatalog({ tenantType: 'independent_trainer' }).map((item) => item.key));
    const gym = capabilityService.resolveEffectiveCapabilities({ tenantType: 'gym', features: business });
    const trainer = capabilityService.resolveEffectiveCapabilities({ tenantType: 'independent_trainer', features: business });
    assert.ok(Object.keys(gym.capabilities).filter((key) => gym.capabilities[key]).every((key) => gymCatalog.has(key)));
    assert.ok(Object.keys(trainer.capabilities).filter((key) => trainer.capabilities[key]).every((key) => trainerCatalog.has(key)));
    assert.equal(Boolean(gym.capabilities.clients), false);
    assert.equal(Boolean(trainer.capabilities.members), false);
});

test('the approved plan matrix is explicit for every catalog feature and tenant type', () => {
    const expected = {
        starter: new Set(['dashboard', 'members', 'attendance', 'coaching', 'nutrition', 'library', 'pricing', 'payments', 'reports', 'portal', 'branding', 'team', 'clients', 'notifications', 'branches']),
        basic: new Set(['dashboard', 'members', 'attendance', 'coaching', 'nutrition', 'library', 'pricing', 'payments', 'reports', 'portal', 'branding', 'team', 'clients', 'notifications', 'ai', 'finance', 'day_passes', 'branches', 'backup', 'assessments', 'progress', 'goals', 'sessions', 'packages', 'tasks', 'templates']),
        pro: new Set(['dashboard', 'members', 'attendance', 'coaching', 'nutrition', 'library', 'pricing', 'payments', 'reports', 'portal', 'branding', 'team', 'clients', 'notifications', 'ai', 'finance', 'day_passes', 'branches', 'backup', 'assessments', 'progress', 'goals', 'sessions', 'packages', 'tasks', 'templates', 'store', 'inventory', 'bar', 'audit']),
        business: new Set(featureCatalog.FEATURE_KEYS)
    };
    for (const plan of catalog.PLAN_CONFIGURATIONS) {
        const flags = catalog.featureFlagsForPlan(plan.code);
        assert.deepEqual(Object.keys(flags).sort(), [...featureCatalog.FEATURE_KEYS].sort());
        for (const feature of featureCatalog.FEATURE_CATALOG) {
            assert.equal(flags[feature.key], expected[plan.code].has(feature.key), `${plan.code}:${feature.key}`);
            for (const tenantType of ['gym', 'independent_trainer']) {
                const visible = feature.tenantTypes.includes(tenantType);
                const effective = flags[feature.key] === true && visible;
                assert.equal(effective, flags[feature.key] === true && feature.tenantTypes.includes(tenantType));
            }
        }
    }
});

test('migration 036 is guarded, additive and seeds the approved commercial matrix', () => {
    assert.match(migration, /LOGIC_FIT_CONTROLLED_PLAN_CONFIGURATION:\s*saas-plan-catalog/i);
    assert.match(migration, /SET\s+XACT_ABORT\s+ON/i);
    assert.match(migration, /BEGIN\s+TRANSACTION/i);
    assert.match(migration, /MERGE\s+dbo\.saas_plan_terms/i);
    assert.match(migration, /MERGE\s+dbo\.saas_plan_features/i);
    assert.match(migration, /MERGE\s+dbo\.saas_plan_tenant_types/i);
    assert.match(migration, /code=''enterprise''/i);
    assert.match(migration, /available_for_new_subscriptions=0/i);
    assert.match(migration, /\('business','monthly',1,1499,1\)/i);
    assert.doesNotMatch(migration, /DROP\s+(?:TABLE|COLUMN|INDEX)/i);
    assert.doesNotMatch(migration, /TRUNCATE\s+TABLE/i);
    assert.equal(manifest.migrations['036-saas-plans-phase2.sql'].checksum.length, 64);
});

test('migration 037 makes branches core for the four official plans without touching tenant history', () => {
    assert.match(branchCoreMigration, /BEGIN TRANSACTION/i);
    assert.match(branchCoreMigration, /MERGE\s+dbo\.saas_plan_features/i);
    assert.match(branchCoreMigration, /feature_key='branches'/i);
    assert.match(branchCoreMigration, /JSON_MODIFY/i);
    assert.match(branchCoreMigration, /starter' THEN 1/i);
    assert.match(branchCoreMigration, /basic' THEN 2/i);
    assert.match(branchCoreMigration, /pro' THEN 5/i);
    assert.match(branchCoreMigration, /business' THEN NULL/i);
    assert.match(branchCoreMigration, /max_branches/i);
    assert.match(branchCoreMigration, /COUNT\(\*\).*<> 4/s);
    assert.doesNotMatch(branchCoreMigration, /saas_tenant_subscriptions[\s\S]*UPDATE/i);
    assert.doesNotMatch(branchCoreMigration, /UPDATE\s+dbo\.(?:members|memberships|gym_payments|gym_payment_transactions)/i);
    assert.doesNotMatch(branchCoreMigration, /DROP\s+(?:TABLE|COLUMN|INDEX)/i);
    assert.doesNotMatch(branchCoreMigration, /TRUNCATE\s+TABLE/i);
});

test('billing term normalization preserves annual compatibility and independent prices', () => {
    assert.equal(catalog.normalizeTermCode('yearly'), 'annual');
    assert.equal(catalog.durationForTerm('quarterly'), 3);
    assert.equal(catalog.durationForTerm('semiannual'), 6);
    assert.notEqual(catalog.termsForPlan('starter')[0].price * 3, catalog.termsForPlan('starter')[1].price);
});

test('AI generation limits use the central transactional guard and exclude read-only intelligence scans', () => {
    assert.match(saasService, /resource === 'aiGenerations'[\s\S]{0,260}action IN \('question','workout_generate','diet_generate','refine'\)/);
    assert.match(intelligenceService, /async function reserveGeneration\(/);
    assert.match(intelligenceService, /assertResourceLimitInTransaction\(transaction, tenantId, 'aiGenerations'\)/);
    assert.match(intelligenceService, /withTransaction\(async \(transaction\)/);
    assert.match(intelligenceService, /generationReservation/);
});
