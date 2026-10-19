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

test('membership management keeps balanced hierarchy and usable inline tabs across viewport, theme and direction', async ({ page }, testInfo) => {
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
                await expect(section).toBeVisible();
                expect(await page.locator('html').getAttribute('dir')).toBe(locale === 'ar' ? 'rtl' : 'ltr');
                const pricingTab = section.locator('#managementPricingTab');
                const typesTab = section.locator('#managementTypesTab');
                await expect(pricingTab).toHaveAttribute('role', 'tab');
                await expect(typesTab).toHaveAttribute('role', 'tab');
                for (const tab of [pricingTab, typesTab]) {
                    const tabBounds = await tab.boundingBox();
                    expect(tabBounds?.height, `tab touch target at ${width}px/${theme}/${locale}`).toBeGreaterThanOrEqual(44);
                }
                expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
                await section.screenshot({ path: path.join(OUTPUT_DIR, `management-${width}-${theme}-${locale}.png`) });

                for (const [tab, panelId] of [[pricingTab, 'pricingDialog'], [typesTab, 'membershipTypesDialog']]) {
                    await tab.click();
                    const panel = page.locator(`#${panelId}`);
                    await expect(panel).toBeVisible();
                    const bounds = await panel.evaluate((element) => {
                        const panelRect = element.getBoundingClientRect();
                        const heading = element.querySelector('.management-dialog-heading h3');
                        const headingRect = heading.getBoundingClientRect();
                        return {
                            panel: { left: panelRect.left, right: panelRect.right, width: panelRect.width },
                            heading: { left: headingRect.left, right: headingRect.right },
                            headingInside: headingRect.left >= panelRect.left && headingRect.right <= panelRect.right
                        };
                    });
                    expect(bounds.panel.left).toBeGreaterThanOrEqual(-1);
                    expect(bounds.panel.right).toBeLessThanOrEqual(width + 1);
                    expect(bounds.headingInside, `${panelId} heading clipped at ${width}px/${theme}/${locale}`).toBe(true);
                    await panel.screenshot({ path: path.join(OUTPUT_DIR, `${panelId}-${width}-${theme}-${locale}.png`) });
                    matrix.push({ width, theme, locale, panel: panelId, ...bounds });
                }
            }
        }
    }

    fs.writeFileSync(path.join(OUTPUT_DIR, 'matrix.json'), JSON.stringify(matrix, null, 2));
    expect(writes, 'visual QA must not write to APIs').toEqual([]);
    expect(pageErrors, 'page must not emit runtime errors').toEqual([]);
});
