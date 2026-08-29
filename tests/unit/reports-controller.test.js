'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createReportsController } = require('../../src/controllers/reports.controller');

test('reports controller passes request read-only mode outside user query parameters', async () => {
    const calls = [];
    const reportService = {
        async getReportData(query, options) {
            calls.push({ query, options });
            return { summary: {} };
        }
    };
    const controller = createReportsController({
        reportService,
        storeService: null,
        hasPermission: () => false
    });
    const response = {
        json(value) {
            this.value = value;
        }
    };

    await controller.list({
        query: { from: '2026-08-01', readOnly: 'false' },
        readOnlyRequest: true,
        auth: null
    }, response);

    assert.deepEqual(calls, [{
        query: { from: '2026-08-01', readOnly: 'false' },
        options: { readOnly: true }
    }]);
    assert.deepEqual(response.value, { summary: {} });
});
