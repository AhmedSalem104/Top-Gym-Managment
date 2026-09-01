'use strict';

const { getPool, sql } = require('../database');
const { currentTenantId } = require('../tenancy/tenant-context');
const { TENANT_TYPES, resolveTenantType } = require('../tenancy/tenant-types');
const coachingService = require('./coaching-service');
const memberService = require('./member-service');
const membershipCodeService = require('./membership-code-service');
const saasService = require('./saas-service');
const commercialSchema = require('./commercial-schema');
const { addDays, todayInTimeZone, toUtcDate, formatDateOnly, parseDateOnly } = require('../utils/date');

function trainerError(message, statusCode = 400, code = 'TRAINER_ERROR') {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.expose = true;
    error.code = code;
    return error;
}

function positiveId(value, label = 'المعرّف') {
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0) throw trainerError(`${label} غير صالح.`, 400, 'INVALID_IDENTIFIER');
    return id;
}

function boundedText(value, label, max, { required = false } = {}) {
    const text = String(value ?? '').trim();
    if (required && !text) throw trainerError(`${label} مطلوب.`);
    if (text.length > max) throw trainerError(`${label} أطول من المسموح.`);
    return text || null;
}

function profileStatus(value, fallback = 'active') {
    const normalized = String(value || fallback).trim().toLowerCase();
    if (!['active', 'paused', 'archived'].includes(normalized)) {
        throw trainerError('حالة العميل غير صالحة.', 400, 'INVALID_CLIENT_STATUS');
    }
    return normalized;
}

async function assertTrainerTenant() {
    const tenantId = currentTenantId({ required: true });
    const pool = await getPool();
    const result = await pool.request()
        .input('tenantId', sql.Int, tenantId)
        .query('SELECT TOP (1) id, name, slug, tenant_type, status FROM dbo.gym_tenants WHERE id=@tenantId;');
    const tenant = result.recordset[0];
    if (!tenant) throw trainerError('مساحة المدرب غير موجودة.', 404, 'TENANT_NOT_FOUND');
    const tenantType = resolveTenantType(tenant.tenant_type);
    if (tenantType !== TENANT_TYPES.INDEPENDENT_TRAINER) {
        throw trainerError('هذه المساحة ليست مساحة مدرب مستقل.', 403, 'TRAINER_TENANT_REQUIRED');
    }
    return { id: tenantId, name: tenant.name, slug: tenant.slug, status: tenant.status, tenantType };
}

async function assertTrainerClient(memberIdValue, { readOnly = false } = {}) {
    await assertTrainerTenant();
    const memberId = positiveId(memberIdValue, 'معرّف العميل');
    const tenantId = currentTenantId({ required: true });
    const pool = await getPool();
    const result = await pool.request()
        .input('tenantId', sql.Int, tenantId)
        .input('memberId', sql.Int, memberId)
        .query(`SELECT TOP (1) id, full_name, phone, email, registration_date, notes,
                       primary_goal, profile_status, created_at, updated_at
                FROM dbo.members WHERE id=@memberId AND tenant_id=@tenantId;`);
    const row = result.recordset[0];
    if (!row) throw trainerError('العميل غير موجود في مساحة المدرب.', 404, 'CLIENT_NOT_FOUND');
    return row;
}

function mapClient(row) {
    return {
        id: Number(row.id),
        fullName: row.full_name,
        phone: row.phone,
        email: row.email,
        registrationDate: formatDateOnly(row.registration_date),
        notes: row.notes,
        primaryGoal: row.primary_goal || null,
        status: row.profile_status || 'active',
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        workoutCount: Number(row.workout_count || 0),
        nutritionCount: Number(row.nutrition_count || 0),
        measurementCount: Number(row.measurement_count || 0),
        checkinCount: Number(row.checkin_count || 0),
        lastMeasurementAt: row.last_measurement_at || null,
        lastCheckinAt: row.last_checkin_at || null
    };
}

async function ensureReady({ readOnly = false } = {}) {
    await assertTrainerTenant();
    await coachingService.ensureCoachingTables({ seedLibrary: false, readOnly });
}

async function getWorkspace({ readOnly = false } = {}) {
    const tenant = await assertTrainerTenant();
    await coachingService.ensureCoachingTables({ seedLibrary: false, readOnly });
    await commercialSchema.ensureCommercialTables({ readOnly });
    const pool = await getPool();
    const tenantId = tenant.id;
    const result = await pool.request().input('tenantId', sql.Int, tenantId).query(`
        SELECT
            (SELECT COUNT_BIG(*) FROM dbo.members m WHERE m.tenant_id=@tenantId AND ISNULL(m.profile_status,'active')='active') AS active_clients,
            (SELECT COUNT_BIG(*) FROM dbo.workout_programs p INNER JOIN dbo.members m ON m.id=p.member_id WHERE m.tenant_id=@tenantId AND p.status='active') AS active_training_plans,
            (SELECT COUNT_BIG(*) FROM dbo.diet_plans p INNER JOIN dbo.members m ON m.id=p.member_id WHERE m.tenant_id=@tenantId AND p.status='active') AS active_nutrition_plans,
            (SELECT COUNT_BIG(*) FROM dbo.body_measurements b INNER JOIN dbo.members m ON m.id=b.member_id WHERE m.tenant_id=@tenantId AND b.measured_at >= DATEADD(day,-30,CONVERT(date,SYSUTCDATETIME()))) AS recent_measurements,
            (SELECT COUNT_BIG(*) FROM dbo.athlete_checkins c INNER JOIN dbo.members m ON m.id=c.member_id WHERE m.tenant_id=@tenantId AND c.checkin_date >= DATEADD(day,-14,CONVERT(date,SYSUTCDATETIME()))) AS recent_checkins,
            (SELECT COUNT_BIG(*) FROM dbo.members m WHERE m.tenant_id=@tenantId AND ISNULL(m.profile_status,'active')='active' AND NOT EXISTS (SELECT 1 FROM dbo.body_measurements b WHERE b.member_id=m.id AND b.measured_at >= DATEADD(day,-30,CONVERT(date,SYSUTCDATETIME())))) AS clients_needing_follow_up,
            (SELECT COUNT_BIG(*) FROM dbo.coaching_sessions s WHERE s.tenant_id=@tenantId AND s.scheduled_start >= CONVERT(date,SYSUTCDATETIME()) AND s.scheduled_start < DATEADD(day,1,CONVERT(date,SYSUTCDATETIME())) AND s.status IN ('scheduled','completed')) AS sessions_today,
            (SELECT COUNT_BIG(*) FROM dbo.coaching_sessions s WHERE s.tenant_id=@tenantId AND s.scheduled_start >= SYSUTCDATETIME() AND s.status='scheduled') AS upcoming_sessions,
            (SELECT COUNT_BIG(*) FROM dbo.trainer_package_purchases pp WHERE pp.tenant_id=@tenantId AND pp.status='active' AND pp.ends_on IS NOT NULL AND pp.ends_on BETWEEN CONVERT(date,SYSUTCDATETIME()) AND DATEADD(day,14,CONVERT(date,SYSUTCDATETIME()))) AS packages_expiring,
            (SELECT COALESCE(SUM(pp.amount_remaining),0) FROM dbo.trainer_package_purchases pp WHERE pp.tenant_id=@tenantId AND pp.status NOT IN ('cancelled','completed')) AS outstanding_payments;
    `);
    const row = result.recordset[0] || {};
    return {
        tenant,
        metrics: {
            activeClients: Number(row.active_clients || 0),
            sessionsToday: Number(row.sessions_today || 0),
            upcomingSessions: Number(row.upcoming_sessions || 0),
            clientsNeedingFollowUp: Number(row.clients_needing_follow_up || 0),
            packagesExpiring: Number(row.packages_expiring || 0),
            outstandingPayments: Number(row.outstanding_payments || 0),
            recentAssessments: Number(row.recent_measurements || 0),
            recentMeasurements: Number(row.recent_measurements || 0),
            recentProgress: Number(row.recent_measurements || 0),
            activeTrainingPlans: Number(row.active_training_plans || 0),
            activeNutritionPlans: Number(row.active_nutrition_plans || 0),
            recentCheckins: Number(row.recent_checkins || 0)
        },
        availability: { sessions: true, packages: true, payments: true },
        message: 'مساحة المدرب تعرض العملاء والتدريب والباكدجات والجلسات والتحصيلات من بيانات مساحتك فقط.'
    };
}

async function listClients({ search = '', page = 1, pageSize = 20, readOnly = false } = {}) {
    await ensureReady({ readOnly });
    const tenantId = currentTenantId({ required: true });
    const currentPage = Math.min(10000, Math.max(1, Number.isInteger(Number(page)) ? Number(page) : 1));
    const size = Math.min(100, Math.max(1, Number.isInteger(Number(pageSize)) ? Number(pageSize) : 20));
    const normalizedSearch = String(search || '').trim().slice(0, 100);
    const offset = (currentPage - 1) * size;
    const pool = await getPool();
    const result = await pool.request()
        .input('tenantId', sql.Int, tenantId)
        .input('search', sql.NVarChar(100), normalizedSearch)
        .input('pattern', sql.NVarChar(110), `%${normalizedSearch}%`)
        .input('offset', sql.Int, offset)
        .input('pageSize', sql.Int, size)
        .query(`
            SELECT m.id,m.full_name,m.phone,m.email,m.registration_date,m.notes,m.primary_goal,m.profile_status,m.created_at,m.updated_at,
                   (SELECT COUNT_BIG(*) FROM dbo.workout_programs p WHERE p.member_id=m.id) AS workout_count,
                   (SELECT COUNT_BIG(*) FROM dbo.diet_plans p WHERE p.member_id=m.id) AS nutrition_count,
                   (SELECT COUNT_BIG(*) FROM dbo.body_measurements b WHERE b.member_id=m.id) AS measurement_count,
                   (SELECT COUNT_BIG(*) FROM dbo.athlete_checkins c WHERE c.member_id=m.id) AS checkin_count,
                   (SELECT MAX(b.measured_at) FROM dbo.body_measurements b WHERE b.member_id=m.id) AS last_measurement_at,
                   (SELECT MAX(c.checkin_date) FROM dbo.athlete_checkins c WHERE c.member_id=m.id) AS last_checkin_at,
                   COUNT(*) OVER() AS total_count
            FROM dbo.members m
            WHERE m.tenant_id=@tenantId
              AND (@search=N'' OR m.full_name LIKE @pattern OR m.phone LIKE @pattern OR ISNULL(m.email,N'') LIKE @pattern)
              AND ISNULL(m.profile_status,'active') <> 'archived'
            ORDER BY CASE WHEN ISNULL(m.profile_status,'active')='active' THEN 0 ELSE 1 END,m.updated_at DESC,m.id DESC
            OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;
        `);
    const clients = result.recordset.map(mapClient);
    const total = Number(result.recordset[0]?.total_count || 0);
    return { clients, pagination: { page: currentPage, pageSize: size, total, totalPages: total ? Math.ceil(total / size) : 0, hasNext: currentPage < Math.ceil(total / size), hasPrevious: currentPage > 1 } };
}

async function createClient(body = {}) {
    const tenant = await assertTrainerTenant();
    const entitlements = await saasService.getEffectiveEntitlements(tenant.id);
    const maxClients = entitlements.limits?.maxClients;
    if (maxClients != null) {
        const pool = await getPool();
        const count = await pool.request()
            .input('tenantId', sql.Int, tenant.id)
            .query("SELECT COUNT_BIG(*) AS total FROM dbo.members WHERE tenant_id=@tenantId AND ISNULL(profile_status,'active') <> 'archived';");
        if (Number(count.recordset[0]?.total || 0) >= maxClients) {
            throw trainerError('تم الوصول إلى حد العملاء في الباقة الحالية.', 409, 'SAAS_PLAN_LIMIT_REACHED');
        }
    }
    const client = await coachingService.createExternalTrainee({
        fullName: boundedText(body.fullName, 'اسم العميل', 120, { required: true }),
        phone: boundedText(body.phone, 'رقم الهاتف', 30, { required: true }),
        email: boundedText(body.email, 'البريد الإلكتروني', 254),
        registrationDate: body.registrationDate || todayInTimeZone(),
        notes: boundedText(body.notes, 'الملاحظات', 1000),
        primaryGoal: boundedText(body.primaryGoal, 'الهدف الأساسي', 200),
        profileStatus: profileStatus(body.status)
    });
    return getClient(client.id);
}

async function updateClient(memberIdValue, body = {}) {
    const current = await assertTrainerClient(memberIdValue);
    const memberId = Number(current.id);
    await coachingService.updateClientBasic(memberId, {
        ...(body.fullName === undefined ? {} : { fullName: body.fullName }),
        ...(body.phone === undefined ? {} : { phone: body.phone }),
        ...(body.email === undefined ? {} : { email: body.email }),
        ...(body.registrationDate === undefined ? {} : { registrationDate: body.registrationDate }),
        ...(body.notes === undefined ? {} : { notes: body.notes })
    });
    const pool = await getPool();
    const goal = body.primaryGoal === undefined ? current.primary_goal : boundedText(body.primaryGoal, 'الهدف الأساسي', 200);
    const status = body.status === undefined ? (current.profile_status || 'active') : profileStatus(body.status);
    await pool.request().input('tenantId', sql.Int, currentTenantId({ required: true })).input('id', sql.Int, memberId).input('goal', sql.NVarChar(200), goal).input('status', sql.VarChar(20), status).query('UPDATE dbo.members SET primary_goal=@goal, profile_status=@status, updated_at=SYSUTCDATETIME() WHERE id=@id AND tenant_id=@tenantId;');
    return getClient(memberId);
}

async function deleteClient(memberIdValue) {
    await assertTrainerClient(memberIdValue);
    await memberService.deleteMember(positiveId(memberIdValue, 'معرّف العميل'));
}

async function assertOwnedCoachingPlan(planType, planIdValue, expectedMemberId = null) {
    await assertTrainerTenant();
    const planId = positiveId(planIdValue, 'معرّف الخطة');
    const table = planType === 'nutrition' ? 'dbo.diet_plans' : 'dbo.workout_programs';
    const pool = await getPool();
    const result = await pool.request()
        .input('tenantId', sql.Int, currentTenantId({ required: true }))
        .input('planId', sql.Int, planId)
        .query(`SELECT TOP (1) p.member_id FROM ${table} p INNER JOIN dbo.members m ON m.id=p.member_id WHERE p.id=@planId AND m.tenant_id=@tenantId;`);
    const ownerId = result.recordset[0]?.member_id;
    if (!ownerId) throw trainerError('الخطة غير موجودة في مساحة المدرب.', 404, 'PLAN_NOT_FOUND');
    if (expectedMemberId != null && Number(ownerId) !== Number(expectedMemberId)) {
        throw trainerError('الخطة لا تخص هذا العميل.', 403, 'PLAN_CLIENT_MISMATCH');
    }
    return Number(ownerId);
}

async function getClient(memberIdValue, { readOnly = false } = {}) {
    const row = await assertTrainerClient(memberIdValue, { readOnly });
    await coachingService.ensureCoachingTables({ seedLibrary: false, readOnly });
    const memberId = Number(row.id);
    const [measurements, checkins, trainingPlans, nutritionPlans] = await Promise.all([
        coachingService.getMeasurements(memberId, { readOnly }),
        coachingService.getCheckins(memberId, { readOnly }),
        coachingService.getWorkoutPrograms({ memberId, readOnly }),
        coachingService.getDietPlans({ memberId, readOnly })
    ]);
    return { client: mapClient(row), measurements, checkins, trainingPlans, nutritionPlans };
}

async function getClientPortalAccess(memberIdValue, { request = null, userId = null } = {}) {
    const client = await assertTrainerClient(memberIdValue);
    await membershipCodeService.ensureMembershipCodeStorage();
    const tenant = await assertTrainerTenant();
    const membershipCode = await membershipCodeService.issueForMember(client.id, null, { userId, request, action: 'issued' });
    return {
        clientId: Number(client.id),
        membershipCode,
        portalUrl: membershipCodeService.getPortalUrl(
            request ? `${request.protocol}://${request.get('host')}` : '',
            tenant.slug
        )
    };
}

async function getClientTimeline(memberIdValue, { limit = 100, readOnly = false } = {}) {
    const client = await assertTrainerClient(memberIdValue, { readOnly });
    await coachingService.ensureCoachingTables({ seedLibrary: false, readOnly: true });
    await commercialSchema.ensureCommercialTables({ readOnly: true });
    const memberId = Number(client.id);
    const tenantId = currentTenantId({ required: true });
    const [activity, sessionsResult, purchasesResult, paymentsResult] = await Promise.all([
        coachingService.getCoachingActivity(memberId, { limit: Math.min(200, Math.max(1, Number(limit) || 100)), readOnly: true }),
        getPool().then((pool) => pool.request().input('tenantId', sql.Int, tenantId).input('memberId', sql.Int, memberId).input('limit', sql.Int, Math.min(200, Math.max(1, Number(limit) || 100))).query(`SELECT TOP (@limit) id,scheduled_start,scheduled_end,status,notes,created_at FROM dbo.coaching_sessions WHERE tenant_id=@tenantId AND member_id=@memberId ORDER BY created_at DESC,id DESC;`).catch((error) => { if (error.number === 208) return { recordset: [] }; throw error; })),
        getPool().then((pool) => pool.request().input('tenantId', sql.Int, tenantId).input('memberId', sql.Int, memberId).input('limit', sql.Int, Math.min(200, Math.max(1, Number(limit) || 100))).query(`SELECT TOP (@limit) pp.id,pp.created_at,pp.updated_at,pp.starts_on,pp.ends_on,pp.status,pp.amount_due,pp.amount_paid,pp.amount_remaining,p.name AS package_name FROM dbo.trainer_package_purchases pp INNER JOIN dbo.trainer_packages p ON p.id=pp.package_id AND p.tenant_id=pp.tenant_id WHERE pp.tenant_id=@tenantId AND pp.member_id=@memberId ORDER BY pp.created_at DESC,pp.id DESC;`).catch((error) => { if (error.number === 208) return { recordset: [] }; throw error; })),
        getPool().then((pool) => pool.request().input('tenantId', sql.Int, tenantId).input('memberId', sql.Int, memberId).input('limit', sql.Int, Math.min(200, Math.max(1, Number(limit) || 100))).query(`SELECT TOP (@limit) t.id,t.created_at,t.paid_at,t.amount_paid,t.transaction_type,t.notes,p.name AS package_name FROM dbo.gym_payment_transactions t INNER JOIN dbo.trainer_package_purchases pp ON pp.id=t.trainer_package_purchase_id AND pp.tenant_id=t.tenant_id INNER JOIN dbo.trainer_packages p ON p.id=pp.package_id AND p.tenant_id=pp.tenant_id WHERE t.tenant_id=@tenantId AND pp.member_id=@memberId AND t.trainer_package_purchase_id IS NOT NULL ORDER BY t.created_at DESC,t.id DESC;`).catch((error) => { if (error.number === 208) return { recordset: [] }; throw error; }))
    ]);
    const events = [
        ...activity.map((item) => ({ id: `activity-${item.id}`, type: item.eventType, title: item.details || item.eventType, occurredAt: item.createdAt, entityType: item.entityType, entityId: item.entityId })),
        ...(sessionsResult.recordset || []).map((item) => ({ id: `session-${item.id}`, type: 'session', title: `جلسة تدريب: ${item.status}`, occurredAt: item.scheduled_start || item.created_at, details: item.notes || null, entityType: 'coaching_session', entityId: Number(item.id) })),
        ...(purchasesResult.recordset || []).map((item) => ({ id: `purchase-${item.id}`, type: 'package_purchase', title: `شراء باقة: ${item.package_name}`, occurredAt: item.created_at, details: `المدفوع ${Number(item.amount_paid || 0)} من ${Number(item.amount_due || 0)}`, entityType: 'package_purchase', entityId: Number(item.id) })),
        ...(paymentsResult.recordset || []).map((item) => ({ id: `payment-${item.id}`, type: item.transaction_type, title: item.transaction_type === 'adjustment' ? 'تسوية مالية' : 'دفعة باقة', occurredAt: item.paid_at || item.created_at, details: `${Number(item.amount_paid || 0)} · ${item.package_name}`, entityType: 'payment_transaction', entityId: Number(item.id) }))
    ].sort((first, second) => new Date(second.occurredAt || 0).getTime() - new Date(first.occurredAt || 0).getTime()).slice(0, Math.min(200, Math.max(1, Number(limit) || 100)));
    return { client: mapClient(client), timeline: events };
}

async function getFollowUp({ limit = 100, readOnly = false } = {}) {
    const tenant = await assertTrainerTenant();
    await commercialSchema.ensureCommercialTables({ readOnly: true });
    const clientsResult = await listClients({ page: 1, pageSize: Math.min(100, Math.max(1, Number(limit) || 100)), readOnly: true });
    const pool = await getPool();
    const rows = await pool.request()
        .input('tenantId', sql.Int, tenant.id)
        .query(`SELECT m.id AS member_id,
                   MIN(CASE WHEN pp.status='active' AND pp.ends_on IS NOT NULL AND pp.ends_on <= DATEADD(day,14,CONVERT(date,SYSUTCDATETIME())) THEN pp.ends_on END) AS expiring_package,
                   COALESCE(SUM(CASE WHEN pp.status NOT IN ('cancelled','completed') THEN pp.amount_remaining ELSE 0 END),0) AS outstanding_balance
                FROM dbo.members m
                LEFT JOIN dbo.trainer_package_purchases pp ON pp.member_id=m.id AND pp.tenant_id=m.tenant_id
                WHERE m.tenant_id=@tenantId AND ISNULL(m.profile_status,'active') <> 'archived'
                GROUP BY m.id;`);
    const packageByClient = new Map((rows.recordset || []).map((row) => [Number(row.member_id), row]));
    const now = Date.now();
    const clients = clientsResult.clients.map((client) => {
        const packageRow = packageByClient.get(client.id) || {};
        const reasons = [];
        const measurementAge = client.lastMeasurementAt ? now - new Date(client.lastMeasurementAt).getTime() : Infinity;
        const checkinAge = client.lastCheckinAt ? now - new Date(client.lastCheckinAt).getTime() : Infinity;
        if (!client.lastMeasurementAt || measurementAge > 30 * 86_400_000) reasons.push('assessment_due');
        if (!client.lastCheckinAt || checkinAge > 14 * 86_400_000) reasons.push('checkin_due');
        if (packageRow.expiring_package) reasons.push('package_expiring');
        if (Number(packageRow.outstanding_balance || 0) > 0) reasons.push('payment_outstanding');
        return {
            clientId: client.id,
            clientName: client.fullName,
            reasons,
            lastMeasurementAt: client.lastMeasurementAt || null,
            lastCheckinAt: client.lastCheckinAt || null,
            expiringPackageOn: packageRow.expiring_package || null,
            outstandingBalance: Number(packageRow.outstanding_balance || 0)
        };
    }).filter((item) => item.reasons.length > 0).slice(0, Math.min(100, Math.max(1, Number(limit) || 100)));
    return {
        clients,
        summary: {
            clientsNeedingFollowUp: clients.length,
            assessmentsDue: clients.filter((item) => item.reasons.includes('assessment_due')).length,
            checkinsDue: clients.filter((item) => item.reasons.includes('checkin_due')).length,
            packagesExpiring: clients.filter((item) => item.reasons.includes('package_expiring')).length,
            paymentsOutstanding: clients.filter((item) => item.reasons.includes('payment_outstanding')).length
        }
    };
}

function reportDateRange(from, to) {
    const today = todayInTimeZone();
    const fromDate = parseDateOnly(from || addDays(today, -29), 'Ø¨Ø¯Ø§ÙŠØ© Ø§Ù„ØªÙ‚Ø±ÙŠØ±');
    const toDate = parseDateOnly(to || today, 'Ù†Ù‡Ø§ÙŠØ© Ø§Ù„ØªÙ‚Ø±ÙŠØ±');
    if (fromDate > toDate) throw trainerError('ØªØ§Ø±ÙŠØ® Ø¨Ø¯Ø§ÙŠØ© Ø§Ù„ØªÙ‚Ø±ÙŠØ± ÙŠØ¬Ø¨ Ø£Ù† ÙŠØ³Ø¨Ù‚ ØªØ§Ø±ÙŠØ® Ø§Ù„Ù†Ù‡Ø§ÙŠØ©.', 400, 'REPORT_DATE_RANGE_INVALID');
    return { fromDate, toDate };
}

async function getReports({ from = null, to = null, readOnly = false } = {}) {
    const tenant = await assertTrainerTenant();
    await coachingService.ensureCoachingTables({ seedLibrary: false, readOnly: true });
    await commercialSchema.ensureCommercialTables({ readOnly: true });
    const { fromDate, toDate } = reportDateRange(from, to);
    const pool = await getPool();
    const result = await pool.request()
        .input('tenantId', sql.Int, tenant.id)
        .input('fromDate', sql.Date, toUtcDate(fromDate))
        .input('toDate', sql.Date, toUtcDate(toDate))
        .query(`
            SELECT
                (SELECT COUNT_BIG(*) FROM dbo.members m
                 WHERE m.tenant_id=@tenantId AND ISNULL(m.profile_status,'active')='active') AS active_clients,
                (SELECT COUNT_BIG(*) FROM dbo.members m
                 WHERE m.tenant_id=@tenantId AND m.registration_date >= @fromDate
                   AND m.registration_date < DATEADD(day,1,@toDate)) AS new_clients,
                (SELECT COUNT_BIG(*) FROM dbo.coaching_sessions s
                 WHERE s.tenant_id=@tenantId AND s.scheduled_start >= @fromDate
                   AND s.scheduled_start < DATEADD(day,1,@toDate)) AS total_sessions,
                (SELECT COUNT_BIG(*) FROM dbo.coaching_sessions s
                 WHERE s.tenant_id=@tenantId AND s.scheduled_start >= @fromDate
                   AND s.scheduled_start < DATEADD(day,1,@toDate) AND s.status='completed') AS completed_sessions,
                (SELECT COUNT_BIG(*) FROM dbo.coaching_sessions s
                 WHERE s.tenant_id=@tenantId AND s.scheduled_start >= @fromDate
                   AND s.scheduled_start < DATEADD(day,1,@toDate) AND s.status='cancelled') AS cancelled_sessions,
                (SELECT COUNT_BIG(*) FROM dbo.coaching_sessions s
                 WHERE s.tenant_id=@tenantId AND s.scheduled_start >= @fromDate
                   AND s.scheduled_start < DATEADD(day,1,@toDate) AND s.status='no_show') AS no_show_sessions,
                (SELECT COALESCE(SUM(CASE WHEN t.is_voided=0 THEN t.amount_paid ELSE 0 END),0)
                 FROM dbo.gym_payment_transactions t
                 WHERE t.tenant_id=@tenantId AND t.trainer_package_purchase_id IS NOT NULL
                   AND t.paid_at >= @fromDate AND t.paid_at < DATEADD(day,1,@toDate)) AS net_revenue,
                (SELECT COUNT_BIG(*) FROM dbo.gym_payment_transactions t
                 WHERE t.tenant_id=@tenantId AND t.trainer_package_purchase_id IS NOT NULL
                   AND t.transaction_type <> 'adjustment' AND t.is_voided=0
                   AND t.paid_at >= @fromDate AND t.paid_at < DATEADD(day,1,@toDate)) AS paid_transactions,
                (SELECT COUNT_BIG(*) FROM dbo.gym_payment_transactions t
                 WHERE t.tenant_id=@tenantId AND t.trainer_package_purchase_id IS NOT NULL
                   AND t.transaction_type='adjustment' AND t.is_voided=0
                   AND t.paid_at >= @fromDate AND t.paid_at < DATEADD(day,1,@toDate)) AS refund_transactions,
                (SELECT COALESCE(SUM(pp.amount_remaining),0) FROM dbo.trainer_package_purchases pp
                 WHERE pp.tenant_id=@tenantId AND pp.status NOT IN ('cancelled','completed')) AS outstanding_balance,
                (SELECT COUNT_BIG(*) FROM dbo.workout_programs p INNER JOIN dbo.members m
                   ON m.id=p.member_id AND m.tenant_id=@tenantId
                 WHERE p.status='active') AS active_training_plans,
                (SELECT COUNT_BIG(*) FROM dbo.diet_plans p INNER JOIN dbo.members m
                   ON m.id=p.member_id AND m.tenant_id=@tenantId
                 WHERE p.status='active') AS active_nutrition_plans,
                (SELECT COUNT_BIG(*) FROM dbo.body_measurements b INNER JOIN dbo.members m
                   ON m.id=b.member_id AND m.tenant_id=@tenantId
                 WHERE b.measured_at >= @fromDate AND b.measured_at < DATEADD(day,1,@toDate)) AS measurements,
                (SELECT COUNT_BIG(*) FROM dbo.athlete_checkins c INNER JOIN dbo.members m
                   ON m.id=c.member_id AND m.tenant_id=@tenantId
                 WHERE c.checkin_date >= @fromDate AND c.checkin_date < DATEADD(day,1,@toDate)) AS checkins;
        `);
    const row = result.recordset[0] || {};
    return {
        period: { from: fromDate, to: toDate },
        summary: {
            activeClients: Number(row.active_clients || 0),
            newClients: Number(row.new_clients || 0),
            totalSessions: Number(row.total_sessions || 0),
            completedSessions: Number(row.completed_sessions || 0),
            cancelledSessions: Number(row.cancelled_sessions || 0),
            noShowSessions: Number(row.no_show_sessions || 0),
            netRevenue: Number(row.net_revenue || 0),
            paidTransactions: Number(row.paid_transactions || 0),
            refundTransactions: Number(row.refund_transactions || 0),
            outstandingBalance: Number(row.outstanding_balance || 0),
            activeTrainingPlans: Number(row.active_training_plans || 0),
            activeNutritionPlans: Number(row.active_nutrition_plans || 0),
            measurements: Number(row.measurements || 0),
            checkins: Number(row.checkins || 0)
        }
    };
}

async function getMeasurements(memberId, options) { await assertTrainerClient(memberId, options); return coachingService.getMeasurements(memberId, options); }
async function createMeasurement(memberId, body) { await assertTrainerClient(memberId); return coachingService.createMeasurement(memberId, body); }
async function updateMeasurement(memberId, measurementId, body) { await assertTrainerClient(memberId); return coachingService.updateMeasurement(memberId, measurementId, body); }
async function deleteMeasurement(memberId, measurementId) { await assertTrainerClient(memberId); return coachingService.deleteMeasurement(memberId, measurementId); }
async function getCheckins(memberId, options) { await assertTrainerClient(memberId, options); return coachingService.getCheckins(memberId, options); }
async function createCheckin(memberId, body) { await assertTrainerClient(memberId); return coachingService.createCheckin(memberId, body); }
async function updateCheckin(memberId, checkinId, body) { await assertTrainerClient(memberId); return coachingService.updateCheckin(memberId, checkinId, body); }
async function deleteCheckin(memberId, checkinId) { await assertTrainerClient(memberId); return coachingService.deleteCheckin(memberId, checkinId); }

async function listTrainingPlans(query) { await assertTrainerTenant(); return coachingService.getWorkoutPrograms(query); }
async function createTrainingPlan(body) { await assertTrainerClient(body.memberId || body.clientId); return coachingService.createWorkoutProgram(body); }
async function updateTrainingPlan(id, body) {
    const memberId = body.memberId || body.clientId;
    await assertTrainerClient(memberId);
    await assertOwnedCoachingPlan('training', id, memberId);
    return coachingService.updateWorkoutProgram(id, body);
}
async function deleteTrainingPlan(id) {
    const memberId = await assertOwnedCoachingPlan('training', id);
    return coachingService.deleteWorkoutProgram(id, memberId);
}
async function listNutritionPlans(query) { await assertTrainerTenant(); return coachingService.getDietPlans(query); }
async function createNutritionPlan(body) { await assertTrainerClient(body.memberId || body.clientId); return coachingService.createDietPlan(body); }
async function updateNutritionPlan(id, body) {
    const memberId = body.memberId || body.clientId;
    await assertTrainerClient(memberId);
    await assertOwnedCoachingPlan('nutrition', id, memberId);
    return coachingService.updateDietPlan(id, body);
}
async function deleteNutritionPlan(id) {
    const memberId = await assertOwnedCoachingPlan('nutrition', id);
    return coachingService.deleteDietPlan(id, memberId);
}

module.exports = {
    assertTrainerTenant,
    assertTrainerClient,
    createClient,
    createCheckin,
    createMeasurement,
    createNutritionPlan,
    createTrainingPlan,
    deleteCheckin,
    deleteClient,
    deleteMeasurement,
    deleteNutritionPlan,
    deleteTrainingPlan,
    getCheckins,
    getClient,
    getClientPortalAccess,
    getClientTimeline,
    getFollowUp,
    getMeasurements,
    getReports,
    getWorkspace,
    listClients,
    listNutritionPlans,
    listTrainingPlans,
    updateCheckin,
    updateClient,
    updateMeasurement,
    updateNutritionPlan,
    updateTrainingPlan
};
