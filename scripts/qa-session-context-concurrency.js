'use strict';

// Local/test-only pooled-connection isolation gate. It performs read-only
// aggregate queries and reports counts only; it never prints tenant data.
const { closePool, getPool } = require('../src/database');
const { runTenantContext } = require('../src/tenancy/tenant-context');
const { assertSafeDatabaseTarget } = require('./verification-target');

function configuredTenantIds() {
    const raw = String(process.env.QA_SESSION_CONTEXT_TENANT_IDS || '').trim();
    if (!raw) return [1, 7, 30, 31];
    const ids = raw.split(',')
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isInteger(value) && value > 0);
    if (!ids.length) throw new Error('QA_SESSION_CONTEXT_TENANT_IDS must contain positive integer tenant ids.');
    return [...new Set(ids)];
}

const tenantIds = configuredTenantIds();
const requestsPerTenant = 25;

async function verify() {
    assertSafeDatabaseTarget({
        environment: process.env.QA_TENANCY_ENV,
        confirmation: process.env.QA_TENANCY_CONFIRM,
        allowedHosts: process.env.QA_TENANCY_ALLOWED_DB_HOSTS,
        purpose: 'SESSION_CONTEXT concurrency QA'
    });

    const jobs = tenantIds.flatMap((tenantId) => Array.from({ length: requestsPerTenant }, () => (
        runTenantContext({ mode: 'tenant', tenantId }, async () => {
            const pool = await getPool();
            const result = await pool.request().query(`
                SELECT COUNT_BIG(*) AS visible_rows,
                       COUNT(DISTINCT tenant_id) AS visible_tenants,
                       MIN(tenant_id) AS minimum_tenant,
                       MAX(tenant_id) AS maximum_tenant
                FROM dbo.members;
            `);
            const row = result.recordset[0] || {};
            return {
                tenantId,
                visibleRows: Number(row.visible_rows || 0),
                visibleTenants: Number(row.visible_tenants || 0),
                minimumTenant: row.minimum_tenant == null ? null : Number(row.minimum_tenant),
                maximumTenant: row.maximum_tenant == null ? null : Number(row.maximum_tenant)
            };
        })
    )));

    const settled = await Promise.allSettled(jobs);
    const errors = settled.filter((item) => item.status === 'rejected');
    const results = settled.filter((item) => item.status === 'fulfilled').map((item) => item.value);
    const mismatches = results.filter((item) => (
        item.visibleTenants > 1
        || (item.visibleTenants === 1 && (item.minimumTenant !== item.tenantId || item.maximumTenant !== item.tenantId))
    ));

    if (errors.length || mismatches.length || results.length !== tenantIds.length * requestsPerTenant) {
        const error = new Error('SESSION_CONTEXT pooled-connection isolation failed.');
        error.details = { requestCount: jobs.length, fulfilled: results.length, errors: errors.length, mismatches: mismatches.length };
        throw error;
    }

    return { status: 'PASS', requestCount: jobs.length, errors: 0, mismatches: 0 };
}

verify()
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => {
        console.error(JSON.stringify({ status: 'FAIL', requestCount: tenantIds.length * requestsPerTenant, errors: error.details?.errors ?? 1, mismatches: error.details?.mismatches ?? 0 }));
        process.exitCode = 1;
    })
    .finally(() => closePool().catch(() => {}));
