'use strict';

const { createStockLocationController } = require('../controllers/stock-location.controller');

function registerStockLocationRoutes(app, { stockLocationService, asyncRoute }) {
    const controller = createStockLocationController({ stockLocationService });
    app.get('/api/commerce/stock-locations', asyncRoute(controller.locations));
    app.post('/api/commerce/stock-locations', asyncRoute(controller.createLocation));
    app.post('/api/commerce/stock-locations/:locationId/adjustments', asyncRoute(controller.adjust));
    app.get('/api/commerce/stock-transfers', asyncRoute(controller.transfers));
    app.post('/api/commerce/stock-transfers', asyncRoute(controller.createTransfer));
    app.post('/api/commerce/stock-transfers/:id/approve', asyncRoute(controller.approveTransfer));
    app.post('/api/commerce/stock-transfers/:id/receive', asyncRoute(controller.receiveTransfer));
}

module.exports = { registerStockLocationRoutes };
