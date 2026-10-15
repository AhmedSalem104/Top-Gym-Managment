const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');

const trainerHtml = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'trainer-workspace.html'), 'utf8');
const routes = [
    'dashboard', 'clients', 'calendar', 'sessions', 'training', 'nutrition', 'exercises', 'muscles', 'foods',
    'measurements', 'progress', 'goals', 'checkins', 'packages', 'sales', 'renewals', 'finance', 'reports',
    'notifications', 'tasks', 'portal', 'templates', 'settings'
];
const viewports = [320, 360, 390, 430, 768, 1024, 1440, 1920];
const features = ['clients', 'sessions', 'coaching', 'nutrition', 'library', 'assessments', 'progress', 'goals', 'packages', 'payments', 'reports', 'portal', 'notifications', 'tasks', 'templates'];

async function installReadOnlyTrainerRuntime(page) {
    const nonReadRequests = [];
    await page.route('**/trainer-workspace**', async (route) => {
        if (route.request().resourceType() === 'document') {
            return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: trainerHtml });
        }
        return route.continue();
    });
    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;
        if (request.method() !== 'GET') {
            nonReadRequests.push({ method: request.method(), pathname });
            return route.fulfill({ status: 405, contentType: 'application/json', body: JSON.stringify({ error: 'Read-only visual test' }) });
        }

        const payload = pathname === '/api/auth/session'
            ? { user: { id: 901, name: 'مدرب الاختبار', role: 'Owner', tenantType: 'independent_trainer', mustChangePassword: false } }
            : pathname === '/api/saas/entitlements'
                ? { tenantStatus: 'active', subscription: { status: 'active', plan: { code: 'basic', name: 'Basic' } }, entitlements: { tenantType: 'independent_trainer', features: Object.fromEntries(features.map((key) => [key, true])), featureCatalog: features.map((key) => ({ key, tenantTypes: ['independent_trainer'] })) } }
                : pathname === '/api/saas/subscription'
                    ? { tenant: { name: 'مساحة اختبار المدرب' }, subscription: { status: 'active', plan: { name: 'Basic' } } }
                    : pathname === '/api/trainer/workspace'
                        ? { metrics: { activeClients: 1, sessionsToday: 1, upcomingSessions: 1, packagesExpiring: 0, outstandingPayments: 0, clientsNeedingFollowUp: 0, recentMeasurements: 0, recentCheckins: 0 } }
                        : pathname === '/api/trainer/clients'
                            ? { clients: [{ id: 1, fullName: 'عميل اختبار', phone: '01000000000', primaryGoal: 'لياقة', status: 'active' }], pagination: { page: 1, totalPages: 1, total: 1 } }
                            : pathname === '/api/trainer/sessions'
                                ? { sessions: [] }
                                : pathname === '/api/trainer/packages'
                                    ? { packages: [] }
                                    : pathname === '/api/trainer/package-purchases'
                                        ? { purchases: [] }
                                        : pathname === '/api/trainer/payments'
                                            ? { payments: [] }
                                            : pathname === '/api/trainer/follow-up'
                                                ? { clients: [] }
                                                : pathname === '/api/trainer/goals'
                                                    ? { goals: [] }
                                                    : pathname === '/api/trainer/notifications'
                                                        ? { notifications: [], counts: { total: 0, warning: 0, info: 0 } }
                                                        : pathname === '/api/trainer/tasks'
                                                            ? { tasks: [] }
                                                            : pathname === '/api/trainer/templates'
                                                                ? { templates: [] }
                                                                : pathname === '/api/trainer/reports/summary'
                                                                    ? { summary: {} }
                                                                    : pathname === '/api/trainer/training-plans' || pathname === '/api/trainer/nutrition-plans'
                                                                        ? { plans: [] }
                                                                        : pathname.startsWith('/api/trainer/library/')
                                                                            ? { items: [], exercises: [], foods: [], muscles: [], counts: { exercises: 0, foods: 0, muscles: 0 }, filters: {}, pagination: { page: 1, totalPages: 1, totalItems: 0 } }
                                                                            : pathname === '/api/coaching/catalog'
                                                                                ? { exercises: [], foods: [] }
                                                                                : {};
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
    });
    return nonReadRequests;
}

async function setTheme(page, theme) {
    const current = await page.locator('html').getAttribute('data-theme');
    if (current !== theme) await page.locator('[data-theme-toggle]').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

async function setDirection(page, direction) {
    await page.locator('html').evaluate((element, value) => { element.dir = value; }, direction);
}

async function assertNoPageOverflow(page, width) {
    const sizes = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        root: document.documentElement.scrollWidth,
        body: document.body.scrollWidth,
        shell: document.querySelector('.trainer-workspace-shell')?.getBoundingClientRect().width || 0
    }));
    expect(sizes.viewport, JSON.stringify({ width, ...sizes })).toBeLessThanOrEqual(width + 1);
    expect(sizes.root, JSON.stringify({ width, ...sizes })).toBeLessThanOrEqual(width + 1);
    expect(sizes.body, JSON.stringify({ width, ...sizes })).toBeLessThanOrEqual(width + 1);
    expect(sizes.shell, JSON.stringify({ width, ...sizes })).toBeLessThanOrEqual(width + 1);
}

async function navigateToRoute(page, route, width) {
    if (width <= 900) {
        const menu = page.locator('#trainerStudioMenuButton');
        if (!(await page.locator('body').evaluate((element) => element.classList.contains('trainer-sidebar-open')))) await menu.click();
    }
    const routeLink = page.locator(`[data-studio-route="${route}"]`);
    // Some later routes are below the fold in the long sidebar. Activate the
    // real anchor click handler without relying on browser auto-scroll through
    // nested/translated navigation containers; keyboard focus is verified in
    // the dedicated shell test below.
    await routeLink.evaluate((element) => element.click());
    await expect(page.locator('body')).toHaveAttribute('data-trainer-route', route);
    await expect(page.locator(`[data-studio-route="${route}"]`)).toHaveClass(/is-active/);
}

test('Trainer routes remain visually contained across responsive widths and both themes', async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const nonReadRequests = await installReadOnlyTrainerRuntime(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/trainer-workspace/dashboard', { waitUntil: 'networkidle' });
    await expect(page.locator('#trainerStudioSidebar')).toBeAttached();
    await expect(page.locator('.trainer-studio-topbar')).toBeVisible();

    const evidenceDirectory = path.resolve(process.cwd(), 'qa/artifacts/trainer-v2-screen-continuation');
    fs.mkdirSync(evidenceDirectory, { recursive: true });
    for (let index = 0; index < routes.length; index += 1) {
        const route = routes[index];
        const width = viewports[index % viewports.length];
        const theme = index % 2 === 0 ? 'light' : 'dark';
        const direction = index % 3 === 0 ? 'rtl' : 'ltr';
        await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
        await setTheme(page, theme);
        await setDirection(page, direction);
        await navigateToRoute(page, route, width);
        await assertNoPageOverflow(page, width);
        if ([320, 390, 768, 1440, 1920].includes(width)) {
            await page.screenshot({ path: path.join(evidenceDirectory, `${route}-${width}-${theme}-${direction}.png`), fullPage: true });
        }
    }
    expect(nonReadRequests, 'Visual-only route inspection must not issue API mutations').toEqual([]);
});

test('Trainer shell keeps layout and keyboard focus visible at every supported viewport', async ({ page }) => {
    test.setTimeout(120_000);
    const nonReadRequests = await installReadOnlyTrainerRuntime(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/trainer-workspace/dashboard', { waitUntil: 'networkidle' });

    for (const width of viewports) {
        await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
        for (const theme of ['light', 'dark']) {
            await setTheme(page, theme);
            await setDirection(page, 'rtl');
            await assertNoPageOverflow(page, width);
            if (width <= 900) {
                const menu = page.locator('#trainerStudioMenuButton');
                await expect(menu).toBeVisible();
                await menu.click();
                const firstNavigationLink = page.locator('#trainerStudioSidebar [data-studio-route]:visible').first();
                await firstNavigationLink.focus();
                await page.keyboard.press('Tab');
                const focusState = await page.evaluate(() => {
                    const element = document.activeElement;
                    const style = getComputedStyle(element);
                    return { routeLinkFocused: element.matches('.trainer-studio-nav-link:focus-visible'), outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
                });
                expect(focusState.routeLinkFocused).toBe(true);
                expect(focusState.outlineStyle !== 'none' && focusState.outlineWidth !== '0px', JSON.stringify(focusState)).toBe(true);
                await page.locator('#trainerStudioSidebarClose').click();
            } else {
                const firstNavigationLink = page.locator('#trainerStudioSidebar [data-studio-route]:visible').first();
                await firstNavigationLink.focus();
                await page.keyboard.press('Tab');
                const focusState = await page.evaluate(() => {
                    const element = document.activeElement;
                    const style = getComputedStyle(element);
                    return { routeLinkFocused: element.matches('.trainer-studio-nav-link:focus-visible'), outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
                });
                expect(focusState.routeLinkFocused).toBe(true);
                expect(focusState.outlineStyle !== 'none' && focusState.outlineWidth !== '0px', JSON.stringify(focusState)).toBe(true);
            }
        }
    }
    expect(nonReadRequests).toEqual([]);
});
