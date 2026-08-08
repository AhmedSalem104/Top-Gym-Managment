const { getPool, sql } = require('./db');
const {
    addDays,
    differenceInDays,
    formatDateOnly,
    membershipEndDate,
    parseDateOnly,
    todayInTimeZone,
    toUtcDate
} = require('./date-utils');

const MEMBERSHIP_TYPES = ['monthly', 'quarterly', 'semiannual', 'annual'];
const PAYMENT_METHODS = ['cash', 'card', 'transfer', 'other'];
const MEMBER_STATUSES = ['active', 'expiring_soon', 'expired', 'frozen'];

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

function money(value, fieldName, fallback = 0) {
    if (value === undefined || value === null || value === '') return fallback;
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0 || amount > 9999999999) {
        throw appError(`${fieldName} غير صالح.`);
    }
    return Math.round(amount * 100) / 100;
}

function parsePaymentMethod(value, fallback = 'cash') {
    const method = value === undefined || value === null || value === '' ? fallback : String(value).trim();
    if (!PAYMENT_METHODS.includes(method)) throw appError('طريقة الدفع غير صالحة.');
    return method;
}

function has(body, key) {
    return Object.prototype.hasOwnProperty.call(body, key);
}

function normalizePayload(body = {}, { partial = false } = {}) {
    const output = {};
    if (!partial || has(body, 'fullName')) output.fullName = requiredString(body.fullName, 'الاسم', 120);
    if (!partial || has(body, 'phone')) {
        output.phone = requiredString(body.phone, 'رقم الهاتف', 30);
        if (!/^[0-9٠-٩+()\-\s]{5,30}$/u.test(output.phone)) throw appError('رقم الهاتف غير صالح.');
    }
    if (!partial || has(body, 'email')) {
        output.email = optionalString(body.email, 254);
        if (output.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(output.email)) {
            throw appError('البريد الإلكتروني غير صالح.');
        }
    }
    if (!partial || has(body, 'registrationDate')) {
        output.registrationDate = body.registrationDate
            ? parseDateOnly(body.registrationDate, 'تاريخ التسجيل')
            : todayInTimeZone();
    }
    if (!partial || has(body, 'notes')) output.notes = optionalString(body.notes, 1000);

    if (!partial || has(body, 'membershipType')) {
        output.membershipType = requiredString(body.membershipType, 'نوع العضوية', 20);
        if (!MEMBERSHIP_TYPES.includes(output.membershipType)) throw appError('نوع العضوية غير صالح.');
    }
    if (!partial || has(body, 'startDate')) {
        output.startDate = body.startDate
            ? parseDateOnly(body.startDate, 'تاريخ البداية')
            : todayInTimeZone();
    }
    if (!partial || has(body, 'endDate')) {
        output.endDate = body.endDate ? parseDateOnly(body.endDate, 'تاريخ الانتهاء') : null;
    }
    if (!partial || has(body, 'membershipNotes')) {
        output.membershipNotes = optionalString(body.membershipNotes, 1000);
    }

    if (!partial && !output.endDate) output.endDate = membershipEndDate(output.startDate, output.membershipType);
    if (output.startDate && output.endDate && output.endDate < output.startDate) {
        throw appError('تاريخ الانتهاء يجب أن يكون بعد أو مساوياً لتاريخ البداية.');
    }

    if (!partial || has(body, 'amountDue')) output.amountDue = money(body.amountDue, 'قيمة الاشتراك');
    if (!partial || has(body, 'amountPaid')) output.amountPaid = money(body.amountPaid, 'المبلغ المدفوع');
    if (!partial || has(body, 'paymentMethod')) output.paymentMethod = parsePaymentMethod(body.paymentMethod);
    if (!partial || has(body, 'paymentNotes')) output.paymentNotes = optionalString(body.paymentNotes, 500);
    if (output.amountPaid !== undefined && output.amountDue !== undefined && output.amountPaid > output.amountDue) {
        throw appError('المبلغ المدفوع لا يمكن أن يتجاوز قيمة الاشتراك.');
    }
    return output;
}

function normalizePaymentPayload(body = {}, current = {}) {
    const amountDue = has(body, 'amountDue')
        ? money(body.amountDue, 'قيمة الاشتراك')
        : money(current.amount_due, 'قيمة الاشتراك');
    const amountPaid = has(body, 'amountPaid')
        ? money(body.amountPaid, 'المبلغ المدفوع')
        : money(current.amount_paid, 'المبلغ المدفوع');
    if (amountPaid > amountDue) throw appError('المبلغ المدفوع لا يمكن أن يتجاوز قيمة الاشتراك.');
    return {
        amountDue,
        amountPaid,
        paymentMethod: parsePaymentMethod(body.paymentMethod, current.payment_method || 'cash'),
        paymentNotes: has(body, 'paymentNotes')
            ? optionalString(body.paymentNotes, 500)
            : (current.notes || null),
        paidAt: amountPaid > 0 ? todayInTimeZone() : null
    };
}

function ensureId(value, label = 'المعرّف') {
    const id = Number(value);
    if (!Number.isInteger(id) || id < 1) throw appError(`${label} غير صالح.`);
    return id;
}

function ensureStatus(value) {
    if (!value) return '';
    if (!MEMBER_STATUSES.includes(value)) throw appError('فلتر الحالة غير صالح.');
    return value;
}

function mapMember(row) {
    const membershipId = row.membershipId ? Number(row.membershipId) : null;
    return {
        id: Number(row.id),
        fullName: row.fullName,
        phone: row.phone,
        email: row.email,
        registrationDate: formatDateOnly(row.registrationDate),
        notes: row.memberNotes,
        createdAt: row.memberCreatedAt,
        updatedAt: row.memberUpdatedAt,
        membership: membershipId ? {
            id: membershipId,
            type: row.membershipType,
            startDate: formatDateOnly(row.startDate),
            endDate: formatDateOnly(row.endDate),
            effectiveEndDate: formatDateOnly(row.effectiveEndDate),
            status: row.computedStatus,
            daysRemaining: row.daysRemaining === null ? null : Number(row.daysRemaining),
            notes: row.membershipNotes,
            freezeId: row.freezeId ? Number(row.freezeId) : null,
            freezeStart: formatDateOnly(row.freezeStart),
            freezeEnd: formatDateOnly(row.freezeEnd),
            amountDue: Number(row.amountDue || 0),
            amountPaid: Number(row.amountPaid || 0),
            amountRemaining: Number(row.amountRemaining || 0),
            paymentMethod: row.paymentMethod || 'cash',
            paymentPaidAt: formatDateOnly(row.paymentPaidAt)
        } : null
    };
}

const MEMBER_CTE = `
WITH latest_membership AS (
    SELECT
        m.id AS membershipId,
        m.member_id AS membershipMemberId,
        m.membership_type AS membershipType,
        m.start_date AS startDate,
        m.end_date AS endDate,
        m.notes AS membershipNotes,
        ROW_NUMBER() OVER (PARTITION BY m.member_id ORDER BY m.end_date DESC, m.id DESC) AS membershipRank
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
    SELECT membership_id AS paymentMembershipId, amount_due AS amountDue, amount_paid AS amountPaid,
           amount_remaining AS amountRemaining, payment_method AS paymentMethod, paid_at AS paymentPaidAt
    FROM dbo.gym_payments
)
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
    lm.membershipType,
    lm.startDate,
    lm.endDate,
    lm.membershipNotes,
    DATEADD(day, ISNULL(ft.freezeDays, 0), lm.endDate) AS effectiveEndDate,
    cf.freezeId,
    cf.freezeStart,
    cf.freezeEnd,
    ISNULL(ps.amountDue, 0) AS amountDue,
    ISNULL(ps.amountPaid, 0) AS amountPaid,
    ISNULL(ps.amountRemaining, 0) AS amountRemaining,
    ps.paymentMethod,
    ps.paymentPaidAt,
    CASE
        WHEN lm.membershipId IS NULL THEN 'expired'
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
LEFT JOIN current_freeze AS cf ON cf.currentFreezeMembershipId = lm.membershipId
LEFT JOIN payment_summary AS ps ON ps.paymentMembershipId = lm.membershipId
`;

async function getMemberById(id, connection = null) {
    const memberId = ensureId(id);
    const pool = connection || await getPool();
    const result = await pool.request()
        .input('today', sql.Date, toUtcDate(todayInTimeZone()))
        .input('id', sql.Int, memberId)
        .query(`${MEMBER_CTE} WHERE b.id = @id;`);
    if (!result.recordset[0]) throw appError('العضو غير موجود.', 404);
    return mapMember(result.recordset[0]);
}

async function getMembers({ search = '', status = '' } = {}) {
    const normalizedSearch = String(search || '').trim().slice(0, 100);
    const normalizedStatus = ensureStatus(status);
    const pool = await getPool();
    const result = await pool.request()
        .input('today', sql.Date, toUtcDate(todayInTimeZone()))
        .input('search', sql.NVarChar(100), normalizedSearch)
        .input('pattern', sql.NVarChar(110), `%${normalizedSearch}%`)
        .query(`${MEMBER_CTE}
            WHERE (@search = N'' OR b.full_name LIKE @pattern OR b.phone LIKE @pattern OR ISNULL(b.email, N'') LIKE @pattern)
            ORDER BY effectiveEndDate ASC, fullName ASC;`);
    const members = result.recordset.map(mapMember);
    return normalizedStatus ? members.filter((member) => member.membership?.status === normalizedStatus) : members;
}

async function getDashboard() {
    const today = todayInTimeZone();
    const members = await getMembers({});
    const counts = members.reduce((result, member) => {
        const status = member.membership?.status || 'expired';
        result[status] = (result[status] || 0) + 1;
        return result;
    }, {});
    const alertRows = members.filter((member) => {
        const membership = member.membership;
        if (!membership) return false;
        return membership.status === 'frozen'
            || membership.status === 'expiring_soon'
            || (membership.status === 'expired' && membership.endDate === today);
    });
    return {
        today,
        stats: {
            total: Object.values(counts).reduce((sum, value) => sum + value, 0),
            active: counts.active || 0,
            expiringSoon: counts.expiring_soon || 0,
            expired: counts.expired || 0,
            frozen: counts.frozen || 0
        },
        alerts: alertRows
    };
}

async function getRawMember(connection, id) {
    const result = await connection.request()
        .input('id', sql.Int, ensureId(id))
        .query(`SELECT id, full_name, phone, email, registration_date, notes
                FROM dbo.members WHERE id = @id;`);
    return result.recordset[0] || null;
}

async function getRawMembership(connection, memberId) {
    const result = await connection.request()
        .input('memberId', sql.Int, ensureId(memberId))
        .query(`SELECT TOP 1 id, member_id, membership_type, start_date, end_date, notes
                FROM dbo.memberships WHERE member_id = @memberId
                ORDER BY end_date DESC, id DESC;`);
    return result.recordset[0] || null;
}

async function getRawPayment(connection, membershipId) {
    const result = await connection.request()
        .input('membershipId', sql.Int, ensureId(membershipId, 'معرّف الاشتراك'))
        .query(`SELECT TOP 1 id, membership_id, amount_due, amount_paid, payment_method, notes
                FROM dbo.gym_payments WHERE membership_id = @membershipId;`);
    return result.recordset[0] || null;
}

async function getFreezeTotals(connection, membershipId) {
    const result = await connection.request()
        .input('membershipId', sql.Int, ensureId(membershipId, 'معرّف الاشتراك'))
        .query(`SELECT COALESCE(SUM(CASE
                    WHEN resumed_date IS NULL THEN DATEDIFF(day, start_date, end_date) + 1
                    WHEN resumed_date <= start_date THEN 0
                    WHEN resumed_date < end_date THEN DATEDIFF(day, start_date, resumed_date)
                    ELSE DATEDIFF(day, start_date, end_date) + 1
                END), 0) AS freezeDays
                FROM dbo.membership_freezes WHERE membership_id = @membershipId;`);
    return Number(result.recordset[0].freezeDays || 0);
}

async function getActiveFreeze(connection, membershipId, today) {
    const result = await connection.request()
        .input('membershipId', sql.Int, ensureId(membershipId, 'معرّف الاشتراك'))
        .input('today', sql.Date, toUtcDate(today))
        .query(`SELECT TOP 1 id, start_date, end_date, reason
                FROM dbo.membership_freezes
                WHERE membership_id = @membershipId AND resumed_date IS NULL
                  AND @today BETWEEN start_date AND end_date
                ORDER BY start_date DESC, id DESC;`);
    return result.recordset[0] || null;
}

async function addEvent(connection, memberId, membershipId, eventType, details) {
    await connection.request()
        .input('memberId', sql.Int, memberId)
        .input('membershipId', sql.Int, membershipId || null)
        .input('eventType', sql.VarChar(30), eventType)
        .input('details', sql.NVarChar(sql.MAX), JSON.stringify(details || {}))
        .query(`INSERT INTO dbo.membership_events (member_id, membership_id, event_type, details)
                VALUES (@memberId, @membershipId, @eventType, @details);`);
}

async function withTransaction(work) {
    const pool = await getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
        const result = await work(transaction);
        await transaction.commit();
        return result;
    } catch (error) {
        try { await transaction.rollback(); } catch (_) { /* keep original error */ }
        throw error;
    }
}

async function createMember(body) {
    const data = normalizePayload(body);
    const memberId = await withTransaction(async (transaction) => {
        const memberResult = await transaction.request()
            .input('fullName', sql.NVarChar(120), data.fullName)
            .input('phone', sql.NVarChar(30), data.phone)
            .input('email', sql.NVarChar(254), data.email)
            .input('registrationDate', sql.Date, toUtcDate(data.registrationDate))
            .input('notes', sql.NVarChar(1000), data.notes)
            .query(`INSERT INTO dbo.members (full_name, phone, email, registration_date, notes)
                    OUTPUT INSERTED.id
                    VALUES (@fullName, @phone, @email, @registrationDate, @notes);`);
        const id = Number(memberResult.recordset[0].id);
        const membershipResult = await transaction.request()
            .input('memberId', sql.Int, id)
            .input('membershipType', sql.VarChar(20), data.membershipType)
            .input('startDate', sql.Date, toUtcDate(data.startDate))
            .input('endDate', sql.Date, toUtcDate(data.endDate))
            .input('notes', sql.NVarChar(1000), data.membershipNotes)
            .query(`INSERT INTO dbo.memberships (member_id, membership_type, start_date, end_date, notes)
                    OUTPUT INSERTED.id
                    VALUES (@memberId, @membershipType, @startDate, @endDate, @notes);`);
        const membershipId = Number(membershipResult.recordset[0].id);
        await transaction.request()
            .input('membershipId', sql.Int, membershipId)
            .input('amountDue', sql.Decimal(12, 2), data.amountDue)
            .input('amountPaid', sql.Decimal(12, 2), data.amountPaid)
            .input('paymentMethod', sql.VarChar(20), data.paymentMethod)
            .input('paidAt', sql.Date, data.amountPaid > 0 ? toUtcDate(todayInTimeZone()) : null)
            .input('notes', sql.NVarChar(500), data.paymentNotes)
            .query(`INSERT INTO dbo.gym_payments (membership_id, amount_due, amount_paid, payment_method, paid_at, notes)
                    VALUES (@membershipId, @amountDue, @amountPaid, @paymentMethod, @paidAt, @notes);`);
        await addEvent(transaction, id, membershipId, 'created', {
            membershipType: data.membershipType,
            startDate: data.startDate,
            endDate: data.endDate,
            amountDue: data.amountDue,
            amountPaid: data.amountPaid
        });
        return id;
    });
    return getMemberById(memberId);
}

async function updateMember(id, body) {
    const memberId = ensureId(id);
    const updatedId = await withTransaction(async (transaction) => {
        const currentMember = await getRawMember(transaction, memberId);
        if (!currentMember) throw appError('العضو غير موجود.', 404);
        const currentMembership = await getRawMembership(transaction, memberId);
        if (!currentMembership) throw appError('لا يوجد اشتراك لهذا العضو.', 400);
        const currentPayment = await getRawPayment(transaction, currentMembership.id);
        const patch = normalizePayload(body, { partial: true });

        const memberData = {
            fullName: patch.fullName ?? currentMember.full_name,
            phone: patch.phone ?? currentMember.phone,
            email: patch.email === undefined ? currentMember.email : patch.email,
            registrationDate: patch.registrationDate ?? formatDateOnly(currentMember.registration_date),
            notes: patch.notes === undefined ? currentMember.notes : patch.notes
        };
        const membershipData = {
            type: patch.membershipType ?? currentMembership.membership_type,
            startDate: patch.startDate ?? formatDateOnly(currentMembership.start_date),
            endDate: patch.endDate ?? formatDateOnly(currentMembership.end_date),
            notes: patch.membershipNotes === undefined ? currentMembership.notes : patch.membershipNotes
        };
        if (membershipData.endDate < membershipData.startDate) {
            throw appError('تاريخ الانتهاء يجب أن يكون بعد أو مساوياً لتاريخ البداية.');
        }

        await transaction.request()
            .input('id', sql.Int, memberId)
            .input('fullName', sql.NVarChar(120), memberData.fullName)
            .input('phone', sql.NVarChar(30), memberData.phone)
            .input('email', sql.NVarChar(254), memberData.email)
            .input('registrationDate', sql.Date, toUtcDate(memberData.registrationDate))
            .input('notes', sql.NVarChar(1000), memberData.notes)
            .query(`UPDATE dbo.members SET full_name = @fullName, phone = @phone, email = @email,
                    registration_date = @registrationDate, notes = @notes, updated_at = SYSUTCDATETIME()
                    WHERE id = @id;`);
        await transaction.request()
            .input('id', sql.Int, currentMembership.id)
            .input('membershipType', sql.VarChar(20), membershipData.type)
            .input('startDate', sql.Date, toUtcDate(membershipData.startDate))
            .input('endDate', sql.Date, toUtcDate(membershipData.endDate))
            .input('notes', sql.NVarChar(1000), membershipData.notes)
            .query(`UPDATE dbo.memberships SET membership_type = @membershipType, start_date = @startDate,
                    end_date = @endDate, notes = @notes, updated_at = SYSUTCDATETIME() WHERE id = @id;`);

        if (has(body, 'amountDue') || has(body, 'amountPaid') || has(body, 'paymentMethod') || has(body, 'paymentNotes')) {
            const payment = normalizePaymentPayload(body, currentPayment || {});
            if (currentPayment) {
                await transaction.request()
                    .input('id', sql.Int, currentPayment.id)
                    .input('amountDue', sql.Decimal(12, 2), payment.amountDue)
                    .input('amountPaid', sql.Decimal(12, 2), payment.amountPaid)
                    .input('paymentMethod', sql.VarChar(20), payment.paymentMethod)
                    .input('paidAt', sql.Date, payment.paidAt ? toUtcDate(payment.paidAt) : null)
                    .input('notes', sql.NVarChar(500), payment.paymentNotes)
                    .query(`UPDATE dbo.gym_payments SET amount_due = @amountDue, amount_paid = @amountPaid,
                            payment_method = @paymentMethod, paid_at = @paidAt, notes = @notes,
                            updated_at = SYSUTCDATETIME() WHERE id = @id;`);
            } else {
                await transaction.request()
                    .input('membershipId', sql.Int, currentMembership.id)
                    .input('amountDue', sql.Decimal(12, 2), payment.amountDue)
                    .input('amountPaid', sql.Decimal(12, 2), payment.amountPaid)
                    .input('paymentMethod', sql.VarChar(20), payment.paymentMethod)
                    .input('paidAt', sql.Date, payment.paidAt ? toUtcDate(payment.paidAt) : null)
                    .input('notes', sql.NVarChar(500), payment.paymentNotes)
                    .query(`INSERT INTO dbo.gym_payments (membership_id, amount_due, amount_paid, payment_method, paid_at, notes)
                            VALUES (@membershipId, @amountDue, @amountPaid, @paymentMethod, @paidAt, @notes);`);
            }
        }
        await addEvent(transaction, memberId, currentMembership.id, 'updated', { fields: Object.keys(body || {}) });
        return memberId;
    });
    return getMemberById(updatedId);
}

async function deleteMember(id) {
    const memberId = ensureId(id);
    const pool = await getPool();
    const result = await pool.request().input('id', sql.Int, memberId)
        .query('DELETE FROM dbo.members WHERE id = @id;');
    if (!result.rowsAffected[0]) throw appError('العضو غير موجود.', 404);
}

async function freezeMember(id, days, reason) {
    const memberId = ensureId(id);
    const freezeDays = Number(days);
    if (!Number.isInteger(freezeDays) || freezeDays < 1 || freezeDays > 365) {
        throw appError('مدة التجميد يجب أن تكون بين يوم و365 يوماً.');
    }
    const today = todayInTimeZone();
    const freezeReason = optionalString(reason, 500);
    const frozenId = await withTransaction(async (transaction) => {
        const membership = await getRawMembership(transaction, memberId);
        if (!membership) throw appError('لا يوجد اشتراك لهذا العضو.', 400);
        if (await getActiveFreeze(transaction, membership.id, today)) throw appError('العضوية مجمدة بالفعل.');
        const freezeDaysAlreadyUsed = await getFreezeTotals(transaction, membership.id);
        const effectiveEnd = addDays(formatDateOnly(membership.end_date), freezeDaysAlreadyUsed);
        if (effectiveEnd < today) throw appError('لا يمكن تجميد اشتراك منتهٍ.');
        const freezeEnd = addDays(today, freezeDays - 1);
        const result = await transaction.request()
            .input('membershipId', sql.Int, membership.id)
            .input('startDate', sql.Date, toUtcDate(today))
            .input('endDate', sql.Date, toUtcDate(freezeEnd))
            .input('reason', sql.NVarChar(500), freezeReason)
            .query(`INSERT INTO dbo.membership_freezes (membership_id, start_date, end_date, reason)
                    OUTPUT INSERTED.id VALUES (@membershipId, @startDate, @endDate, @reason);`);
        const freezeId = Number(result.recordset[0].id);
        await addEvent(transaction, memberId, membership.id, 'frozen', { freezeId, days: freezeDays, startDate: today, endDate: freezeEnd });
        return memberId;
    });
    return getMemberById(frozenId);
}

async function resumeMember(id) {
    const memberId = ensureId(id);
    const today = todayInTimeZone();
    const resumedId = await withTransaction(async (transaction) => {
        const membership = await getRawMembership(transaction, memberId);
        if (!membership) throw appError('لا يوجد اشتراك لهذا العضو.', 400);
        const activeFreeze = await getActiveFreeze(transaction, membership.id, today);
        if (!activeFreeze) throw appError('لا يوجد تجميد نشط حالياً.');
        await transaction.request()
            .input('id', sql.Int, activeFreeze.id)
            .input('resumedDate', sql.Date, toUtcDate(today))
            .query(`UPDATE dbo.membership_freezes SET resumed_date = @resumedDate,
                    updated_at = SYSUTCDATETIME() WHERE id = @id;`);
        await addEvent(transaction, memberId, membership.id, 'resumed', {
            freezeId: activeFreeze.id,
            resumedDate: today
        });
        return memberId;
    });
    return getMemberById(resumedId);
}

async function renewMember(id, body = {}) {
    const memberId = ensureId(id);
    const type = body.membershipType || body.type;
    const membershipType = requiredString(type, 'نوع العضوية', 20);
    if (!MEMBERSHIP_TYPES.includes(membershipType)) throw appError('نوع العضوية غير صالح.');
    const today = todayInTimeZone();
    const renewedId = await withTransaction(async (transaction) => {
        const current = await getRawMembership(transaction, memberId);
        if (!current) throw appError('لا يوجد اشتراك لهذا العضو.', 400);
        if (await getActiveFreeze(transaction, current.id, today)) throw appError('استأنف العضوية قبل التجديد.');
        const freezeDays = await getFreezeTotals(transaction, current.id);
        const effectiveEnd = addDays(formatDateOnly(current.end_date), freezeDays);
        const startDate = effectiveEnd < today ? today : addDays(effectiveEnd, 1);
        const endDate = membershipEndDate(startDate, membershipType);
        const payment = normalizePaymentPayload(body, {
            amount_due: body.amountDue === undefined ? 0 : body.amountDue,
            amount_paid: body.amountPaid === undefined ? 0 : body.amountPaid,
            payment_method: body.paymentMethod || 'cash',
            notes: body.paymentNotes || null
        });
        const membershipNotes = optionalString(body.membershipNotes, 1000);
        const result = await transaction.request()
            .input('memberId', sql.Int, memberId)
            .input('membershipType', sql.VarChar(20), membershipType)
            .input('startDate', sql.Date, toUtcDate(startDate))
            .input('endDate', sql.Date, toUtcDate(endDate))
            .input('notes', sql.NVarChar(1000), membershipNotes)
            .query(`INSERT INTO dbo.memberships (member_id, membership_type, start_date, end_date, notes)
                    OUTPUT INSERTED.id VALUES (@memberId, @membershipType, @startDate, @endDate, @notes);`);
        const membershipId = Number(result.recordset[0].id);
        await transaction.request()
            .input('membershipId', sql.Int, membershipId)
            .input('amountDue', sql.Decimal(12, 2), payment.amountDue)
            .input('amountPaid', sql.Decimal(12, 2), payment.amountPaid)
            .input('paymentMethod', sql.VarChar(20), payment.paymentMethod)
            .input('paidAt', sql.Date, payment.paidAt ? toUtcDate(today) : null)
            .input('notes', sql.NVarChar(500), payment.paymentNotes)
            .query(`INSERT INTO dbo.gym_payments (membership_id, amount_due, amount_paid, payment_method, paid_at, notes)
                    VALUES (@membershipId, @amountDue, @amountPaid, @paymentMethod, @paidAt, @notes);`);
        await addEvent(transaction, memberId, membershipId, 'renewed', {
            membershipType, startDate, endDate, amountDue: payment.amountDue, amountPaid: payment.amountPaid
        });
        return memberId;
    });
    return getMemberById(renewedId);
}

async function recordPayment(membershipId, body = {}) {
    const id = ensureId(membershipId, 'معرّف الاشتراك');
    const memberId = await withTransaction(async (transaction) => {
        const membershipResult = await transaction.request()
            .input('membershipId', sql.Int, id)
            .query('SELECT member_id FROM dbo.memberships WHERE id = @membershipId;');
        const membership = membershipResult.recordset[0];
        if (!membership) throw appError('الاشتراك غير موجود.', 404);
        const current = await getRawPayment(transaction, id);
        const payment = normalizePaymentPayload(body, current || {});
        if (current) {
            await transaction.request()
                .input('id', sql.Int, current.id)
                .input('amountDue', sql.Decimal(12, 2), payment.amountDue)
                .input('amountPaid', sql.Decimal(12, 2), payment.amountPaid)
                .input('paymentMethod', sql.VarChar(20), payment.paymentMethod)
                .input('paidAt', sql.Date, payment.paidAt ? toUtcDate(payment.paidAt) : null)
                .input('notes', sql.NVarChar(500), payment.paymentNotes)
                .query(`UPDATE dbo.gym_payments SET amount_due = @amountDue, amount_paid = @amountPaid,
                        payment_method = @paymentMethod, paid_at = @paidAt, notes = @notes,
                        updated_at = SYSUTCDATETIME() WHERE id = @id;`);
        } else {
            await transaction.request()
                .input('membershipId', sql.Int, id)
                .input('amountDue', sql.Decimal(12, 2), payment.amountDue)
                .input('amountPaid', sql.Decimal(12, 2), payment.amountPaid)
                .input('paymentMethod', sql.VarChar(20), payment.paymentMethod)
                .input('paidAt', sql.Date, payment.paidAt ? toUtcDate(payment.paidAt) : null)
                .input('notes', sql.NVarChar(500), payment.paymentNotes)
                .query(`INSERT INTO dbo.gym_payments (membership_id, amount_due, amount_paid, payment_method, paid_at, notes)
                        VALUES (@membershipId, @amountDue, @amountPaid, @paymentMethod, @paidAt, @notes);`);
        }
        await addEvent(transaction, Number(membership.member_id), id, 'payment_updated', {
            amountDue: payment.amountDue, amountPaid: payment.amountPaid, paymentMethod: payment.paymentMethod
        });
        return Number(membership.member_id);
    });
    return getMemberById(memberId);
}

module.exports = {
    createMember,
    deleteMember,
    getDashboard,
    getMemberById,
    getMembers,
    freezeMember,
    recordPayment,
    renewMember,
    resumeMember,
    updateMember
};
