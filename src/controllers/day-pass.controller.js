'use strict';

const { resolveBranchContext } = require('../branches/branch-context');

function createDayPassController({ dayPassService, branchService }) {
    const branchOptions = (request, required = false) => resolveBranchContext(request, { branchService, required, allowAll: !required });
    return {
        pricing: async (request, response) => {
            response.json(await dayPassService.getPricing({ readOnly: request.readOnlyRequest }));
        },
        updatePricing: async (request, response) => {
            response.json(await dayPassService.updatePricing(request.body));
        },
        create: async (request, response) => {
            const branch = await branchOptions(request, true);
            response.status(201).json(await dayPassService.createDayPass(request.body, {
                createdByUserId: request.auth?.id,
                branchId: branch.branchId
            }));
        },
        list: async (request, response) => {
            const branch = await branchOptions(request);
            response.json(await dayPassService.listDayPasses({ ...request.query, readOnly: request.readOnlyRequest, branchId: branch.branchId }));
        },
        update: async (request, response) => {
            response.json(await dayPassService.updateDayPass(request.params.id, request.body));
        },
        remove: async (request, response) => {
            response.json(await dayPassService.deleteDayPass(request.params.id));
        },
        summary: async (request, response) => {
            const branch = await branchOptions(request);
            response.json(await dayPassService.getSummary({ ...request.query, readOnly: request.readOnlyRequest, branchId: branch.branchId }));
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
