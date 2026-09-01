'use strict';

const { TENANT_TYPES, TENANT_TYPE_VALUES, resolveTenantType } = require('../tenancy/tenant-types');

const PLAN_COMPATIBILITY_TABLE = 'saas_plan_tenant_types';

function compatibilityError(message, code = 'PLAN_COMPATIBILITY_INVALID', statusCode = 409) {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.expose = true;
    error.code = code;
    return error;
}

function normalizeCompatibleTenantTypes(value, { fallback = [TENANT_TYPES.GYM] } = {}) {
    const source = value === undefined || value === null ? fallback : value;
    const values = Array.isArray(source)
        ? source
        : typeof source === 'string'
            ? source.split(',')
            : [];
    const normalized = [];
    for (const item of values) {
        let type;
        try {
            type = resolveTenantType(item);
        } catch (_) {
            throw compatibilityError('Plan compatibility contains an unsupported tenant type.', 'PLAN_COMPATIBILITY_INVALID', 400);
        }
        if (!normalized.includes(type)) normalized.push(type);
    }
    if (!normalized.length) throw compatibilityError('A plan must support at least one tenant type.', 'PLAN_COMPATIBILITY_REQUIRED', 400);
    return TENANT_TYPE_VALUES.filter((type) => normalized.includes(type));
}

function planSupportsTenantType(plan, tenantType) {
    const normalizedType = resolveTenantType(tenantType);
    const compatible = Array.isArray(plan?.compatibleTenantTypes) ? plan.compatibleTenantTypes : [];
    return compatible.includes(normalizedType);
}

function assertPlanSupportsTenantType(plan, tenantType) {
    const normalizedType = resolveTenantType(tenantType);
    if (!planSupportsTenantType(plan, normalizedType)) {
        throw compatibilityError('The selected plan is not compatible with this tenant type.', 'SAAS_PLAN_TENANT_TYPE_MISMATCH');
    }
    return normalizedType;
}

module.exports = {
    PLAN_COMPATIBILITY_TABLE,
    TENANT_TYPES,
    compatibilityError,
    normalizeCompatibleTenantTypes,
    planSupportsTenantType,
    assertPlanSupportsTenantType
};
