const {
    addDays,
    addMonths,
    formatDateOnly,
    parseDateOnly,
    todayInTimeZone
} = require('../utils/date');
const { ensurePaymentTransactionsTable } = require('./member-service');
const expenseRepository = require('../repositories/expense.repository');
const dayPassRepository = require('../repositories/day-pass.repository');

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

const ensureExpensesTable = expenseRepository.ensureExpensesTable;

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
    await dayPassRepository.ensureDayPassTables();
    const range = currentMonthRange();
    const [monthlyData, dayPassData] = await Promise.all([
        expenseRepository.getMonthlyData(range),
        dayPassRepository.getRangeSummary({ fromDate: range.startDate, nextDate: range.nextMonth })
    ]);

    const [resolvedPaymentsResult, resolvedExpenseSummaryResult, resolvedExpenseItemsResult] = monthlyData;

    const paymentSummary = resolvedPaymentsResult.recordset[0] || {};
    const expenseSummary = resolvedExpenseSummaryResult.recordset[0] || {};
    const subscriptionsTotal = Number(paymentSummary.subscriptionsTotal || 0);
    const dayPassesTotal = Number(dayPassData.amount || 0);
    const expensesTotal = Number(expenseSummary.expensesTotal || 0);

    return {
        period: range,
        subscriptions: {
            total: subscriptionsTotal,
            count: Number(paymentSummary.paidTransactionCount || 0)
        },
        dayPasses: {
            total: dayPassesTotal,
            count: Number(dayPassData.count || 0)
        },
        totalCollected: subscriptionsTotal + dayPassesTotal,
        expenses: {
            total: expensesTotal,
            count: Number(expenseSummary.expenseCount || 0),
            items: resolvedExpenseItemsResult.recordset.map(mapExpense)
        },
        net: subscriptionsTotal + dayPassesTotal - expensesTotal
    };
}

async function createExpense(body = {}) {
    const name = requiredString(body.name ?? body.expenseName, 'اسم المصروف', 120);
    const amount = positiveMoney(body.amount);
    const expenseDate = parseDateOnly(body.expenseDate || todayInTimeZone(), 'تاريخ المصروف');
    const notes = optionalString(body.notes, 500);
    await ensureExpensesTable();
    const result = await expenseRepository.create({ name, amount, expenseDate, notes });

    return mapExpense(result.recordset[0]);
}

async function updateExpense(id, body = {}) {
    const expenseId = ensureId(id);
    const name = requiredString(body.name ?? body.expenseName, 'اسم المصروف', 120);
    const amount = positiveMoney(body.amount);
    const expenseDate = parseDateOnly(body.expenseDate, 'تاريخ المصروف');
    const notes = optionalString(body.notes, 500);
    await ensureExpensesTable();
    const result = await expenseRepository.update({ id: expenseId, name, amount, expenseDate, notes });
    if (!result.recordset[0]) throw appError('المصروف غير موجود.', 404);
    return mapExpense(result.recordset[0]);
}

async function deleteExpense(id) {
    const expenseId = ensureId(id);
    await ensureExpensesTable();
    const result = await expenseRepository.remove(expenseId);
    if (!result.rowsAffected[0]) throw appError('المصروف غير موجود.', 404);
}

module.exports = {
    createExpense,
    deleteExpense,
    ensureExpensesTable,
    getMonthlyFinance,
    updateExpense
};
