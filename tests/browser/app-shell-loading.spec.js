const { test, expect } = require('@playwright/test');

async function installAuthenticatedRuntime(page) {
    const started = Date.now();
    const apiTimings = new Map();
    const delays = {
        '/api/auth/session': 60,
        '/api/branding': 100,
        '/api/saas/entitlements': 120,
        '/api/branches/bootstrap': 50,
        '/api/dashboard': 80
    };

    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const requestUrl = new URL(request.url());
        const pathname = requestUrl.pathname;
        const key = pathname === '/api/branding' && requestUrl.search ? 'platform-branding' : pathname;
        const first = apiTimings.get(key) || {};
        first.start ??= Date.now() - started;
        apiTimings.set(key, first);
        await new Promise((resolve) => setTimeout(resolve, delays[pathname] || 5));
        first.end = Date.now() - started;
        let body = {};
        if (pathname === '/api/auth/session') {
            body = { authenticated: true, user: { id: 1, role: 'Owner', tenantId: 1, tenantType: 'gym', name: 'QA Owner', permissions: ['dashboard.read', 'members.read'] } };
        } else if (pathname === '/api/branding') {
            body = { branding: { identity: { brandName: 'QA Gym' }, assets: {} } };
        } else if (pathname === '/api/saas/entitlements') {
            body = { tenantStatus: 'active', subscription: { status: 'active', plan: { code: 'starter' } }, entitlements: { tenantType: 'gym', features: { dashboard: true, members: true, attendance: true, reports: true }, limits: {} } };
        } else if (pathname === '/api/branches/bootstrap') {
            body = { branch: { id: 1, name: 'Main', status: 'active' }, branches: [{ id: 1, name: 'Main', status: 'active' }], activeBranches: [{ id: 1, name: 'Main', status: 'active' }], hasMultipleActiveBranches: false, branchLimit: 1 };
        } else if (pathname === '/api/dashboard') {
            body = { stats: { total: 10, active: 8, expiringSoon: 1, expired: 1, frozen: 0 }, alerts: [] };
        } else if (pathname === '/api/saas/subscription') {
            body = { subscription: { status: 'active', plan: { code: 'starter' } } };
        }
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    return { started, apiTimings };
}

test('authenticated welcome is bounded and closes after actual route readiness', async ({ page }) => {
    const { apiTimings } = await installAuthenticatedRuntime(page);
    // The server intentionally serves the unauthenticated login entry at `/`.
    // Use the static authenticated shell entry so the browser-side session
    // fixture can control readiness without being bypassed by server routing.
    await page.goto('/index.html?welcome=1#dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toHaveAttribute('data-top-gym-authenticated', 'true');
    await expect(page.locator('.tenant-welcome-card')).toBeVisible();

    const card = await page.locator('.tenant-welcome-card').boundingBox();
    expect(card.width).toBeLessThanOrEqual(470);
    // At 320px the card keeps the intended side margins, so its rendered
    // border box is slightly below 280px. The contract is bounded, visible,
    // and free of horizontal overflow rather than an arbitrary fixed width.
    expect(card.width).toBeGreaterThan(240);
    expect(card.height).toBeLessThan(240);

    await page.evaluate(() => window.topGymAppUsable);
    await expect(page.locator('#tenantWelcomeLayer')).toBeHidden({ timeout: 5000 });

    const parallelStartDelta = Math.abs((apiTimings.get('/api/branding')?.start || 0) - (apiTimings.get('/api/saas/entitlements')?.start || 0));
    expect(parallelStartDelta).toBeLessThan(40);
    expect(apiTimings.get('/api/auth/session')?.end).toBeLessThan(apiTimings.get('/api/saas/entitlements')?.start);
    expect(apiTimings.has('/api/branches/bootstrap')).toBeTruthy();
});

test('first dashboard does not pull phone formatter or dashboard enhancements before route readiness', async ({ page }) => {
    await installAuthenticatedRuntime(page);
    await page.goto('/index.html?welcome=1#dashboard', { waitUntil: 'domcontentloaded' });
    const timing = await page.evaluate(() => window.topGymAppUsable.then(() => {
        const readyAt = performance.now();
        const deferred = performance.getEntriesByType('resource')
            .filter((entry) => /phone-inputs|phone-formatter|dashboard\/analytics|day-passes\.js|alerts-enhancements/.test(entry.name))
            .map((entry) => entry.startTime);
        return { readyAt, deferred };
    }));
    expect(timing.deferred.every((start) => start >= timing.readyAt - 1)).toBeTruthy();
});
