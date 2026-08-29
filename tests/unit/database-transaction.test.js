'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { executeInTransaction } = require('../../src/database/transaction');

function transactionDouble({ beginError, commitError, rollbackError } = {}) {
    const calls = [];
    return {
        calls,
        async begin() {
            calls.push('begin');
            if (beginError) throw beginError;
        },
        async commit() {
            calls.push('commit');
            if (commitError) throw commitError;
        },
        async rollback() {
            calls.push('rollback');
            if (rollbackError) throw rollbackError;
        }
    };
}

test('transaction commits only after the callback succeeds', async () => {
    const transaction = transactionDouble();
    const result = await executeInTransaction(transaction, async () => 'ok');
    assert.equal(result, 'ok');
    assert.deepEqual(transaction.calls, ['begin', 'commit']);
});

test('transaction rolls back a callback failure and preserves the original error', async () => {
    const transaction = transactionDouble({ rollbackError: new Error('rollback failed') });
    const original = new Error('domain failed');
    await assert.rejects(
        executeInTransaction(transaction, async () => { throw original; }),
        (error) => error === original
    );
    assert.deepEqual(transaction.calls, ['begin', 'rollback']);
});

test('transaction does not rollback when begin fails', async () => {
    const transaction = transactionDouble({ beginError: new Error('begin failed') });
    await assert.rejects(executeInTransaction(transaction, async () => 'never'), /begin failed/);
    assert.deepEqual(transaction.calls, ['begin']);
});

test('transaction attempts rollback when commit fails', async () => {
    const transaction = transactionDouble({ commitError: new Error('commit failed') });
    await assert.rejects(executeInTransaction(transaction, async () => 'work'), /commit failed/);
    assert.deepEqual(transaction.calls, ['begin', 'commit', 'rollback']);
});
