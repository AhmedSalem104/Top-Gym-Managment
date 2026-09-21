const { test, expect } = require('@playwright/test');

const TERMS = [
    { code: 'monthly', durationMonths: 1, price: 299, currency: 'EGP', isActive: true },
    { code: 'quarterly', durationMonths: 3, price: 799, currency: 'EGP', isActive: true },
    { code: 'semiannual', durationMonths: 6, price: 1499, currency: 'EGP', isActive: true },
    { code: 'annual', durationMonths: 12, price: 2699, currency: 'EGP', isActive: true }
];

const FEATURE_CATALOG = [
    { key: 'dashboard', description: 'Dashboard', tenantTypes: ['gym'], limitKeys: [], screens: [], apiPaths: ['/dashboard'] },
    { key: 'members', description: 'Members', tenantTypes: ['gym'], limitKeys: ['maxMembers'], screens: [], apiPaths: ['/members'] },
    { key: 'attendance', description: 'Attendance', tenantTypes: ['gym'], limitKeys: [], screens: [], apiPaths: ['/attendance'] },
    { key: 'branches', description: 'Branches', tenantTypes: ['gym'], limitKeys: ['maxBranches'], screens: [], apiPaths: ['/branches'] },
    { key: 'clients', description: 'Clients', tenantTypes: ['independent_trainer'], limitKeys: ['maxClients'], screens: [], apiPaths: ['/trainer/clients'] },
    { key: 'assessments', description: 'Assessments', tenantTypes: ['independent_trainer'], limitKeys: [], screens: [], apiPaths: ['/trainer/assessments'] },
    { key: 'coaching', description: 'Coaching', tenantTypes: ['gym', 'independent_trainer'], limitKeys: [], screens: [], apiPaths: ['/coaching'] },
    { key: 'nutrition', description: 'Nutrition', tenantTypes: ['gym', 'independent_trainer'], limitKeys: [], screens: [], apiPaths: ['/nutrition'] },
    { key: 'payments', description: 'Payments', tenantTypes: ['gym', 'independent_trainer'], limitKeys: [], screens: [], apiPaths: ['/payments'] },
    { key: 'reports', description: 'Reports', tenantTypes: ['gym', 'independent_trainer'], limitKeys: [], screens: [], apiPaths: ['/reports'] },
    { key: 'portal', description: 'Portal', tenantTypes: ['gym', 'independent_trainer'], limitKeys: [], screens: [], apiPaths: ['/portal'] }
];

const PLAN_CONFIG = [
    { id: 11, code: 'starter', name: 'Starter', description: 'أساسيات التشغيل', maxMembers: 150, maxClients: 50, maxUsers: 2, maxBranches: 1, maxAiGenerations: 50, maxStorageMb: 1024, enabled: ['dashboard', 'members', 'attendance', 'coaching', 'nutrition', 'payments', 'reports', 'portal', 'clients', 'branches'] },
    { id: 12, code: 'basic', name: 'Basic', description: 'تشغيل كامل', maxMembers: 500, maxClients: 150, maxUsers: 5, maxBranches: 2, maxAiGenerations: 200, maxStorageMb: 5120, enabled: ['dashboard', 'members', 'attendance', 'clients', 'assessments', 'coaching', 'nutrition', 'payments', 'reports', 'portal', 'branches'] },
    { id: 13, code: 'pro', name: 'Pro', description: 'تشغيل متقدم', maxMembers: 1500, maxClients: 500, maxUsers: 15, maxBranches: 5, maxAiGenerations: 750, maxStorageMb: 20480, enabled: ['dashboard', 'members', 'attendance', 'clients', 'assessments', 'coaching', 'nutrition', 'payments', 'reports', 'portal', 'branches'] },
    { id: 14, code: 'business', name: 'Business', description: 'كل الإمكانيات', maxMembers: null, maxClients: null, maxUsers: null, maxBranches: null, maxAiGenerations: 2000, maxStorageMb: 51200, enabled: ['dashboard', 'members', 'attendance', 'clients', 'assessments', 'coaching', 'nutrition', 'payments', 'reports', 'portal', 'branches'] }
].map((plan) => ({
    ...plan,
    isActive: true,
    availableForNewSubscriptions: true,
    compatibleTenantTypes: ['gym', 'independent_trainer'],
    currency: 'EGP',
    price: plan.code === 'starter' ? 299 : plan.code === 'basic' ? 599 : plan.code === 'pro' ? 999 : 1499,
    billingPeriod: 'monthly',
    terms: TERMS.map((term, index) => ({ ...term, price: [
        [299, 799, 1499, 2699],
        [599, 1599, 2999, 5499],
        [999, 2699, 4999, 8999],
        [1499, 3999, 7499, 13499]
    ][['starter', 'basic', 'pro', 'business'].indexOf(plan.code)][index] })),
    features: Object.fromEntries(FEATURE_CATALOG.map((feature) => [feature.key, plan.enabled.includes(feature.key)]))
}));

function withCatalogFeatures(plan) {
    return { ...plan, features: { ...plan.features } };
}

function json(route, payload, status = 200) {
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) });
}

function billingFor(tenantType, planCode = 'basic') {
    const plan = withCatalogFeatures(PLAN_CONFIG.find((item) => item.code === planCode));
    const visibleCatalog = FEATURE_CATALOG.filter((feature) => feature.tenantTypes.includes(tenantType));
    return {
        tenant: { id: 101, name: tenantType === 'gym' ? 'QA Gym' : 'QA Trainer', slug: 'qa-' + tenantType, tenantType, status: 'active' },
        subscription: {
            id: 301, status: 'active', startsAt: '2026-09-01T00:00:00.000Z', expiresAt: '2027-09-01T00:00:00.000Z',
            termCodeSnapshot: 'monthly', durationMonthsSnapshot: 1, priceSnapshot: plan.terms[0].price,
            plan
        },
        plans: PLAN_CONFIG.map(withCatalogFeatures),
        featureCatalog: visibleCatalog,
        usage: { members: 10, clients: 4, users: 1, branches: 1, aiGenerations: 0, storageBytes: 0 },
        requests: [], requestsPagination: { page: 1, pages: 1, total: 0 }
    };
}

async function installTenantApi(page, tenantType) {
    const calls = [];
    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;
        calls.push(pathname);
        if (pathname === '/api/auth/session') return json(route, { authenticated: true, user: { id: 9, name: 'QA Owner', role: 'Owner', tenantType, permissions: [] } });
        if (pathname === '/api/branding') return json(route, { identity: { brandName: 'Logic Fit' } });
        if (pathname === '/api/bootstrap') return json(route, { branches: [], sections: [], defaultBranch: null });
        if (pathname === '/api/saas/subscription') return json(route, billingFor(tenantType));
        if (pathname === '/api/dashboard') return json(route, { stats: { total: 10, active: 10, expired: 0, expiringSoon: 0, frozen: 0 }, alerts: [] });
        return json(route, {});
    });
    return calls;
}

test('Gym plan UI exposes four terms and only Gym-compatible feature labels', async ({ page }, testInfo) => {
    await installTenantApi(page, 'gym');
    await page.goto('/#saas-billing', { waitUntil: 'domcontentloaded' });
    if (testInfo.project.use.viewport.width <= 767) {
        await page.locator('#mobileNavToggle').click();
        await expect(page.locator('#pageTabs')).toBeVisible();
    }
    await page.locator('[data-page-tab="saas-billing"]').click();
    await expect(page.locator('#saasPlansList [data-saas-plan-card]')).toHaveCount(4);
    await expect(page.locator('#saasPlansList [data-saas-term-plan]')).toHaveCount(4);
    await expect(page.locator('#saasPlansList [data-saas-feature-key="clients"]')).toHaveCount(0);
    await expect(page.locator('#saasPlansList [data-saas-feature-key="members"]')).toHaveCount(4);

    const basic = page.locator('[data-saas-plan-card="12"]');
    await basic.locator('[data-saas-term-plan]').selectOption('quarterly');
    await expect(basic.locator('.saas-plan-price')).toContainText('١٬٥٩٩');
    await expect(basic.locator('.saas-plan-price')).toContainText('3 Months');
});

test('Trainer plan UI filters Gym-only features and remains usable at 320px', async ({ page }) => {
    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;
        if (pathname === '/api/auth/session') return json(route, { authenticated: true, user: { id: 9, name: 'QA Trainer', role: 'Owner', tenantType: 'independent_trainer', permissions: [] } });
        if (pathname === '/api/trainer/workspace') return json(route, { metrics: {}, today: [], upcoming: [], priorities: {} });
        if (pathname === '/api/saas/subscription') return json(route, billingFor('independent_trainer'));
        return json(route, {});
    });
    await page.goto('/trainer-workspace/settings', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-trainer-plan-card]')).toHaveCount(4);
    await expect(page.locator('[data-trainer-plan-card="basic"] .trainer-studio-plan-features')).toContainText('Clients');
    await expect(page.locator('[data-trainer-plan-grid]')).not.toContainText('Members');
    const basic = page.locator('[data-trainer-plan-card="basic"]');
    await basic.locator('[data-trainer-plan-term]').selectOption('quarterly');
    await expect(basic.locator('[data-trainer-plan-price]')).toContainText('١٬٥٩٩');
});

test('Platform Admin plan editor exposes independent pricing terms and protects Enterprise', async ({ page }) => {
    const plans = PLAN_CONFIG.map(withCatalogFeatures).concat([{
        id: 15, code: 'enterprise', name: 'Enterprise', description: 'Legacy', isActive: true,
        availableForNewSubscriptions: false, compatibleTenantTypes: ['gym'], billingPeriod: 'yearly', price: 1299,
        currency: 'EGP', maxMembers: null, maxClients: null, maxUsers: null, maxBranches: null, maxAiGenerations: null, maxStorageMb: 51200,
        terms: [{ code: 'annual', durationMonths: 12, price: 1299, currency: 'EGP', isActive: true }], features: {}
    }]);
    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;
        if (pathname === '/api/auth/session') return json(route, { authenticated: true, user: { id: 99, name: 'QA Platform', role: 'PlatformAdmin', permissions: [] } });
        if (pathname === '/api/platform-admin/plans') return json(route, { plans });
        if (pathname === '/api/platform-admin/feature-catalog') return json(route, { featureCatalog: FEATURE_CATALOG });
        return json(route, {});
    });
    await page.goto('/platform-admin.html#plans', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#plansGrid .plan-card')).toHaveCount(5);
    await page.locator('[data-plan-edit="12"]').click();
    await expect(page.locator('#platformActionDialog')).toBeVisible();
    await expect(page.locator('[name="term_monthly"]')).toHaveValue('599');
    await expect(page.locator('[name="term_quarterly"]')).toHaveValue('1599');
    await expect(page.locator('[name="term_semiannual"]')).toHaveValue('2999');
    await expect(page.locator('[name="term_annual"]')).toHaveValue('5499');
    await page.locator('[data-dialog-cancel]').first().click();
    const enterprise = page.locator('[data-plan-delete="15"]');
    await expect(enterprise).toBeDisabled();
});
