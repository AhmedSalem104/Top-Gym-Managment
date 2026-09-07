'use strict';

const { resolveBranchContext } = require('../branches/branch-context');

function createReportsController({ reportService, storeService, branchService, hasPermission }) {
    return {
        list: async (request, response) => {
            const branch = branchService
                ? await resolveBranchContext(request, { branchService, allowAll: true })
                : { branchId: null, sectionId: null };
            const reportOptions = { readOnly: request.readOnlyRequest };
            if (branchService) {
                reportOptions.branchId = branch.branchId;
                reportOptions.sectionId = branch.sectionId;
            }
            const report = await reportService.getReportData(request.query, reportOptions);
            if (storeService && hasPermission(request.auth, 'store.reports.view')) {
                const canViewProfit = hasPermission(request.auth, 'store.profit.view');
                report.store = await storeService.getReports({ ...request.query, includeProfit: canViewProfit, readOnly: request.readOnlyRequest, branchId: branch.branchId });
                if (!canViewProfit && report.store?.summary) delete report.store.summary.storeExpenses;
            }
            response.json(report);
        }
    };
}

module.exports = { createReportsController };
