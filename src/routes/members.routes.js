'use strict';

const { createMembersController } = require('../controllers/members.controller');

function registerMembersRoutes(app, { memberService, asyncRoute }) {
    const controller = createMembersController({ memberService });
    app.get('/api/members', asyncRoute(controller.list));
    app.get('/api/members/:id/details', asyncRoute(controller.details));
    app.get('/api/members/:id', asyncRoute(controller.getById));
    app.post('/api/members', asyncRoute(controller.create));
    app.put('/api/members/:id', asyncRoute(controller.update));
    app.post('/api/members/:id/freeze', asyncRoute(controller.freeze));
    app.post('/api/members/:id/resume', asyncRoute(controller.resume));
    app.post('/api/members/:id/renew', asyncRoute(controller.renew));
    app.post('/api/members/:id/memberships', asyncRoute(controller.addMembership));
    app.post('/api/memberships/:id/payments', asyncRoute(controller.payment));
    app.delete('/api/members/:id', asyncRoute(controller.remove));
}

module.exports = { registerMembersRoutes };
