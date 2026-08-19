'use strict';

const { getPool } = require('./pool');

async function withTransaction(work) {
    const pool = await getPool();
    const transaction = pool.transaction();
    await transaction.begin();
    try {
        const result = await work(transaction);
        await transaction.commit();
        return result;
    } catch (error) {
        try {
            await transaction.rollback();
        } catch (_) {
            // Preserve the original failure; rollback errors are not actionable here.
        }
        throw error;
    }
}

module.exports = { withTransaction };
