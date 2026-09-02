'use strict';

const { createFinanceController } = require('../controllers/finance.controller');

function registerFinanceRoutes(app, { financeService, branchService, asyncRoute }) {
    const controller = createFinanceController({ financeService, branchService });
    app.get('/api/monthly-finance', asyncRoute(controller.monthly));
    app.post('/api/expenses', asyncRoute(controller.createExpense));
    app.put('/api/expenses/:id', asyncRoute(controller.updateExpense));
    app.delete('/api/expenses/:id', asyncRoute(controller.deleteExpense));
}

module.exports = { registerFinanceRoutes };
