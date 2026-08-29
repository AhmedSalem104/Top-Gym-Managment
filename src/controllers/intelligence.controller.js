'use strict';

function createIntelligenceController({ intelligenceService }) {
    return {
        overview: async (request, response) => {
            response.set('Cache-Control', 'private, max-age=15, stale-while-revalidate=60');
            response.json(await intelligenceService.getOverview({ actorUserId: request.auth?.id, readOnly: request.readOnlyRequest }));
        },
        query: async (request, response) => {
            response.json(await intelligenceService.answerQuestion(request.body?.question, { actorUserId: request.auth?.id }));
        },
        churn: async (request, response) => {
            response.set('Cache-Control', 'private, max-age=15, stale-while-revalidate=60');
            response.json(await intelligenceService.getChurnRisks({ limit: request.query.limit, actorUserId: request.auth?.id, readOnly: request.readOnlyRequest }));
        },
        workoutSuggestion: async (request, response) => {
            response.status(201).json(await intelligenceService.generateWorkoutSuggestion(request.body, { actorUserId: request.auth?.id }));
        },
        dietSuggestion: async (request, response) => {
            response.status(201).json(await intelligenceService.generateDietSuggestion(request.body, { actorUserId: request.auth?.id }));
        },
        refine: async (request, response) => {
            response.status(201).json(await intelligenceService.refineSuggestion(request.body, { actorUserId: request.auth?.id }));
        }
    };
}

module.exports = { createIntelligenceController };
