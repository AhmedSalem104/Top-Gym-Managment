'use strict';

const { createPlatformController } = require('../controllers/platform.controller');
const { platformOnly } = require('../middleware/platform.middleware');

function registerPlatformRoutes(app, { saasService, authService, asyncRoute }) {
    const controller = createPlatformController({ saasService, authService });
    app.get('/api/platform/overview', platformOnly, asyncRoute(controller.overview));
    app.get('/api/platform/tenants', platformOnly, asyncRoute(controller.tenants));
    app.post('/api/platform/tenants', platformOnly, asyncRoute(controller.createTenant));
    app.patch('/api/platform/tenants/:id/status', platformOnly, asyncRoute(controller.updateTenantStatus));
    app.get('/api/platform/plans', platformOnly, asyncRoute(controller.plans));
    app.patch('/api/platform/plans/:id', platformOnly, asyncRoute(controller.updatePlan));
    app.get('/api/platform/subscription-requests', platformOnly, asyncRoute(controller.requests));
    app.post('/api/platform/subscription-requests/:id/approve', platformOnly, asyncRoute(controller.approveRequest));
    app.post('/api/platform/subscription-requests/:id/reject', platformOnly, asyncRoute(controller.rejectRequest));
    app.get('/api/platform/payment-proofs/:id/file', platformOnly, asyncRoute(controller.paymentProof));
    app.get('/api/platform/audit', platformOnly, asyncRoute(controller.audit));
}

module.exports = { registerPlatformRoutes };
