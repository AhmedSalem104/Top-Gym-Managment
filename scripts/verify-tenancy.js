'use strict';

require('dotenv').config();

const { closePool, getPool, sql } = require('../src/database');
const { runTenantContext } = require('../src/tenancy/tenant-context');
const { getTenantSecuritySnapshot, tenantSecuritySnapshotIsReady } = require('../src/services/tenant-service');
const { assertSafeDatabaseTarget } = require('./verification-target');

async function verify() {
    assertSafeDatabaseTarget({
        environment: process.env.QA_TENANCY_ENV,
        confirmation: process.env.QA_TENANCY_CONFIRM,
        allowedHosts: process.env.QA_TENANCY_ALLOWED_DB_HOSTS,
        purpose: 'Tenant isolation QA'
    });
    const result = await runTenantContext({ mode: 'platform', tenantId: 1 }, async () => {
        const pool = await getPool();
        const tenants = await pool.request().query('SELECT id, name, slug, status FROM dbo.gym_tenants ORDER BY id;');
        const security = await getTenantSecuritySnapshot(pool);
        if (!tenantSecuritySnapshotIsReady(security)) {
            const error = new Error('Tenant data isolation is not ready.');
            error.code = 'TENANT_ISOLATION_NOT_READY';
            throw error;
        }
        const nullableTenantTables = new Set((security.nullableTenantTables || []).map((table) => String(table).toLowerCase()));
        const tableAudit = await Promise.all(security.actualTenantTables.map(async (qualifiedName) => {
            const [schema, ...nameParts] = String(qualifiedName).split('.');
            const name = nameParts.join('.');
            const quote = (identifier) => `[${String(identifier).replace(/]/g, ']]')}]`;
            const tableResult = await pool.request().query(`SELECT COUNT_BIG(*) AS total, SUM(CASE WHEN tenant_id IS NULL THEN 1 ELSE 0 END) AS unassigned FROM ${quote(schema)}.${quote(name)};`);
            return {
                name: qualifiedName,
                rows: Number(tableResult.recordset[0]?.total || 0),
                unassigned: Number(tableResult.recordset[0]?.unassigned || 0),
                nullableTenantColumn: nullableTenantTables.has(String(qualifiedName).toLowerCase())
            };
        }));
        const userMappings = await pool.request().query("SELECT COUNT(*) AS total FROM dbo.gym_user_tenants WHERE tenant_id=1 AND status='active';");
        const topGymRows = await pool.request().query('SELECT COUNT_BIG(*) AS total FROM dbo.members WHERE tenant_id=1;');
        const currentTenantWriteAllowed = await runTenantContext({ mode: 'tenant', tenantId: 1 }, async () => {
            const tenantPool = await getPool();
            const transaction = tenantPool.transaction();
            await transaction.begin();
            try {
                await transaction.request()
                    .input('probeCode', sql.VarChar(40), `__tenant_allowed_probe_${Date.now()}`)
                    .query("INSERT INTO dbo.gym_day_pass_types(type_code, type_name, price) VALUES (@probeCode, N'Allowed probe', 1);");
                await transaction.rollback();
                return true;
            } catch (_) {
                await transaction.rollback().catch(() => {});
                return false;
            }
        });
        const foreignTenantRows = await runTenantContext({ mode: 'tenant', tenantId: 2147483647 }, async () => {
            const isolatedPool = await getPool();
            const count = await isolatedPool.request().query('SELECT COUNT_BIG(*) AS total FROM dbo.members;');
            return Number(count.recordset[0]?.total || 0);
        });
        const crossTenantWriteBlocked = await runTenantContext({ mode: 'tenant', tenantId: 2147483647 }, async () => {
            const isolatedPool = await getPool();
            const transaction = isolatedPool.transaction();
            await transaction.begin();
            try {
                await transaction.request()
                    .input('probeCode', sql.VarChar(40), `__tenant_probe_${Date.now()}`)
                    .query("INSERT INTO dbo.gym_day_pass_types(type_code, type_name, price, tenant_id) VALUES (@probeCode, N'Isolation probe', 1, 1);");
                await transaction.rollback();
                return false;
            } catch (_) {
                await transaction.rollback().catch(() => {});
                return true;
            }
        });
        return {
            tenants: tenants.recordset.map((tenant) => ({ id: Number(tenant.id), name: tenant.name, slug: tenant.slug, status: tenant.status })),
            security,
            coveredTables: security.protected_tables,
            actualTenantTables: security.actual_tenant_tables,
            registryTenantTables: security.registry_tenant_tables,
            unprotectedTenantTables: security.unprotected_tenant_tables,
            missingRegistryEntries: security.missing_registry_entries,
            missingRegistryTables: security.missing_registry_tables,
            unassignedRows: tableAudit.reduce((sum, table) => sum + (table.nullableTenantColumn ? 0 : table.unassigned), 0),
            tableAudit,
            mappedUsers: Number(userMappings.recordset[0]?.total || 0),
            topGymMemberRows: Number(topGymRows.recordset[0]?.total || 0),
            currentTenantWriteAllowed,
            unrelatedTenantMemberRows: foreignTenantRows,
            crossTenantWriteBlocked
        };
    });
    console.log(JSON.stringify(result));
}

verify()
    .catch((error) => {
        console.error('Tenancy verification failed:', error.message);
        process.exitCode = 1;
    })
    .finally(() => closePool().catch(() => {}));
