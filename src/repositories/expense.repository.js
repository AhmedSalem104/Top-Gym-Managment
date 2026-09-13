'use strict';

const { getPool, sql } = require('../database/pool');
const { toUtcDate } = require('../utils/date');
const {
    bindFinancialScope,
    branchOnlyFinancialScopeSql,
    financialDateRangeSql,
    subscriptionPaymentScopeSql
} = require('./financial-scope');
const { actualCollectionCaseSql, refundCaseSql, snapshotDuplicateConditionSql } = require('../services/financial-ledger-service');

let expensesTablePromise;

async function ensureExpensesTable({ readOnly = false } = {}) {
    if (!expensesTablePromise) {
        expensesTablePromise = (async () => {
            const pool = await getPool();
            const result = await pool.request().query(`
                SELECT
                    CASE WHEN OBJECT_ID(N'dbo.gym_expenses', N'U') IS NULL THEN 1 ELSE 0 END AS table_missing,
                    CASE WHEN COL_LENGTH(N'dbo.gym_expenses', N'expense_name') IS NULL THEN 1 ELSE 0 END AS name_missing,
                    CASE WHEN COL_LENGTH(N'dbo.gym_expenses', N'amount') IS NULL THEN 1 ELSE 0 END AS amount_missing,
                    CASE WHEN COL_LENGTH(N'dbo.gym_expenses', N'expense_date') IS NULL THEN 1 ELSE 0 END AS date_missing,
                    CASE WHEN COL_LENGTH(N'dbo.gym_expenses', N'branch_id') IS NULL THEN 1 ELSE 0 END AS branch_missing,
                    CASE WHEN COL_LENGTH(N'dbo.gym_expenses', N'is_voided') IS NULL THEN 1 ELSE 0 END AS void_missing,
                    CASE WHEN COL_LENGTH(N'dbo.gym_expenses', N'created_at') IS NULL THEN 1 ELSE 0 END AS created_missing
            `);
            const row = result.recordset?.[0] || {};
            const missing = Object.entries({
                table_missing: 'dbo.gym_expenses',
                name_missing: 'gym_expenses.expense_name',
                amount_missing: 'gym_expenses.amount',
                date_missing: 'gym_expenses.expense_date',
                branch_missing: 'gym_expenses.branch_id',
                void_missing: 'gym_expenses.is_voided',
                created_missing: 'gym_expenses.created_at'
            }).filter(([field]) => Number(row[field]) === 1).map(([, name]) => name);
            if (missing.length) {
                const error = new Error('Financial expense schema is not ready. Apply the approved migration before serving financial requests.');
                error.statusCode = 503;
                error.code = 'EXPENSES_SCHEMA_NOT_READY';
                error.expose = true;
                error.missing = missing;
                throw error;
            }
        })().catch((error) => {
            expensesTablePromise = undefined;
            throw error;
        });
    }
    return expensesTablePromise;
}

async function getMonthlyData(range, { branchId = null, sectionId = null } = {}) {
    const pool = await getPool();
    const scope = { branchId, sectionId };
    const paymentRequest = pool.request()
        .input('monthStart', sql.Date, toUtcDate(range.startDate))
        .input('nextMonth', sql.Date, toUtcDate(range.nextMonth));
    const expenseSummaryRequest = pool.request()
        .input('monthStart', sql.Date, toUtcDate(range.startDate))
        .input('nextMonth', sql.Date, toUtcDate(range.nextMonth));
    const expenseItemsRequest = pool.request()
        .input('monthStart', sql.Date, toUtcDate(range.startDate))
        .input('nextMonth', sql.Date, toUtcDate(range.nextMonth));
    bindFinancialScope(paymentRequest, scope, sql);
    bindFinancialScope(expenseSummaryRequest, scope, sql);
    bindFinancialScope(expenseItemsRequest, scope, sql);

    return Promise.all([
        paymentRequest.query(`
            WITH ledger_entries AS (
                SELECT payment_transactions.amount_paid,
                       ${actualCollectionCaseSql({ transactionAlias: 'payment_transactions', membershipAlias: 'payment_membership' })} AS is_actual_collection,
                       ${refundCaseSql({ transactionAlias: 'payment_transactions' })} AS is_refund
                FROM dbo.gym_payment_transactions AS payment_transactions
                INNER JOIN dbo.memberships AS payment_membership ON payment_membership.id = payment_transactions.membership_id
                WHERE ${financialDateRangeSql('payment_transactions.paid_at', '@monthStart', '@nextMonth')}
                  AND payment_transactions.is_voided = 0
                  AND payment_transactions.amount_paid <> 0
                  ${subscriptionPaymentScopeSql({ paymentAlias: 'payment_transactions', membershipAlias: 'payment_membership' })}
            )
            SELECT COUNT(CASE WHEN is_actual_collection = 1 THEN 1 END) AS paidTransactionCount,
                   ISNULL(SUM(CASE WHEN is_actual_collection = 1 THEN amount_paid ELSE 0 END), 0) AS subscriptionsTotal,
                   ISNULL(SUM(CASE WHEN is_refund = 1 THEN -amount_paid ELSE 0 END), 0) AS refundsTotal
            FROM ledger_entries;
        `),
        expenseSummaryRequest.query(`
            SELECT COUNT(*) AS expenseCount,
                   ISNULL(SUM(amount), 0) AS expensesTotal
            FROM dbo.gym_expenses
            WHERE ${financialDateRangeSql('expense_date', '@monthStart', '@nextMonth')}
              AND ISNULL(is_voided, 0) = 0
              ${branchOnlyFinancialScopeSql('gym_expenses')};
        `),
        expenseItemsRequest.query(`
            SELECT id, expense_name, amount, expense_date, expense_source, expense_category, payment_method, notes, created_at
            FROM dbo.gym_expenses
            WHERE ${financialDateRangeSql('expense_date', '@monthStart', '@nextMonth')}
              AND ISNULL(is_voided, 0) = 0
              ${branchOnlyFinancialScopeSql('gym_expenses')}
            ORDER BY expense_date DESC, id DESC;
        `)
    ]);
}

async function create({ name, amount, expenseDate, notes, source = 'gym', category = null, paymentMethod = null, createdByUserId = null, branchId = null }) {
    const pool = await getPool();
    return pool.request()
        .input('name', sql.NVarChar(120), name)
        .input('amount', sql.Decimal(12, 2), amount)
        .input('expenseDate', sql.Date, toUtcDate(expenseDate))
        .input('source', sql.VarChar(20), source)
        .input('category', sql.NVarChar(80), category)
        .input('paymentMethod', sql.VarChar(20), paymentMethod)
        .input('createdByUserId', sql.Int, createdByUserId)
        .input('branchId', sql.Int, branchId == null ? null : Number(branchId))
        .input('notes', sql.NVarChar(500), notes)
        .query(`
            INSERT INTO dbo.gym_expenses (expense_name, amount, expense_date, expense_source, expense_category, payment_method, created_by_user_id, branch_id, notes)
            OUTPUT INSERTED.id, INSERTED.expense_name, INSERTED.amount, INSERTED.expense_date,
                   INSERTED.expense_source, INSERTED.expense_category, INSERTED.payment_method, INSERTED.branch_id, INSERTED.notes, INSERTED.created_at
            VALUES (@name, @amount, @expenseDate, @source, @category, @paymentMethod, @createdByUserId, @branchId, @notes);
        `);
}

async function update({ id, name, amount, expenseDate, notes, source = null, category = null, paymentMethod = null, branchId = null }) {
    const pool = await getPool();
    return pool.request()
        .input('id', sql.Int, id)
        .input('name', sql.NVarChar(120), name)
        .input('amount', sql.Decimal(12, 2), amount)
        .input('expenseDate', sql.Date, toUtcDate(expenseDate))
        .input('source', sql.VarChar(20), source)
        .input('category', sql.NVarChar(80), category)
        .input('paymentMethod', sql.VarChar(20), paymentMethod)
        .input('branchId', sql.Int, branchId == null ? null : Number(branchId))
        .input('notes', sql.NVarChar(500), notes)
        .query(`
            UPDATE dbo.gym_expenses
            SET expense_name = @name,
                amount = @amount,
                expense_date = @expenseDate,
                expense_source = COALESCE(@source, expense_source),
                expense_category = @category,
                payment_method = @paymentMethod,
                notes = @notes,
                updated_at = SYSUTCDATETIME()
            OUTPUT INSERTED.id, INSERTED.expense_name, INSERTED.amount, INSERTED.expense_date,
                   INSERTED.expense_source, INSERTED.expense_category, INSERTED.payment_method, INSERTED.branch_id, INSERTED.notes, INSERTED.created_at
            WHERE id = @id AND (@branchId IS NULL OR branch_id = @branchId);
        `);
}

async function remove(id, { branchId = null } = {}) {
    const pool = await getPool();
    return pool.request()
        .input('id', sql.Int, id)
        .input('branchId', sql.Int, branchId == null ? null : Number(branchId))
        .query('DELETE FROM dbo.gym_expenses WHERE id = @id AND (@branchId IS NULL OR branch_id = @branchId);');
}

module.exports = { create, ensureExpensesTable, getMonthlyData, remove, update };
