'use strict';

const { createPlatformAdminController } = require('../controllers/platform-admin.controller');
const { platformOnly } = require('../middleware/platform.middleware');

function registerPlatformAdminRoutes(app, { platformAdminService, saasService, authService, backupRecoveryService, asyncRoute, backupActionRateLimit }) {
    const controller = createPlatformAdminController({ platformAdminService, saasService, authService, backupRecoveryService });
    app.get('/api/platform-admin/dashboard', platformOnly, asyncRoute(controller.dashboard));
    app.get('/api/platform-admin/tenants', platformOnly, asyncRoute(controller.tenants));
    app.post('/api/platform-admin/tenants', platformOnly, asyncRoute(controller.createTenant));
    app.get('/api/platform-admin/tenants/:tenantId', platformOnly, asyncRoute(controller.tenant));
    app.patch('/api/platform-admin/tenants/:tenantId', platformOnly, asyncRoute(controller.updateTenant));
    app.patch('/api/platform-admin/tenants/:tenantId/status', platformOnly, asyncRoute(controller.status));
    app.get('/api/platform-admin/tenants/:tenantId/subscription', platformOnly, asyncRoute(controller.subscription));
    app.patch('/api/platform-admin/tenants/:tenantId/subscription', platformOnly, asyncRoute(controller.subscription));
    app.patch('/api/platform-admin/tenants/:tenantId/plan', platformOnly, asyncRoute(controller.plan));
    app.get('/api/platform-admin/tenants/:tenantId/usage', platformOnly, asyncRoute(controller.usage));
    app.get('/api/platform-admin/tenants/:tenantId/overrides', platformOnly, asyncRoute(controller.overrides));
    app.put('/api/platform-admin/tenants/:tenantId/overrides', platformOnly, asyncRoute(controller.overrides));
    app.get('/api/platform-admin/tenants/:tenantId/users', platformOnly, asyncRoute(controller.users));
    app.patch('/api/platform-admin/tenants/:tenantId/users/:userId/status', platformOnly, asyncRoute(controller.userStatus));
    app.post('/api/platform-admin/tenants/:tenantId/users/:userId/reset-password', platformOnly, asyncRoute(controller.resetPassword));
    app.post('/api/platform-admin/tenants/:tenantId/owner', platformOnly, asyncRoute(controller.owner));
    app.get('/api/platform-admin/tenants/:tenantId/health', platformOnly, asyncRoute(controller.health));
    app.get('/api/platform-admin/tenants/:tenantId/audit', platformOnly, asyncRoute(controller.audit));
    app.get('/api/platform-admin/tenants/:tenantId/notes', platformOnly, asyncRoute(controller.notes));
    app.post('/api/platform-admin/tenants/:tenantId/notes', platformOnly, asyncRoute(controller.notes));
    app.get('/api/platform-admin/plans', platformOnly, asyncRoute(controller.plans));
    app.post('/api/platform-admin/plans', platformOnly, asyncRoute(controller.createPlan));
    app.patch('/api/platform-admin/plans/:planId', platformOnly, asyncRoute(controller.updatePlan));
    app.delete('/api/platform-admin/plans/:planId', platformOnly, asyncRoute(controller.deletePlan));
    app.get('/api/platform-admin/subscription-requests', platformOnly, asyncRoute(controller.requests));
    app.post('/api/platform-admin/subscription-requests/:requestId/approve', platformOnly, asyncRoute(controller.approveRequest));
    app.post('/api/platform-admin/subscription-requests/:requestId/reject', platformOnly, asyncRoute(controller.rejectRequest));
    app.get('/api/platform-admin/payment-proofs/:proofId/file', platformOnly, asyncRoute(controller.paymentProof));
    app.get('/api/platform-admin/audit', platformOnly, asyncRoute(controller.auditAll));
    app.get('/api/platform-admin/backups/health', platformOnly, asyncRoute(controller.backupHealth));
    app.get('/api/platform-admin/backups', platformOnly, asyncRoute(controller.backupHistory));
    app.post('/api/platform-admin/backups/run', platformOnly, backupActionRateLimit, asyncRoute(controller.runPlatformBackup));
    app.post('/api/platform-admin/backups/retention', platformOnly, backupActionRateLimit, asyncRoute(controller.cleanupBackups));
    app.get('/api/platform-admin/backups/:backupId/download', platformOnly, backupActionRateLimit, asyncRoute(controller.downloadPlatformBackup));
    app.get('/api/platform-admin/tenants/:tenantId/backups', platformOnly, asyncRoute(controller.tenantBackups));
    app.post('/api/platform-admin/tenants/:tenantId/backups', platformOnly, backupActionRateLimit, asyncRoute(controller.runTenantBackup));
    app.get('/api/platform-admin/tenants/:tenantId/backups/:backupId/download', platformOnly, backupActionRateLimit, asyncRoute(controller.downloadTenantBackup));
}

module.exports = { registerPlatformAdminRoutes };
