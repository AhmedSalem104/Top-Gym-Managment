'use strict';

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
const { registerMemberFeedbackRoutes } = require('./member-feedback.routes');
const { registerStoreRoutes } = require('./store.routes');
const { registerIntelligenceRoutes } = require('./intelligence.routes');
const { registerBrandingRoutes } = require('./branding.routes');
const { registerPlatformRoutes } = require('./platform.routes');
const { registerPlatformAdminRoutes } = require('./platform-admin.routes');
const { registerSaasRoutes } = require('./saas.routes');

function registerRoutes(app, {
    asyncRoute,
    authService,
    permissionService,
    ownerOnly,
    allowLoginAttempt,
    backupService,
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
    feedbackService,
    storeService,
    intelligenceService,
    brandingService,
    saasService,
    platformAdminService,
    getPool
}) {
    app.get('/api/health', asyncRoute(async (_request, response) => {
        const pool = await getPool();
        await pool.request().query('SELECT 1 AS ok;');
        response.json({ ok: true, database: 'connected' });
    }));

    registerAuthRoutes(app, { authService, permissionService, asyncRoute, ownerOnly, allowLoginAttempt });
    registerBackupRoutes(app, { backupService, brandingService, asyncRoute, isAuthorizedCronRequest });
    registerFinanceRoutes(app, { financeService, asyncRoute });
    registerDashboardRoutes(app, { memberService, analyticsService, storeService, asyncRoute });
    registerLibraryRoutes(app, { libraryService, asyncRoute });
    registerReportsRoutes(app, { reportService, storeService, asyncRoute });
    registerAttendanceRoutes(app, { attendanceService, asyncRoute });
    registerPricingRoutes(app, { pricingService, asyncRoute });
    registerCoachingRoutes(app, { coachingService, asyncRoute });
    registerDayPassRoutes(app, { dayPassService, asyncRoute, ownerOnly });
    registerMemberPortalRoutes(app, { membershipCodeService, portalService, libraryService, asyncRoute, ownerOnly });
    registerMemberFeedbackRoutes(app, { feedbackService, asyncRoute, ownerOnly });
    registerStoreRoutes(app, { storeService, asyncRoute });
    registerIntelligenceRoutes(app, { intelligenceService, asyncRoute });
    registerBrandingRoutes(app, { brandingService, asyncRoute });
    registerPlatformRoutes(app, { saasService, authService, asyncRoute });
    registerPlatformAdminRoutes(app, { platformAdminService, saasService, authService, asyncRoute });
    registerSaasRoutes(app, { saasService, asyncRoute, ownerOnly });
    registerMembersRoutes(app, { memberService, asyncRoute });
}

module.exports = { registerRoutes };
