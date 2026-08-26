'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { closePool, getPool, sql } = require('./pool');
const { getTenantContext, runTenantContext } = require('../tenancy/tenant-context');

async function initDatabase() {
    const initialize = async () => {
        const pool = await getPool();
        const schema = fs.readFileSync(path.join(__dirname, '..', '..', 'database', 'schema.sql'), 'utf8');
        await pool.request().batch(schema);
    };
    // Schema/bootstrap work must see legacy defaults even when a script or
    // test calls initDatabase() directly outside an HTTP tenant context.
    return getTenantContext()
        ? initialize()
        : runTenantContext({ mode: 'platform', tenantId: 1 }, initialize);
}

module.exports = { closePool, getPool, initDatabase, sql };
