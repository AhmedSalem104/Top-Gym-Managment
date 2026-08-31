'use strict';

function createFinanceController({ financeService }) {
    return {
        monthly: async (request, response) => {
            response.json(await financeService.getMonthlyFinance({ readOnly: request.readOnlyRequest }));
        },
        createExpense: async (request, response) => {
            response.status(201).json({ expense: await financeService.createExpense(request.body) });
        },
        updateExpense: async (request, response) => {
            response.json({ expense: await financeService.updateExpense(request.params.id, request.body) });
        },
        deleteExpense: async (request, response) => {
            await financeService.deleteExpense(request.params.id);
            response.status(204).send();
        }
    };
}

module.exports = { createFinanceController };
