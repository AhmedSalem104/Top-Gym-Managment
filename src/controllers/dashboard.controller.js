'use strict';

function createDashboardController({ memberService, analyticsService, storeService, branchService, hasPermission }) {
    const branchOptions = (request) => require('../branches/branch-context').resolveBranchContext(request, { branchService, allowAll: true });
    return {
        dashboard: async (request, response) => {
            const branch = await branchOptions(request);
            const canViewStore = Boolean(storeService && hasPermission(request.auth, 'store.view'));
            const [dashboard, store] = await Promise.all([
                memberService.getDashboard({ readOnly: request.readOnlyRequest, branchId: branch.branchId, sectionId: branch.sectionId }),
                canViewStore
                    ? storeService.getDashboard({ includeProfit: hasPermission(request.auth, 'store.profit.view'), readOnly: request.readOnlyRequest, branchId: branch.branchId })
                    : Promise.resolve(null)
            ]);
            dashboard.store = store;
            response.json(dashboard);
        },
        analytics: async (request, response) => {
            const branch = await branchOptions(request);
            response.json(await analyticsService.getDashboardAnalytics(request.query.period, { readOnly: request.readOnlyRequest, branchId: branch.branchId, sectionId: branch.sectionId }));
        },
        bootstrap: async (request, response) => {
            const branch = await branchOptions(request);
            response.json(await memberService.getBootstrap({ readOnly: request.readOnlyRequest, branchId: branch.branchId, sectionId: branch.sectionId }));
        }
    };
}

module.exports = { createDashboardController };
