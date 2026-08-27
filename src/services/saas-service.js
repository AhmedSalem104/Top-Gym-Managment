'use strict';

const crypto = require('node:crypto');
const { getPool, sql } = require('../database');
const { withTransaction } = require('../database/transaction');
const { currentTenantId, getTenantContext } = require('../tenancy/tenant-context');

const TRIAL_DAYS = 14;
const MAX_PROOF_BYTES = 4 * 1024 * 1024;
const PROOF_MIME_TYPES = Object.freeze(new Set([
    'image/jpeg', 'image/png', 'image/webp', 'application/pdf'
]));

const SAAS_TABLES = Object.freeze([
    'saas_tenant_subscriptions',
    'saas_subscription_requests',
    'saas_payment_proofs'
]);

const DEFAULT_PLANS = Object.freeze([
    {
        code: 'starter',
        name: 'Starter',
        description: 'لجيم ناشئ يحتاج الأساسيات بسرعة.',
        billingPeriod: 'monthly',
        price: 299,
        maxMembers: 300,
        maxUsers: 3,
        maxAiGenerations: 100,
        maxStorageMb: 1024,
        features: { intelligence: true, coaching: true, store: false, reports: true, portal: true },
        sortOrder: 1
    },
    {
        code: 'pro',
        name: 'Pro',
        description: 'لجيم متنامٍ مع تشغيل أوسع وذكاء اصطناعي أكثر.',
        billingPeriod: 'monthly',
        price: 599,
        maxMembers: 1500,
        maxUsers: 10,
        maxAiGenerations: 500,
        maxStorageMb: 5120,
        features: { intelligence: true, coaching: true, store: true, reports: true, portal: true },
        sortOrder: 2
    },
    {
        code: 'enterprise',
        name: 'Enterprise',
        description: 'للجيمات الكبيرة والتشغيل متعدد الفرق.',
        billingPeriod: 'yearly',
        price: 1299,
        maxMembers: null,
        maxUsers: null,
        maxAiGenerations: null,
        maxStorageMb: 51200,
        features: { intelligence: true, coaching: true, store: true, reports: true, portal: true, prioritySupport: true },
        sortOrder: 3
    }
]);

const SAAS_SCHEMA_SQL = `
IF OBJECT_ID(N'dbo.saas_plans', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.saas_plans (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_saas_plans PRIMARY KEY,
        code VARCHAR(40) NOT NULL,
        name NVARCHAR(120) NOT NULL,
        description NVARCHAR(500) NULL,
        billing_period VARCHAR(20) NOT NULL CONSTRAINT DF_saas_plans_period DEFAULT ('monthly'),
        price DECIMAL(12,2) NOT NULL CONSTRAINT DF_saas_plans_price DEFAULT (0),
        currency CHAR(3) NOT NULL CONSTRAINT DF_saas_plans_currency DEFAULT ('EGP'),
        max_members INT NULL,
        max_users INT NULL,
        max_ai_generations INT NULL,
        max_storage_mb INT NULL,
        features_json NVARCHAR(MAX) NOT NULL CONSTRAINT DF_saas_plans_features DEFAULT ('{}'),
        is_active BIT NOT NULL CONSTRAINT DF_saas_plans_active DEFAULT (1),
        sort_order INT NOT NULL CONSTRAINT DF_saas_plans_sort DEFAULT (0),
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_saas_plans_created DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_saas_plans_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT UQ_saas_plans_code UNIQUE (code),
        CONSTRAINT CK_saas_plans_period CHECK (billing_period IN ('monthly', 'yearly')),
        CONSTRAINT CK_saas_plans_price CHECK (price >= 0),
        CONSTRAINT CK_saas_plans_limits CHECK ((max_members IS NULL OR max_members > 0) AND (max_users IS NULL OR max_users > 0) AND (max_ai_generations IS NULL OR max_ai_generations > 0) AND (max_storage_mb IS NULL OR max_storage_mb > 0))
    );
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_saas_plans_active_order' AND object_id=OBJECT_ID(N'dbo.saas_plans'))
    CREATE INDEX IX_saas_plans_active_order ON dbo.saas_plans(is_active, sort_order, id);

IF OBJECT_ID(N'dbo.saas_tenant_subscriptions', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.saas_tenant_subscriptions (
        id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_saas_tenant_subscriptions PRIMARY KEY,
        tenant_id INT NOT NULL,
        plan_id INT NOT NULL,
        status VARCHAR(20) NOT NULL,
        starts_at DATETIME2(0) NOT NULL,
        expires_at DATETIME2(0) NULL,
        source VARCHAR(20) NOT NULL CONSTRAINT DF_saas_subscriptions_source DEFAULT ('manual'),
        auto_renew BIT NOT NULL CONSTRAINT DF_saas_subscriptions_auto_renew DEFAULT (0),
        notes NVARCHAR(1000) NULL,
        created_by_user_id INT NULL,
        approved_by_user_id INT NULL,
        approved_at DATETIME2(0) NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_saas_subscriptions_created DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_saas_subscriptions_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_saas_subscriptions_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.gym_tenants(id) ON DELETE CASCADE,
        CONSTRAINT FK_saas_subscriptions_plan FOREIGN KEY (plan_id) REFERENCES dbo.saas_plans(id) ON DELETE NO ACTION,
        CONSTRAINT CK_saas_subscriptions_status CHECK (status IN ('trial', 'active', 'expired', 'cancelled', 'suspended')),
        CONSTRAINT CK_saas_subscriptions_source CHECK (source IN ('trial', 'manual', 'admin', 'bootstrap')),
        CONSTRAINT CK_saas_subscriptions_dates CHECK (expires_at IS NULL OR expires_at > starts_at)
    );
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_saas_subscriptions_tenant_status' AND object_id=OBJECT_ID(N'dbo.saas_tenant_subscriptions'))
    CREATE INDEX IX_saas_subscriptions_tenant_status ON dbo.saas_tenant_subscriptions(tenant_id, status, expires_at DESC, id DESC);

IF OBJECT_ID(N'dbo.saas_subscription_requests', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.saas_subscription_requests (
        id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_saas_subscription_requests PRIMARY KEY,
        tenant_id INT NOT NULL,
        plan_id INT NOT NULL,
        requested_by_user_id INT NOT NULL,
        status VARCHAR(20) NOT NULL CONSTRAINT DF_saas_requests_status DEFAULT ('pending'),
        amount_snapshot DECIMAL(12,2) NOT NULL,
        currency CHAR(3) NOT NULL CONSTRAINT DF_saas_requests_currency DEFAULT ('EGP'),
        notes NVARCHAR(1000) NULL,
        review_notes NVARCHAR(1000) NULL,
        reviewed_by_user_id INT NULL,
        reviewed_at DATETIME2(0) NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_saas_requests_created DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_saas_requests_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_saas_requests_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.gym_tenants(id) ON DELETE CASCADE,
        CONSTRAINT FK_saas_requests_plan FOREIGN KEY (plan_id) REFERENCES dbo.saas_plans(id) ON DELETE NO ACTION,
        CONSTRAINT CK_saas_requests_status CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
        CONSTRAINT CK_saas_requests_amount CHECK (amount_snapshot >= 0)
    );
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_saas_requests_tenant_status' AND object_id=OBJECT_ID(N'dbo.saas_subscription_requests'))
    CREATE INDEX IX_saas_requests_tenant_status ON dbo.saas_subscription_requests(tenant_id, status, created_at DESC, id DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_saas_requests_review_queue' AND object_id=OBJECT_ID(N'dbo.saas_subscription_requests'))
    CREATE INDEX IX_saas_requests_review_queue ON dbo.saas_subscription_requests(status, created_at DESC, id DESC);

IF OBJECT_ID(N'dbo.saas_payment_proofs', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.saas_payment_proofs (
        id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_saas_payment_proofs PRIMARY KEY,
        request_id BIGINT NOT NULL,
        tenant_id INT NOT NULL,
        file_name NVARCHAR(255) NOT NULL,
        mime_type VARCHAR(80) NOT NULL,
        file_size INT NOT NULL,
        sha256 CHAR(64) NOT NULL,
        content VARBINARY(MAX) NOT NULL,
        uploaded_by_user_id INT NOT NULL,
        uploaded_at DATETIME2(0) NOT NULL CONSTRAINT DF_saas_proofs_uploaded DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT UQ_saas_payment_proofs_request UNIQUE (request_id),
        CONSTRAINT FK_saas_proofs_request FOREIGN KEY (request_id) REFERENCES dbo.saas_subscription_requests(id) ON DELETE CASCADE,
        CONSTRAINT FK_saas_proofs_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.gym_tenants(id) ON DELETE NO ACTION,
        CONSTRAINT CK_saas_proofs_size CHECK (file_size > 0 AND file_size <= 4194304)
    );
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_saas_proofs_tenant' AND object_id=OBJECT_ID(N'dbo.saas_payment_proofs'))
    CREATE INDEX IX_saas_proofs_tenant ON dbo.saas_payment_proofs(tenant_id, uploaded_at DESC, id DESC);

IF OBJECT_ID(N'dbo.saas_audit_log', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.saas_audit_log (
        id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_saas_audit_log PRIMARY KEY,
        tenant_id INT NULL,
        actor_user_id INT NULL,
        action VARCHAR(50) NOT NULL,
        entity_type VARCHAR(50) NOT NULL,
        entity_id BIGINT NULL,
        details NVARCHAR(2000) NULL,
        ip_address VARCHAR(64) NULL,
        user_agent NVARCHAR(512) NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_saas_audit_created DEFAULT (SYSUTCDATETIME())
    );
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_saas_audit_date' AND object_id=OBJECT_ID(N'dbo.saas_audit_log'))
    CREATE INDEX IX_saas_audit_date ON dbo.saas_audit_log(created_at DESC, id DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_saas_audit_tenant_date' AND object_id=OBJECT_ID(N'dbo.saas_audit_log'))
    CREATE INDEX IX_saas_audit_tenant_date ON dbo.saas_audit_log(tenant_id, created_at DESC, id DESC);
`;

let readyPromise;

function saasError(message, statusCode = 400, code = 'SAAS_ERROR', details = null) {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.expose = true;
    error.code = code;
    if (details) error.saas = details;
    return error;
}

function integerOrNull(value, label) {
    if (value === null || value === '' || value === undefined) return null;
    const number = Number(value);
    if (!Number.isInteger(number) || number <= 0) throw saasError(`${label} غير صحيح.`, 400, 'INVALID_PLAN_LIMIT');
    return number;
}

function text(value, fallback = '', maxLength = 1000) {
    return String(value ?? fallback).replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, maxLength);
}

function parseFeatures(value) {
    try {
        const parsed = typeof value === 'string' ? JSON.parse(value || '{}') : value;
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (_) {
        return {};
    }
}

function planFromRow(row) {
    if (!row) return null;
    return {
        id: Number(row.id),
        code: String(row.code),
        name: String(row.name),
        description: row.description || '',
        billingPeriod: String(row.billing_period),
        price: Number(row.price || 0),
        currency: String(row.currency || 'EGP'),
        maxMembers: row.max_members == null ? null : Number(row.max_members),
        maxUsers: row.max_users == null ? null : Number(row.max_users),
        maxAiGenerations: row.max_ai_generations == null ? null : Number(row.max_ai_generations),
        maxStorageMb: row.max_storage_mb == null ? null : Number(row.max_storage_mb),
        features: parseFeatures(row.features_json),
        isActive: Boolean(row.is_active),
        sortOrder: Number(row.sort_order || 0),
        updatedAt: row.updated_at || null
    };
}

function subscriptionFromRow(row) {
    if (!row) return null;
    const expiresAt = row.expires_at ? new Date(row.expires_at) : null;
    const daysRemaining = expiresAt ? Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 86400000)) : null;
    return {
        id: Number(row.id),
        tenantId: Number(row.tenant_id),
        status: String(row.status),
        startsAt: row.starts_at || null,
        expiresAt: row.expires_at || null,
        daysRemaining,
        source: String(row.source || 'manual'),
        autoRenew: Boolean(row.auto_renew),
        notes: row.notes || '',
        approvedAt: row.approved_at || null,
        plan: planFromRow(row)
    };
}

function requestFromRow(row) {
    if (!row) return null;
    return {
        id: Number(row.id),
        tenantId: Number(row.tenant_id),
        tenantName: row.tenant_name || null,
        tenantSlug: row.tenant_slug || null,
        plan: planFromRow(row),
        status: String(row.status),
        amount: Number(row.amount_snapshot || 0),
        currency: String(row.currency || 'EGP'),
        notes: row.notes || '',
        reviewNotes: row.review_notes || '',
        requestedByUserId: row.requested_by_user_id == null ? null : Number(row.requested_by_user_id),
        requestedByName: row.requested_by_name || null,
        reviewedByUserId: row.reviewed_by_user_id == null ? null : Number(row.reviewed_by_user_id),
        reviewedAt: row.reviewed_at || null,
        createdAt: row.created_at || null,
        proof: row.proof_id ? {
            id: Number(row.proof_id),
            fileName: row.proof_file_name,
            mimeType: row.proof_mime_type,
            fileSize: Number(row.proof_file_size || 0),
            uploadedAt: row.proof_uploaded_at || null
        } : null
    };
}

function tenantIdValue(value = currentTenantId({ required: true })) {
    const tenantId = Number(value);
    if (!Number.isInteger(tenantId) || tenantId <= 0) throw saasError('Tenant غير صحيح.', 400, 'INVALID_TENANT');
    return tenantId;
}

function addBillingPeriod(date, period) {
    const result = new Date(date.getTime());
    if (period === 'yearly') result.setUTCFullYear(result.getUTCFullYear() + 1);
    else result.setUTCMonth(result.getUTCMonth() + 1);
    return result;
}

async function seedPlans(pool) {
    for (const plan of DEFAULT_PLANS) {
        await pool.request()
            .input('code', sql.VarChar(40), plan.code)
            .input('name', sql.NVarChar(120), plan.name)
            .input('description', sql.NVarChar(500), plan.description)
            .input('billingPeriod', sql.VarChar(20), plan.billingPeriod)
            .input('price', sql.Decimal(12, 2), plan.price)
            .input('currency', sql.Char(3), 'EGP')
            .input('maxMembers', sql.Int, plan.maxMembers)
            .input('maxUsers', sql.Int, plan.maxUsers)
            .input('maxAiGenerations', sql.Int, plan.maxAiGenerations)
            .input('maxStorageMb', sql.Int, plan.maxStorageMb)
            .input('features', sql.NVarChar(sql.MAX), JSON.stringify(plan.features))
            .input('sortOrder', sql.Int, plan.sortOrder)
            .query(`
                IF NOT EXISTS (SELECT 1 FROM dbo.saas_plans WHERE code=@code)
                    INSERT INTO dbo.saas_plans (code,name,description,billing_period,price,currency,max_members,max_users,max_ai_generations,max_storage_mb,features_json,sort_order)
                    VALUES (@code,@name,@description,@billingPeriod,@price,@currency,@maxMembers,@maxUsers,@maxAiGenerations,@maxStorageMb,@features,@sortOrder);
            `);
    }
}

async function ensureSaasTables() {
    if (!readyPromise) {
        readyPromise = (async () => {
            const pool = await getPool();
            await pool.request().batch(SAAS_SCHEMA_SQL);
            await seedPlans(pool);
        })().catch((error) => {
            readyPromise = null;
            throw error;
        });
    }
    return readyPromise;
}

async function recordAudit({ tenantId = null, actorUserId = null, action, entityType, entityId = null, details = '', ipAddress = null, userAgent = null, executor = null }) {
    const connection = executor || await getPool();
    await connection.request()
        .input('tenantId', sql.Int, tenantId == null ? null : Number(tenantId))
        .input('actorUserId', sql.Int, actorUserId == null ? null : Number(actorUserId))
        .input('action', sql.VarChar(50), text(action, 'unknown', 50))
        .input('entityType', sql.VarChar(50), text(entityType, 'unknown', 50))
        .input('entityId', sql.BigInt, entityId == null ? null : Number(entityId))
        .input('details', sql.NVarChar(2000), text(details, '', 2000) || null)
        .input('ipAddress', sql.VarChar(64), text(ipAddress, '', 64) || null)
        .input('userAgent', sql.NVarChar(512), text(userAgent, '', 512) || null)
        .query(`INSERT INTO dbo.saas_audit_log (tenant_id,actor_user_id,action,entity_type,entity_id,details,ip_address,user_agent)
                VALUES (@tenantId,@actorUserId,@action,@entityType,@entityId,@details,@ipAddress,@userAgent);`);
}

async function getPlans({ includeInactive = false } = {}) {
    await ensureSaasTables();
    const pool = await getPool();
    const result = await pool.request()
        .input('includeInactive', sql.Bit, includeInactive ? 1 : 0)
        .query('SELECT id,code,name,description,billing_period,price,currency,max_members,max_users,max_ai_generations,max_storage_mb,features_json,is_active,sort_order,updated_at FROM dbo.saas_plans WHERE @includeInactive=1 OR is_active=1 ORDER BY sort_order,id;');
    return result.recordset.map(planFromRow);
}

async function getPlan({ id = null, code = null, includeInactive = false } = {}) {
    await ensureSaasTables();
    const pool = await getPool();
    const result = await pool.request()
        .input('id', sql.Int, id == null ? null : Number(id))
        .input('code', sql.VarChar(40), code ? text(code, '', 40).toLowerCase() : null)
        .input('includeInactive', sql.Bit, includeInactive ? 1 : 0)
        .query('SELECT TOP (1) id,code,name,description,billing_period,price,currency,max_members,max_users,max_ai_generations,max_storage_mb,features_json,is_active,sort_order,updated_at FROM dbo.saas_plans WHERE (@id IS NOT NULL AND id=@id OR @id IS NULL AND @code IS NOT NULL AND code=@code) AND (@includeInactive=1 OR is_active=1);');
    return planFromRow(result.recordset[0]);
}

async function syncExpiredTenants() {
    await ensureSaasTables();
    const pool = await getPool();
    const context = getTenantContext();
    if (context?.mode && context.mode !== 'platform') {
        const tenantId = tenantIdValue(context.tenantId);
        await pool.request().input('tenantId', sql.Int, tenantId).batch(`
            UPDATE dbo.saas_tenant_subscriptions
            SET status='expired', updated_at=SYSUTCDATETIME()
            WHERE tenant_id=@tenantId AND status IN ('trial','active') AND expires_at IS NOT NULL AND expires_at <= SYSUTCDATETIME();

            UPDATE t
            SET status='expired', updated_at=SYSUTCDATETIME()
            FROM dbo.gym_tenants t
            WHERE t.id=@tenantId AND t.status IN ('trial','active')
              AND NOT EXISTS (
                  SELECT 1 FROM dbo.saas_tenant_subscriptions s
                  WHERE s.tenant_id=@tenantId AND s.status IN ('trial','active')
                    AND (s.expires_at IS NULL OR s.expires_at > SYSUTCDATETIME())
              );
        `);
        return;
    }
    await pool.request().batch(`
        UPDATE dbo.saas_tenant_subscriptions
        SET status='expired', updated_at=SYSUTCDATETIME()
        WHERE status IN ('trial','active') AND expires_at IS NOT NULL AND expires_at <= SYSUTCDATETIME();

        UPDATE t
        SET status='expired', updated_at=SYSUTCDATETIME()
        FROM dbo.gym_tenants t
        WHERE t.status IN ('trial','active')
          AND NOT EXISTS (
              SELECT 1 FROM dbo.saas_tenant_subscriptions s
              WHERE s.tenant_id=t.id AND s.status IN ('trial','active')
                AND (s.expires_at IS NULL OR s.expires_at > SYSUTCDATETIME())
          );
    `);
}

async function getCurrentSubscription(tenantId = currentTenantId({ required: true })) {
    await ensureSaasTables();
    const id = tenantIdValue(tenantId);
    const pool = await getPool();
    const result = await pool.request()
        .input('tenantId', sql.Int, id)
        .query(`SELECT TOP (1) s.id,s.tenant_id,s.status,s.starts_at,s.expires_at,s.source,s.auto_renew,s.notes,s.approved_at,
                       p.id AS plan_id,p.code,p.name,p.description,p.billing_period,p.price,p.currency,p.max_members,p.max_users,p.max_ai_generations,p.max_storage_mb,p.features_json,p.is_active,p.sort_order,p.updated_at AS plan_updated_at
                FROM dbo.saas_tenant_subscriptions s
                INNER JOIN dbo.saas_plans p ON p.id=s.plan_id
                WHERE s.tenant_id=@tenantId
                ORDER BY CASE s.status WHEN 'active' THEN 0 WHEN 'trial' THEN 1 WHEN 'expired' THEN 2 WHEN 'suspended' THEN 3 ELSE 4 END, s.updated_at DESC,s.id DESC;`);
    const subscription = subscriptionFromRow(result.recordset[0]);
    if (subscription && ['active', 'trial'].includes(subscription.status) && subscription.expiresAt && new Date(subscription.expiresAt).getTime() <= Date.now()) {
        await pool.request().input('id', sql.BigInt, subscription.id).query("UPDATE dbo.saas_tenant_subscriptions SET status='expired', updated_at=SYSUTCDATETIME() WHERE id=@id AND status IN ('trial','active');");
        await pool.request().input('tenantId', sql.Int, id).query("UPDATE dbo.gym_tenants SET status='expired', updated_at=SYSUTCDATETIME() WHERE id=@tenantId AND status IN ('trial','active');");
        subscription.status = 'expired';
        subscription.daysRemaining = 0;
    }
    return subscription;
}

async function getTenantBilling(tenantId = currentTenantId({ required: true })) {
    const id = tenantIdValue(tenantId);
    await ensureSaasTables();
    const pool = await getPool();
    const [tenantResult, subscription, requests, plans] = await Promise.all([
        pool.request().input('tenantId', sql.Int, id).query('SELECT TOP (1) id,name,slug,status,created_at,updated_at FROM dbo.gym_tenants WHERE id=@tenantId;'),
        getCurrentSubscription(id),
        listTenantRequests(id),
        getPlans()
    ]);
    const tenant = tenantResult.recordset[0];
    return {
        tenant: tenant ? { id: Number(tenant.id), name: tenant.name, slug: tenant.slug, status: tenant.status, createdAt: tenant.created_at, updatedAt: tenant.updated_at } : null,
        subscription,
        plans,
        requests
    };
}

function recoveryRequest(path, method) {
    const normalizedPath = String(path || '');
    const normalizedMethod = String(method || 'GET').toUpperCase();
    return (normalizedPath === '/saas/subscription' && normalizedMethod === 'GET')
        || (normalizedPath === '/saas/plans' && normalizedMethod === 'GET')
        || (normalizedPath === '/saas/subscription-requests' && ['GET', 'POST'].includes(normalizedMethod))
        || (/^\/saas\/subscription-requests\/\d+\/proof$/.test(normalizedPath) && normalizedMethod === 'POST');
}

function requiredFeature(path) {
    const value = String(path || '');
    if (value.startsWith('/intelligence')) return 'intelligence';
    if (value.startsWith('/store')) return 'store';
    if (value.startsWith('/coaching') || value.startsWith('/workout') || value.startsWith('/diet') || value.startsWith('/meal-logs') || value.startsWith('/external-trainees') || value.startsWith('/clients')) return 'coaching';
    if (value.startsWith('/member-portal')) return 'portal';
    return null;
}

async function enforceTenantAccess(tenantId, { path = '', method = 'GET' } = {}) {
    const id = tenantIdValue(tenantId);
    await syncExpiredTenants();
    const pool = await getPool();
    const tenantResult = await pool.request().input('tenantId', sql.Int, id).query('SELECT TOP (1) id,status FROM dbo.gym_tenants WHERE id=@tenantId;');
    const tenant = tenantResult.recordset[0];
    if (!tenant) throw saasError('الجيم المطلوب غير موجود.', 404, 'TENANT_NOT_FOUND');
    if (String(tenant.status) === 'archived') throw saasError('هذا الجيم مؤرشف ولا يمكن الدخول إليه.', 403, 'TENANT_ARCHIVED');

    const subscription = await getCurrentSubscription(id);
    const canRecover = recoveryRequest(path, method);
    if (!subscription || !['active', 'trial'].includes(subscription.status) || (subscription.expiresAt && new Date(subscription.expiresAt).getTime() <= Date.now())) {
        if (canRecover) return { tenantStatus: tenant.status, subscription, recovery: true };
        throw saasError('اشتراك الجيم في منصة الجيم غير نشط أو انتهت مدته. يمكنك رفع إثبات دفع لتجديد الاشتراك.', 402, 'SAAS_SUBSCRIPTION_REQUIRED', { subscription, tenantStatus: tenant.status });
    }
    if (!['trial', 'active'].includes(String(tenant.status))) {
        if (canRecover) return { tenantStatus: tenant.status, subscription, recovery: true };
        throw saasError('تم إيقاف وصول هذا الجيم مؤقتًا. تواصل مع إدارة المنصة.', 403, 'TENANT_NOT_ACTIVE', { subscription, tenantStatus: tenant.status });
    }

    const feature = requiredFeature(path);
    if (feature && subscription.plan?.features && subscription.plan.features[feature] === false) {
        throw saasError('هذه الميزة غير متاحة في باقة الجيم الحالية.', 403, 'SAAS_FEATURE_NOT_INCLUDED', { feature, plan: subscription.plan.code });
    }
    return { tenantStatus: tenant.status, subscription, recovery: false };
}

async function getUsage(tenantId = currentTenantId({ required: true })) {
    const id = tenantIdValue(tenantId);
    await ensureSaasTables();
    const pool = await getPool();
    const [members, users, ai, storage] = await Promise.all([
        pool.request().input('tenantId', sql.Int, id).query('SELECT COUNT_BIG(*) AS total FROM dbo.members WHERE tenant_id=@tenantId;'),
        pool.request().input('tenantId', sql.Int, id).query("SELECT COUNT_BIG(*) AS total FROM dbo.gym_user_tenants WHERE tenant_id=@tenantId AND status='active';"),
        pool.request().input('tenantId', sql.Int, id).query("SELECT COUNT_BIG(*) AS total FROM dbo.gym_ai_generation_log WHERE tenant_id=@tenantId AND created_at >= DATEADD(month, DATEDIFF(month, 0, SYSUTCDATETIME()), 0);"),
        pool.request().input('tenantId', sql.Int, id).query(`SELECT
            ISNULL((SELECT SUM(CONVERT(BIGINT, DATALENGTH(content))) FROM dbo.gym_branding_assets WHERE tenant_id=@tenantId), 0)
            + ISNULL((SELECT SUM(CONVERT(BIGINT, content_bytes)) FROM dbo.gym_backup_archives WHERE tenant_id=@tenantId), 0)
            + ISNULL((SELECT SUM(CONVERT(BIGINT, file_size)) FROM dbo.saas_payment_proofs WHERE tenant_id=@tenantId), 0) AS total;`)
    ]);
    return {
        members: Number(members.recordset[0]?.total || 0),
        users: Number(users.recordset[0]?.total || 0),
        aiGenerations: Number(ai.recordset[0]?.total || 0),
        storageBytes: Number(storage.recordset[0]?.total || 0)
    };
}

async function enforceRequestLimit(tenantId, { path = '', method = 'GET', incomingBytes = 0 } = {}) {
    const normalizedPath = String(path || '');
    const normalizedMethod = String(method || 'GET').toUpperCase();
    if (normalizedMethod !== 'POST') return null;
    const resource = normalizedPath === '/members' ? 'members'
        : normalizedPath === '/auth/users' ? 'users'
            : normalizedPath.startsWith('/intelligence/') ? 'aiGenerations' : null;
    const isStorageUpload = normalizedPath === '/branding/assets'
        || normalizedPath === '/backup/restore'
        || /^\/saas\/subscription-requests\/\d+\/proof$/.test(normalizedPath);
    if (!resource && !isStorageUpload) return null;
    const access = await enforceTenantAccess(tenantId, { path, method });
    if (access.recovery) return null;
    const usage = await getUsage(tenantId);
    if (resource) {
        const limitKey = resource === 'members' ? 'maxMembers' : resource === 'users' ? 'maxUsers' : 'maxAiGenerations';
        const max = access.subscription?.plan?.[limitKey];
        if (max != null && usage[resource] >= max) {
            throw saasError('تم الوصول إلى حد الباقة الحالي. يمكنك ترقية الباقة من اشتراك المنصة.', 409, 'SAAS_PLAN_LIMIT_REACHED', { resource, used: usage[resource], max, plan: access.subscription.plan.code });
        }
    }
    if (isStorageUpload) {
        const maxStorageMb = access.subscription?.plan?.maxStorageMb;
        const requestedBytes = Math.max(0, Number(incomingBytes) || 0);
        const maxStorageBytes = maxStorageMb == null ? null : Number(maxStorageMb) * 1024 * 1024;
        if (maxStorageBytes != null && usage.storageBytes + requestedBytes > maxStorageBytes) {
            throw saasError('لا توجد مساحة كافية في باقة الجيم الحالية لرفع هذا الملف.', 409, 'SAAS_STORAGE_LIMIT_REACHED', { usedBytes: usage.storageBytes, incomingBytes: requestedBytes, maxBytes: maxStorageBytes, plan: access.subscription.plan.code });
        }
    }
    return { resource, used: resource ? usage[resource] : null, storageBytes: usage.storageBytes, maxStorageMb: access.subscription?.plan?.maxStorageMb ?? null };
}

async function ensureBootstrapSubscription(tenantId) {
    const id = tenantIdValue(tenantId);
    await ensureSaasTables();
    const pool = await getPool();
    const existing = await pool.request().input('tenantId', sql.Int, id).query('SELECT TOP (1) id FROM dbo.saas_tenant_subscriptions WHERE tenant_id=@tenantId ORDER BY id;');
    if (existing.recordset[0]) return getCurrentSubscription(id);
    const plan = await getPlan({ code: 'enterprise', includeInactive: true });
    if (!plan) throw saasError('تعذر تجهيز باقة Top Gym الأساسية.', 500, 'SAAS_BOOTSTRAP_PLAN_MISSING');
    const startsAt = new Date();
    await pool.request().input('tenantId', sql.Int, id).input('planId', sql.Int, plan.id).input('startsAt', sql.DateTime2(0), startsAt).query("INSERT INTO dbo.saas_tenant_subscriptions (tenant_id,plan_id,status,starts_at,expires_at,source,notes) VALUES (@tenantId,@planId,'active',@startsAt,NULL,'bootstrap',N'اشتراك تأسيسي لبيانات Top Gym الحالية.'); UPDATE dbo.gym_tenants SET status='active', updated_at=SYSUTCDATETIME() WHERE id=@tenantId;");
    await recordAudit({ tenantId: id, action: 'bootstrap_subscription', entityType: 'subscription', details: 'تم تجهيز اشتراك تأسيسي غير منتهٍ لـ Top Gym.' });
    return getCurrentSubscription(id);
}

async function listTenantRequests(tenantId = currentTenantId({ required: true })) {
    const id = tenantIdValue(tenantId);
    await ensureSaasTables();
    const pool = await getPool();
    const result = await pool.request().input('tenantId', sql.Int, id).query(`SELECT r.id,r.tenant_id,r.status,r.amount_snapshot,r.currency,r.notes,r.review_notes,r.requested_by_user_id,r.reviewed_by_user_id,r.reviewed_at,r.created_at,
                       t.name AS tenant_name,t.slug AS tenant_slug,u.full_name AS requested_by_name,
                       p.id AS plan_id,p.code,p.name,p.description,p.billing_period,p.price,p.currency AS plan_currency,p.max_members,p.max_users,p.max_ai_generations,p.max_storage_mb,p.features_json,p.is_active,p.sort_order,p.updated_at AS plan_updated_at,
                       proof.id AS proof_id,proof.file_name AS proof_file_name,proof.mime_type AS proof_mime_type,proof.file_size AS proof_file_size,proof.uploaded_at AS proof_uploaded_at
                FROM dbo.saas_subscription_requests r
                INNER JOIN dbo.gym_tenants t ON t.id=r.tenant_id
                INNER JOIN dbo.saas_plans p ON p.id=r.plan_id
                LEFT JOIN dbo.gym_users u ON u.id=r.requested_by_user_id
                LEFT JOIN dbo.saas_payment_proofs proof ON proof.request_id=r.id
                WHERE r.tenant_id=@tenantId ORDER BY r.created_at DESC,r.id DESC;`);
    return result.recordset.map(requestFromRow);
}

async function createSubscriptionRequest({ tenantId = currentTenantId({ required: true }), userId, planId, planCode, notes = '' }) {
    const id = tenantIdValue(tenantId);
    const actorId = Number(userId);
    if (!Number.isInteger(actorId) || actorId <= 0) throw saasError('الحساب المنفذ غير صحيح.', 400, 'INVALID_USER');
    const plan = await getPlan({ id: planId, code: planCode });
    if (!plan) throw saasError('الباقة المطلوبة غير متاحة.', 404, 'SAAS_PLAN_NOT_FOUND');
    const pool = await getPool();
    const pending = await pool.request().input('tenantId', sql.Int, id).query("SELECT TOP (1) id FROM dbo.saas_subscription_requests WHERE tenant_id=@tenantId AND status='pending' ORDER BY created_at DESC,id DESC;");
    if (pending.recordset[0]) throw saasError('لديك طلب اشتراك قيد المراجعة بالفعل.', 409, 'SAAS_REQUEST_ALREADY_PENDING');
    const result = await pool.request()
        .input('tenantId', sql.Int, id)
        .input('planId', sql.Int, plan.id)
        .input('userId', sql.Int, actorId)
        .input('amount', sql.Decimal(12, 2), plan.price)
        .input('currency', sql.Char(3), plan.currency)
        .input('notes', sql.NVarChar(1000), text(notes, '', 1000) || null)
        .query('INSERT INTO dbo.saas_subscription_requests (tenant_id,plan_id,requested_by_user_id,amount_snapshot,currency,notes) OUTPUT INSERTED.id VALUES (@tenantId,@planId,@userId,@amount,@currency,@notes);');
    const requestId = Number(result.recordset[0].id);
    await recordAudit({ tenantId: id, actorUserId: actorId, action: 'subscription_requested', entityType: 'subscription_request', entityId: requestId, details: `تم طلب باقة ${plan.code}.` });
    return (await listTenantRequests(id)).find((item) => item.id === requestId) || { id: requestId, plan, status: 'pending' };
}

function validateProof({ buffer, mimeType, fileName }) {
    const normalizedMime = String(mimeType || '').toLowerCase().split(';')[0].trim();
    if (!PROOF_MIME_TYPES.has(normalizedMime)) throw saasError('إثبات الدفع يجب أن يكون صورة PNG/JPG/WebP أو ملف PDF.', 400, 'INVALID_PAYMENT_PROOF_TYPE');
    if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > MAX_PROOF_BYTES) throw saasError('حجم إثبات الدفع يجب ألا يتجاوز 4 ميجابايت.', 400, 'PAYMENT_PROOF_TOO_LARGE');
    const cleanName = text(fileName, `payment-proof-${Date.now()}`, 255).replace(/[\\/:*?"<>|\r\n]/g, '_') || `payment-proof-${Date.now()}`;
    return { buffer, mimeType: normalizedMime, fileName: cleanName, sha256: crypto.createHash('sha256').update(buffer).digest('hex') };
}

async function uploadPaymentProof({ tenantId = currentTenantId({ required: true }), userId, requestId, buffer, mimeType, fileName }) {
    const id = tenantIdValue(tenantId);
    const proof = validateProof({ buffer, mimeType, fileName });
    const requestNumber = Number(requestId);
    if (!Number.isInteger(requestNumber) || requestNumber <= 0) throw saasError('طلب الاشتراك غير صحيح.', 400, 'INVALID_SUBSCRIPTION_REQUEST');
    const pool = await getPool();
    const requestResult = await pool.request().input('requestId', sql.BigInt, requestNumber).input('tenantId', sql.Int, id).query("SELECT TOP (1) id,status FROM dbo.saas_subscription_requests WHERE id=@requestId AND tenant_id=@tenantId;");
    const request = requestResult.recordset[0];
    if (!request) throw saasError('طلب الاشتراك غير موجود.', 404, 'SAAS_REQUEST_NOT_FOUND');
    if (request.status !== 'pending') throw saasError('لا يمكن تعديل إثبات طلب تمت مراجعته.', 409, 'SAAS_REQUEST_LOCKED');
    await pool.request().input('requestId', sql.BigInt, requestNumber).input('tenantId', sql.Int, id).input('fileName', sql.NVarChar(255), proof.fileName).input('mimeType', sql.VarChar(80), proof.mimeType).input('fileSize', sql.Int, proof.buffer.length).input('sha256', sql.Char(64), proof.sha256).input('content', sql.VarBinary(sql.MAX), proof.buffer).input('userId', sql.Int, Number(userId)).query(`UPDATE dbo.saas_payment_proofs SET file_name=@fileName,mime_type=@mimeType,file_size=@fileSize,sha256=@sha256,content=@content,uploaded_by_user_id=@userId,uploaded_at=SYSUTCDATETIME() WHERE request_id=@requestId AND tenant_id=@tenantId;
        IF @@ROWCOUNT=0 INSERT INTO dbo.saas_payment_proofs (request_id,tenant_id,file_name,mime_type,file_size,sha256,content,uploaded_by_user_id) VALUES (@requestId,@tenantId,@fileName,@mimeType,@fileSize,@sha256,@content,@userId);`);
    await recordAudit({ tenantId: id, actorUserId: Number(userId), action: 'payment_proof_uploaded', entityType: 'subscription_request', entityId: requestNumber, details: `تم رفع إثبات دفع: ${proof.fileName}.` });
    return (await listTenantRequests(id)).find((item) => item.id === requestNumber) || { id: requestNumber, proof: { fileName: proof.fileName, mimeType: proof.mimeType, fileSize: proof.buffer.length } };
}

async function listPlatformRequests({ status = '' } = {}) {
    await ensureSaasTables();
    const pool = await getPool();
    const result = await pool.request().input('status', sql.VarChar(20), text(status, '', 20).toLowerCase()).query(`SELECT r.id,r.tenant_id,r.status,r.amount_snapshot,r.currency,r.notes,r.review_notes,r.requested_by_user_id,r.reviewed_by_user_id,r.reviewed_at,r.created_at,
                       t.name AS tenant_name,t.slug AS tenant_slug,u.full_name AS requested_by_name,
                       p.id AS plan_id,p.code,p.name,p.description,p.billing_period,p.price,p.currency AS plan_currency,p.max_members,p.max_users,p.max_ai_generations,p.max_storage_mb,p.features_json,p.is_active,p.sort_order,p.updated_at AS plan_updated_at,
                       proof.id AS proof_id,proof.file_name AS proof_file_name,proof.mime_type AS proof_mime_type,proof.file_size AS proof_file_size,proof.uploaded_at AS proof_uploaded_at
                FROM dbo.saas_subscription_requests r
                INNER JOIN dbo.gym_tenants t ON t.id=r.tenant_id
                INNER JOIN dbo.saas_plans p ON p.id=r.plan_id
                LEFT JOIN dbo.gym_users u ON u.id=r.requested_by_user_id
                LEFT JOIN dbo.saas_payment_proofs proof ON proof.request_id=r.id
                WHERE (@status='' OR r.status=@status) ORDER BY CASE WHEN r.status='pending' THEN 0 ELSE 1 END,r.created_at DESC,r.id DESC;`);
    return result.recordset.map(requestFromRow);
}

async function getPaymentProofFile(proofId, tenantId = null) {
    await ensureSaasTables();
    const id = Number(proofId);
    if (!Number.isInteger(id) || id <= 0) throw saasError('إثبات الدفع غير صحيح.', 400, 'INVALID_PAYMENT_PROOF');
    const pool = await getPool();
    const result = await pool.request().input('id', sql.BigInt, id).input('tenantId', sql.Int, tenantId == null ? null : tenantId).query('SELECT TOP (1) file_name,mime_type,content FROM dbo.saas_payment_proofs WHERE id=@id AND (@tenantId IS NULL OR tenant_id=@tenantId);');
    return result.recordset[0] || null;
}

async function approveRequest(requestId, actorUserId, reviewNotes = '') {
    await ensureSaasTables();
    const id = Number(requestId);
    if (!Number.isInteger(id) || id <= 0) throw saasError('طلب الاشتراك غير صحيح.', 400, 'INVALID_SUBSCRIPTION_REQUEST');
    const actorId = Number(actorUserId);
    const now = new Date();
    let tenantId;
    await withTransaction(async (transaction) => {
        const result = await transaction.request().input('requestId', sql.BigInt, id).query(`SELECT TOP (1) r.*,t.name AS tenant_name,t.status AS tenant_status,p.id AS plan_id,p.code,p.name,p.description,p.billing_period,p.price,p.currency,p.max_members,p.max_users,p.max_ai_generations,p.max_storage_mb,p.features_json,p.is_active,p.sort_order,p.updated_at AS plan_updated_at,proof.id AS proof_id
            FROM dbo.saas_subscription_requests r WITH (UPDLOCK,HOLDLOCK) INNER JOIN dbo.gym_tenants t ON t.id=r.tenant_id INNER JOIN dbo.saas_plans p ON p.id=r.plan_id LEFT JOIN dbo.saas_payment_proofs proof ON proof.request_id=r.id WHERE r.id=@requestId;`);
        const request = result.recordset[0];
        if (!request) throw saasError('طلب الاشتراك غير موجود.', 404, 'SAAS_REQUEST_NOT_FOUND');
        if (request.status !== 'pending') throw saasError('تمت مراجعة طلب الاشتراك من قبل.', 409, 'SAAS_REQUEST_ALREADY_REVIEWED');
        if (!request.proof_id) throw saasError('لا يمكن قبول الطلب قبل رفع إثبات الدفع.', 409, 'PAYMENT_PROOF_REQUIRED');
        if (!request.is_active) throw saasError('الباقة المختارة غير مفعلة حاليًا.', 409, 'SAAS_PLAN_INACTIVE');
        tenantId = Number(request.tenant_id);
        const expiresAt = addBillingPeriod(now, request.billing_period);
        await transaction.request().input('requestId', sql.BigInt, id).input('actorId', sql.Int, actorId).input('reviewNotes', sql.NVarChar(1000), text(reviewNotes, '', 1000) || null).query("UPDATE dbo.saas_subscription_requests SET status='approved',reviewed_by_user_id=@actorId,reviewed_at=SYSUTCDATETIME(),review_notes=@reviewNotes,updated_at=SYSUTCDATETIME() WHERE id=@requestId;");
        await transaction.request().input('tenantId', sql.Int, tenantId).query("UPDATE dbo.saas_tenant_subscriptions SET status='expired',updated_at=SYSUTCDATETIME() WHERE tenant_id=@tenantId AND status IN ('trial','active');");
        await transaction.request().input('tenantId', sql.Int, tenantId).input('planId', sql.Int, Number(request.plan_id)).input('startsAt', sql.DateTime2(0), now).input('expiresAt', sql.DateTime2(0), expiresAt).input('actorId', sql.Int, actorId).input('notes', sql.NVarChar(1000), text(reviewNotes, '', 1000) || null).query("INSERT INTO dbo.saas_tenant_subscriptions (tenant_id,plan_id,status,starts_at,expires_at,source,approved_by_user_id,approved_at,notes) VALUES (@tenantId,@planId,'active',@startsAt,@expiresAt,'manual',@actorId,SYSUTCDATETIME(),@notes); UPDATE dbo.gym_tenants SET status='active',updated_at=SYSUTCDATETIME() WHERE id=@tenantId;");
        await recordAudit({ tenantId, actorUserId: actorId, action: 'subscription_approved', entityType: 'subscription_request', entityId: id, details: `تم قبول طلب الاشتراك وإنشاء اشتراك ${request.code}.`, executor: transaction });
    });
    return { request: (await listPlatformRequests()).find((item) => item.id === id) || null, subscription: await getCurrentSubscription(tenantId) };
}

async function rejectRequest(requestId, actorUserId, reviewNotes = '') {
    await ensureSaasTables();
    const id = Number(requestId);
    const notes = text(reviewNotes, '', 1000);
    if (!notes) throw saasError('سبب رفض الطلب مطلوب.', 400, 'REVIEW_NOTES_REQUIRED');
    const pool = await getPool();
    const result = await pool.request().input('requestId', sql.BigInt, id).query("SELECT TOP (1) tenant_id,status FROM dbo.saas_subscription_requests WHERE id=@requestId;");
    const request = result.recordset[0];
    if (!request) throw saasError('طلب الاشتراك غير موجود.', 404, 'SAAS_REQUEST_NOT_FOUND');
    if (request.status !== 'pending') throw saasError('تمت مراجعة طلب الاشتراك من قبل.', 409, 'SAAS_REQUEST_ALREADY_REVIEWED');
    await pool.request().input('requestId', sql.BigInt, id).input('actorId', sql.Int, Number(actorUserId)).input('notes', sql.NVarChar(1000), notes).query("UPDATE dbo.saas_subscription_requests SET status='rejected',reviewed_by_user_id=@actorId,reviewed_at=SYSUTCDATETIME(),review_notes=@notes,updated_at=SYSUTCDATETIME() WHERE id=@requestId;");
    await recordAudit({ tenantId: Number(request.tenant_id), actorUserId: Number(actorUserId), action: 'subscription_rejected', entityType: 'subscription_request', entityId: id, details: notes });
    return (await listPlatformRequests()).find((item) => item.id === id) || null;
}

function normalizeTenantInput(body = {}) {
    const name = text(body.name || body.tenantName, '', 160);
    const slug = text(body.slug || body.tenantSlug, '', 80).toLowerCase();
    if (name.length < 2) throw saasError('اسم الجيم مطلوب.', 400, 'INVALID_TENANT_NAME');
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length < 3) throw saasError('الـSlug يجب أن يحتوي على حروف وأرقام وشرطات فقط.', 400, 'INVALID_TENANT_SLUG');
    return { name, slug };
}

async function createTenantWithOwner(body = {}, actorUserId, authService) {
    await ensureSaasTables();
    if (!authService) throw saasError('خدمة الحسابات غير متاحة.', 500, 'AUTH_SERVICE_REQUIRED');
    const tenant = normalizeTenantInput(body);
    const ownerName = authService.validateName(body.ownerName || body.ownerFullName);
    const ownerEmail = authService.validateEmail(body.ownerEmail);
    const ownerPassword = authService.validatePassword(body.ownerPassword);
    await authService.ensureAuthReady();
    const plan = await getPlan({ code: String(body.trialPlanCode || 'starter').toLowerCase(), includeInactive: false });
    if (!plan) throw saasError('باقة التجربة غير متاحة.', 409, 'TRIAL_PLAN_NOT_FOUND');
    const existingTenant = await getPool();
    const conflict = await existingTenant.request().input('slug', sql.VarChar(80), tenant.slug).query('SELECT TOP (1) id FROM dbo.gym_tenants WHERE slug=@slug;');
    if (conflict.recordset[0]) throw saasError('هذا الـSlug مستخدم بالفعل.', 409, 'DUPLICATE_TENANT_SLUG');
    const passwordHash = await authService.hashPassword(ownerPassword);
    const startsAt = new Date();
    const expiresAt = new Date(startsAt.getTime() + TRIAL_DAYS * 86400000);
    let tenantId;
    let ownerId;
    try {
        await withTransaction(async (transaction) => {
            const tenantResult = await transaction.request().input('name', sql.NVarChar(160), tenant.name).input('slug', sql.VarChar(80), tenant.slug).query("INSERT INTO dbo.gym_tenants (name,slug,status) OUTPUT INSERTED.id VALUES (@name,@slug,'trial');");
            tenantId = Number(tenantResult.recordset[0].id);
            const ownerResult = await transaction.request().input('fullName', sql.NVarChar(120), ownerName).input('email', sql.NVarChar(254), ownerEmail).input('emailNormalized', sql.NVarChar(254), ownerEmail).input('passwordHash', sql.NVarChar(512), passwordHash).query("INSERT INTO dbo.gym_users (full_name,username,email,email_normalized,password_hash,role,status) OUTPUT INSERTED.id VALUES (@fullName,@email,@email,@emailNormalized,@passwordHash,'Owner','Active');");
            ownerId = Number(ownerResult.recordset[0].id);
            await transaction.request().input('userId', sql.Int, ownerId).input('tenantId', sql.Int, tenantId).query("INSERT INTO dbo.gym_user_tenants (user_id,tenant_id,role,status,is_primary) VALUES (@userId,@tenantId,'Owner','active',1);");
            await transaction.request().input('tenantId', sql.Int, tenantId).input('planId', sql.Int, plan.id).input('startsAt', sql.DateTime2(0), startsAt).input('expiresAt', sql.DateTime2(0), expiresAt).query("INSERT INTO dbo.saas_tenant_subscriptions (tenant_id,plan_id,status,starts_at,expires_at,source,notes) VALUES (@tenantId,@planId,'trial',@startsAt,@expiresAt,'trial',N'فترة تجربة مجانية.');");
            await recordAudit({ tenantId, actorUserId: actorUserId == null ? null : Number(actorUserId), action: 'tenant_created', entityType: 'tenant', entityId: tenantId, details: `تم إنشاء ${tenant.name} مع Owner أولي وباقة تجربة.`, executor: transaction });
        });
    } catch (error) {
        if (error.number === 2601 || error.number === 2627) throw saasError('البريد الإلكتروني أو الـSlug مستخدم بالفعل.', 409, 'DUPLICATE_TENANT_OWNER');
        throw error;
    }
    return { tenant: { id: tenantId, name: tenant.name, slug: tenant.slug, status: 'trial' }, owner: { id: ownerId, name: ownerName, email: ownerEmail }, subscription: await getCurrentSubscription(tenantId) };
}

async function updatePlan(planId, body = {}, actorUserId) {
    const id = Number(planId);
    if (!Number.isInteger(id) || id <= 0) throw saasError('الباقة غير صحيحة.', 400, 'INVALID_PLAN');
    const current = await getPlan({ id, includeInactive: true });
    if (!current) throw saasError('الباقة غير موجودة.', 404, 'SAAS_PLAN_NOT_FOUND');
    const price = body.price === undefined ? current.price : Number(body.price);
    if (!Number.isFinite(price) || price < 0) throw saasError('سعر الباقة غير صحيح.', 400, 'INVALID_PLAN_PRICE');
    const maxMembers = body.maxMembers === undefined ? current.maxMembers : integerOrNull(body.maxMembers, 'حد الأعضاء');
    const maxUsers = body.maxUsers === undefined ? current.maxUsers : integerOrNull(body.maxUsers, 'حد المستخدمين');
    const maxAiGenerations = body.maxAiGenerations === undefined ? current.maxAiGenerations : integerOrNull(body.maxAiGenerations, 'حد استخدام AI');
    const maxStorageMb = body.maxStorageMb === undefined ? current.maxStorageMb : integerOrNull(body.maxStorageMb, 'حد التخزين');
    const name = body.name === undefined ? current.name : text(body.name, current.name, 120);
    if (!name) throw saasError('اسم الباقة مطلوب.', 400, 'INVALID_PLAN_NAME');
    const billingPeriod = body.billingPeriod === undefined ? current.billingPeriod : String(body.billingPeriod).trim().toLowerCase();
    if (!['monthly', 'yearly'].includes(billingPeriod)) throw saasError('دورة فوترة الباقة غير صحيحة.', 400, 'INVALID_PLAN_PERIOD');
    const isActive = body.isActive === undefined ? current.isActive : ['true', '1', 'yes', 'on'].includes(String(body.isActive).trim().toLowerCase()) || body.isActive === true || body.isActive === 1;
    const features = body.features === undefined ? current.features : { ...current.features, ...parseFeatures(body.features) };
    const featureKeys = ['intelligence', 'coaching', 'store', 'reports', 'portal', 'prioritySupport'];
    const normalizedFeatures = Object.fromEntries(featureKeys.map((key) => [key, features[key] === true || features[key] === 1 || String(features[key]).toLowerCase() === 'true']));
    const pool = await getPool();
    await pool.request().input('id', sql.Int, id).input('name', sql.NVarChar(120), name).input('description', sql.NVarChar(500), body.description === undefined ? current.description : text(body.description, '', 500)).input('billingPeriod', sql.VarChar(20), billingPeriod).input('price', sql.Decimal(12, 2), price).input('maxMembers', sql.Int, maxMembers).input('maxUsers', sql.Int, maxUsers).input('maxAiGenerations', sql.Int, maxAiGenerations).input('maxStorageMb', sql.Int, maxStorageMb).input('features', sql.NVarChar(sql.MAX), JSON.stringify(normalizedFeatures)).input('isActive', sql.Bit, isActive ? 1 : 0).query('UPDATE dbo.saas_plans SET name=@name,description=@description,billing_period=@billingPeriod,price=@price,max_members=@maxMembers,max_users=@maxUsers,max_ai_generations=@maxAiGenerations,max_storage_mb=@maxStorageMb,features_json=@features,is_active=@isActive,updated_at=SYSUTCDATETIME() WHERE id=@id;');
    await recordAudit({ actorUserId: actorUserId == null ? null : Number(actorUserId), action: 'plan_updated', entityType: 'saas_plan', entityId: id, details: `تم تحديث الباقة ${current.code}.` });
    return getPlan({ id, includeInactive: true });
}

async function updateTenantStatus(tenantId, status, actorUserId, notes = '') {
    const id = tenantIdValue(tenantId);
    const nextStatus = String(status || '').trim().toLowerCase();
    if (!['trial', 'active', 'suspended', 'expired', 'archived'].includes(nextStatus)) throw saasError('حالة الجيم غير صحيحة.', 400, 'INVALID_TENANT_STATUS');
    const pool = await getPool();
    const result = await pool.request().input('tenantId', sql.Int, id).input('status', sql.VarChar(20), nextStatus).query('UPDATE dbo.gym_tenants SET status=@status,updated_at=SYSUTCDATETIME() OUTPUT INSERTED.id,INSERTED.name,INSERTED.slug,INSERTED.status WHERE id=@tenantId;');
    if (!result.recordset[0]) throw saasError('الجيم غير موجود.', 404, 'TENANT_NOT_FOUND');
    await recordAudit({ tenantId: id, actorUserId: actorUserId == null ? null : Number(actorUserId), action: 'tenant_status_changed', entityType: 'tenant', entityId: id, details: text(notes, `تم تغيير الحالة إلى ${nextStatus}.`, 2000) });
    return { id, name: result.recordset[0].name, slug: result.recordset[0].slug, status: result.recordset[0].status };
}

async function listTenants() {
    await syncExpiredTenants();
    const pool = await getPool();
    const result = await pool.request().query(`SELECT t.id,t.name,t.slug,t.status,t.created_at,t.updated_at,
        owner.id AS owner_id,owner.full_name AS owner_name,owner.email AS owner_email,
        s.id AS subscription_id,s.status AS subscription_status,s.starts_at,s.expires_at,s.source,
        p.code AS plan_code,p.name AS plan_name,p.billing_period,p.price,p.currency,
        members.total_members,users.total_users
        FROM dbo.gym_tenants t
        OUTER APPLY (SELECT TOP (1) u.id,u.full_name,u.email FROM dbo.gym_user_tenants ut INNER JOIN dbo.gym_users u ON u.id=ut.user_id WHERE ut.tenant_id=t.id AND ut.role='Owner' AND ut.status='active' ORDER BY ut.is_primary DESC,u.id) owner
        OUTER APPLY (SELECT TOP (1) s0.id,s0.status,s0.starts_at,s0.expires_at,s0.source,s0.plan_id FROM dbo.saas_tenant_subscriptions s0 WHERE s0.tenant_id=t.id ORDER BY CASE s0.status WHEN 'active' THEN 0 WHEN 'trial' THEN 1 WHEN 'expired' THEN 2 ELSE 3 END,s0.updated_at DESC,s0.id DESC) s
        LEFT JOIN dbo.saas_plans p ON p.id=s.plan_id
        OUTER APPLY (SELECT COUNT_BIG(*) AS total_members FROM dbo.members m WHERE m.tenant_id=t.id) members
        OUTER APPLY (SELECT COUNT_BIG(*) AS total_users FROM dbo.gym_user_tenants ut2 WHERE ut2.tenant_id=t.id AND ut2.status='active') users
        ORDER BY t.created_at DESC,t.id DESC;`);
    return result.recordset.map((row) => ({
        id: Number(row.id), name: row.name, slug: row.slug, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at,
        owner: row.owner_id ? { id: Number(row.owner_id), name: row.owner_name, email: row.owner_email } : null,
        subscription: row.subscription_id ? { id: Number(row.subscription_id), status: row.subscription_status, startsAt: row.starts_at, expiresAt: row.expires_at, source: row.source, plan: { code: row.plan_code, name: row.plan_name, billingPeriod: row.billing_period, price: Number(row.price || 0), currency: row.currency } } : null,
        usage: { members: Number(row.total_members || 0), users: Number(row.total_users || 0) }
    }));
}

async function getPlatformOverview() {
    await syncExpiredTenants();
    const pool = await getPool();
    const [counts, pending, recent] = await Promise.all([
        pool.request().query(`SELECT COUNT_BIG(*) AS total_tenants, SUM(CASE WHEN status IN ('trial','active') THEN 1 ELSE 0 END) AS live_tenants, SUM(CASE WHEN status='trial' THEN 1 ELSE 0 END) AS trial_tenants, SUM(CASE WHEN status='expired' THEN 1 ELSE 0 END) AS expired_tenants, SUM(CASE WHEN status='suspended' THEN 1 ELSE 0 END) AS suspended_tenants FROM dbo.gym_tenants;`),
        pool.request().query("SELECT COUNT_BIG(*) AS total FROM dbo.saas_subscription_requests WHERE status='pending';"),
        pool.request().query(`SELECT TOP (8) r.id,r.tenant_id,r.status,r.amount_snapshot,r.currency,r.notes,r.review_notes,r.requested_by_user_id,r.reviewed_by_user_id,r.reviewed_at,r.created_at,t.name AS tenant_name,t.slug AS tenant_slug,u.full_name AS requested_by_name,p.id AS plan_id,p.code,p.name,p.description,p.billing_period,p.price,p.currency AS plan_currency,p.max_members,p.max_users,p.max_ai_generations,p.max_storage_mb,p.features_json,p.is_active,p.sort_order,p.updated_at AS plan_updated_at,proof.id AS proof_id,proof.file_name AS proof_file_name,proof.mime_type AS proof_mime_type,proof.file_size AS proof_file_size,proof.uploaded_at AS proof_uploaded_at FROM dbo.saas_subscription_requests r INNER JOIN dbo.gym_tenants t ON t.id=r.tenant_id INNER JOIN dbo.saas_plans p ON p.id=r.plan_id LEFT JOIN dbo.gym_users u ON u.id=r.requested_by_user_id LEFT JOIN dbo.saas_payment_proofs proof ON proof.request_id=r.id ORDER BY CASE WHEN r.status='pending' THEN 0 ELSE 1 END,r.created_at DESC,r.id DESC;`)
    ]);
    const row = counts.recordset[0] || {};
    return { tenants: { total: Number(row.total_tenants || 0), live: Number(row.live_tenants || 0), trial: Number(row.trial_tenants || 0), expired: Number(row.expired_tenants || 0), suspended: Number(row.suspended_tenants || 0) }, pendingRequests: Number(pending.recordset[0]?.total || 0), recentRequests: recent.recordset.map(requestFromRow) };
}

async function listAudit({ tenantId = null, limit = 50 } = {}) {
    await ensureSaasTables();
    const pool = await getPool();
    const safeLimit = Math.min(200, Math.max(1, Number(limit) || 50));
    const result = await pool.request().input('tenantId', sql.Int, tenantId == null ? null : Number(tenantId)).query(`SELECT TOP (${safeLimit}) a.id,a.tenant_id,a.actor_user_id,a.action,a.entity_type,a.entity_id,a.details,a.created_at,u.full_name AS actor_name FROM dbo.saas_audit_log a LEFT JOIN dbo.gym_users u ON u.id=a.actor_user_id WHERE @tenantId IS NULL OR a.tenant_id=@tenantId ORDER BY a.created_at DESC,a.id DESC;`);
    return result.recordset.map((row) => ({ id: Number(row.id), tenantId: row.tenant_id == null ? null : Number(row.tenant_id), actorUserId: row.actor_user_id == null ? null : Number(row.actor_user_id), actorName: row.actor_name || null, action: row.action, entityType: row.entity_type, entityId: row.entity_id == null ? null : Number(row.entity_id), details: row.details || '', createdAt: row.created_at }));
}

module.exports = {
    DEFAULT_PLANS,
    MAX_PROOF_BYTES,
    PROOF_MIME_TYPES,
    SAAS_SCHEMA_SQL,
    SAAS_TABLES,
    approveRequest,
    createSubscriptionRequest,
    createTenantWithOwner,
    enforceRequestLimit,
    enforceTenantAccess,
    ensureBootstrapSubscription,
    ensureSaasTables,
    getCurrentSubscription,
    getPaymentProofFile,
    getPlatformOverview,
    getPlans,
    getTenantBilling,
    getUsage,
    listAudit,
    listPlatformRequests,
    listTenantRequests,
    listTenants,
    rejectRequest,
    syncExpiredTenants,
    updatePlan,
    updateTenantStatus,
    uploadPaymentProof
};
