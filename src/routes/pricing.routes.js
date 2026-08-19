'use strict';

const { createPricingController } = require('../controllers/pricing.controller');

function registerPricingRoutes(app, { pricingService, asyncRoute }) {
    const controller = createPricingController({ pricingService });
    app.get('/api/pricing', asyncRoute(controller.catalog));
    app.put('/api/pricing', asyncRoute(controller.updateCatalog));
    app.put('/api/pricing/:planCode', asyncRoute(controller.updatePlan));
    app.post('/api/pricing-plans', asyncRoute(controller.createPlan));
    app.put('/api/pricing-plans/:planCode', asyncRoute(controller.updatePlanDetails));
    app.post('/api/membership-types', asyncRoute(controller.createMembershipType));
    app.put('/api/membership-types/:typeCode', asyncRoute(controller.updateMembershipType));
}

module.exports = { registerPricingRoutes };
