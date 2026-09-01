'use strict';

const { getPool, sql } = require('../database/pool');
const { toUtcDate } = require('../utils/date');
const { getTenantContext } = require('../tenancy/tenant-context');

let expensesTablePromise;

async function ensureExpensesTable({ readOnly = false } = {}) {
    if (readOnly || getTenantContext()?.readOnlyBaseline) return;
    if (!expensesTablePromise) {
        expensesTablePromise = (async () => {
            const pool = await getPool();
            await pool.request().batch(`
                IF OBJECT_ID(N'dbo.gym_expenses', N'U') IS NULL
                BEGIN
                    CREATE TABLE dbo.gym_expenses (
                        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_expenses_runtime PRIMARY KEY,
                        expense_name NVARCHAR(120) NOT NULL,
                        amount DECIMAL(12,2) NOT NULL,
                        expense_date DATE NOT NULL,
                        notes NVARCHAR(500) NULL,
                        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_expenses_created_runtime DEFAULT (SYSUTCDATETIME()),
                        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_expenses_updated_runtime DEFAULT (SYSUTCDATETIME()),
                        CONSTRAINT CK_gym_expenses_amount_runtime CHECK (amount > 0)
                    );
                END;
                IF COL_LENGTH(N'dbo.gym_expenses', N'expense_source') IS NULL
                    ALTER TABLE dbo.gym_expenses ADD expense_source VARCHAR(20) NOT NULL CONSTRAINT DF_gym_expenses_source_runtime DEFAULT ('gym');
                IF COL_LENGTH(N'dbo.gym_expenses', N'expense_category') IS NULL
                    ALTER TABLE dbo.gym_expenses ADD expense_category NVARCHAR(80) NULL;
                IF COL_LENGTH(N'dbo.gym_expenses', N'payment_method') IS NULL
                    ALTER TABLE dbo.gym_expenses ADD payment_method VARCHAR(20) NULL;
                IF COL_LENGTH(N'dbo.gym_expenses', N'created_by_user_id') IS NULL
                    ALTER TABLE dbo.gym_expenses ADD created_by_user_id INT NULL;
                IF COL_LENGTH(N'dbo.gym_expenses', N'is_voided') IS NULL
                    ALTER TABLE dbo.gym_expenses ADD is_voided BIT NOT NULL CONSTRAINT DF_gym_expenses_voided_runtime DEFAULT (0);
                IF COL_LENGTH(N'dbo.gym_expenses', N'voided_at') IS NULL
                    ALTER TABLE dbo.gym_expenses ADD voided_at DATETIME2(0) NULL;
                IF COL_LENGTH(N'dbo.gym_expenses', N'voided_by_user_id') IS NULL
                    ALTER TABLE dbo.gym_expenses ADD voided_by_user_id INT NULL;
                IF NOT EXISTS (
                    SELECT 1 FROM sys.indexes
                    WHERE name = N'IX_gym_expenses_date' AND object_id = OBJECT_ID(N'dbo.gym_expenses')
                )
                BEGIN
                    CREATE INDEX IX_gym_expenses_date ON dbo.gym_expenses(expense_date DESC, id DESC);
                END;
            `);
        })().catch((error) => {
            expensesTablePromise = undefined;
            throw error;
        });
    }
    return expensesTablePromise;
}

async function getMonthlyData(range) {
    const pool = await getPool();
    const paymentRequest = pool.request()
        .input('monthStart', sql.Date, toUtcDate(range.startDate))
        .input('nextMonth', sql.Date, toUtcDate(range.nextMonth));
    const expenseSummaryRequest = pool.request()
        .input('monthStart', sql.Date, toUtcDate(range.startDate))
        .input('nextMonth', sql.Date, toUtcDate(range.nextMonth));
    const expenseItemsRequest = pool.request()
        .input('monthStart', sql.Date, toUtcDate(range.startDate))
        .input('nextMonth', sql.Date, toUtcDate(range.nextMonth));

    return Promise.all([
        paymentRequest.query(`
            SELECT COUNT(CASE WHEN amount_paid > 0 THEN 1 END) AS paidTransactionCount,
                   ISNULL(SUM(amount_paid), 0) AS subscriptionsTotal
            FROM dbo.gym_payment_transactions
            WHERE paid_at >= @monthStart
              AND paid_at < @nextMonth
              AND is_voided = 0
              AND amount_paid <> 0;
        `),
        expenseSummaryRequest.query(`
            SELECT COUNT(*) AS expenseCount,
                   ISNULL(SUM(amount), 0) AS expensesTotal
            FROM dbo.gym_expenses
            WHERE expense_date >= @monthStart
              AND expense_date < @nextMonth
              AND ISNULL(is_voided, 0) = 0;
        `),
        expenseItemsRequest.query(`
            SELECT id, expense_name, amount, expense_date, expense_source, expense_category, payment_method, notes, created_at
            FROM dbo.gym_expenses
            WHERE expense_date >= @monthStart
              AND expense_date < @nextMonth
              AND ISNULL(is_voided, 0) = 0
            ORDER BY expense_date DESC, id DESC;
        `)
    ]);
}

async function create({ name, amount, expenseDate, notes, source = 'gym', category = null, paymentMethod = null, createdByUserId = null }) {
    const pool = await getPool();
    return pool.request()
        .input('name', sql.NVarChar(120), name)
        .input('amount', sql.Decimal(12, 2), amount)
        .input('expenseDate', sql.Date, toUtcDate(expenseDate))
        .input('source', sql.VarChar(20), source)
        .input('category', sql.NVarChar(80), category)
        .input('paymentMethod', sql.VarChar(20), paymentMethod)
        .input('createdByUserId', sql.Int, createdByUserId)
        .input('notes', sql.NVarChar(500), notes)
        .query(`
            INSERT INTO dbo.gym_expenses (expense_name, amount, expense_date, expense_source, expense_category, payment_method, created_by_user_id, notes)
            OUTPUT INSERTED.id, INSERTED.expense_name, INSERTED.amount, INSERTED.expense_date,
                   INSERTED.expense_source, INSERTED.expense_category, INSERTED.payment_method, INSERTED.notes, INSERTED.created_at
            VALUES (@name, @amount, @expenseDate, @source, @category, @paymentMethod, @createdByUserId, @notes);
        `);
}

async function update({ id, name, amount, expenseDate, notes, source = null, category = null, paymentMethod = null }) {
    const pool = await getPool();
    return pool.request()
        .input('id', sql.Int, id)
        .input('name', sql.NVarChar(120), name)
        .input('amount', sql.Decimal(12, 2), amount)
        .input('expenseDate', sql.Date, toUtcDate(expenseDate))
        .input('source', sql.VarChar(20), source)
        .input('category', sql.NVarChar(80), category)
        .input('paymentMethod', sql.VarChar(20), paymentMethod)
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
                   INSERTED.expense_source, INSERTED.expense_category, INSERTED.payment_method, INSERTED.notes, INSERTED.created_at
            WHERE id = @id;
        `);
}

async function remove(id) {
    const pool = await getPool();
    return pool.request()
        .input('id', sql.Int, id)
        .query('DELETE FROM dbo.gym_expenses WHERE id = @id;');
}

module.exports = { create, ensureExpensesTable, getMonthlyData, remove, update };
