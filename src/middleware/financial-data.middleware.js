'use strict';

const { hasPermission } = require('../permissions/permissions');

const FINANCIAL_KEYS = new Set([
    'amount', 'amountdue', 'amountpaid', 'amountremaining', 'listprice', 'discountamount',
    'balance', 'totalpaid', 'totaldue', 'totalremaining', 'collected', 'expenses', 'net',
    'revenue', 'income', 'payment', 'payments', 'paymenttransactions', 'financial', 'finance',
    'expense', 'price', 'prices', 'pricing', 'paymentmethod', 'paid', 'paidat', 'outstanding',
    'receipt', 'receipts', 'cost', 'gross', 'transactiontype', 'amounts', 'cashflow'
]);

function isFinancialKey(key) {
    return FINANCIAL_KEYS.has(String(key).replaceAll('_', '').toLowerCase());
}

function stripFinancialData(value, seen = new WeakSet()) {
    if (Array.isArray(value)) return value.map((item) => stripFinancialData(item, seen));
    if (!value || typeof value !== 'object') return value;
    if (seen.has(value)) return null;
    seen.add(value);
    const output = {};
    Object.entries(value).forEach(([key, item]) => {
        if (isFinancialKey(key)) return;
        output[key] = stripFinancialData(item, seen);
    });
    return output;
}

function protectFinancialResponse(request, response) {
    // Pricing catalogs are configuration data governed by pricing.read. They
    // are needed to build membership forms even when financial reporting is
    // intentionally disabled, so they are not treated as financial records.
    const path = String(request.path || '');
    const isPricingConfiguration = path === '/pricing'
        || path.startsWith('/pricing/')
        || path === '/day-passes/pricing';
    if (!request.auth || hasPermission(request.auth, 'finance.read') || isPricingConfiguration) return;
    const originalJson = response.json.bind(response);
    response.json = (body) => originalJson(stripFinancialData(body));
}

module.exports = { FINANCIAL_KEYS, protectFinancialResponse, stripFinancialData };
