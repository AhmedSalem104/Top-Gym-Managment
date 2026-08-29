'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { TENANT_TABLES } = require('../../src/services/tenant-service');
const {
    PLATFORM_GLOBAL_BACKUP_TABLES,
    TENANT_BACKUP_EXCLUDED_TABLES,
    TENANT_BACKUP_TABLES,
    getTenantBackupCoverage
} = require('../../src/services/backup-registry');

test('tenant backup registry covers every tenant table or explicitly excludes metadata/control-plane data', () => {
    const coverage = getTenantBackupCoverage({ tenantTables: TENANT_TABLES });
    assert.deepEqual(coverage.uncoveredTenantTables, []);
    assert.ok(coverage.registryTables.includes('gym_muscles'));
    assert.ok(coverage.registryTables.includes('gym_foods'));
    assert.ok(coverage.registryTables.includes('gym_exercises'));
    assert.ok(coverage.excludedTables.includes('gym_backup_records'));
    assert.ok(coverage.excludedTables.includes('saas_tenant_subscriptions'));
});

test('registry detects a newly introduced tenant table instead of silently omitting it', () => {
    const coverage = getTenantBackupCoverage({
        tenantTables: [...TENANT_TABLES, 'future_tenant_table']
    });
    assert.deepEqual(coverage.uncoveredTenantTables, ['future_tenant_table']);
});

test('platform backup inventory remains separate from tenant restore inventory', () => {
    const tenantTables = new Set(TENANT_BACKUP_TABLES.map((item) => item.table));
    assert.ok(PLATFORM_GLOBAL_BACKUP_TABLES.some((item) => item.table === 'gym_tenants'));
    assert.ok(PLATFORM_GLOBAL_BACKUP_TABLES.some((item) => item.table === 'saas_plans'));
    assert.equal(PLATFORM_GLOBAL_BACKUP_TABLES.some((item) => item.table === 'gym_user_tenants'), false);
    assert.ok(TENANT_BACKUP_EXCLUDED_TABLES.includes('gym_backup_operations'));
    assert.equal(tenantTables.has('gym_tenants'), false);
    assert.equal(tenantTables.has('saas_plans'), false);
});
