'use strict';

const { createDayPassController } = require('../controllers/day-pass.controller');

function registerDayPassRoutes(app, { dayPassService, asyncRoute, ownerOnly }) {
    const controller = createDayPassController({ dayPassService });
    app.get('/api/day-passes/pricing', asyncRoute(controller.pricing));
    app.put('/api/day-passes/pricing', ownerOnly, asyncRoute(controller.updatePricing));
    app.get('/api/day-passes', asyncRoute(controller.list));
    app.get('/api/day-passes/summary', asyncRoute(controller.summary));
    app.post('/api/day-passes', asyncRoute(controller.create));
    app.post('/api/day-passes/:id/whatsapp-opened', asyncRoute(controller.whatsappOpened));
    app.post('/api/day-passes/:id/void', ownerOnly, asyncRoute(controller.void));
}

module.exports = { registerDayPassRoutes };
