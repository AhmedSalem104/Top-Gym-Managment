'use strict';

const { getPool } = require('./pool');

async function executeInTransaction(transaction, work) {
    let started = false;
    let committed = false;
    try {
        await transaction.begin();
        started = true;
        const result = await work(transaction);
        await transaction.commit();
        committed = true;
        return result;
    } catch (error) {
        if (started && !committed) {
            try {
                await transaction.rollback();
            } catch (_) {
                // Preserve the original failure; rollback errors are not
                // actionable here and must not hide the domain error.
            }
        }
        throw error;
    }
}

async function withTransaction(work) {
    const pool = await getPool();
    const transaction = pool.transaction();
    return executeInTransaction(transaction, work);
}

module.exports = { executeInTransaction, withTransaction };
