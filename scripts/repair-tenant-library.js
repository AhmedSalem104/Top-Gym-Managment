'use strict';

require('dotenv').config();

const { closePool, getPool, sql } = require('../src/db');
const { runTenantContext } = require('../src/tenancy/tenant-context');
const { syncLibraryData } = require('../src/services/library-service');
const { assertSafeDatabaseTarget } = require('./verification-target');

function requestedTenant() {
    const id = String(process.env.LIBRARY_REPAIR_TENANT_ID || '').trim();
    const slug = String(process.env.LIBRARY_REPAIR_TENANT_SLUG || '').trim().toLowerCase();
    if (Boolean(id) === Boolean(slug)) {
        throw new Error('Set exactly one of LIBRARY_REPAIR_TENANT_ID or LIBRARY_REPAIR_TENANT_SLUG, or set LIBRARY_REPAIR_ALL=true.');
    }
    if (id && (!/^\d+$/.test(id) || Number(id) < 1)) throw new Error('LIBRARY_REPAIR_TENANT_ID is invalid.');
    if (slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error('LIBRARY_REPAIR_TENANT_SLUG is invalid.');
    return id ? { id: Number(id) } : { slug };
}

async function listRepairTenants() {
    const pool = await getPool();
    const requested = requestedTenant();
    const request = pool.request();
    const result = requested.id
        ? await request.input('tenantId', sql.Int, requested.id).query("SELECT TOP (1) id FROM dbo.gym_tenants WHERE id=@tenantId AND status IN ('trial','active','suspended','expired','archived');")
        : await request.input('slug', sql.VarChar(80), requested.slug).query("SELECT TOP (1) id FROM dbo.gym_tenants WHERE slug=@slug AND status IN ('trial','active','suspended','expired','archived');");
    const tenantId = Number(result.recordset[0]?.id || 0);
    if (!tenantId) throw new Error('Requested library repair tenant was not found.');
    return [tenantId];
}

async function listAllRepairTenants() {
    const pool = await getPool();
    const result = await pool.request().query("SELECT id FROM dbo.gym_tenants WHERE status IN ('trial','active','suspended','expired','archived') ORDER BY id;");
    return result.recordset.map((row) => Number(row.id)).filter((id) => Number.isInteger(id) && id > 0);
}

async function main() {
    assertSafeDatabaseTarget({
        environment: process.env.LIBRARY_REPAIR_ENV || process.env.MIGRATION_ENV,
        confirmation: process.env.LIBRARY_REPAIR_CONFIRM,
        allowedHosts: process.env.LIBRARY_REPAIR_ALLOWED_HOSTS,
        purpose: 'Tenant library repair'
    });
    const all = String(process.env.LIBRARY_REPAIR_ALL || '').trim().toLowerCase() === 'true';
    const tenantIds = await runTenantContext(
        { mode: 'platform', tenantId: 1 },
        all ? listAllRepairTenants : listRepairTenants
    );
    if (!tenantIds.length) throw new Error('No tenants are available for library repair.');

    const repaired = [];
    // Keep repairs sequential so a maintenance command cannot create a burst
    // of large catalog transactions against SQL Server.
    for (const tenantId of tenantIds) {
        const counts = await runTenantContext({ mode: 'tenant', tenantId }, () => syncLibraryData());
        repaired.push({ tenantId, ...counts });
    }
    console.log(JSON.stringify({ status: 'ok', repaired }, null, 2));
}

if (require.main === module) {
    main()
        .catch((error) => {
            console.error('LIBRARY_REPAIR_FAILED:', error.message);
            process.exitCode = 1;
        })
        .finally(() => closePool().catch(() => {}));
}

module.exports = { listAllRepairTenants, listRepairTenants, main, requestedTenant };
