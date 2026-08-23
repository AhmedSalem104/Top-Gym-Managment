'use strict';

const { createStoreController } = require('../controllers/store.controller');
const { hasPermission } = require('../permissions/permissions');

function registerStoreRoutes(app, { storeService, asyncRoute }) {
    const controller = createStoreController({ storeService, hasPermission });
    app.get('/api/store/bootstrap', asyncRoute(controller.bootstrap));
    app.get('/api/store/dashboard', asyncRoute(controller.dashboard));
    app.get('/api/store/reports', asyncRoute(controller.reports));

    app.get('/api/store/categories', asyncRoute(controller.categories));
    app.post('/api/store/categories', asyncRoute(controller.createCategory));
    app.put('/api/store/categories/:id', asyncRoute(controller.updateCategory));

    app.get('/api/store/products', asyncRoute(controller.products));
    app.get('/api/store/products/:id', asyncRoute(controller.product));
    app.post('/api/store/products', asyncRoute(controller.createProduct));
    app.put('/api/store/products/:id', asyncRoute(controller.updateProduct));
    app.delete('/api/store/products/:id', asyncRoute(controller.deleteProduct));
    app.post('/api/store/products/:productId/variants', asyncRoute(controller.createVariant));
    app.put('/api/store/products/:productId/variants/:variantId', asyncRoute(controller.updateVariant));
    app.delete('/api/store/products/:productId/variants/:variantId', asyncRoute(controller.deleteVariant));

    app.get('/api/store/suppliers', asyncRoute(controller.suppliers));
    app.post('/api/store/suppliers', asyncRoute(controller.createSupplier));
    app.put('/api/store/suppliers/:id', asyncRoute(controller.updateSupplier));

    app.get('/api/store/inventory', asyncRoute(controller.inventory));
    app.get('/api/store/inventory/movements', asyncRoute(controller.stockMovements));
    app.post('/api/store/inventory/adjustments', asyncRoute(controller.adjustInventory));
    app.get('/api/store/customers/search', asyncRoute(controller.customers));

    app.get('/api/store/purchases', asyncRoute(controller.purchases));
    app.get('/api/store/purchases/:id', asyncRoute(controller.purchase));
    app.post('/api/store/purchases', asyncRoute(controller.createPurchase));

    app.get('/api/store/sales', asyncRoute(controller.sales));
    app.get('/api/store/sales/:id', asyncRoute(controller.sale));
    app.post('/api/store/sales', asyncRoute(controller.createSale));
    app.post('/api/store/sales/:id/returns', asyncRoute(controller.createReturn));

    app.get('/api/store/expenses', asyncRoute(controller.expenses));
    app.post('/api/store/expenses', asyncRoute(controller.createExpense));
    app.put('/api/store/expenses/:id', asyncRoute(controller.updateExpense));
    app.delete('/api/store/expenses/:id', asyncRoute(controller.deleteExpense));

    app.get('/api/members/:id/store-purchases', asyncRoute(controller.memberPurchases));
}

module.exports = { registerStoreRoutes };
