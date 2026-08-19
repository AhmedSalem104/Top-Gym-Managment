'use strict';

function createDashboardController({ memberService, analyticsService }) {
    return {
        dashboard: async (_request, response) => {
            response.json(await memberService.getDashboard());
        },
        analytics: async (request, response) => {
            response.json(await analyticsService.getDashboardAnalytics(request.query.period));
        },
        bootstrap: async (_request, response) => {
            response.json(await memberService.getBootstrap());
        }
    };
}

module.exports = { createDashboardController };
