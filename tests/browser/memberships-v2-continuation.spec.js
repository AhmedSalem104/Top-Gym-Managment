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

test('memberships pricing workspaces preserve controls and remain contained across themes and viewports', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The test owns its complete internal responsive theme matrix.');
    const plan = planCatalog.PLAN_CONFIGURATIONS.find((item) => item.code === 'business');
    const typeMap = {
        monthly: { label: 'شهري', mode: 'months', durationValue: 1, priceMultiplier: 1, active: true, sortOrder: 1 },
        quarterly: { label: 'ربع سنوي', mode: 'months', durationValue: 3, priceMultiplier: 2.7, active: true, sortOrder: 2 },
        annual: { label: 'سنوي', mode: 'months', durationValue: 12, priceMultiplier: 9, active: true, sortOrder: 3 }
    };
    const pricing = {
        plans: {
            gym_only: { label: 'جيم فقط', monthlyPrice: 350, active: true, sortOrder: 1 },
            gym_cardio: { label: 'جيم وكارديو', monthlyPrice: 575, active: true, sortOrder: 2 }
        },
        types: typeMap,
        prices: {
            gym_only: { monthly: 350, quarterly: 945, annual: 3150 },
            gym_cardio: { monthly: 575, quarterly: 1552.5, annual: 5175 }
        }
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
        if (pathname === '/api/saas/entitlements') return json(route, {
            tenantStatus: 'active',
            subscription: { status: 'active', plan: { code: plan.code, name: plan.name } },
            entitlements: { tenantType: 'gym', features: planCatalog.featureFlagsForPlan(plan.code), featureCatalog: featureCatalog.getFeatureCatalog({ tenantType: 'gym' }) }
        });
        if (pathname === '/api/branches/bootstrap') return json(route, { branches: [], activeBranches: [], sections: [], defaultBranch: null });
        if (pathname === '/api/pricing') return json(route, pricing);
        if (pathname === '/api/members') return json(route, { members: [], pagination: { page: 1, pageSize: 5, totalItems: 0, totalPages: 0 } });
        return json(route, {});
    });

    for (const width of VIEWPORTS) {
        await page.setViewportSize({ width, height: width < 400 ? 844 : 900 });
        await page.goto('/index.html#management', { waitUntil: 'networkidle' });
        await expect(page.locator('#managementSection')).toBeVisible();

        const section = page.locator('#managementSection');
        await expect(section.locator('.management-tab-header h3')).toHaveText('الأسعار والعضويات');
        expect(await section.locator('.management-shortcuts').evaluate((element) => getComputedStyle(element, '::before').content)).toBe('none');
        await expect(section.locator('[data-open-dialog-button="pricingButton"]')).toBeVisible();
        await expect(section.locator('[data-open-dialog-button="membershipTypesButton"]')).toBeVisible();
        await expect(section.locator('[data-owner-only]')).toHaveCount(2);
        const pageContainment = await page.evaluate(() => ({
            viewportWidth: innerWidth,
            documentWidth: document.documentElement.scrollWidth,
            bodyWidth: document.body.scrollWidth
        }));
        expect(pageContainment.documentWidth, `membership management page overflow at ${width}px`).toBeLessThanOrEqual(width);
        expect(pageContainment.bodyWidth, `membership body overflow at ${width}px`).toBeLessThanOrEqual(width);

        await section.locator('[data-open-dialog-button="pricingButton"]').click();
        const pricingDialog = page.locator('#pricingDialog');
        await expect(pricingDialog).toBeVisible();
        await expect(pricingDialog.locator('#pricingTableContainer tr[data-plan="gym_only"]')).toHaveCount(1);
        await expect(pricingDialog.locator('#pricingTableContainer tr[data-plan="gym_only"] [data-field="monthlyPrice"]')).toHaveValue('350.00');
        await expect(pricingDialog.locator('#pricingTableContainer tr[data-plan="gym_only"] [data-field="typePrice"][data-type-code="annual"]')).toHaveValue('3150.00');
        await expect(pricingDialog.locator('#pricingSave')).toBeVisible();
        const pricingClose = pricingDialog.locator(':scope > .dialog-close-button[data-dialog-close-generated]');
        await expect(pricingClose).toBeVisible();
        await pricingClose.click();
        await expect(pricingDialog).toBeHidden();

        await section.locator('[data-open-dialog-button="membershipTypesButton"]').click();
        const typesDialog = page.locator('#membershipTypesDialog');
        await expect(typesDialog).toBeVisible();
        await expect(typesDialog.locator('#membershipTypesTableContainer')).toContainText('شهري');
        await expect(typesDialog.locator('#membershipTypesTableContainer [data-type-action="edit"][data-code="monthly"]:visible')).toHaveCount(1);
        await expect(typesDialog.locator('#addMembershipTypeButton')).toBeVisible();
        const dialogBounds = await typesDialog.evaluate((dialog) => {
            const rect = dialog.getBoundingClientRect();
            return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, viewportWidth: innerWidth, viewportHeight: innerHeight };
        });
        expect(dialogBounds.left).toBeGreaterThanOrEqual(-1);
        expect(dialogBounds.right).toBeLessThanOrEqual(dialogBounds.viewportWidth + 1);
        expect(dialogBounds.top).toBeGreaterThanOrEqual(-1);
        expect(dialogBounds.bottom).toBeLessThanOrEqual(dialogBounds.viewportHeight + 1);

        await typesDialog.locator(':scope > .dialog-close-button[data-dialog-close-generated]').click();
        await expect(typesDialog).toBeHidden();

        for (const theme of THEMES) {
            await page.evaluate((value) => window.TopGymTheme.set(value), theme);
            await section.screenshot({ path: `${OUTPUT_DIR}/management-${width}-${theme}.png` });
            await section.locator('[data-open-dialog-button="pricingButton"]').click();
            await expect(pricingDialog).toBeVisible();
            const pricingBounds = await pricingDialog.evaluate((dialog) => {
                const rect = dialog.getBoundingClientRect();
                return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, viewportWidth: innerWidth, viewportHeight: innerHeight };
            });
            expect(pricingBounds.left).toBeGreaterThanOrEqual(-1);
            expect(pricingBounds.right).toBeLessThanOrEqual(pricingBounds.viewportWidth + 1);
            expect(pricingBounds.top).toBeGreaterThanOrEqual(-1);
            expect(pricingBounds.bottom).toBeLessThanOrEqual(pricingBounds.viewportHeight + 1);
            await pricingDialog.screenshot({ path: `${OUTPUT_DIR}/pricing-${width}-${theme}.png` });
            await pricingDialog.evaluate((dialog) => dialog.close());

            await section.locator('[data-open-dialog-button="membershipTypesButton"]').click();
            await expect(typesDialog).toBeVisible();
            await expect(typesDialog.locator('#membershipTypesTableContainer [data-type-action="edit"][data-code="monthly"]:visible')).toHaveCount(1);
            await typesDialog.screenshot({ path: `${OUTPUT_DIR}/membership-types-${width}-${theme}.png` });
            await typesDialog.evaluate((dialog) => dialog.close());
        }
    }

    expect(writes, 'read-only fixture must not allow API writes').toEqual([]);
    expect(testInfo.project.name).toBeTruthy();
});
