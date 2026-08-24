'use strict';

const { createIntelligenceController } = require('../controllers/intelligence.controller');

function registerIntelligenceRoutes(app, { intelligenceService, asyncRoute }) {
    const controller = createIntelligenceController({ intelligenceService });

    app.get('/api/intelligence/overview', asyncRoute(controller.overview));
    app.post('/api/intelligence/query', asyncRoute(controller.query));
    app.get('/api/intelligence/churn', asyncRoute(controller.churn));
    app.post('/api/intelligence/workout-suggestions', asyncRoute(controller.workoutSuggestion));
    app.post('/api/intelligence/diet-suggestions', asyncRoute(controller.dietSuggestion));
    app.post('/api/intelligence/refine', asyncRoute(controller.refine));
}

module.exports = { registerIntelligenceRoutes };
