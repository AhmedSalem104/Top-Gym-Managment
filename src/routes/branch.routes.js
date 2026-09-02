'use strict';

const { createBranchController } = require('../controllers/branch.controller');

function registerBranchRoutes(app, { branchService, asyncRoute }) {
    const controller = createBranchController({ branchService });
    app.get('/api/branches', asyncRoute(controller.list));
    app.get('/api/branches/bootstrap', asyncRoute(controller.bootstrap));
    app.post('/api/branches', asyncRoute(controller.create));
    app.patch('/api/branches/:id', asyncRoute(controller.update));
    app.post('/api/branches/:id/archive', asyncRoute(controller.archive));
    app.get('/api/branches/users/:userId', asyncRoute(controller.access));
    app.put('/api/branches/users/:userId', asyncRoute(controller.assignAccess));
}

module.exports = { registerBranchRoutes };
