'use strict';

function createMemberPortalController({ membershipCodeService, portalService }) {
    return {
        lookup: async (request, response) => {
            response.json(await portalService.lookupByCode(request.body?.membershipCode, request));
        },

        getCode: async (request, response) => {
            response.json(await membershipCodeService.getPreview(request.params.id));
        },

        revealCode: async (request, response) => {
            response.json(await membershipCodeService.getForMember(request.params.id, {
                userId: request.auth?.id,
                request,
                action: 'viewed'
            }));
        },

        resend: async (request, response) => {
            response.json({
                ...await membershipCodeService.getForMember(request.params.id, {
                    userId: request.auth?.id,
                    request,
                    action: 'whatsapp_sent'
                }),
                portalUrl: membershipCodeService.getPortalUrl(`${request.protocol}://${request.get('host')}`)
            });
        },

        rotate: async (request, response) => {
            response.json({
                ...await membershipCodeService.rotateForMember(request.params.id, {
                    userId: request.auth?.id,
                    request
                }),
                portalUrl: membershipCodeService.getPortalUrl(`${request.protocol}://${request.get('host')}`)
            });
        }
    };
}

module.exports = { createMemberPortalController };
