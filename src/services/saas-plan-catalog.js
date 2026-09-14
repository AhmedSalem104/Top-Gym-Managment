'use strict';

// Commercial configuration is kept separate from entitlement evaluation. The
// capability service decides access from persisted feature/limit snapshots;
// this module only supplies the approved initial catalog for the release.
const { TENANT_TYPES } = require('../tenancy/tenant-types');

const BILLING_TERM_CODES = Object.freeze(['monthly', 'quarterly', 'semiannual', 'annual']);
const BILLING_TERM_MONTHS = Object.freeze({ monthly: 1, quarterly: 3, semiannual: 6, annual: 12 });

const SHARED_FEATURES = Object.freeze([
    'coaching', 'nutrition', 'library', 'payments', 'reports', 'portal',
    'branding', 'team', 'notifications'
]);
const GYM_FEATURES = Object.freeze([
    'dashboard', 'members', 'attendance', 'pricing', 'finance', 'day_passes',
    'branches', 'store', 'inventory', 'bar', 'backup', 'audit'
]);
const TRAINER_FEATURES = Object.freeze([
    'clients', 'assessments', 'progress', 'goals', 'sessions', 'packages',
    'tasks', 'templates'
]);

const PLAN_CONFIGURATIONS = Object.freeze([
    Object.freeze({
        code: 'starter', name: 'Starter',
        description: 'بداية وتشغيل أساسي للجيم والمدرب المستقل.',
        compatibleTenantTypes: Object.freeze([TENANT_TYPES.GYM, TENANT_TYPES.INDEPENDENT_TRAINER]),
        terms: Object.freeze([
            Object.freeze({ code: 'monthly', durationMonths: 1, price: 299 }),
            Object.freeze({ code: 'quarterly', durationMonths: 3, price: 799 }),
            Object.freeze({ code: 'semiannual', durationMonths: 6, price: 1499 }),
            Object.freeze({ code: 'annual', durationMonths: 12, price: 2699 })
        ]),
        limits: Object.freeze({ maxMembers: 150, maxClients: 50, maxUsers: 2, maxBranches: 1, maxAiGenerations: 50, maxStorageMb: 1024 }),
        featureKeys: Object.freeze(['dashboard', 'members', 'attendance', 'pricing', ...SHARED_FEATURES, 'clients'])
    }),
    Object.freeze({
        code: 'basic', name: 'Basic',
        description: 'تشغيل كامل للمكان الصغير والمتوسط.',
        compatibleTenantTypes: Object.freeze([TENANT_TYPES.GYM, TENANT_TYPES.INDEPENDENT_TRAINER]),
        terms: Object.freeze([
            Object.freeze({ code: 'monthly', durationMonths: 1, price: 599 }),
            Object.freeze({ code: 'quarterly', durationMonths: 3, price: 1599 }),
            Object.freeze({ code: 'semiannual', durationMonths: 6, price: 2999 }),
            Object.freeze({ code: 'annual', durationMonths: 12, price: 5499 })
        ]),
        limits: Object.freeze({ maxMembers: 500, maxClients: 150, maxUsers: 5, maxBranches: 2, maxAiGenerations: 200, maxStorageMb: 5120 }),
        featureKeys: Object.freeze(['dashboard', 'members', 'attendance', 'pricing', ...SHARED_FEATURES, 'ai', 'finance', 'day_passes', 'branches', 'backup', ...TRAINER_FEATURES])
    }),
    Object.freeze({
        code: 'pro', name: 'Pro',
        description: 'تشغيل متقدم مع الذكاء الاصطناعي والتوسع.',
        compatibleTenantTypes: Object.freeze([TENANT_TYPES.GYM, TENANT_TYPES.INDEPENDENT_TRAINER]),
        terms: Object.freeze([
            Object.freeze({ code: 'monthly', durationMonths: 1, price: 999 }),
            Object.freeze({ code: 'quarterly', durationMonths: 3, price: 2699 }),
            Object.freeze({ code: 'semiannual', durationMonths: 6, price: 4999 }),
            Object.freeze({ code: 'annual', durationMonths: 12, price: 8999 })
        ]),
        limits: Object.freeze({ maxMembers: 1500, maxClients: 500, maxUsers: 15, maxBranches: 5, maxAiGenerations: 750, maxStorageMb: 20480 }),
        featureKeys: Object.freeze(['dashboard', 'members', 'attendance', 'pricing', ...SHARED_FEATURES, 'ai', 'finance', 'day_passes', 'branches', 'backup', ...TRAINER_FEATURES, 'store', 'inventory', 'bar', 'audit'])
    }),
    Object.freeze({
        code: 'business', name: 'Business',
        description: 'أعلى مستوى مع كل الإمكانيات والدعم ذي الأولوية.',
        compatibleTenantTypes: Object.freeze([TENANT_TYPES.GYM, TENANT_TYPES.INDEPENDENT_TRAINER]),
        terms: Object.freeze([
            Object.freeze({ code: 'monthly', durationMonths: 1, price: 1499 }),
            Object.freeze({ code: 'quarterly', durationMonths: 3, price: 3999 }),
            Object.freeze({ code: 'semiannual', durationMonths: 6, price: 7499 }),
            Object.freeze({ code: 'annual', durationMonths: 12, price: 13499 })
        ]),
        limits: Object.freeze({ maxMembers: null, maxClients: null, maxUsers: null, maxBranches: null, maxAiGenerations: 2000, maxStorageMb: 51200 }),
        featureKeys: Object.freeze(['dashboard', 'members', 'attendance', 'pricing', ...SHARED_FEATURES, 'ai', 'finance', 'day_passes', 'branches', 'backup', ...TRAINER_FEATURES, 'store', 'inventory', 'bar', 'audit', 'prioritySupport'])
    })
]);

const PLAN_CONFIGURATION_BY_CODE = Object.freeze(Object.fromEntries(PLAN_CONFIGURATIONS.map((plan) => [plan.code, plan])));

function normalizeTermCode(value, { fallback = 'monthly' } = {}) {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'yearly') return 'annual';
    return BILLING_TERM_CODES.includes(normalized) ? normalized : fallback;
}

function durationForTerm(value) {
    return BILLING_TERM_MONTHS[normalizeTermCode(value)] || 1;
}

function configurationForPlan(code) {
    return PLAN_CONFIGURATION_BY_CODE[String(code || '').trim().toLowerCase()] || null;
}

function termsForPlan(code) {
    const plan = configurationForPlan(code);
    return plan ? plan.terms.map((term) => ({ ...term, currency: 'EGP', isActive: true })) : [];
}

function featureFlagsForPlan(code) {
    const plan = configurationForPlan(code);
    const enabled = new Set(plan?.featureKeys || []);
    return Object.fromEntries(require('./feature-catalog').FEATURE_KEYS.map((key) => [key, enabled.has(key)]));
}

module.exports = {
    BILLING_TERM_CODES,
    BILLING_TERM_MONTHS,
    GYM_FEATURES,
    SHARED_FEATURES,
    TRAINER_FEATURES,
    PLAN_CONFIGURATIONS,
    PLAN_CONFIGURATION_BY_CODE,
    configurationForPlan,
    durationForTerm,
    featureFlagsForPlan,
    normalizeTermCode,
    termsForPlan
};
