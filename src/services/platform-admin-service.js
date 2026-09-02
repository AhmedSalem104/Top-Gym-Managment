'use strict';

const { getPool, sql } = require('../database');
const { withTransaction } = require('../database/transaction');
const saasService = require('./saas-service');
const sessionRepository = require('../repositories/session.repository');
const { TENANT_TYPE_VALUES, resolveTenantType } = require('../tenancy/tenant-types');

const TENANT_STATUSES = Object.freeze(['trial', 'active', 'suspended', 'expired', 'archived']);
const USER_STATUSES = Object.freeze(['Active', 'Disabled']);
const FEATURE_KEYS = Object.freeze(['intelligence', 'coaching', 'store', 'reports', 'portal', 'prioritySupport']);
const SORT_COLUMNS = Object.freeze({
    name: 'name',
    status: 'status',
    createdAt: 'created_at',
    expiresAt: 'expires_at',
    members: 'total_members',
    users: 'total_users',
    lastActivity: 'last_activity_at'
});

function platformError(message, statusCode = 400, code = 'PLATFORM_ADMIN_ERROR', details = null) {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.expose = true;
    error.code = code;
    if (details) error.saas = details;
    return error;
}

function idValue(value, label = 'Identifier') {
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0) throw platformError(`${label} is invalid.`, 400, 'INVALID_IDENTIFIER');
    return id;
}

function text(value, fallback = '', maxLength = 1000) {
    return String(value ?? fallback).replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, maxLength);
}

function dateValue(value, label, { required = false } = {}) {
    if (value === null || value === '' || value === undefined) {
        if (required) throw platformError(`${label} is required.`, 400, 'INVALID_DATE');
        return null;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw platformError(`${label} is invalid.`, 400, 'INVALID_DATE');
    return date;
}

function positiveOrNull(value, label) {
    if (value === null || value === '' || value === undefined) return null;
    const number = Number(value);
    if (!Number.isInteger(number) || number <= 0) throw platformError(`${label} must be a positive integer.`, 400, 'INVALID_LIMIT');
    return number;
}

function bool(value, fallback = false) {
    if (value === undefined || value === null || value === '') return fallback;
    return value === true || value === 1 || ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function requestMeta(request) {
    return {
        ipAddress: String(request?.ip || request?.socket?.remoteAddress || '').slice(0, 64),
        userAgent: String(request?.get?.('user-agent') || '').slice(0, 512)
    };
}

function tenantDto(row) {
    if (!row) return null;
    const expiresAt = row.expires_at ? new Date(row.expires_at) : null;
    const daysRemaining = expiresAt ? Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 86400000)) : null;
    return {
        id: Number(row.id),
        name: row.name,
        slug: row.slug,
        tenantType: resolveTenantType(row.tenant_type),
        status: row.status,
        contactPhone: row.contact_phone || null,
        contactEmail: row.contact_email || null,
        createdAt: row.created_at || null,
        updatedAt: row.updated_at || null,
        suspension: row.suspension_reason || row.suspended_at || row.suspend_until ? {
            reason: row.suspension_reason || '',
            suspendedAt: row.suspended_at || null,
            suspendUntil: row.suspend_until || null,
            billingOnly: Boolean(row.suspension_billing_only)
        } : null,
        archivedAt: row.archived_at || null,
        owner: row.owner_id ? {
            id: Number(row.owner_id),
            name: row.owner_name || '',
            email: row.owner_email || '',
            status: row.owner_status || 'Active',
            lastLoginAt: row.owner_last_login_at || null
        } : null,
        subscription: row.subscription_id ? {
            id: Number(row.subscription_id),
            status: row.subscription_status,
            startsAt: row.starts_at || null,
            expiresAt: row.expires_at || null,
            daysRemaining,
            source: row.source || 'manual',
            renewalStatus: row.renewal_status || 'manual',
            plan: row.plan_code ? {
                id: row.plan_id == null ? null : Number(row.plan_id),
                code: row.plan_code,
                name: row.plan_name,
                billingPeriod: row.billing_period,
                price: Number(row.price || 0),
                currency: row.currency || 'EGP'
            } : null
        } : null,
        usage: {
            members: Number(row.total_members || 0),
            users: Number(row.total_users || 0),
            aiGenerations: Number(row.total_ai_generations || 0),
            storageBytes: Number(row.storage_bytes || 0)
        },
        branches: {
            total: Number(row.total_branches || 0),
            active: Number(row.active_branches || 0),
            limit: row.max_branches == null ? null : Number(row.max_branches)
        },
        lastActivityAt: row.last_activity_at || null
    };
}

function userDto(row) {
    return {
        id: Number(row.id),
        name: row.full_name || '',
        email: row.email || '',
        role: row.membership_role || row.role || 'Assistant',
        accountRole: row.role || null,
        status: row.membership_status || row.status || 'Active',
        accountStatus: row.status || null,
        onboardingWhatsapp: row.onboarding_whatsapp || null,
        lastLoginAt: row.last_login_at || null,
        createdAt: row.created_at || null,
        membershipCreatedAt: row.membership_created_at || null
    };
}

function usageDto(usage, entitlements) {
    const limits = entitlements?.limits || {};
    const isTrainer = entitlements?.tenantType === 'independent_trainer';
    const rows = [
        ['members', isTrainer ? 'Clients' : 'Members', limits.maxMembers],
        ['users', 'Users', limits.maxUsers],
        ['aiGenerations', 'AI', limits.maxAiGenerations]
    ].map(([key, label, max]) => ({
        key,
        label,
        used: Number(usage?.[key] || 0),
        max: max == null ? null : Number(max),
        percent: max == null ? 0 : Math.min(100, Math.round((Number(usage?.[key] || 0) / Math.max(1, Number(max))) * 100))
    }));
    rows.push({
        key: 'storage',
        label: 'Storage',
        used: Number(usage?.storageBytes || 0),
        max: limits.maxStorageMb == null ? null : Number(limits.maxStorageMb) * 1024 * 1024,
        percent: limits.maxStorageMb == null ? 0 : Math.min(100, Math.round((Number(usage?.storageBytes || 0) / Math.max(1, Number(limits.maxStorageMb) * 1024 * 1024)) * 100))
    });
    return { ...usage, limits, rows };
}

async function ensureReady({ readOnly = false } = {}) {
    await saasService.ensureSaasTables({ readOnly });
}

async function getDashboard({ from = null, to = null, readOnly = false } = {}) {
    await ensureReady({ readOnly });
    if (!readOnly) await saasService.syncExpiredTenants();
    const pool = await getPool();
    const start = dateValue(from, 'From date') || new Date(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1);
    const end = dateValue(to, 'To date') || new Date();
    const [counts, usage, pending, expiring, newTenants, recentTenants, recentAudit] = await Promise.all([
        pool.request().query(`SELECT
            COUNT_BIG(*) AS total,
            SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) AS active,
            SUM(CASE WHEN status='trial' THEN 1 ELSE 0 END) AS trial,
            SUM(CASE WHEN status='suspended' THEN 1 ELSE 0 END) AS suspended,
            SUM(CASE WHEN status='expired' THEN 1 ELSE 0 END) AS expired,
            SUM(CASE WHEN status='archived' THEN 1 ELSE 0 END) AS archived
            FROM dbo.gym_tenants;`),
        pool.request().query(`SELECT
            (SELECT COUNT_BIG(*) FROM dbo.members) AS members,
            (SELECT COUNT_BIG(*) FROM dbo.gym_user_tenants WHERE status='active') AS users,
            (SELECT COUNT_BIG(*) FROM dbo.gym_ai_generation_log WHERE created_at >= DATEADD(month,DATEDIFF(month,0,SYSUTCDATETIME()),0)) AS ai_generations,
            ISNULL((SELECT SUM(CONVERT(BIGINT,COALESCE(storage_size_bytes,DATALENGTH(content)))) FROM dbo.gym_branding_assets),0)
              + ISNULL((SELECT SUM(CONVERT(BIGINT,content_bytes)) FROM dbo.gym_backup_archives),0)
              + ISNULL((SELECT SUM(CONVERT(BIGINT,file_size)) FROM dbo.saas_payment_proofs),0) AS storage_bytes;`),
        pool.request().query("SELECT COUNT_BIG(*) AS total FROM dbo.saas_subscription_requests WHERE status='pending';"),
        pool.request().query(`SELECT COUNT_BIG(*) AS total
            FROM dbo.gym_tenants t
            OUTER APPLY (SELECT TOP (1) s.expires_at FROM dbo.saas_tenant_subscriptions s WHERE s.tenant_id=t.id AND s.status IN ('trial','active') ORDER BY s.updated_at DESC,s.id DESC) s
            WHERE s.expires_at IS NOT NULL AND s.expires_at > SYSUTCDATETIME() AND s.expires_at <= DATEADD(day,30,SYSUTCDATETIME());`),
        pool.request().input('fromDate', sql.DateTime2(0), start).input('toDate', sql.DateTime2(0), end).query('SELECT COUNT_BIG(*) AS total FROM dbo.gym_tenants WHERE created_at >= @fromDate AND created_at < DATEADD(day,1,@toDate);'),
        pool.request().query(`SELECT TOP (8) t.id,t.name,t.slug,t.tenant_type,t.status,t.created_at,t.updated_at,s.expires_at,s.status AS subscription_status,p.code AS plan_code,p.name AS plan_name,p.billing_period,p.price,p.currency,owner.id AS owner_id,owner.full_name AS owner_name,owner.email AS owner_email,owner.status AS owner_status,owner.last_login_at AS owner_last_login_at,members.total_members,users.total_users,ai.total_ai_generations,storage.storage_bytes,last_activity.last_activity_at
            FROM dbo.gym_tenants t
            OUTER APPLY (SELECT TOP (1) s0.* FROM dbo.saas_tenant_subscriptions s0 WHERE s0.tenant_id=t.id ORDER BY CASE s0.status WHEN 'active' THEN 0 WHEN 'trial' THEN 1 WHEN 'expired' THEN 2 ELSE 3 END,s0.updated_at DESC,s0.id DESC) s
            LEFT JOIN dbo.saas_plans p ON p.id=s.plan_id
            OUTER APPLY (SELECT TOP (1) u.id,u.full_name,u.email,u.status,u.last_login_at FROM dbo.gym_user_tenants ut INNER JOIN dbo.gym_users u ON u.id=ut.user_id WHERE ut.tenant_id=t.id AND ut.role='Owner' ORDER BY ut.is_primary DESC,ut.status,u.id) owner
            OUTER APPLY (SELECT COUNT_BIG(*) AS total_members FROM dbo.members m WHERE m.tenant_id=t.id) members
            OUTER APPLY (SELECT COUNT_BIG(*) AS total_users FROM dbo.gym_user_tenants ut WHERE ut.tenant_id=t.id AND ut.status='active') users
            OUTER APPLY (SELECT COUNT_BIG(*) AS total_ai_generations FROM dbo.gym_ai_generation_log l WHERE l.tenant_id=t.id AND l.created_at >= DATEADD(month,DATEDIFF(month,0,SYSUTCDATETIME()),0)) ai
            OUTER APPLY (SELECT ISNULL((SELECT SUM(CONVERT(BIGINT,COALESCE(storage_size_bytes,DATALENGTH(content)))) FROM dbo.gym_branding_assets a WHERE a.tenant_id=t.id),0)+ISNULL((SELECT SUM(CONVERT(BIGINT,content_bytes)) FROM dbo.gym_backup_archives b WHERE b.tenant_id=t.id),0)+ISNULL((SELECT SUM(CONVERT(BIGINT,file_size)) FROM dbo.saas_payment_proofs sp WHERE sp.tenant_id=t.id),0) AS storage_bytes) storage
            OUTER APPLY (SELECT MAX(ses.last_seen_at) AS last_activity_at FROM dbo.gym_auth_sessions ses INNER JOIN dbo.gym_user_tenants ut2 ON ut2.user_id=ses.user_id WHERE ut2.tenant_id=t.id) last_activity
            ORDER BY t.created_at DESC,t.id DESC;`),
        saasService.listAudit({ limit: 12, readOnly })
    ]);
    const row = counts.recordset[0] || {};
    const usageRow = usage.recordset[0] || {};
    return {
        metrics: {
            gyms: { total: Number(row.total || 0), active: Number(row.active || 0), trial: Number(row.trial || 0), suspended: Number(row.suspended || 0), expired: Number(row.expired || 0), archived: Number(row.archived || 0) },
            newGyms: Number(newTenants.recordset[0]?.total || 0),
            members: Number(usageRow.members || 0),
            users: Number(usageRow.users || 0),
            aiGenerations: Number(usageRow.ai_generations || 0),
            storageBytes: Number(usageRow.storage_bytes || 0),
            pendingRequests: Number(pending.recordset[0]?.total || 0),
            expiringSubscriptions: Number(expiring.recordset[0]?.total || 0)
        },
        recentGyms: recentTenants.recordset.map(tenantDto),
        recentActivity: recentAudit
    };
}

const TENANT_LIST_FROM = `FROM dbo.gym_tenants t
    OUTER APPLY (SELECT TOP (1) s0.* FROM dbo.saas_tenant_subscriptions s0 WHERE s0.tenant_id=t.id ORDER BY CASE s0.status WHEN 'active' THEN 0 WHEN 'trial' THEN 1 WHEN 'expired' THEN 2 WHEN 'suspended' THEN 3 ELSE 4 END,s0.updated_at DESC,s0.id DESC) s
    LEFT JOIN dbo.saas_plans p ON p.id=s.plan_id
    OUTER APPLY (SELECT TOP (1) u.id,u.full_name,u.email,u.status,u.last_login_at FROM dbo.gym_user_tenants ut INNER JOIN dbo.gym_users u ON u.id=ut.user_id WHERE ut.tenant_id=t.id AND ut.role='Owner' ORDER BY ut.is_primary DESC,ut.status,u.id) owner
    OUTER APPLY (SELECT COUNT_BIG(*) AS total_members FROM dbo.members m WHERE m.tenant_id=t.id) members
    OUTER APPLY (SELECT COUNT_BIG(*) AS total_users FROM dbo.gym_user_tenants ut2 WHERE ut2.tenant_id=t.id AND ut2.status='active') users
    OUTER APPLY (SELECT COUNT_BIG(*) AS total_ai_generations FROM dbo.gym_ai_generation_log l WHERE l.tenant_id=t.id AND l.created_at >= DATEADD(month,DATEDIFF(month,0,SYSUTCDATETIME()),0)) ai
    OUTER APPLY (SELECT ISNULL((SELECT SUM(CONVERT(BIGINT,COALESCE(storage_size_bytes,DATALENGTH(content)))) FROM dbo.gym_branding_assets a WHERE a.tenant_id=t.id),0)+ISNULL((SELECT SUM(CONVERT(BIGINT,content_bytes)) FROM dbo.gym_backup_archives b WHERE b.tenant_id=t.id),0)+ISNULL((SELECT SUM(CONVERT(BIGINT,file_size)) FROM dbo.saas_payment_proofs sp WHERE sp.tenant_id=t.id),0) AS storage_bytes) storage
    OUTER APPLY (SELECT COUNT_BIG(*) AS total_branches,SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) AS active_branches FROM dbo.gym_branches b WHERE b.tenant_id=t.id) branch_usage
    OUTER APPLY (SELECT MAX(ses.last_seen_at) AS last_activity_at FROM dbo.gym_auth_sessions ses INNER JOIN dbo.gym_user_tenants ut3 ON ut3.user_id=ses.user_id WHERE ut3.tenant_id=t.id) last_activity`;

function tenantListSelect() {
    return `SELECT t.id,t.name,t.slug,t.tenant_type,t.status,t.contact_phone,t.contact_email,t.suspension_reason,t.suspended_at,t.suspend_until,t.suspension_billing_only,t.archived_at,t.created_at,t.updated_at,
        owner.id AS owner_id,owner.full_name AS owner_name,owner.email AS owner_email,owner.status AS owner_status,owner.last_login_at AS owner_last_login_at,
        s.id AS subscription_id,s.status AS subscription_status,s.starts_at,s.expires_at,s.source,s.renewal_status,p.id AS plan_id,p.code AS plan_code,p.name AS plan_name,p.billing_period,p.price,p.currency,p.max_branches,
        members.total_members,users.total_users,ai.total_ai_generations,storage.storage_bytes,branch_usage.total_branches,branch_usage.active_branches,last_activity.last_activity_at `;
}

function tenantListWhere() {
    return `WHERE (@search='' OR t.name LIKE @searchLike OR t.slug LIKE @searchLike OR owner.full_name LIKE @searchLike OR owner.email LIKE @searchLike OR CONVERT(VARCHAR(20),t.id)=@search)
        AND (@status='' OR t.status=@status)
        AND (@plan='' OR p.code=@plan)
        AND (@tenantType='' OR t.tenant_type=@tenantType)
        AND (@expiringDays=0 OR (s.expires_at IS NOT NULL AND s.expires_at > SYSUTCDATETIME() AND s.expires_at <= DATEADD(day,@expiringDays,SYSUTCDATETIME())))`;
}

async function listTenants({ search = '', status = '', plan = '', tenantType = '', sort = 'createdAt', direction = 'desc', page = 1, pageSize = 20, expiringDays = 0, readOnly = false } = {}) {
    await ensureReady({ readOnly });
    if (!readOnly) await saasService.syncExpiredTenants();
    const normalizedPage = Math.max(1, Number(page) || 1);
    const normalizedPageSize = Math.min(100, Math.max(5, Number(pageSize) || 20));
    const normalizedSearch = text(search, '', 120);
    const normalizedStatus = TENANT_STATUSES.includes(String(status).toLowerCase()) ? String(status).toLowerCase() : '';
    const normalizedPlan = text(plan, '', 40).toLowerCase();
    const normalizedTenantType = tenantType === '' || tenantType == null
        ? ''
        : TENANT_TYPE_VALUES.includes(String(tenantType).trim().toLowerCase())
            ? String(tenantType).trim().toLowerCase()
            : (() => { throw platformError('Tenant type filter is invalid.', 400, 'INVALID_TENANT_TYPE_FILTER'); })();
    const normalizedSort = SORT_COLUMNS[sort] || SORT_COLUMNS.createdAt;
    const normalizedDirection = String(direction).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    const normalizedExpiring = Math.min(365, Math.max(0, Number(expiringDays) || 0));
    const offset = (normalizedPage - 1) * normalizedPageSize;
    const pool = await getPool();
    const bind = (request) => request.input('search', sql.VarChar(120), normalizedSearch).input('searchLike', sql.NVarChar(140), `%${normalizedSearch}%`).input('status', sql.VarChar(20), normalizedStatus).input('plan', sql.VarChar(40), normalizedPlan).input('tenantType', sql.VarChar(32), normalizedTenantType).input('expiringDays', sql.Int, normalizedExpiring);
    const where = tenantListWhere();
    const countResult = await bind(pool.request()).query(`SELECT COUNT_BIG(*) AS total ${TENANT_LIST_FROM} ${where};`);
    const result = await bind(pool.request()).input('offset', sql.Int, offset).input('pageSize', sql.Int, normalizedPageSize).query(`${tenantListSelect()} ${TENANT_LIST_FROM} ${where} ORDER BY ${normalizedSort} ${normalizedDirection},t.id DESC OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;`);
    return {
        tenants: result.recordset.map(tenantDto),
        pagination: { page: normalizedPage, pageSize: normalizedPageSize, total: Number(countResult.recordset[0]?.total || 0), pages: Math.max(1, Math.ceil(Number(countResult.recordset[0]?.total || 0) / normalizedPageSize)) }
    };
}

async function getTenantUsers(tenantId) {
    const id = idValue(tenantId, 'Tenant id');
    const pool = await getPool();
    const result = await pool.request().input('tenantId', sql.Int, id).query(`SELECT u.id,u.full_name,u.email,u.role,u.status,u.last_login_at,u.created_at,ut.role AS membership_role,ut.status AS membership_status,ut.created_at AS membership_created_at,
        onboarding.whatsapp AS onboarding_whatsapp
        FROM dbo.gym_user_tenants ut INNER JOIN dbo.gym_users u ON u.id=ut.user_id
        OUTER APPLY (SELECT TOP (1) r.whatsapp
            FROM dbo.saas_gym_registration_requests r
            WHERE r.created_tenant_id=ut.tenant_id AND r.created_owner_user_id=u.id AND r.status='approved'
            ORDER BY r.reviewed_at DESC,r.id DESC) onboarding
        WHERE ut.tenant_id=@tenantId AND ut.role IN ('Owner','Assistant') ORDER BY CASE WHEN ut.role='Owner' THEN 0 ELSE 1 END,u.full_name,u.id;`);
    return result.recordset.map(userDto);
}

async function getTenantStats(tenantId) {
    const id = idValue(tenantId, 'Tenant id');
    const pool = await getPool();
    const result = await pool.request().input('tenantId', sql.Int, id).query(`SELECT
        (SELECT COUNT_BIG(*) FROM dbo.members WHERE tenant_id=@tenantId) AS members_count,
        (SELECT COUNT_BIG(*) FROM dbo.memberships WHERE tenant_id=@tenantId AND cancelled_at IS NULL AND start_date <= CAST(SYSUTCDATETIME() AS DATE) AND end_date >= CAST(SYSUTCDATETIME() AS DATE)) AS active_memberships,
        (SELECT COUNT_BIG(*) FROM dbo.memberships WHERE tenant_id=@tenantId AND (cancelled_at IS NOT NULL OR end_date < CAST(SYSUTCDATETIME() AS DATE))) AS expired_memberships,
        (SELECT COUNT_BIG(*) FROM dbo.gym_attendance WHERE tenant_id=@tenantId AND attendance_date=CAST(SYSUTCDATETIME() AS DATE)) AS attendance_today,
        (SELECT COUNT_BIG(*) FROM dbo.gym_attendance WHERE tenant_id=@tenantId AND attendance_date >= DATEADD(month,DATEDIFF(month,0,SYSUTCDATETIME()),0)) AS attendance_month,
        (SELECT ISNULL(SUM(amount_paid),0) FROM dbo.gym_payment_transactions WHERE tenant_id=@tenantId AND paid_at >= DATEADD(month,DATEDIFF(month,0,SYSUTCDATETIME()),0) AND is_voided=0 AND amount_paid<>0)
          + (SELECT ISNULL(SUM(amount_paid),0) FROM dbo.gym_day_pass_sales WHERE tenant_id=@tenantId AND visit_date >= DATEADD(month,DATEDIFF(month,0,SYSUTCDATETIME()),0) AND status='completed' AND amount_paid>0) AS revenue_month,
        (SELECT ISNULL(SUM(amount),0) FROM dbo.gym_expenses WHERE tenant_id=@tenantId AND expense_date >= DATEADD(month,DATEDIFF(month,0,SYSUTCDATETIME()),0) AND ISNULL(is_voided,0)=0) AS expenses_month,
        (SELECT COUNT_BIG(*) FROM dbo.gym_store_sales WHERE tenant_id=@tenantId AND status='completed' AND sale_date >= DATEADD(month,DATEDIFF(month,0,SYSUTCDATETIME()),0)) AS store_sales_month,
        (SELECT COUNT_BIG(*) FROM dbo.gym_store_products WHERE tenant_id=@tenantId AND ISNULL(is_active,1)=1) AS products_count,
        (SELECT COUNT_BIG(*) FROM dbo.workout_programs WHERE tenant_id=@tenantId) AS workout_programs,
        (SELECT COUNT_BIG(*) FROM dbo.diet_plans WHERE tenant_id=@tenantId) AS diet_plans,
        (SELECT COUNT_BIG(*) FROM dbo.gym_member_feedback WHERE tenant_id=@tenantId) AS portal_feedback;`);
    const row = result.recordset[0] || {};
    return {
        members: Number(row.members_count || 0), activeMemberships: Number(row.active_memberships || 0), expiredMemberships: Number(row.expired_memberships || 0),
        attendanceToday: Number(row.attendance_today || 0), attendanceMonth: Number(row.attendance_month || 0), revenueMonth: Number(row.revenue_month || 0),
        expensesMonth: Number(row.expenses_month || 0), storeSalesMonth: Number(row.store_sales_month || 0), products: Number(row.products_count || 0),
        workoutPrograms: Number(row.workout_programs || 0), dietPlans: Number(row.diet_plans || 0), portalFeedback: Number(row.portal_feedback || 0)
    };
}

async function getTenantHealth(tenantId, { subscription = null, usage = null, entitlements = null } = {}) {
    const id = idValue(tenantId, 'Tenant id');
    const pool = await getPool();
    const [tenantResult, db, rls, activity, backup, failures] = await Promise.all([
        pool.request().input('tenantId', sql.Int, id).query('SELECT TOP (1) status FROM dbo.gym_tenants WHERE id=@tenantId;'),
        pool.request().query('SELECT 1 AS ok;'),
        pool.request().query(`SELECT COUNT(*) AS policies, SUM(CASE WHEN is_enabled=1 THEN 1 ELSE 0 END) AS enabled
            FROM sys.security_policies WHERE name=N'gym_tenant_security_policy' AND schema_id=SCHEMA_ID(N'dbo');`),
        pool.request().input('tenantId', sql.Int, id).query(`SELECT MAX(u.last_login_at) AS last_login_at,MAX(s.last_seen_at) AS last_successful_request
            FROM dbo.gym_user_tenants ut INNER JOIN dbo.gym_users u ON u.id=ut.user_id LEFT JOIN dbo.gym_auth_sessions s ON s.user_id=u.id
            WHERE ut.tenant_id=@tenantId;`),
        pool.request().input('tenantId', sql.Int, id).query('SELECT MAX(generated_at) AS last_backup FROM dbo.gym_backup_archives WHERE tenant_id=@tenantId;'),
            pool.request().input('tenantId', sql.Int, id).query("SELECT COUNT_BIG(*) AS total FROM dbo.gym_backup_operations WHERE tenant_id=@tenantId AND status='failed' AND created_at >= DATEADD(hour,-24,SYSUTCDATETIME());")
    ]);
    const tenant = tenantResult.recordset[0];
    if (!tenant) throw platformError('Gym was not found.', 404, 'TENANT_NOT_FOUND');
    const rlsRow = rls.recordset[0] || {};
    const activityRow = activity.recordset[0] || {};
    const maxStorage = entitlements?.limits?.maxStorageMb == null ? null : Number(entitlements.limits.maxStorageMb) * 1024 * 1024;
    const storagePercent = maxStorage == null ? 0 : Math.min(100, Math.round((Number(usage?.storageBytes || 0) / Math.max(1, maxStorage)) * 100));
    return {
        database: { status: db.recordset[0]?.ok === 1 ? 'healthy' : 'degraded' },
        tenantStatus: tenant.status,
        subscriptionEnforcement: { status: subscription && ['active', 'trial'].includes(subscription.status) ? 'active' : 'blocked', subscriptionStatus: subscription?.status || 'missing' },
        rls: { status: Number(rlsRow.policies || 0) > 0 && Number(rlsRow.enabled || 0) > 0 ? 'enabled' : 'needs_attention', policies: Number(rlsRow.policies || 0), enabled: Number(rlsRow.enabled || 0) },
        lastSuccessfulRequest: activityRow.last_successful_request || null,
        lastLogin: activityRow.last_login_at || null,
        lastBackup: backup.recordset[0]?.last_backup || null,
        storage: { status: storagePercent >= 100 ? 'limit_reached' : storagePercent >= 80 ? 'near_limit' : 'healthy', usedBytes: Number(usage?.storageBytes || 0), maxBytes: maxStorage, percent: storagePercent },
        ai: { status: entitlements?.features?.intelligence === false ? 'disabled_by_plan' : 'available', used: Number(usage?.aiGenerations || 0), max: entitlements?.limits?.maxAiGenerations ?? null },
        errorsLast24Hours: Number(failures.recordset[0]?.total || 0)
    };
}

async function getTenantNotes(tenantId) {
    const id = idValue(tenantId, 'Tenant id');
    const pool = await getPool();
    const result = await pool.request().input('tenantId', sql.Int, id).query(`SELECT TOP (100) n.id,n.tenant_id,n.note,n.created_by_user_id,n.created_at,u.full_name AS created_by_name
        FROM dbo.saas_platform_notes n LEFT JOIN dbo.gym_users u ON u.id=n.created_by_user_id WHERE n.tenant_id=@tenantId ORDER BY n.created_at DESC,n.id DESC;`);
    return result.recordset.map((row) => ({ id: Number(row.id), tenantId: Number(row.tenant_id), note: row.note, createdByUserId: row.created_by_user_id == null ? null : Number(row.created_by_user_id), createdByName: row.created_by_name || null, createdAt: row.created_at }));
}

async function getTenantChanges(tenantId) {
    const id = idValue(tenantId, 'Tenant id');
    const pool = await getPool();
    const result = await pool.request().input('tenantId', sql.Int, id).query(`SELECT TOP (50) c.id,c.tenant_id,c.subscription_id,c.new_plan_id,c.effective_at,c.status,c.reason,c.requested_by_user_id,c.applied_at,c.created_at,p.code AS plan_code,p.name AS plan_name,u.full_name AS requested_by_name
        FROM dbo.saas_subscription_changes c INNER JOIN dbo.saas_plans p ON p.id=c.new_plan_id LEFT JOIN dbo.gym_users u ON u.id=c.requested_by_user_id
        WHERE c.tenant_id=@tenantId ORDER BY c.created_at DESC,c.id DESC;`);
    return result.recordset.map((row) => ({ id: Number(row.id), tenantId: Number(row.tenant_id), subscriptionId: row.subscription_id == null ? null : Number(row.subscription_id), plan: { id: Number(row.new_plan_id), code: row.plan_code, name: row.plan_name }, effectiveAt: row.effective_at, status: row.status, reason: row.reason, requestedByUserId: row.requested_by_user_id == null ? null : Number(row.requested_by_user_id), requestedByName: row.requested_by_name || null, appliedAt: row.applied_at || null, createdAt: row.created_at }));
}

async function getTenantProfile(tenantId, { readOnly = false, paymentsPage = 1, paymentsPageSize = 25 } = {}) {
    const id = idValue(tenantId, 'Tenant id');
    await ensureReady({ readOnly });
    if (!readOnly) await saasService.syncExpiredTenants();
    const pool = await getPool();
    const tenantResult = await pool.request().input('tenantId', sql.Int, id).query(`SELECT TOP (1) t.id,t.name,t.slug,t.tenant_type,t.status,t.contact_phone,t.contact_email,t.suspension_reason,t.suspended_at,t.suspend_until,t.suspension_billing_only,t.archived_at,t.created_at,t.updated_at,
        branch_usage.total_branches,branch_usage.active_branches,
        owner.id AS owner_id,owner.full_name AS owner_name,owner.email AS owner_email,owner.status AS owner_status,owner.last_login_at AS owner_last_login_at
        FROM dbo.gym_tenants t OUTER APPLY (SELECT TOP (1) u.id,u.full_name,u.email,u.status,u.last_login_at FROM dbo.gym_user_tenants ut INNER JOIN dbo.gym_users u ON u.id=ut.user_id WHERE ut.tenant_id=t.id AND ut.role='Owner' ORDER BY ut.is_primary DESC,ut.status,u.id) owner
        OUTER APPLY (SELECT COUNT_BIG(*) AS total_branches,SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) AS active_branches FROM dbo.gym_branches b WHERE b.tenant_id=t.id) branch_usage
        WHERE t.id=@tenantId;`);
    if (!tenantResult.recordset[0]) throw platformError('Gym was not found.', 404, 'TENANT_NOT_FOUND');
    const tenant = tenantDto(tenantResult.recordset[0]);
    const subscription = await saasService.getCurrentSubscription(id, { readOnly });
    const [usage, entitlements, users, stats, requests, audit, notes, changes] = await Promise.all([
        saasService.getUsage(id, { readOnly }),
        saasService.getEffectiveEntitlements(id, subscription, { readOnly }),
        getTenantUsers(id),
        getTenantStats(id),
        saasService.listTenantRequests(id, { readOnly, page: paymentsPage, pageSize: paymentsPageSize, includePagination: true }),
        saasService.listAudit({ tenantId: id, limit: 100, readOnly }),
        getTenantNotes(id),
        getTenantChanges(id)
    ]);
    const finalHealth = await getTenantHealth(id, { subscription, usage, entitlements });
    tenant.subscription = subscription;
    tenant.usage = usageDto(usage, entitlements);
    tenant.branches = { ...(tenant.branches || {}), limit: entitlements.limits?.maxBranches ?? null };
    return {
        tenant,
        subscription,
        entitlements: { limits: entitlements.limits, features: entitlements.features, overrides: entitlements.overrides },
        users,
        stats,
        payments: requests.requests,
        paymentsPagination: requests.pagination,
        health: finalHealth,
        audit,
        notes,
        scheduledChanges: changes
    };
}

async function getTenantRow(tenantId, executor = null) {
    const id = idValue(tenantId, 'Tenant id');
    const connection = executor || await getPool();
    const result = await connection.request().input('tenantId', sql.Int, id).query('SELECT TOP (1) id,name,slug,tenant_type,status,contact_phone,contact_email,suspension_reason,suspended_at,suspend_until,suspension_billing_only,archived_at,archived_by_user_id,created_at,updated_at FROM dbo.gym_tenants WHERE id=@tenantId;');
    return result.recordset[0] || null;
}

function tenantState(row) {
    if (!row) return null;
    return { id: Number(row.id), name: row.name, slug: row.slug, tenantType: resolveTenantType(row.tenant_type), status: row.status, suspensionReason: row.suspension_reason || '', suspendedAt: row.suspended_at || null, suspendUntil: row.suspend_until || null, billingOnly: Boolean(row.suspension_billing_only), archivedAt: row.archived_at || null };
}

async function updateTenantStatus(tenantId, body = {}, actorUserId, meta = {}) {
    const id = idValue(tenantId, 'Tenant id');
    const nextStatus = String(body.status || '').trim().toLowerCase();
    if (!TENANT_STATUSES.includes(nextStatus)) throw platformError('Tenant status is invalid.', 400, 'INVALID_TENANT_STATUS');
    const reason = text(body.reason, '', 1000);
    if (['suspended', 'archived'].includes(nextStatus) && !reason) throw platformError('A reason is required for this action.', 400, 'REASON_REQUIRED');
    const suspendUntil = dateValue(body.suspendUntil, 'Suspension end date');
    let before;
    let after;
    await withTransaction(async (transaction) => {
        const current = await getTenantRow(id, transaction);
        if (!current) throw platformError('Gym was not found.', 404, 'TENANT_NOT_FOUND');
        before = tenantState(current);
        await transaction.request().input('tenantId', sql.Int, id).input('status', sql.VarChar(20), nextStatus).input('reason', sql.NVarChar(1000), reason || null).input('suspendUntil', sql.DateTime2(0), suspendUntil).input('billingOnly', sql.Bit, bool(body.billingOnly, true) ? 1 : 0).input('actorId', sql.Int, actorUserId == null ? null : Number(actorUserId)).query(`UPDATE dbo.gym_tenants
            SET status=@status,
                suspension_reason=CASE WHEN @status='suspended' THEN @reason ELSE NULL END,
                suspended_at=CASE WHEN @status='suspended' THEN COALESCE(suspended_at,SYSUTCDATETIME()) ELSE NULL END,
                suspend_until=CASE WHEN @status='suspended' THEN @suspendUntil ELSE NULL END,
                suspension_billing_only=CASE WHEN @status='suspended' THEN @billingOnly ELSE 1 END,
                archived_at=CASE WHEN @status='archived' THEN COALESCE(archived_at,SYSUTCDATETIME()) ELSE NULL END,
                archived_by_user_id=CASE WHEN @status='archived' THEN @actorId ELSE NULL END,
                updated_at=SYSUTCDATETIME()
            WHERE id=@tenantId;`);
        const updated = await getTenantRow(id, transaction);
        after = tenantState(updated);
        await saasService.recordAudit({ tenantId: id, actorUserId, action: `tenant_${nextStatus}`, entityType: 'tenant', entityId: id, details: `Tenant status changed to ${nextStatus}.`, reason, before, after, ...meta, executor: transaction });
    });
    return { tenant: after, before, after };
}

function normalizeSubscriptionAction(body) {
    const action = String(body.action || body.operation || '').trim().toLowerCase();
    const aliases = { activate: 'activate', convert_trial: 'activate', 'convert-trial': 'activate', lifetime: 'grant_lifetime', grant_lifetime: 'grant_lifetime', expire: 'expire', suspend: 'suspend', reactivate: 'reactivate', cancel: 'cancel', extend: 'extend', shorten: 'shorten', set_dates: 'set_dates', 'set-dates': 'set_dates', change_plan: 'change_plan', 'change-plan': 'change_plan', upgrade: 'change_plan', downgrade: 'change_plan' };
    return aliases[action] || action;
}

async function planForBody(body, { required = false, tenantId = null } = {}) {
    if (body.planId === undefined && body.planCode === undefined) {
        if (required) throw platformError('A plan is required.', 400, 'PLAN_REQUIRED');
        return null;
    }
    const plan = await saasService.getPlan({ id: body.planId, code: body.planCode, includeInactive: true });
    if (!plan) throw platformError('The selected plan was not found.', 404, 'SAAS_PLAN_NOT_FOUND');
    if (tenantId != null) await saasService.assertPlanCompatibleWithTenant(tenantId, plan);
    return plan;
}

async function updateTenantSubscription(tenantId, body = {}, actorUserId, meta = {}) {
    const id = idValue(tenantId, 'Tenant id');
    await ensureReady();
    const action = normalizeSubscriptionAction(body);
    const dangerous = ['suspend', 'expire', 'cancel', 'shorten', 'change_plan'];
    const reason = text(body.reason, '', 1000);
    if (!action) throw platformError('Subscription action is required.', 400, 'SUBSCRIPTION_ACTION_REQUIRED');
    if (dangerous.includes(action) && !reason) throw platformError('A reason is required for this subscription action.', 400, 'REASON_REQUIRED');
    const current = await saasService.getCurrentSubscription(id);
    const selectedPlan = await planForBody(body, { required: ['change_plan', 'activate', 'grant_lifetime'].includes(action) && !current, tenantId: id });
    if (action === 'change_plan' && !selectedPlan) throw platformError('A new plan is required.', 400, 'PLAN_REQUIRED');
    const when = String(body.effective || body.apply || 'immediate').toLowerCase();
    if (action === 'change_plan' && when === 'renewal') {
        if (!current) throw platformError('A renewal change requires an existing subscription.', 409, 'SUBSCRIPTION_REQUIRED');
        const effectiveAt = current.expiresAt ? new Date(current.expiresAt) : new Date();
        let scheduled;
        await withTransaction(async (transaction) => {
            await transaction.request().input('tenantId', sql.Int, id).input('subscriptionId', sql.BigInt, current.id).input('planId', sql.Int, selectedPlan.id).input('effectiveAt', sql.DateTime2(0), effectiveAt).input('reason', sql.NVarChar(1000), reason).input('actorId', sql.Int, actorUserId == null ? null : Number(actorUserId)).query("UPDATE dbo.saas_subscription_changes SET status='cancelled',updated_at=SYSUTCDATETIME() WHERE tenant_id=@tenantId AND status='scheduled'; INSERT INTO dbo.saas_subscription_changes (tenant_id,subscription_id,new_plan_id,effective_at,status,reason,requested_by_user_id) OUTPUT INSERTED.id VALUES (@tenantId,@subscriptionId,@planId,@effectiveAt,'scheduled',@reason,@actorId);");
            await transaction.request().input('subscriptionId', sql.BigInt, current.id).query("UPDATE dbo.saas_tenant_subscriptions SET renewal_status='scheduled',updated_at=SYSUTCDATETIME() WHERE id=@subscriptionId;");
            const change = await transaction.request().input('tenantId', sql.Int, id).query('SELECT TOP (1) id,tenant_id,subscription_id,new_plan_id,effective_at,status,reason,requested_by_user_id,created_at FROM dbo.saas_subscription_changes WHERE tenant_id=@tenantId AND status=\'scheduled\' ORDER BY id DESC;');
            scheduled = change.recordset[0] || null;
            await saasService.recordAudit({ tenantId: id, actorUserId, action: 'subscription_plan_scheduled', entityType: 'subscription', entityId: current.id, details: `Plan ${selectedPlan.code} scheduled for renewal.`, reason, before: current, after: { plan: selectedPlan, effectiveAt }, ...meta, executor: transaction });
        });
        return { subscription: await saasService.getCurrentSubscription(id), scheduledChange: scheduled ? { id: Number(scheduled.id), effectiveAt: scheduled.effective_at, status: scheduled.status, plan: selectedPlan, reason: scheduled.reason } : null };
    }

    const oldState = current ? { id: current.id, status: current.status, startsAt: current.startsAt, expiresAt: current.expiresAt, plan: current.plan, priceSnapshot: current.priceSnapshot, limitsSnapshot: current.limitsSnapshot, featuresSnapshot: current.featuresSnapshot } : null;
    let nextStatus = current?.status || 'active';
    let startsAt = current?.startsAt ? new Date(current.startsAt) : new Date();
    let expiresAt = current?.expiresAt ? new Date(current.expiresAt) : null;
    let nextPlan = selectedPlan || current?.plan;
    let notes = body.notes === undefined ? current?.notes || '' : text(body.notes, '', 1000);
    let autoRenew = body.autoRenew === undefined ? Boolean(current?.autoRenew) : bool(body.autoRenew);
    if (!nextPlan && action !== 'expire' && action !== 'cancel' && action !== 'suspend') nextPlan = await saasService.getPlan({ code: 'starter', includeInactive: false });
    if (nextPlan && ['activate', 'grant_lifetime', 'reactivate', 'change_plan'].includes(action)) {
        await saasService.assertPlanCompatibleWithTenant(id, nextPlan);
    }
    if (action === 'activate') {
        nextStatus = 'active';
        if (!current || !expiresAt || expiresAt.getTime() <= Date.now()) expiresAt = addPeriod(new Date(), nextPlan?.billingPeriod || 'monthly');
    } else if (action === 'grant_lifetime') {
        nextStatus = 'active';
        expiresAt = null;
    } else if (action === 'expire') {
        nextStatus = 'expired';
        expiresAt = expiresAt || new Date();
    } else if (action === 'suspend') {
        nextStatus = 'suspended';
    } else if (action === 'reactivate') {
        if (expiresAt && expiresAt.getTime() <= Date.now()) throw platformError('The subscription has expired; extend or set a new expiry date first.', 409, 'SUBSCRIPTION_EXPIRED');
        nextStatus = 'active';
    } else if (action === 'cancel') {
        nextStatus = 'cancelled';
    } else if (action === 'extend' || action === 'shorten') {
        const days = Number(body.days);
        if (!Number.isInteger(days) || days <= 0) throw platformError('Days must be a positive integer.', 400, 'INVALID_SUBSCRIPTION_DAYS');
        const baseDate = expiresAt && expiresAt.getTime() > Date.now() ? expiresAt : new Date();
        expiresAt = new Date(baseDate.getTime() + (action === 'extend' ? days : -days) * 86400000);
        if (expiresAt.getTime() <= Date.now()) nextStatus = 'expired';
        else nextStatus = 'active';
    } else if (action === 'set_dates') {
        startsAt = dateValue(body.startsAt, 'Start date', { required: true });
        expiresAt = dateValue(body.expiresAt, 'Expiry date');
        if (expiresAt && expiresAt.getTime() <= startsAt.getTime()) throw platformError('Expiry date must be after the start date.', 400, 'INVALID_SUBSCRIPTION_DATES');
        nextStatus = expiresAt && expiresAt.getTime() <= Date.now() ? 'expired' : (current?.status === 'trial' ? 'trial' : 'active');
    } else if (action === 'change_plan') {
        nextStatus = current?.status === 'trial' ? 'trial' : (current?.status === 'active' ? 'active' : 'active');
    } else {
        throw platformError('Unsupported subscription action.', 400, 'UNSUPPORTED_SUBSCRIPTION_ACTION');
    }

    let subscriptionId = current?.id || null;
    const snapshot = saasService.snapshotForPlan(nextPlan);
    await withTransaction(async (transaction) => {
        if (subscriptionId) {
            await transaction.request().input('id', sql.BigInt, subscriptionId).input('planId', sql.Int, nextPlan?.id || current.plan.id).input('status', sql.VarChar(20), nextStatus).input('startsAt', sql.DateTime2(0), startsAt).input('expiresAt', sql.DateTime2(0), expiresAt).input('notes', sql.NVarChar(1000), notes || null).input('autoRenew', sql.Bit, autoRenew ? 1 : 0).input('billingPeriodSnapshot', sql.VarChar(20), snapshot.billingPeriod).input('priceSnapshot', sql.Decimal(12, 2), snapshot.price).input('maxMembersSnapshot', sql.Int, snapshot.maxMembers).input('maxUsersSnapshot', sql.Int, snapshot.maxUsers).input('maxAiGenerationsSnapshot', sql.Int, snapshot.maxAiGenerations).input('maxStorageMbSnapshot', sql.Int, snapshot.maxStorageMb).input('maxBranchesSnapshot', sql.Int, snapshot.maxBranches).input('featuresSnapshotJson', sql.NVarChar(sql.MAX), JSON.stringify(snapshot.features)).query(`UPDATE dbo.saas_tenant_subscriptions SET plan_id=@planId,status=@status,starts_at=@startsAt,expires_at=@expiresAt,notes=@notes,auto_renew=@autoRenew,billing_period_snapshot=@billingPeriodSnapshot,price_snapshot=@priceSnapshot,currency_snapshot=(SELECT TOP (1) currency FROM dbo.saas_plans WHERE id=@planId),max_members_snapshot=@maxMembersSnapshot,max_users_snapshot=@maxUsersSnapshot,max_ai_generations_snapshot=@maxAiGenerationsSnapshot,max_storage_mb_snapshot=@maxStorageMbSnapshot,max_branches_snapshot=@maxBranchesSnapshot,features_snapshot_json=@featuresSnapshotJson,renewal_status='manual',updated_at=SYSUTCDATETIME() WHERE id=@id;`);
        } else {
            if (!nextPlan) throw platformError('A plan is required to create a subscription.', 400, 'PLAN_REQUIRED');
            const insert = await transaction.request().input('tenantId', sql.Int, id).input('planId', sql.Int, nextPlan.id).input('status', sql.VarChar(20), nextStatus).input('startsAt', sql.DateTime2(0), startsAt).input('expiresAt', sql.DateTime2(0), expiresAt).input('notes', sql.NVarChar(1000), notes || null).input('actorId', sql.Int, actorUserId == null ? null : Number(actorUserId)).input('autoRenew', sql.Bit, autoRenew ? 1 : 0).input('billingPeriodSnapshot', sql.VarChar(20), snapshot.billingPeriod).input('priceSnapshot', sql.Decimal(12, 2), snapshot.price).input('maxMembersSnapshot', sql.Int, snapshot.maxMembers).input('maxUsersSnapshot', sql.Int, snapshot.maxUsers).input('maxAiGenerationsSnapshot', sql.Int, snapshot.maxAiGenerations).input('maxStorageMbSnapshot', sql.Int, snapshot.maxStorageMb).input('maxBranchesSnapshot', sql.Int, snapshot.maxBranches).input('featuresSnapshotJson', sql.NVarChar(sql.MAX), JSON.stringify(snapshot.features)).query(`INSERT INTO dbo.saas_tenant_subscriptions (tenant_id,plan_id,status,starts_at,expires_at,source,auto_renew,notes,created_by_user_id,billing_period_snapshot,price_snapshot,currency_snapshot,max_members_snapshot,max_users_snapshot,max_ai_generations_snapshot,max_storage_mb_snapshot,max_branches_snapshot,features_snapshot_json) OUTPUT INSERTED.id VALUES (@tenantId,@planId,@status,@startsAt,@expiresAt,'admin',@autoRenew,@notes,@actorId,@billingPeriodSnapshot,@priceSnapshot,(SELECT TOP (1) currency FROM dbo.saas_plans WHERE id=@planId),@maxMembersSnapshot,@maxUsersSnapshot,@maxAiGenerationsSnapshot,@maxStorageMbSnapshot,@maxBranchesSnapshot,@featuresSnapshotJson);`);
            subscriptionId = Number(insert.recordset[0].id);
        }
        const tenantStatus = nextStatus === 'suspended' ? 'suspended' : ['expired', 'cancelled'].includes(nextStatus) ? 'expired' : 'active';
        await transaction.request().input('tenantId', sql.Int, id).input('tenantStatus', sql.VarChar(20), tenantStatus).query("UPDATE dbo.gym_tenants SET status=@tenantStatus,updated_at=SYSUTCDATETIME() WHERE id=@tenantId AND status <> 'archived';");
        await saasService.recordAudit({ tenantId: id, actorUserId, action: `subscription_${action}`, entityType: 'subscription', entityId: subscriptionId, details: `Subscription action ${action} completed.`, reason, before: oldState, after: { id: subscriptionId, status: nextStatus, startsAt, expiresAt, plan: nextPlan }, ...meta, executor: transaction });
    });
    const subscription = await saasService.getCurrentSubscription(id);
    const entitlements = await saasService.getEffectiveEntitlements(id, subscription);
    return { subscription, entitlements, action };
}

function normalizeFeatures(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return Object.fromEntries(FEATURE_KEYS.filter((key) => Object.prototype.hasOwnProperty.call(source, key)).map((key) => [key, bool(source[key])]));
}

async function updateOverrides(tenantId, body = {}, actorUserId, meta = {}) {
    const id = idValue(tenantId, 'Tenant id');
    const reason = text(body.reason, '', 1000);
    if (!reason) throw platformError('A reason is required when changing tenant overrides.', 400, 'REASON_REQUIRED');
    await ensureReady();
    const before = await saasService.getTenantOverrides(id);
    const values = {
        maxMembers: positiveOrNull(body.maxMembers, 'Members limit'),
        maxUsers: positiveOrNull(body.maxUsers, 'Users limit'),
        maxAiGenerations: positiveOrNull(body.maxAiGenerations, 'AI limit'),
        maxStorageMb: positiveOrNull(body.maxStorageMb, 'Storage limit'),
        maxBranches: positiveOrNull(body.maxBranches, 'Branch limit'),
        features: normalizeFeatures(body.features),
        notes: text(body.notes, '', 1000)
    };
    const clear = bool(body.clear) || (!values.maxMembers && !values.maxUsers && !values.maxAiGenerations && !values.maxStorageMb && !values.maxBranches && !Object.keys(values.features).length && !values.notes);
    const pool = await getPool();
    if (clear) {
        await pool.request().input('tenantId', sql.Int, id).query('DELETE FROM dbo.saas_tenant_overrides WHERE tenant_id=@tenantId;');
    } else {
        await pool.request().input('tenantId', sql.Int, id).input('maxMembers', sql.Int, values.maxMembers).input('maxUsers', sql.Int, values.maxUsers).input('maxAiGenerations', sql.Int, values.maxAiGenerations).input('maxStorageMb', sql.Int, values.maxStorageMb).input('maxBranches', sql.Int, values.maxBranches).input('features', sql.NVarChar(sql.MAX), JSON.stringify(values.features)).input('notes', sql.NVarChar(1000), values.notes || null).input('actorId', sql.Int, actorUserId == null ? null : Number(actorUserId)).query(`IF EXISTS (SELECT 1 FROM dbo.saas_tenant_overrides WHERE tenant_id=@tenantId)
            UPDATE dbo.saas_tenant_overrides SET max_members=@maxMembers,max_users=@maxUsers,max_ai_generations=@maxAiGenerations,max_storage_mb=@maxStorageMb,max_branches=@maxBranches,features_json=@features,notes=@notes,updated_by_user_id=@actorId,updated_at=SYSUTCDATETIME() WHERE tenant_id=@tenantId;
        ELSE
            INSERT INTO dbo.saas_tenant_overrides (tenant_id,max_members,max_users,max_ai_generations,max_storage_mb,max_branches,features_json,notes,created_by_user_id,updated_by_user_id) VALUES (@tenantId,@maxMembers,@maxUsers,@maxAiGenerations,@maxStorageMb,@maxBranches,@features,@notes,@actorId,@actorId);`);
    }
    const after = await saasService.getTenantOverrides(id);
    await saasService.recordAudit({ tenantId: id, actorUserId, action: clear ? 'tenant_overrides_cleared' : 'tenant_overrides_updated', entityType: 'tenant_entitlements', entityId: id, details: 'Tenant entitlement overrides changed.', reason: text(body.reason, '', 1000), before, after, ...meta });
    return { overrides: after, entitlements: await saasService.getEffectiveEntitlements(id) };
}

async function updateTenantProfile(tenantId, body = {}, actorUserId, meta = {}) {
    const id = idValue(tenantId, 'Tenant id');
    const name = text(body.name, '', 160);
    const contactEmail = text(body.contactEmail, '', 254);
    if (name && name.length < 2) throw platformError('Gym name is invalid.', 400, 'INVALID_TENANT_NAME');
    if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) throw platformError('Contact email is invalid.', 400, 'INVALID_EMAIL');
    const pool = await getPool();
    const before = await getTenantRow(id);
    if (!before) throw platformError('Gym was not found.', 404, 'TENANT_NOT_FOUND');
    await pool.request().input('tenantId', sql.Int, id).input('name', sql.NVarChar(160), name || before.name).input('phone', sql.NVarChar(40), body.contactPhone === undefined ? before.contact_phone : text(body.contactPhone, '', 40) || null).input('email', sql.NVarChar(254), body.contactEmail === undefined ? before.contact_email : contactEmail || null).query('UPDATE dbo.gym_tenants SET name=@name,contact_phone=@phone,contact_email=@email,updated_at=SYSUTCDATETIME() WHERE id=@tenantId;');
    const after = await getTenantRow(id);
    await saasService.recordAudit({ tenantId: id, actorUserId, action: 'tenant_profile_updated', entityType: 'tenant', entityId: id, details: 'Tenant profile updated.', before: tenantState(before), after: tenantState(after), ...meta });
    return { tenant: tenantState(after) };
}

async function updateTenantUserStatus(tenantId, userId, status, actorUserId, meta = {}) {
    const tenant = idValue(tenantId, 'Tenant id');
    const user = idValue(userId, 'User id');
    const nextStatus = String(status || '').trim();
    if (!USER_STATUSES.includes(nextStatus)) throw platformError('User status is invalid.', 400, 'INVALID_USER_STATUS');
    const pool = await getPool();
    const current = await pool.request().input('tenantId', sql.Int, tenant).input('userId', sql.Int, user).query(`SELECT TOP (1) u.id,u.full_name,u.email,u.role,u.status,ut.role AS membership_role,ut.status AS membership_status
        FROM dbo.gym_user_tenants ut INNER JOIN dbo.gym_users u ON u.id=ut.user_id WHERE ut.tenant_id=@tenantId AND ut.user_id=@userId;`);
    const row = current.recordset[0];
    if (!row) throw platformError('Tenant user was not found.', 404, 'TENANT_USER_NOT_FOUND');
    if (row.role === 'PlatformAdmin') throw platformError('PlatformAdmin access cannot be changed from a tenant profile.', 403, 'PLATFORM_ADMIN_PROTECTED');
    const before = { userId: user, role: row.membership_role, status: row.membership_status, accountStatus: row.status };
    await pool.request().input('tenantId', sql.Int, tenant).input('userId', sql.Int, user).input('status', sql.VarChar(20), nextStatus).query(`UPDATE dbo.gym_user_tenants SET status=LOWER(@status),updated_at=SYSUTCDATETIME() WHERE tenant_id=@tenantId AND user_id=@userId;
        UPDATE dbo.gym_users
        SET status=CASE
            WHEN @status='Active' THEN 'Active'
            WHEN EXISTS (SELECT 1 FROM dbo.gym_user_tenants WHERE user_id=@userId AND status='active') THEN 'Active'
            ELSE 'Disabled'
        END,
        updated_at=SYSUTCDATETIME()
        WHERE id=@userId AND role <> 'PlatformAdmin';`);
    const updated = await pool.request().input('tenantId', sql.Int, tenant).input('userId', sql.Int, user).query('SELECT TOP (1) u.status,ut.status AS membership_status FROM dbo.gym_user_tenants ut INNER JOIN dbo.gym_users u ON u.id=ut.user_id WHERE ut.tenant_id=@tenantId AND ut.user_id=@userId;');
    const updatedRow = updated.recordset[0] || {};
    if (updatedRow.status === 'Disabled') await sessionRepository.revokeForUser(user);
    const after = { ...before, status: updatedRow.membership_status || (nextStatus === 'Active' ? 'active' : 'disabled'), accountStatus: updatedRow.status || nextStatus };
    await saasService.recordAudit({ tenantId: tenant, actorUserId, action: nextStatus === 'Disabled' ? 'tenant_user_disabled' : 'tenant_user_enabled', entityType: 'user', entityId: user, details: `Tenant user ${nextStatus}.`, before, after, ...meta });
    return { userId: user, status: nextStatus };
}

async function resetTenantUserPassword(tenantId, userId, _legacyPassword, actorUserId, authService, meta = {}) {
    const tenant = idValue(tenantId, 'Tenant id');
    const user = idValue(userId, 'User id');
    if (!authService || typeof authService.generateTemporaryPassword !== 'function') throw platformError('Authentication service is unavailable.', 500, 'AUTH_SERVICE_REQUIRED');
    await authService.ensureAuthReady();
    const temporaryPassword = authService.generateTemporaryPassword();
    const hash = await authService.hashPassword(temporaryPassword);
    await withTransaction(async (transaction) => {
        const result = await transaction.request()
            .input('tenantId', sql.Int, tenant)
            .input('userId', sql.Int, user)
            .query("SELECT TOP (1) u.id,u.role,u.email,u.must_change_password FROM dbo.gym_user_tenants ut WITH (UPDLOCK,HOLDLOCK) INNER JOIN dbo.gym_users u WITH (UPDLOCK,HOLDLOCK) ON u.id=ut.user_id WHERE ut.tenant_id=@tenantId AND ut.user_id=@userId AND ut.status='active' AND u.role <> 'PlatformAdmin';");
        const current = result.recordset[0];
        if (!current) throw platformError('Tenant user was not found.', 404, 'TENANT_USER_NOT_FOUND');
        await transaction.request()
            .input('userId', sql.Int, user)
            .input('passwordHash', sql.NVarChar(512), hash)
            .query('UPDATE dbo.gym_users SET password_hash=@passwordHash,must_change_password=1,password_changed_at=NULL,updated_at=SYSUTCDATETIME() WHERE id=@userId AND role <> \'PlatformAdmin\';');
        await sessionRepository.revokeForUser(user, transaction);
        await saasService.recordAudit({
            tenantId: tenant,
            actorUserId,
            action: 'tenant_user_password_reset',
            entityType: 'user',
            entityId: user,
            details: 'Temporary credential issued; forced password change enabled and existing sessions revoked.',
            before: { mustChangePassword: Boolean(current.must_change_password) },
            after: { mustChangePassword: true },
            ...meta,
            executor: transaction
        });
    });
    // The plaintext is returned only in this response. It is never written to
    // the database, audit metadata, logs, or a later retrieval endpoint.
    return { userId: user, temporaryPassword, mustChangePassword: true, sessionsRevoked: true };
}

async function createOrChangeOwner(tenantId, body = {}, actorUserId, authService, meta = {}) {
    const tenant = idValue(tenantId, 'Tenant id');
    if (!authService) throw platformError('Authentication service is unavailable.', 500, 'AUTH_SERVICE_REQUIRED');
    const name = authService.validateName(body.name || body.fullName);
    const email = authService.validateEmail(body.email);
    const password = authService.validatePassword(body.password);
    const reason = text(body.reason, '', 1000);
    await authService.ensureAuthReady();
    const pool = await getPool();
    const existing = await pool.request().input('tenantId', sql.Int, tenant).query("SELECT TOP (1) u.id,u.role,u.email FROM dbo.gym_user_tenants ut INNER JOIN dbo.gym_users u ON u.id=ut.user_id WHERE ut.tenant_id=@tenantId AND ut.role='Owner' AND ut.status='active' ORDER BY ut.is_primary DESC,u.id;");
    if (existing.recordset[0] && bool(body.replaceExisting) && !reason) throw platformError('A reason is required when changing a tenant Owner.', 400, 'REASON_REQUIRED');
    if (existing.recordset[0] && !bool(body.replaceExisting)) throw platformError('This gym already has an Owner. Use replaceExisting to change the Owner.', 409, 'OWNER_ALREADY_EXISTS');
    const conflict = await pool.request().input('email', sql.NVarChar(254), email).query('SELECT TOP (1) id,role FROM dbo.gym_users WHERE email_normalized=@email;');
    if (conflict.recordset[0]) throw platformError('This email is already in use.', 409, 'DUPLICATE_USER_EMAIL');
    const hash = await authService.hashPassword(password);
    let ownerId;
    await withTransaction(async (transaction) => {
        if (existing.recordset[0]) {
            const oldOwnerId = Number(existing.recordset[0].id);
            const otherOwnerTenants = await transaction.request().input('userId', sql.Int, oldOwnerId).input('tenantId', sql.Int, tenant).query("SELECT COUNT_BIG(*) AS total FROM dbo.gym_user_tenants WHERE user_id=@userId AND status='active' AND role='Owner' AND tenant_id<>@tenantId;");
            if (Number(otherOwnerTenants.recordset[0]?.total || 0) > 0) throw platformError('The current Owner controls another gym and cannot be demoted here.', 409, 'OWNER_SHARED_WITH_OTHER_TENANT');
            await transaction.request().input('userId', sql.Int, oldOwnerId).input('tenantId', sql.Int, tenant).query("UPDATE dbo.gym_user_tenants SET role='Assistant',updated_at=SYSUTCDATETIME() WHERE user_id=@userId AND tenant_id=@tenantId; UPDATE dbo.gym_users SET role='Assistant',updated_at=SYSUTCDATETIME() WHERE id=@userId;");
            await sessionRepository.revokeForUser(oldOwnerId);
        }
        const result = await transaction.request().input('name', sql.NVarChar(120), name).input('email', sql.NVarChar(254), email).input('hash', sql.NVarChar(512), hash).query("INSERT INTO dbo.gym_users (full_name,username,email,email_normalized,password_hash,role,status) OUTPUT INSERTED.id VALUES (@name,@email,@email,@email,@hash,'Owner','Active');");
        ownerId = Number(result.recordset[0].id);
        await transaction.request().input('userId', sql.Int, ownerId).input('tenantId', sql.Int, tenant).query("INSERT INTO dbo.gym_user_tenants (user_id,tenant_id,role,status,is_primary) VALUES (@userId,@tenantId,'Owner','active',1);");
        await saasService.recordAudit({ tenantId: tenant, actorUserId, action: existing.recordset[0] ? 'owner_changed' : 'owner_created', entityType: 'user', entityId: ownerId, details: existing.recordset[0] ? 'Tenant Owner changed.' : 'Tenant Owner created.', reason: text(body.reason, '', 1000), after: { ownerId, email }, ...meta, executor: transaction });
    });
    return { owner: { id: ownerId, name, email } };
}

async function addNote(tenantId, note, actorUserId, meta = {}) {
    const id = idValue(tenantId, 'Tenant id');
    const value = text(note, '', 2000);
    if (!value) throw platformError('Note is required.', 400, 'NOTE_REQUIRED');
    const pool = await getPool();
    const result = await pool.request().input('tenantId', sql.Int, id).input('note', sql.NVarChar(2000), value).input('actorId', sql.Int, actorUserId == null ? null : Number(actorUserId)).query('INSERT INTO dbo.saas_platform_notes (tenant_id,note,created_by_user_id) OUTPUT INSERTED.id VALUES (@tenantId,@note,@actorId);');
    const noteId = Number(result.recordset[0].id);
    await saasService.recordAudit({ tenantId: id, actorUserId, action: 'platform_note_added', entityType: 'platform_note', entityId: noteId, details: 'Internal platform note added.', after: { noteId, note: value }, ...meta });
    return (await getTenantNotes(id)).find((item) => item.id === noteId) || { id: noteId, note: value };
}

function addPeriod(date, period) {
    const result = new Date(date.getTime());
    if (period === 'yearly') result.setUTCFullYear(result.getUTCFullYear() + 1);
    else result.setUTCMonth(result.getUTCMonth() + 1);
    return result;
}

module.exports = {
    addNote,
    createOrChangeOwner,
    getDashboard,
    getTenantHealth,
    getTenantNotes,
    getTenantProfile,
    getTenantUsers,
    listTenants,
    requestMeta,
    resetTenantUserPassword,
    updateOverrides,
    updateTenantProfile,
    updateTenantStatus,
    updateTenantSubscription,
    updateTenantUserStatus
};
