'use strict';

const { createAuthController } = require('../controllers/auth.controller');

function registerAuthRoutes(app, { authService, permissionService, asyncRoute, ownerOnly, allowLoginAttempt }) {
    const controller = createAuthController({ authService, permissionService, allowLoginAttempt });
    app.get('/api/auth/session', asyncRoute(controller.session));
    app.post('/api/auth/login', asyncRoute(controller.login));
    app.post('/api/auth/logout', asyncRoute(controller.logout));
    app.get('/api/auth/users', ownerOnly, asyncRoute(controller.listUsers));
    app.post('/api/auth/users', ownerOnly, asyncRoute(controller.createAssistant));
    app.put('/api/auth/users/:id', ownerOnly, asyncRoute(controller.updateUser));
    app.patch('/api/auth/users/:id/status', ownerOnly, asyncRoute(controller.setStatus));
    app.get('/api/auth/permissions/catalog', ownerOnly, asyncRoute(controller.permissionsCatalog));
    app.get('/api/auth/users/:id/permissions', ownerOnly, asyncRoute(controller.userPermissions));
    app.put('/api/auth/users/:id/permissions', ownerOnly, asyncRoute(controller.updateUserPermissions));
    app.post('/api/auth/users/:id/permissions/reset', ownerOnly, asyncRoute(controller.resetUserPermissions));
}

module.exports = { registerAuthRoutes };
