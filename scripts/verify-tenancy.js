'use strict';

require('dotenv').config();

const { closePool, getPool, sql } = require('../src/database');
const { runTenantContext } = require('../src/tenancy/tenant-context');
const { TENANT_TABLES } = require('../src/services/tenant-service');
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
        const policy = await pool.request().query("SELECT name, is_enabled FROM sys.security_policies WHERE name='gym_tenant_security_policy' AND schema_id=SCHEMA_ID('dbo');");
        const columns = await pool.request().query(`
            SELECT t.name
            FROM sys.tables t
            INNER JOIN sys.columns c ON c.object_id=t.object_id AND c.name='tenant_id'
            WHERE t.schema_id=SCHEMA_ID('dbo') AND t.name IN (${TENANT_TABLES.map((name) => `N'${name}'`).join(',')});
        `);
        const existingTableNames = new Set(columns.recordset.map((row) => String(row.name)));
        const tableAudit = await Promise.all(TENANT_TABLES.filter((name) => existingTableNames.has(name)).map(async (name) => {
            const tableResult = await pool.request().query(`SELECT COUNT_BIG(*) AS total, SUM(CASE WHEN tenant_id IS NULL THEN 1 ELSE 0 END) AS unassigned FROM dbo.[${name}];`);
            return {
                name,
                rows: Number(tableResult.recordset[0]?.total || 0),
                unassigned: Number(tableResult.recordset[0]?.unassigned || 0)
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
            securityPolicy: policy.recordset[0] ? { name: policy.recordset[0].name, enabled: Boolean(policy.recordset[0].is_enabled) } : null,
            coveredTables: columns.recordset.length,
            expectedTables: TENANT_TABLES.length,
            unassignedRows: tableAudit.reduce((sum, table) => sum + table.unassigned, 0),
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
