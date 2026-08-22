'use strict';

const { createMemberPortalController } = require('../controllers/member-portal.controller');

function registerMemberPortalRoutes(app, { membershipCodeService, portalService, asyncRoute, ownerOnly }) {
    const controller = createMemberPortalController({ membershipCodeService, portalService });
    // This endpoint is explicitly allow-listed by auth.middleware.js and is
    // additionally protected by the dedicated portal rate limiter.
    app.post('/api/member-portal/lookup', asyncRoute(controller.lookup));
    app.get('/api/members/:id/membership-code', ownerOnly, asyncRoute(controller.getCode));
    app.post('/api/members/:id/membership-code/reveal', ownerOnly, asyncRoute(controller.revealCode));
    app.post('/api/members/:id/membership-code/resend', ownerOnly, asyncRoute(controller.resend));
    app.post('/api/members/:id/membership-code/rotate', ownerOnly, asyncRoute(controller.rotate));
}

module.exports = { registerMemberPortalRoutes };
