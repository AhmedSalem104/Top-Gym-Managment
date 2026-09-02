'use strict';

const { resolveBranchContext } = require('../branches/branch-context');

function createFinanceController({ financeService, branchService }) {
    const branchOptions = (request) => resolveBranchContext(request, { branchService, allowAll: true });
    return {
        monthly: async (request, response) => {
            const branch = await branchOptions(request);
            response.json(await financeService.getMonthlyFinance({ readOnly: request.readOnlyRequest, branchId: branch.branchId }));
        },
        createExpense: async (request, response) => {
            const branch = await branchOptions(request);
            response.status(201).json({ expense: await financeService.createExpense(request.body, { branchId: branch.branchId, actorUserId: request.auth?.id }) });
        },
        updateExpense: async (request, response) => {
            const branch = await branchOptions(request);
            response.json({ expense: await financeService.updateExpense(request.params.id, request.body, { branchId: branch.branchId }) });
        },
        deleteExpense: async (request, response) => {
            const branch = await branchOptions(request);
            await financeService.deleteExpense(request.params.id, { branchId: branch.branchId });
            response.status(204).send();
        }
    };
}

module.exports = { createFinanceController };
