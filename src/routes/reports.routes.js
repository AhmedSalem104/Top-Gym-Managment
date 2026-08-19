'use strict';

const { createReportsController } = require('../controllers/reports.controller');

function registerReportsRoutes(app, { reportService, asyncRoute }) {
    const controller = createReportsController({ reportService });
    app.get('/api/reports', asyncRoute(controller.list));
}

module.exports = { registerReportsRoutes };
