const { getPool, sql } = require('./db');
const {
    addDays,
    addMonths,
    formatDateOnly,
    parseDateOnly,
    todayInTimeZone,
    toUtcDate
} = require('./date-utils');
const { ensurePaymentTransactionsTable } = require('./member-service');

function appError(message, statusCode = 400) {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.expose = true;
    return error;
}

function requiredString(value, fieldName, maxLength) {
    const normalized = String(value ?? '').trim();
    if (!normalized) throw appError(`${fieldName} مطلوب.`);
    if (normalized.length > maxLength) throw appError(`${fieldName} أطول من المسموح.`);
    return normalized;
}

function optionalString(value, maxLength) {
    if (value === undefined || value === null) return null;
    const normalized = String(value).trim();
    if (!normalized) return null;
    if (normalized.length > maxLength) throw appError('إحدى البيانات النصية أطول من المسموح.');
    return normalized;
}

function positiveMoney(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 9999999999) {
        throw appError('مبلغ المصروف غير صالح.');
    }
    return Math.round(amount * 100) / 100;
}

function ensureId(value) {
    const id = Number(value);
    if (!Number.isInteger(id) || id < 1) throw appError('معرّف المصروف غير صالح.');
    return id;
}

function currentMonthRange() {
    const today = todayInTimeZone();
    const [year, month] = today.split('-').map(Number);
    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const nextMonth = addMonths(monthStart, 1);
    return {
        year,
        month,
        startDate: monthStart,
        endDate: addDays(nextMonth, -1),
        nextMonth
    };
}

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

function mapExpense(row) {
    return {
        id: Number(row.id),
        name: row.expense_name,
        amount: Number(row.amount || 0),
        expenseDate: formatDateOnly(row.expense_date),
        notes: row.notes || null,
        createdAt: row.created_at
    };
}

async function getMonthlyFinance() {
    await ensureExpensesTable();
    await ensurePaymentTransactionsTable();
    const pool = await getPool();
    const range = currentMonthRange();
    const paymentRequest = pool.request()
        .input('monthStart', sql.Date, toUtcDate(range.startDate))
        .input('nextMonth', sql.Date, toUtcDate(range.nextMonth));
    const expenseSummaryRequest = pool.request()
        .input('monthStart', sql.Date, toUtcDate(range.startDate))
        .input('nextMonth', sql.Date, toUtcDate(range.nextMonth));
    const expenseItemsRequest = pool.request()
        .input('monthStart', sql.Date, toUtcDate(range.startDate))
        .input('nextMonth', sql.Date, toUtcDate(range.nextMonth));

    const [paymentsResult, expenseSummaryResult, expenseItemsResult] = await Promise.all([
        paymentRequest.query(`
            SELECT COUNT(*) AS paidSubscriptionCount,
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

    const paymentSummary = paymentsResult.recordset[0] || {};
    const expenseSummary = expenseSummaryResult.recordset[0] || {};
    const subscriptionsTotal = Number(paymentSummary.subscriptionsTotal || 0);
    const expensesTotal = Number(expenseSummary.expensesTotal || 0);

    return {
        period: range,
        subscriptions: {
            total: subscriptionsTotal,
            count: Number(paymentSummary.paidSubscriptionCount || 0)
        },
        expenses: {
            total: expensesTotal,
            count: Number(expenseSummary.expenseCount || 0),
            items: expenseItemsResult.recordset.map(mapExpense)
        },
        net: subscriptionsTotal - expensesTotal
    };
}

async function createExpense(body = {}) {
    const name = requiredString(body.name ?? body.expenseName, 'اسم المصروف', 120);
    const amount = positiveMoney(body.amount);
    const expenseDate = parseDateOnly(body.expenseDate || todayInTimeZone(), 'تاريخ المصروف');
    const notes = optionalString(body.notes, 500);
    await ensureExpensesTable();
    const pool = await getPool();
    const result = await pool.request()
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

    return mapExpense(result.recordset[0]);
}

async function updateExpense(id, body = {}) {
    const expenseId = ensureId(id);
    const name = requiredString(body.name ?? body.expenseName, 'اسم المصروف', 120);
    const amount = positiveMoney(body.amount);
    const expenseDate = parseDateOnly(body.expenseDate, 'تاريخ المصروف');
    const notes = optionalString(body.notes, 500);
    await ensureExpensesTable();
    const pool = await getPool();
    const result = await pool.request()
        .input('id', sql.Int, expenseId)
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
    if (!result.recordset[0]) throw appError('المصروف غير موجود.', 404);
    return mapExpense(result.recordset[0]);
}

async function deleteExpense(id) {
    const expenseId = ensureId(id);
    await ensureExpensesTable();
    const pool = await getPool();
    const result = await pool.request()
        .input('id', sql.Int, expenseId)
        .query('DELETE FROM dbo.gym_expenses WHERE id = @id;');
    if (!result.rowsAffected[0]) throw appError('المصروف غير موجود.', 404);
}

module.exports = {
    createExpense,
    deleteExpense,
    ensureExpensesTable,
    getMonthlyFinance,
    updateExpense
};
