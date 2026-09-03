const { test, expect } = require('@playwright/test');

function mockAuth(page, user) {
    let currentUser = { ...user };
    const apiRequests = [];

    return {
        apiRequests,
        install: async () => {
            await page.route('**/api/**', async (route) => {
                const request = route.request();
                const url = new URL(request.url());
                const pathname = url.pathname;
                apiRequests.push({ method: request.method(), pathname });
                if (pathname === '/api/auth/session') {
                    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authenticated: true, user: currentUser }) });
                }
                if (pathname === '/api/auth/change-password' && request.method() === 'POST') {
                    currentUser = { ...currentUser, mustChangePassword: false };
                    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: currentUser }) });
                }
                if (pathname.startsWith('/api/trainer/')) {
                    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ metrics: {}, pagination: {}, clients: [], packages: [], purchases: [], sessions: [], reports: {} }) });
                }
                return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
            });
        }
    };
}

test('forced Trainer password state has no Gym shell or Gym requests, then routes to Trainer workspace', async ({ page }, testInfo) => {
    const mock = mockAuth(page, { id: 34, name: 'مدرب الاختبار', role: 'Owner', tenantType: 'independent_trainer', mustChangePassword: true });
    await mock.install();
    await page.goto('/change-password', { waitUntil: 'networkidle' });

    await expect(page.locator('[data-forced-password-surface="true"]')).toBeVisible();
    await expect(page.locator('.app-shell')).toHaveCount(0);
    await expect(page.locator('#dashboardSection')).toHaveCount(0);
    await expect(page.locator('#forceNewPassword')).toBeFocused();
    await page.screenshot({ path: testInfo.outputPath('forced-password-trainer.png'), fullPage: true });

    await page.locator('#forceNewPassword').fill('SafeLocalPassword123!');
    await page.locator('#forceConfirmPassword').fill('SafeLocalPassword123!');
    await page.locator('#passwordChangeSubmit').click();
    await expect(page).toHaveURL(/\/trainer-workspace$/);
    await expect(page.locator('[data-workspace="independent-trainer"]')).toBeVisible();
    await expect(page.locator('[data-dashboard-version="trainer-v2"]')).toBeVisible();
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page).toHaveURL(/\/trainer-workspace$/);
    await expect(page.locator('[data-dashboard-version="trainer-v2"]')).toBeVisible();

    const gymRequests = mock.apiRequests.filter(({ pathname }) => /\/api\/(dashboard|members|branches|attendance|day-passes|monthly-finance|dashboard-analytics)(?:\/|$)/.test(pathname));
    expect(gymRequests).toEqual([]);
    expect(await page.locator('.app-shell').count()).toBe(0);
});

test('forced Gym password state has no shell behind it, then routes to Gym workspace', async ({ page }, testInfo) => {
    const mock = mockAuth(page, { id: 17, name: 'مالك الاختبار', role: 'Owner', tenantType: 'gym', mustChangePassword: true });
    await mock.install();
    await page.goto('/change-password', { waitUntil: 'networkidle' });

    await expect(page.locator('[data-forced-password-surface="true"]')).toBeVisible();
    await expect(page.locator('.app-shell')).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('forced-password-gym.png'), fullPage: true });
    await page.locator('#forceNewPassword').fill('SafeLocalPassword123!');
    await page.locator('#forceConfirmPassword').fill('SafeLocalPassword123!');
    await page.locator('#passwordChangeSubmit').click();
    await expect(page).toHaveURL(/\/#dashboard$/);
    await expect(page.locator('.app-shell')).toBeAttached();
    await expect(page.locator('#dashboardSection')).toBeAttached();
    await expect(page.locator('[data-forced-password-surface="true"]')).toHaveCount(0);
});
