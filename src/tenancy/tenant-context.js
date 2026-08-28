'use strict';

const { AsyncLocalStorage } = require('node:async_hooks');

const storage = new AsyncLocalStorage();
const MODES = new Set(['tenant', 'public', 'platform', 'deny']);

function normalizeTenantId(value) {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}

function normalizeContext(input = {}) {
    const mode = MODES.has(String(input.mode || 'deny')) ? String(input.mode || 'deny') : 'deny';
    return Object.freeze({
        tenantId: normalizeTenantId(input.tenantId),
        userId: normalizeTenantId(input.userId),
        mode,
        skipSessionContext: Boolean(input.skipSessionContext),
        readOnlyBaseline: Boolean(input.readOnlyBaseline)
    });
}

function runTenantContext(context, callback) {
    return storage.run(normalizeContext(context), callback);
}

function getTenantContext() {
    return storage.getStore() || null;
}

function currentTenantId({ required = false } = {}) {
    const tenantId = normalizeTenantId(getTenantContext()?.tenantId);
    if (required && !tenantId) {
        const error = new Error('Tenant context is required for this operation.');
        error.statusCode = 500;
        error.code = 'TENANT_CONTEXT_REQUIRED';
        throw error;
    }
    return tenantId;
}

module.exports = {
    currentTenantId,
    getTenantContext,
    normalizeTenantId,
    runTenantContext
};
