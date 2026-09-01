'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const capabilityService = require('../../src/services/capability-service');
const planCompatibility = require('../../src/services/plan-compatibility-service');

const root = path.join(__dirname, '..', '..');
const saasSource = fs.readFileSync(path.join(root, 'src', 'services', 'saas-service.js'), 'utf8');
const platformSource = fs.readFileSync(path.join(root, 'src', 'services', 'platform-admin-service.js'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'database', 'migrations', '015-plan-tenant-type-compatibility.sql'), 'utf8');

test('plan compatibility accepts canonical tenant types and rejects malformed input', () => {
    assert.deepEqual(planCompatibility.normalizeCompatibleTenantTypes(['GYM', 'independent_trainer']), ['gym', 'independent_trainer']);
    assert.deepEqual(planCompatibility.normalizeCompatibleTenantTypes(undefined), ['gym']);
    assert.throws(
        () => planCompatibility.normalizeCompatibleTenantTypes(['future_type']),
        (error) => error.code === 'PLAN_COMPATIBILITY_INVALID' && error.statusCode === 400
    );
    assert.throws(
        () => planCompatibility.normalizeCompatibleTenantTypes([]),
        (error) => error.code === 'PLAN_COMPATIBILITY_REQUIRED' && error.statusCode === 400
    );
});

test('Gym keeps the existing capability contract and limits', () => {
    const result = capabilityService.resolveEffectiveCapabilities({
        tenantType: 'gym',
        features: { intelligence: true, coaching: true, store: true, reports: true, portal: true }
    });
    assert.equal(result.capabilities.members, true);
    assert.equal(result.capabilities.store, true);
    assert.equal(result.capabilities.portal, true);
    assert.deepEqual(
        capabilityService.resolveEffectiveLimits({
            tenantType: 'gym',
            planLimits: { maxMembers: 300, maxUsers: 3, maxAiGenerations: 100, maxStorageMb: 1024 }
        }),
        { maxMembers: 300, maxUsers: 3, maxAiGenerations: 100, maxStorageMb: 1024 }
    );
});

test('Independent Trainer resolves the currently shipped trainer domains and shared portal', () => {
    const result = capabilityService.resolveEffectiveCapabilities({
        tenantType: 'independent_trainer',
        features: { coaching: true, reports: true, portal: true }
    });
    assert.equal(result.capabilities.clients, true);
    assert.equal(result.capabilities.coaching, true);
    assert.equal(result.capabilities.nutrition, true);
    assert.equal(result.capabilities.portal, true);
    assert.ok(result.baselineCapabilities.includes('clients'));
    assert.equal(result.capabilities.sessions, true);
    assert.ok(!result.unsupportedCapabilities.includes('sessions'));
    assert.equal(capabilityService.assertCapabilityAccess({ tenantType: 'independent_trainer', path: '/trainer/clients' }).capability, 'clients');
    assert.equal(capabilityService.assertCapabilityAccess({ tenantType: 'independent_trainer', path: '/trainer/sessions' }).capability, 'sessions');
});

test('capability and limit resolution fail closed for incompatible or invalid commercial state', () => {
    assert.throws(
        () => capabilityService.resolveEffectiveCapabilities({ tenantType: 'gym', planCompatible: false }),
        (error) => error.code === 'SAAS_PLAN_TENANT_TYPE_MISMATCH' && error.statusCode === 503
    );
    assert.throws(
        () => capabilityService.assertCapabilityAccess({ path: '/members', subscriptionStatus: 'suspended' }),
        (error) => error.code === 'SAAS_SUBSCRIPTION_REQUIRED' && error.statusCode === 402
    );
    assert.throws(
        () => capabilityService.resolveEffectiveLimits({ planLimits: { maxMembers: 0 } }),
        (error) => error.code === 'LIMIT_MODEL_NOT_READY' && error.statusCode === 503
    );
    assert.throws(
        () => capabilityService.resolveEffectiveCapabilities({ features: { unknownFeature: true } }),
        (error) => error.code === 'CAPABILITY_MODEL_NOT_READY' && error.statusCode === 503
    );
});

test('compatibility mapping migration is additive, idempotent and does not rewrite history', () => {
    assert.match(migration, /OBJECT_ID\(N'dbo\.saas_plans', N'U'\)/i);
    assert.match(migration, /CREATE TABLE dbo\.saas_plan_tenant_types/i);
    assert.match(migration, /PRIMARY KEY \(plan_id, tenant_type\)/i);
    assert.match(migration, /FOREIGN KEY \(plan_id\).*saas_plans/i);
    assert.match(migration, /CHECK \(tenant_type IN \('gym', 'independent_trainer'\)\)/i);
    assert.match(migration, /PK_saas_plan_tenant_types/i);
    assert.match(migration, /FK_saas_plan_tenant_types_plan/i);
    assert.match(migration, /CK_saas_plan_tenant_types_type/i);
    assert.match(migration, /MERGE dbo\.saas_plan_tenant_types/i);
    assert.doesNotMatch(migration, /DROP\s+(?:TABLE|COLUMN|INDEX)/i);
    assert.doesNotMatch(migration, /UPDATE\s+dbo\.(?:saas_tenant_subscriptions|saas_subscription_requests|saas_payment_proofs|saas_audit_log)/i);
});

test('all commercial plan assignment entry points use server-side compatibility checks', () => {
    assert.match(saasSource, /assertPlanCompatibleWithTenant\(id, plan\)/);
    assert.match(saasSource, /assertPlanCompatibleForTenantType\(requestedPlan, request\.tenant_type\)/);
    assert.match(saasSource, /scheduled plan is not compatible/i);
    assert.match(saasSource, /assertPlanCompatibleForTenantType\(resolvedPlan, normalizedTenantType\)/);
    assert.match(platformSource, /planForBody\(body, \{ required:[\s\S]*tenantId: id/);
    assert.match(platformSource, /assertPlanCompatibleWithTenant\(id, nextPlan\)/);
    assert.doesNotMatch(platformSource, /body\.tenant[_-]?type/);
});
