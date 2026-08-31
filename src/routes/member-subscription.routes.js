'use strict';

const express = require('express');
const { createMemberSubscriptionController } = require('../controllers/member-subscription.controller');
const { parseMemberSubscriptionSubmission } = require('../middleware/member-subscription-submission.middleware');

function registerMemberSubscriptionRoutes(app, { service, asyncRoute, ownerOnly }) {
    const controller = createMemberSubscriptionController({ service });
    app.get('/api/member-portal/subscription-requests', asyncRoute(controller.portalRequests));
    app.post('/api/member-portal/subscription-requests', parseMemberSubscriptionSubmission, asyncRoute(controller.createPortalRequest));
    app.post('/api/member-portal/subscription-requests/:requestId/proof', express.raw({ type: ['application/octet-stream', 'image/jpeg', 'image/png', 'image/webp', 'application/pdf'], limit: '4mb' }), asyncRoute(controller.uploadPortalProof));

    app.get('/api/member-subscription-requests', ownerOnly, asyncRoute(controller.ownerRequests));
    app.get('/api/member-subscription-requests/proofs/:proofId/file', ownerOnly, asyncRoute(controller.proofFile));
    app.post('/api/member-subscription-requests/:requestId/approve', ownerOnly, asyncRoute(controller.approve));
    app.post('/api/member-subscription-requests/:requestId/reject', ownerOnly, asyncRoute(controller.reject));
}

module.exports = { registerMemberSubscriptionRoutes };
