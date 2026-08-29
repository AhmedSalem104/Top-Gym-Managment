'use strict';

function createMembersController({ memberService }) {
    return {
        list: async (request, response) => {
            response.json(await memberService.getMembers({
                search: request.query.search,
                status: request.query.status,
                sort: request.query.sort,
                page: request.query.page,
                pageSize: request.query.pageSize,
                readOnly: request.readOnlyRequest
            }));
        },

        details: async (request, response) => {
            response.json(await memberService.getMemberDetails(request.params.id));
        },

        refundPreview: async (request, response) => {
            response.json(await memberService.getSubscriptionRefundPreview(request.params.id));
        },

        getById: async (request, response) => {
            response.json({ member: await memberService.getMemberById(request.params.id) });
        },

        markAlertCommunication: async (request, response) => {
            response.json({
                ...await memberService.markAlertCommunication(
                    request.params.id,
                    request.body || {},
                    request.auth?.id
                )
            });
        },

        create: async (request, response) => {
            response.status(201).json({ member: await memberService.createMember(request.body) });
        },

        update: async (request, response) => {
            response.json({ member: await memberService.updateMember(request.params.id, request.body) });
        },

        freeze: async (request, response) => {
            response.json({ member: await memberService.freezeMember(request.params.id, request.body?.days, request.body?.reason) });
        },

        resume: async (request, response) => {
            response.json({ member: await memberService.resumeMember(request.params.id) });
        },

        renew: async (request, response) => {
            response.json({ member: await memberService.renewMember(request.params.id, request.body) });
        },

        addMembership: async (request, response) => {
            response.status(201).json({ member: await memberService.renewMember(request.params.id, request.body) });
        },

        payment: async (request, response) => {
            response.json({ member: await memberService.recordPayment(request.params.id, request.body) });
        },

        refund: async (request, response) => {
            response.json(await memberService.refundSubscription(
                request.params.id,
                request.body || {},
                request.auth?.id
            ));
        },

        remove: async (request, response) => {
            await memberService.deleteMember(request.params.id);
            response.status(204).send();
        }
    };
}

module.exports = { createMembersController };
