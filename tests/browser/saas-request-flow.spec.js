const { test, expect } = require('@playwright/test');

const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);

function requestRow(id = 74) {
    return { id, createdAt: '2026-09-28T10:00:00.000Z', status: 'pending', amount: 599, currency: 'EGP', plan: { id: 12, name: 'Basic' }, proof: { id: 88, mimeType: 'image/png', fileName: 'proof.png' } };
}

function billing(requests = []) {
    const plan = {
        id: 12, code: 'basic', name: 'Basic', description: 'QA plan', price: 599, currency: 'EGP', billingPeriod: 'monthly',
        isActive: true, availableForNewSubscriptions: true, compatibleTenantTypes: ['gym'], maxMembers: 500, maxUsers: 5,
        maxBranches: 2, maxStorageMb: 5120, maxAiGenerations: 200, features: { dashboard: true, members: true },
        terms: [{ code: 'monthly', durationMonths: 1, price: 599, currency: 'EGP', isActive: true }]
    };
    return {
        tenant: { id: 101, name: 'QA Gym', slug: 'qa-gym', tenantType: 'gym', status: 'active' },
        subscription: { status: 'active', expiresAt: '2027-09-01T00:00:00.000Z', plan },
        plans: [plan], featureCatalog: [{ key: 'members', description: 'Members', tenantTypes: ['gym'], limitKeys: [], screens: [], apiPaths: [] }],
        usage: { members: 1, users: 1, branches: 1, storageBytes: 0 },
        requests, requestsPagination: { page: 1, pages: 1, total: requests.length }
    };
}

async function openBilling(page, onSubmit, initialRequests = []) {
    let requests = initialRequests;
    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;
        if (pathname === '/api/auth/session') return route.fulfill({ json: { authenticated: true, user: { id: 9, name: 'QA Owner', role: 'Owner', tenantType: 'gym', permissions: [] } } });
        if (pathname === '/api/branding') return route.fulfill({ json: { identity: { brandName: 'Logic Fit' } } });
        if (pathname === '/api/bootstrap') return route.fulfill({ json: { branches: [], sections: [], defaultBranch: null } });
        if (pathname === '/api/saas/subscription') return route.fulfill({ json: billing(requests) });
        if (pathname === '/api/saas/entitlements') {
            const data = billing(requests);
            return route.fulfill({ json: {
                tenantStatus: data.tenant.status,
                subscription: data.subscription,
                entitlements: { tenantType: data.tenant.tenantType, features: data.subscription.plan.features, featureCatalog: data.featureCatalog }
            } });
        }
        if (pathname === '/api/saas/subscription-requests/submit' && request.method() === 'POST') {
            const result = await onSubmit(route, request);
            if (result) requests = [result];
            return;
        }
        return route.fulfill({ json: {} });
    });
    await page.goto('/index.html#saas-billing', { waitUntil: 'domcontentloaded' });
    await page.evaluate(async () => { if (window.topGymAuthReady) await window.topGymAuthReady; });
    if (await page.evaluate(() => window.matchMedia('(max-width: 767px)').matches)) {
        const mobileNavToggle = page.locator('#mobileNavToggle');
        await expect(mobileNavToggle).toBeVisible();
        await mobileNavToggle.click();
        await expect(page.locator('.app-shell')).toHaveClass(/mobile-nav-open/);
    }
    await page.locator('[data-page-tab="saas-billing"]').click();
    await expect(page.locator('#saasPlansList [data-saas-plan-card]')).toHaveCount(1);
    await page.locator('.saas-request-open').click();
    await page.locator('#saasPlanSelect').selectOption('12');
    await page.locator('#saasPaymentProof').setInputFiles({ name: 'proof.png', mimeType: 'image/png', buffer: PNG });
    return page;
}

test('subscription submit is single-flight, visibly pending, cannot close, then refreshes history on success', async ({ page }) => {
    let release;
    let submitCount = 0;
    const pendingResponse = new Promise((resolve) => { release = resolve; });
    await openBilling(page, async (route) => {
        submitCount += 1;
        await pendingResponse;
        await route.fulfill({ status: 201, json: { request: requestRow() } });
        return requestRow();
    });

    const dialog = page.locator('.saas-request-dialog');
    const form = page.locator('#saasSubscriptionForm');
    const button = page.locator('#saasSubscriptionSubmit');
    await button.click();
    await expect(button).toBeDisabled();
    await expect(button.locator('.loading-spinner')).toBeVisible();
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    await page.evaluate(() => document.querySelector('#saasSubscriptionForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(submitCount).toBe(1);
    release();
    await expect(dialog).toBeHidden();
    await expect(page.locator('#saasRequestsList [data-saas-payment-proof]')).toHaveCount(1);
    await expect(button).toBeEnabled();
    await expect(page.locator('#saasPaymentProof')).toHaveValue('');
});

test('failed subscription submit keeps dialog and entered form state and restores submit control', async ({ page }) => {
    await openBilling(page, async (route) => {
        await route.fulfill({ status: 503, json: { error: 'تعذر إتمام الطلب.', code: 'TEMPORARY_FAILURE' } });
        return null;
    });
    await page.locator('#saasRequestNotes').fill('keep this note');
    await page.locator('#saasSubscriptionSubmit').click();
    await expect(page.locator('.saas-request-dialog')).toBeVisible();
    await expect(page.locator('#saasRequestNotes')).toHaveValue('keep this note');
    await expect(page.locator('#saasPaymentProof')).not.toHaveValue('');
    await expect(page.locator('#saasSubscriptionSubmit')).toBeEnabled();
    await expect(page.locator('#saasSubscriptionSubmit')).not.toHaveAttribute('aria-busy');
});

test('payment proof preview opens actual image bytes through the authenticated API client, not JSON metadata', async ({ page }) => {
    await openBilling(page, async () => null, [requestRow()]);
    await page.route('**/api/saas/payment-proofs/88/file', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
    await page.keyboard.press('Escape');
    const popupPromise = page.waitForEvent('popup');
    await page.locator('[data-saas-payment-proof]').click();
    const popup = await popupPromise;
    await expect.poll(() => popup.url()).toMatch(/^blob:/);
});
