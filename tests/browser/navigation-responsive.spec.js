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
    if (width <= 767) {
        await expect(page.locator('#mobileNavToggle')).toBeAttached();
        await expect(page.locator('#pageTabs')).toBeAttached();
        await page.locator('#mobileNavToggle').click();
        await expect(page.locator('.app-shell')).toHaveClass(/mobile-nav-open/);
        await expect(page.locator('[data-nav-group-label="workspace"]')).toBeAttached();
        await expect(page.locator('[data-nav-group-label="location"]')).toBeAttached();
        await expect(page.locator('[data-page-tab="branches"]')).toBeAttached();
        await page.screenshot({ path: testInfo.outputPath(`navigation-drawer-open-${width}.png`), fullPage: false });
        await page.keyboard.press('Escape');
        await expect(page.locator('.app-shell')).not.toHaveClass(/mobile-nav-open/);
        await page.screenshot({ path: testInfo.outputPath(`navigation-mobile-${width}.png`), fullPage: true });
    } else if (width < 1200) {
        await expect(page.locator('#mobileNavToggle')).toBeAttached();
        await expect(page.locator('#pageTabs')).toBeAttached();
    } else {
        await expect(page.locator('#mobileNavToggle')).toBeAttached();
        await expect(page.locator('#pageTabs')).toBeAttached();
        await expect(page.locator('[data-page-tab="branches"]')).toBeAttached();
        await page.screenshot({ path: testInfo.outputPath('navigation-desktop.png'), fullPage: true });
    }
});

test('SPA navigation leaves one ready surface with no stale or blank route', async ({ page }) => {
    await installNavigationRuntime(page);
    await page.goto('/#dashboard', { waitUntil: 'networkidle' });

    for (const route of ['members', 'reports', 'dashboard']) {
        await page.evaluate(async (name) => {
            await window.topGymActivateTab(name);
        }, route);
        await expect(page.locator('#dashboardSection')).toHaveAttribute('data-active-route', route);
        await expect(page.locator('#dashboardSection')).toHaveAttribute('data-route-state', 'ready');
        await expect(page.locator('#dashboardSection')).toHaveAttribute('aria-busy', 'false');

        const state = await page.evaluate(() => {
            const visiblePanels = [...document.querySelectorAll('[data-page-tab-panel]')]
                .filter((panel) => !panel.hidden && panel.getAttribute('aria-hidden') !== 'true');
            return {
                visiblePanels: visiblePanels.length,
                activeRoute: document.getElementById('dashboardSection')?.dataset.activeRoute,
                featureBlocked: document.getElementById('dashboardSection')?.dataset.featureBlocked === 'true'
            };
        });
        expect(state.visiblePanels, `${route} left multiple active panels`).toBeLessThanOrEqual(1);
        expect(state.activeRoute).toBe(route);
        expect(state.featureBlocked).toBeFalsy();
    }
});
