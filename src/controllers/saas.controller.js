'use strict';

function createSaasController({ saasService }) {
    return {
        subscription: async (request, response) => {
            response.json(await saasService.getTenantBilling(request.tenant?.id));
        },

        plans: async (_request, response) => {
            response.json({ plans: await saasService.getPlans() });
        },

        requests: async (request, response) => {
            response.json({ requests: await saasService.listTenantRequests(request.tenant?.id) });
        },

        createRequest: async (request, response) => {
            response.status(201).json({ request: await saasService.createSubscriptionRequest({
                tenantId: request.tenant?.id,
                userId: request.auth?.id,
                planId: request.body?.planId,
                planCode: request.body?.planCode,
                notes: request.body?.notes
            }) });
        },

        uploadProof: async (request, response) => {
            response.status(201).json({ request: await saasService.uploadPaymentProof({
                tenantId: request.tenant?.id,
                userId: request.auth?.id,
                requestId: request.params.id,
                buffer: request.body,
                mimeType: request.get('x-payment-proof-mime') || request.get('content-type'),
                fileName: request.get('x-payment-proof-name')
            }) });
        },

        paymentProof: async (request, response) => {
            const proof = await saasService.getPaymentProofFile(request.params.id, request.tenant?.id);
            if (!proof) return response.status(404).end();
            response.set({
                'Cache-Control': 'no-store, no-cache, must-revalidate, private',
                'Content-Type': proof.mime_type,
                'Content-Disposition': `inline; filename="${String(proof.file_name || 'payment-proof').replace(/[^\w.\- ]/g, '_')}"`
            });
            return response.send(proof.content);
        }
    };
}

module.exports = { createSaasController };
