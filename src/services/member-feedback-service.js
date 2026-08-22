'use strict';

const { getPool, sql } = require('../database');
const membershipCodeService = require('./membership-code-service');
const { addDays, parseDateOnly, toUtcDate } = require('../utils/date');

const NOTE_TYPES = Object.freeze({
    GENERAL: 'general',
    PROBLEM: 'problem',
    COMPLAINT: 'complaint',
    SUGGESTION: 'suggestion',
    FEATURE_REQUEST: 'feature_request'
});
const NOTE_TYPE_VALUES = new Set(Object.values(NOTE_TYPES));
const MAX_MESSAGE_LENGTH = 4000;
let storagePromise;

function appError(message, statusCode = 400, code = null) {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.expose = true;
    if (code) error.code = code;
    return error;
}

function normalizeRating(value) {
    const rating = Number(value);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        throw appError('التقييم يجب أن يكون من نجمة إلى 5 نجوم.', 400, 'INVALID_FEEDBACK_RATING');
    }
    return rating;
}

function normalizeNoteType(value) {
    const noteType = String(value || '').trim().toLowerCase();
    if (!NOTE_TYPE_VALUES.has(noteType)) {
        throw appError('نوع الملاحظة غير صالح.', 400, 'INVALID_FEEDBACK_TYPE');
    }
    return noteType;
}

function normalizeMessage(value) {
    const message = String(value || '').trim();
    if (message.length < 3) throw appError('اكتب ملاحظتك قبل إرسال التقييم.', 400, 'FEEDBACK_MESSAGE_REQUIRED');
    if (message.length > MAX_MESSAGE_LENGTH) throw appError(`الحد الأقصى للتقييم ${MAX_MESSAGE_LENGTH} حرف.`, 400, 'FEEDBACK_MESSAGE_TOO_LONG');
    return message;
}

function normalizePage(value, fallback = 1) {
    const page = Number(value);
    return Number.isInteger(page) && page > 0 ? Math.min(page, 100000) : fallback;
}

function normalizePageSize(value, fallback = 10) {
    const pageSize = Number(value);
    return Number.isInteger(pageSize) && pageSize > 0 ? Math.min(pageSize, 100) : fallback;
}

function escapeLike(value) {
    return String(value || '').replace(/[\\%_\[]/g, '\\$&');
}

async function ensureMemberFeedbackTable() {
    if (!storagePromise) {
        storagePromise = (async () => {
            const pool = await getPool();
            await pool.request().batch(`
                IF OBJECT_ID(N'dbo.gym_member_feedback', N'U') IS NULL
                BEGIN
                    CREATE TABLE dbo.gym_member_feedback (
                        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_member_feedback PRIMARY KEY,
                        member_id INT NOT NULL,
                        rating TINYINT NOT NULL,
                        note_type VARCHAR(32) NOT NULL,
                        message NVARCHAR(4000) NOT NULL,
                        submitted_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_member_feedback_submitted DEFAULT (SYSUTCDATETIME()),
                        CONSTRAINT FK_gym_member_feedback_member FOREIGN KEY (member_id)
                            REFERENCES dbo.members(id) ON DELETE CASCADE,
                        CONSTRAINT CK_gym_member_feedback_rating CHECK (rating BETWEEN 1 AND 5),
                        CONSTRAINT CK_gym_member_feedback_note_type CHECK (note_type IN ('general', 'problem', 'complaint', 'suggestion', 'feature_request'))
                    );
                END;
                IF NOT EXISTS (
                    SELECT 1 FROM sys.indexes
                    WHERE name = N'IX_gym_member_feedback_submitted'
                      AND object_id = OBJECT_ID(N'dbo.gym_member_feedback')
                )
                    CREATE INDEX IX_gym_member_feedback_submitted
                        ON dbo.gym_member_feedback(submitted_at DESC, id DESC);
                IF NOT EXISTS (
                    SELECT 1 FROM sys.indexes
                    WHERE name = N'IX_gym_member_feedback_member'
                      AND object_id = OBJECT_ID(N'dbo.gym_member_feedback')
                )
                    CREATE INDEX IX_gym_member_feedback_member
                        ON dbo.gym_member_feedback(member_id, submitted_at DESC, id DESC);
            `);
        })().catch((error) => {
            storagePromise = undefined;
            throw error;
        });
    }
    return storagePromise;
}

function mapFeedback(row) {
    return {
        id: Number(row.id),
        memberId: Number(row.member_id),
        memberName: row.full_name,
        phone: row.phone,
        rating: Number(row.rating),
        noteType: row.note_type,
        message: row.message,
        submittedAt: row.submitted_at
    };
}

async function submitFromPortal({ membershipCode, rating, noteType, message, request } = {}) {
    await ensureMemberFeedbackTable();
    const normalizedRating = normalizeRating(rating);
    const normalizedNoteType = normalizeNoteType(noteType);
    const normalizedMessage = normalizeMessage(message);
    const memberId = await membershipCodeService.findMemberIdByCode(membershipCode, { request });
    if (!memberId) {
        throw appError('كود العضوية غير صحيح أو منتهي الصلاحية.', 404, 'MEMBERSHIP_PORTAL_CODE_INVALID');
    }

    const pool = await getPool();
    const result = await pool.request()
        .input('memberId', sql.Int, memberId)
        .input('rating', sql.TinyInt, normalizedRating)
        .input('noteType', sql.VarChar(32), normalizedNoteType)
        .input('message', sql.NVarChar(4000), normalizedMessage)
        .query(`
            INSERT INTO dbo.gym_member_feedback (member_id, rating, note_type, message)
            OUTPUT INSERTED.id, INSERTED.rating, INSERTED.note_type, INSERTED.submitted_at
            VALUES (@memberId, @rating, @noteType, @message);
        `);
    const row = result.recordset[0];
    return {
        success: true,
        feedback: {
            id: Number(row.id),
            rating: Number(row.rating),
            noteType: row.note_type,
            submittedAt: row.submitted_at
        }
    };
}

function normalizeFilters(query = {}) {
    const filters = [];
    const params = {};
    const ratingText = String(query.rating || '').trim();
    if (ratingText) {
        params.rating = normalizeRating(ratingText);
        filters.push('f.rating = @rating');
    }
    const noteTypeText = String(query.noteType || '').trim();
    if (noteTypeText) {
        params.noteType = normalizeNoteType(noteTypeText);
        filters.push('f.note_type = @noteType');
    }
    const search = String(query.search || '').trim().slice(0, 120);
    if (search) {
        params.search = `%${escapeLike(search)}%`;
        filters.push(`(m.full_name LIKE @search ESCAPE '\\' OR m.phone LIKE @search ESCAPE '\\')`);
    }
    const fromText = String(query.from || '').trim();
    if (fromText) {
        params.from = parseDateOnly(fromText, 'تاريخ البداية');
        filters.push('f.submitted_at >= @fromDate');
    }
    const toText = String(query.to || '').trim();
    if (toText) {
        params.to = parseDateOnly(toText, 'تاريخ النهاية');
        filters.push('f.submitted_at < @nextDate');
    }
    if (params.from && params.to && params.from > params.to) {
        throw appError('تاريخ البداية يجب أن يسبق تاريخ النهاية.');
    }
    return { filters, params };
}

async function list(query = {}) {
    await ensureMemberFeedbackTable();
    const page = normalizePage(query.page);
    const pageSize = normalizePageSize(query.pageSize);
    const offset = (page - 1) * pageSize;
    const { filters, params } = normalizeFilters(query);
    const where = filters.length ? filters.join('\n AND ') : '1 = 1';
    const pool = await getPool();
    const request = pool.request()
        .input('offsetRows', sql.Int, offset)
        .input('pageSize', sql.Int, pageSize);
    if (params.rating !== undefined) request.input('rating', sql.TinyInt, params.rating);
    if (params.noteType) request.input('noteType', sql.VarChar(32), params.noteType);
    if (params.search) request.input('search', sql.NVarChar(140), params.search);
    if (params.from) request.input('fromDate', sql.Date, toUtcDate(params.from));
    if (params.to) request.input('nextDate', sql.Date, toUtcDate(addDays(params.to, 1)));

    const result = await request.batch(`
        SELECT COUNT_BIG(1) AS total
        FROM dbo.gym_member_feedback AS f
        INNER JOIN dbo.members AS m ON m.id = f.member_id
        WHERE ${where};

        SELECT f.id, f.member_id, m.full_name, m.phone,
               f.rating, f.note_type, f.message, f.submitted_at
        FROM dbo.gym_member_feedback AS f
        INNER JOIN dbo.members AS m ON m.id = f.member_id
        WHERE ${where}
        ORDER BY f.submitted_at DESC, f.id DESC
        OFFSET @offsetRows ROWS FETCH NEXT @pageSize ROWS ONLY;
    `);
    const total = Number(result.recordsets?.[0]?.[0]?.total || 0);
    const feedback = (result.recordsets?.[1] || []).map(mapFeedback);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    return {
        feedback,
        pagination: {
            page,
            pageSize,
            total,
            totalPages,
            hasPrevious: page > 1,
            hasNext: page < totalPages
        }
    };
}

module.exports = {
    MAX_MESSAGE_LENGTH,
    NOTE_TYPES,
    ensureMemberFeedbackTable,
    list,
    submitFromPortal
};
