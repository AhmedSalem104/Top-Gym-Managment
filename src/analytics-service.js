const { getPool, sql } = require('./db');
const {
    addDays,
    addMonths,
    formatDateOnly,
    toUtcDate,
    todayInTimeZone
} = require('./date-utils');
const { getDashboard } = require('./member-service');
const { ensureExpensesTable } = require('./finance-service');

const PERIOD_KEYS = new Set(['week', 'month', 'year']);

function appError(message, statusCode = 400) {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.expose = true;
    return error;
}

function normalizePeriod(value) {
    const period = String(value || 'month').trim().toLowerCase();
    if (!PERIOD_KEYS.has(period)) throw appError('الفترة المطلوبة غير صالحة.');
    return period;
}

function pad(value) {
    return String(value).padStart(2, '0');
}

function weekStart(dateOnly) {
    const day = toUtcDate(dateOnly).getUTCDay();
    return addDays(dateOnly, day === 0 ? -6 : 1 - day);
}

function getPeriodRange(periodValue) {
    const period = normalizePeriod(periodValue);
    const today = todayInTimeZone();
    let startDate;
    let nextDate;
    let granularity;

    if (period === 'week') {
        startDate = weekStart(today);
        nextDate = addDays(startDate, 7);
        granularity = 'day';
    } else if (period === 'year') {
        const year = Number(today.slice(0, 4));
        startDate = `${year}-01-01`;
        nextDate = `${year + 1}-01-01`;
        granularity = 'month';
    } else {
        startDate = `${today.slice(0, 7)}-01`;
        nextDate = addMonths(startDate, 1);
        granularity = 'day';
    }

    return {
        key: period,
        startDate,
        endDate: addDays(nextDate, -1),
        nextDate,
        granularity
    };
}

function createBuckets(range) {
    const buckets = [];
    let cursor = range.startDate;
    while (cursor < range.nextDate) {
        const nextBucket = range.granularity === 'month'
            ? addMonths(cursor, 1)
            : addDays(cursor, 1);
        buckets.push({
            key: cursor,
            startDate: cursor,
            endDate: addDays(nextBucket, -1)
        });
        cursor = nextBucket;
    }
    return buckets;
}

function bucketKey(dateValue, range) {
    const dateOnly = formatDateOnly(dateValue);
    if (!dateOnly) return null;
    return range.granularity === 'month' ? `${dateOnly.slice(0, 7)}-01` : dateOnly;
}

function amountByBucket(rows, dateField, amountField, buckets, range) {
    const indexByKey = new Map(buckets.map((bucket, index) => [bucket.key, index]));
    const values = buckets.map(() => 0);
    rows.forEach((row) => {
        const index = indexByKey.get(bucketKey(row[dateField], range));
        if (index === undefined) return;
        values[index] += Number(row[amountField] || 0);
    });
    return values.map((value) => Math.round(value * 100) / 100);
}

function countByBucket(rows, dateField, buckets, range) {
    const indexByKey = new Map(buckets.map((bucket, index) => [bucket.key, index]));
    const values = buckets.map(() => 0);
    rows.forEach((row) => {
        const index = indexByKey.get(bucketKey(row[dateField], range));
        if (index !== undefined) values[index] += 1;
    });
    return values;
}

function distribution(rows, field) {
    const counts = new Map();
    rows.forEach((row) => {
        const key = String(row[field] || 'other');
        counts.set(key, (counts.get(key) || 0) + 1);
    });
    return [...counts.entries()]
        .sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0]))
        .map(([key, value]) => ({ key, value }));
}

function createRangeRequest(pool, range) {
    return pool.request()
        .input('startDate', sql.Date, toUtcDate(range.startDate))
        .input('nextDate', sql.Date, toUtcDate(range.nextDate));
}

async function getDashboardAnalytics(periodValue = 'month') {
    const range = getPeriodRange(periodValue);
    const buckets = createBuckets(range);
    await ensureExpensesTable();
    const pool = await getPool();

    const [dashboard, membersResult, membershipsResult, paymentsResult, expensesResult, outstandingResult] = await Promise.all([
        getDashboard(),
        createRangeRequest(pool, range).query(`
            SELECT registration_date AS eventDate
            FROM dbo.members
            WHERE registration_date >= @startDate AND registration_date < @nextDate;
        `),
        createRangeRequest(pool, range).query(`
            SELECT start_date AS eventDate, membership_plan AS planCode, membership_type AS typeCode
            FROM dbo.memberships
            WHERE start_date >= @startDate AND start_date < @nextDate;
        `),
        createRangeRequest(pool, range).query(`
            SELECT paid_at AS eventDate, amount_paid AS amount, payment_method AS paymentMethod
            FROM dbo.gym_payments
            WHERE paid_at >= @startDate AND paid_at < @nextDate AND amount_paid > 0;
        `),
        createRangeRequest(pool, range).query(`
            SELECT expense_date AS eventDate, amount
            FROM dbo.gym_expenses
            WHERE expense_date >= @startDate AND expense_date < @nextDate;
        `),
        pool.request().query(`
            SELECT COUNT_BIG(CASE WHEN amount_remaining > 0 THEN 1 END) AS outstandingCount,
                   ISNULL(SUM(CASE WHEN amount_remaining > 0 THEN amount_remaining ELSE 0 END), 0) AS outstandingTotal
            FROM dbo.gym_payments;
        `)
    ]);

    const memberRows = membersResult.recordset || [];
    const membershipRows = membershipsResult.recordset || [];
    const paymentRows = paymentsResult.recordset || [];
    const expenseRows = expensesResult.recordset || [];
    const paymentTotal = paymentRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const expenseTotal = expenseRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const statusStats = dashboard.stats || {};
    const outstanding = outstandingResult.recordset[0] || {};

    return {
        period: {
            ...range,
            today: todayInTimeZone(),
            bucketCount: buckets.length,
            buckets
        },
        kpis: {
            currentMembers: Number(statusStats.total || 0),
            activeMembers: Number(statusStats.active || 0),
            expiringSoon: Number(statusStats.expiringSoon || 0),
            expiredMembers: Number(statusStats.expired || 0),
            frozenMembers: Number(statusStats.frozen || 0),
            newMembers: memberRows.length,
            newMemberships: membershipRows.length,
            paidTransactions: paymentRows.length,
            collected: Math.round(paymentTotal * 100) / 100,
            expenseCount: expenseRows.length,
            expenses: Math.round(expenseTotal * 100) / 100,
            net: Math.round((paymentTotal - expenseTotal) * 100) / 100,
            outstandingCount: Number(outstanding.outstandingCount || 0),
            outstanding: Number(outstanding.outstandingTotal || 0),
            alertsCount: Array.isArray(dashboard.alerts) ? dashboard.alerts.length : 0
        },
        trend: {
            labels: buckets.map((bucket) => bucket.key),
            collected: amountByBucket(paymentRows, 'eventDate', 'amount', buckets, range),
            expenses: amountByBucket(expenseRows, 'eventDate', 'amount', buckets, range),
            newMembers: countByBucket(memberRows, 'eventDate', buckets, range),
            newMemberships: countByBucket(membershipRows, 'eventDate', buckets, range),
            paidTransactions: countByBucket(paymentRows, 'eventDate', buckets, range),
            expenseTransactions: countByBucket(expenseRows, 'eventDate', buckets, range)
        },
        distributions: {
            statuses: [
                { key: 'active', value: Number(statusStats.active || 0) },
                { key: 'expiring_soon', value: Number(statusStats.expiringSoon || 0) },
                { key: 'expired', value: Number(statusStats.expired || 0) },
                { key: 'frozen', value: Number(statusStats.frozen || 0) }
            ],
            plans: distribution(membershipRows, 'planCode'),
            types: distribution(membershipRows, 'typeCode'),
            paymentMethods: distribution(paymentRows, 'paymentMethod')
        }
    };
}

module.exports = { getDashboardAnalytics };
