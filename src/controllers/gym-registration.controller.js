'use strict';

function decodeHeaderFilename(value) {
    const encoded = String(value || '');
    if (!encoded) return '';
    try { return decodeURIComponent(encoded); } catch (_) { return encoded; }
}

function createGymRegistrationController({ service }) {
    return {
        catalog: async (_request, response) => {
            response.set('Cache-Control', 'no-store, private');
            response.json(await service.catalog());
        },

        createRequest: async (request, response) => {
            response.status(201).json(await service.createRequest(request.body || {}, request.get('idempotency-key')));
        },

        uploadProof: async (request, response) => {
            response.status(201).json(await service.uploadProof(request.params.requestId, request.get('x-registration-token'), {
                buffer: request.body,
                mimeType: request.get('x-payment-proof-mime') || request.get('content-type'),
                fileName: request.get('x-payment-proof-name-encoded')
                    ? decodeHeaderFilename(request.get('x-payment-proof-name-encoded'))
                    : request.get('x-payment-proof-name')
            }));
        },

        status: async (request, response) => {
            response.set('Cache-Control', 'no-store, private');
            response.json(await service.getPublicStatus(request.params.requestId, request.get('x-registration-token')));
        },

        adminList: async (request, response) => {
            response.json(await service.listAdminRequests({
                status: request.query?.status,
                page: request.query?.page,
                pageSize: request.query?.pageSize
            }));
        },

        adminProof: async (request, response) => {
            const proof = await service.getAdminProofFile(request.params.proofId);
            if (!proof) return response.status(404).end();
            response.set({
                'Cache-Control': 'no-store, no-cache, must-revalidate, private',
                'Content-Type': proof.mime_type,
                'Content-Length': String(proof.content.length),
                'Content-Disposition': `inline; filename="${String(proof.file_name || 'registration-payment-proof').replace(/["\\\r\n]/g, '_')}"`,
                'X-Content-Type-Options': 'nosniff'
            });
            return response.send(proof.content);
        },

        approve: async (request, response) => {
            response.json(await service.approve(
                request.params.requestId,
                request.auth?.id,
                request.body?.reviewNotes || request.body?.notes
            ));
        },

        reject: async (request, response) => {
            response.json(await service.reject(
                request.params.requestId,
                request.auth?.id,
                request.body?.reviewNotes || request.body?.reason
            ));
        }
    };
}

module.exports = { createGymRegistrationController };
