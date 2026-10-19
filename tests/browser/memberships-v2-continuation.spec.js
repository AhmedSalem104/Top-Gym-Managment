const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const planCatalog = require('../../src/services/saas-plan-catalog');
const featureCatalog = require('../../src/services/feature-catalog');

const OUTPUT_DIR = 'qa/reports/logicfit-v2-memberships';
const VIEWPORTS = [1440, 1024, 768, 390, 320];
const THEMES = ['light', 'dark'];
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

function json(route, payload, status = 200) {
    return route.fulfill({ status, contentType: 'application/json; charset=utf-8', body: JSON.stringify(payload) });
}

test('membership catalogs are inline tabs and preserve controls across themes and viewports', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The test owns its complete responsive theme matrix.');
    const plan = planCatalog.PLAN_CONFIGURATIONS.find((item) => item.code === 'business');
    const pricing = {
        plans: {
            gym_only: { label: 'Gym only QA', monthlyPrice: 350, active: true, sortOrder: 1 },
            gym_cardio: { label: 'Gym + Cardio QA', monthlyPrice: 575, active: true, sortOrder: 2 }
        },
        types: {
            monthly: { label: 'Monthly QA', mode: 'months', durationValue: 1, priceMultiplier: 1, active: true, sortOrder: 1 },
            quarterly: { label: 'Quarterly QA', mode: 'months', durationValue: 3, priceMultiplier: 2.7, active: true, sortOrder: 2 },
            annual: { label: 'Annual QA', mode: 'months', durationValue: 12, priceMultiplier: 9, active: true, sortOrder: 3 }
        },
        prices: { gym_only: { monthly: 350, quarterly: 945, annual: 3150 }, gym_cardio: { monthly: 575, quarterly: 1552.5, annual: 5175 } }
    };
    const writes = [];
    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;
        if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
            writes.push({ pathname, method: request.method() });
            return json(route, { error: 'Write blocked by read-only fixture.' }, 405);
        }
        if (pathname === '/api/auth/session') return json(route, { authenticated: true, user: { id: 721, name: 'V2 QA Owner', role: 'Owner', tenantType: 'gym', permissions: [] } });
        if (pathname === '/api/branding') return json(route, { identity: { brandName: 'Membership QA Gym' } });
        if (pathname === '/api/saas/entitlements') return json(route, { tenantStatus: 'active', subscription: { status: 'active', plan: { code: plan.code, name: plan.name } }, entitlements: { tenantType: 'gym', features: planCatalog.featureFlagsForPlan(plan.code), featureCatalog: featureCatalog.getFeatureCatalog({ tenantType: 'gym' }) } });
        if (pathname === '/api/branches/bootstrap') return json(route, { branches: [], activeBranches: [], sections: [], defaultBranch: null });
        if (pathname === '/api/pricing') return json(route, pricing);
        if (pathname === '/api/day-passes/pricing') return json(route, { types: [] });
        if (pathname === '/api/members') return json(route, { members: [], pagination: { page: 1, pageSize: 5, totalItems: 0, totalPages: 0 } });
        return json(route, {});
    });

    for (const width of VIEWPORTS) {
        await page.setViewportSize({ width, height: width < 400 ? 844 : 900 });
        await page.goto('/index.html#management', { waitUntil: 'networkidle' });
        const section = page.locator('#managementSection');
        await expect(section).toBeVisible();
        const pricingTab = section.locator('#managementPricingTab');
        const typesTab = section.locator('#managementTypesTab');
        const pricingPanel = page.locator('#pricingDialog');
        const typesPanel = page.locator('#membershipTypesDialog');
        await expect(pricingTab).toHaveAttribute('role', 'tab');
        await expect(typesTab).toHaveAttribute('role', 'tab');
        await expect(pricingTab).toHaveAttribute('aria-selected', 'true');
        await expect(pricingPanel).toBeVisible();
        await expect(typesPanel).toBeHidden();
        await expect(page.locator('#dayPassPricingContainer .loading')).toBeHidden();
        await expect(page.locator('#dayPassPricingContainer .empty')).toBeVisible();

        await expect(pricingPanel.locator('#pricingTableContainer tr[data-plan="gym_only"] [data-field="monthlyPrice"]')).toHaveValue('350.00');
        await expect(pricingPanel.locator('#pricingTableContainer tr[data-plan="gym_only"] [data-field="typePrice"][data-type-code="annual"]')).toHaveValue('3150.00');
        await expect(pricingPanel.locator('#pricingSave')).toBeVisible();
        const initialTab = await pricingTab.evaluate((element) => element.getBoundingClientRect().toJSON());
        expect(initialTab.width).toBeGreaterThan(0);

        for (const theme of THEMES) {
            await page.evaluate((value) => window.TopGymTheme.set(value), theme);
            await section.screenshot({ path: `${OUTPUT_DIR}/management-${width}-${theme}.png`, animations: 'disabled' });
            await pricingPanel.screenshot({ path: `${OUTPUT_DIR}/pricing-${width}-${theme}.png`, animations: 'disabled' });
            await typesTab.click();
            await expect(typesTab).toHaveAttribute('aria-selected', 'true');
            await expect(typesPanel).toBeVisible();
            await expect(pricingPanel).toBeHidden();
            await expect(typesPanel.locator('#membershipTypesTableContainer')).toContainText('Monthly QA');
            await expect(typesPanel.locator('[data-type-action="edit"][data-code="monthly"]:visible')).toHaveCount(1);
            await typesPanel.screenshot({ path: `${OUTPUT_DIR}/membership-types-${width}-${theme}.png`, animations: 'disabled' });
            await pricingTab.click();
            await expect(pricingPanel).toBeVisible();
        }

        const bounds = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
        expect(bounds.document, `document overflow at ${width}px`).toBeLessThanOrEqual(width);
        expect(bounds.body, `body overflow at ${width}px`).toBeLessThanOrEqual(width);
    }

    expect(writes, 'catalog viewing must not write to APIs').toEqual([]);
});
