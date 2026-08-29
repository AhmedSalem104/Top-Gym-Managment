'use strict';

function createPlatformController({ saasService, authService }) {
    return {
        overview: async (request, response) => {
            response.json(await saasService.getPlatformOverview({ readOnly: request.readOnlyBaseline }));
        },

        tenants: async (request, response) => {
            response.json({ tenants: await saasService.listTenants({ readOnly: request.readOnlyBaseline }) });
        },

        createTenant: async (request, response) => {
            response.status(201).json(await saasService.createTenantWithOwner(request.body || {}, request.auth?.id, authService));
        },

        updateTenantStatus: async (request, response) => {
            response.json(await saasService.updateTenantStatus(request.params.id, request.body?.status, request.auth?.id, request.body?.notes));
        },

        plans: async (request, response) => {
            response.json({ plans: await saasService.getPlans({ includeInactive: true, readOnly: request.readOnlyBaseline }) });
        },

        updatePlan: async (request, response) => {
            response.json({ plan: await saasService.updatePlan(request.params.id, request.body || {}, request.auth?.id) });
        },

        requests: async (request, response) => {
            response.json({ requests: await saasService.listPlatformRequests({ status: request.query?.status || '' }) });
        },

        approveRequest: async (request, response) => {
            response.json(await saasService.approveRequest(request.params.id, request.auth?.id, request.body?.reviewNotes));
        },

        rejectRequest: async (request, response) => {
            response.json({ request: await saasService.rejectRequest(request.params.id, request.auth?.id, request.body?.reviewNotes) });
        },

        paymentProof: async (request, response) => {
            const proof = await saasService.getPaymentProofFile(request.params.id, null, { readOnly: request.readOnlyBaseline });
            if (!proof) return response.status(404).end();
            response.set({
                'Cache-Control': 'no-store, no-cache, must-revalidate, private',
                'Content-Type': proof.mime_type,
                'Content-Disposition': `inline; filename="${String(proof.file_name || 'payment-proof').replace(/[^\w.\- ]/g, '_')}"`
            });
            return response.send(proof.content);
        },

        audit: async (request, response) => {
            response.json({ audit: await saasService.listAudit({ limit: request.query?.limit, readOnly: request.readOnlyBaseline }) });
        }
    };
}

module.exports = { createPlatformController };
