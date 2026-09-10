'use strict';

const { TENANT_TYPES } = require('../tenancy/tenant-types');

// The catalog is intentionally derived from shipped product surfaces. A
// catalog entry is the commercial contract for a capability; route
// permissions still decide which user may perform an action inside it.
const FEATURE_CATALOG = Object.freeze([
    { key: 'dashboard', description: 'Gym operations dashboard', tenantTypes: [TENANT_TYPES.GYM], limitKeys: [], screens: ['dashboard', 'analytics'], apiPaths: ['/dashboard', '/bootstrap'] },
    { key: 'members', description: 'Gym member directory and profiles', tenantTypes: [TENANT_TYPES.GYM], limitKeys: ['maxMembers'], screens: ['members', 'member-profile'], apiPaths: ['/members', '/memberships'] },
    { key: 'attendance', description: 'Gym attendance and check-in', tenantTypes: [TENANT_TYPES.GYM], limitKeys: [], screens: ['attendance'], apiPaths: ['/attendance'] },
    { key: 'coaching', description: 'Training and coaching plans', tenantTypes: [TENANT_TYPES.GYM, TENANT_TYPES.INDEPENDENT_TRAINER], limitKeys: [], screens: ['training-plans', 'coaching'], apiPaths: ['/coaching', '/workout', '/trainer/training-plans'] },
    { key: 'nutrition', description: 'Nutrition plans and meal tracking', tenantTypes: [TENANT_TYPES.GYM, TENANT_TYPES.INDEPENDENT_TRAINER], limitKeys: [], screens: ['nutrition', 'meal-logs'], apiPaths: ['/diet', '/diet-plans', '/trainer/nutrition-plans'] },
    { key: 'ai', description: 'AI-assisted operational and plan generation', tenantTypes: [TENANT_TYPES.GYM, TENANT_TYPES.INDEPENDENT_TRAINER], limitKeys: ['maxAiGenerations'], screens: ['intelligence', 'trainer-intelligence'], apiPaths: ['/intelligence', '/trainer/intelligence'] },
    { key: 'library', description: 'Exercise, muscle and nutrition library', tenantTypes: [TENANT_TYPES.GYM, TENANT_TYPES.INDEPENDENT_TRAINER], limitKeys: [], screens: ['library'], apiPaths: ['/library', '/trainer/library'] },
    { key: 'pricing', description: 'Gym membership pricing catalog', tenantTypes: [TENANT_TYPES.GYM], limitKeys: [], screens: ['pricing'], apiPaths: ['/pricing', '/membership'] },
    { key: 'payments', description: 'Payment collection and payment ledger', tenantTypes: [TENANT_TYPES.GYM, TENANT_TYPES.INDEPENDENT_TRAINER], limitKeys: [], screens: ['payments', 'finance'], apiPaths: ['/payments', '/finance', '/trainer/payments'] },
    { key: 'finance', description: 'Gym financial reporting and expenses', tenantTypes: [TENANT_TYPES.GYM], limitKeys: [], screens: ['finance', 'expenses'], apiPaths: ['/finance', '/monthly-finance'] },
    { key: 'day_passes', description: 'Gym day-pass operations', tenantTypes: [TENANT_TYPES.GYM], limitKeys: [], screens: ['day-passes'], apiPaths: ['/day-passes'] },
    { key: 'reports', description: 'Operational and business reports', tenantTypes: [TENANT_TYPES.GYM, TENANT_TYPES.INDEPENDENT_TRAINER], limitKeys: [], screens: ['reports', 'trainer-reports'], apiPaths: ['/reports', '/trainer/reports'] },
    { key: 'store', description: 'Gym store and point of sale', tenantTypes: [TENANT_TYPES.GYM], limitKeys: [], screens: ['store', 'pos'], apiPaths: ['/store', '/pos'] },
    { key: 'inventory', description: 'Gym inventory and stock control', tenantTypes: [TENANT_TYPES.GYM], limitKeys: [], screens: ['inventory'], apiPaths: ['/inventory', '/commerce/stock'] },
    { key: 'branches', description: 'Gym branches and branch operations', tenantTypes: [TENANT_TYPES.GYM], limitKeys: ['maxBranches'], screens: ['branches'], apiPaths: ['/branches', '/commerce/stock'] },
    { key: 'bar', description: 'Gym bar and recipe operations', tenantTypes: [TENANT_TYPES.GYM], limitKeys: [], screens: ['bar', 'recipes'], apiPaths: ['/bar'] },
    { key: 'portal', description: 'Member or trainer client portal', tenantTypes: [TENANT_TYPES.GYM, TENANT_TYPES.INDEPENDENT_TRAINER], limitKeys: [], screens: ['member-portal', 'trainer-client-portal'], apiPaths: ['/member-portal', '/trainer/portal'] },
    { key: 'branding', description: 'Tenant branding and identity settings', tenantTypes: [TENANT_TYPES.GYM, TENANT_TYPES.INDEPENDENT_TRAINER], limitKeys: ['maxStorageMb'], screens: ['branding', 'settings'], apiPaths: ['/branding'] },
    { key: 'team', description: 'Tenant team accounts and permission administration', tenantTypes: [TENANT_TYPES.GYM, TENANT_TYPES.INDEPENDENT_TRAINER], limitKeys: ['maxUsers'], screens: ['accounts', 'permissions'], apiPaths: ['/auth/users', '/auth/permissions'] },
    { key: 'backup', description: 'Tenant backup and recovery operations', tenantTypes: [TENANT_TYPES.GYM], limitKeys: ['maxStorageMb'], screens: ['backup'], apiPaths: ['/backup'] },
    { key: 'audit', description: 'Tenant audit and activity history', tenantTypes: [TENANT_TYPES.GYM], limitKeys: [], screens: ['audit'], apiPaths: ['/audit'] },
    { key: 'clients', description: 'Independent trainer client management', tenantTypes: [TENANT_TYPES.INDEPENDENT_TRAINER], limitKeys: ['maxClients'], screens: ['trainer-dashboard', 'trainer-clients', 'trainer-client-profile', 'trainer-follow-up'], apiPaths: ['/trainer/workspace', '/trainer/clients', '/trainer/follow-up'] },
    { key: 'assessments', description: 'Trainer assessments and measurements', tenantTypes: [TENANT_TYPES.INDEPENDENT_TRAINER], limitKeys: [], screens: ['trainer-assessments', 'trainer-measurements'], apiPaths: ['/trainer/assessments'] },
    { key: 'progress', description: 'Trainer client progress tracking', tenantTypes: [TENANT_TYPES.INDEPENDENT_TRAINER], limitKeys: [], screens: ['trainer-progress'], apiPaths: ['/trainer/progress'] },
    { key: 'goals', description: 'Trainer client goals', tenantTypes: [TENANT_TYPES.INDEPENDENT_TRAINER], limitKeys: [], screens: ['trainer-goals'], apiPaths: ['/trainer/goals'] },
    { key: 'sessions', description: 'Trainer sessions and scheduling', tenantTypes: [TENANT_TYPES.INDEPENDENT_TRAINER], limitKeys: [], screens: ['trainer-sessions', 'trainer-calendar'], apiPaths: ['/trainer/sessions'] },
    { key: 'packages', description: 'Trainer packages and session balances', tenantTypes: [TENANT_TYPES.INDEPENDENT_TRAINER], limitKeys: [], screens: ['trainer-packages'], apiPaths: ['/trainer/packages'] },
    { key: 'notifications', description: 'Role- and tenant-scoped notifications', tenantTypes: [TENANT_TYPES.GYM, TENANT_TYPES.INDEPENDENT_TRAINER], limitKeys: [], screens: ['notifications', 'trainer-notifications'], apiPaths: ['/notifications', '/trainer/notifications'] },
    { key: 'tasks', description: 'Trainer action center and tasks', tenantTypes: [TENANT_TYPES.INDEPENDENT_TRAINER], limitKeys: [], screens: ['trainer-tasks'], apiPaths: ['/trainer/tasks'] },
    { key: 'templates', description: 'Trainer training and nutrition templates', tenantTypes: [TENANT_TYPES.INDEPENDENT_TRAINER], limitKeys: [], screens: ['trainer-templates'], apiPaths: ['/trainer/templates'] },
    { key: 'prioritySupport', description: 'Priority platform support', tenantTypes: [TENANT_TYPES.GYM, TENANT_TYPES.INDEPENDENT_TRAINER], limitKeys: [], screens: [], apiPaths: [] }
]);

const FEATURE_BY_KEY = new Map(FEATURE_CATALOG.map((feature) => [feature.key, feature]));
const FEATURE_KEYS = Object.freeze(FEATURE_CATALOG.map((feature) => feature.key));
const LEGACY_FEATURE_ALIASES = Object.freeze({
    intelligence: 'ai',
    coaching: 'coaching',
    store: 'store',
    reports: 'reports',
    portal: 'portal',
    prioritySupport: 'prioritySupport'
});

function getFeatureCatalog({ tenantType = null } = {}) {
    if (!tenantType) return FEATURE_CATALOG.map((feature) => ({ ...feature, tenantTypes: [...feature.tenantTypes], limitKeys: [...feature.limitKeys], screens: [...feature.screens], apiPaths: [...feature.apiPaths] }));
    return FEATURE_CATALOG.filter((feature) => feature.tenantTypes.includes(tenantType)).map((feature) => ({ ...feature, tenantTypes: [...feature.tenantTypes], limitKeys: [...feature.limitKeys], screens: [...feature.screens], apiPaths: [...feature.apiPaths] }));
}

function hasFeature(featureKey) {
    return FEATURE_BY_KEY.has(normalizeFeatureKey(featureKey));
}

function normalizeFeatureKey(featureKey) {
    const key = String(featureKey || '').trim();
    return LEGACY_FEATURE_ALIASES[key] || key;
}

module.exports = {
    FEATURE_CATALOG,
    FEATURE_KEYS,
    FEATURE_BY_KEY,
    LEGACY_FEATURE_ALIASES,
    getFeatureCatalog,
    hasFeature,
    normalizeFeatureKey
};
