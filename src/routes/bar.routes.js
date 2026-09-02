'use strict';

const { createBarController } = require('../controllers/bar.controller');

function registerBarRoutes(app, { barService, asyncRoute }) {
    const controller = createBarController({ barService });
    app.get('/api/bar/menu', asyncRoute(controller.menu));
    app.get('/api/bar/recipes', asyncRoute(controller.recipes));
    app.post('/api/bar/recipes', asyncRoute(controller.createRecipe));
    app.get('/api/bar/modifiers', asyncRoute(controller.modifiers));
    app.post('/api/bar/modifiers', asyncRoute(controller.createModifier));
    app.post('/api/bar/shifts', asyncRoute(controller.openShift));
    app.get('/api/bar/shifts/branch/:branchId/open', asyncRoute(controller.currentShift));
    app.post('/api/bar/shifts/:id/close', asyncRoute(controller.closeShift));
    app.post('/api/bar/sales', asyncRoute(controller.sale));
    app.post('/api/bar/waste', asyncRoute(controller.waste));
}

module.exports = { registerBarRoutes };
