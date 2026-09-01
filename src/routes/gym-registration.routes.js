'use strict';

const express = require('express');
const { createGymRegistrationController } = require('../controllers/gym-registration.controller');
const { TENANT_TYPES } = require('../tenancy/tenant-types');

function registerGymRegistrationRoutes(app, { service, asyncRoute, platformOnly } = {}) {
    const controller = createGymRegistrationController({ service });
    const trainerController = createGymRegistrationController({ service, tenantType: TENANT_TYPES.INDEPENDENT_TRAINER });
    app.get('/api/public/gym-registration/catalog', asyncRoute(controller.catalog));
    app.post('/api/public/gym-registration/requests', asyncRoute(controller.createRequest));
    app.post('/api/public/gym-registration/requests/:requestId/proof', express.raw({ type: '*/*', limit: '4mb' }), asyncRoute(controller.uploadProof));
    app.get('/api/public/gym-registration/requests/:requestId', asyncRoute(controller.status));

    // Independent Trainer uses the same proof, idempotency and approval
    // pipeline. The route is the trusted type boundary; request bodies never
    // select a tenant type.
    app.get('/api/public/trainer-registration/catalog', asyncRoute(trainerController.catalog));
    app.post('/api/public/trainer-registration/requests', asyncRoute(trainerController.createRequest));
    app.post('/api/public/trainer-registration/requests/:requestId/proof', express.raw({ type: '*/*', limit: '4mb' }), asyncRoute(trainerController.uploadProof));
    app.get('/api/public/trainer-registration/requests/:requestId', asyncRoute(trainerController.status));

    app.get('/api/platform-admin/gym-registration-requests', platformOnly, asyncRoute(controller.adminList));
    app.get('/api/platform-admin/gym-registration-requests/proofs/:proofId/file', platformOnly, asyncRoute(controller.adminProof));
    app.post('/api/platform-admin/gym-registration-requests/:requestId/approve', platformOnly, asyncRoute(controller.approve));
    app.post('/api/platform-admin/gym-registration-requests/:requestId/reject', platformOnly, asyncRoute(controller.reject));
}

module.exports = { registerGymRegistrationRoutes };
