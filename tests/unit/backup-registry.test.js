'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { TENANT_TABLES } = require('../../src/services/tenant-service');
const {
    PLATFORM_GLOBAL_BACKUP_TABLES,
    PLATFORM_BACKUP_EXCLUDED_TABLES,
    TENANT_BACKUP_EXCLUDED_TABLES,
    TENANT_BACKUP_TABLES,
    classifyPlatformTable,
    getPlatformBackupCoverage,
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
    assert.ok(PLATFORM_GLOBAL_BACKUP_TABLES.some((item) => item.table === 'saas_plan_tenant_types'));
    assert.equal(PLATFORM_GLOBAL_BACKUP_TABLES.some((item) => item.table === 'gym_user_tenants'), true);
    assert.ok(TENANT_BACKUP_EXCLUDED_TABLES.includes('gym_backup_operations'));
    assert.equal(tenantTables.has('gym_user_tenants'), false);
    assert.equal(tenantTables.has('gym_tenants'), false);
    assert.equal(tenantTables.has('saas_plans'), false);
});

test('platform coverage identifies missing, unclassified and tenant-owned physical tables', () => {
    const physical = [
        ...PLATFORM_GLOBAL_BACKUP_TABLES.map((item) => item.table),
        ...TENANT_BACKUP_TABLES.map((item) => item.table),
        ...PLATFORM_BACKUP_EXCLUDED_TABLES
    ];
    const covered = getPlatformBackupCoverage({
        existingTables: physical,
        tenantTables: TENANT_BACKUP_TABLES.map((item) => item.table)
    });
    assert.equal(covered.status, 'covered');
    assert.deepEqual(covered.unclassifiedTables, []);
    assert.deepEqual(covered.unregisteredTenantTables, []);

    const gap = getPlatformBackupCoverage({
        existingTables: [...physical, 'future_platform_table', 'future_tenant_table'],
        tenantTables: [...TENANT_BACKUP_TABLES.map((item) => item.table), 'future_tenant_table']
    });
    assert.equal(gap.status, 'attention');
    assert.deepEqual(gap.unregisteredTenantTables, ['future_tenant_table']);
    assert.deepEqual(gap.unclassifiedTables, ['future_platform_table', 'future_tenant_table']);
});

test('legacy production tables are classified without requiring the modern tenant_type schema', () => {
    assert.equal(classifyPlatformTable('Appointments').classification, 'LEGACY_REQUIRED');
    assert.equal(classifyPlatformTable('UserProfiles').classification, 'LEGACY_REQUIRED');
    assert.equal(classifyPlatformTable('Permissions').classification, 'REFERENCE_REQUIRED');
    assert.equal(classifyPlatformTable('JobExecutionLogs').classification, 'TRANSIENT_EXCLUDED');
    assert.equal(classifyPlatformTable('gym_auth_sessions').classification, 'SECRET_EXCLUDED');
    assert.equal(classifyPlatformTable('unknown_legacy_table', { hasTenantId: true }).classification, 'UNKNOWN');
});

test('legacy source coverage allows absent future trainer tables and covers reviewed physical tables', () => {
    const coverage = getPlatformBackupCoverage({
        sourceSchemaGeneration: 'legacy-pre-trainer',
        existingTables: ['gym_tenants', 'gym_users', 'gym_user_tenants', 'Appointments', 'Permissions', 'JobExecutionLogs'],
        tenantTables: ['Appointments']
    });
    assert.equal(coverage.status, 'covered');
    assert.deepEqual(coverage.unclassifiedTables, []);
    assert.deepEqual(coverage.unregisteredTenantTables, []);
    assert.ok(coverage.absentModernTables.includes('trainer_packages'));
    assert.ok(coverage.legacyExcludedTables.includes('JobExecutionLogs'));
});
