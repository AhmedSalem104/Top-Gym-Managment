'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const capabilityService = require('../../src/services/capability-service');

test('central capability resolution preserves Gym and exposes only shipped Trainer domains', () => {
    const result = capabilityService.resolveEffectiveCapabilities({ tenantType: 'gym', features: { store: false } });
    assert.equal(result.tenantType, 'gym');
    assert.equal(result.capabilities.members, true);
    assert.equal(result.capabilities.store, false);
    const trainer = capabilityService.resolveEffectiveCapabilities({ tenantType: 'independent_trainer' });
    assert.equal(trainer.capabilities.clients, true);
    assert.equal(trainer.capabilities.coaching, true);
    assert.equal(trainer.capabilities.portal, true);
    assert.equal(trainer.capabilities.sessions, true);
    assert.equal(trainer.capabilities.packages, true);
    assert.equal(trainer.capabilities.goals, true);
    assert.equal(trainer.capabilities.notifications, true);
    assert.equal(trainer.capabilities.tasks, true);
    assert.equal(trainer.capabilities.templates, true);
    assert.ok(!trainer.unsupportedCapabilities.includes('portal'));
    assert.equal(trainer.capabilities.reports, true);
    assert.ok(!trainer.unsupportedCapabilities.includes('reports'));
});

test('capability enforcement preserves plan-gated server-side behavior', () => {
    assert.equal(capabilityService.requiredCapability('/store/sales'), 'store');
    assert.equal(capabilityService.requiredCapability('/coaching/programs'), 'coaching');
    assert.equal(capabilityService.requiredCapability('/dashboard'), 'dashboard');
    assert.equal(capabilityService.requiredCapability('/day-passes/summary'), 'day_passes');
    assert.equal(capabilityService.requiredCapability('/monthly-finance'), 'finance');
    assert.equal(capabilityService.requiredCapability('/trainer/goals'), 'goals');
    assert.equal(capabilityService.requiredCapability('/trainer/notifications'), 'notifications');
    assert.equal(capabilityService.requiredCapability('/trainer/tasks'), 'tasks');
    assert.equal(capabilityService.requiredCapability('/trainer/templates'), 'templates');
    assert.throws(
        () => capabilityService.assertCapabilityAccess({ tenantType: 'independent_trainer', path: '/day-passes' }),
        (error) => error.code === 'CAPABILITY_NOT_ENABLED' && error.statusCode === 503
    );
    assert.throws(
        () => capabilityService.assertCapabilityAccess({ path: '/store/sales', features: { store: false } }),
        (error) => error.code === 'SAAS_FEATURE_NOT_INCLUDED' && error.statusCode === 403
    );
    assert.equal(capabilityService.assertCapabilityAccess({ path: '/members', features: { store: false } }).capability, 'members');
});
