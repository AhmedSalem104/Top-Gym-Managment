const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const planCatalog = require('../../src/services/saas-plan-catalog');
const featureCatalog = require('../../src/services/feature-catalog');

const OUTPUT_DIR = path.resolve('qa/artifacts/memberships-v2-bounded-visual');
const VIEWPORTS = [320, 390, 768, 1440];
const THEMES = ['light', 'dark'];
const LOCALES = ['ar', 'en'];
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

function json(route, payload) {
    return route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(payload) });
}

test('membership management keeps balanced hierarchy and usable dialogs across viewport, theme and direction', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The test owns its complete internal viewport, theme and direction matrix.');
    const plan = planCatalog.PLAN_CONFIGURATIONS.find((item) => item.code === 'business');
    const writes = [];
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;
        if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
            writes.push({ method: request.method(), pathname });
            return route.fulfill({ status: 405, contentType: 'application/json', body: JSON.stringify({ error: 'Read-only QA fixture' }) });
        }
        if (pathname === '/api/auth/session') return json(route, { authenticated: true, user: { id: 721, name: 'V2 QA Owner', role: 'Owner', tenantType: 'gym', permissions: [] } });
        if (pathname === '/api/branding') return json(route, { identity: { brandName: 'Membership QA Gym' } });
        if (pathname === '/api/saas/entitlements') return json(route, {
            tenantStatus: 'active',
            subscription: { status: 'active', plan: { code: plan.code, name: plan.name } },
            entitlements: { tenantType: 'gym', features: planCatalog.featureFlagsForPlan(plan.code), featureCatalog: featureCatalog.getFeatureCatalog({ tenantType: 'gym' }) }
        });
        if (pathname === '/api/branches/bootstrap') return json(route, { branches: [], activeBranches: [], sections: [], defaultBranch: null });
        if (pathname === '/api/pricing') return json(route, {
            plans: {
                gym_only: { label: 'جيم فقط', monthlyPrice: 350, active: true, sortOrder: 1 },
                gym_cardio: { label: 'جيم وكارديو', monthlyPrice: 575, active: true, sortOrder: 2 }
            },
            types: {
                monthly: { label: 'شهري', mode: 'months', durationValue: 1, priceMultiplier: 1, active: true, sortOrder: 1 },
                annual: { label: 'سنوي', mode: 'months', durationValue: 12, priceMultiplier: 9, active: true, sortOrder: 2 }
            },
            prices: { gym_only: { monthly: 350, annual: 3150 }, gym_cardio: { monthly: 575, annual: 5175 } }
        });
        if (pathname === '/api/members') return json(route, { members: [], pagination: { page: 1, pageSize: 5, totalItems: 0, totalPages: 0 } });
        return json(route, {});
    });

    const matrix = [];
    for (const width of VIEWPORTS) {
        for (const theme of THEMES) {
            for (const locale of LOCALES) {
                await page.setViewportSize({ width, height: width <= 390 ? 844 : 900 });
                await page.goto('/index.html#management', { waitUntil: 'networkidle' });
                await page.evaluate(({ themeValue, localeValue }) => {
                    window.TopGymTheme.set(themeValue);
                    window.TopGymI18n.set(localeValue, { persist: false });
                }, { themeValue: theme, localeValue: locale });

                const section = page.locator('#managementSection');
                const shortcuts = section.locator('.management-shortcuts');
                await expect(section).toBeVisible();
                expect(await page.locator('html').getAttribute('dir')).toBe(locale === 'ar' ? 'rtl' : 'ltr');
                const shortcutPadding = await shortcuts.evaluate((element) => {
                    const style = getComputedStyle(element);
                    return { top: parseFloat(style.paddingTop), bottom: parseFloat(style.paddingBottom) };
                });
                expect(shortcutPadding.top, `unused reserved header space at ${width}px/${theme}/${locale}`).toBe(shortcutPadding.bottom);
                expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
                await section.screenshot({ path: path.join(OUTPUT_DIR, `management-${width}-${theme}-${locale}.png`) });

                for (const [action, dialogId] of [['pricingButton', 'pricingDialog'], ['membershipTypesButton', 'membershipTypesDialog']]) {
                    await section.locator(`[data-open-dialog-button="${action}"]`).click();
                    const dialog = page.locator(`#${dialogId}`);
                    await expect(dialog).toBeVisible();
                    const layout = await dialog.evaluate((element) => {
                        const dialogRect = element.getBoundingClientRect();
                        const close = element.querySelector(':scope > .dialog-close-button');
                        const heading = element.querySelector('.management-dialog-heading h3');
                        const closeRect = close.getBoundingClientRect();
                        const headingRect = heading.getBoundingClientRect();
                        const textRange = document.createRange();
                        textRange.selectNodeContents(heading);
                        const headingTextRects = [...textRange.getClientRects()].map((rect) => ({
                            left: rect.left,
                            right: rect.right,
                            top: rect.top,
                            bottom: rect.bottom
                        }));
                        return {
                            dialog: { left: dialogRect.left, right: dialogRect.right, top: dialogRect.top, bottom: dialogRect.bottom },
                            close: { left: closeRect.left, right: closeRect.right, top: closeRect.top, bottom: closeRect.bottom, width: closeRect.width, height: closeRect.height },
                            heading: { left: headingRect.left, right: headingRect.right, top: headingRect.top, bottom: headingRect.bottom },
                            headingTextRects,
                            overlaps: headingTextRects.some((rect) => closeRect.left < rect.right && closeRect.right > rect.left && closeRect.top < rect.bottom && closeRect.bottom > rect.top)
                        };
                    });
                    expect(layout.dialog.left).toBeGreaterThanOrEqual(-1);
                    expect(layout.dialog.right).toBeLessThanOrEqual(width + 1);
                    expect(layout.close.width).toBeGreaterThanOrEqual(44);
                    expect(layout.close.height).toBeGreaterThanOrEqual(44);
                    expect(layout.overlaps, `${dialogId} close control overlaps its heading at ${width}px/${theme}/${locale}`).toBe(false);
                    await dialog.screenshot({ path: path.join(OUTPUT_DIR, `${dialogId}-${width}-${theme}-${locale}.png`) });
                    matrix.push({ width, theme, locale, dialog: dialogId, ...layout });
                    await dialog.evaluate((element) => element.close());
                }
            }
        }
    }

    fs.writeFileSync(path.join(OUTPUT_DIR, 'matrix.json'), JSON.stringify(matrix, null, 2));
    expect(writes, 'visual QA must not write to APIs').toEqual([]);
    expect(pageErrors, 'page must not emit runtime errors').toEqual([]);
});
