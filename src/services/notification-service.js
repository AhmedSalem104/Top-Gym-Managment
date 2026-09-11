'use strict';

const { config } = require('../config/env');
const { getPool, sql: defaultSql } = require('../database');

const NOTIFICATION_TABLE = 'dbo.saas_notifications';
const NOTIFICATION_READ_TABLE = 'dbo.saas_notification_reads';
const MEMBER_NOTIFICATION_READ_TABLE = 'dbo.saas_member_notification_reads';
const NOTIFICATION_SCHEMA_SQL = `
IF OBJECT_ID(N'${NOTIFICATION_TABLE}', N'U') IS NULL
BEGIN
    CREATE TABLE ${NOTIFICATION_TABLE} (
        id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_saas_notifications PRIMARY KEY,
        tenant_id INT NULL,
        audience_role VARCHAR(32) NULL,
        recipient_user_id INT NULL,
        recipient_member_id INT NULL,
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
        CONSTRAINT FK_saas_notifications_member_recipient FOREIGN KEY (recipient_member_id) REFERENCES dbo.members(id) ON DELETE NO ACTION,
        CONSTRAINT FK_saas_notifications_actor FOREIGN KEY (actor_user_id) REFERENCES dbo.gym_users(id) ON DELETE NO ACTION
    );
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_saas_notifications_audience' AND object_id=OBJECT_ID(N'${NOTIFICATION_TABLE}'))
    CREATE INDEX IX_saas_notifications_audience ON ${NOTIFICATION_TABLE}(tenant_id,audience_role,recipient_user_id,recipient_member_id,created_at DESC,id DESC);
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

IF OBJECT_ID(N'${MEMBER_NOTIFICATION_READ_TABLE}', N'U') IS NULL
BEGIN
    CREATE TABLE ${MEMBER_NOTIFICATION_READ_TABLE} (
        notification_id BIGINT NOT NULL,
        tenant_id INT NOT NULL,
        member_id INT NOT NULL,
        read_at DATETIME2(0) NOT NULL CONSTRAINT DF_saas_member_notification_reads_read DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT PK_saas_member_notification_reads PRIMARY KEY (notification_id,member_id),
        CONSTRAINT FK_saas_member_notification_reads_notification FOREIGN KEY (notification_id) REFERENCES ${NOTIFICATION_TABLE}(id) ON DELETE CASCADE,
        CONSTRAINT FK_saas_member_notification_reads_member FOREIGN KEY (member_id) REFERENCES dbo.members(id) ON DELETE CASCADE
    );
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_saas_member_notification_reads_member' AND object_id=OBJECT_ID(N'${MEMBER_NOTIFICATION_READ_TABLE}'))
    CREATE INDEX IX_saas_member_notification_reads_member ON ${MEMBER_NOTIFICATION_READ_TABLE}(member_id,tenant_id,read_at,notification_id);
`;

const STAFF_ROLES = Object.freeze(['Owner', 'Assistant']);
const EVENT_CATALOG = Object.freeze({
    gym_registration_requested: Object.freeze({
        category: 'registration', audience: 'platform-admin', tenantScope: 'platform',
        audienceRole: 'PlatformAdmin', audienceRoles: Object.freeze(['PlatformAdmin']), requiredPermission: null, severity: 'info',
        channels: Object.freeze({ inApp: true, email: true, audit: true })
    }),
    trainer_registration_requested: Object.freeze({
        category: 'registration', audience: 'platform-admin', tenantScope: 'platform',
        audienceRole: 'PlatformAdmin', audienceRoles: Object.freeze(['PlatformAdmin']), requiredPermission: null, severity: 'info',
        channels: Object.freeze({ inApp: true, email: true, audit: true })
    }),
    member_created: Object.freeze({
        category: 'membership', audience: 'tenant-staff', tenantScope: 'tenant', audienceRole: 'Owner', audienceRoles: STAFF_ROLES,
        requiredPermission: 'members.read', severity: 'success', channels: Object.freeze({ inApp: true, email: false, audit: true })
    }),
    membership_created: Object.freeze({
        category: 'membership', audience: 'tenant', tenantScope: 'tenant', audienceRole: 'Owner', audienceRoles: Object.freeze([...STAFF_ROLES, 'Member']),
        requiredPermission: 'memberships.read', severity: 'success', channels: Object.freeze({ inApp: true, email: false, audit: true })
    }),
    membership_frozen: Object.freeze({
        category: 'membership', audience: 'tenant', tenantScope: 'tenant', audienceRole: 'Owner', audienceRoles: Object.freeze([...STAFF_ROLES, 'Member']),
        requiredPermission: 'memberships.read', severity: 'warning', channels: Object.freeze({ inApp: true, email: false, audit: true })
    }),
    membership_resumed: Object.freeze({
        category: 'membership', audience: 'tenant', tenantScope: 'tenant', audienceRole: 'Owner', audienceRoles: Object.freeze([...STAFF_ROLES, 'Member']),
        requiredPermission: 'memberships.read', severity: 'success', channels: Object.freeze({ inApp: true, email: false, audit: true })
    }),
    membership_renewed: Object.freeze({
        category: 'membership', audience: 'tenant', tenantScope: 'tenant', audienceRole: 'Owner', audienceRoles: Object.freeze([...STAFF_ROLES, 'Member']),
        requiredPermission: 'memberships.read', severity: 'success', channels: Object.freeze({ inApp: true, email: false, audit: true })
    }),
    membership_updated: Object.freeze({
        category: 'membership', audience: 'tenant', tenantScope: 'tenant', audienceRole: 'Owner', audienceRoles: Object.freeze([...STAFF_ROLES, 'Member']),
        requiredPermission: 'memberships.read', severity: 'info', channels: Object.freeze({ inApp: true, email: false, audit: true })
    }),
    payment_updated: Object.freeze({
        category: 'payment', audience: 'tenant', tenantScope: 'tenant', audienceRole: 'Owner', audienceRoles: Object.freeze([...STAFF_ROLES, 'Member']),
        requiredPermission: 'payments.read', severity: 'success', channels: Object.freeze({ inApp: true, email: false, audit: true })
    }),
    attendance_checked_in: Object.freeze({
        category: 'attendance', audience: 'tenant', tenantScope: 'tenant', audienceRole: 'Owner', audienceRoles: Object.freeze([...STAFF_ROLES, 'Member']),
        requiredPermission: 'attendance.read', severity: 'info', channels: Object.freeze({ inApp: true, email: false, audit: true })
    }),
    attendance_auto_checked_out: Object.freeze({
        category: 'attendance', audience: 'tenant-staff', tenantScope: 'tenant', audienceRole: 'Owner', audienceRoles: STAFF_ROLES,
        requiredPermission: 'attendance.read', severity: 'info', channels: Object.freeze({ inApp: true, email: false, audit: true })
    }),
    member_subscription_request_created: Object.freeze({
        category: 'membership', audience: 'tenant-staff', tenantScope: 'tenant', audienceRole: 'Owner', audienceRoles: STAFF_ROLES,
        requiredPermission: 'memberships.read', severity: 'info', channels: Object.freeze({ inApp: true, email: false, audit: true })
    }),
    member_subscription_request_approved: Object.freeze({
        category: 'membership', audience: 'tenant', tenantScope: 'tenant', audienceRole: 'Owner', audienceRoles: Object.freeze([...STAFF_ROLES, 'Member']),
        requiredPermission: 'memberships.read', severity: 'success', channels: Object.freeze({ inApp: true, email: false, audit: true })
    }),
    member_subscription_request_rejected: Object.freeze({
        category: 'membership', audience: 'tenant', tenantScope: 'tenant', audienceRole: 'Owner', audienceRoles: Object.freeze([...STAFF_ROLES, 'Member']),
        requiredPermission: 'memberships.read', severity: 'warning', channels: Object.freeze({ inApp: true, email: false, audit: true })
    }),
    trainer_session_scheduled: Object.freeze({
        category: 'coaching', audience: 'tenant', tenantScope: 'tenant', audienceRole: 'Owner', audienceRoles: Object.freeze(['Owner', 'Member']),
        requiredPermission: 'coaching.read', severity: 'info', channels: Object.freeze({ inApp: true, email: false, audit: true })
    }),
    trainer_session_updated: Object.freeze({
        category: 'coaching', audience: 'tenant', tenantScope: 'tenant', audienceRole: 'Owner', audienceRoles: Object.freeze(['Owner', 'Member']),
        requiredPermission: 'coaching.read', severity: 'info', channels: Object.freeze({ inApp: true, email: false, audit: true })
    }),
    trainer_session_status_changed: Object.freeze({
        category: 'coaching', audience: 'tenant', tenantScope: 'tenant', audienceRole: 'Owner', audienceRoles: Object.freeze(['Owner', 'Member']),
        requiredPermission: 'coaching.read', severity: 'success', channels: Object.freeze({ inApp: true, email: false, audit: true })
    }),
    trainer_plan_published: Object.freeze({
        category: 'coaching', audience: 'member', tenantScope: 'tenant', audienceRole: 'Member', audienceRoles: Object.freeze(['Member']),
        requiredPermission: 'coaching.read', severity: 'success', channels: Object.freeze({ inApp: true, email: false, audit: true })
    }),
    system_announcement: Object.freeze({
        category: 'system', audience: 'tenant', tenantScope: 'tenant', audienceRole: 'Owner', audienceRoles: Object.freeze([...STAFF_ROLES, 'Member']),
        requiredPermission: 'notifications.read', severity: 'info', channels: Object.freeze({ inApp: true, email: false, audit: true })
    })
});

const MAX_DEDUPE_ENTRIES = 1_000;
const DEFAULT_DEDUPE_TTL_MS = 24 * 60 * 60 * 1_000;
const EMAIL_DELIVERY_MAX_ATTEMPTS = 3;
const EMAIL_DELIVERY_RETRY_DELAYS_MS = Object.freeze([150, 450]);

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
        amountPaid: normalizeAmount(payload.amountPaid),
        currency: boundedText(payload.currency || 'EGP', 3).toUpperCase(),
        submittedAt: boundedText(payload.submittedAt, 80),
        memberName: boundedText(payload.memberName, 160),
        membershipStatus: boundedText(payload.membershipStatus, 40),
        sessionStart: boundedText(payload.sessionStart, 80),
        branchName: boundedText(payload.branchName, 120),
        sectionName: boundedText(payload.sectionName, 120),
        actionUrl: safeActionUrl(payload.actionUrl || '/platform-admin')
    });
    const audienceRoles = Array.isArray(catalog.audienceRoles) ? catalog.audienceRoles : [];
    const audienceRole = boundedText(input.audienceRole || catalog.audienceRole || '', 32) || null;
    if (audienceRoles.length && !audienceRoles.includes(audienceRole)) {
        throw new Error(`Unsupported audience role for notification event: ${type}.`);
    }
    if (catalog.tenantScope === 'tenant' && input.tenantId == null) {
        throw new Error(`${type} requires tenantId.`);
    }
    if (catalog.tenantScope === 'platform' && input.tenantId != null) {
        throw new Error(`${type} must not include tenantId.`);
    }
    const recipientMemberId = optionalId(input.recipientMemberId, 'recipientMemberId');
    if (audienceRole === 'Member' && !recipientMemberId) throw new Error(`${type} requires recipientMemberId.`);
    const recipientScope = input.recipientUserId != null
        ? `user-${input.recipientUserId}`
        : recipientMemberId != null ? `member-${recipientMemberId}` : audienceRole || 'broadcast';
    return Object.freeze({
        type, category: catalog.category, audience: catalog.audience, tenantScope: catalog.tenantScope,
        audienceRole, requiredPermission: catalog.requiredPermission,
        severity: catalog.severity, channels: catalog.channels,
        tenantId: optionalId(input.tenantId, 'tenantId'),
        recipientUserId: optionalId(input.recipientUserId, 'recipientUserId'),
        recipientMemberId,
        actorUserId: optionalId(input.actorUserId, 'actorUserId'),
        entityType: boundedText(input.entityType || 'notification', 80), entityId,
        title: boundedText(input.title || '', 200), message: boundedText(input.message || '', 2_000),
        payload: normalizedPayload,
        notificationId: optionalId(input.notificationId, 'notificationId'),
        dedupeKey: boundedText(input.dedupeKey || `${type}:${input.tenantId == null ? 'platform' : `tenant-${input.tenantId}`}:${recipientScope}:${entityId}`, 180),
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
    const subject = `Logic Fit | New ${typeLabel} registration request`;
    const details = [
        ['Type', typeLabel],
        ['Business / brand', payload.gymName || 'Not provided'],
        ['Applicant', payload.ownerName || 'Not provided'],
        ['Contact email', payload.contactEmail || 'Not provided'],
        ['Plan', payload.planName || 'Not provided'],
        ['Amount due', payload.amountDue == null ? 'Not provided' : `${payload.amountDue.toFixed(2)} ${payload.currency}`],
        ['Submitted at', payload.submittedAt || 'Not provided']
    ];
    const lines = [
        'Logic Fit',
        `New ${typeLabel} registration request`,
        '',
        'A new registration request is ready for platform review.',
        '',
        ...details.map(([label, value]) => `${label}: ${value}`),
        '',
        `Review request: ${actionUrl}`,
        '',
        'This is an automated notification from Logic Fit.'
    ];
    const html = `<!doctype html>
<html lang="en" dir="ltr">
<head><meta charset="utf-8"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"></head>
<body style="margin:0;padding:0;background:#f3f6fb;color:#172033;font-family:Arial,Helvetica,sans-serif;">
  <div role="article" aria-roledescription="email" style="width:100%;background:#f3f6fb;padding:32px 12px;box-sizing:border-box;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5eaf2;border-radius:16px;overflow:hidden;">
      <tr><td style="padding:24px 28px;background:#102a43;color:#ffffff;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="font-size:20px;font-weight:700;letter-spacing:.5px;">LOGIC <span style="color:#57d3b2;">FIT</span></td>
          <td align="right" style="font-size:11px;letter-spacing:1.4px;color:#b9c9dc;text-transform:uppercase;">Platform alert</td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:36px 28px 20px;">
        <div style="display:inline-block;padding:7px 11px;border-radius:999px;background:#e7f8f3;color:#087f69;font-size:12px;font-weight:700;letter-spacing:.7px;text-transform:uppercase;">New request</div>
        <h1 style="margin:16px 0 10px;font-size:28px;line-height:1.2;color:#102a43;">New ${htmlEscape(typeLabel)} registration request</h1>
        <p style="margin:0;color:#526173;font-size:15px;line-height:1.7;">A new registration request is ready for platform review.</p>
      </td></tr>
      <tr><td style="padding:0 28px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e5eaf2;border-radius:12px;background:#fbfcfe;">
          ${details.map(([label, value]) => `<tr><td style="padding:13px 16px;border-bottom:1px solid #edf0f5;color:#718096;font-size:12px;font-weight:700;">${htmlEscape(label)}</td><td style="padding:13px 16px;border-bottom:1px solid #edf0f5;color:#172033;font-size:14px;text-align:right;">${htmlEscape(value)}</td></tr>`).join('')}
        </table>
      </td></tr>
      <tr><td style="padding:20px 28px 34px;">
        <a href="${htmlEscape(actionUrl)}" style="display:inline-block;padding:13px 20px;border-radius:9px;background:#0f9d83;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;">Review request</a>
        <p style="margin:22px 0 0;color:#8a96a8;font-size:12px;line-height:1.6;">This is an automated notification from Logic Fit. Please review the request from the secure platform dashboard.</p>
      </td></tr>
      <tr><td style="padding:18px 28px;background:#f8fafc;border-top:1px solid #edf0f5;color:#8a96a8;font-size:11px;line-height:1.5;">Logic Fit · Platform notifications</td></tr>
    </table>
  </div>
</body>
</html>`;
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
    const subscribers = new Set();
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
        const fallbackTitle = {
            membership_updated: '\u062a\u0645 \u062a\u062d\u062f\u064a\u062b \u0627\u0644\u0639\u0636\u0648\u064a\u0629',
            member_created: 'عضو جديد',
            membership_created: 'تم إنشاء الاشتراك',
            membership_frozen: 'تم تجميد العضوية',
            membership_resumed: 'تم استئناف العضوية',
            membership_renewed: 'تم تجديد العضوية',
            payment_updated: 'تم تحديث الدفع',
            attendance_checked_in: 'تم تسجيل الحضور',
            attendance_auto_checked_out: 'تم تسجيل الانصراف تلقائيًا',
            member_subscription_request_created: 'طلب اشتراك جديد',
            member_subscription_request_approved: 'تم قبول طلب الاشتراك',
            member_subscription_request_rejected: 'تم رفض طلب الاشتراك',
            trainer_session_scheduled: 'تم جدولة جلسة تدريب',
            trainer_session_updated: 'تم تحديث جلسة التدريب',
            trainer_session_status_changed: 'تغيرت حالة جلسة التدريب',
            trainer_plan_published: 'تم نشر خطة جديدة',
            system_announcement: 'إعلان جديد'
        };
        const memberLabel = event.payload.memberName ? `: ${event.payload.memberName}` : '';
        return {
            title: event.title || (event.type.endsWith('_requested') ? registrationTitle(event) : fallbackTitle[event.type] || boundedText(event.type, 200)),
            message: event.message || (event.type.endsWith('_requested') ? registrationMessage(event) : `${event.auditDetails}${memberLabel}`),
            actionUrl: event.payload.actionUrl || (event.tenantScope === 'tenant' ? '/' : '/platform-admin')
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
            .input('recipientMemberId', sql.Int, event.recipientMemberId)
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
                  AND ${sameNullable('recipient_member_id', '@recipientMemberId')}
            )
            BEGIN
                INSERT INTO ${NOTIFICATION_TABLE}
                    (tenant_id,audience_role,recipient_user_id,recipient_member_id,actor_user_id,type,category,severity,title,message,action_url,entity_type,entity_id,dedupe_key,expires_at)
                VALUES
                    (@tenantId,@audienceRole,@recipientUserId,@recipientMemberId,@actorUserId,@type,@category,@severity,@title,@message,@actionUrl,@entityType,@entityId,@dedupeKey,@expiresAt);
            END;
            SELECT TOP (1) id FROM ${NOTIFICATION_TABLE}
            WHERE dedupe_key=@dedupeKey
              AND ${sameNullable('tenant_id', '@tenantId')}
              AND ${sameNullable('audience_role', '@audienceRole')}
              AND ${sameNullable('recipient_user_id', '@recipientUserId')}
              AND ${sameNullable('recipient_member_id', '@recipientMemberId')}
            ORDER BY id DESC;
        `);
        return { status: 'recorded', notificationId: Number(result.recordset?.[0]?.id || 0) || null };
    }

    async function recordEvent(input, { executor = null } = {}) {
        const event = normalizeEvent(input);
        if (event.channels.audit && auditService?.recordAudit) {
            await auditService.recordAudit({ tenantId: event.tenantId, actorUserId: event.actorUserId, action: event.type, entityType: event.entityType, entityId: event.entityId, details: event.auditDetails, executor });
        }
        // A caller-owned transaction keeps the event atomic with the business
        // write. Post-commit producers use the service pool here instead.
        let notificationId = event.notificationId;
        if (event.channels.inApp && databaseEnabled) {
            const inApp = await createInApp(event, { executor });
            notificationId = inApp.notificationId;
        }
        return notificationId ? Object.freeze({ ...event, notificationId }) : event;
    }

    async function dispatchChannel(event, channel, callback) {
        if (!callback) return { status: 'skipped', reason: 'not_configured' };
        const maxAttempts = channel === 'email' ? EMAIL_DELIVERY_MAX_ATTEMPTS : 1;
        let lastResult = { status: 'failed', reason: 'channel_failed' };
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            try {
                const result = await callback(event);
                if (result?.status !== 'failed') return { ...result, attempts: attempt };
                lastResult = result;
            } catch (_) {
                lastResult = { status: 'failed', reason: 'channel_failed' };
            }
            if (attempt < maxAttempts) {
                const delay = EMAIL_DELIVERY_RETRY_DELAYS_MS[attempt - 1] || 0;
                if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
            }
        }
        try { logger.warn('[NOTIFICATION_CHANNEL_FAILED]', { eventType: event.type, channel, attempts: maxAttempts }); } catch (_) { /* best effort */ }
        return { ...lastResult, status: 'failed', attempts: maxAttempts };
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
            if (channels.inApp.status !== 'skipped') broadcast(event);
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

    function portalVisibleSql() {
        return `(n.recipient_member_id=@memberId OR (n.recipient_member_id IS NULL AND n.audience_role='Member'))
            AND n.tenant_id=@tenantId`;
    }

    async function listForPortalMember({ memberId, tenantId, page = 1, pageSize = 20, unreadOnly = false, category = '' } = {}) {
        const safeMemberId = positiveId(memberId, 'memberId');
        const safeTenantId = positiveId(tenantId, 'tenantId');
        const safePage = Math.min(10_000, Math.max(1, Number(page) || 1));
        const safePageSize = Math.min(50, Math.max(1, Number(pageSize) || 20));
        const offset = (safePage - 1) * safePageSize;
        const normalizedCategory = boundedText(category, 80);
        const pool = await poolProvider();
        const request = pool.request()
            .input('memberId', sql.Int, safeMemberId)
            .input('tenantId', sql.Int, safeTenantId)
            .input('offset', sql.Int, offset)
            .input('pageSize', sql.Int, safePageSize)
            .input('unreadOnly', sql.Bit, unreadOnly ? 1 : 0)
            .input('category', sql.VarChar(80), normalizedCategory);
        const result = await request.query(`
            WITH visible AS (
                SELECT n.id,n.tenant_id,n.type,n.category,n.severity,n.title,n.message,n.action_url,n.entity_type,n.entity_id,n.created_at,
                    CASE WHEN r.notification_id IS NULL THEN CAST(0 AS BIT) ELSE CAST(1 AS BIT) END AS is_read
                FROM ${NOTIFICATION_TABLE} n
                LEFT JOIN ${MEMBER_NOTIFICATION_READ_TABLE} r ON r.notification_id=n.id AND r.member_id=@memberId AND r.tenant_id=@tenantId
                WHERE ${portalVisibleSql()}
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
                id: Number(row.id), tenantId: Number(row.tenant_id), type: row.type, category: row.category,
                severity: row.severity, title: row.title, message: row.message, actionUrl: row.action_url || null,
                entityType: row.entity_type || null, entityId: row.entity_id == null ? null : Number(row.entity_id),
                createdAt: row.created_at, read: Boolean(row.is_read)
            })),
            pagination: { page: safePage, pageSize: safePageSize, total: Number(rows[0]?.total_count || 0), hasNext: offset + rows.length < Number(rows[0]?.total_count || 0) }
        };
    }

    async function unreadCountForPortalMember({ memberId, tenantId } = {}) {
        const data = await listForPortalMember({ memberId, tenantId, page: 1, pageSize: 1, unreadOnly: true });
        return data.pagination.total;
    }

    async function markPortalRead({ memberId, tenantId, notificationId } = {}) {
        const id = positiveId(notificationId, 'notificationId');
        const pool = await poolProvider();
        const result = await pool.request()
            .input('memberId', sql.Int, positiveId(memberId, 'memberId'))
            .input('tenantId', sql.Int, positiveId(tenantId, 'tenantId'))
            .input('notificationId', sql.BigInt, id)
            .query(`
                IF EXISTS (SELECT 1 FROM ${NOTIFICATION_TABLE} n WHERE n.id=@notificationId AND ${portalVisibleSql()})
                BEGIN
                    IF NOT EXISTS (SELECT 1 FROM ${MEMBER_NOTIFICATION_READ_TABLE} WHERE notification_id=@notificationId AND member_id=@memberId AND tenant_id=@tenantId)
                        INSERT INTO ${MEMBER_NOTIFICATION_READ_TABLE}(notification_id,tenant_id,member_id) VALUES (@notificationId,@tenantId,@memberId);
                    SELECT 1 AS changed;
                END
                ELSE SELECT 0 AS changed;
            `);
        if (Number(result.recordset?.[0]?.changed) !== 1) {
            const error = new Error('Notification not found.');
            error.statusCode = 404;
            error.expose = true;
            error.code = 'NOTIFICATION_NOT_FOUND';
            throw error;
        }
        return { read: true };
    }

    async function markPortalAllRead({ memberId, tenantId } = {}) {
        const pool = await poolProvider();
        const result = await pool.request()
            .input('memberId', sql.Int, positiveId(memberId, 'memberId'))
            .input('tenantId', sql.Int, positiveId(tenantId, 'tenantId'))
            .query(`
                INSERT INTO ${MEMBER_NOTIFICATION_READ_TABLE}(notification_id,tenant_id,member_id)
                SELECT n.id,@tenantId,@memberId FROM ${NOTIFICATION_TABLE} n
                WHERE ${portalVisibleSql()}
                  AND (n.expires_at IS NULL OR n.expires_at>SYSUTCDATETIME())
                  AND NOT EXISTS (SELECT 1 FROM ${MEMBER_NOTIFICATION_READ_TABLE} r WHERE r.notification_id=n.id AND r.member_id=@memberId AND r.tenant_id=@tenantId);
                SELECT @@ROWCOUNT AS changed;
            `);
        return { read: true, changed: Number(result.recordset?.[0]?.changed || 0) };
    }

    function subscriberMatches(event, subscriber) {
        if (subscriber.kind === 'member') {
            return event.tenantId === subscriber.tenantId
                && (event.recipientMemberId === subscriber.memberId
                    || (!event.recipientMemberId && event.audienceRole === 'Member'));
        }
        return event.tenantId === subscriber.tenantId
            && (event.recipientUserId === subscriber.userId
                || (!event.recipientUserId && event.audienceRole === subscriber.role));
    }

    function broadcast(event) {
        if (!event.notificationId) return;
        const fields = displayFields(event);
        const payload = {
            id: event.notificationId,
            tenantId: event.tenantId,
            type: event.type,
            category: event.category,
            severity: event.severity,
            title: fields.title,
            message: fields.message,
            actionUrl: fields.actionUrl,
            entityType: event.entityType,
            entityId: event.entityId,
            createdAt: new Date(now()).toISOString(),
            read: false
        };
        for (const subscriber of subscribers) {
            if (!subscriberMatches(event, subscriber)) continue;
            try { subscriber.send(payload); } catch (_) { subscribers.delete(subscriber); }
        }
    }

    function subscribe(filter, send) {
        const subscriber = { ...filter, send };
        subscribers.add(subscriber);
        return () => subscribers.delete(subscriber);
    }

    async function publish(input) {
        const event = await recordEvent(input);
        return { event, delivery: await dispatchEvent(event) };
    }

    return Object.freeze({
        catalog: EVENT_CATALOG, ensureTables, recordEvent, createInApp, dispatchEvent, publish,
        listForUser, unreadCount, markRead, markAllRead, listForPortalMember,
        unreadCountForPortalMember, markPortalRead, markPortalAllRead,
        subscribe
    });
}

module.exports = {
    DEFAULT_DEDUPE_TTL_MS, EVENT_CATALOG, MEMBER_NOTIFICATION_READ_TABLE, NOTIFICATION_READ_TABLE, NOTIFICATION_SCHEMA_SQL,
    NOTIFICATION_TABLE, buildRegistrationEmail, createNotificationService, normalizeEvent
};
