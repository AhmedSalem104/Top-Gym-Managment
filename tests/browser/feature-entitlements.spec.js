const { test, expect } = require('@playwright/test');

const planCatalog = require('../../src/services/saas-plan-catalog');
const featureCatalog = require('../../src/services/feature-catalog');

function json(route, payload, status = 200) {
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) });
}

function entitlementPayload(tenantType, planCode, featureOverride = {}) {
    const plan = planCatalog.PLAN_CONFIGURATIONS.find((item) => item.code === planCode);
    const features = { ...planCatalog.featureFlagsForPlan(planCode), ...featureOverride };
    return {
        tenantStatus: 'active',
        subscription: { status: 'active', plan: { code: planCode, name: plan.name } },
        entitlements: {
            tenantType,
            features,
            featureCatalog: featureCatalog.getFeatureCatalog({ tenantType })
        }
    };
}

async function installGymRuntime(page) {
    let planCode = 'starter';
    const calls = [];
    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;
        calls.push(pathname);
        if (pathname === '/api/auth/session') return json(route, { authenticated: true, user: { id: 201, name: 'Entitlement Gym', role: 'Owner', tenantType: 'gym', permissions: [] } });
        if (pathname === '/api/branding') return json(route, { identity: { brandName: 'Entitlement Gym' } });
        if (pathname === '/api/saas/entitlements') return json(route, entitlementPayload('gym', planCode));
        if (pathname === '/api/bootstrap') return json(route, { branches: [], sections: [], defaultBranch: null });
        if (pathname === '/api/dashboard') return json(route, { stats: { total: 0, active: 0, expired: 0, expiringSoon: 0, frozen: 0 }, alerts: [] });
        return json(route, {});
    });
    return {
        calls,
        setPlan(nextPlan) { planCode = nextPlan; }
    };
}

test('Starter Gym hides excluded feature, blocks direct route, and refreshes after upgrade/downgrade', async ({ page }, testInfo) => {
    const runtime = await installGymRuntime(page);
    await page.goto('/#store', { waitUntil: 'networkidle' });

    await expect(page.locator('[data-page-tab="store"]')).toBeHidden();
    await expect(page.locator('#featureAccessState')).toBeVisible();
    await expect(page.locator('#featureAccessState')).toContainText('غير متاحة');
    await expect(page.locator('#dashboardSection')).toHaveAttribute('data-feature-blocked', 'true');

    runtime.setPlan('pro');
    await page.evaluate(() => window.topGymAuth.refreshEntitlements());
    await expect(page.locator('[data-page-tab="store"]')).toBeVisible();
    await expect(page.locator('#storeSection')).toBeVisible();

    runtime.setPlan('starter');
    await page.evaluate(() => window.topGymAuth.refreshEntitlements());
    await expect(page.locator('[data-page-tab="store"]')).toBeHidden();
    await expect(page.locator('#featureAccessState')).toBeVisible();
    await expect(page.locator('#dashboardSection')).toHaveAttribute('data-feature-blocked', 'true');

    const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
    expect(dimensions.document, JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.viewport + 1);
    expect(dimensions.body, JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.viewport + 1);
    expect(runtime.calls).toContain('/api/saas/entitlements');
    await page.screenshot({ path: testInfo.outputPath('starter-gym-feature-not-available.png'), fullPage: true });
});

test('Starter Trainer hides excluded session route and shows an in-content access state', async ({ page }, testInfo) => {
    await page.route('**/api/**', async (route) => {
        const pathname = new URL(route.request().url()).pathname;
        if (pathname === '/api/auth/session') return json(route, { authenticated: true, user: { id: 202, name: 'Entitlement Trainer', role: 'Owner', tenantType: 'independent_trainer', permissions: [] } });
        if (pathname === '/api/saas/entitlements') return json(route, entitlementPayload('independent_trainer', 'starter'));
        if (pathname === '/api/trainer/workspace') return json(route, { metrics: {}, today: [], upcoming: [], priorities: {} });
        return json(route, {});
    });
    await page.goto('/trainer-workspace/sessions', { waitUntil: 'networkidle' });

    await expect(page.locator('[data-studio-route="sessions"]')).toBeHidden();
    await expect(page.locator('.trainer-studio-feature-access')).toBeVisible();
    await expect(page.locator('.trainer-studio-feature-access')).toContainText('غير متاحة');
    const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
    expect(dimensions.document, JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.viewport + 1);
    expect(dimensions.body, JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.viewport + 1);
    await page.screenshot({ path: testInfo.outputPath('starter-trainer-feature-not-available.png'), fullPage: true });
});

const BROWSER_MATRIX = [
    { tenantType: 'gym', planCode: 'starter', featureKey: 'store', path: '/#store', excluded: true },
    { tenantType: 'gym', planCode: 'basic', featureKey: 'store', path: '/#store', excluded: true },
    { tenantType: 'gym', planCode: 'pro', featureKey: 'store', path: '/#store', excluded: false },
    { tenantType: 'gym', planCode: 'business', featureKey: 'store', path: '/#store', excluded: false },
    { tenantType: 'independent_trainer', planCode: 'starter', featureKey: 'sessions', path: '/trainer-workspace/sessions', excluded: true },
    { tenantType: 'independent_trainer', planCode: 'basic', featureKey: 'sessions', path: '/trainer-workspace/sessions', excluded: false },
    { tenantType: 'independent_trainer', planCode: 'pro', featureKey: 'sessions', path: '/trainer-workspace/sessions', excluded: false },
    { tenantType: 'independent_trainer', planCode: 'business', featureKey: 'sessions', path: '/trainer-workspace/sessions', excluded: false }
];

for (const matrixCase of BROWSER_MATRIX) {
    test(`browser matrix ${matrixCase.tenantType} ${matrixCase.planCode} ${matrixCase.featureKey}`, async ({ page }, testInfo) => {
        await page.route('**/api/**', async (route) => {
            const request = route.request();
            const pathname = new URL(request.url()).pathname;
            if (pathname === '/api/auth/session') {
                return json(route, {
                    authenticated: true,
                    user: { id: 300, name: 'Entitlement Matrix', role: 'Owner', tenantType: matrixCase.tenantType, permissions: [] }
                });
            }
            if (pathname === '/api/saas/entitlements') return json(route, entitlementPayload(matrixCase.tenantType, matrixCase.planCode));
            if (pathname === '/api/branding') return json(route, { identity: { brandName: 'Entitlement Matrix' } });
            if (pathname === '/api/trainer/workspace') return json(route, { metrics: {}, today: [], upcoming: [], priorities: {} });
            if (pathname === '/api/bootstrap') return json(route, { branches: [], sections: [], defaultBranch: null });
            return json(route, {});
        });

        await page.goto(matrixCase.path, { waitUntil: 'networkidle' });
        if (matrixCase.tenantType === 'gym') {
            const nav = page.locator(`[data-page-tab="${matrixCase.featureKey}"]`);
            if (matrixCase.excluded) {
                await expect(nav).toBeHidden();
                await expect(page.locator('#featureAccessState')).toBeVisible();
            } else {
                await expect(nav).toHaveAttribute('aria-hidden', 'false');
                if (testInfo.project.name === 'desktop') await expect(nav).toBeVisible();
                await expect(page.locator('#storeSection')).toBeVisible();
            }
        } else {
            const nav = page.locator(`[data-studio-route="${matrixCase.featureKey}"]`);
            if (matrixCase.excluded) {
                await expect(nav).toBeHidden();
                await expect(page.locator('.trainer-studio-feature-access')).toBeVisible();
            } else {
                await expect(nav).toHaveAttribute('aria-hidden', 'false');
                if (testInfo.project.name === 'desktop') await expect(nav).toBeVisible();
                await expect(page.locator('.trainer-studio-feature-access')).toHaveCount(0);
            }
        }
        const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
        expect(dimensions.document, JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.viewport + 1);
        expect(dimensions.body, JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.viewport + 1);
    });
}

test('Expired and suspended subscriptions use distinct access states', async ({ page }) => {
    let status = 'expired';
    let tenantStatus = 'active';
    await page.route('**/api/**', async (route) => {
        const pathname = new URL(route.request().url()).pathname;
        if (pathname === '/api/auth/session') return json(route, { authenticated: true, user: { id: 203, name: 'State QA', role: 'Owner', tenantType: 'gym', permissions: [] } });
        if (pathname === '/api/branding') return json(route, { identity: { brandName: 'State QA' } });
        if (pathname === '/api/saas/entitlements') return json(route, {
            tenantStatus,
            subscription: { status, plan: { code: 'starter', name: 'Starter' } },
            entitlements: entitlementPayload('gym', 'starter').entitlements
        });
        return json(route, {});
    });
    await page.goto('/#store', { waitUntil: 'networkidle' });
    await expect(page.locator('#featureAccessState')).toContainText('انتهى اشتراكك');

    status = 'active';
    tenantStatus = 'suspended';
    await page.evaluate(() => window.topGymAuth.refreshEntitlements());
    await expect(page.locator('#featureAccessState')).toContainText('تم إيقاف الحساب');
});
