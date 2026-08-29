'use strict';

function createBrandingController({ brandingService }) {
    return {
        publicBranding: async (request, response) => {
            const platformScope = String(request.query?.scope || '').trim().toLowerCase() === 'platform';
            const result = platformScope
                ? brandingService.getPlatformBranding()
                : await brandingService.getPublicBranding({ readOnly: request.readOnlyBaseline });
            response.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
            response.json(result);
        },

        settings: async (request, response) => {
            response.json(await brandingService.ownerResponse({ readOnly: request.readOnlyBaseline }));
        },

        saveDraft: async (request, response) => {
            response.json(await brandingService.saveDraft(request.body?.config, request.auth?.id));
        },

        publish: async (request, response) => {
            response.json(await brandingService.publish(request.auth?.id));
        },

        reset: async (request, response) => {
            response.json(await brandingService.resetDraft(request.auth?.id));
        },

        uploadAsset: async (request, response) => {
            const result = await brandingService.uploadDraftAsset({
                key: request.get('x-branding-asset-key'),
                mimeType: request.get('x-branding-asset-mime'),
                fileName: request.get('x-branding-asset-name'),
                width: request.get('x-branding-asset-width'),
                height: request.get('x-branding-asset-height'),
                buffer: request.body
            }, request.auth?.id);
            response.status(201).json({ asset: result });
        },

        removeAsset: async (request, response) => {
            response.json(await brandingService.removeDraftAsset(request.params.key, request.auth?.id));
        },

        publishedAsset: async (request, response) => {
            const asset = await brandingService.readAsset(request.params.key, 'published', { readOnly: request.readOnlyBaseline });
            if (!asset) return response.status(404).end();
            response.set({
                'Cache-Control': 'public, max-age=31536000, immutable',
                'Content-Type': asset.mime_type,
                'Content-Disposition': `inline; filename="${String(asset.file_name || 'brand-asset').replace(/[^\w.\- ]/g, '_')}"`
            });
            return response.send(asset.content);
        },

        draftAsset: async (request, response) => {
            const asset = await brandingService.readAsset(request.params.key, 'draft', { readOnly: request.readOnlyBaseline });
            if (!asset) return response.status(404).end();
            response.set({
                'Cache-Control': 'no-store, no-cache, must-revalidate, private',
                'Content-Type': asset.mime_type,
                'Content-Disposition': `inline; filename="${String(asset.file_name || 'brand-asset').replace(/[^\w.\- ]/g, '_')}"`
            });
            return response.send(asset.content);
        }
    };
}

module.exports = { createBrandingController };
