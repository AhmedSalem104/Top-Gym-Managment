'use strict';

const { createDashboardController } = require('../controllers/dashboard.controller');

const { hasPermission } = require('../permissions/permissions');

function registerDashboardRoutes(app, { memberService, analyticsService, storeService, branchService, asyncRoute }) {
    const controller = createDashboardController({ memberService, analyticsService, storeService, branchService, hasPermission });
    app.get('/api/dashboard', asyncRoute(controller.dashboard));
    app.get('/api/dashboard-analytics', asyncRoute(controller.analytics));
    app.get('/api/bootstrap', asyncRoute(controller.bootstrap));
}

module.exports = { registerDashboardRoutes };
