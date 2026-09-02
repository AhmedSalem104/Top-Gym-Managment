'use strict';

function createBarController({ barService }) {
    const actor = (request) => ({ actorUserId: request.auth?.id, role: request.auth?.role, request });
    return {
        menu: async (request, response) => response.json(await barService.listMenu({ locationId: request.query.locationId, ...actor(request) })),
        recipes: async (request, response) => response.json({ recipes: await barService.listRecipes() }),
        createRecipe: async (request, response) => response.status(201).json({ recipe: await barService.createRecipe(request.body || {}, actor(request)) }),
        modifiers: async (request, response) => response.json({ modifiers: await barService.listModifiers() }),
        createModifier: async (request, response) => response.status(201).json({ modifier: await barService.createModifier(request.body || {}, actor(request)) }),
        openShift: async (request, response) => response.status(201).json({ shift: await barService.openShift(request.body || {}, actor(request)) }),
        currentShift: async (request, response) => response.json({ shift: await barService.getOpenShift(request.params.branchId, actor(request)) }),
        closeShift: async (request, response) => response.json({ shift: await barService.closeShift(request.params.id, request.body || {}, actor(request)) }),
        sale: async (request, response) => response.status(201).json(await barService.createSale(request.body || {}, actor(request))),
        waste: async (request, response) => response.status(201).json({ waste: await barService.recordWaste(request.body || {}, actor(request)) })
    };
}

module.exports = { createBarController };
