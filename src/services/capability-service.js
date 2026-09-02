'use strict';

const { TENANT_TYPES, TENANT_TYPE_VALUES, resolveTenantType } = require('../tenancy/tenant-types');

// A tenant type may be represented by the domain model before its product
// surface is enabled. This keeps future Trainer tenants explicit without
// accidentally exposing unfinished routes.
const ENABLED_TENANT_TYPES = Object.freeze(new Set(TENANT_TYPE_VALUES));

// These are capability keys, not permissions. A capability answers whether a
// tenant's product/plan may expose a domain; role permissions still decide
// whether a specific user may perform an action inside that domain.
const GYM_CAPABILITIES = Object.freeze([
    'dashboard',
    'members',
    'attendance',
    'coaching',
    'nutrition',
    'ai',
    'library',
    'pricing',
    'payments',
    'finance',
    'day_passes',
    'reports',
    'store',
    'inventory',
    'branches',
    'bar',
    'portal',
    'branding',
    'backup',
    'audit'
]);

const INDEPENDENT_TRAINER_BASELINE_CAPABILITIES = Object.freeze([
    'clients',
    'coaching',
    'nutrition',
    'assessments',
    'progress',
    'sessions',
    'packages',
    'payments',
    'reports',
    'portal',
    'ai',
    'branding',
    'library'
]);

const TENANT_TYPE_BASELINE_CAPABILITIES = Object.freeze({
    [TENANT_TYPES.GYM]: GYM_CAPABILITIES,
    [TENANT_TYPES.INDEPENDENT_TRAINER]: INDEPENDENT_TRAINER_BASELINE_CAPABILITIES
});

// Only server modules that have shipped through the current Trainer phases
// are exposed. Baseline domains that are not implemented remain fail-closed.
const IMPLEMENTED_CAPABILITIES_BY_TENANT_TYPE = Object.freeze({
    [TENANT_TYPES.GYM]: GYM_CAPABILITIES,
    // Trainer operations are enabled only as each server-side module ships.
    // The shared client portal is now adapted in Phase 6; its public portal
    // middleware still performs the independent tenant/member lookup.
    [TENANT_TYPES.INDEPENDENT_TRAINER]: Object.freeze([
        'clients', 'coaching', 'nutrition', 'assessments', 'progress',
        'ai', 'library', 'branding', 'sessions', 'packages', 'payments', 'portal', 'reports'
    ])
});

const LIMIT_KEYS = Object.freeze([
    'maxMembers',
    'maxUsers',
    'maxAiGenerations',
    'maxStorageMb',
    'maxBranches',
    // Reserved extension point. No database column or Trainer workflow is
    // introduced in this phase; the resolver accepts it when a later plan
    // model supplies the value.
    'maxClients'
]);

const PLAN_FEATURE_KEYS = Object.freeze(['intelligence', 'coaching', 'store', 'reports', 'portal', 'prioritySupport']);

const FEATURE_TO_CAPABILITY = Object.freeze({
    coaching: 'coaching',
    intelligence: 'ai',
    store: 'store',
    reports: 'reports',
    portal: 'portal'
});

const PATH_CAPABILITIES = Object.freeze([
    [/^\/(?:dashboard(?:-analytics)?|bootstrap)(?:\/|$)/, 'dashboard'],
    [/^\/day-passes(?:\/|$)/, 'day_passes'],
    [/^\/monthly-finance(?:\/|$)/, 'finance'],
    [/^\/trainer\/clients(?:\/|$)/, 'clients'],
    [/^\/trainer\/assessments(?:\/|$)/, 'assessments'],
    [/^\/trainer\/progress(?:\/|$)/, 'progress'],
    [/^\/trainer\/training-plans(?:\/|$)/, 'coaching'],
    [/^\/trainer\/nutrition-plans(?:\/|$)/, 'nutrition'],
    [/^\/trainer\/sessions(?:\/|$)/, 'sessions'],
    [/^\/trainer\/packages(?:\/|$)/, 'packages'],
    [/^\/trainer\/payments(?:\/|$)/, 'payments'],
    [/^\/trainer\/portal(?:\/|$)/, 'portal'],
    [/^\/trainer\/workspace(?:\/|$)/, 'clients'],
    [/^\/trainer\/follow-up(?:\/|$)/, 'clients'],
    [/^\/trainer\/reports(?:\/|$)/, 'reports'],
    [/^\/members(?:\/|$)/, 'members'],
    [/^\/attendance(?:\/|$)/, 'attendance'],
    [/^\/(?:pricing|membership)/, 'pricing'],
    [/^\/(?:finance|expenses)/, 'finance'],
    [/^\/reports(?:\/|$)/, 'reports'],
    [/^\/library(?:\/|$)/, 'library'],
    [/^\/backup(?:\/|$)/, 'backup'],
    [/^\/branding(?:\/|$)/, 'branding'],
    [/^\/intelligence(?:\/|$)/, 'intelligence'],
    [/^\/store(?:\/|$)/, 'store'],
    [/^\/(?:coaching|workout|diet|meal-logs|external-trainees|clients)(?:\/|$)/, 'coaching'],
    [/^\/member-portal(?:\/|$)/, 'portal']
]);

function capabilityError(message, statusCode = 503, code = 'CAPABILITY_MODEL_NOT_READY') {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.expose = true;
    error.code = code;
    return error;
}

function normalizeTenantType(value = TENANT_TYPES.GYM) {
    return resolveTenantType(value);
}

function isObject(value) {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizeFeatureFlags(value, label = 'plan features') {
    if (value == null) return {};
    if (!isObject(value)) throw capabilityError(`${label} must be an object.`, 503, 'CAPABILITY_MODEL_NOT_READY');
    const normalized = {};
    for (const [key, raw] of Object.entries(value)) {
        if (!PLAN_FEATURE_KEYS.includes(key)) {
            throw capabilityError(`${label} contains an unsupported feature.`, 503, 'CAPABILITY_MODEL_NOT_READY');
        }
        if (![true, false, 1, 0, 'true', 'false', '1', '0'].includes(raw)) {
            throw capabilityError(`${label} contains an invalid feature value.`, 503, 'CAPABILITY_MODEL_NOT_READY');
        }
        normalized[key] = raw === true || raw === 1 || raw === '1' || String(raw).toLowerCase() === 'true';
    }
    return normalized;
}

function normalizeLimitValue(value, key) {
    if (value === undefined || value === null || value === '') return null;
    const number = Number(value);
    if (!Number.isInteger(number) || number <= 0) {
        throw capabilityError(`Invalid value for ${key}.`, 503, 'LIMIT_MODEL_NOT_READY');
    }
    return number;
}

function resolveEffectiveLimits({ tenantType = TENANT_TYPES.GYM, planLimits = null, overrideLimits = null, subscriptionStatus = null, requirePlan = false } = {}) {
    const normalizedTenantType = normalizeTenantType(tenantType);
    if (requirePlan && !isObject(planLimits)) {
        throw capabilityError('Plan limits are not available.', 503, 'PLAN_LIMITS_NOT_READY');
    }
    const plan = isObject(planLimits) ? planLimits : {};
    const overrides = isObject(overrideLimits) ? overrideLimits : {};
    const limits = {};
    for (const key of LIMIT_KEYS) {
        const planValue = key === 'maxClients'
            ? (plan.maxClients ?? (normalizedTenantType === TENANT_TYPES.INDEPENDENT_TRAINER ? plan.maxMembers : null))
            : plan[key];
        const overrideValue = key === 'maxClients'
            ? (overrides.maxClients ?? (normalizedTenantType === TENANT_TYPES.INDEPENDENT_TRAINER ? overrides.maxMembers : null))
            : overrides[key];
        const hasOverride = overrideValue != null;
        const hasPlan = planValue != null;
        if (hasOverride || hasPlan || key !== 'maxClients') {
            limits[key] = normalizeLimitValue(hasOverride ? overrideValue : planValue, key);
        }
    }
    // Keep this object backward-compatible with the existing Gym consumers:
    // it contains limit keys only. Resolution metadata belongs to the
    // entitlement envelope, not inside the limits map consumed by guards/UI.
    return limits;
}

function requiredFeature(path = '') {
    const value = String(path || '');
    // Trainer reports use the same commercial feature entitlement as the
    // existing reports surface without changing the legacy path contract.
    if (value.startsWith('/trainer/reports')) return 'reports';
    if (value.startsWith('/intelligence')) return 'intelligence';
    if (value.startsWith('/store')) return 'store';
    if (value.startsWith('/bar')) return 'bar';
    if (value.startsWith('/branches') || value.startsWith('/commerce/stock')) return 'branches';
    if (value.startsWith('/coaching') || value.startsWith('/workout') || value.startsWith('/diet')
        || value.startsWith('/meal-logs') || value.startsWith('/external-trainees') || value.startsWith('/clients')) return 'coaching';
    if (value.startsWith('/member-portal')) return 'portal';
    return null;
}

function requiredCapability(path = '') {
    const feature = requiredFeature(path);
    return feature ? FEATURE_TO_CAPABILITY[feature] : (PATH_CAPABILITIES.find(([pattern]) => pattern.test(String(path || '')))?.[1] || null);
}

function resolveEffectiveCapabilities({ tenantType = TENANT_TYPES.GYM, features = {}, overrides = null, planCompatible = true, subscriptionStatus = null } = {}) {
    const normalizedTenantType = normalizeTenantType(tenantType);
    if (planCompatible !== true) {
        throw capabilityError('The active plan is not compatible with this tenant type.', 503, 'SAAS_PLAN_TENANT_TYPE_MISMATCH');
    }
    const effectiveFeatures = { ...normalizeFeatureFlags(features), ...normalizeFeatureFlags(overrides?.features, 'tenant overrides') };
    const baselineCapabilities = TENANT_TYPE_BASELINE_CAPABILITIES[normalizedTenantType] || [];
    const implementedCapabilities = IMPLEMENTED_CAPABILITIES_BY_TENANT_TYPE[normalizedTenantType] || [];
    const operational = subscriptionStatus == null || ['trial', 'active'].includes(String(subscriptionStatus).toLowerCase());
    const capabilities = Object.fromEntries(implementedCapabilities.map((capability) => {
        const feature = Object.entries(FEATURE_TO_CAPABILITY).find(([, value]) => value === capability)?.[0];
        return [capability, operational && (!feature || effectiveFeatures[feature] !== false)];
    }));
    return {
        tenantType: normalizedTenantType,
        baselineCapabilities: [...baselineCapabilities],
        unsupportedCapabilities: baselineCapabilities.filter((capability) => !implementedCapabilities.includes(capability)),
        capabilities,
        featureEntitlements: effectiveFeatures,
        subscriptionActive: operational,
        source: 'tenant-type+plan+overrides'
    };
}

function assertCapabilityAccess({ tenantType = TENANT_TYPES.GYM, path = '', features = {}, overrides = null, planCode = null, planCompatible = true, subscriptionStatus = null } = {}) {
    const resolved = resolveEffectiveCapabilities({ tenantType, features, overrides, planCompatible, subscriptionStatus });
    if (subscriptionStatus != null && !resolved.subscriptionActive) {
        throw capabilityError('The subscription is not active.', 402, 'SAAS_SUBSCRIPTION_REQUIRED');
    }
    const feature = requiredFeature(path);
    const capability = requiredCapability(path);
    if (feature && resolved.featureEntitlements[feature] === false) {
        throw capabilityError('هذه الميزة غير متاحة في الباقة الحالية.', 403, 'SAAS_FEATURE_NOT_INCLUDED');
    }
    if (capability && resolved.capabilities[capability] !== true) {
        throw capabilityError('This capability is not enabled for this tenant type.', 503, 'CAPABILITY_NOT_ENABLED');
    }
    return { capability, feature, planCode: planCode || null, ...resolved };
}

module.exports = {
    ENABLED_TENANT_TYPES,
    FEATURE_TO_CAPABILITY,
    GYM_CAPABILITIES,
    IMPLEMENTED_CAPABILITIES_BY_TENANT_TYPE,
    INDEPENDENT_TRAINER_BASELINE_CAPABILITIES,
    LIMIT_KEYS,
    PLAN_FEATURE_KEYS,
    TENANT_TYPE_BASELINE_CAPABILITIES,
    TENANT_TYPES,
    assertCapabilityAccess,
    capabilityError,
    normalizeTenantType,
    normalizeFeatureFlags,
    normalizeLimitValue,
    requiredCapability,
    requiredFeature,
    resolveEffectiveLimits,
    resolveEffectiveCapabilities
};
