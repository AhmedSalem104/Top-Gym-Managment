'use strict';

function createReportsController({ reportService }) {
    return {
        list: async (request, response) => {
            response.json(await reportService.getReportData(request.query));
        }
    };
}

module.exports = { createReportsController };
