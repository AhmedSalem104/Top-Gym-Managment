'use strict';

const { createReportsController } = require('../controllers/reports.controller');
const { hasPermission } = require('../permissions/permissions');

function registerReportsRoutes(app, { reportService, storeService, asyncRoute }) {
    const controller = createReportsController({ reportService, storeService, hasPermission });
    app.get('/api/reports', asyncRoute(controller.list));
}

module.exports = { registerReportsRoutes };
