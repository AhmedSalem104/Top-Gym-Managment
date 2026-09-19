const { test, expect } = require('@playwright/test');
const planCatalog = require('../../src/services/saas-plan-catalog');
const featureCatalog = require('../../src/services/feature-catalog');

function json(route, payload, status = 200) {
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) });
}

test('membership types exposes delete action and removes an unused custom type after confirmation', async ({ page }) => {
    let types = {
        monthly: { label: 'شهرية', mode: 'months', durationValue: 1, priceMultiplier: 1, active: true, sortOrder: 1 },
        custom_weekly: { label: 'أسبوعية', mode: 'days', durationValue: 7, priceMultiplier: 0.25, active: true, sortOrder: 9 }
    };
    const plan = planCatalog.PLAN_CONFIGURATIONS.find((item) => item.code === 'starter');
    const features = planCatalog.featureFlagsForPlan('starter');
    const catalog = () => ({
        plans: { gym_only: { label: 'جيم فقط', monthlyPrice: 305, active: true, sortOrder: 1 } },
        types,
        prices: { gym_only: { monthly: 305, custom_weekly: 76.25 } }
    });

    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;
        if (pathname === '/api/auth/session') return json(route, { authenticated: true, user: { id: 301, name: 'QA Owner', role: 'Owner', tenantType: 'gym', permissions: [] } });
        if (pathname === '/api/branding') return json(route, { identity: { brandName: 'QA Gym' } });
        if (pathname === '/api/saas/entitlements') return json(route, {
            tenantStatus: 'active',
            subscription: { status: 'active', plan: { code: plan.code, name: plan.name } },
            entitlements: { tenantType: 'gym', features, featureCatalog: featureCatalog.getFeatureCatalog({ tenantType: 'gym' }) }
        });
        if (pathname === '/api/branches/bootstrap') return json(route, { branches: [], activeBranches: [], sections: [], defaultBranch: null });
        if (pathname === '/api/pricing' && request.method() === 'GET') return json(route, catalog());
        if (pathname === '/api/members' && request.method() === 'GET') return json(route, { members: [], pagination: { page: 1, pageSize: 5, total: 0, totalPages: 0 } });
        if (pathname === '/api/membership-types/custom_weekly' && request.method() === 'DELETE') {
            delete types.custom_weekly;
            return json(route, catalog());
        }
        return json(route, {});
    });

    await page.goto('/#management', { waitUntil: 'networkidle' });
    await expect(page.locator('#managementSection')).toBeVisible();
    await page.locator('[data-open-dialog-button="membershipTypesButton"]').click();

    await expect(page.locator('.membership-type-card [data-type-action="delete"][data-code="custom_weekly"]')).toBeVisible();
    await page.locator('.membership-type-card [data-type-action="delete"][data-code="custom_weekly"]').click();
    await expect(page.locator('.swal2-popup')).toBeVisible();
    await page.locator('.swal2-confirm').click();

    await expect(page.locator('.membership-type-card [data-type-action="delete"][data-code="custom_weekly"]')).toHaveCount(0);
    await expect(page.locator('#membershipTypesTableContainer')).not.toContainText('أسبوعية');
});
