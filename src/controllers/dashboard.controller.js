'use strict';

function createDashboardController({ memberService, analyticsService, storeService, hasPermission }) {
    return {
        dashboard: async (request, response) => {
            const canViewStore = Boolean(storeService && hasPermission(request.auth, 'store.view'));
            const [dashboard, store] = await Promise.all([
                memberService.getDashboard({ readOnly: request.readOnlyBaseline }),
                canViewStore
                    ? storeService.getDashboard({ includeProfit: hasPermission(request.auth, 'store.profit.view'), readOnly: request.readOnlyBaseline })
                    : Promise.resolve(null)
            ]);
            dashboard.store = store;
            response.json(dashboard);
        },
        analytics: async (request, response) => {
            response.json(await analyticsService.getDashboardAnalytics(request.query.period, { readOnly: request.readOnlyBaseline }));
        },
        bootstrap: async (request, response) => {
            response.json(await memberService.getBootstrap({ readOnly: request.readOnlyBaseline }));
        }
    };
}

module.exports = { createDashboardController };
