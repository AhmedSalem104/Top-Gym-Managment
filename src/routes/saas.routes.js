'use strict';

const express = require('express');
const { createSaasController } = require('../controllers/saas.controller');

function registerSaasRoutes(app, { saasService, asyncRoute, ownerOnly }) {
    const controller = createSaasController({ saasService });
    app.get('/api/saas/subscription', ownerOnly, asyncRoute(controller.subscription));
    app.get('/api/saas/plans', ownerOnly, asyncRoute(controller.plans));
    app.get('/api/saas/subscription-requests', ownerOnly, asyncRoute(controller.requests));
    app.post('/api/saas/subscription-requests', ownerOnly, asyncRoute(controller.createRequest));
    app.post('/api/saas/subscription-requests/:id/proof', ownerOnly, express.raw({ type: 'application/octet-stream', limit: '4mb' }), asyncRoute(controller.uploadProof));
    app.get('/api/saas/payment-proofs/:id/file', ownerOnly, asyncRoute(controller.paymentProof));
}

module.exports = { registerSaasRoutes };
