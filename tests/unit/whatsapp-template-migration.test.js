'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { auditWhatsappTemplateMigration, TEMPLATE_IDS } = require('../../scripts/audit-whatsapp-template-migration');
const { getTenantSecuritySnapshot, TENANT_TABLES, tenantSecuritySnapshotIsReady } = require('../../src/services/tenant-service');

test('Migration 034 passes the local safety/readiness audit', () => {
    const report = auditWhatsappTemplateMigration();
    assert.equal(report.status, 'PASS');
    assert.equal(report.idempotency.guardedTables, true);
    assert.equal(report.idempotency.guardedSeeds, true);
    assert.equal(report.idempotency.replayDoesNotDuplicateDefaults, true);
    assert.equal(report.duplicateConstraints, 'PASS');
    assert.equal(report.deterministicSeed, 'PASS');
    assert.equal(report.defaultsSeeded, TEMPLATE_IDS.length);
    assert.equal(report.runtimeDdl, 'NONE');
    assert.equal(report.migrationLedger, 'PASS');
    assert.equal(report.backupClassification.system.scope, 'platform-global');
    assert.equal(report.backupClassification.overrides.scope, 'tenant');
    assert.deepEqual(report.findings, []);
});

function fakeRlsPool({ omitOverridePolicy = false } = {}) {
    const actual = TENANT_TABLES.map((name) => ({ schema_name: 'dbo', name, is_nullable: 0, data_type: 'int' }));
    const registered = TENANT_TABLES.map((name) => ({ schema_name: 'dbo', name }));
    const policy = TENANT_TABLES
        .filter((name) => !omitOverridePolicy || name !== 'gym_whatsapp_template_overrides')
        .flatMap((name) => [
            { policy_name: 'gym_tenant_security_policy', policy_schema: 'dbo', schema_name: 'dbo', table_name: name, is_enabled: 1, predicate_type_desc: 'FILTER', operation: null, operation_desc: null, predicate_definition: 'dbo.gym_tenant_access_predicate(tenant_id)' },
            { policy_name: 'gym_tenant_security_policy', policy_schema: 'dbo', schema_name: 'dbo', table_name: name, is_enabled: 1, predicate_type_desc: 'BLOCK', operation: 1, operation_desc: 'AFTER INSERT', predicate_definition: 'dbo.gym_tenant_access_predicate(tenant_id)' },
            { policy_name: 'gym_tenant_security_policy', policy_schema: 'dbo', schema_name: 'dbo', table_name: name, is_enabled: 1, predicate_type_desc: 'BLOCK', operation: 2, operation_desc: 'AFTER UPDATE', predicate_definition: 'dbo.gym_tenant_access_predicate(tenant_id)' }
        ]);
    return { request: () => ({ query: async () => ({ recordsets: [actual, registered, policy, [{ name: 'gym_tenant_access_predicate', schema_name: 'dbo', type: 'IF', is_ms_shipped: 0, is_schema_bound: 1 }], [{ schema_contract_ready: 1 }]] }) }) };
}

test('Migration 034 override table is included in the dynamic RLS gate and fails closed on a predicate gap', async () => {
    const ready = await getTenantSecuritySnapshot(fakeRlsPool());
    assert.equal(ready.actualTenantTables.includes('dbo.gym_whatsapp_template_overrides'), true);
    assert.equal(ready.protected_tables, TENANT_TABLES.length);
    assert.equal(ready.unprotected_tenant_tables, 0);
    assert.equal(tenantSecuritySnapshotIsReady(ready), true);

    const gap = await getTenantSecuritySnapshot(fakeRlsPool({ omitOverridePolicy: true }));
    assert.equal(gap.unprotectedTenantTables.includes('dbo.gym_whatsapp_template_overrides'), true);
    assert.equal(tenantSecuritySnapshotIsReady(gap), false);
});
