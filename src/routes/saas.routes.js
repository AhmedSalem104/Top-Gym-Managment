'use strict';

const express = require('express');
const { createSaasController } = require('../controllers/saas.controller');

function registerSaasRoutes(app, { saasService, asyncRoute, ownerOnly }) {
    const controller = createSaasController({ saasService });
    // Read-only entitlement envelope for every authenticated tenant user.
    // It reuses request.saas resolved by the central middleware; it is not a
    // second entitlement or plan-resolution path.
    app.get('/api/saas/entitlements', asyncRoute(controller.entitlements));
    app.get('/api/saas/subscription', ownerOnly, asyncRoute(controller.subscription));
    app.get('/api/saas/plans', ownerOnly, asyncRoute(controller.plans));
    app.get('/api/saas/feature-catalog', ownerOnly, asyncRoute(controller.featureCatalog));
    app.get('/api/saas/subscription-requests', ownerOnly, asyncRoute(controller.requests));
    app.post('/api/saas/subscription-requests', ownerOnly, asyncRoute(controller.createRequest));
    app.post('/api/saas/subscription-requests/:id/proof', ownerOnly, express.raw({ type: 'application/octet-stream', limit: '4mb' }), asyncRoute(controller.uploadProof));
    app.get('/api/saas/payment-proofs/:id/file', ownerOnly, asyncRoute(controller.paymentProof));
}

module.exports = { registerSaasRoutes };
