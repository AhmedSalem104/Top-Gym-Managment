'use strict';

const { getPool, sql } = require('../database/pool');
const { todayInTimeZone, toUtcDate } = require('../utils/date');

function createMemberRowsCte({ scoped = false } = {}) {
    const membershipScope = scoped ? `
        AND (@branchId IS NULL OR EXISTS (
            SELECT 1
            FROM dbo.gym_membership_branch_access AS branch_access
            WHERE branch_access.tenant_id=m.tenant_id
              AND branch_access.membership_id=m.id
              AND branch_access.branch_id=@branchId
        ))
        AND (@sectionId IS NULL OR EXISTS (
            SELECT 1
            FROM dbo.gym_membership_section_access AS section_access
            WHERE section_access.tenant_id=m.tenant_id
              AND section_access.membership_id=m.id
              AND section_access.section_id=@sectionId
        ))` : '';
    return `
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
    WHERE 1=1${membershipScope}
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
    b.phone_normalized AS phoneNormalized,
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
}

const MEMBER_ROWS_CTE = createMemberRowsCte();
const MEMBER_ROWS_SCOPED_CTE = createMemberRowsCte({ scoped: true });

const MEMBER_ROW_COLUMNS = [
    'id',
    'fullName',
    'phone',
    'phoneNormalized',
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

// Keep the CTE definition reusable across findById and list. A CTE is scoped
// to the single statement that follows it; embedding a SELECT here caused
// list() to append a second statement and lose the member_rows scope.
const MEMBER_CTE = MEMBER_ROWS_CTE;

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
        .query(`${MEMBER_CTE}
                SELECT ${MEMBER_ROW_COLUMNS}, COUNT(1) OVER() AS totalCount
                FROM member_rows
                WHERE id = @id;`);
}

async function list({ search = '', phoneSearch = '', status = '', sort = 'expiry', offset = 0, pageSize = 5, today = todayInTimeZone(), branchId = null, sectionId = null }) {
    const pool = await getPool();
    const scoped = branchId != null || sectionId != null;
    const orderBy = ORDER_BY[sort] || ORDER_BY.expiry;
    const request = pool.request()
        .input('today', sql.Date, toUtcDate(today))
        .input('search', sql.NVarChar(100), search)
        .input('pattern', sql.NVarChar(110), `%${search}%`)
        .input('phoneSearch', sql.NVarChar(30), phoneSearch)
        .input('status', sql.VarChar(20), status)
        .input('offset', sql.Int, offset)
        .input('pageSize', sql.Int, pageSize);
    if (scoped) request.input('branchId', sql.Int, branchId == null ? null : Number(branchId)).input('sectionId', sql.Int, sectionId == null ? null : Number(sectionId));
    return request.query(`${scoped ? MEMBER_ROWS_SCOPED_CTE : MEMBER_CTE}
            SELECT ${MEMBER_ROW_COLUMNS}, totalCount
            FROM (
                SELECT ${MEMBER_ROW_COLUMNS},
                       COUNT(1) OVER() AS totalCount,
                       ROW_NUMBER() OVER (ORDER BY ${orderBy}) AS rowNumber
                FROM member_rows
                WHERE (@search = N'' OR fullName LIKE @pattern OR phone LIKE @pattern OR ISNULL(email, N'') LIKE @pattern OR phoneNormalized = @phoneSearch)
                  AND (@status = '' OR computedStatus = @status)
            ) AS paged_members
            WHERE rowNumber > @offset AND rowNumber <= (@offset + @pageSize)
            ORDER BY rowNumber;`);
}

module.exports = { findById, list, MEMBER_CTE, MEMBER_ROW_COLUMNS, MEMBER_ROWS_CTE, MEMBER_ROWS_SCOPED_CTE, createMemberRowsCte };
