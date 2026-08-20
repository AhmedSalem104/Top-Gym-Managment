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

function registerRoutes(app, {
    asyncRoute,
    authService,
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
    getPool
}) {
    app.get('/api/health', asyncRoute(async (_request, response) => {
        const pool = await getPool();
        await pool.request().query('SELECT 1 AS ok;');
        response.json({ ok: true, database: 'connected' });
    }));

    registerAuthRoutes(app, { authService, asyncRoute, ownerOnly, allowLoginAttempt });
    registerBackupRoutes(app, { backupService, asyncRoute, isAuthorizedCronRequest });
    registerFinanceRoutes(app, { financeService, asyncRoute });
    registerDashboardRoutes(app, { memberService, analyticsService, asyncRoute });
    registerLibraryRoutes(app, { libraryService, asyncRoute });
    registerReportsRoutes(app, { reportService, asyncRoute });
    registerAttendanceRoutes(app, { attendanceService, asyncRoute });
    registerPricingRoutes(app, { pricingService, asyncRoute });
    registerCoachingRoutes(app, { coachingService, asyncRoute });
    registerDayPassRoutes(app, { dayPassService, asyncRoute, ownerOnly });
    registerMembersRoutes(app, { memberService, asyncRoute });
}

module.exports = { registerRoutes };
