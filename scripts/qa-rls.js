'use strict';

require('dotenv').config();

const { closePool, getPool } = require('../src/database');
const { runTenantContext } = require('../src/tenancy/tenant-context');
const { getTenantSecuritySnapshot, tenantSecuritySnapshotIsReady } = require('../src/services/tenant-service');
const { assertSafeDatabaseTarget } = require('./verification-target');

/**
 * Runtime RLS gate. It requires an explicitly authorized database target and
 * fails the command if the live schema, registry, policy, predicate, or auth
 * security contract is not ready.
 */
async function verifyRls() {
    assertSafeDatabaseTarget({
        environment: process.env.QA_TENANCY_ENV,
        confirmation: process.env.QA_TENANCY_CONFIRM,
        allowedHosts: process.env.QA_TENANCY_ALLOWED_DB_HOSTS,
        purpose: 'RLS coverage QA'
    });

    const snapshot = await runTenantContext({ mode: 'platform', tenantId: 1 }, async () => {
        const pool = await getPool();
        return getTenantSecuritySnapshot(pool);
    });
    if (!tenantSecuritySnapshotIsReady(snapshot)) {
        const error = new Error('RLS/schema security contract is not ready.');
        error.code = 'TENANT_ISOLATION_NOT_READY';
        error.details = snapshot;
        throw error;
    }
    return snapshot;
}

if (require.main === module) {
    verifyRls()
        .then((snapshot) => {
            console.log(JSON.stringify({ status: 'PASS', gate: 'qa:rls', security: snapshot }));
        })
        .catch((error) => {
            console.error(JSON.stringify({
                status: 'FAIL',
                gate: 'qa:rls',
                code: error.code || 'RLS_QA_FAILED',
                message: error.message,
                security: error.details || null
            }));
            process.exitCode = 1;
        })
        .finally(() => closePool().catch(() => {}));
}

module.exports = { verifyRls };
