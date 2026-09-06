const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');

const trainerHtml = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'trainer-workspace.html'), 'utf8');

function installTrainerRuntime(page) {
    const requests = [];
    const user = { id: 901, name: 'مدرب الاختبار', role: 'Owner', tenantType: 'independent_trainer', mustChangePassword: false };
    const clients = [{ id: 1, fullName: 'عميل الاختبار', phone: '01000000000', primaryGoal: 'قوة', status: 'active', workoutCount: 1, nutritionCount: 1, measurementCount: 2, checkinCount: 1 }];
    return {
        requests,
        async install() {
            await page.route('**/trainer-workspace*', async (route) => {
                if (route.request().resourceType() === 'document') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: trainerHtml });
                return route.continue();
            });
            await page.route('**/api/**', async (route) => {
                const request = route.request();
                const url = new URL(request.url());
                const pathname = url.pathname;
                requests.push({ method: request.method(), pathname });
                const body = (payload) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
                if (pathname === '/api/auth/session') return body({ authenticated: true, user });
                if (pathname === '/api/trainer/workspace') return body({ metrics: { activeClients: 1, sessionsToday: 2, upcomingSessions: 4, packagesExpiring: 1, outstandingPayments: 850, clientsNeedingFollowUp: 1, recentMeasurements: 2, recentCheckins: 1 } });
                if (pathname === '/api/saas/subscription') return body({ tenant: { name: 'مساحة اختبار المدرب' }, subscription: { status: 'active', plan: { name: 'Trainer' } } });
                if (pathname === '/api/trainer/clients') return body({ clients, pagination: { page: 1, totalPages: 1, total: clients.length } });
                if (pathname === '/api/trainer/sessions') return body({ sessions: [{ id: 10, clientName: 'عميل الاختبار', scheduledStart: '2099-01-01T09:00:00Z', scheduledEnd: '2099-01-01T10:00:00Z', status: 'scheduled' }] });
                if (pathname === '/api/trainer/packages') return body({ packages: [] });
                if (pathname === '/api/trainer/package-purchases') return body({ purchases: [] });
                if (pathname === '/api/trainer/payments') return body({ payments: [] });
                if (pathname === '/api/trainer/follow-up') return body({ clients: [{ clientId: 1, clientName: clients[0].fullName, reasons: ['checkin_due'], outstandingBalance: 250 }] });
                if (pathname === '/api/trainer/goals') return body({ goals: [] });
                if (pathname === '/api/trainer/notifications') return body({ notifications: [{ id: 'n-1', kind: 'session', severity: 'info', title: 'جلسة قادمة', clientId: 1, clientName: clients[0].fullName, occurredAt: '2099-01-01T09:00:00Z', action: { route: 'sessions', label: 'فتح الجلسات' } }, { id: 'n-2', kind: 'follow_up', severity: 'warning', title: 'متابعة مستحقة', clientId: 1, clientName: clients[0].fullName, occurredAt: '2099-01-01T08:00:00Z', action: { route: 'clients', label: 'فتح ملف العميل' } }], counts: { total: 2, warning: 1, info: 1 } });
                if (pathname === '/api/trainer/tasks') return body({ tasks: [{ id: 1, taskType: 'follow_up', title: 'Ù…ØªØ§Ø¨Ø¹Ø© Ø§Ù„Ø¹Ù…ÙŠÙ„', clientName: clients[0].fullName, memberId: 1, status: 'open', dueOn: '2099-01-02' }] });
                if (pathname === '/api/trainer/templates') return body({ templates: [] });
                if (pathname === '/api/trainer/reports/summary') return body({ summary: {} });
                if (pathname === '/api/trainer/training-plans') return body({ plans: [] });
                if (pathname === '/api/trainer/nutrition-plans') return body({ plans: [] });
                if (pathname === '/api/coaching/catalog') return body({ exercises: [{ id: 1, nameAr: 'سكوات', bodyPart: 'أرجل' }], foods: [{ id: 1, nameAr: 'شوفان' }] });
                return body({});
            });
        }
    };
}

async function assertNoOverflow(page) {
    const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
    expect(dimensions.document, JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.viewport + 1);
    expect(dimensions.body, JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.viewport + 1);
}

async function clickStudioRoute(page, route) {
    if (page.viewportSize().width <= 860) await page.locator('#trainerStudioMenuButton').click();
    await page.locator(`[data-studio-route="${route}"]`).click();
}

test('Trainer Studio V2 renders a separate shell and navigates supported routes', async ({ page }, testInfo) => {
    const runtime = installTrainerRuntime(page);
    await runtime.install();
    await page.goto('/trainer-workspace/dashboard', { waitUntil: 'networkidle' });

    await expect(page.locator('[data-workspace="independent-trainer"]')).toBeVisible();
    if (page.viewportSize().width > 860) await expect(page.locator('#trainerStudioSidebar')).toBeVisible();
    else await expect(page.locator('#trainerStudioSidebar')).toBeAttached();
    await expect(page.locator('[data-studio-route="dashboard"]')).toHaveClass(/is-active/);
    await expect(page.locator('#trainerMetricClients')).toHaveText('1');
    await expect(page.locator('[data-page-tab]')).toHaveCount(0);
    await expect(page.locator('[data-studio-route="branches"]')).toHaveCount(0);
    expect(runtime.requests.some(({ pathname }) => /\/api\/(dashboard|branches|attendance|day-passes|monthly-finance|dashboard-analytics)/.test(pathname))).toBe(false);

    await clickStudioRoute(page, 'clients');
    await expect(page).toHaveURL(/\/trainer-workspace\/clients$/);
    await expect(page.locator('#trainerClients')).toBeVisible();
    await clickStudioRoute(page, 'training');
    await expect(page).toHaveURL(/\/trainer-workspace\/training$/);
    await expect(page.locator('#trainerStudioDynamicView')).toBeVisible();
    await expect(page.locator('[data-studio-open-editor]')).toBeVisible();
    await page.locator('[data-studio-open-editor]').click();
    await expect(page.locator('#trainerStudioPlanForm')).toBeVisible();
    await assertNoOverflow(page);
    await page.screenshot({ path: testInfo.outputPath('trainer-studio-v2-routes.png'), fullPage: true });
});

test('Trainer Studio V2 remains usable on mobile and supports theme switching', async ({ page }, testInfo) => {
    const runtime = installTrainerRuntime(page);
    await runtime.install();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/trainer-workspace/dashboard', { waitUntil: 'networkidle' });
    await assertNoOverflow(page);
    await expect(page.locator('#trainerStudioMenuButton')).toBeVisible();
    await page.locator('#trainerStudioMenuButton').click();
    await expect(page.locator('body')).toHaveClass(/trainer-sidebar-open/);
    await page.locator('#trainerStudioSidebarClose').click();
    await expect(page.locator('body')).not.toHaveClass(/trainer-sidebar-open/);
    await page.locator('[data-theme-toggle]').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await assertNoOverflow(page);
    await page.screenshot({ path: testInfo.outputPath('trainer-studio-v2-mobile-dark.png'), fullPage: true });
});

test('every exposed Trainer Studio route resolves to a supported surface', async ({ page }) => {
    const runtime = installTrainerRuntime(page);
    await runtime.install();
    await page.goto('/trainer-workspace/dashboard', { waitUntil: 'networkidle' });
    const routes = ['dashboard', 'clients', 'calendar', 'sessions', 'training', 'nutrition', 'exercises', 'measurements', 'progress', 'checkins', 'goals', 'packages', 'sales', 'renewals', 'finance', 'reports', 'notifications', 'tasks', 'portal', 'templates', 'settings'];
    for (const route of routes) {
        await clickStudioRoute(page, route);
        await expect(page.locator('body')).toHaveAttribute('data-trainer-route', route);
        if (route === 'dashboard' || route === 'clients' || route === 'packages' || route === 'sales' || route === 'reports') {
            await expect(page.locator(`[data-studio-surface="${route}"]:visible`).first()).toBeVisible();
        } else {
            await expect(page.locator('#trainerStudioDynamicView')).toBeVisible();
            await expect(page.locator('#trainerStudioDynamicView')).not.toContainText('تعذر تحميل هذه المساحة');
        }
        if (route === 'checkins') {
            await page.locator('[data-studio-open-client="1"]').click();
            await expect(page).toHaveURL(/\/trainer-workspace\/clients$/);
            await page.locator('#trainerClientDetailsClose').click();
        }
        if (route === 'goals') {
            await page.locator('[data-studio-open-goal-editor]').click();
            await expect(page.locator('[data-studio-goal-form]')).toBeVisible();
            await page.locator('[data-studio-cancel-goal-editor]').click();
        }
        if (route === 'templates') {
            await page.locator('[data-studio-open-template-editor]').click();
            await expect(page.locator('[data-studio-template-form]')).toBeVisible();
            await page.locator('[data-studio-cancel-template-editor]').click();
        }
        if (route === 'notifications') await expect(page.locator('.trainer-studio-notification-row')).toHaveCount(2);
    }
    const routeNames = await page.locator('[data-studio-route]').evaluateAll((links) => links.map((link) => link.dataset.studioRoute));
    expect(routeNames).not.toContain('branches');
    expect(runtime.requests.some(({ pathname }) => /\/api\/(dashboard|branches|attendance|day-passes|monthly-finance|dashboard-analytics|members)(?:\/|$)/.test(pathname))).toBe(false);
});
