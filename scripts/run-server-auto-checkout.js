'use strict';

// VPS entrypoint for the independent attendance maintenance job. It runs
// per tenant so the attendance table (which predates tenant_id) is still
// constrained through the tenant-owned member relation.
require('dotenv').config();

const { closePool, getPool } = require('../src/database');
const { withTransaction } = require('../src/database/transaction');
const { runTenantContext } = require('../src/tenancy/tenant-context');
const attendanceService = require('../src/services/attendance-service');
const saasService = require('../src/services/saas-service');
const { acquireJobLock, writeJobResult } = require('./server-job-utils');

async function listEligibleTenants() {
    const result = await (await getPool()).request().query(`
        SELECT id
        FROM dbo.gym_tenants
        WHERE status IN ('trial', 'active')
        ORDER BY id;
    `);
    return result.recordset.map((row) => Number(row.id)).filter((id) => Number.isInteger(id) && id > 0);
}

async function main() {
    const release = await acquireJobLock('attendance-auto-checkout');
    try {
        const summary = await runTenantContext({ mode: 'platform', tenantId: null }, async () => {
            const tenants = await listEligibleTenants();
            const results = [];
            for (const tenantId of tenants) {
                const closed = await runTenantContext({ mode: 'tenant', tenantId }, async () => {
                    return withTransaction(async (transaction) => {
                        const count = await attendanceService.reconcileAutoCheckout(transaction);
                        if (count > 0) {
                            await saasService.recordAudit({
                                tenantId,
                                action: 'attendance_auto_checkout_job',
                                entityType: 'attendance_maintenance',
                                details: `Automatically checked out ${count} stale attendance record(s).`,
                                executor: transaction
                            });
                        }
                        return count;
                    });
                });
                results.push({ tenantId, closed });
            }
            return { tenants: tenants.length, closed: results.reduce((sum, item) => sum + item.closed, 0), results };
        });
        writeJobResult({ job: 'attendance-auto-checkout', status: 'success', ...summary, autoCheckoutMinutes: attendanceService.getAutoCheckoutMinutes() });
    } finally {
        await release();
    }
}

main().catch((error) => {
    writeJobResult({ job: 'attendance-auto-checkout', status: 'failed', code: error.code || 'AUTO_CHECKOUT_JOB_FAILED', message: error.message });
    process.exitCode = 1;
}).finally(() => closePool().catch(() => {}));
