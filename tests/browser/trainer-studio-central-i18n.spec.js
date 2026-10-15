const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');

const trainerHtml = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'trainer-workspace.html'), 'utf8');
const artifactRoot = path.join(__dirname, '..', '..', 'qa', 'artifacts', 'trainer-studio-central-i18n');
const routes = [
    'dashboard', 'clients', 'calendar', 'sessions', 'training', 'nutrition', 'exercises', 'muscles', 'foods',
    'measurements', 'progress', 'checkins', 'goals', 'packages', 'sales', 'renewals', 'finance', 'reports',
    'portal', 'notifications', 'tasks', 'templates', 'settings'
];
const routeTitles = {
    dashboard: 'Dashboard', clients: 'Clients', calendar: 'Calendar', sessions: 'Sessions', training: 'Training plans',
    nutrition: 'Nutrition plans', exercises: 'Exercise library', muscles: 'Muscles', foods: 'Food library',
    measurements: 'Measurements', progress: 'Progress', checkins: 'Check-ins', goals: 'Goals', packages: 'Packages',
    sales: 'Sales and collections', renewals: 'Renewals', finance: 'Finance', reports: 'Reports', portal: 'Client portal',
    notifications: 'Notifications', tasks: 'Tasks', templates: 'Templates', settings: 'Settings'
};
const viewports = [
    // Exercise every Studio route at mobile and desktop extremes without
    // repeating hundreds of equivalent intermediate-width screenshots.
    { width: 320, height: 740 }, { width: 1440, height: 900 }
];
const themes = ['light', 'dark'];
const locales = ['ar', 'en'];

function installReadOnlyRuntime(page) {
    const requests = [];
    const writes = [];
    const client = {
        id: 71, fullName: 'Provider Client Sentinel', phone: '01000000071', status: 'active',
        primaryGoal: 'Provider Goal Sentinel', workoutCount: 1, nutritionCount: 1, measurementCount: 1, checkinCount: 1
    };
    const body = (route, payload) => route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(payload) });
    return {
        requests,
        writes,
        async install() {
            await page.route('**/trainer-workspace/**', async (route) => {
                if (route.request().resourceType() === 'document') {
                    return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: trainerHtml });
                }
                return route.continue();
            });
            await page.route('**/api/**', async (route) => {
                const request = route.request();
                const url = new URL(request.url());
                const pathname = url.pathname;
                requests.push({ method: request.method(), pathname, search: url.search });
                if (request.method() !== 'GET' && request.method() !== 'HEAD') {
                    writes.push({ method: request.method(), pathname });
                    return route.fulfill({ status: 405, contentType: 'application/json', body: JSON.stringify({ error: 'Read-only localization fixture' }) });
                }
                if (pathname === '/api/auth/session') return body(route, { authenticated: true, user: { id: 901, name: 'Trainer Fixture', role: 'Owner', tenantType: 'independent_trainer', mustChangePassword: false } });
                if (pathname === '/api/saas/entitlements') {
                    const featureNames = ['clients', 'coaching', 'nutrition', 'library', 'assessments', 'progress', 'goals', 'sessions', 'packages', 'payments', 'reports', 'portal', 'notifications', 'tasks', 'templates'];
                    return body(route, { tenantStatus: 'active', subscription: { status: 'active', plan: { code: 'basic', name: 'Provider Plan Label' } }, entitlements: { tenantType: 'independent_trainer', features: Object.fromEntries(featureNames.map((key) => [key, true])), featureCatalog: featureNames.map((key) => ({ key, tenantTypes: ['independent_trainer'] })) } });
                }
                if (pathname === '/api/saas/subscription') return body(route, { tenant: { name: 'Tenant Data Sentinel' }, subscription: { status: 'active', plan: { name: 'Provider Plan Sentinel', durationDays: 30, price: 500 } } });
                if (pathname === '/api/trainer/workspace') return body(route, { metrics: { activeClients: 1, sessionsToday: 1, upcomingSessions: 1, packagesExpiring: 0, outstandingPayments: 25, clientsNeedingFollowUp: 1, recentMeasurements: 1, recentCheckins: 1 } });
                if (pathname === '/api/trainer/clients') return body(route, { clients: [client], pagination: { page: 1, totalPages: 1, total: 1 } });
                if (pathname === '/api/trainer/sessions') return body(route, { sessions: [{ id: 810, clientName: 'Provider Client Sentinel', scheduledStart: '2099-01-01T09:00:00Z', scheduledEnd: '2099-01-01T10:00:00Z', status: 'scheduled' }] });
                if (pathname === '/api/trainer/packages') return body(route, { packages: [{ id: 21, name: 'Provider Package Sentinel', price: 300, status: 'active', sessionCount: 4, serviceMode: 'online' }] });
                if (pathname === '/api/trainer/package-purchases') return body(route, { purchases: [{ id: 22, packageName: 'Provider Package Sentinel', clientName: 'Provider Client Sentinel', amountPaid: 200, amountDue: 300, amountRemaining: 100, startsOn: '2099-01-01', status: 'active' }] });
                if (pathname === '/api/trainer/payments') return body(route, { payments: [{ id: 23, clientName: 'Provider Client Sentinel', amount: 25, method: 'cash', paidAt: '2099-01-01' }] });
                if (pathname === '/api/trainer/follow-up') return body(route, { clients: [{ clientId: client.id, clientName: client.fullName, reasons: ['checkin_due'], outstandingBalance: 25 }] });
                if (pathname === '/api/trainer/goals') return body(route, { goals: [{ id: 24, clientName: client.fullName, title: 'Provider Goal Sentinel', status: 'active', currentValue: 2, targetValue: 5 }] });
                if (pathname === '/api/trainer/notifications') return body(route, { notifications: [{ id: 'fixture-notice', kind: 'session', severity: 'info', title: 'Provider Notification Sentinel', clientId: client.id, clientName: client.fullName, occurredAt: '2099-01-01T09:00:00Z', action: { route: 'sessions', label: 'Provider Action Sentinel' } }], counts: { total: 1, info: 1, warning: 0 } });
                if (pathname === '/api/trainer/tasks') return body(route, { tasks: [{ id: 25, taskType: 'follow_up', title: 'Provider Task Sentinel', clientName: client.fullName, memberId: client.id, status: 'open', dueOn: '2099-01-02' }] });
                if (pathname === '/api/trainer/templates') return body(route, { templates: [{ id: 26, templateType: 'training', name: 'Provider Template Sentinel', description: 'Provider Template Description Sentinel', status: 'active' }] });
                if (pathname === '/api/trainer/reports/summary') return body(route, { summary: { sessions: 1, clients: 1, collections: 25 } });
                if (pathname === '/api/trainer/training-plans') return body(route, { plans: [{ id: 27, name: 'Provider Plan Sentinel', clientName: client.fullName, status: 'active', goal: 'Provider Goal Sentinel' }] });
                if (pathname === '/api/trainer/nutrition-plans') return body(route, { plans: [{ id: 28, name: 'Provider Nutrition Sentinel', clientName: client.fullName, status: 'active', goal: 'Provider Goal Sentinel' }] });
                if (pathname === '/api/coaching/catalog') return body(route, { exercises: [{ id: 31, nameAr: 'Provider Exercise Sentinel', bodyPart: 'Provider Body Part Sentinel' }], foods: [{ id: 32, nameAr: 'Provider Food Sentinel' }] });
                if (pathname === '/api/trainer/library/options') return body(route, { counts: { exercises: 1, foods: 1, muscles: 1 }, filters: {} });
                if (pathname === '/api/trainer/library/exercises') return body(route, { items: [{ id: 31, nameAr: 'Provider Exercise Sentinel', name: 'Provider Exercise Sentinel', targetMuscleNameAr: 'Provider Muscle Sentinel', bodyPart: 'Provider Body Part Sentinel', equipment: 'Provider Equipment Sentinel', difficulty: 'Provider Difficulty Sentinel' }], pagination: { page: 1, totalPages: 1, totalItems: 1 } });
                if (pathname === '/api/trainer/library/muscles') return body(route, { items: [{ id: 33, nameAr: 'Provider Muscle Sentinel', name: 'Provider Muscle Sentinel', bodyPart: 'Provider Body Part Sentinel', descriptionAr: 'Provider Muscle Description Sentinel' }], pagination: { page: 1, totalPages: 1, totalItems: 1 } });
                if (pathname === '/api/trainer/library/foods') return body(route, { items: [{ id: 32, nameAr: 'Provider Food Sentinel', nameEn: 'Provider Food Sentinel', calories: 380, protein: 13, carbs: 68, fat: 7, servingSize: 100, servingUnit: 'g', category: 'grains' }], pagination: { page: 1, totalPages: 1, totalItems: 1 } });
                if (pathname === '/api/trainer/library/catalog') return body(route, { options: { counts: { exercises: 1, foods: 1, muscles: 1 } }, exercises: [{ id: 31, nameAr: 'Provider Exercise Sentinel', targetMuscleNameAr: 'Provider Muscle Sentinel', bodyPart: 'Provider Body Part Sentinel' }], foods: [{ id: 32, nameAr: 'Provider Food Sentinel', calories: 380, protein: 13, servingSize: 100, servingUnit: 'g' }], muscles: [{ id: 33, nameAr: 'Provider Muscle Sentinel', bodyPart: 'Provider Body Part Sentinel' }] });
                return body(route, {});
            });
        }
    };
}

async function setLocale(page, locale) {
    const current = await page.evaluate(() => window.TopGymI18n?.get());
    if (current !== locale) await page.locator('#languageToggleButton').click();
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
}

async function setTheme(page, theme) {
    const current = await page.locator('html').getAttribute('data-theme');
    if (current !== theme) await page.locator('.trainer-studio-topbar [data-theme-toggle]').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

async function expectLocalizedRouteTitle(page, route) {
    const expected = await page.evaluate((key) => window.TopGymI18n?.t(key), `trainerStudioV2.route.${route}`);
    expect(expected, `Missing central route translation: trainerStudioV2.route.${route}`).toBeTruthy();
    await expect(page.locator('#trainerStudioRouteTitle')).toHaveText(expected);
}

async function expectLocalizedStaticSurface(page, route, locale) {
    const checks = {
        clients: [
            ['#trainerClientsTitle', 'trainerWorkspaceScreen.clients.title', 'text'],
            ['#trainerClients .trainer-panel-header p', 'trainerWorkspaceScreen.clients.description', 'text'],
            ['#trainerClientSearch', 'trainerWorkspaceScreen.clients.searchPlaceholder', 'placeholder'],
            ['#trainerRefreshClients', 'trainerWorkspaceScreen.action.refresh', 'text']
        ],
        packages: [['#trainerPackagesTitle', 'trainerWorkspaceScreen.packages.title', 'text']],
        sales: [['#trainerPurchasesTitle', 'trainerWorkspaceScreen.purchases.title', 'text']],
        reports: [['#trainerReportsTitle', 'trainerWorkspaceScreen.reports.title', 'text']]
    }[route] || [];

    for (const [selector, key, kind] of checks) {
        const expected = await page.evaluate(({ key: translationKey }) => window.TopGymI18n?.t(translationKey), { key });
        expect(expected, `${locale} catalog entry missing: ${key}`).toBeTruthy();
        if (kind === 'placeholder') await expect(page.locator(selector)).toHaveAttribute('placeholder', expected);
        else await expect(page.locator(selector)).toHaveText(expected);
    }
}

async function expectLocalizedDynamicLabels(page, route, locale) {
    if (route !== 'notifications') return;
    const key = 'trainerStudioV2.ui.dataSource';
    const expected = await page.evaluate((translationKey) => window.TopGymI18n?.t(translationKey), key);
    expect(expected, `${locale} catalog entry missing: ${key}`).toBeTruthy();
    await expect(page.locator('#trainerStudioDynamicView .trainer-studio-data-panel-head .trainer-panel-kicker')).toHaveText(expected);
}

async function navigateRoute(page, route) {
    if (page.viewportSize().width <= 860) await page.locator('#trainerStudioMenuButton').click();
    await page.locator(`[data-studio-route="${route}"]`).click();
    await expect(page.locator('body')).toHaveAttribute('data-trainer-route', route);
    const surface = page.locator(`[data-studio-surface="${route}"]:visible, #trainerStudioDynamicView:visible`).first();
    await expect(surface).toBeVisible();
    if (!['dashboard', 'clients', 'packages', 'sales', 'reports'].includes(route)) {
        await expect(page.locator('#trainerStudioDynamicView .trainer-studio-loading, #trainerStudioDynamicView .trainer-library-loading')).toHaveCount(0);
    }
    await expectLocalizedRouteTitle(page, route);
}

test('Trainer Studio route titles and locale switching preserve read-only route state', async ({ page }) => {
    test.setTimeout(240_000);
    fs.mkdirSync(artifactRoot, { recursive: true });
    const runtime = installReadOnlyRuntime(page);
    const localizedRequestCount = () => runtime.requests.filter(({ pathname }) => pathname !== '/api/notifications/stream').length;
    await runtime.install();
    const matrix = [];
    const visualIssues = [];

    for (const viewport of viewports) {
        const routeSweep = viewport.width === 320 ? routes : ['dashboard', 'clients', 'sessions', 'renewals', 'settings'];
        for (const theme of themes) {
            await page.setViewportSize(viewport);
            await page.goto('/trainer-workspace/dashboard', { waitUntil: 'domcontentloaded' });
            await expect(page.locator('#trainerStudioRouteTitle')).toBeVisible();
            await setTheme(page, theme);
            await setLocale(page, 'ar');
            for (const route of routeSweep) {
                if (route !== 'dashboard') await navigateRoute(page, route);
                await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
                if (route === 'dashboard' || ['clients', 'packages', 'sales', 'reports'].includes(route)) {
                    await expect(page.locator('#trainerStudioDynamicView')).toBeHidden();
                } else {
                    await expect(page.locator('#trainerStudioDynamicView')).toBeVisible();
                }
                await expectLocalizedRouteTitle(page, route);
                await expectLocalizedStaticSurface(page, route, 'ar');
                await expectLocalizedDynamicLabels(page, route, 'ar');
                if (route === 'clients') {
                    await page.locator('#trainerClientsList').evaluate((list) => {
                        const sample = document.createElement('span');
                        sample.dataset.qaProviderData = 'true';
                        sample.textContent = 'اسم عميل عربي محفوظ';
                        list.append(sample);
                    });
                }

                const beforeSwitch = localizedRequestCount();
                await page.locator('#languageToggleButton').click();
                await expect(page.locator('html')).toHaveAttribute('lang', 'en');
                await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
                expect(localizedRequestCount(), `locale switch triggered a data request on ${route}`).toBe(beforeSwitch);
                await expectLocalizedRouteTitle(page, route);
                await expectLocalizedStaticSurface(page, route, 'en');
                await expectLocalizedDynamicLabels(page, route, 'en');
                if (route === 'clients') await expect(page.locator('#trainerClientsList [data-qa-provider-data="true"]')).toHaveText('اسم عميل عربي محفوظ');
                const englishDimensions = await page.evaluate(() => {
                    const viewport = document.documentElement.clientWidth;
                    const overflowElements = [...document.body.querySelectorAll('*')].map((element) => {
                        const rect = element.getBoundingClientRect();
                        return { tag: element.tagName, id: element.id, className: typeof element.className === 'string' ? element.className : '', text: (element.textContent || '').trim().slice(0, 48), left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width), scrollWidth: element.scrollWidth };
                    }).filter((element) => element.right > viewport + 1 || element.left < -1).sort((a, b) => b.right - a.right).slice(0, 8);
                    return { viewport, document: document.documentElement.scrollWidth, body: document.body.scrollWidth, overflowElements };
                });
                const englishName = `${route}-${viewport.width}-${theme}-en.png`;
                await page.screenshot({ path: path.join(artifactRoot, englishName), fullPage: false });
                matrix.push({ route, viewport: viewport.width, theme, locale: 'en', direction: 'ltr', status: englishDimensions.document <= englishDimensions.viewport + 1 && englishDimensions.body <= englishDimensions.viewport + 1 ? 'PASS' : 'OVERFLOW', dimensions: englishDimensions, screenshot: englishName, apiRequests: runtime.requests.length });

                await page.locator('#languageToggleButton').click();
                await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
                await expectLocalizedRouteTitle(page, route);
                const dimensions = await page.evaluate(() => {
                    const viewport = document.documentElement.clientWidth;
                    const overflowElements = [...document.body.querySelectorAll('*')].map((element) => {
                        const rect = element.getBoundingClientRect();
                        return { tag: element.tagName, id: element.id, className: typeof element.className === 'string' ? element.className : '', text: (element.textContent || '').trim().slice(0, 48), left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width), scrollWidth: element.scrollWidth };
                    }).filter((element) => element.right > viewport + 1 || element.left < -1).sort((a, b) => b.right - a.right).slice(0, 8);
                    return { viewport, document: document.documentElement.scrollWidth, body: document.body.scrollWidth, overflowElements };
                });
                if (dimensions.document > dimensions.viewport + 1 || dimensions.body > dimensions.viewport + 1 || englishDimensions.document > englishDimensions.viewport + 1 || englishDimensions.body > englishDimensions.viewport + 1) {
                    visualIssues.push({ route, viewport: viewport.width, theme, arabic: dimensions, english: englishDimensions });
                }
                const screenshotName = `${route}-${viewport.width}-${theme}-ar.png`;
                await page.screenshot({ path: path.join(artifactRoot, screenshotName), fullPage: false });
                matrix.push({ route, viewport: viewport.width, theme, locale: 'ar', direction: 'rtl', status: dimensions.document <= dimensions.viewport + 1 && dimensions.body <= dimensions.viewport + 1 ? 'PASS' : 'OVERFLOW', dimensions, screenshot: screenshotName, apiRequests: runtime.requests.length });
            }
        }
    }

    expect(routes).toHaveLength(23);
    expect(runtime.writes, 'The fixture must block all write requests').toEqual([]);
    expect(matrix).toHaveLength((23 + 5) * 2 * 2);
    fs.writeFileSync(path.join(artifactRoot, 'matrix.json'), JSON.stringify({ routes, mobileRouteSweep: routes, desktopRepresentativeRoutes: ['dashboard', 'clients', 'sessions', 'renewals', 'settings'], viewports, themes, locales, cases: matrix, visualIssues, writes: runtime.writes }, null, 2));
    expect(visualIssues, 'Horizontal overflow findings (recorded in matrix.json)').toEqual([]);
});
