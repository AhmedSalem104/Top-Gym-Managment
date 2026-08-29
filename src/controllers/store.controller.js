'use strict';

function createStoreController({ storeService, hasPermission }) {
    const options = (request) => ({ actorUserId: request.auth?.id, request });
    const financialView = (request) => Boolean(hasPermission(request.auth, 'store.profit.view'));
    const redactProfitData = (payload, canViewProfit) => {
        if (!canViewProfit && payload?.summary) delete payload.summary.storeExpenses;
        return payload;
    };
    return {
        bootstrap: async (request, response) => {
            const includeCost = Boolean(hasPermission(request.auth, 'store.profit.view'));
            const [categories, products, suppliers] = await Promise.all([
                storeService.listCategories(),
                storeService.listProducts({ page: 1, pageSize: 100, includeCost }),
                storeService.listSuppliers()
            ]);
            response.json({ categories, products, suppliers, canViewProfit: includeCost });
        },
        dashboard: async (request, response) => {
            const canViewProfit = financialView(request);
            response.json(redactProfitData(await storeService.getDashboard({ ...request.query, includeProfit: canViewProfit, readOnly: request.readOnlyBaseline }), canViewProfit));
        },
        reports: async (request, response) => {
            const canViewProfit = financialView(request);
            response.json(redactProfitData(await storeService.getReports({ ...request.query, includeProfit: canViewProfit, readOnly: request.readOnlyBaseline }), canViewProfit));
        },
        categories: async (request, response) => response.json(await storeService.listCategories({ includeInactive: request.query.includeInactive === 'true' })),
        createCategory: async (request, response) => response.status(201).json({ category: await storeService.createCategory(request.body, options(request)) }),
        updateCategory: async (request, response) => response.json({ category: await storeService.updateCategory(request.params.id, request.body, options(request)) }),
        products: async (request, response) => response.json(await storeService.listProducts({ ...request.query, includeCost: Boolean(hasPermission(request.auth, 'store.profit.view')) })),
        product: async (request, response) => response.json({ product: await storeService.getProduct(request.params.id, { includeCost: Boolean(hasPermission(request.auth, 'store.profit.view')) }) }),
        createProduct: async (request, response) => response.status(201).json({ product: await storeService.createProduct(request.body, options(request)) }),
        updateProduct: async (request, response) => response.json({ product: await storeService.updateProduct(request.params.id, request.body, options(request)) }),
        deleteProduct: async (request, response) => response.json({ product: await storeService.setProductStatus(request.params.id, false, options(request)) }),
        createVariant: async (request, response) => response.status(201).json(await storeService.createVariant(request.params.productId, request.body, options(request))),
        updateVariant: async (request, response) => response.json({ product: await storeService.updateVariant(request.params.productId, request.params.variantId, request.body, options(request)) }),
        deleteVariant: async (request, response) => response.json({ product: await storeService.deactivateVariant(request.params.productId, request.params.variantId, options(request)) }),
        suppliers: async (request, response) => response.json(await storeService.listSuppliers({ search: request.query.search, includeInactive: request.query.includeInactive === 'true' })),
        createSupplier: async (request, response) => response.status(201).json({ supplier: await storeService.createSupplier(request.body, options(request)) }),
        updateSupplier: async (request, response) => response.json({ supplier: await storeService.updateSupplier(request.params.id, request.body, options(request)) }),
        inventory: async (request, response) => {
            const items = await storeService.listInventory(request.query);
            const canViewProfit = financialView(request);
            response.json({ items: canViewProfit ? items : items.map(({ purchaseCost, averageCost, ...safe }) => safe) });
        },
        stockMovements: async (request, response) => {
            const data = await storeService.listStockMovements(request.query);
            if (!financialView(request)) data.items = data.items.map(({ unitCost, ...safe }) => safe);
            response.json(data);
        },
        adjustInventory: async (request, response) => response.status(201).json({ adjustment: await storeService.adjustInventory(request.body, options(request)) }),
        customers: async (request, response) => response.json({ customers: await storeService.searchCustomers(request.query.search) }),
        purchases: async (request, response) => response.json(await storeService.listPurchases(request.query)),
        purchase: async (request, response) => response.json({ purchase: await storeService.getPurchase(request.params.id) }),
        createPurchase: async (request, response) => response.status(201).json({ purchase: await storeService.createPurchase(request.body, options(request)) }),
        sales: async (request, response) => response.json(await storeService.listSales(request.query)),
        sale: async (request, response) => response.json({ sale: await storeService.getSale(request.params.id) }),
        createSale: async (request, response) => response.status(201).json({ sale: await storeService.createSale(request.body, options(request)) }),
        createReturn: async (request, response) => response.status(201).json({ return: await storeService.createReturn(request.params.id, request.body, options(request)) }),
        expenses: async (request, response) => response.json({ expenses: await storeService.listStoreExpenses(request.query) }),
        createExpense: async (request, response) => response.status(201).json({ expense: await storeService.createStoreExpense(request.body, options(request)) }),
        updateExpense: async (request, response) => response.json({ expense: await storeService.updateStoreExpense(request.params.id, request.body, options(request)) }),
        deleteExpense: async (request, response) => { await storeService.deleteStoreExpense(request.params.id, options(request)); response.status(204).send(); },
        memberPurchases: async (request, response) => response.json({ purchases: await storeService.getMemberPurchases(request.params.id, request.query) })
    };
}

module.exports = { createStoreController };
