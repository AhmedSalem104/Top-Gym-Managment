'use strict';

const { createMemberFeedbackController } = require('../controllers/member-feedback.controller');

function registerMemberFeedbackRoutes(app, { feedbackService, asyncRoute, ownerOnly }) {
    const controller = createMemberFeedbackController({ feedbackService });
    app.post('/api/member-portal/feedback', asyncRoute(controller.submit));
    app.get('/api/member-feedback', ownerOnly, asyncRoute(controller.list));
}

module.exports = { registerMemberFeedbackRoutes };
