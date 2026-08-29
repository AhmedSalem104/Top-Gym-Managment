require('dotenv').config();

const { closePool, getPool, sql } = require('../src/db');
const { runTenantContext } = require('../src/tenancy/tenant-context');
const { syncLibraryData } = require('../src/services/library-service');
const { assertSafeDatabaseTarget } = require('./verification-target');

function requestedTenant() {
    const id = String(process.env.LIBRARY_TENANT_ID || '').trim();
    const slug = String(process.env.LIBRARY_TENANT_SLUG || '').trim().toLowerCase();
    if (Boolean(id) === Boolean(slug)) {
        throw new Error('Set exactly one of LIBRARY_TENANT_ID or LIBRARY_TENANT_SLUG.');
    }
    if (id && (!/^\d+$/.test(id) || Number(id) < 1)) throw new Error('LIBRARY_TENANT_ID is invalid.');
    if (slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error('LIBRARY_TENANT_SLUG is invalid.');
    return id ? { id: Number(id) } : { slug };
}

async function resolveTenant() {
    const requested = requestedTenant();
    const pool = await getPool();
    const request = pool.request();
    const result = requested.id
        ? await request.input('tenantId', sql.Int, requested.id).query("SELECT TOP (1) id FROM dbo.gym_tenants WHERE id=@tenantId AND status IN ('trial','active','suspended','expired','archived');")
        : await request.input('slug', sql.VarChar(80), requested.slug).query("SELECT TOP (1) id FROM dbo.gym_tenants WHERE slug=@slug AND status IN ('trial','active','suspended','expired','archived');");
    const tenantId = Number(result.recordset[0]?.id || 0);
    if (!tenantId) throw new Error('Requested library tenant was not found.');
    return tenantId;
}

(async () => {
    try {
        assertSafeDatabaseTarget({
            environment: process.env.LIBRARY_SYNC_ENV || process.env.MIGRATION_ENV,
            confirmation: process.env.LIBRARY_SYNC_CONFIRM,
            allowedHosts: process.env.LIBRARY_SYNC_ALLOWED_HOSTS,
            purpose: 'Library synchronization'
        });
        const tenantId = await runTenantContext({ mode: 'platform', tenantId: 1 }, resolveTenant);
        const counts = await runTenantContext({ mode: 'tenant', tenantId }, () => syncLibraryData());
        console.log(`LIBRARY_SYNC_OK tenant=${tenantId} muscles=${counts.muscles} foods=${counts.foods} exercises=${counts.exercises}`);
    } catch (error) {
        console.error('LIBRARY_SYNC_FAILED:', error.message);
        process.exitCode = 1;
    } finally {
        await closePool();
    }
})();
