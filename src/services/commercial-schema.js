'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { getPool } = require('../database');

const MIGRATION_PATH = path.join(__dirname, '..', '..', 'database', 'migrations', '011-commercial-portal-and-registration.sql');
let readyPromise;

async function ensureCommercialTables({ readOnly = false } = {}) {
    // Public/read-only requests must never create commercial tables as a side
    // effect. The guarded migration is applied by startup/migration workflows.
    if (readOnly) return;
    if (!readyPromise) {
        readyPromise = (async () => {
            const migration = fs.readFileSync(MIGRATION_PATH, 'utf8');
            const pool = await getPool();
            await pool.request().batch(migration);
        })().catch((error) => {
            readyPromise = undefined;
            throw error;
        });
    }
    return readyPromise;
}

function resetCommercialSchemaReadiness() {
    readyPromise = undefined;
}

module.exports = { ensureCommercialTables, resetCommercialSchemaReadiness, MIGRATION_PATH };
