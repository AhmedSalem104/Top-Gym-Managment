'use strict';

const { createAuthController } = require('../controllers/auth.controller');

function registerAuthRoutes(app, { authService, asyncRoute, ownerOnly, allowLoginAttempt }) {
    const controller = createAuthController({ authService, allowLoginAttempt });
    app.get('/api/auth/session', asyncRoute(controller.session));
    app.post('/api/auth/login', asyncRoute(controller.login));
    app.post('/api/auth/logout', asyncRoute(controller.logout));
    app.get('/api/auth/users', ownerOnly, asyncRoute(controller.listUsers));
    app.post('/api/auth/users', ownerOnly, asyncRoute(controller.createAssistant));
    app.put('/api/auth/users/:id', ownerOnly, asyncRoute(controller.updateUser));
    app.patch('/api/auth/users/:id/status', ownerOnly, asyncRoute(controller.setStatus));
}

module.exports = { registerAuthRoutes };
