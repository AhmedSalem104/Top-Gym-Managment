'use strict';

const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const planCatalog = require('../../src/services/saas-plan-catalog');
const featureCatalog = require('../../src/services/feature-catalog');

const OUTPUT_DIR = path.resolve('qa/artifacts/membership-management-inline-tabs');
const VIEWPORTS = [320, 375, 390, 768, 1024, 1440, 1920];
const THEMES = ['light', 'dark'];
const LOCALES = ['ar', 'en'];
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function json(route, payload, status = 200) {
    return route.fulfill({ status, contentType: 'application/json; charset=utf-8', body: JSON.stringify(payload) });
}

test('membership management inline tabs remain usable across viewport, locale, theme and catalog states', async ({ page }, testInfo) => {
    test.setTimeout(600_000);
    test.skip(testInfo.project.name !== 'desktop', 'The test owns its complete viewport, locale and theme matrix.');
    const plan = planCatalog.PLAN_CONFIGURATIONS.find((item) => item.code === 'business');
    const writes = [];
    const pageErrors = [];
    let catalogMode = 'populated';
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;
        if (!SAFE_METHODS.has(request.method())) {
            writes.push(`${request.method()} ${pathname}`);
            return json(route, { error: 'Read-only visual fixture: writes are disabled.' }, 405);
        }
        if (pathname === '/api/auth/session') return json(route, { authenticated: true, user: { id: 721, name: 'V2 QA Owner', role: 'Owner', tenantType: 'gym', permissions: [] } });
        if (pathname === '/api/branding') return json(route, { identity: { brandName: 'Membership QA Gym' } });
        if (pathname === '/api/saas/entitlements') return json(route, { tenantStatus: 'active', subscription: { status: 'active', plan: { code: plan.code, name: plan.name } }, entitlements: { tenantType: 'gym', features: planCatalog.featureFlagsForPlan(plan.code), featureCatalog: featureCatalog.getFeatureCatalog({ tenantType: 'gym' }) } });
        if (pathname === '/api/branches/bootstrap' || pathname === '/api/bootstrap') return json(route, { branches: [], activeBranches: [], sections: [], defaultBranch: null, canUseAllBranches: true });
        if (pathname === '/api/pricing') {
            if (catalogMode === 'error') return json(route, { error: 'QA fixture: catalog unavailable.' }, 503);
            if (catalogMode === 'empty') return json(route, { plans: {}, types: {}, prices: {} });
            return json(route, {
                plans: { gym_only: { label: 'Gym only QA', monthlyPrice: 350, active: true, sortOrder: 1 }, gym_cardio: { label: 'Gym + Cardio QA', monthlyPrice: 575, active: true, sortOrder: 2 } },
                types: { monthly: { label: 'Monthly QA', mode: 'months', durationValue: 1, priceMultiplier: 1, active: true, sortOrder: 1 }, annual: { label: 'Annual QA', mode: 'months', durationValue: 12, priceMultiplier: 9, active: true, sortOrder: 2 } },
                prices: { gym_only: { monthly: 350, annual: 3150 }, gym_cardio: { monthly: 575, annual: 5175 } }
            });
        }
        if (pathname === '/api/day-passes/pricing') return json(route, { types: [] });
        if (pathname === '/api/members') return json(route, { members: [], pagination: { page: 1, pageSize: 5, totalItems: 0, totalPages: 0 } });
        return json(route, {});
    });

    await page.addInitScript(() => {
        localStorage.setItem('logic-fit-ui-locale', 'ar');
        localStorage.setItem('topgym-theme', 'light');
    });
    await page.goto('/index.html?membershipVisual=populated#management', { waitUntil: 'networkidle' });
    const section = page.locator('#managementSection');
    await expect(page.locator('html')).toHaveAttribute('data-top-gym-active-tab', 'management');
    await expect(section).toBeVisible();
    await expect(page.locator('#dayPassPricingContainer .loading')).toBeHidden();
    await expect(page.locator('#dayPassPricingContainer .empty')).toBeVisible();

    const matrix = [];
    for (const width of VIEWPORTS) {
        for (const theme of THEMES) {
            for (const locale of LOCALES) {
                await page.setViewportSize({ width, height: width <= 390 ? 844 : width < 1024 ? 900 : 960 });
                await page.evaluate(({ mode, language }) => {
                    window.TopGymTheme?.set?.(mode);
                    window.TopGymI18n?.set?.(language, { persist: false });
                }, { mode: theme, language: locale });
                await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
                await expect(section).toBeVisible();
                const suffix = `${width}-${locale}-${theme}`;
                const pricingTab = section.locator('#managementPricingTab');
                const typesTab = section.locator('#managementTypesTab');
                const pricingPanel = page.locator('#pricingDialog');
                const typesPanel = page.locator('#membershipTypesDialog');
                await pricingTab.click();
                await expect(pricingPanel).toBeVisible();
                await expect(pricingTab).toHaveAttribute('aria-selected', 'true');
                await expect(pricingPanel.locator('.pricing-plan-card').first()).toBeVisible();
                const pricingFile = `pricing-${suffix}.png`;
                await pricingPanel.screenshot({ path: path.join(OUTPUT_DIR, pricingFile), animations: 'disabled' });

                await pricingTab.focus();
                await page.keyboard.press('ArrowRight');
                await expect(typesTab).toBeFocused();
                await expect(typesTab).toHaveAttribute('aria-selected', 'true');
                await expect(typesPanel).toBeVisible();
                await expect(pricingPanel).toBeHidden();
                await expect(typesPanel.locator('.membership-type-card').first()).toBeVisible();
                const typesFile = `types-${suffix}.png`;
                await typesPanel.screenshot({ path: path.join(OUTPUT_DIR, typesFile), animations: 'disabled' });
                const pageBounds = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
                expect(pageBounds.document, `document overflow ${suffix}`).toBeLessThanOrEqual(width);
                expect(pageBounds.body, `body overflow ${suffix}`).toBeLessThanOrEqual(width);
                matrix.push({ width, theme, locale, pageBounds, screenshots: [pricingFile, typesFile] });
            }
        }
    }

    for (const state of ['empty', 'error']) {
        catalogMode = state;
        await page.goto(`/index.html?membershipVisual=${state}#management`, { waitUntil: 'networkidle' });
        await expect(section).toBeVisible();
        if (state === 'empty') {
            await expect(page.locator('#pricingTableContainer .empty')).toBeVisible();
            await page.locator('#managementTypesTab').click();
            await expect(page.locator('#membershipTypesTableContainer .pricing-cards-empty')).toBeVisible();
        } else {
            await expect(page.locator('#toast')).toHaveClass(/show/);
            await expect(page.locator('#pricingDialog')).toBeVisible();
        }
    }

    expect(writes, 'visual fixtures must not submit or mutate data').toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(matrix).toHaveLength(VIEWPORTS.length * THEMES.length * LOCALES.length);
    await fs.writeFile(path.join(OUTPUT_DIR, 'matrix.json'), JSON.stringify({ cases: matrix.length, matrix, writes, pageErrors }, null, 2));
});
