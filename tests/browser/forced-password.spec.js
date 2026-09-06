const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');

const changePasswordHtml = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'change-password.html'), 'utf8');
const trainerWorkspaceHtml = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'trainer-workspace.html'), 'utf8');

async function mockPasswordSurfaceDocument(page) {
    await page.route('**/change-password**', async (route) => {
        if (route.request().resourceType() !== 'document') return route.continue();
        return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: changePasswordHtml });
    });
    await page.route('**/trainer-workspace**', async (route) => {
        if (route.request().resourceType() !== 'document') return route.continue();
        return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: trainerWorkspaceHtml });
    });
}

test.beforeEach(async ({ page }) => {
    await mockPasswordSurfaceDocument(page);
});

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

function mockLoginFlow(page, user) {
    let authenticated = false;
    const apiRequests = [];
    return {
        apiRequests,
        install: async () => {
            await page.route('**/api/**', async (route) => {
                const request = route.request();
                const url = new URL(request.url());
                const pathname = url.pathname;
                apiRequests.push({ method: request.method(), pathname });
                if (pathname === '/api/auth/login' && request.method() === 'POST') {
                    authenticated = true;
                    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user, expiresAt: '2099-01-01T00:00:00.000Z' }) });
                }
                if (pathname === '/api/auth/session') {
                    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authenticated, user: authenticated ? user : null }) });
                }
                return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
            });
        }
    };
}

test('real login response routes a forced Independent Trainer before any workspace reload', async ({ page }) => {
    const user = { id: 34, name: 'Ù…Ø¯Ø±Ø¨ Ø§Ù„Ø§Ø®ØªØ¨Ø¨Ø§Ø±', role: 'Owner', tenantType: 'independent_trainer', mustChangePassword: true };
    const mock = mockLoginFlow(page, user);
    await mock.install();
    await page.goto('/', { waitUntil: 'networkidle' });
    await expect(page.locator('#authLoginCard')).toBeVisible();
    await expect(page.locator('.auth-reference-hero')).toBeVisible();
    await page.locator('#loginEmail').fill('trainer@example.test');
    await page.locator('#loginPassword').fill('TemporaryPassword123!');
    await page.locator('#loginForm').evaluate((form) => form.requestSubmit());
    await expect(page).toHaveURL(/\/change-password$/);
    await expect(page.locator('[data-forced-password-surface="true"]')).toBeVisible();
    await expect(page.locator('.app-shell')).toHaveCount(0);
    expect(mock.apiRequests.map(({ pathname }) => pathname).filter((pathname) => pathname.startsWith('/api/auth/'))).toEqual(['/api/auth/session', '/api/auth/login', '/api/auth/session']);
    expect(mock.apiRequests.some(({ pathname }) => /\/api\/(dashboard|members|branches|attendance|day-passes|monthly-finance|dashboard-analytics)/.test(pathname))).toBe(false);
});

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
