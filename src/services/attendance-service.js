const { getPool, sql } = require('../database');
const { addDays, differenceInDays, formatDateOnly, parseDateOnly, todayInTimeZone, toUtcDate } = require('../utils/date');
const { config } = require('../config/env');

const ATTENDANCE_SOURCES = new Set(['phone', 'qr', 'manual']);
const DEFAULT_AUTO_CHECKOUT_MINUTES = 60;
let attendanceTablePromise;

function getAutoCheckoutMinutes() {
    const configured = Number.parseInt(config.attendanceAutoCheckoutMinutes, 10);
    return Number.isInteger(configured) && configured > 0 ? Math.min(configured, 1440) : DEFAULT_AUTO_CHECKOUT_MINUTES;
}

function appError(message, statusCode = 400, code = null, details = {}) {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.expose = true;
    if (code) error.code = code;
    Object.assign(error, details);
    return error;
}

function ensureId(value, label = 'المعرّف') {
    const id = Number(value);
    if (!Number.isInteger(id) || id < 1) throw appError(`${label} غير صالح.`);
    return id;
}

function normalizePhone(value) {
    const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
    const englishDigits = '0123456789';
    let normalized = String(value ?? '').trim().replace(/[٠-٩]/gu, (digit) => englishDigits[arabicDigits.indexOf(digit)]);
    normalized = normalized.replace(/[^0-9]/g, '');
    if (normalized.startsWith('00')) normalized = normalized.slice(2);
    if (normalized.startsWith('20') && normalized.length === 12) normalized = `0${normalized.slice(2)}`;
    return normalized;
}

async function ensureAttendanceTable() {
    if (!attendanceTablePromise) {
        attendanceTablePromise = (async () => {
            const pool = await getPool();
            await pool.request().batch(`
                IF OBJECT_ID(N'dbo.gym_attendance', N'U') IS NULL
                BEGIN
                    EXEC(N'CREATE TABLE dbo.gym_attendance (
                        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_attendance_runtime PRIMARY KEY,
                        member_id INT NOT NULL,
                        membership_id INT NULL,
                        attendance_date DATE NOT NULL,
                        check_in_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_attendance_check_in_runtime DEFAULT (SYSUTCDATETIME()),
                        check_out_at DATETIME2(0) NULL,
                        check_in_source VARCHAR(10) NOT NULL CONSTRAINT DF_gym_attendance_source_runtime DEFAULT (''phone''),
                        check_out_source VARCHAR(10) NULL,
                        notes NVARCHAR(250) NULL,
                        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_attendance_created_runtime DEFAULT (SYSUTCDATETIME()),
                        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_attendance_updated_runtime DEFAULT (SYSUTCDATETIME()),
                        CONSTRAINT FK_gym_attendance_member_runtime FOREIGN KEY (member_id)
                            REFERENCES dbo.members(id) ON DELETE CASCADE,
                        CONSTRAINT CK_gym_attendance_check_out_runtime CHECK (check_out_at IS NULL OR check_out_at >= check_in_at),
                        CONSTRAINT CK_gym_attendance_source_runtime CHECK (check_in_source IN (''phone'', ''qr'', ''manual'') AND (check_out_source IS NULL OR check_out_source IN (''phone'', ''qr'', ''manual'', ''auto'')))
                    );');
                END;
                IF EXISTS (
                    SELECT 1 FROM sys.check_constraints
                    WHERE name = N'CK_gym_attendance_source'
                      AND parent_object_id = OBJECT_ID(N'dbo.gym_attendance')
                )
                BEGIN
                    ALTER TABLE dbo.gym_attendance DROP CONSTRAINT CK_gym_attendance_source;
                END;
                IF EXISTS (
                    SELECT 1 FROM sys.check_constraints
                    WHERE name = N'CK_gym_attendance_source_runtime'
                      AND parent_object_id = OBJECT_ID(N'dbo.gym_attendance')
                )
                BEGIN
                    ALTER TABLE dbo.gym_attendance DROP CONSTRAINT CK_gym_attendance_source_runtime;
                END;
                IF NOT EXISTS (
                    SELECT 1 FROM sys.check_constraints
                    WHERE name = N'CK_gym_attendance_source_v2'
                      AND parent_object_id = OBJECT_ID(N'dbo.gym_attendance')
                )
                BEGIN
                    ALTER TABLE dbo.gym_attendance ADD CONSTRAINT CK_gym_attendance_source_v2 CHECK (
                        check_in_source IN ('phone', 'qr', 'manual')
                        AND (check_out_source IS NULL OR check_out_source IN ('phone', 'qr', 'manual', 'auto'))
                    );
                END;
                IF NOT EXISTS (
                    SELECT 1 FROM sys.indexes
                    WHERE name = N'UX_gym_attendance_member_date' AND object_id = OBJECT_ID(N'dbo.gym_attendance')
                )
                BEGIN
                    EXEC(N'CREATE UNIQUE INDEX UX_gym_attendance_member_date
                          ON dbo.gym_attendance(member_id, attendance_date);');
                END;
                IF NOT EXISTS (
                    SELECT 1 FROM sys.indexes
                    WHERE name = N'IX_gym_attendance_date' AND object_id = OBJECT_ID(N'dbo.gym_attendance')
                )
                BEGIN
                    EXEC(N'CREATE INDEX IX_gym_attendance_date
                          ON dbo.gym_attendance(attendance_date DESC, check_in_at DESC, id DESC);');
                END;
            `);
        })().catch((error) => {
            attendanceTablePromise = undefined;
            throw error;
        });
    }
    return attendanceTablePromise;
}

async function reconcileAutoCheckout(pool = null, memberId = null) {
    await ensureAttendanceTable();
    const connection = pool || await getPool();
    const result = await connection.request()
        .input('autoMinutes', sql.Int, getAutoCheckoutMinutes())
        .input('memberId', sql.Int, memberId == null ? null : ensureId(memberId, 'معرّف العضو'))
        .query(`UPDATE dbo.gym_attendance
                SET check_out_at = DATEADD(minute, @autoMinutes, check_in_at),
                    check_out_source = 'auto',
                    updated_at = SYSUTCDATETIME()
                WHERE check_out_at IS NULL
                  AND (@memberId IS NULL OR member_id = @memberId)
                  AND DATEADD(minute, @autoMinutes, check_in_at) <= SYSUTCDATETIME();`);
    return Number(result.rowsAffected?.[0] || 0);
}

function parseQrToken(value) {
    const token = String(value ?? '').trim();
    if (!token) return null;
    if (/^TOPGYM-MEMBER:\d+$/i.test(token)) return Number(token.split(':')[1]);
    if (/^TOPGYM\|MEMBER\|\d+$/i.test(token)) return Number(token.split('|')[2]);
    const embeddedToken = token.match(/TOPGYM-MEMBER:(\d+)/i) || token.match(/TOPGYM\|MEMBER\|(\d+)/i);
    if (embeddedToken) return Number(embeddedToken[1]);
    try {
        const url = new URL(token);
        const pathMatch = url.pathname.match(/\/qr\/(\d+)/i);
        if (pathMatch) return Number(pathMatch[1]);
        const queryId = Number(url.searchParams.get('memberId') || url.searchParams.get('member'));
        if (Number.isInteger(queryId) && queryId > 0) return queryId;
    } catch (_) { /* QR may contain plain text or JSON. */ }
    try {
        const parsed = JSON.parse(token);
        if (parsed?.memberId) return ensureId(parsed.memberId, 'معرّف العضو');
    } catch (_) { /* QR may contain the compact token above. */ }
    return null;
}

async function findMember(pool, body = {}, { requireActive = true } = {}) {
    const qrMemberId = parseQrToken(body.qrToken ?? body.token);
    const phone = normalizePhone(body.phone);
    if (!qrMemberId && phone.length < 5) {
        throw appError('أدخل رقم الهاتف أو امسح QR Code للعضو.');
    }

    const memberRequest = pool.request();
    let memberQuery = `SELECT TOP 1 id, full_name, phone, phone_normalized
                       FROM dbo.members
                       WHERE ${qrMemberId ? 'id = @memberId' : '(phone_normalized = @phone OR phone = @phone)'};`;
    if (qrMemberId) memberRequest.input('memberId', sql.Int, qrMemberId);
    else memberRequest.input('phone', sql.NVarChar(30), phone);
    const memberResult = await memberRequest.query(memberQuery);
    const member = memberResult.recordset[0];
    if (!member) throw appError('لم يتم العثور على مشترك بهذا الرقم أو QR Code.', 404, 'ATTENDANCE_MEMBER_NOT_FOUND');

    const today = todayInTimeZone();
    const membershipResult = await pool.request()
        .input('memberId', sql.Int, member.id)
        .input('today', sql.Date, toUtcDate(today))
        .query(`SELECT TOP 1 m.id, m.membership_plan, m.membership_type, m.start_date, m.end_date,
                       CASE WHEN EXISTS (
                           SELECT 1 FROM dbo.membership_freezes AS f
                           WHERE f.membership_id = m.id AND f.resumed_date IS NULL
                             AND @today BETWEEN f.start_date AND f.end_date
                       ) THEN 1 ELSE 0 END AS is_frozen
                FROM dbo.memberships AS m
                WHERE m.member_id = @memberId
                ORDER BY CASE WHEN @today BETWEEN m.start_date AND m.end_date THEN 0 ELSE 1 END,
                         m.end_date DESC, m.id DESC;`);
    const membership = membershipResult.recordset[0] || null;
    if (requireActive) {
        if (!membership || formatDateOnly(membership.start_date) > today || formatDateOnly(membership.end_date) < today) {
            throw appError('لا توجد عضوية سارية لهذا المشترك اليوم.', 409, 'ATTENDANCE_MEMBERSHIP_INACTIVE');
        }
        if (Number(membership.is_frozen)) {
            throw appError('لا يمكن تسجيل الحضور لأن عضوية المشترك مجمدة حالياً.', 409, 'ATTENDANCE_MEMBERSHIP_FROZEN');
        }
    }
    return { member, membership, today, source: qrMemberId ? 'qr' : 'phone' };
}

function mapAttendance(row) {
    return {
        id: Number(row.id),
        memberId: Number(row.member_id),
        memberName: row.full_name,
        phone: row.phone,
        membershipId: row.membership_id ? Number(row.membership_id) : null,
        plan: row.membership_plan || null,
        type: row.membership_type || null,
        attendanceDate: formatDateOnly(row.attendance_date),
        checkInAt: row.check_in_at,
        checkOutAt: row.check_out_at,
        checkInSource: row.check_in_source || 'phone',
        checkOutSource: row.check_out_source || null,
        notes: row.notes || null,
        durationMinutes: row.check_out_at && row.check_in_at
            ? Math.max(0, Math.round((new Date(row.check_out_at).getTime() - new Date(row.check_in_at).getTime()) / 60000))
            : null
    };
}

async function getTodayAttendance(options = {}) {
    await ensureAttendanceTable();
    const pool = await getPool();
    const date = parseDateOnly(options.date || todayInTimeZone(), 'تاريخ الحضور');
    const search = String(options.search || '').trim();
    const result = await pool.request()
        .input('attendanceDate', sql.Date, toUtcDate(date))
        .input('search', sql.NVarChar(120), search ? `%${search}%` : null)
        .input('autoMinutes', sql.Int, getAutoCheckoutMinutes())
        .batch(`UPDATE dbo.gym_attendance
                SET check_out_at = DATEADD(minute, @autoMinutes, check_in_at),
                    check_out_source = 'auto',
                    updated_at = SYSUTCDATETIME()
                WHERE check_out_at IS NULL
                  AND DATEADD(minute, @autoMinutes, check_in_at) <= SYSUTCDATETIME();
                SELECT @@ROWCOUNT AS autoClosed;

                SELECT a.id, a.member_id, a.membership_id, a.attendance_date,
                       a.check_in_at, a.check_out_at, a.check_in_source, a.check_out_source,
                       a.notes, m.full_name, m.phone,
                       ms.membership_plan, ms.membership_type
                FROM dbo.gym_attendance AS a
                INNER JOIN dbo.members AS m ON m.id = a.member_id
                OUTER APPLY (
                    SELECT TOP 1 x.membership_plan, x.membership_type
                    FROM dbo.memberships AS x
                    WHERE x.id = a.membership_id
                ) AS ms
                WHERE a.attendance_date = @attendanceDate
                  AND (@search IS NULL OR m.full_name LIKE @search OR m.phone LIKE @search)
                ORDER BY a.check_in_at DESC, a.id DESC;`);
    const autoClosed = Number(result.recordsets?.[0]?.[0]?.autoClosed || 0);
    const records = (result.recordsets?.[1] || []).map(mapAttendance);
    return {
        date,
        autoClosed,
        autoCheckoutMinutes: getAutoCheckoutMinutes(),
        summary: {
            present: records.length,
            checkedIn: records.filter((item) => !item.checkOutAt).length,
            checkedOut: records.filter((item) => Boolean(item.checkOutAt)).length
        },
        records
    };
}

async function getAttendanceRecordForDate(pool, memberId, date) {
    const result = await pool.request()
        .input('memberId', sql.Int, memberId)
        .input('attendanceDate', sql.Date, toUtcDate(date))
        .query(`SELECT a.id, a.member_id, a.membership_id, a.attendance_date,
                       a.check_in_at, a.check_out_at, a.check_in_source, a.check_out_source,
                       a.notes, m.full_name, m.phone,
                       ms.membership_plan, ms.membership_type
                FROM dbo.gym_attendance AS a
                INNER JOIN dbo.members AS m ON m.id = a.member_id
                OUTER APPLY (
                    SELECT TOP 1 x.membership_plan, x.membership_type
                    FROM dbo.memberships AS x WHERE x.id = a.membership_id
                ) AS ms
                WHERE a.member_id = @memberId AND a.attendance_date = @attendanceDate;`);
    return result.recordset[0] ? mapAttendance(result.recordset[0]) : null;
}

async function getMemberAttendanceStatuses(memberIds = [], date = todayInTimeZone()) {
    await ensureAttendanceTable();
    const pool = await getPool();
    const ids = [...new Set(memberIds.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0))];
    if (!ids.length) return new Map();
    const request = pool.request()
        .input('attendanceDate', sql.Date, toUtcDate(parseDateOnly(date, 'تاريخ الحضور')))
        .input('autoMinutes', sql.Int, getAutoCheckoutMinutes());
    const placeholders = ids.map((id, index) => {
        const name = `memberId${index}`;
        request.input(name, sql.Int, id);
        return `@${name}`;
    });
    const result = await request.batch(`UPDATE dbo.gym_attendance
                       SET check_out_at = DATEADD(minute, @autoMinutes, check_in_at),
                           check_out_source = 'auto',
                           updated_at = SYSUTCDATETIME()
                       WHERE check_out_at IS NULL
                         AND DATEADD(minute, @autoMinutes, check_in_at) <= SYSUTCDATETIME();

                       SELECT a.id, a.member_id, a.membership_id, a.attendance_date,
                       a.check_in_at, a.check_out_at, a.check_in_source, a.check_out_source,
                       a.notes, m.full_name, m.phone,
                       ms.membership_plan, ms.membership_type
                FROM dbo.gym_attendance AS a
                INNER JOIN dbo.members AS m ON m.id = a.member_id
                OUTER APPLY (
                    SELECT TOP 1 x.membership_plan, x.membership_type
                    FROM dbo.memberships AS x
                    WHERE x.id = a.membership_id
                ) AS ms
                WHERE a.attendance_date = @attendanceDate
                  AND a.member_id IN (${placeholders.join(', ')});`);
    return new Map((result.recordsets?.[0] || []).map((row) => [Number(row.member_id), mapAttendance(row)]));
}

async function checkIn(body = {}) {
    await ensureAttendanceTable();
    const pool = await getPool();
    await reconcileAutoCheckout(pool);
    const resolved = await findMember(pool, body, { requireActive: true });
    const existing = await getAttendanceRecordForDate(pool, resolved.member.id, resolved.today);
    if (existing) {
        throw appError('تم تسجيل حضور هذا المشترك اليوم بالفعل.', 409, 'ATTENDANCE_ALREADY_CHECKED_IN', { attendance: existing });
    }
    try {
        await pool.request()
            .input('memberId', sql.Int, resolved.member.id)
            .input('membershipId', sql.Int, resolved.membership?.id || null)
            .input('attendanceDate', sql.Date, toUtcDate(resolved.today))
            .input('source', sql.VarChar(10), ATTENDANCE_SOURCES.has(resolved.source) ? resolved.source : 'manual')
            .query(`INSERT INTO dbo.gym_attendance (member_id, membership_id, attendance_date, check_in_source)
                    VALUES (@memberId, @membershipId, @attendanceDate, @source);`);
    } catch (error) {
        if (error.number === 2601 || error.number === 2627) {
            const duplicate = await getAttendanceRecordForDate(pool, resolved.member.id, resolved.today);
            throw appError('تم تسجيل حضور هذا المشترك اليوم بالفعل.', 409, 'ATTENDANCE_ALREADY_CHECKED_IN', { attendance: duplicate });
        }
        throw error;
    }
    const attendance = await getAttendanceRecordForDate(pool, resolved.member.id, resolved.today);
    return { attendance, message: `تم تسجيل حضور ${resolved.member.full_name} بنجاح.` };
}

async function checkOut(body = {}) {
    await ensureAttendanceTable();
    const pool = await getPool();
    await reconcileAutoCheckout(pool);
    const resolved = await findMember(pool, body, { requireActive: false });
    const existing = await getAttendanceRecordForDate(pool, resolved.member.id, resolved.today);
    if (!existing) throw appError('لا يوجد تسجيل حضور لهذا المشترك اليوم.', 409, 'ATTENDANCE_NOT_CHECKED_IN');
    if (existing.checkOutAt) throw appError('تم تسجيل انصراف هذا المشترك اليوم بالفعل.', 409, 'ATTENDANCE_ALREADY_CHECKED_OUT', { attendance: existing });
    await pool.request()
        .input('id', sql.Int, existing.id)
        .input('source', sql.VarChar(10), resolved.source)
        .query(`UPDATE dbo.gym_attendance
                SET check_out_at = SYSUTCDATETIME(), check_out_source = @source, updated_at = SYSUTCDATETIME()
                WHERE id = @id;`);
    const attendance = await getAttendanceRecordForDate(pool, resolved.member.id, resolved.today);
    return { attendance, message: `تم تسجيل انصراف ${resolved.member.full_name} بنجاح.` };
}

async function getMemberAttendance(memberId, options = {}) {
    await ensureAttendanceTable();
    await reconcileAutoCheckout();
    const id = ensureId(memberId, 'معرّف العضو');
    const pool = await getPool();
    const from = parseDateOnly(options.from || `${todayInTimeZone().slice(0, 7)}-01`, 'تاريخ البداية');
    const to = parseDateOnly(options.to || todayInTimeZone(), 'تاريخ النهاية');
    if (from > to) throw appError('تاريخ البداية يجب أن يكون قبل تاريخ النهاية.');
    const result = await pool.request()
        .input('memberId', sql.Int, id)
        .input('fromDate', sql.Date, toUtcDate(from))
        .input('toDate', sql.Date, toUtcDate(to))
        .query(`SELECT a.id, a.member_id, a.membership_id, a.attendance_date,
                       a.check_in_at, a.check_out_at, a.check_in_source, a.check_out_source,
                       a.notes, m.full_name, m.phone,
                       ms.membership_plan, ms.membership_type
                FROM dbo.gym_attendance AS a
                INNER JOIN dbo.members AS m ON m.id = a.member_id
                OUTER APPLY (
                    SELECT TOP 1 x.membership_plan, x.membership_type FROM dbo.memberships AS x WHERE x.id = a.membership_id
                ) AS ms
                WHERE a.member_id = @memberId AND a.attendance_date BETWEEN @fromDate AND @toDate
                ORDER BY a.attendance_date DESC, a.check_in_at DESC;`);
    return { from, to, records: result.recordset.map(mapAttendance) };
}

async function getAttendanceReport(options = {}) {
    await ensureAttendanceTable();
    const pool = await getPool();
    await reconcileAutoCheckout(pool);
    const today = todayInTimeZone();
    const from = parseDateOnly(options.from || addDays(today, -29), 'تاريخ البداية');
    const to = parseDateOnly(options.to || today, 'تاريخ النهاية');
    if (from > to) throw appError('تاريخ البداية يجب أن يكون قبل تاريخ النهاية.');
    if (differenceInDays(from, to) > 366) throw appError('أقصى فترة لتقرير الحضور هي 366 يومًا.');

    const baseRequest = () => pool.request()
        .input('fromDate', sql.Date, toUtcDate(from))
        .input('toDate', sql.Date, toUtcDate(to));
    const [recordsResult, absentResult] = await Promise.all([
        baseRequest().query(`
            SELECT a.id, a.member_id, a.membership_id, a.attendance_date,
                   a.check_in_at, a.check_out_at, a.check_in_source, a.check_out_source,
                   a.notes, m.full_name, m.phone,
                   ms.membership_plan, ms.membership_type
            FROM dbo.gym_attendance AS a
            INNER JOIN dbo.members AS m ON m.id = a.member_id
            OUTER APPLY (
                SELECT TOP 1 x.membership_plan, x.membership_type
                FROM dbo.memberships AS x WHERE x.id = a.membership_id
            ) AS ms
            WHERE a.attendance_date BETWEEN @fromDate AND @toDate
            ORDER BY a.attendance_date DESC, a.check_in_at DESC, a.id DESC;
        `),
        baseRequest().query(`
            WITH ranked_memberships AS (
                SELECT ms.id, ms.member_id, ms.start_date, ms.end_date,
                       ROW_NUMBER() OVER (PARTITION BY ms.member_id ORDER BY ms.end_date DESC, ms.id DESC) AS membership_rank
                FROM dbo.memberships AS ms
                WHERE ms.start_date <= @toDate AND ms.end_date >= @fromDate
            )
            SELECT m.id AS member_id, m.full_name, m.phone, r.end_date
            FROM dbo.members AS m
            INNER JOIN ranked_memberships AS r ON r.member_id = m.id AND r.membership_rank = 1
            WHERE NOT EXISTS (
                SELECT 1 FROM dbo.gym_attendance AS a
                WHERE a.member_id = m.id AND a.attendance_date BETWEEN @fromDate AND @toDate
            )
              AND NOT EXISTS (
                SELECT 1 FROM dbo.membership_freezes AS f
                WHERE f.membership_id = r.id
                  AND f.resumed_date IS NULL
                  AND @toDate BETWEEN f.start_date AND f.end_date
            )
            ORDER BY m.full_name ASC;
        `)
    ]);

    const records = recordsResult.recordset.map(mapAttendance);
    const dailyMap = new Map();
    const memberMap = new Map();
    records.forEach((record) => {
        const day = record.attendanceDate;
        const daily = dailyMap.get(day) || { date: day, visits: 0, uniqueMembers: new Set(), checkedOut: 0 };
        daily.visits += 1;
        daily.uniqueMembers.add(record.memberId);
        if (record.checkOutAt) daily.checkedOut += 1;
        dailyMap.set(day, daily);

        const member = memberMap.get(record.memberId) || {
            memberId: record.memberId,
            fullName: record.memberName,
            phone: record.phone,
            visits: 0,
            checkedOut: 0,
            totalMinutes: 0,
            lastVisitDate: record.attendanceDate
        };
        member.visits += 1;
        if (record.checkOutAt) member.checkedOut += 1;
        member.totalMinutes += Number(record.durationMinutes || 0);
        if (record.attendanceDate > member.lastVisitDate) member.lastVisitDate = record.attendanceDate;
        memberMap.set(record.memberId, member);
    });

    const members = [...memberMap.values()]
        .map((member) => ({ ...member, averageMinutes: member.checkedOut ? Math.round(member.totalMinutes / member.checkedOut) : null }))
        .sort((first, second) => second.visits - first.visits || first.fullName.localeCompare(second.fullName));
    const daily = [...dailyMap.values()]
        .map((item) => ({ ...item, uniqueMembers: item.uniqueMembers.size }))
        .sort((first, second) => second.date.localeCompare(first.date));
    const totalMinutes = records.reduce((sum, record) => sum + Number(record.durationMinutes || 0), 0);
    return {
        from,
        to,
        autoCheckoutMinutes: getAutoCheckoutMinutes(),
        summary: {
            totalVisits: records.length,
            uniqueMembers: memberMap.size,
            checkedIn: records.filter((record) => !record.checkOutAt).length,
            checkedOut: records.filter((record) => Boolean(record.checkOutAt)).length,
            averageMinutes: records.filter((record) => record.durationMinutes != null).length
                ? Math.round(totalMinutes / records.filter((record) => record.durationMinutes != null).length)
                : null,
            absentMembers: absentResult.recordset.length
        },
        daily,
        members,
        absentMembers: absentResult.recordset.map((row) => ({
            memberId: Number(row.member_id),
            fullName: row.full_name,
            phone: row.phone,
            membershipEndDate: formatDateOnly(row.end_date)
        }))
    };
}

module.exports = {
    checkIn,
    checkOut,
    ensureAttendanceTable,
    getAttendanceReport,
    getAutoCheckoutMinutes,
    getMemberAttendanceStatuses,
    getMemberAttendance,
    getTodayAttendance,
    reconcileAutoCheckout
};
