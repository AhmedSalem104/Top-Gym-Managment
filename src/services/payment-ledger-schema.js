'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { getPool } = require('../database');

const MIGRATION_PATH = path.join(__dirname, '..', '..', 'database', 'migrations', '012-payment-ledger-integrity.sql');
let readyPromise;

async function ensurePaymentLedgerIntegrity({ readOnly = false } = {}) {
    // Schema changes belong to the migration/readiness workflow. A read-only
    // request must never repair or alter the financial ledger as a side effect.
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

function resetPaymentLedgerReadiness() {
    readyPromise = undefined;
}

module.exports = { MIGRATION_PATH, ensurePaymentLedgerIntegrity, resetPaymentLedgerReadiness };
