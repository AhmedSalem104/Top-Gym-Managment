'use strict';

const { createDashboardController } = require('../controllers/dashboard.controller');

function registerDashboardRoutes(app, { memberService, analyticsService, asyncRoute }) {
    const controller = createDashboardController({ memberService, analyticsService });
    app.get('/api/dashboard', asyncRoute(controller.dashboard));
    app.get('/api/dashboard-analytics', asyncRoute(controller.analytics));
    app.get('/api/bootstrap', asyncRoute(controller.bootstrap));
}

module.exports = { registerDashboardRoutes };
