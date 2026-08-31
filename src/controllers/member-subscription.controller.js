'use strict';

function decodeHeaderFilename(value) {
    const encoded = String(value || '');
    if (!encoded) return '';
    try { return decodeURIComponent(encoded); } catch (_) { return encoded; }
}

function createMemberSubscriptionController({ service }) {
    return {
        portalRequests: async (request, response) => {
            response.set('Cache-Control', 'private, no-store');
            response.json(await service.getPortalRequests(request, {
                status: request.query?.status,
                page: request.query?.page,
                pageSize: request.query?.pageSize,
                readOnly: request.readOnlyRequest
            }));
        },

        createPortalRequest: async (request, response) => {
            const submission = request.memberSubscriptionSubmission;
            const body = submission?.fields || request.body || {};
            response.status(201).json(await service.createPortalRequest(request, body, submission?.proof || null));
        },

        uploadPortalProof: async (request, response) => {
            response.status(201).json(await service.uploadPortalProof(request, request.params.requestId, {
                buffer: request.body,
                mimeType: request.get('x-payment-proof-mime') || request.get('content-type'),
                fileName: request.get('x-payment-proof-name-encoded')
                    ? decodeHeaderFilename(request.get('x-payment-proof-name-encoded'))
                    : request.get('x-payment-proof-name')
            }));
        },

        ownerRequests: async (request, response) => {
            response.json(await service.getOwnerRequests({
                status: request.query?.status,
                page: request.query?.page,
                pageSize: request.query?.pageSize,
                readOnly: request.readOnlyRequest
            }));
        },

        proofFile: async (request, response) => {
            const proof = await service.getStoredProofFile(request.params.proofId);
            if (!proof) return response.status(404).end();
            response.set({
                'Cache-Control': 'no-store, no-cache, must-revalidate, private',
                'Content-Type': proof.mime_type,
                'Content-Length': String(proof.content.length),
                'Content-Disposition': `inline; filename="${String(proof.file_name || 'payment-proof').replace(/["\\\r\n]/g, '_')}"`,
                'X-Content-Type-Options': 'nosniff'
            });
            return response.send(proof.content);
        },

        approve: async (request, response) => {
            response.json(await service.approveRequest(
                request.params.requestId,
                request.auth?.id,
                request.body?.reviewNotes || request.body?.notes
            ));
        },

        reject: async (request, response) => {
            response.json(await service.rejectRequest(
                request.params.requestId,
                request.auth?.id,
                request.body?.reviewNotes || request.body?.reason
            ));
        }
    };
}

module.exports = { createMemberSubscriptionController };
