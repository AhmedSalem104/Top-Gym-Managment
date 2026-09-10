'use strict';

require('dotenv').config();

const { closePool, getPool } = require('../src/database');
const { runTenantContext } = require('../src/tenancy/tenant-context');
const { getTenantSecuritySnapshot, tenantSecuritySnapshotIsReady } = require('../src/services/tenant-service');

async function verifyProductionSecurity() {
    if (String(process.env.RELEASE_PRODUCTION_SECURITY_CONFIRM || '').trim() !== 'YES') {
        const error = new Error('Production security verification requires explicit confirmation.');
        error.code = 'SECURITY_GATE_CONFIRMATION_MISSING';
        throw error;
    }
    const security = await runTenantContext({ mode: 'platform', tenantId: 1, readOnlyBaseline: true }, async () => getTenantSecuritySnapshot(await getPool()));
    if (!tenantSecuritySnapshotIsReady(security)) {
        const error = new Error('Tenant security snapshot is not ready.');
        error.code = 'TENANT_SECURITY_NOT_READY';
        throw error;
    }
    const knownTenantMembers = await runTenantContext({ mode: 'tenant', tenantId: 1, readOnlyBaseline: true }, async () => {
        const pool = await getPool();
        const result = await pool.request().query('SELECT COUNT_BIG(*) AS total FROM dbo.members;');
        return Number(result.recordset[0]?.total || 0);
    });
    const unrelatedTenantMembers = await runTenantContext({ mode: 'tenant', tenantId: 2147483647, readOnlyBaseline: true }, async () => {
        const pool = await getPool();
        const result = await pool.request().query('SELECT COUNT_BIG(*) AS total FROM dbo.members;');
        return Number(result.recordset[0]?.total || 0);
    });
    if (unrelatedTenantMembers !== 0) {
        const error = new Error('Cross-tenant read returned data.');
        error.code = 'CROSS_TENANT_READ_DETECTED';
        throw error;
    }
    return {
        status: 'PASS',
        actualTenantTables: Number(security.actual_tenant_tables || 0),
        registryTenantTables: Number(security.registry_tenant_tables || 0),
        protectedTables: Number(security.protected_tables || 0),
        unprotectedTenantTables: Number(security.unprotected_tenant_tables || 0),
        predicateGaps: Number(security.invalid_predicates || 0),
        knownTenantMembers,
        unrelatedTenantMembers
    };
}

if (require.main === module) {
    verifyProductionSecurity()
        .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
        .catch((error) => {
            process.stderr.write(`${JSON.stringify({ status: 'FAIL', code: error.code || 'PRODUCTION_SECURITY_GATE_FAILED' })}\n`);
            process.exitCode = 1;
        })
        .finally(() => closePool().catch(() => {}));
}

module.exports = { verifyProductionSecurity };
