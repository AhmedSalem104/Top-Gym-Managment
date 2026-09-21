const { test, expect } = require('@playwright/test');
const featureCatalog = require('../../src/services/feature-catalog');

function json(route, payload, status = 200) {
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) });
}

async function installNavigationRuntime(page) {
    await page.route('**/api/**', async (route) => {
        const pathname = new URL(route.request().url()).pathname;
        if (pathname === '/api/auth/session') {
            return json(route, {
                authenticated: true,
                user: { id: 901, name: 'Navigation QA Gym', role: 'Owner', tenantType: 'gym', permissions: [] }
            });
        }
        if (pathname === '/api/branding') return json(route, { identity: { brandName: 'Navigation QA Gym' } });
        if (pathname === '/api/saas/entitlements') {
            return json(route, {
                tenantStatus: 'active',
                subscription: { status: 'active', plan: { code: 'business', name: 'Business' } },
                entitlements: {
                    tenantType: 'gym',
                    featureCatalog: featureCatalog.getFeatureCatalog({ tenantType: 'gym' }),
                    features: Object.fromEntries([
                        'dashboard', 'members', 'attendance', 'reports', 'branches', 'trainees', 'library',
                        'store', 'intelligence', 'feedback', 'management', 'branding', 'member-payment-methods',
                        'permissions', 'expenses', 'member-subscription-requests', 'portal-analytics', 'saas-billing',
                        'backup-history'
                    ].map((key) => [key, true]))
                }
            });
        }
        if (pathname === '/api/branches/bootstrap') {
            return json(route, {
                branches: [{ id: 1, name: 'Main Branch', code: 'main', status: 'active', isMain: true }],
                activeBranches: [{ id: 1, name: 'Main Branch', code: 'main', status: 'active', isMain: true }],
                defaultBranch: { id: 1, name: 'Main Branch', code: 'main', status: 'active', isMain: true },
                sections: [{ id: 11, name: 'Mixed', type: 'mixed', branchId: 1, active: true }],
                branchLimit: null,
                hasMultipleActiveBranches: false,
                canUseAllBranches: true
            });
        }
        if (pathname === '/api/dashboard') return json(route, { stats: {}, alerts: [] });
        return json(route, {});
    });
}

test('responsive navigation stays organized and accessible at each viewport', async ({ page }, testInfo) => {
    await installNavigationRuntime(page);
    await page.goto('/#dashboard', { waitUntil: 'networkidle' });

    const width = testInfo.project.use.viewport.width;
    const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
    expect(dimensions.document, JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.viewport + 1);
    expect(dimensions.body, JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.viewport + 1);

    if (width <= 767) {
        await expect(page.locator('#mobileNavToggle')).toBeVisible();
        await expect(page.locator('#pageTabs')).toBeHidden();
        await page.locator('#mobileNavToggle').click();
        await expect(page.locator('.app-shell')).toHaveClass(/mobile-nav-open/);
        await expect(page.locator('#pageTabs')).toBeVisible();
        await expect(page.locator('[data-nav-group-label="workspace"]')).toBeVisible();
        await expect(page.locator('[data-nav-group-label="location"]')).toBeVisible();
        await expect(page.locator('[data-page-tab="branches"]')).toBeVisible();
        await page.screenshot({ path: testInfo.outputPath(`navigation-drawer-open-${width}.png`), fullPage: false });
        await page.keyboard.press('Escape');
        await expect(page.locator('.app-shell')).not.toHaveClass(/mobile-nav-open/);
        await expect(page.locator('#pageTabs')).toBeHidden();
        await page.screenshot({ path: testInfo.outputPath(`navigation-mobile-${width}.png`), fullPage: true });
    } else if (width < 1200) {
        await expect(page.locator('#mobileNavToggle')).toBeHidden();
        await expect(page.locator('#pageTabs')).toBeVisible();
    } else {
        await expect(page.locator('#mobileNavToggle')).toBeHidden();
        await expect(page.locator('#pageTabs')).toBeVisible();
        await expect(page.locator('[data-page-tab="branches"]')).toBeVisible();
        await page.screenshot({ path: testInfo.outputPath('navigation-desktop.png'), fullPage: true });
    }
});
