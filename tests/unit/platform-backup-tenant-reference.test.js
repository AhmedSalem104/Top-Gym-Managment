'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validatePlatformTenantReferences } = require('../../src/services/backup-recovery-service');

test('platform backup validation allows intentional NULL tenant references', () => {
    assert.doesNotThrow(() => validatePlatformTenantReferences(
        {
            gym_tenants: [{ id: 1 }],
            saas_audit_log: [{ id: 10, tenant_id: null }]
        },
        { members: [{ id: 20, tenant_id: 1 }] }
    ));
});

test('platform backup validation rejects concrete unknown tenant references', () => {
    assert.throws(
        () => validatePlatformTenantReferences(
            { gym_tenants: [{ id: 1 }] },
            { members: [{ id: 20, tenant_id: 999 }] }
        ),
        (error) => error.code === 'PLATFORM_BACKUP_TENANT_REFERENCE_INVALID'
    );
});
