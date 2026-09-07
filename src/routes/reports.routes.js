'use strict';

const { createReportsController } = require('../controllers/reports.controller');
const { hasPermission } = require('../permissions/permissions');

function registerReportsRoutes(app, { reportService, storeService, branchService, asyncRoute }) {
    const controller = createReportsController({ reportService, storeService, branchService, hasPermission });
    app.get('/api/reports', asyncRoute(controller.list));
}

module.exports = { registerReportsRoutes };
