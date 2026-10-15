'use strict';

const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const planCatalog = require('../../src/services/saas-plan-catalog');
const featureCatalog = require('../../src/services/feature-catalog');

const OUTPUT_DIR = path.resolve('qa/artifacts/membership-management-visual-close');
const VIEWPORTS = [320, 375, 390, 768, 1024, 1440, 1920];
const THEMES = ['light', 'dark'];
const LOCALES = ['ar', 'en'];
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function json(route, payload, status = 200) {
    return route.fulfill({
        status,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify(payload)
    });
}

function pricingFixture(mode) {
    if (mode === 'empty') return { plans: {}, types: {}, prices: {} };
    return {
        plans: {
            gym_only: { label: 'جيم فقط', monthlyPrice: 350, active: true, sortOrder: 1 },
            gym_cardio: { label: 'جيم وكارديو', monthlyPrice: 575, active: true, sortOrder: 2 }
        },
        types: {
            monthly: { label: 'شهري', mode: 'months', durationValue: 1, priceMultiplier: 1, active: true, sortOrder: 1 },
            quarterly: { label: 'ربع سنوي', mode: 'months', durationValue: 3, priceMultiplier: 2.7, active: true, sortOrder: 2 },
            annual: { label: 'سنوي', mode: 'months', durationValue: 12, priceMultiplier: 9, active: true, sortOrder: 3 }
        },
        prices: {
            gym_only: { monthly: 350, quarterly: 945, annual: 3150 },
            gym_cardio: { monthly: 575, quarterly: 1552.5, annual: 5175 }
        }
    };
}

test('membership management visual close: screen, catalogs and dialogs across viewport, locale and theme', async ({ page }, testInfo) => {
    test.setTimeout(600_000);
    test.skip(testInfo.project.name !== 'desktop', 'The test owns its complete internal viewport, locale and theme matrix.');
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
        if (pathname === '/api/auth/session') {
            return json(route, {
                authenticated: true,
                user: { id: 721, name: 'V2 QA Owner', role: 'Owner', tenantType: 'gym', permissions: [] }
            });
        }
        if (pathname === '/api/branding') return json(route, { identity: { brandName: 'Membership QA Gym' } });
        if (pathname === '/api/saas/entitlements') {
            return json(route, {
                tenantStatus: 'active',
                subscription: { status: 'active', plan: { code: plan.code, name: plan.name } },
                entitlements: {
                    tenantType: 'gym',
                    features: planCatalog.featureFlagsForPlan(plan.code),
                    featureCatalog: featureCatalog.getFeatureCatalog({ tenantType: 'gym' })
                }
            });
        }
        if (pathname === '/api/branches/bootstrap' || pathname === '/api/bootstrap') {
            return json(route, { branches: [], activeBranches: [], sections: [], defaultBranch: null, canUseAllBranches: true });
        }
        if (pathname === '/api/pricing') {
            if (catalogMode === 'error') return json(route, { error: 'QA fixture: catalog unavailable.' }, 503);
            return json(route, pricingFixture(catalogMode));
        }
        if (pathname === '/api/day-passes/pricing') return json(route, { types: [] });
        if (pathname === '/api/members') {
            return json(route, { members: [], pagination: { page: 1, pageSize: 5, totalItems: 0, totalPages: 0 } });
        }
        return json(route, {});
    });

    await page.addInitScript(() => {
        localStorage.setItem('logic-fit-ui-locale', 'ar');
        localStorage.setItem('topgym-theme', 'light');
    });
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto('/index.html?membershipVisual=populated#management', { waitUntil: 'networkidle' });
    const section = page.locator('#managementSection');
    await expect(page.locator('html')).toHaveAttribute('data-top-gym-active-tab', 'management');
    await expect(section).toBeVisible();

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
                const pageBounds = await page.evaluate(() => ({
                    viewport: innerWidth,
                    document: document.documentElement.scrollWidth,
                    body: document.body.scrollWidth,
                    direction: getComputedStyle(document.getElementById('managementSection')).direction
                }));
                expect(pageBounds.document, `document overflow ${suffix}`).toBeLessThanOrEqual(width);
                expect(pageBounds.body, `body overflow ${suffix}`).toBeLessThanOrEqual(width);
                expect(pageBounds.direction).toBe(locale === 'ar' ? 'rtl' : 'ltr');

                const firstShortcut = section.locator('.management-shortcut').first();
                await firstShortcut.focus();
                await page.keyboard.press('Tab');
                const nextShortcutHasKeyboardFocus = await section.locator('.management-shortcut').nth(1).evaluate((element) => element.matches(':focus-visible'));
                expect(nextShortcutHasKeyboardFocus, `keyboard focus indicator ${suffix}`).toBe(true);
                await page.evaluate(() => document.activeElement?.blur());
                const screenFile = `management-${suffix}.png`;
                await section.screenshot({ path: path.join(OUTPUT_DIR, screenFile), animations: 'disabled' });
                const shortcut = section.locator('.management-shortcut').first();
                const shortcutSize = await shortcut.evaluate((element) => {
                    const rect = element.getBoundingClientRect();
                    return { width: rect.width, height: rect.height };
                });
                expect(shortcutSize.width, `shortcut width ${suffix}`).toBeGreaterThanOrEqual(44);
                expect(shortcutSize.height, `shortcut touch target ${suffix}`).toBeGreaterThanOrEqual(44);

                await section.locator('[data-open-dialog-button="pricingButton"]').click();
                const pricingDialog = page.locator('#pricingDialog');
                await expect(pricingDialog).toBeVisible();
                const pricingBounds = await pricingDialog.evaluate((element) => {
                    const rect = element.getBoundingClientRect();
                    const content = element.querySelector(':scope > .lf-modal-layout');
                    return {
                        left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
                        innerWidth, innerHeight,
                        contentWidth: content?.clientWidth || 0,
                        contentScrollWidth: content?.scrollWidth || 0
                    };
                });
                expect(pricingBounds.left, `pricing left ${suffix}`).toBeGreaterThanOrEqual(-1);
                expect(pricingBounds.right, `pricing right ${suffix}`).toBeLessThanOrEqual(width + 1);
                expect(pricingBounds.top, `pricing top ${suffix}`).toBeGreaterThanOrEqual(-1);
                expect(pricingBounds.bottom, `pricing bottom ${suffix}`).toBeLessThanOrEqual(pricingBounds.innerHeight + 1);
                expect(pricingBounds.contentScrollWidth, `pricing content overflow ${suffix}`).toBeLessThanOrEqual(pricingBounds.contentWidth + 1);
                await expect(pricingDialog.locator('.pricing-plan-card .pricing-card-eyebrow').first()).toHaveText(locale === 'en' ? 'Plan' : 'الباقة');
                await expect(pricingDialog.locator('.pricing-plan-card .pricing-card-currency').first()).toHaveText(locale === 'en' ? 'EGP' : 'ج.م');
                const pricingClose = pricingDialog.locator(':scope > .dialog-close-button[data-dialog-close-generated]');
                const closeBounds = await pricingClose.boundingBox();
                expect(closeBounds?.width, `pricing close width ${suffix}`).toBeGreaterThanOrEqual(44);
                expect(closeBounds?.height, `pricing close height ${suffix}`).toBeGreaterThanOrEqual(44);
                const pricingFile = `pricing-${suffix}.png`;
                await pricingDialog.screenshot({ path: path.join(OUTPUT_DIR, pricingFile), animations: 'disabled' });
                await page.keyboard.press('Escape');
                await expect(pricingDialog).toBeHidden();

                await section.locator('[data-open-dialog-button="membershipTypesButton"]').click();
                const typesDialog = page.locator('#membershipTypesDialog');
                await expect(typesDialog).toBeVisible();
                const typesBounds = await typesDialog.evaluate((element) => {
                    const rect = element.getBoundingClientRect();
                    const content = element.querySelector(':scope > .lf-modal-layout');
                    return {
                        left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
                        innerWidth, innerHeight,
                        contentWidth: content?.clientWidth || 0,
                        contentScrollWidth: content?.scrollWidth || 0
                    };
                });
                expect(typesBounds.left, `types left ${suffix}`).toBeGreaterThanOrEqual(-1);
                expect(typesBounds.right, `types right ${suffix}`).toBeLessThanOrEqual(width + 1);
                expect(typesBounds.top, `types top ${suffix}`).toBeGreaterThanOrEqual(-1);
                expect(typesBounds.bottom, `types bottom ${suffix}`).toBeLessThanOrEqual(typesBounds.innerHeight + 1);
                expect(typesBounds.contentScrollWidth, `types content overflow ${suffix}`).toBeLessThanOrEqual(typesBounds.contentWidth + 1);
                await expect(typesDialog.locator('.membership-type-card .pricing-card-eyebrow').first()).toHaveText(locale === 'en' ? 'Membership type' : 'نوع العضوية');
                await expect(typesDialog.locator('.membership-type-info-label').first()).toHaveText(locale === 'en' ? 'Duration' : 'المدة');
                await expect(typesDialog.locator('.membership-type-info-label').nth(1)).toHaveText(locale === 'en' ? 'Price multiplier' : 'معامل السعر');
                await expect(typesDialog.locator('.membership-type-card .type-status').first()).toHaveText(locale === 'en' ? 'Active' : 'نشط');
                const typeActions = typesDialog.locator('.membership-type-card-actions button').first();
                const actionBounds = await typeActions.boundingBox();
                expect(actionBounds?.width, `type action width ${suffix}`).toBeGreaterThanOrEqual(44);
                expect(actionBounds?.height, `type action target ${suffix}`).toBeGreaterThanOrEqual(44);
                const typesFile = `types-${suffix}.png`;
                await typesDialog.screenshot({ path: path.join(OUTPUT_DIR, typesFile), animations: 'disabled' });
                await page.keyboard.press('Escape');
                await expect(typesDialog).toBeHidden();

                matrix.push({ width, locale, theme, pageBounds, pricingBounds, typesBounds, screenshots: [screenFile, pricingFile, typesFile] });
            }
        }
    }

    // Empty catalogs and a read-only API failure are verified as separate safe fixtures.
    // Initial loading copy is inside a closed dialog until the existing async loader
    // resolves, so it is not a user-visible state and is intentionally not asserted.
    const stateChecks = [];
    for (const state of ['empty', 'error']) {
        catalogMode = state;
        for (const width of [320, 1440]) {
            for (const theme of THEMES) {
                for (const locale of LOCALES) {
                    await page.setViewportSize({ width, height: width <= 390 ? 844 : 960 });
                    await page.evaluate(({ mode, language }) => {
                        window.TopGymTheme?.set?.(mode);
                        window.TopGymI18n?.set?.(language, { persist: false });
                    }, { mode: theme, language: locale });
                    // Re-navigate to make the fixture response authoritative even when
                    // the app has already cached a successful catalog in this session.
                    await page.goto(`/index.html?membershipVisual=${state}-${width}-${locale}-${theme}#management`, { waitUntil: 'networkidle' });
                    // addInitScript resets storage to the baseline locale/theme on each
                    // document navigation; set the intended QA state after navigation.
                    await page.evaluate(({ mode, language }) => {
                        window.TopGymTheme?.set?.(mode);
                        window.TopGymI18n?.set?.(language, { persist: false });
                    }, { mode: theme, language: locale });
                    await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
                    await expect(page.locator('#managementSection')).toBeVisible();
                    if (state === 'empty') {
                        await page.locator('#managementSection [data-open-dialog-button="pricingButton"]').click();
                        await expect(page.locator('#pricingTableContainer .empty')).toBeVisible();
                        // An empty catalog is rendered by the canonical membership
                        // dialog empty state (there is no source table for the
                        // responsive-card enhancer to transform in this state).
                        await expect(page.locator('#pricingTableContainer .empty')).toHaveText(locale === 'en' ? 'No pricing plans are available.' : 'لا توجد باقات أسعار متاحة.');
                        await page.locator('#pricingDialog').screenshot({ path: path.join(OUTPUT_DIR, `pricing-empty-${width}-${locale}-${theme}.png`), animations: 'disabled' });
                        await page.keyboard.press('Escape');
                        await page.locator('#managementSection [data-open-dialog-button="membershipTypesButton"]').click();
                        await expect(page.locator('#membershipTypesTableContainer .pricing-cards-empty')).toBeVisible();
                        await expect(page.locator('#membershipTypesTableContainer .pricing-cards-empty')).toHaveText(locale === 'en' ? 'No membership types are available.' : 'لا توجد أنواع عضويات.');
                        await page.locator('#membershipTypesDialog').screenshot({ path: path.join(OUTPUT_DIR, `types-empty-${width}-${locale}-${theme}.png`), animations: 'disabled' });
                        await page.keyboard.press('Escape');
                    } else {
                        await page.locator('#managementSection [data-open-dialog-button="pricingButton"]').click();
                        const toast = page.locator('#toast');
                        await expect(toast).toHaveClass(/show/);
                        await expect(toast).toContainText(locale === 'en' ? 'Could not load membership pricing. Please try again.' : 'تعذر تحميل أسعار العضويات. حاول مرة أخرى.');
                        await expect(page.locator('#pricingDialog')).toBeHidden();
                        await toast.screenshot({ path: path.join(OUTPUT_DIR, `pricing-error-${width}-${locale}-${theme}.png`), animations: 'disabled' });
                    }
                    stateChecks.push({ state, width, locale, theme });
                }
            }
        }
    }

    expect(writes, 'visual QA fixtures must prevent all API writes').toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(matrix).toHaveLength(VIEWPORTS.length * THEMES.length * LOCALES.length);
    await fs.writeFile(path.join(OUTPUT_DIR, 'matrix.json'), JSON.stringify({
        cases: matrix.length,
        matrix,
        stateChecks,
        stateCoverage: { empty: 8, error: 8, loading: 'not user-visible: dialog remains closed while existing catalog request is pending' },
        writes,
        pageErrors
    }, null, 2));
});
