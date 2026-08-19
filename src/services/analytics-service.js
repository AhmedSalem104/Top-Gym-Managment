const { getPool, sql } = require('../db');
const {
    addDays,
    addMonths,
    formatDateOnly,
    toUtcDate,
    todayInTimeZone
} = require('../utils/date');
const { ensurePaymentTransactionsTable, getDashboard } = require('./member-service');
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

function uniqueMembersByBucket(rows, buckets, range) {
    const indexByKey = new Map(buckets.map((bucket, index) => [bucket.key, index]));
    const memberSets = buckets.map(() => new Set());
    rows.forEach((row) => {
        const index = indexByKey.get(bucketKey(row.eventDate, range));
        if (index !== undefined && row.memberId !== null && row.memberId !== undefined) {
            memberSets[index].add(Number(row.memberId));
        }
    });
    return memberSets.map((members) => members.size);
}

function cairoHour(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return null;
    const hour = Number(new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Africa/Cairo',
        hour: '2-digit',
        hour12: false
    }).format(date));
    return hour === 24 ? 0 : hour;
}

function buildAttendanceAnalytics(rows, inactiveRows, buckets, range) {
    const hourCounts = Array.from({ length: 24 }, (_, hour) => ({
        key: String(hour),
        label: `${String(hour).padStart(2, '0')}:00`,
        value: 0
    }));
    const members = new Map();
    let openVisits = 0;
    const activeDays = new Set();

    rows.forEach((row) => {
        const hour = cairoHour(row.checkInAt);
        if (hour !== null) hourCounts[hour].value += 1;
        activeDays.add(formatDateOnly(row.eventDate));
        if (!row.checkOutAt) openVisits += 1;
        const memberId = Number(row.memberId);
        const current = members.get(memberId) || {
            memberId,
            fullName: row.fullName,
            phone: row.phone,
            visits: 0,
            lastVisitAt: null
        };
        current.visits += 1;
        if (!current.lastVisitAt || new Date(row.checkInAt) > new Date(current.lastVisitAt)) current.lastVisitAt = row.checkInAt;
        members.set(memberId, current);
    });

    const topMembers = [...members.values()]
        .sort((first, second) => second.visits - first.visits || new Date(second.lastVisitAt) - new Date(first.lastVisitAt))
        .slice(0, 8);
    const peakHours = hourCounts
        .filter((item) => item.value > 0)
        .sort((first, second) => second.value - first.value || Number(first.key) - Number(second.key))
        .slice(0, 6);
    const inactiveTotal = Number(inactiveRows[0]?.inactiveTotal || 0);

    return {
        kpis: {
            visits: rows.length,
            uniqueMembers: members.size,
            activeDays: activeDays.size,
            averageVisitsPerDay: activeDays.size ? Math.round((rows.length / activeDays.size) * 10) / 10 : 0,
            openVisits,
            inactiveMembers: inactiveTotal,
            peakHour: peakHours[0]?.label || null
        },
        trend: {
            visits: countByBucket(rows, 'eventDate', buckets, range),
            uniqueMembers: uniqueMembersByBucket(rows, buckets, range)
        },
        peakHours,
        topMembers,
        inactiveMembers: inactiveRows.map((row) => ({
            memberId: Number(row.memberId),
            fullName: row.fullName,
            phone: row.phone,
            lastVisitDate: row.lastVisitDate ? formatDateOnly(row.lastVisitDate) : null,
            membershipEndDate: row.membershipEndDate ? formatDateOnly(row.membershipEndDate) : null,
            daysSinceLastVisit: row.daysSinceLastVisit === null || row.daysSinceLastVisit === undefined
                ? null
                : Number(row.daysSinceLastVisit)
        }))
    };
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

function getPreviousPeriodRange(range) {
    const startDate = range.key === 'year'
        ? `${Number(range.startDate.slice(0, 4)) - 1}-01-01`
        : range.key === 'month'
            ? addMonths(range.startDate, -1)
            : addDays(range.startDate, -7);
    const nextDate = range.startDate;

    return {
        key: range.key,
        startDate,
        endDate: addDays(nextDate, -1),
        nextDate,
        granularity: range.granularity
    };
}

function roundAmount(value) {
    return Math.round(Number(value || 0) * 100) / 100;
}

function buildComparison(currentValue, previousValue) {
    const current = Number(currentValue || 0);
    const previous = Number(previousValue || 0);
    const change = roundAmount(current - previous);

    return {
        current,
        previous,
        change,
        percent: previous === 0
            ? (current === 0 ? 0 : null)
            : Math.round((change / Math.abs(previous)) * 1000) / 10,
        direction: change > 0 ? 'up' : change < 0 ? 'down' : 'flat'
    };
}

async function getDashboardAnalytics(periodValue = 'month') {
    const range = getPeriodRange(periodValue);
    const previousRange = getPreviousPeriodRange(range);
    const buckets = createBuckets(range);
    const today = todayInTimeZone();
    const inactiveSince = addDays(today, -7);
    await ensureExpensesTable();
    await ensurePaymentTransactionsTable();
    const pool = await getPool();

    const [dashboard, membersResult, membershipsResult, paymentsResult, expensesResult, attendanceResult, inactiveAttendanceResult, outstandingResult, previousMembersResult, previousMembershipsResult, previousPaymentsResult, previousExpensesResult, previousAttendanceResult] = await Promise.all([
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
            FROM dbo.gym_payment_transactions
            WHERE paid_at >= @startDate AND paid_at < @nextDate AND amount_paid > 0;
        `),
        createRangeRequest(pool, range).query(`
            SELECT expense_date AS eventDate, amount
            FROM dbo.gym_expenses
            WHERE expense_date >= @startDate AND expense_date < @nextDate;
        `),
        createRangeRequest(pool, range).query(`
            SELECT a.attendance_date AS eventDate, a.member_id AS memberId,
                   a.check_in_at AS checkInAt, a.check_out_at AS checkOutAt,
                   m.full_name AS fullName, m.phone
            FROM dbo.gym_attendance AS a
            INNER JOIN dbo.members AS m ON m.id = a.member_id
            WHERE a.attendance_date >= @startDate AND a.attendance_date < @nextDate;
        `),
        pool.request()
            .input('today', sql.Date, toUtcDate(today))
            .input('inactiveSince', sql.Date, toUtcDate(inactiveSince))
            .query(`
                WITH ranked_memberships AS (
                    SELECT m.id AS membershipId, m.member_id AS memberId,
                           m.start_date AS membershipStartDate, m.end_date AS membershipEndDate,
                           ROW_NUMBER() OVER (PARTITION BY m.member_id ORDER BY m.end_date DESC, m.id DESC) AS membershipRank
                    FROM dbo.memberships AS m
                ), eligible_members AS (
                    SELECT b.id AS memberId, b.full_name AS fullName, b.phone,
                           lm.membershipId, lm.membershipEndDate
                    FROM dbo.members AS b
                    INNER JOIN ranked_memberships AS lm
                        ON lm.memberId = b.id AND lm.membershipRank = 1
                    WHERE lm.membershipStartDate <= @today
                      AND lm.membershipEndDate >= @today
                      AND NOT EXISTS (
                          SELECT 1 FROM dbo.membership_freezes AS f
                          WHERE f.membership_id = lm.membershipId AND f.resumed_date IS NULL
                      )
                )
                SELECT TOP (12)
                       em.memberId, em.fullName, em.phone, em.membershipEndDate,
                       lastVisit.lastVisitDate,
                       DATEDIFF(day, lastVisit.lastVisitDate, @today) AS daysSinceLastVisit,
                       COUNT(1) OVER() AS inactiveTotal
                FROM eligible_members AS em
                OUTER APPLY (
                    SELECT TOP (1) a.attendance_date AS lastVisitDate
                    FROM dbo.gym_attendance AS a
                    WHERE a.member_id = em.memberId
                    ORDER BY a.attendance_date DESC, a.check_in_at DESC, a.id DESC
                ) AS lastVisit
                WHERE lastVisit.lastVisitDate IS NULL OR lastVisit.lastVisitDate < @inactiveSince
                ORDER BY CASE WHEN lastVisit.lastVisitDate IS NULL THEN 0 ELSE 1 END,
                         lastVisit.lastVisitDate ASC, em.fullName ASC;
            `),
        pool.request().query(`
            SELECT COUNT_BIG(CASE WHEN amount_remaining > 0 THEN 1 END) AS outstandingCount,
                   ISNULL(SUM(CASE WHEN amount_remaining > 0 THEN amount_remaining ELSE 0 END), 0) AS outstandingTotal
            FROM dbo.gym_payments;
        `),
        createRangeRequest(pool, previousRange).query(`
            SELECT COUNT_BIG(*) AS total
            FROM dbo.members
            WHERE registration_date >= @startDate AND registration_date < @nextDate;
        `),
        createRangeRequest(pool, previousRange).query(`
            SELECT COUNT_BIG(*) AS total
            FROM dbo.memberships
            WHERE start_date >= @startDate AND start_date < @nextDate;
        `),
        createRangeRequest(pool, previousRange).query(`
            SELECT COUNT_BIG(*) AS total,
                   ISNULL(SUM(amount_paid), 0) AS amount
            FROM dbo.gym_payment_transactions
            WHERE paid_at >= @startDate AND paid_at < @nextDate AND amount_paid > 0;
        `),
        createRangeRequest(pool, previousRange).query(`
            SELECT COUNT_BIG(*) AS total,
                   ISNULL(SUM(amount), 0) AS amount
            FROM dbo.gym_expenses
            WHERE expense_date >= @startDate AND expense_date < @nextDate;
        `),
        createRangeRequest(pool, previousRange).query(`
            SELECT COUNT_BIG(*) AS visits,
                   COUNT(DISTINCT member_id) AS uniqueMembers
            FROM dbo.gym_attendance
            WHERE attendance_date >= @startDate AND attendance_date < @nextDate;
        `)
    ]);

    const memberRows = membersResult.recordset || [];
    const membershipRows = membershipsResult.recordset || [];
    const paymentRows = paymentsResult.recordset || [];
    const expenseRows = expensesResult.recordset || [];
    const attendanceRows = attendanceResult.recordset || [];
    const inactiveAttendanceRows = inactiveAttendanceResult.recordset || [];
    const paymentTotal = paymentRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const expenseTotal = expenseRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const statusStats = dashboard.stats || {};
    const outstanding = outstandingResult.recordset[0] || {};
    const previousMembers = Number(previousMembersResult.recordset[0]?.total || 0);
    const previousMemberships = Number(previousMembershipsResult.recordset[0]?.total || 0);
    const previousPayments = previousPaymentsResult.recordset[0] || {};
    const previousExpenses = previousExpensesResult.recordset[0] || {};
    const previousAttendance = previousAttendanceResult.recordset[0] || {};
    const previousCollected = roundAmount(previousPayments.amount);
    const previousExpenseTotal = roundAmount(previousExpenses.amount);
    const previousNet = roundAmount(previousCollected - previousExpenseTotal);
    const attendance = buildAttendanceAnalytics(attendanceRows, inactiveAttendanceRows, buckets, range);
    const currentKpis = {
        newMembers: memberRows.length,
        newMemberships: membershipRows.length,
        paidTransactions: paymentRows.length,
        collected: roundAmount(paymentTotal),
        expenses: roundAmount(expenseTotal),
        net: roundAmount(paymentTotal - expenseTotal),
        visits: attendanceRows.length,
        uniqueMembers: attendance.kpis.uniqueMembers
    };
    const previousKpis = {
        newMembers: previousMembers,
        newMemberships: previousMemberships,
        paidTransactions: Number(previousPayments.total || 0),
        collected: previousCollected,
        expenses: previousExpenseTotal,
        net: previousNet,
        visits: Number(previousAttendance.visits || 0),
        uniqueMembers: Number(previousAttendance.uniqueMembers || 0)
    };
    const comparisons = Object.fromEntries(Object.keys(currentKpis).map((key) => [key, buildComparison(currentKpis[key], previousKpis[key])]));
    const currentMembers = Number(statusStats.total || 0);
    const activeMembers = Number(statusStats.active || 0);

    return {
        period: {
            ...range,
            today,
            bucketCount: buckets.length,
            buckets
        },
        previous: {
            startDate: previousRange.startDate,
            endDate: previousRange.endDate,
            kpis: previousKpis
        },
        comparisons,
        kpis: {
            currentMembers,
            activeMembers,
            expiringSoon: Number(statusStats.expiringSoon || 0),
            expiredMembers: Number(statusStats.expired || 0),
            frozenMembers: Number(statusStats.frozen || 0),
            newMembers: currentKpis.newMembers,
            newMemberships: currentKpis.newMemberships,
            paidTransactions: currentKpis.paidTransactions,
            collected: currentKpis.collected,
            expenseCount: expenseRows.length,
            expenses: currentKpis.expenses,
            net: currentKpis.net,
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
        },
        attendance
    };
}

module.exports = { getDashboardAnalytics };
