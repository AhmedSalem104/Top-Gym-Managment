'use strict';

const crypto = require('node:crypto');
const membershipCodeService = require('./membership-code-service');
const coachingService = require('./coaching-service');
const trainerCommerceService = require('./trainer-commerce-service');
const { getPool, sql } = require('../database');
const { getMemberDetails } = require('./member-service');
const attendanceService = require('./attendance-service');
const commercialService = require('./commercial-service');
const memberService = require('./member-service');
const { todayInTimeZone } = require('../utils/date');
const { getTenantContext, runTenantContext } = require('../tenancy/tenant-context');
const { TENANT_TYPES } = require('../tenancy/tenant-types');

function appError(message, statusCode = 400, code = null) {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.expose = true;
    if (code) error.code = code;
    return error;
}

function reportNumber() {
    return `TG-PORTAL-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

function currentMembership(memberships = []) {
    return [...memberships]
        .sort((first, second) => String(second.startDate || '').localeCompare(String(first.startDate || '')) || Number(second.id || 0) - Number(first.id || 0))
        .find((item) => ['active', 'expiring_soon', 'frozen'].includes(item.status))
        || [...memberships].sort((first, second) => Number(second.id || 0) - Number(first.id || 0))[0]
        || null;
}

function sanitizeMembership(item) {
    return {
        id: item.id,
        plan: item.plan,
        planLabel: item.planLabel,
        type: item.type,
        startDate: item.startDate,
        endDate: item.endDate,
        effectiveEndDate: item.effectiveEndDate,
        status: item.status,
        daysRemaining: item.daysRemaining,
        freezeDays: item.freezeDays,
        freezeCount: item.freezeCount,
        freezeLimit: item.freezeLimit,
        freezesRemaining: item.freezesRemaining,
        activeFreezeId: item.activeFreezeId,
        listPrice: item.listPrice,
        discountAmount: item.discountAmount,
        amountDue: item.amountDue,
        amountPaid: item.amountPaid,
        amountRemaining: item.amountRemaining,
        paymentMethod: item.paymentMethod,
        paidAt: item.paidAt
    };
}

function sanitizePayment(item) {
    return {
        id: item.id,
        membershipId: item.membershipId,
        receiptNumber: item.receiptNumber,
        transactionType: item.transactionType,
        plan: item.plan,
        type: item.type,
        amountDue: item.amountDue,
        amountPaid: item.amountPaid,
        amountRemaining: item.amountRemaining,
        paymentMethod: item.paymentMethod,
        paidAt: item.paidAt,
        transactionDate: item.transactionDate,
        createdAt: item.createdAt
    };
}

function sanitizeFreeze(item) {
    return {
        id: item.id,
        membershipId: item.membershipId,
        startDate: item.startDate,
        endDate: item.endDate,
        resumedDate: item.resumedDate,
        days: item.days,
        active: item.active
    };
}

function sanitizeTrainerPayment(item) {
    return {
        id: item.id,
        membershipId: null,
        receiptNumber: `TR-${item.id}`,
        transactionType: item.transactionType,
        amountDue: item.amountDue,
        amountPaid: item.amountPaid,
        amountRemaining: item.amountRemaining,
        paymentMethod: item.paymentMethod,
        paidAt: item.paidAt,
        transactionDate: item.paidAt,
        createdAt: item.createdAt,
        packagePurchaseId: item.packagePurchaseId,
        packageName: item.packageName
    };
}

async function lookupTenantType(tenantId) {
    const result = await getPool().then((pool) => pool.request()
        .input('tenantId', sql.Int, Number(tenantId))
        .query('SELECT TOP (1) tenant_type FROM dbo.gym_tenants WHERE id=@tenantId;'));
    return result.recordset[0]?.tenant_type || null;
}

async function getMemberBranchSummary(memberContext) {
    const tenantId = Number(memberContext?.tenantId);
    const memberId = Number(memberContext?.memberId);
    if (!Number.isInteger(tenantId) || !Number.isInteger(memberId)) return [];
    const result = await getPool().then((pool) => pool.request()
        .input('tenantId', sql.Int, tenantId)
        .input('memberId', sql.Int, memberId)
        .query(`SELECT DISTINCT b.id,b.name,b.address,b.phone,b.working_hours_json,b.is_main_branch
                FROM dbo.gym_branches AS b
                WHERE b.tenant_id=@tenantId AND b.status='active'
                  AND (EXISTS (
                        SELECT 1
                        FROM dbo.memberships AS m
                        INNER JOIN dbo.gym_membership_branch_access AS access
                            ON access.membership_id=m.id AND access.tenant_id=m.tenant_id AND access.branch_id=b.id
                        WHERE m.tenant_id=@tenantId AND m.member_id=@memberId
                          AND m.cancelled_at IS NULL
                          AND CAST(SYSUTCDATETIME() AS DATE) BETWEEN m.start_date AND m.end_date
                          AND m.branch_access_mode IN ('single_branch','selected_branches')
                    ) OR EXISTS (
                        SELECT 1
                        FROM dbo.memberships AS m
                        WHERE m.tenant_id=@tenantId AND m.member_id=@memberId
                          AND m.cancelled_at IS NULL
                          AND CAST(SYSUTCDATETIME() AS DATE) BETWEEN m.start_date AND m.end_date
                          AND m.branch_access_mode='all_branches'
                    ))
                ORDER BY b.is_main_branch DESC,b.name,b.id;`));
    return result.recordset.map((row) => {
        let workingHours = null;
        try { workingHours = row.working_hours_json ? JSON.parse(row.working_hours_json) : null; } catch (_) { workingHours = null; }
        return {
            id: Number(row.id),
            name: row.name,
            address: row.address || null,
            phone: row.phone || null,
            workingHours,
            isMain: Boolean(row.is_main_branch)
        };
    });
}

async function trainerPortalSnapshot(memberContext, request, readOnlyBaseline) {
    const client = await coachingService.getTrainingOverview(memberContext.memberId, { readOnly: true });
    const [packagePurchases, sessions, payments] = await Promise.all([
        trainerCommerceService.listPurchases({ memberId: memberContext.memberId, readOnly: true }),
        trainerCommerceService.listSessions({ memberId: memberContext.memberId, readOnly: true }),
        trainerCommerceService.listPayments({ memberId: memberContext.memberId, readOnly: true })
    ]);
    const portalSession = readOnlyBaseline ? null : await commercialService.createPortalSession({
        tenantId: memberContext.tenantId,
        memberId: memberContext.memberId,
        request
    });
    const visitorToken = commercialService.visitorTokenFor(request);
    if (!readOnlyBaseline) await commercialService.recordPortalVisit({
        memberId: memberContext.memberId,
        visitorToken,
        readOnly: false
    });
    const totalDue = packagePurchases.reduce((sum, item) => sum + Number(item.amountDue || 0), 0);
    const totalPaid = packagePurchases.reduce((sum, item) => sum + Number(item.amountPaid || 0), 0);
    const totalRemaining = packagePurchases.reduce((sum, item) => sum + Number(item.amountRemaining || 0), 0);
    return {
        tenant: { name: memberContext.tenantName, slug: memberContext.tenantSlug, type: TENANT_TYPES.INDEPENDENT_TRAINER },
        portalMode: 'trainer_client',
        reportNumber: reportNumber(),
        issuedAt: new Date().toISOString(),
        member: {
            fullName: client.member.fullName,
            phone: client.member.phone,
            email: client.member.email || null,
            registrationDate: client.member.registrationDate
        },
        firstJoinDate: client.member.registrationDate,
        currentMembership: null,
        memberships: [],
        financialSummary: {
            totalDue,
            totalPaid,
            totalRemaining,
            transactionCount: payments.length,
            paidTransactionCount: payments.filter((item) => Number(item.amountPaid || 0) !== 0).length
        },
        payments: payments.map(sanitizeTrainerPayment),
        packagePurchases,
        sessions,
        coaching: {
            trainingPlans: client.workoutPrograms || [],
            nutritionPlans: client.dietPlans || [],
            measurements: client.measurements || [],
            checkins: client.checkins || [],
            progress: client.progress || {},
            activity: client.activity || []
        },
        freezes: [],
        attendance: [],
        attendanceSummary: { totalVisits: 0 },
        _portalSessionCookie: portalSession?.cookie || null,
        _portalVisitorCookie: readOnlyBaseline ? null : commercialService.buildCookie(
            commercialService.PORTAL_VISITOR_COOKIE,
            visitorToken,
            30 * 24 * 60 * 60,
            request
        )
    };
}

async function lookupByCode(code, request) {
    const memberContext = await membershipCodeService.findMemberContextByCode(code, { request });
    if (!memberContext) throw appError('كود العضوية غير صحيح أو منتهي الصلاحية.', 404, 'MEMBERSHIP_PORTAL_CODE_INVALID');

    // The public middleware starts with the requested/default tenant so RLS is
    // active before the route runs. Once the code is resolved, switch to the
    // code owner's tenant for every subsequent read. This keeps a member's
    // memberships, payments and attendance in one isolated report even when
    // the shared portal URL is opened without a tenant query string.
    const readOnlyBaseline = Boolean(getTenantContext()?.readOnlyBaseline);
    return runTenantContext({ tenantId: memberContext.tenantId, mode: 'public', readOnlyBaseline }, async () => {
        // Portal lookup is a read report even though it uses POST to keep the
        // membership code out of the URL. Do not auto-checkout attendance or
        // initialize schema while assembling the report.
        const details = await getMemberDetails(memberContext.memberId, { readOnly: true });
        if (memberContext.tenantType === TENANT_TYPES.INDEPENDENT_TRAINER) {
            return trainerPortalSnapshot(memberContext, request, readOnlyBaseline);
        }
        const today = todayInTimeZone();
        const from = details.member.registrationDate || `${today.slice(0, 7)}-01`;
        const attendance = await attendanceService.getMemberAttendance(memberContext.memberId, { from, to: today, readOnly: true });
        const memberships = (details.memberships || []).map(sanitizeMembership);
        const branches = await getMemberBranchSummary(memberContext);
        const current = currentMembership(memberships);
        const portalSession = readOnlyBaseline ? null : await commercialService.createPortalSession({
            tenantId: memberContext.tenantId,
            memberId: memberContext.memberId,
            request
        });
        const visitorToken = commercialService.visitorTokenFor(request);
        if (!readOnlyBaseline) await commercialService.recordPortalVisit({
            memberId: memberContext.memberId,
            visitorToken,
            readOnly: false
        });
        return {
            tenant: {
                name: memberContext.tenantName,
                slug: memberContext.tenantSlug
            },
            reportNumber: reportNumber(),
            issuedAt: new Date().toISOString(),
            member: {
                fullName: details.member.fullName,
                phone: details.member.phone,
                email: details.member.email || null,
                registrationDate: details.member.registrationDate
            },
            firstJoinDate: memberships.reduce((earliest, item) => !earliest || item.startDate < earliest ? item.startDate : earliest, details.member.registrationDate),
            currentMembership: current,
            memberships,
            branches,
            financialSummary: {
                totalDue: Number(details.financialSummary?.totalDue || 0),
                totalPaid: Number(details.financialSummary?.totalPaid || 0),
                totalRemaining: Number(details.financialSummary?.totalRemaining || 0),
                transactionCount: Number(details.financialSummary?.transactionCount || 0),
                paidTransactionCount: Number(details.financialSummary?.paidTransactionCount || 0)
            },
            payments: (details.payments || []).map(sanitizePayment),
            freezes: (details.freezes || []).map(sanitizeFreeze),
            attendance: attendance.records.map((record) => ({
                id: record.id,
                attendanceDate: record.attendanceDate,
                checkInAt: record.checkInAt,
                checkOutAt: record.checkOutAt,
                checkInSource: record.checkInSource,
                checkOutSource: record.checkOutSource,
                durationMinutes: record.durationMinutes
            })),
            attendanceSummary: { totalVisits: attendance.records.length },
            // Controller-only transport metadata. It is removed before JSON
            // serialization and is used solely to set HttpOnly cookies.
            _portalSessionCookie: portalSession?.cookie || null,
            _portalVisitorCookie: readOnlyBaseline ? null : commercialService.buildCookie(
                commercialService.PORTAL_VISITOR_COOKIE,
                visitorToken,
                30 * 24 * 60 * 60,
                request
            )
        };
    });
}

async function getPortalPaymentMethods(request) {
    return commercialService.withPortalSession(request, async () => {
        const tenantId = getTenantContext()?.tenantId;
        const tenantType = await lookupTenantType(tenantId);
        if (tenantType === TENANT_TYPES.INDEPENDENT_TRAINER) return { portalMode: 'trainer_client', paymentMethods: [] };
        return { paymentMethods: await commercialService.getTenantPaymentMethods({ readOnly: true }) };
    });
}

async function getPortalMembershipCatalog(request) {
    return commercialService.withPortalSession(request, async () => {
        const tenantId = getTenantContext()?.tenantId;
        const tenantType = await lookupTenantType(tenantId);
        if (tenantType === TENANT_TYPES.INDEPENDENT_TRAINER) {
            return { portalMode: 'trainer_client', currency: 'EGP', plans: [], types: [], prices: {}, activePlanCount: 0, activeTypeCount: 0 };
        }
        const pricing = await memberService.getPricingCatalog(null, { readOnly: true });
        const plans = Object.entries(pricing.plans || {})
            .filter(([, plan]) => plan && plan.active !== false)
            .sort(([, first], [, second]) => Number(first.sortOrder || 0) - Number(second.sortOrder || 0))
            .map(([code, plan]) => ({
                code,
                label: String(plan.label || code),
                monthlyPrice: Number(plan.monthlyPrice || 0)
            }));
        const types = Object.entries(pricing.types || {})
            .filter(([, type]) => type && type.active !== false)
            .sort(([, first], [, second]) => Number(first.sortOrder || 0) - Number(second.sortOrder || 0))
            .map(([code, type]) => ({
                code,
                label: String(type.label || code),
                mode: String(type.mode || 'months'),
                durationValue: Number(type.durationValue || 0)
            }));
        const activePlanCodes = new Set(plans.map((plan) => plan.code));
        const activeTypeCodes = new Set(types.map((type) => type.code));
        const prices = {};
        for (const plan of plans) {
            prices[plan.code] = {};
            for (const type of types) {
                const value = pricing.prices?.[plan.code]?.[type.code];
                if (value !== undefined && Number.isFinite(Number(value))) prices[plan.code][type.code] = Number(value);
            }
        }
        return {
            currency: 'EGP',
            plans,
            types,
            prices,
            // Keep the response deliberately limited to active combinations.
            activePlanCount: activePlanCodes.size,
            activeTypeCount: activeTypeCodes.size
        };
    });
}

async function getPortalSession(request) {
    return commercialService.withPortalSession(request, async (session) => ({
        tenantId: session.tenantId,
        memberId: session.memberId
    }));
}

async function getOccupancyByCode(code, request) {
    const memberContext = await membershipCodeService.findMemberContextByCode(code, { request, auditAction: null });
    if (!memberContext) throw appError('كود العضوية غير صحيح أو منتهي الصلاحية.', 404, 'MEMBERSHIP_PORTAL_CODE_INVALID');
    if (memberContext.tenantType === TENANT_TYPES.INDEPENDENT_TRAINER) {
        throw appError('خدمة الازدحام متاحة لبوابة الجيم فقط.', 404, 'PORTAL_FEATURE_UNAVAILABLE');
    }

    // Occupancy is deliberately resolved from the code owner's tenant and is
    // a read-only aggregate. The polling endpoint must not create audit rows,
    // auto-checkout attendance, or initialize schema.
    const readOnlyBaseline = Boolean(getTenantContext()?.readOnlyBaseline);
    return runTenantContext({ tenantId: memberContext.tenantId, mode: 'public', readOnlyBaseline }, async () => {
        const branches = await getMemberBranchSummary(memberContext);
        const branchOccupancy = await Promise.all(branches.map(async (branch) => ({
            ...branch,
            ...(await attendanceService.getCurrentOccupancy({ branchId: branch.id }))
        })));
        const aggregate = await attendanceService.getCurrentOccupancy();
        return { ...aggregate, branches: branchOccupancy };
    });
}

module.exports = { getOccupancyByCode, getPortalMembershipCatalog, getPortalPaymentMethods, getPortalSession, lookupByCode };
