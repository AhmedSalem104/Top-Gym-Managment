'use strict';

const crypto = require('node:crypto');
const { getPool, sql } = require('../database');
const { withTransaction } = require('../database/transaction');
const { config } = require('../config/env');
const { currentTenantId, runTenantContext } = require('../tenancy/tenant-context');
const { todayInTimeZone } = require('../utils/date');
const commercialSchema = require('./commercial-schema');
const brandingService = require('./branding-service');
const saasService = require('./saas-service');

const PORTAL_SESSION_COOKIE = 'logicfit_portal_session';
const PORTAL_VISITOR_COOKIE = 'logicfit_portal_visitor';
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;
const TERM_CODES = new Set(['monthly', 'quarterly', 'semiannual', 'annual']);
const PAYMENT_CODE_PATTERN = /^[a-z0-9][a-z0-9_-]{1,59}$/;

function commercialError(message, statusCode = 400, code = 'COMMERCIAL_REQUEST_INVALID') {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.expose = true;
    error.code = code;
    return error;
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

function booleanValue(value, fallback = false) {
    if (value === undefined || value === null || value === '') return fallback;
    return value === true || value === 1 || ['true', '1', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function integer(value, label, { min = 1, max = 120 } = {}) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw commercialError(`${label} is invalid.`, 400, 'INVALID_COMMERCIAL_VALUE');
    return parsed;
}

function requireSecret() {
    const secret = String(config.memberPortalSessionSecret || '').trim();
    if (secret.length < 32) throw commercialError('Member portal sessions are not configured.', 503, 'PORTAL_SESSION_NOT_CONFIGURED');
    return secret;
}

function hashToken(token) {
    return crypto.createHmac('sha256', requireSecret()).update(String(token)).digest('hex');
}

function randomToken() {
    return crypto.randomBytes(32).toString('base64url');
}

function parseCookie(request, cookieName) {
    const header = String(request?.get?.('cookie') || '');
    const entry = header.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${cookieName}=`));
    if (!entry) return '';
    const encoded = entry.slice(cookieName.length + 1);
    if (!encoded || encoded.length > 256) return '';
    try {
        const value = decodeURIComponent(encoded);
        return TOKEN_PATTERN.test(value) ? value : '';
    } catch (_) {
        return '';
    }
}

function cookieSecure(request) {
    return config.nodeEnv === 'production' || request?.secure === true || String(request?.headers?.['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
}

function buildCookie(name, value, maxAge, request) {
    return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${Math.max(1, Math.floor(maxAge))}; HttpOnly; SameSite=Lax${cookieSecure(request) ? '; Secure' : ''}`;
}

function clearCookie(name, request) {
    return `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${cookieSecure(request) ? '; Secure' : ''}`;
}

function appendSetCookie(response, cookie) {
    const current = response.getHeader?.('Set-Cookie');
    const values = current ? (Array.isArray(current) ? current : [current]) : [];
    response.setHeader('Set-Cookie', [...values, cookie]);
}

function tenantIdValue(value = currentTenantId({ required: true })) {
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0) throw commercialError('A valid tenant is required.', 400, 'INVALID_TENANT');
    return id;
}

async function ensureCommercialTables({ readOnly = false } = {}) {
    await commercialSchema.ensureCommercialTables({ readOnly });
}

function planTermFromRow(row) {
    return {
        id: Number(row.term_id),
        code: String(row.term_code),
        durationMonths: Number(row.duration_months),
        price: Number(row.term_price || 0),
        currency: String(row.term_currency || 'EGP'),
        discountAmount: Number(row.discount_amount || 0),
        discountPercent: Number(row.discount_percent || 0),
        isActive: Boolean(row.term_active),
        sortOrder: Number(row.term_sort_order || 0)
    };
}

function planCatalogFromRows(rows) {
    const plans = new Map();
    for (const row of rows) {
        const id = Number(row.plan_id);
        if (!plans.has(id)) {
            plans.set(id, {
                id,
                code: String(row.plan_code),
                name: String(row.plan_name),
                description: row.plan_description || '',
                currency: String(row.plan_currency || 'EGP'),
                maxMembers: row.max_members == null ? null : Number(row.max_members),
                maxUsers: row.max_users == null ? null : Number(row.max_users),
                maxAiGenerations: row.max_ai_generations == null ? null : Number(row.max_ai_generations),
                maxStorageMb: row.max_storage_mb == null ? null : Number(row.max_storage_mb),
                features: parseFeatures(row.features_json),
                isActive: Boolean(row.plan_active),
                sortOrder: Number(row.plan_sort_order || 0),
                terms: []
            });
        }
        if (row.term_id != null && TERM_CODES.has(String(row.term_code))) plans.get(id).terms.push(planTermFromRow(row));
    }
    return [...plans.values()].map((plan) => ({
        ...plan,
        terms: plan.terms.sort((first, second) => first.sortOrder - second.sortOrder || first.id - second.id)
    }));
}

async function ensureDefaultPlanTerms() {
    await ensureCommercialTables();
    const pool = await getPool();
    const result = await pool.request().query(`
        SELECT id, billing_period, price, currency
        FROM dbo.saas_plans
        WHERE is_active=1;
    `);
    for (const plan of result.recordset || []) {
        const termCode = String(plan.billing_period).toLowerCase() === 'yearly' ? 'annual' : 'monthly';
        const durationMonths = termCode === 'annual' ? 12 : 1;
        await pool.request()
            .input('planId', sql.Int, Number(plan.id))
            .input('termCode', sql.VarChar(20), termCode)
            .input('durationMonths', sql.Int, durationMonths)
            .input('price', sql.Decimal(12, 2), Number(plan.price || 0))
            .input('currency', sql.Char(3), String(plan.currency || 'EGP').slice(0, 3).toUpperCase())
            .query(`
                IF NOT EXISTS (SELECT 1 FROM dbo.saas_plan_terms WHERE plan_id=@planId AND is_active=1)
                    INSERT INTO dbo.saas_plan_terms (plan_id,term_code,duration_months,price,currency,discount_amount,discount_percent,is_active,sort_order)
                    VALUES (@planId,@termCode,@durationMonths,@price,@currency,0,0,1,0);
            `);
    }
}

async function getCommercialPlanCatalog({ readOnly = false, tenantType = null } = {}) {
    await ensureCommercialTables({ readOnly });
    const pool = await getPool();
    const request = pool.request();
    const normalizedTenantType = tenantType == null ? '' : text(tenantType, '', 32).toLowerCase();
    request.input('tenantType', sql.VarChar(32), normalizedTenantType);
    const compatibilityFilter = normalizedTenantType
        ? ` AND EXISTS (SELECT 1 FROM dbo.saas_plan_tenant_types ptt WHERE ptt.plan_id=p.id AND ptt.tenant_type=@tenantType)`
        : '';
    const result = await request.query(`
        SELECT p.id AS plan_id,p.code AS plan_code,p.name AS plan_name,p.description AS plan_description,
               p.currency AS plan_currency,p.max_members,p.max_users,p.max_ai_generations,p.max_storage_mb,
               p.features_json,p.is_active AS plan_active,p.sort_order AS plan_sort_order,
               t.id AS term_id,t.term_code,t.duration_months,t.price AS term_price,t.currency AS term_currency,
               t.discount_amount,t.discount_percent,t.is_active AS term_active,t.sort_order AS term_sort_order
        FROM dbo.saas_plans p
        LEFT JOIN dbo.saas_plan_terms t ON t.plan_id=p.id AND t.is_active=1
        WHERE p.is_active=1${compatibilityFilter}
        ORDER BY p.sort_order,p.id,t.sort_order,t.id;
    `);
    return planCatalogFromRows(result.recordset || []);
}

function normalizePaymentMethod(body = {}, current = null) {
    const code = text(body.methodCode ?? body.code ?? current?.methodCode, '', 60).toLowerCase();
    if (!PAYMENT_CODE_PATTERN.test(code)) throw commercialError('Payment method code is invalid.', 400, 'INVALID_PAYMENT_METHOD_CODE');
    const displayName = text(body.displayName ?? body.name ?? current?.displayName, '', 120);
    const accountReference = text(body.accountReference ?? body.account ?? current?.accountReference, '', 160);
    if (!displayName || !accountReference) throw commercialError('Payment method name and account are required.', 400, 'PAYMENT_METHOD_DETAILS_REQUIRED');
    const sortOrder = body.sortOrder === undefined ? Number(current?.sortOrder || 0) : integer(body.sortOrder, 'Payment method order', { min: 0, max: 999 });
    return {
        methodCode: code,
        displayName,
        accountReference,
        recipientName: text(body.recipientName ?? body.recipient ?? current?.recipientName, '', 160) || null,
        instructions: text(body.instructions ?? current?.instructions, '', 1000) || null,
        isActive: body.isActive === undefined ? current?.isActive !== false : booleanValue(body.isActive),
        sortOrder
    };
}

function platformPaymentMethodFromRow(row) {
    return {
        id: Number(row.id),
        methodCode: String(row.method_code),
        displayName: String(row.display_name),
        accountReference: String(row.account_reference),
        recipientName: row.recipient_name || null,
        instructions: row.instructions || null,
        isActive: Boolean(row.is_active),
        sortOrder: Number(row.sort_order || 0),
        createdAt: row.created_at || null,
        updatedAt: row.updated_at || null
    };
}

async function listPlatformPaymentMethods({ activeOnly = false, readOnly = false } = {}) {
    await ensureCommercialTables({ readOnly });
    const pool = await getPool();
    const result = await pool.request().input('activeOnly', sql.Bit, activeOnly ? 1 : 0).query(`
        SELECT id,method_code,display_name,account_reference,recipient_name,instructions,is_active,sort_order,created_at,updated_at
        FROM dbo.saas_platform_payment_methods
        WHERE @activeOnly=0 OR is_active=1
        ORDER BY sort_order,id;
    `);
    return result.recordset.map(platformPaymentMethodFromRow);
}

async function savePlatformPaymentMethod(body, actorUserId, methodId = null) {
    await ensureCommercialTables();
    const id = methodId == null ? null : integer(methodId, 'Payment method id', { min: 1, max: Number.MAX_SAFE_INTEGER });
    const pool = await getPool();
    const existing = id == null ? null : (await pool.request().input('id', sql.BigInt, id).query('SELECT TOP (1) * FROM dbo.saas_platform_payment_methods WHERE id=@id;')).recordset[0] || null;
    if (id != null && !existing) throw commercialError('Platform payment method not found.', 404, 'PAYMENT_METHOD_NOT_FOUND');
    const values = normalizePaymentMethod(body, existing && platformPaymentMethodFromRow(existing));
    try {
        if (id == null) {
            await pool.request()
                .input('methodCode', sql.VarChar(60), values.methodCode)
                .input('displayName', sql.NVarChar(120), values.displayName)
                .input('accountReference', sql.NVarChar(160), values.accountReference)
                .input('recipientName', sql.NVarChar(160), values.recipientName)
                .input('instructions', sql.NVarChar(1000), values.instructions)
                .input('isActive', sql.Bit, values.isActive ? 1 : 0)
                .input('sortOrder', sql.Int, values.sortOrder)
                .input('actor', sql.Int, actorUserId || null)
                .query(`INSERT INTO dbo.saas_platform_payment_methods (method_code,display_name,account_reference,recipient_name,instructions,is_active,sort_order,created_by_user_id,updated_by_user_id)
                        VALUES (@methodCode,@displayName,@accountReference,@recipientName,@instructions,@isActive,@sortOrder,@actor,@actor);`);
        } else {
            await pool.request()
                .input('id', sql.BigInt, id)
                .input('methodCode', sql.VarChar(60), values.methodCode)
                .input('displayName', sql.NVarChar(120), values.displayName)
                .input('accountReference', sql.NVarChar(160), values.accountReference)
                .input('recipientName', sql.NVarChar(160), values.recipientName)
                .input('instructions', sql.NVarChar(1000), values.instructions)
                .input('isActive', sql.Bit, values.isActive ? 1 : 0)
                .input('sortOrder', sql.Int, values.sortOrder)
                .input('actor', sql.Int, actorUserId || null)
                .query(`UPDATE dbo.saas_platform_payment_methods
                        SET method_code=@methodCode,display_name=@displayName,account_reference=@accountReference,recipient_name=@recipientName,
                            instructions=@instructions,is_active=@isActive,sort_order=@sortOrder,updated_by_user_id=@actor,updated_at=SYSUTCDATETIME()
                        WHERE id=@id;`);
        }
    } catch (error) {
        if (saasService.isDuplicateSqlError?.(error)) throw commercialError('Payment method code is already used.', 409, 'DUPLICATE_PAYMENT_METHOD_CODE');
        throw error;
    }
    return (await listPlatformPaymentMethods({ readOnly: true })).find((item) => id == null ? item.methodCode === values.methodCode : item.id === id) || null;
}

function sessionCookieFor(request, token, expiresAt) {
    return buildCookie(PORTAL_SESSION_COOKIE, token, Math.max(1, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)), request);
}

async function createPortalSession({ tenantId, memberId, request }) {
    const id = tenantIdValue(tenantId);
    const member = integer(memberId, 'Member id', { min: 1, max: 2_147_483_647 });
    const token = randomToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + Number(config.memberPortalSessionDays || 1) * 86_400_000);
    const pool = await getPool();
    await pool.request()
        .input('tenantId', sql.Int, id)
        .input('memberId', sql.Int, member)
        .input('tokenHash', sql.Char(64), tokenHash)
        .input('expiresAt', sql.DateTime2(0), expiresAt)
        .query(`
            INSERT INTO dbo.gym_member_portal_sessions (tenant_id,member_id,token_hash,expires_at)
            VALUES (@tenantId,@memberId,@tokenHash,@expiresAt);
        `);
    return { token, expiresAt, cookie: sessionCookieFor(request, token, expiresAt) };
}

async function resolvePortalSession(request) {
    const token = parseCookie(request, PORTAL_SESSION_COOKIE);
    if (!token) throw commercialError('Member portal session is required.', 401, 'PORTAL_SESSION_REQUIRED');
    const tokenHash = hashToken(token);
    const row = await runTenantContext({ tenantId: null, mode: 'platform', readOnlyBaseline: false }, async () => {
        const pool = await getPool();
        const result = await pool.request()
            .input('tokenHash', sql.Char(64), tokenHash)
            .query(`SELECT TOP (1) id,tenant_id,member_id,expires_at
                    FROM dbo.gym_member_portal_sessions
                    WHERE token_hash=@tokenHash AND revoked_at IS NULL AND expires_at>SYSUTCDATETIME();`);
        return result.recordset[0] || null;
    });
    if (!row) throw commercialError('Member portal session has expired.', 401, 'PORTAL_SESSION_EXPIRED');
    return { sessionId: Number(row.id), tenantId: Number(row.tenant_id), memberId: Number(row.member_id), expiresAt: row.expires_at };
}

async function withPortalSession(request, callback) {
    const session = await resolvePortalSession(request);
    return runTenantContext({ tenantId: session.tenantId, mode: 'public', readOnlyBaseline: Boolean(request.readOnlyBaseline) }, () => callback(session));
}

function visitorTokenFor(request) {
    return parseCookie(request, PORTAL_VISITOR_COOKIE) || randomToken();
}

async function recordPortalVisit({ memberId, visitorToken, readOnly = false }) {
    if (readOnly) return { visitorToken, recorded: false };
    const tenantId = tenantIdValue();
    const member = integer(memberId, 'Member id', { min: 1, max: 2_147_483_647 });
    const visitDate = todayInTimeZone();
    const visitorHash = hashToken(`visitor:${visitorToken}:${visitDate}`);
    const memberHash = hashToken(`member:${tenantId}:${member}:${visitDate}`);
    await withTransaction(async (transaction) => {
        await transaction.request()
            .input('tenantId', sql.Int, tenantId)
            .input('visitDate', sql.Date, new Date(`${visitDate}T00:00:00.000Z`))
            .query(`INSERT INTO dbo.gym_member_portal_visit_daily (tenant_id,visit_date)
                    SELECT @tenantId,@visitDate
                    WHERE NOT EXISTS (SELECT 1 FROM dbo.gym_member_portal_visit_daily WITH (UPDLOCK,HOLDLOCK) WHERE tenant_id=@tenantId AND visit_date=@visitDate);`);
        const visitorInsert = await transaction.request()
            .input('tenantId', sql.Int, tenantId)
            .input('visitDate', sql.Date, new Date(`${visitDate}T00:00:00.000Z`))
            .input('visitorHash', sql.Char(64), visitorHash)
            .query(`INSERT INTO dbo.gym_member_portal_visit_visitors (tenant_id,visit_date,visitor_hash)
                    SELECT @tenantId,@visitDate,@visitorHash
                    WHERE NOT EXISTS (SELECT 1 FROM dbo.gym_member_portal_visit_visitors WITH (UPDLOCK,HOLDLOCK) WHERE tenant_id=@tenantId AND visit_date=@visitDate AND visitor_hash=@visitorHash);`);
        const memberInsert = await transaction.request()
            .input('tenantId', sql.Int, tenantId)
            .input('visitDate', sql.Date, new Date(`${visitDate}T00:00:00.000Z`))
            .input('memberHash', sql.Char(64), memberHash)
            .query(`INSERT INTO dbo.gym_member_portal_visit_visitors (tenant_id,visit_date,visitor_hash)
                    SELECT @tenantId,@visitDate,@memberHash
                    WHERE NOT EXISTS (SELECT 1 FROM dbo.gym_member_portal_visit_visitors WITH (UPDLOCK,HOLDLOCK) WHERE tenant_id=@tenantId AND visit_date=@visitDate AND visitor_hash=@memberHash);`);
        await transaction.request()
            .input('tenantId', sql.Int, tenantId)
            .input('visitDate', sql.Date, new Date(`${visitDate}T00:00:00.000Z`))
            .input('visitorDelta', sql.BigInt, Number(visitorInsert.rowsAffected?.[0] || 0))
            .input('memberDelta', sql.BigInt, Number(memberInsert.rowsAffected?.[0] || 0))
            .query(`UPDATE dbo.gym_member_portal_visit_daily
                    SET page_views=page_views+1,
                        unique_visitors_estimate=unique_visitors_estimate+@visitorDelta,
                        authenticated_members=authenticated_members+@memberDelta,
                        last_visit_at=SYSUTCDATETIME()
                    WHERE tenant_id=@tenantId AND visit_date=@visitDate;`);
    });
    return { visitorToken, recorded: true };
}

function dateRange(value, fallbackDays = 30) {
    const end = new Date();
    const start = new Date(end.getTime() - fallbackDays * 86_400_000);
    const parse = (input, fallback) => {
        const candidate = String(input || '').trim();
        return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : fallback.toISOString().slice(0, 10);
    };
    const from = parse(value?.from, start);
    const to = parse(value?.to, end);
    if (from > to) throw commercialError('Analytics date range is invalid.', 400, 'INVALID_ANALYTICS_RANGE');
    return { from, to };
}

async function getPortalAnalytics({ from, to, readOnly = false } = {}) {
    await ensureCommercialTables({ readOnly });
    const tenantId = tenantIdValue();
    const range = dateRange({ from, to });
    const pool = await getPool();
    const result = await pool.request()
        .input('tenantId', sql.Int, tenantId)
        .input('from', sql.Date, new Date(`${range.from}T00:00:00.000Z`))
        .input('to', sql.Date, new Date(`${range.to}T00:00:00.000Z`))
        .query(`SELECT visit_date,page_views,unique_visitors_estimate,authenticated_members,last_visit_at
                FROM dbo.gym_member_portal_visit_daily
                WHERE tenant_id=@tenantId AND visit_date BETWEEN @from AND @to
                ORDER BY visit_date ASC;`);
    const daily = result.recordset.map((row) => ({
        date: new Date(row.visit_date).toISOString().slice(0, 10),
        pageViews: Number(row.page_views || 0),
        uniqueVisitors: Number(row.unique_visitors_estimate || 0),
        authenticatedMembers: Number(row.authenticated_members || 0),
        lastVisitAt: row.last_visit_at || null
    }));
    const sum = (field) => daily.reduce((total, item) => total + Number(item[field] || 0), 0);
    const mostVisitedDay = [...daily].sort((a, b) => b.pageViews - a.pageViews || a.date.localeCompare(b.date))[0] || null;
    return {
        range,
        totals: {
            pageViews: sum('pageViews'),
            uniqueVisitors: sum('uniqueVisitors'),
            authenticatedMembers: sum('authenticatedMembers')
        },
        mostVisitedDay,
        daily
    };
}

module.exports = {
    PORTAL_SESSION_COOKIE,
    PORTAL_VISITOR_COOKIE,
    appendSetCookie,
    buildCookie,
    clearCookie,
    createPortalSession,
    ensureDefaultPlanTerms,
    getCommercialPlanCatalog,
    getPortalAnalytics,
    getTenantPaymentMethods: brandingService.getTenantPaymentMethods,
    listPlatformPaymentMethods,
    parseCookie,
    recordPortalVisit,
    resolvePortalSession,
    savePlatformPaymentMethod,
    withPortalSession,
    visitorTokenFor
};
