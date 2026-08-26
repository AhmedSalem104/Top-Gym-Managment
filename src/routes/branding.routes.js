'use strict';

const express = require('express');
const { createBrandingController } = require('../controllers/branding.controller');
const { requirePermission } = require('../middleware/permission.middleware');

function registerBrandingRoutes(app, { brandingService, asyncRoute }) {
    const controller = createBrandingController({ brandingService });
    app.get('/api/branding', asyncRoute(controller.publicBranding));
    app.get('/api/branding/assets/:key', asyncRoute(controller.publishedAsset));
    app.get('/api/branding/draft-assets/:key', requirePermission('branding.view', { ownerOnly: true }), asyncRoute(controller.draftAsset));
    app.get('/api/branding/settings', requirePermission('branding.view', { ownerOnly: true }), asyncRoute(controller.settings));
    app.put('/api/branding/draft', requirePermission('branding.edit', { ownerOnly: true }), asyncRoute(controller.saveDraft));
    app.post('/api/branding/publish', requirePermission('branding.publish', { ownerOnly: true }), asyncRoute(controller.publish));
    app.post('/api/branding/reset', requirePermission('branding.reset', { ownerOnly: true }), asyncRoute(controller.reset));
    app.post('/api/branding/assets', requirePermission('branding.edit', { ownerOnly: true }), express.raw({ type: 'application/octet-stream', limit: '2mb' }), asyncRoute(controller.uploadAsset));
    app.delete('/api/branding/assets/:key', requirePermission('branding.edit', { ownerOnly: true }), asyncRoute(controller.removeAsset));
}

module.exports = { registerBrandingRoutes };
