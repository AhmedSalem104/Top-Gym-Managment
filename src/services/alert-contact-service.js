'use strict';

const { getPool, sql } = require('../database');

const ALERT_KINDS = new Set(['membership', 'debt', 'inactive']);
const CONTACT_STATUSES = new Set(['opened', 'sent']);

let alertContactTablesPromise;

function appError(message, statusCode = 400) {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.expose = true;
    return error;
}

function ensurePositiveId(value) {
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0) throw appError('معرّف العضو غير صالح.');
    return id;
}

function normalizeKind(value) {
    const kind = String(value || '').trim().toLowerCase();
    if (!ALERT_KINDS.has(kind)) throw appError('نوع التنبيه غير صالح.');
    return kind;
}

function normalizeStatus(value) {
    const status = String(value || '').trim().toLowerCase();
    if (!CONTACT_STATUSES.has(status)) throw appError('حالة التواصل غير صالحة.');
    return status;
}

function normalizeAlertKey(value) {
    const key = String(value || '').trim();
    if (!key || key.length > 255) throw appError('بيانات التنبيه غير صالحة.');
    return key;
}

function formatAmount(value) {
    return Number(value || 0).toFixed(2);
}

/**
 * The key intentionally excludes values that change every day, such as
 * daysRemaining. It changes only when the underlying alert meaning changes.
 */
function buildAlertKey(alert = {}) {
    const memberId = ensurePositiveId(alert.id || alert.memberId);
    const kind = normalizeKind(alert.alertKind || alert.kind);
    const membership = alert.membership || {};

    if (kind === 'membership') {
        return [
            'membership',
            membership.id || 'none',
            membership.status || 'unknown',
            membership.effectiveEndDate || membership.endDate || 'none',
            membership.freezeEnd || 'none'
        ].join(':');
    }

    if (kind === 'debt') {
        return [
            'debt',
            membership.id || 'none',
            formatAmount(membership.amountRemaining)
        ].join(':');
    }

    return [
        'inactive',
        alert.lastVisitDate || 'never'
    ].join(':');
}

function compositeKey(memberId, alertKind, alertKey) {
    return `${Number(memberId)}:${String(alertKind)}:${String(alertKey)}`;
}

function mapContact(row) {
    if (!row) return null;
    return {
        status: row.status,
        openedAt: row.opened_at || null,
        sentAt: row.sent_at || null,
        sendCount: Number(row.send_count || 0),
        lastUpdatedAt: row.updated_at || null
    };
}

async function ensureAlertContactTables() {
    if (!alertContactTablesPromise) {
        alertContactTablesPromise = (async () => {
            const pool = await getPool();
            await pool.request().batch(`
                IF OBJECT_ID(N'dbo.gym_alert_communications', N'U') IS NULL
                BEGIN
                    CREATE TABLE dbo.gym_alert_communications (
                        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_alert_communications PRIMARY KEY,
                        member_id INT NOT NULL,
                        channel VARCHAR(20) NOT NULL CONSTRAINT DF_gym_alert_communications_channel DEFAULT ('whatsapp'),
                        alert_kind VARCHAR(20) NOT NULL,
                        alert_key NVARCHAR(255) NOT NULL,
                        status VARCHAR(20) NOT NULL CONSTRAINT DF_gym_alert_communications_status DEFAULT ('opened'),
                        opened_at DATETIME2(0) NULL,
                        sent_at DATETIME2(0) NULL,
                        send_count INT NOT NULL CONSTRAINT DF_gym_alert_communications_send_count DEFAULT (0),
                        created_by_user_id INT NULL,
                        last_action_user_id INT NULL,
                        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_alert_communications_created DEFAULT (SYSUTCDATETIME()),
                        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_alert_communications_updated DEFAULT (SYSUTCDATETIME()),
                        CONSTRAINT FK_gym_alert_communications_member FOREIGN KEY (member_id)
                            REFERENCES dbo.members(id) ON DELETE CASCADE,
                        CONSTRAINT CK_gym_alert_communications_channel CHECK (channel IN ('whatsapp')),
                        CONSTRAINT CK_gym_alert_communications_kind CHECK (alert_kind IN ('membership', 'debt', 'inactive')),
                        CONSTRAINT CK_gym_alert_communications_status CHECK (status IN ('opened', 'sent'))
                    );
                END;
                IF NOT EXISTS (
                    SELECT 1 FROM sys.indexes
                    WHERE name = N'UQ_gym_alert_communications_identity'
                      AND object_id = OBJECT_ID(N'dbo.gym_alert_communications')
                )
                BEGIN
                    CREATE UNIQUE INDEX UQ_gym_alert_communications_identity
                        ON dbo.gym_alert_communications(member_id, channel, alert_kind, alert_key);
                END;
                IF NOT EXISTS (
                    SELECT 1 FROM sys.indexes
                    WHERE name = N'IX_gym_alert_communications_member_updated'
                      AND object_id = OBJECT_ID(N'dbo.gym_alert_communications')
                )
                BEGIN
                    CREATE INDEX IX_gym_alert_communications_member_updated
                        ON dbo.gym_alert_communications(member_id, updated_at DESC, id DESC);
                END;
            `);
        })().catch((error) => {
            alertContactTablesPromise = undefined;
            throw error;
        });
    }
    return alertContactTablesPromise;
}

async function getLatestForAlerts(alerts = []) {
    await ensureAlertContactTables();
    const normalizedAlerts = Array.isArray(alerts) ? alerts : [];
    const memberIds = [...new Set(normalizedAlerts.map((alert) => {
        try { return ensurePositiveId(alert?.id || alert?.memberId); } catch (_) { return null; }
    }).filter(Boolean))];
    const contacts = new Map();
    if (!memberIds.length) return contacts;

    const pool = await getPool();
    const request = pool.request();
    const parameters = memberIds.map((memberId, index) => {
        const name = `memberId${index}`;
        request.input(name, sql.Int, memberId);
        return `@${name}`;
    });
    const result = await request.query(`
        SELECT member_id, alert_kind, alert_key, status,
               opened_at, sent_at, send_count, updated_at
        FROM dbo.gym_alert_communications
        WHERE channel = 'whatsapp'
          AND member_id IN (${parameters.join(', ')});
    `);
    (result.recordset || []).forEach((row) => {
        contacts.set(
            compositeKey(row.member_id, row.alert_kind, row.alert_key),
            mapContact(row)
        );
    });
    return contacts;
}

async function mark(memberId, payload = {}, userId = null) {
    const normalizedMemberId = ensurePositiveId(memberId);
    const alertKind = normalizeKind(payload.alertKind || payload.kind);
    const alertKey = normalizeAlertKey(payload.alertKey);
    const status = normalizeStatus(payload.status);
    const normalizedUserId = Number.isInteger(Number(userId)) && Number(userId) > 0 ? Number(userId) : null;
    await ensureAlertContactTables();

    const pool = await getPool();
    const memberCheck = await pool.request()
        .input('memberId', sql.Int, normalizedMemberId)
        .query('SELECT TOP (1) id FROM dbo.members WHERE id = @memberId;');
    if (!memberCheck.recordset[0]) throw appError('العضو غير موجود.', 404);

    const result = await pool.request()
        .input('memberId', sql.Int, normalizedMemberId)
        .input('channel', sql.VarChar(20), 'whatsapp')
        .input('alertKind', sql.VarChar(20), alertKind)
        .input('alertKey', sql.NVarChar(255), alertKey)
        .input('status', sql.VarChar(20), status)
        .input('userId', sql.Int, normalizedUserId)
        .query(`
            IF EXISTS (
                SELECT 1
                FROM dbo.gym_alert_communications WITH (UPDLOCK, HOLDLOCK)
                WHERE member_id = @memberId
                  AND channel = @channel
                  AND alert_kind = @alertKind
                  AND alert_key = @alertKey
            )
            BEGIN
                UPDATE dbo.gym_alert_communications
                SET status = CASE WHEN @status = 'sent' THEN 'sent' ELSE status END,
                    opened_at = CASE
                        WHEN @status IN ('opened', 'sent') THEN COALESCE(opened_at, SYSUTCDATETIME())
                        ELSE opened_at
                    END,
                    sent_at = CASE WHEN @status = 'sent' THEN SYSUTCDATETIME() ELSE sent_at END,
                    send_count = CASE WHEN @status = 'sent' THEN send_count + 1 ELSE send_count END,
                    last_action_user_id = @userId,
                    updated_at = SYSUTCDATETIME()
                WHERE member_id = @memberId
                  AND channel = @channel
                  AND alert_kind = @alertKind
                  AND alert_key = @alertKey;
            END
            ELSE
            BEGIN
                INSERT INTO dbo.gym_alert_communications
                    (member_id, channel, alert_kind, alert_key, status,
                     opened_at, sent_at, send_count, created_by_user_id, last_action_user_id)
                VALUES
                    (@memberId, @channel, @alertKind, @alertKey, @status,
                     SYSUTCDATETIME(), CASE WHEN @status = 'sent' THEN SYSUTCDATETIME() ELSE NULL END,
                     CASE WHEN @status = 'sent' THEN 1 ELSE 0 END, @userId, @userId);
            END;

            SELECT TOP (1) status, opened_at, sent_at, send_count, updated_at
            FROM dbo.gym_alert_communications
            WHERE member_id = @memberId
              AND channel = @channel
              AND alert_kind = @alertKind
              AND alert_key = @alertKey;
        `);

    return {
        memberId: normalizedMemberId,
        alertKind,
        alertKey,
        contact: mapContact(result.recordset[0])
    };
}

module.exports = {
    ALERT_KINDS,
    CONTACT_STATUSES,
    buildAlertKey,
    compositeKey,
    ensureAlertContactTables,
    getLatestForAlerts,
    mark
};
