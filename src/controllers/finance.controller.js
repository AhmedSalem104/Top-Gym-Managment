'use strict';

function createFinanceController({ financeService }) {
    return {
        monthly: async (_request, response) => {
            response.json(await financeService.getMonthlyFinance());
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
