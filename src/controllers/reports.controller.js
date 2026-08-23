'use strict';

function createReportsController({ reportService, storeService, hasPermission }) {
    return {
        list: async (request, response) => {
            const report = await reportService.getReportData(request.query);
            if (storeService && hasPermission(request.auth, 'store.reports.view')) {
                const canViewProfit = hasPermission(request.auth, 'store.profit.view');
                report.store = await storeService.getReports({ ...request.query, includeProfit: canViewProfit });
                if (!canViewProfit && report.store?.summary) delete report.store.summary.storeExpenses;
            }
            response.json(report);
        }
    };
}

module.exports = { createReportsController };
