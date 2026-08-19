'use strict';

const { getPool, sql } = require('../database/pool');
const { toUtcDate } = require('../utils/date');

let expensesTablePromise;

async function ensureExpensesTable() {
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
            SELECT COUNT(*) AS paidTransactionCount,
                   ISNULL(SUM(amount_paid), 0) AS subscriptionsTotal
            FROM dbo.gym_payment_transactions
            WHERE paid_at >= @monthStart
              AND paid_at < @nextMonth
              AND amount_paid > 0;
        `),
        expenseSummaryRequest.query(`
            SELECT COUNT(*) AS expenseCount,
                   ISNULL(SUM(amount), 0) AS expensesTotal
            FROM dbo.gym_expenses
            WHERE expense_date >= @monthStart
              AND expense_date < @nextMonth;
        `),
        expenseItemsRequest.query(`
            SELECT id, expense_name, amount, expense_date, notes, created_at
            FROM dbo.gym_expenses
            WHERE expense_date >= @monthStart
              AND expense_date < @nextMonth
            ORDER BY expense_date DESC, id DESC;
        `)
    ]);
}

async function create({ name, amount, expenseDate, notes }) {
    const pool = await getPool();
    return pool.request()
        .input('name', sql.NVarChar(120), name)
        .input('amount', sql.Decimal(12, 2), amount)
        .input('expenseDate', sql.Date, toUtcDate(expenseDate))
        .input('notes', sql.NVarChar(500), notes)
        .query(`
            INSERT INTO dbo.gym_expenses (expense_name, amount, expense_date, notes)
            OUTPUT INSERTED.id, INSERTED.expense_name, INSERTED.amount,
                   INSERTED.expense_date, INSERTED.notes, INSERTED.created_at
            VALUES (@name, @amount, @expenseDate, @notes);
        `);
}

async function update({ id, name, amount, expenseDate, notes }) {
    const pool = await getPool();
    return pool.request()
        .input('id', sql.Int, id)
        .input('name', sql.NVarChar(120), name)
        .input('amount', sql.Decimal(12, 2), amount)
        .input('expenseDate', sql.Date, toUtcDate(expenseDate))
        .input('notes', sql.NVarChar(500), notes)
        .query(`
            UPDATE dbo.gym_expenses
            SET expense_name = @name,
                amount = @amount,
                expense_date = @expenseDate,
                notes = @notes,
                updated_at = SYSUTCDATETIME()
            OUTPUT INSERTED.id, INSERTED.expense_name, INSERTED.amount,
                   INSERTED.expense_date, INSERTED.notes, INSERTED.created_at
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
