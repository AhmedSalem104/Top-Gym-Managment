'use strict';

const { createMemberPortalController } = require('../controllers/member-portal.controller');

function registerMemberPortalRoutes(app, { membershipCodeService, portalService, libraryService, asyncRoute, ownerOnly }) {
    const controller = createMemberPortalController({ membershipCodeService, portalService, libraryService });
    // This endpoint is explicitly allow-listed by auth.middleware.js and is
    // additionally protected by the dedicated portal rate limiter.
    app.post('/api/member-portal/lookup', asyncRoute(controller.lookup));
    app.post('/api/member-portal/occupancy', asyncRoute(controller.occupancy));
    app.get('/api/member-portal/library/options', asyncRoute(controller.libraryOptions));
    app.get('/api/member-portal/library/:type', asyncRoute(controller.libraryCollection));
    app.get('/api/member-portal/library/:type/:id', asyncRoute(controller.libraryItem));
    app.get('/api/members/:id/membership-code', ownerOnly, asyncRoute(controller.getCode));
    app.post('/api/members/:id/membership-code/reveal', ownerOnly, asyncRoute(controller.revealCode));
    app.post('/api/members/:id/membership-code/resend', ownerOnly, asyncRoute(controller.resend));
    app.post('/api/members/:id/membership-code/rotate', ownerOnly, asyncRoute(controller.rotate));
}

module.exports = { registerMemberPortalRoutes };
