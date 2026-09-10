'use strict';

const { config } = require('../config/env');
const { getPool, sql: defaultSql } = require('../database');

const NOTIFICATION_TABLE = 'dbo.saas_notifications';
const NOTIFICATION_READ_TABLE = 'dbo.saas_notification_reads';
const NOTIFICATION_SCHEMA_SQL = `
IF OBJECT_ID(N'${NOTIFICATION_TABLE}', N'U') IS NULL
BEGIN
    CREATE TABLE ${NOTIFICATION_TABLE} (
        id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_saas_notifications PRIMARY KEY,
        tenant_id INT NULL,
        audience_role VARCHAR(32) NULL,
        recipient_user_id INT NULL,
        actor_user_id INT NULL,
        type VARCHAR(80) NOT NULL,
        category VARCHAR(80) NOT NULL,
        severity VARCHAR(16) NOT NULL CONSTRAINT DF_saas_notifications_severity DEFAULT ('info'),
        title NVARCHAR(200) NOT NULL,
        message NVARCHAR(2000) NOT NULL,
        action_url NVARCHAR(500) NULL,
        entity_type VARCHAR(80) NULL,
        entity_id BIGINT NULL,
        dedupe_key VARCHAR(180) NOT NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_saas_notifications_created DEFAULT (SYSUTCDATETIME()),
        expires_at DATETIME2(0) NULL,
        CONSTRAINT CK_saas_notifications_severity CHECK (severity IN ('info', 'success', 'warning', 'critical')),
        CONSTRAINT FK_saas_notifications_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.gym_tenants(id) ON DELETE CASCADE,
        CONSTRAINT FK_saas_notifications_recipient FOREIGN KEY (recipient_user_id) REFERENCES dbo.gym_users(id) ON DELETE CASCADE,
        CONSTRAINT FK_saas_notifications_actor FOREIGN KEY (actor_user_id) REFERENCES dbo.gym_users(id) ON DELETE NO ACTION
    );
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_saas_notifications_audience' AND object_id=OBJECT_ID(N'${NOTIFICATION_TABLE}'))
    CREATE INDEX IX_saas_notifications_audience ON ${NOTIFICATION_TABLE}(tenant_id,audience_role,recipient_user_id,created_at DESC,id DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_saas_notifications_dedupe' AND object_id=OBJECT_ID(N'${NOTIFICATION_TABLE}'))
    CREATE INDEX IX_saas_notifications_dedupe ON ${NOTIFICATION_TABLE}(dedupe_key,tenant_id,audience_role,recipient_user_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'UQ_saas_notifications_dedupe_key' AND object_id=OBJECT_ID(N'${NOTIFICATION_TABLE}'))
    CREATE UNIQUE INDEX UQ_saas_notifications_dedupe_key ON ${NOTIFICATION_TABLE}(dedupe_key);

IF OBJECT_ID(N'${NOTIFICATION_READ_TABLE}', N'U') IS NULL
BEGIN
    CREATE TABLE ${NOTIFICATION_READ_TABLE} (
        notification_id BIGINT NOT NULL,
        tenant_id INT NULL,
        user_id INT NOT NULL,
        read_at DATETIME2(0) NOT NULL CONSTRAINT DF_saas_notification_reads_read DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT PK_saas_notification_reads PRIMARY KEY (notification_id,user_id),
        CONSTRAINT FK_saas_notification_reads_notification FOREIGN KEY (notification_id) REFERENCES ${NOTIFICATION_TABLE}(id) ON DELETE CASCADE,
        CONSTRAINT FK_saas_notification_reads_user FOREIGN KEY (user_id) REFERENCES dbo.gym_users(id) ON DELETE CASCADE
    );
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_saas_notification_reads_user' AND object_id=OBJECT_ID(N'${NOTIFICATION_READ_TABLE}'))
    CREATE INDEX IX_saas_notification_reads_user ON ${NOTIFICATION_READ_TABLE}(user_id,tenant_id,read_at,notification_id);
`;

const EVENT_CATALOG = Object.freeze({
    gym_registration_requested: Object.freeze({
        category: 'registration', audience: 'platform-admin', tenantScope: 'platform',
        audienceRole: 'PlatformAdmin', requiredPermission: null, severity: 'info',
        channels: Object.freeze({ inApp: true, email: true, audit: true })
    }),
    trainer_registration_requested: Object.freeze({
        category: 'registration', audience: 'platform-admin', tenantScope: 'platform',
        audienceRole: 'PlatformAdmin', requiredPermission: null, severity: 'info',
        channels: Object.freeze({ inApp: true, email: true, audit: true })
    })
});

const MAX_DEDUPE_ENTRIES = 1_000;
const DEFAULT_DEDUPE_TTL_MS = 24 * 60 * 60 * 1_000;

function boundedText(value, maxLength = 500) {
    return String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, maxLength);
}

function safeActionUrl(value) {
    const candidate = boundedText(value, 500);
    if (candidate.startsWith('/') && !candidate.startsWith('//')) return candidate;
    const publicOrigin = boundedText(config.publicAppUrl, 300).replace(/\/+$/, '');
    if (publicOrigin && (candidate === publicOrigin || candidate.startsWith(`${publicOrigin}/`))) return candidate;
    return '/platform-admin';
}

function positiveId(value, field) {
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0) throw new Error(`${field} must be a positive integer.`);
    return id;
}

function optionalId(value, field) {
    return value == null ? null : positiveId(value, field);
}

function normalizeAmount(value) {
    const amount = Number(value);
    return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : null;
}

function normalizeEvent(input = {}) {
    const type = boundedText(input.type || input.eventType, 80);
    const catalog = EVENT_CATALOG[type];
    if (!catalog) throw new Error(`Unsupported notification event: ${type || 'missing'}.`);
    const entityId = positiveId(input.entityId, 'entityId');
    const payload = input.payload || {};
    const normalizedPayload = Object.freeze({
        registrationType: boundedText(payload.registrationType, 40),
        gymName: boundedText(payload.gymName, 160),
        ownerName: boundedText(payload.ownerName, 120),
        contactEmail: boundedText(payload.contactEmail, 254),
        planName: boundedText(payload.planName, 120),
        amountDue: normalizeAmount(payload.amountDue),
        currency: boundedText(payload.currency || 'EGP', 3).toUpperCase(),
        submittedAt: boundedText(payload.submittedAt, 80),
        actionUrl: safeActionUrl(payload.actionUrl || '/platform-admin')
    });
    return Object.freeze({
        type, category: catalog.category, audience: catalog.audience, tenantScope: catalog.tenantScope,
        audienceRole: catalog.audienceRole, requiredPermission: catalog.requiredPermission,
        severity: catalog.severity, channels: catalog.channels,
        tenantId: optionalId(input.tenantId, 'tenantId'),
        recipientUserId: optionalId(input.recipientUserId, 'recipientUserId'),
        actorUserId: optionalId(input.actorUserId, 'actorUserId'),
        entityType: boundedText(input.entityType || 'notification', 80), entityId,
        title: boundedText(input.title || '', 200), message: boundedText(input.message || '', 2_000),
        payload: normalizedPayload,
        dedupeKey: boundedText(input.dedupeKey || `${type}:${input.tenantId == null ? 'platform' : `tenant-${input.tenantId}`}:${input.recipientUserId == null ? catalog.audienceRole : `user-${input.recipientUserId}`}:${entityId}`, 180),
        auditDetails: boundedText(input.auditDetails || 'Business event emitted.', 2_000),
        expiresAt: input.expiresAt || null
    });
}

function htmlEscape(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[character]));
}

function registrationTypeLabel(value) {
    return value === 'independent_trainer' ? 'Independent Trainer' : 'Gym';
}

function registrationTitle(event) {
    return `طلب تسجيل ${registrationTypeLabel(event.payload.registrationType)} جديد`;
}

function registrationMessage(event) {
    const payload = event.payload;
    return `${payload.gymName || 'طلب جديد'} مقدم من ${payload.ownerName || 'متقدم'} ويحتاج إلى مراجعة إدارة المنصة.`;
}

function buildRegistrationEmail(event, publicAppUrl = '') {
    const payload = event.payload;
    const typeLabel = registrationTypeLabel(payload.registrationType);
    const actionUrl = payload.actionUrl || `${String(publicAppUrl || '').replace(/\/+$/, '')}/platform-admin`;
    const subject = `Logic Fit: New ${typeLabel} registration request`;
    const lines = [
        'A new registration request is ready for platform review.',
        `Type: ${typeLabel}`,
        `Business/brand: ${payload.gymName || 'Not provided'}`,
        `Applicant: ${payload.ownerName || 'Not provided'}`,
        `Contact email: ${payload.contactEmail || 'Not provided'}`,
        `Plan: ${payload.planName || 'Not provided'}`,
        `Amount due: ${payload.amountDue == null ? 'Not provided' : `${payload.amountDue.toFixed(2)} ${payload.currency}`}`,
        `Submitted at: ${payload.submittedAt || 'Not provided'}`,
        `Review: ${actionUrl}`
    ];
    const html = `<p>A new registration request is ready for platform review.</p><dl>${[
        ['Type', typeLabel], ['Business/brand', payload.gymName || 'Not provided'],
        ['Applicant', payload.ownerName || 'Not provided'], ['Contact email', payload.contactEmail || 'Not provided'],
        ['Plan', payload.planName || 'Not provided'],
        ['Amount due', payload.amountDue == null ? 'Not provided' : `${payload.amountDue.toFixed(2)} ${payload.currency}`],
        ['Submitted at', payload.submittedAt || 'Not provided']
    ].map(([label, value]) => `<dt>${htmlEscape(label)}</dt><dd>${htmlEscape(value)}</dd>`).join('')}</dl><p><a href="${htmlEscape(actionUrl)}">Open the registration review queue</a></p>`;
    return { subject, text: lines.join('\n'), html };
}

function sameNullable(value, parameter) {
    return `((${parameter} IS NULL AND ${value} IS NULL) OR ${value}=${parameter})`;
}

function createNotificationService({
    auditService = null, emailService = null, logger = console,
    publicAppUrl = config.publicAppUrl, now = () => Date.now(),
    getPool: poolProvider = getPool, sql = defaultSql,
    tablesReady = false, databaseEnabled = false, dedupeTtlMs = DEFAULT_DEDUPE_TTL_MS
} = {}) {
    const completed = new Map();
    const inFlight = new Map();
    let readyPromise = tablesReady ? Promise.resolve(true) : null;

    function pruneDedupe() {
        const cutoff = now() - Math.max(1_000, Number(dedupeTtlMs) || DEFAULT_DEDUPE_TTL_MS);
        for (const [key, timestamp] of completed) if (timestamp < cutoff) completed.delete(key);
        while (completed.size > MAX_DEDUPE_ENTRIES) completed.delete(completed.keys().next().value);
    }

    async function ensureTables({ readOnly = false } = {}) {
        if (readOnly) return false;
        if (!readyPromise) {
            readyPromise = (async () => {
                const pool = await poolProvider();
                await pool.request().batch(NOTIFICATION_SCHEMA_SQL);
                return true;
            })().catch((error) => { readyPromise = null; throw error; });
        }
        return readyPromise;
    }

    function displayFields(event) {
        return {
            title: event.title || (event.type.endsWith('_requested') ? registrationTitle(event) : boundedText(event.type, 200)),
            message: event.message || (event.type.endsWith('_requested') ? registrationMessage(event) : event.auditDetails),
            actionUrl: event.payload.actionUrl || '/platform-admin'
        };
    }

    async function createInApp(event, { executor = null } = {}) {
        if (!event.channels.inApp) return { status: 'skipped', reason: 'not_selected' };
        const connection = executor || await poolProvider();
        const fields = displayFields(event);
        const request = connection.request()
            .input('tenantId', sql.Int, event.tenantId)
            .input('audienceRole', sql.VarChar(32), event.audienceRole)
            .input('recipientUserId', sql.Int, event.recipientUserId)
            .input('actorUserId', sql.Int, event.actorUserId)
            .input('type', sql.VarChar(80), event.type)
            .input('category', sql.VarChar(80), event.category)
            .input('severity', sql.VarChar(16), event.severity)
            .input('title', sql.NVarChar(200), fields.title)
            .input('message', sql.NVarChar(2_000), fields.message)
            .input('actionUrl', sql.NVarChar(500), fields.actionUrl)
            .input('entityType', sql.VarChar(80), event.entityType)
            .input('entityId', sql.BigInt, event.entityId)
            .input('dedupeKey', sql.VarChar(180), event.dedupeKey)
            .input('expiresAt', sql.DateTime2(0), event.expiresAt ? new Date(event.expiresAt) : null);
        const result = await request.query(`
            IF NOT EXISTS (
                SELECT 1 FROM ${NOTIFICATION_TABLE} WITH (UPDLOCK,HOLDLOCK)
                WHERE dedupe_key=@dedupeKey
                  AND ${sameNullable('tenant_id', '@tenantId')}
                  AND ${sameNullable('audience_role', '@audienceRole')}
                  AND ${sameNullable('recipient_user_id', '@recipientUserId')}
            )
            BEGIN
                INSERT INTO ${NOTIFICATION_TABLE}
                    (tenant_id,audience_role,recipient_user_id,actor_user_id,type,category,severity,title,message,action_url,entity_type,entity_id,dedupe_key,expires_at)
                VALUES
                    (@tenantId,@audienceRole,@recipientUserId,@actorUserId,@type,@category,@severity,@title,@message,@actionUrl,@entityType,@entityId,@dedupeKey,@expiresAt);
            END;
            SELECT TOP (1) id FROM ${NOTIFICATION_TABLE}
            WHERE dedupe_key=@dedupeKey
              AND ${sameNullable('tenant_id', '@tenantId')}
              AND ${sameNullable('audience_role', '@audienceRole')}
              AND ${sameNullable('recipient_user_id', '@recipientUserId')}
            ORDER BY id DESC;
        `);
        return { status: 'recorded', notificationId: Number(result.recordset?.[0]?.id || 0) || null };
    }

    async function recordEvent(input, { executor = null } = {}) {
        const event = normalizeEvent(input);
        if (event.channels.audit && auditService?.recordAudit) {
            await auditService.recordAudit({ tenantId: event.tenantId, actorUserId: event.actorUserId, action: event.type, entityType: event.entityType, entityId: event.entityId, details: event.auditDetails, executor });
        }
        // Registration callers pass their business transaction here, making
        // the in-app row atomic with the request and still post-commit for email.
        if (event.channels.inApp && databaseEnabled && executor) await createInApp(event, { executor });
        return event;
    }

    async function dispatchChannel(event, channel, callback) {
        if (!callback) return { status: 'skipped', reason: 'not_configured' };
        try { return await callback(event); } catch (_) {
            try { logger.warn('[NOTIFICATION_CHANNEL_FAILED]', { eventType: event.type, channel }); } catch (_) { /* best effort */ }
            return { status: 'failed', reason: 'channel_failed' };
        }
    }

    async function dispatchEvent(input) {
        const event = normalizeEvent(input);
        pruneDedupe();
        const cachedAt = completed.get(event.dedupeKey);
        if (cachedAt && cachedAt >= now() - Math.max(1_000, Number(dedupeTtlMs) || DEFAULT_DEDUPE_TTL_MS)) return { eventType: event.type, dedupeKey: event.dedupeKey, deduplicated: true, channels: {} };
        if (inFlight.has(event.dedupeKey)) return inFlight.get(event.dedupeKey);
        const delivery = (async () => {
            const channels = {
                audit: { status: 'recorded' },
                inApp: event.channels.inApp ? { status: 'already_recorded' } : { status: 'skipped', reason: 'not_selected' },
                email: event.channels.email
                    ? await dispatchChannel(event, 'email', emailService?.send ? (item) => emailService.send({ ...item, email: buildRegistrationEmail(item, publicAppUrl) }) : null)
                    : { status: 'skipped', reason: 'not_selected' }
            };
            if (channels.email.status !== 'failed') completed.set(event.dedupeKey, now());
            return { eventType: event.type, dedupeKey: event.dedupeKey, deduplicated: false, channels };
        })();
        inFlight.set(event.dedupeKey, delivery);
        try { return await delivery; } finally { inFlight.delete(event.dedupeKey); }
    }

    async function listForUser({ userId, role, tenantId = null, page = 1, pageSize = 20, unreadOnly = false, category = '' } = {}) {
        const safeUserId = positiveId(userId, 'userId');
        const safePage = Math.min(10_000, Math.max(1, Number(page) || 1));
        const safePageSize = Math.min(50, Math.max(1, Number(pageSize) || 20));
        const offset = (safePage - 1) * safePageSize;
        const normalizedRole = boundedText(role, 32);
        const normalizedCategory = boundedText(category, 80);
        const pool = await poolProvider();
        const request = pool.request()
            .input('userId', sql.Int, safeUserId)
            .input('role', sql.VarChar(32), normalizedRole)
            .input('tenantId', sql.Int, tenantId == null ? null : positiveId(tenantId, 'tenantId'))
            .input('offset', sql.Int, offset)
            .input('pageSize', sql.Int, safePageSize)
            .input('unreadOnly', sql.Bit, unreadOnly ? 1 : 0)
            .input('category', sql.VarChar(80), normalizedCategory);
        const result = await request.query(`
            WITH visible AS (
                SELECT n.id,n.tenant_id,n.type,n.category,n.severity,n.title,n.message,n.action_url,n.entity_type,n.entity_id,n.created_at,
                    CASE WHEN r.notification_id IS NULL THEN CAST(0 AS BIT) ELSE CAST(1 AS BIT) END AS is_read
                FROM ${NOTIFICATION_TABLE} n
                LEFT JOIN ${NOTIFICATION_READ_TABLE} r ON r.notification_id=n.id AND r.user_id=@userId
                WHERE (n.recipient_user_id=@userId OR (n.recipient_user_id IS NULL AND n.audience_role=@role))
                  AND ((n.tenant_id=@tenantId) OR (n.tenant_id IS NULL AND @role='PlatformAdmin'))
                  AND (n.expires_at IS NULL OR n.expires_at>SYSUTCDATETIME())
                  AND (@category='' OR n.category=@category)
            )
            SELECT id,tenant_id,type,category,severity,title,message,action_url,entity_type,entity_id,created_at,is_read,
                COUNT_BIG(*) OVER() AS total_count
            FROM visible
            WHERE @unreadOnly=0 OR is_read=0
            ORDER BY created_at DESC,id DESC
            OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;
        `);
        const rows = result.recordset || [];
        return {
            notifications: rows.map((row) => ({
                id: Number(row.id), tenantId: row.tenant_id == null ? null : Number(row.tenant_id),
                type: row.type, category: row.category, severity: row.severity, title: row.title,
                message: row.message, actionUrl: row.action_url || null, entityType: row.entity_type || null,
                entityId: row.entity_id == null ? null : Number(row.entity_id), createdAt: row.created_at,
                read: Boolean(row.is_read)
            })),
            pagination: { page: safePage, pageSize: safePageSize, total: Number(rows[0]?.total_count || 0), hasNext: offset + rows.length < Number(rows[0]?.total_count || 0) }
        };
    }

    async function unreadCount(options = {}) {
        const data = await listForUser({ ...options, page: 1, pageSize: 1, unreadOnly: true });
        return data.pagination.total;
    }

    async function markRead({ userId, role, tenantId = null, notificationId } = {}) {
        const id = positiveId(notificationId, 'notificationId');
        const safeTenantId = tenantId == null ? null : positiveId(tenantId, 'tenantId');
        const pool = await poolProvider();
        const request = pool.request().input('userId', sql.Int, positiveId(userId, 'userId')).input('role', sql.VarChar(32), boundedText(role, 32)).input('tenantId', sql.Int, safeTenantId).input('notificationId', sql.BigInt, id);
        const result = await request.query(`
            IF EXISTS (
                SELECT 1 FROM ${NOTIFICATION_TABLE} n
                WHERE n.id=@notificationId
                  AND (n.recipient_user_id=@userId OR (n.recipient_user_id IS NULL AND n.audience_role=@role))
                  AND ((n.tenant_id=@tenantId) OR (n.tenant_id IS NULL AND @role='PlatformAdmin'))
            )
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM ${NOTIFICATION_READ_TABLE} WHERE notification_id=@notificationId AND user_id=@userId)
                    INSERT INTO ${NOTIFICATION_READ_TABLE}(notification_id,tenant_id,user_id) SELECT id,tenant_id,@userId FROM ${NOTIFICATION_TABLE} WHERE id=@notificationId;
                SELECT 1 AS changed;
            END
            ELSE SELECT 0 AS changed;
        `);
        if (Number(result.recordset?.[0]?.changed) !== 1) { const error = new Error('Notification not found.'); error.statusCode = 404; error.expose = true; error.code = 'NOTIFICATION_NOT_FOUND'; throw error; }
        return { read: true };
    }

    async function markAllRead({ userId, role, tenantId = null } = {}) {
        const safeUserId = positiveId(userId, 'userId');
        const pool = await poolProvider();
        const request = pool.request().input('userId', sql.Int, safeUserId).input('role', sql.VarChar(32), boundedText(role, 32)).input('tenantId', sql.Int, tenantId == null ? null : positiveId(tenantId, 'tenantId'));
        const result = await request.query(`
            INSERT INTO ${NOTIFICATION_READ_TABLE}(notification_id,tenant_id,user_id)
            SELECT n.id,n.tenant_id,@userId FROM ${NOTIFICATION_TABLE} n
            WHERE (n.recipient_user_id=@userId OR (n.recipient_user_id IS NULL AND n.audience_role=@role))
              AND ((n.tenant_id=@tenantId) OR (n.tenant_id IS NULL AND @role='PlatformAdmin'))
              AND (n.expires_at IS NULL OR n.expires_at>SYSUTCDATETIME())
              AND NOT EXISTS (SELECT 1 FROM ${NOTIFICATION_READ_TABLE} r WHERE r.notification_id=n.id AND r.user_id=@userId);
            SELECT @@ROWCOUNT AS changed;
        `);
        return { read: true, changed: Number(result.recordset?.[0]?.changed || 0) };
    }

    async function publish(input) {
        const event = await recordEvent(input);
        if (event.channels.inApp && databaseEnabled) await createInApp(event);
        return { event, delivery: await dispatchEvent(event) };
    }

    return Object.freeze({ catalog: EVENT_CATALOG, ensureTables, recordEvent, createInApp, dispatchEvent, publish, listForUser, unreadCount, markRead, markAllRead });
}

module.exports = {
    DEFAULT_DEDUPE_TTL_MS, EVENT_CATALOG, NOTIFICATION_READ_TABLE, NOTIFICATION_SCHEMA_SQL,
    NOTIFICATION_TABLE, buildRegistrationEmail, createNotificationService, normalizeEvent
};
