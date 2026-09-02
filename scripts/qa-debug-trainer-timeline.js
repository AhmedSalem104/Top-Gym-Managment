'use strict';

// Local-only diagnostic for the post-migration clone. It prints only the
// database error class/message and safe identifiers; it is not a runtime path.
const { getPool, sql } = require('../src/database');
const { runTenantContext } = require('../src/tenancy/tenant-context');
const trainerService = require('../src/services/trainer-service');

async function main() {
    const pool = await getPool();
    let row = null;
    for (let tenantId = 19; tenantId >= 8 && !row; tenantId -= 1) {
        const candidate = await runTenantContext({ tenantId, mode: 'tenant' }, async () => {
            const result = await pool.request().query(`
                SELECT TOP (1) t.id AS tenant_id, u.id AS user_id, m.id AS member_id
                FROM dbo.gym_tenants t
                INNER JOIN dbo.gym_user_tenants ut ON ut.tenant_id=t.id AND ut.status='active' AND ut.role='Owner'
                INNER JOIN dbo.gym_users u ON u.id=ut.user_id AND u.status='Active'
                INNER JOIN dbo.members m ON m.tenant_id=t.id AND ISNULL(m.profile_status,'active') <> 'archived'
                WHERE t.id=${tenantId} AND t.tenant_type='independent_trainer'
                ORDER BY m.id DESC;`);
            return result.recordset[0] || null;
        });
        if (candidate) row = candidate;
    }
    if (!row) throw new Error('No synthetic Independent Trainer data found.');
    try {
        const data = await runTenantContext({ tenantId: Number(row.tenant_id), userId: Number(row.user_id), mode: 'tenant' }, () => trainerService.getClientTimeline(Number(row.member_id), { readOnly: true }));
        console.log(JSON.stringify({ status: 'PASS', tenantId: Number(row.tenant_id), memberId: Number(row.member_id), events: data.timeline.length }));
    } catch (error) {
        console.error(JSON.stringify({ status: 'FAIL', tenantId: Number(row.tenant_id), memberId: Number(row.member_id), name: error.name, code: error.code || null, number: error.number || null, message: error.message }));
        process.exitCode = 1;
    } finally {
        await pool.close();
    }
}

main().catch((error) => { console.error(JSON.stringify({ status: 'FAIL', message: error.message })); process.exitCode = 1; });
