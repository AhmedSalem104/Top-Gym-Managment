'use strict';

const { performance } = require('node:perf_hooks');
const { registerAuthRoutes } = require('./auth.routes');
const { registerMembersRoutes } = require('./members.routes');
const { registerAttendanceRoutes } = require('./attendance.routes');
const { registerFinanceRoutes } = require('./finance.routes');
const { registerDashboardRoutes } = require('./dashboard.routes');
const { registerLibraryRoutes } = require('./library.routes');
const { registerReportsRoutes } = require('./reports.routes');
const { registerBackupRoutes } = require('./backup.routes');
const { registerPricingRoutes } = require('./pricing.routes');
const { registerCoachingRoutes } = require('./coaching.routes');
const { registerDayPassRoutes } = require('./day-pass.routes');
const { registerMemberPortalRoutes } = require('./member-portal.routes');
const { registerMemberSubscriptionRoutes } = require('./member-subscription.routes');
const { registerGymRegistrationRoutes } = require('./gym-registration.routes');
const { registerMemberFeedbackRoutes } = require('./member-feedback.routes');
const { registerStoreRoutes } = require('./store.routes');
const { registerIntelligenceRoutes } = require('./intelligence.routes');
const { registerBrandingRoutes } = require('./branding.routes');
const { registerPlatformRoutes } = require('./platform.routes');
const { registerPlatformAdminRoutes } = require('./platform-admin.routes');
const { registerSaasRoutes } = require('./saas.routes');
const { registerTrainerRoutes } = require('./trainer.routes');
const { registerBranchRoutes } = require('./branch.routes');
const { registerStockLocationRoutes } = require('./stock-location.routes');
const { registerBarRoutes } = require('./bar.routes');
const { platformOnly } = require('../middleware/platform.middleware');

function createHealthHandler({ getPool, getStorageStatus = () => ({ status: 'not_configured' }), now = () => performance.now() } = {}) {
    return async (request, response) => {
        const startedAt = now();
        try {
            const pool = await getPool();
            await pool.request().query('SELECT 1 AS ok;');
            const databaseDurationMs = Math.round((now() - startedAt) * 100) / 100;
            return response.json({
                ok: true,
                status: 'healthy',
                database: 'connected',
                checks: {
                    application: { status: 'healthy' },
                    database: { status: 'healthy', durationMs: databaseDurationMs },
                    storage: getStorageStatus()
                },
                requestId: request.requestId || null
            });
        } catch (_) {
            const databaseDurationMs = Math.round((now() - startedAt) * 100) / 100;
            return response.status(503).json({
                ok: false,
                status: 'degraded',
                database: 'unavailable',
                checks: {
                    application: { status: 'healthy' },
                    database: { status: 'unhealthy', durationMs: databaseDurationMs },
                    storage: getStorageStatus()
                },
                requestId: request.requestId || null
            });
        }
    };
}

function createLivenessHandler() {
    return async (request, response) => response.json({
        ok: true,
        status: 'alive',
        checks: { application: { status: 'healthy' } },
        requestId: request.requestId || null
    });
}

function registerRoutes(app, {
    asyncRoute,
    authService,
    permissionService,
    ownerOnly,
    allowLoginAttempt,
    backupService,
    backupRecoveryService,
    objectStorageService,
    backupActionRateLimit,
    isAuthorizedCronRequest,
    financeService,
    analyticsService,
    reportService,
    attendanceService,
    libraryService,
    pricingService,
    coachingService,
    dayPassService,
    memberService,
    membershipCodeService,
    portalService,
    commercialService,
    memberSubscriptionService,
    gymRegistrationService,
    feedbackService,
    storeService,
    intelligenceService,
    brandingService,
    saasService,
    trainerService,
    trainerCommerceService,
    platformAdminService,
    branchService,
    stockLocationService,
    barService,
    getPool
}) {
    app.get('/api/health/live', asyncRoute(createLivenessHandler()));
    app.get('/api/health', asyncRoute(createHealthHandler({
        getPool,
        getStorageStatus: () => ({ status: objectStorageService?.providerStatus || 'not_configured' })
    })));

    registerAuthRoutes(app, { authService, permissionService, saasService, asyncRoute, ownerOnly, allowLoginAttempt });
    registerBackupRoutes(app, { backupService, backupRecoveryService, brandingService, asyncRoute, isAuthorizedCronRequest, backupActionRateLimit });
    registerFinanceRoutes(app, { financeService, branchService, asyncRoute });
    registerDashboardRoutes(app, { memberService, analyticsService, storeService, asyncRoute });
    registerLibraryRoutes(app, { libraryService, asyncRoute });
    registerReportsRoutes(app, { reportService, storeService, asyncRoute });
    registerAttendanceRoutes(app, { attendanceService, branchService, asyncRoute });
    registerPricingRoutes(app, { pricingService, asyncRoute });
    registerCoachingRoutes(app, { coachingService, asyncRoute });
    registerDayPassRoutes(app, { dayPassService, branchService, asyncRoute, ownerOnly });
    registerMemberPortalRoutes(app, { membershipCodeService, portalService, libraryService, commercialService, asyncRoute, ownerOnly });
    registerMemberSubscriptionRoutes(app, { service: memberSubscriptionService, asyncRoute, ownerOnly });
    registerGymRegistrationRoutes(app, { service: gymRegistrationService, asyncRoute, platformOnly });
    registerMemberFeedbackRoutes(app, { feedbackService, asyncRoute, ownerOnly });
    registerStoreRoutes(app, { storeService, asyncRoute });
    registerIntelligenceRoutes(app, { intelligenceService, asyncRoute });
    registerBrandingRoutes(app, { brandingService, asyncRoute });
    registerPlatformRoutes(app, { saasService, authService, asyncRoute });
    registerPlatformAdminRoutes(app, {
        platformAdminService,
        saasService,
        authService,
        backupRecoveryService,
        commercialService,
        asyncRoute,
        backupActionRateLimit
    });
    registerSaasRoutes(app, { saasService, asyncRoute, ownerOnly });
    registerTrainerRoutes(app, { trainerService, trainerCommerceService, asyncRoute });
    registerBranchRoutes(app, { branchService, asyncRoute });
    registerStockLocationRoutes(app, { stockLocationService, asyncRoute });
    registerBarRoutes(app, { barService, asyncRoute });
    registerMembersRoutes(app, { memberService, branchService, asyncRoute });
}

module.exports = { createHealthHandler, createLivenessHandler, registerRoutes };
