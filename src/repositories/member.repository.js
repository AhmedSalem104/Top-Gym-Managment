'use strict';

const { getPool, sql } = require('../database/pool');
const { todayInTimeZone, toUtcDate } = require('../utils/date');

const MEMBER_ROWS_CTE = `
WITH latest_membership AS (
    SELECT
        m.id AS membershipId,
        m.member_id AS membershipMemberId,
        m.membership_plan AS membershipPlan,
        m.membership_type AS membershipType,
        m.start_date AS startDate,
        m.end_date AS endDate,
        m.notes AS membershipNotes,
        m.cancelled_at AS cancelledAt,
        m.cancellation_reason AS cancellationReason,
        ROW_NUMBER() OVER (PARTITION BY m.member_id ORDER BY CASE WHEN m.cancelled_at IS NULL THEN 0 ELSE 1 END, m.end_date DESC, m.id DESC) AS membershipRank
    FROM dbo.memberships AS m
),
freeze_totals AS (
    SELECT
        f.membership_id AS freezeMembershipId,
        SUM(CASE
            WHEN f.resumed_date IS NULL THEN DATEDIFF(day, f.start_date, f.end_date) + 1
            WHEN f.resumed_date <= f.start_date THEN 0
            WHEN f.resumed_date < f.end_date THEN DATEDIFF(day, f.start_date, f.resumed_date)
            ELSE DATEDIFF(day, f.start_date, f.end_date) + 1
        END) AS freezeDays
    FROM dbo.membership_freezes AS f
    GROUP BY f.membership_id
),
freeze_counts AS (
    SELECT
        m.member_id AS freezeCountMemberId,
        COUNT_BIG(*) AS freezeCount
    FROM dbo.membership_freezes AS f
    INNER JOIN dbo.memberships AS m ON m.id = f.membership_id
    GROUP BY m.member_id
),
current_freeze AS (
    SELECT membership_id AS currentFreezeMembershipId, id AS freezeId, start_date AS freezeStart,
           end_date AS freezeEnd
    FROM (
        SELECT f.membership_id, f.id, f.start_date, f.end_date,
               ROW_NUMBER() OVER (PARTITION BY f.membership_id ORDER BY f.start_date DESC, f.id DESC) AS freezeRank
        FROM dbo.membership_freezes AS f
        WHERE f.resumed_date IS NULL AND @today BETWEEN f.start_date AND f.end_date
    ) AS active_freezes
    WHERE freezeRank = 1
),
payment_summary AS (
    SELECT membership_id AS paymentMembershipId, list_price AS listPrice, discount_amount AS discountAmount,
           amount_due AS amountDue, amount_paid AS amountPaid,
           amount_remaining AS amountRemaining, payment_method AS paymentMethod, paid_at AS paymentPaidAt
    FROM dbo.gym_payments
),
member_rows AS (
SELECT
    b.id,
    b.full_name AS fullName,
    b.phone,
    b.email,
    b.registration_date AS registrationDate,
    b.notes AS memberNotes,
    b.created_at AS memberCreatedAt,
    b.updated_at AS memberUpdatedAt,
    lm.membershipId,
    lm.membershipPlan,
    lm.membershipType,
    lm.startDate,
    lm.endDate,
    lm.membershipNotes,
    lm.cancelledAt,
    lm.cancellationReason,
    DATEADD(day, ISNULL(ft.freezeDays, 0), lm.endDate) AS effectiveEndDate,
    cf.freezeId,
    cf.freezeStart,
    cf.freezeEnd,
    ISNULL(fc.freezeCount, 0) AS freezeCount,
    ISNULL(ps.listPrice, 0) AS listPrice,
    ISNULL(ps.discountAmount, 0) AS discountAmount,
    ISNULL(ps.amountDue, 0) AS amountDue,
    ISNULL(ps.amountPaid, 0) AS amountPaid,
    ISNULL(ps.amountRemaining, 0) AS amountRemaining,
    ps.paymentMethod,
    ps.paymentPaidAt,
    CASE
        WHEN lm.membershipId IS NULL THEN 'expired'
        WHEN lm.cancelledAt IS NOT NULL THEN 'cancelled'
        WHEN cf.freezeId IS NOT NULL THEN 'frozen'
        WHEN DATEADD(day, ISNULL(ft.freezeDays, 0), lm.endDate) < @today THEN 'expired'
        WHEN DATEDIFF(day, @today, DATEADD(day, ISNULL(ft.freezeDays, 0), lm.endDate)) BETWEEN 0 AND 7 THEN 'expiring_soon'
        ELSE 'active'
    END AS computedStatus,
    CASE WHEN lm.membershipId IS NULL THEN NULL
         ELSE DATEDIFF(day, @today, DATEADD(day, ISNULL(ft.freezeDays, 0), lm.endDate)) END AS daysRemaining
FROM dbo.members AS b
LEFT JOIN latest_membership AS lm
    ON lm.membershipMemberId = b.id AND lm.membershipRank = 1
LEFT JOIN freeze_totals AS ft ON ft.freezeMembershipId = lm.membershipId
LEFT JOIN freeze_counts AS fc ON fc.freezeCountMemberId = b.id
LEFT JOIN current_freeze AS cf ON cf.currentFreezeMembershipId = lm.membershipId
LEFT JOIN payment_summary AS ps ON ps.paymentMembershipId = lm.membershipId
)
`;

const MEMBER_ROW_COLUMNS = [
    'id',
    'fullName',
    'phone',
    'email',
    'registrationDate',
    'memberNotes',
    'memberCreatedAt',
    'memberUpdatedAt',
    'membershipId',
    'membershipPlan',
    'membershipType',
    'startDate',
    'endDate',
    'membershipNotes',
    'cancelledAt',
    'cancellationReason',
    'effectiveEndDate',
    'freezeId',
    'freezeStart',
    'freezeEnd',
    'freezeCount',
    'listPrice',
    'discountAmount',
    'amountDue',
    'amountPaid',
    'amountRemaining',
    'paymentMethod',
    'paymentPaidAt',
    'computedStatus',
    'daysRemaining'
].join(', ');

const MEMBER_CTE = `${MEMBER_ROWS_CTE}
SELECT ${MEMBER_ROW_COLUMNS}, COUNT(1) OVER() AS totalCount
FROM member_rows
`;

const ORDER_BY = Object.freeze({
    expiry: 'effectiveEndDate ASC, fullName ASC, id ASC',
    newest: 'registrationDate DESC, id DESC',
    remaining: 'amountRemaining DESC, id ASC'
});

async function findById({ id, connection = null, today = todayInTimeZone() }) {
    const pool = connection || await getPool();
    return pool.request()
        .input('today', sql.Date, toUtcDate(today))
        .input('id', sql.Int, id)
        .query(`${MEMBER_CTE} WHERE id = @id;`);
}

async function list({ search = '', status = '', sort = 'expiry', offset = 0, pageSize = 5, today = todayInTimeZone() }) {
    const pool = await getPool();
    return pool.request()
        .input('today', sql.Date, toUtcDate(today))
        .input('search', sql.NVarChar(100), search)
        .input('pattern', sql.NVarChar(110), `%${search}%`)
        .input('status', sql.VarChar(20), status)
        .input('offset', sql.Int, offset)
        .input('pageSize', sql.Int, pageSize)
        .query(`${MEMBER_CTE}
            WHERE (@search = N'' OR fullName LIKE @pattern OR phone LIKE @pattern OR ISNULL(email, N'') LIKE @pattern)
              AND membershipId IS NOT NULL
              AND (@status = '' OR computedStatus = @status)
            ORDER BY ${ORDER_BY[sort] || ORDER_BY.expiry}
            OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;`);
}

module.exports = { findById, list, MEMBER_CTE, MEMBER_ROW_COLUMNS, MEMBER_ROWS_CTE };
