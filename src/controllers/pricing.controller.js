'use strict';

function createPricingController({ pricingService }) {
    return {
        catalog: async (request, response) => {
            response.json(await pricingService.getPricingCatalog(null, { readOnly: request.readOnlyRequest }));
        },
        updateCatalog: async (request, response) => {
            response.json(await pricingService.updatePricingCatalog(request.body));
        },
        updatePlan: async (request, response) => {
            response.json(await pricingService.updatePricing(request.params.planCode, request.body));
        },
        createPlan: async (request, response) => {
            response.status(201).json(await pricingService.createPricingPlan(request.body));
        },
        updatePlanDetails: async (request, response) => {
            response.json(await pricingService.updatePricingPlan(request.params.planCode, request.body));
        },
        createMembershipType: async (request, response) => {
            response.status(201).json(await pricingService.createMembershipType(request.body));
        },
        updateMembershipType: async (request, response) => {
            response.json(await pricingService.updateMembershipType(request.params.typeCode, request.body));
        }
    };
}

module.exports = { createPricingController };
