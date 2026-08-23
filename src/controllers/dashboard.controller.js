'use strict';

function createDashboardController({ memberService, analyticsService, storeService, hasPermission }) {
    return {
        dashboard: async (request, response) => {
            const dashboard = await memberService.getDashboard();
            const canViewStore = Boolean(storeService && hasPermission(request.auth, 'store.view'));
            dashboard.store = canViewStore
                ? await storeService.getDashboard({ includeProfit: hasPermission(request.auth, 'store.profit.view') })
                : null;
            response.json(dashboard);
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
