'use strict';

function createDayPassController({ dayPassService }) {
    return {
        pricing: async (request, response) => {
            response.json(await dayPassService.getPricing({ readOnly: request.readOnlyRequest }));
        },
        updatePricing: async (request, response) => {
            response.json(await dayPassService.updatePricing(request.body));
        },
        create: async (request, response) => {
            response.status(201).json(await dayPassService.createDayPass(request.body, {
                createdByUserId: request.auth?.id
            }));
        },
        list: async (request, response) => {
            response.json(await dayPassService.listDayPasses({ ...request.query, readOnly: request.readOnlyRequest }));
        },
        update: async (request, response) => {
            response.json(await dayPassService.updateDayPass(request.params.id, request.body));
        },
        remove: async (request, response) => {
            response.json(await dayPassService.deleteDayPass(request.params.id));
        },
        summary: async (request, response) => {
            response.json(await dayPassService.getSummary({ ...request.query, readOnly: request.readOnlyRequest }));
        },
        whatsappOpened: async (request, response) => {
            response.json(await dayPassService.markWhatsappOpened(request.params.id));
        },
        void: async (request, response) => {
            response.json(await dayPassService.voidDayPass(request.params.id));
        }
    };
}

module.exports = { createDayPassController };
