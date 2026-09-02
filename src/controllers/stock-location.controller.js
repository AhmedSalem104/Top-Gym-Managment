'use strict';

function createStockLocationController({ stockLocationService }) {
    const actor = (request) => ({ actorUserId: request.auth?.id, role: request.auth?.role, request });
    return {
        locations: async (request, response) => response.json({ locations: await stockLocationService.listLocations({ branchId: request.query.branchId, includeArchived: request.query.includeArchived === 'true', ...actor(request) }) }),
        createLocation: async (request, response) => response.status(201).json({ location: await stockLocationService.createLocation(request.body || {}, actor(request)) }),
        adjust: async (request, response) => response.json({ balance: await stockLocationService.adjustInventory({ ...request.body, locationId: request.params.locationId, actorUserId: request.auth?.id, role: request.auth?.role }) }),
        transfers: async (request, response) => response.json({ transfers: await stockLocationService.listTransfers({ status: request.query.status, ...actor(request) }) }),
        createTransfer: async (request, response) => response.status(201).json({ transfer: await stockLocationService.createTransfer(request.body || {}, actor(request)) }),
        approveTransfer: async (request, response) => response.json({ transfer: await stockLocationService.approveTransfer(request.params.id, actor(request)) }),
        receiveTransfer: async (request, response) => response.json({ transfer: await stockLocationService.receiveTransfer(request.params.id, actor(request)) })
    };
}

module.exports = { createStockLocationController };
