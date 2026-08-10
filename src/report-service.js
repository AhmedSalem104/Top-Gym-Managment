const { getPool, sql } = require('./db');
const { addDays, differenceInDays, formatDateOnly, parseDateOnly, todayInTimeZone, toUtcDate } = require('./date-utils');
const { ensurePaymentTransactionsTable, getDashboard } = require('./member-service');
const { ensureExpensesTable } = require('./finance-service');

function appError(message, statusCode = 400) {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.expose = true;
    return error;
}

function normalizeRange(query = {}) {
    const today = todayInTimeZone();
    const defaultFrom = `${today.slice(0, 7)}-01`;
    const from = parseDateOnly(query.from || defaultFrom, 'تاريخ البداية');
    const to = parseDateOnly(query.to || today, 'تاريخ النهاية');
    if (from > to) throw appError('تاريخ البداية يجب أن يكون قبل تاريخ النهاية.');
    if (differenceInDays(from, to) > 730) throw appError('أقصى فترة للتقرير هي 730 يومًا.');
    return { from, to, nextDate: addDays(to, 1), today };
}

function roundMoney(value) {
    return Math.round(Number(value || 0) * 100) / 100;
}

function emptyTimeline(from, to) {
    const rows = [];
    let cursor = from;
    while (cursor <= to) {
        rows.push({ date: cursor, newMembers: 0, newMemberships: 0, collected: 0, expenses: 0 });
        cursor = addDays(cursor, 1);
    }
    return rows;
}

function addTimelineAmount(timelineByDate, rows, dateField, amountField) {
    rows.forEach((row) => {
        const date = formatDateOnly(row[dateField]);
        const target = timelineByDate.get(date);
        if (target) target[amountField] = roundMoney(target[amountField] + Number(row[amountField] || 0));
    });
}

async function getReportData(query = {}) {
    const range = normalizeRange(query);
    await ensureExpensesTable();
    await ensurePaymentTransactionsTable();
    const pool = await getPool();
    const baseRequest = () => pool.request()
        .input('fromDate', sql.Date, toUtcDate(range.from))
        .input('nextDate', sql.Date, toUtcDate(range.nextDate));

    const [membersResult, membershipsResult, paymentsResult, expensesResult, paymentMethodsResult, dashboard] = await Promise.all([
        baseRequest().query(`
            SELECT TOP (1000) m.id, m.full_name, m.phone, m.email, m.registration_date,
                   ms.membership_plan, ms.membership_type, ms.start_date, ms.end_date,
                   p.amount_due, p.amount_paid, p.amount_remaining
            FROM dbo.members AS m
            OUTER APPLY (
                SELECT TOP (1) x.id, x.membership_plan, x.membership_type, x.start_date, x.end_date
                FROM dbo.memberships AS x
                WHERE x.member_id = m.id
                ORDER BY x.end_date DESC, x.id DESC
            ) AS ms
            OUTER APPLY (
                SELECT TOP (1) y.amount_due, y.amount_paid, y.amount_remaining
                FROM dbo.gym_payments AS y
                WHERE y.membership_id = ms.id
            ) AS p
            WHERE m.registration_date >= @fromDate AND m.registration_date < @nextDate
            ORDER BY m.registration_date DESC, m.id DESC;
        `),
        baseRequest().query(`
            SELECT m.id, m.member_id, m.membership_plan, m.membership_type,
                   m.start_date, p.amount_due, p.amount_paid, p.amount_remaining
            FROM dbo.memberships AS m
            LEFT JOIN dbo.gym_payments AS p ON p.membership_id = m.id
            WHERE m.start_date >= @fromDate AND m.start_date < @nextDate
            ORDER BY m.start_date DESC, m.id DESC;
        `),
        baseRequest().query(`
            SELECT paid_at AS event_date, amount_paid AS amount, payment_method
            FROM dbo.gym_payment_transactions
            WHERE paid_at >= @fromDate AND paid_at < @nextDate AND amount_paid > 0;
        `),
        baseRequest().query(`
            SELECT expense_date AS event_date, amount
            FROM dbo.gym_expenses
            WHERE expense_date >= @fromDate AND expense_date < @nextDate;
        `),
        baseRequest().query(`
            SELECT payment_method, COUNT(*) AS count, ISNULL(SUM(amount_paid), 0) AS amount
            FROM dbo.gym_payment_transactions
            WHERE paid_at >= @fromDate AND paid_at < @nextDate AND amount_paid > 0
            GROUP BY payment_method ORDER BY amount DESC;
        `),
        getDashboard()
    ]);

    const memberRows = membersResult.recordset || [];
    const membershipRows = membershipsResult.recordset || [];
    const paymentRows = paymentsResult.recordset || [];
    const expenseRows = expensesResult.recordset || [];
    const collected = roundMoney(paymentRows.reduce((sum, row) => sum + Number(row.amount || 0), 0));
    const expenses = roundMoney(expenseRows.reduce((sum, row) => sum + Number(row.amount || 0), 0));
    const timeline = emptyTimeline(range.from, range.to);
    const timelineByDate = new Map(timeline.map((row) => [row.date, row]));
    memberRows.forEach((row) => {
        const target = timelineByDate.get(formatDateOnly(row.registration_date));
        if (target) target.newMembers += 1;
    });
    membershipRows.forEach((row) => {
        const target = timelineByDate.get(formatDateOnly(row.start_date));
        if (target) target.newMemberships += 1;
    });
    addTimelineAmount(timelineByDate, paymentRows, 'event_date', 'collected');
    addTimelineAmount(timelineByDate, expenseRows, 'event_date', 'expenses');

    const outstanding = membershipRows.reduce((sum, row) => sum + Number(row.amount_remaining || 0), 0);
    const plans = membershipRows.reduce((result, row) => {
        const key = String(row.membership_plan || 'gym_only');
        result[key] = (result[key] || 0) + 1;
        return result;
    }, {});
    const statuses = {
        active: Number(dashboard.stats?.active || 0),
        expiring_soon: Number(dashboard.stats?.expiringSoon || 0),
        expired: Number(dashboard.stats?.expired || 0),
        frozen: Number(dashboard.stats?.frozen || 0)
    };

    return {
        period: range,
        summary: {
            newMembers: memberRows.length,
            newMemberships: membershipRows.length,
            paidTransactions: paymentRows.length,
            collected,
            expenses,
            net: roundMoney(collected - expenses),
            outstanding: roundMoney(outstanding),
            outstandingCount: membershipRows.filter((row) => Number(row.amount_remaining || 0) > 0).length,
            currentMembers: Number(dashboard.stats?.total || 0),
            activeMembers: Number(dashboard.stats?.active || 0),
            alertsCount: Array.isArray(dashboard.alerts) ? dashboard.alerts.length : 0
        },
        breakdown: {
            plans: Object.entries(plans).map(([key, value]) => ({ key, value })),
            statuses: Object.entries(statuses).map(([key, value]) => ({ key, value })),
            paymentMethods: paymentMethodsResult.recordset.map((row) => ({
                key: row.payment_method,
                count: Number(row.count || 0),
                amount: roundMoney(row.amount)
            }))
        },
        timeline,
        members: memberRows.map((row) => ({
            id: Number(row.id),
            fullName: row.full_name,
            phone: row.phone,
            email: row.email,
            registrationDate: formatDateOnly(row.registration_date),
            plan: row.membership_plan || null,
            type: row.membership_type || null,
            startDate: formatDateOnly(row.start_date),
            endDate: formatDateOnly(row.end_date),
            amountDue: Number(row.amount_due || 0),
            amountPaid: Number(row.amount_paid || 0),
            amountRemaining: Number(row.amount_remaining || 0)
        }))
    };
}

module.exports = { getReportData };
