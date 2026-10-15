'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');

const trainerHtml = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'trainer-workspace.html'), 'utf8');
const routes = [
    'dashboard', 'clients', 'calendar', 'sessions', 'training', 'nutrition', 'exercises', 'muscles', 'foods',
    'measurements', 'progress', 'checkins', 'goals', 'packages', 'sales', 'renewals', 'finance', 'reports',
    'portal', 'notifications', 'tasks', 'templates', 'settings'
];
const widths = [320, 375, 390, 768, 1024, 1440, 1920];
const locales = ['ar', 'en'];
const themes = ['light', 'dark'];
const selectedRoutes = process.env.TRAINER_MATRIX_ROUTES ? process.env.TRAINER_MATRIX_ROUTES.split(',').map((route) => route.trim()).filter((route) => routes.includes(route)) : routes;
const selectedWidths = process.env.TRAINER_MATRIX_WIDTHS ? process.env.TRAINER_MATRIX_WIDTHS.split(',').map(Number).filter((width) => widths.includes(width)) : widths;
const matrixLabel = (process.env.TRAINER_MATRIX_LABEL || '').replace(/[^a-z0-9-]/giu, '');
const output = path.resolve(process.cwd(), `qa/artifacts/trainer-studio-v2-screen-closure${matrixLabel ? `-${matrixLabel}` : ''}`);

async function installReadOnlyRuntime(page) {
    const requests = [];
    const writes = [];
    const features = ['clients', 'coaching', 'nutrition', 'library', 'assessments', 'progress', 'goals', 'sessions', 'packages', 'payments', 'reports', 'portal', 'notifications', 'tasks', 'templates'];
    const client = { id: 7801, fullName: 'Trainer QA Client', phone: '01000007801', status: 'active', primaryGoal: 'Strength', workoutCount: 1, nutritionCount: 1, measurementCount: 1, checkinCount: 1 };
    const respond = (route, payload) => route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(payload) });

    await page.addInitScript(() => {
        localStorage.setItem('logic-fit-ui-locale', 'ar');
        localStorage.setItem('topgym-theme', 'light');
    });

    page.on('pageerror', (error) => { page.__trainerPageErrors ||= []; page.__trainerPageErrors.push(error.message); });
    await page.route('**/trainer-workspace/**', async (route) => {
        if (route.request().resourceType() === 'document') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: trainerHtml });
        return route.continue();
    });
    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        requests.push({ method: request.method(), path: url.pathname });
        if (!['GET', 'HEAD'].includes(request.method())) {
            writes.push({ method: request.method(), path: url.pathname });
            return route.fulfill({ status: 405, contentType: 'application/json', body: '{"error":"read_only_screen_closure"}' });
        }
        const pathname = url.pathname;
        let payload = {};
        if (pathname === '/api/auth/session') payload = { authenticated: true, user: { id: 7780, name: 'Trainer QA', role: 'Owner', tenantType: 'independent_trainer', mustChangePassword: false } };
        else if (pathname === '/api/saas/entitlements') payload = { tenantStatus: 'active', subscription: { status: 'active', plan: { code: 'basic', name: 'QA Plan' } }, entitlements: { tenantType: 'independent_trainer', features: Object.fromEntries(features.map((key) => [key, true])), featureCatalog: features.map((key) => ({ key, tenantTypes: ['independent_trainer'] })) } };
        else if (pathname === '/api/saas/subscription') payload = { tenant: { name: 'Trainer QA Workspace' }, subscription: { status: 'active', plan: { name: 'QA Plan', durationDays: 30, price: 500 } } };
        else if (pathname === '/api/trainer/workspace') payload = { metrics: { activeClients: 3, sessionsToday: 2, upcomingSessions: 4, packagesExpiring: 1, outstandingPayments: 850, clientsNeedingFollowUp: 1, recentMeasurements: 2, recentCheckins: 1 } };
        else if (pathname === '/api/trainer/clients') payload = { clients: [client], pagination: { page: 1, totalPages: 1, total: 1 } };
        else if (pathname === '/api/trainer/sessions') payload = { sessions: [{ id: 7802, clientName: client.fullName, scheduledStart: '2099-01-01T09:00:00Z', scheduledEnd: '2099-01-01T10:00:00Z', status: 'scheduled' }] };
        else if (pathname === '/api/trainer/packages') payload = { packages: [{ id: 7803, name: 'QA Training Package', price: 300, status: 'active', sessionCount: 4, serviceMode: 'online' }] };
        else if (pathname === '/api/trainer/package-purchases') payload = { purchases: [{ id: 7804, packageName: 'QA Training Package', clientName: client.fullName, amountPaid: 200, amountDue: 300, amountRemaining: 100, startsOn: '2099-01-01', status: 'active' }] };
        else if (pathname === '/api/trainer/payments') payload = { payments: [{ id: 7805, clientName: client.fullName, amount: 25, method: 'cash', paidAt: '2099-01-01' }] };
        else if (pathname === '/api/trainer/follow-up') payload = { clients: [{ clientId: client.id, clientName: client.fullName, reasons: ['checkin_due'], outstandingBalance: 25 }] };
        else if (pathname === '/api/trainer/goals') payload = { goals: process.env.TRAINER_GOALS_EMPTY === '1' ? [] : [{ id: 7806, clientName: client.fullName, title: 'QA Goal', goalType: 'strength', status: 'active', currentValue: 2, targetValue: 5 }] };
        else if (pathname === '/api/trainer/notifications') payload = { notifications: [{ id: 'trainer-qa-notice', kind: 'session', severity: 'info', title: 'QA Session Reminder', clientId: client.id, clientName: client.fullName, occurredAt: '2099-01-01T09:00:00Z', action: { route: 'sessions', label: 'Open session' } }], counts: { total: 1, info: 1, warning: 0 } };
        else if (pathname === '/api/trainer/tasks') payload = { tasks: [{ id: 7807, taskType: 'follow_up', title: 'QA follow-up', clientName: client.fullName, memberId: client.id, status: 'open', dueOn: '2099-01-02' }] };
        else if (pathname === '/api/trainer/templates') payload = { templates: [{ id: 7808, templateType: 'training', name: 'QA Plan Template', description: 'Fixture description', status: 'active' }] };
        else if (pathname === '/api/trainer/reports/summary') payload = { summary: { sessions: 1, clients: 1, collections: 25 } };
        else if (pathname === '/api/trainer/training-plans') payload = { plans: [{ id: 7809, name: 'QA Strength Plan', clientName: client.fullName, status: 'active', goal: 'Strength' }] };
        else if (pathname === '/api/trainer/nutrition-plans') payload = { plans: [{ id: 7810, name: 'QA Nutrition Plan', clientName: client.fullName, status: 'active', goal: 'Maintain' }] };
        else if (pathname === '/api/coaching/catalog') payload = { exercises: [{ id: 7811, name: 'QA Exercise', nameAr: 'QA Exercise', bodyPart: 'Upper body' }], foods: [{ id: 7812, name: 'QA Food', nameAr: 'QA Food', calories: 380, protein: 13, carbs: 68, fat: 7, servingSize: 100, servingUnit: 'g' }] };
        else if (pathname.startsWith('/api/trainer/library/')) payload = { items: [], exercises: [], foods: [], muscles: [], counts: { exercises: 0, foods: 0, muscles: 0 }, filters: {}, pagination: { page: 1, totalPages: 1, totalItems: 0 } };
        else if (pathname === '/api/branches/bootstrap' || pathname === '/api/bootstrap') payload = { branches: [], activeBranches: [], sections: [], defaultBranch: null, canUseAllBranches: true };
        return respond(route, payload);
    });
    return { requests, writes };
}

async function setLocale(page, locale) {
    const current = await page.evaluate(() => window.TopGymI18n.get());
    if (current !== locale) await page.locator('#languageToggleButton').click();
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
    await expect(page.locator('#trainerStudioDynamicView .trainer-studio-loading')).toHaveCount(0);
    const route = await page.locator('body').getAttribute('data-trainer-route');
    await waitForScreenReady(page, route);
}

async function setTheme(page, theme) {
    const current = await page.locator('html').getAttribute('data-theme');
    if (current !== theme) await page.locator('.trainer-studio-topbar [data-theme-toggle]').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

async function settleResponsiveTransition(page) {
    await page.locator('#trainerStudioSidebar').evaluate(async (sidebar) => {
        const transitions = sidebar.getAnimations({ subtree: false });
        if (transitions.length) await Promise.all(transitions.map((transition) => transition.finished.catch(() => {})));
    });
}

async function navigate(page, route, width) {
    if (width <= 900 && !(await page.locator('body').evaluate((body) => body.classList.contains('trainer-sidebar-open')))) {
        await page.locator('#trainerStudioMenuButton').click();
    }
    await page.locator(`[data-studio-route="${route}"]`).evaluate((link) => link.click());
    await expect(page.locator('body')).toHaveAttribute('data-trainer-route', route);
    await expect(page.locator(`[data-studio-route="${route}"]`)).toHaveClass(/is-active/);
    await expect(page.locator('#trainerStudioRouteTitle')).toBeVisible();
}

async function waitForScreenReady(page, route) {
    const staticReadySelectors = {
        clients: '#trainerClientsList [data-client-id], #trainerClientsList .trainer-empty-state',
        packages: '#trainerPackagesList .trainer-compact-row, #trainerPackagesList .trainer-empty-state',
        sales: '#trainerPurchasesList .trainer-compact-row, #trainerPurchasesList .trainer-empty-state'
    };
    if (staticReadySelectors[route]) {
        await expect(page.locator(staticReadySelectors[route]).first(), `${route} data must finish loading before visual capture`).toBeVisible();
        return;
    }
    if (route === 'dashboard') {
        await expect(page.locator('#trainerMetricClients')).not.toHaveText('—');
        await expect(page.locator('#trainerSessionsList .trainer-compact-row, #trainerSessionsList .trainer-empty-state').first()).toBeVisible();
        await expect(page.locator('#trainerPackagesList .trainer-compact-row, #trainerPackagesList .trainer-empty-state').first()).toBeAttached();
        await expect(page.locator('#trainerPurchasesList .trainer-compact-row, #trainerPurchasesList .trainer-empty-state').first()).toBeAttached();
        return;
    }
    if (route === 'reports') {
        await expect(page.locator('#trainerReportRevenue')).not.toHaveText('—');
        return;
    }
    await expect(page.locator('#trainerStudioDynamicView .trainer-studio-loading, #trainerStudioDynamicView .trainer-library-loading')).toHaveCount(0);
    await expect(page.locator('#trainerStudioDynamicView .trainer-studio-data-panel-head, #trainerStudioDynamicView .trainer-studio-error, #trainerStudioDynamicView .trainer-studio-feature-access, #trainerStudioDynamicView .trainer-library-page, #trainerStudioDynamicView .trainer-studio-settings-grid').first(), `${route} must render settled content before visual capture`).toBeVisible();
}

async function inspectRenderedState(page, width, route, locale, theme) {
    const state = await page.evaluate(() => {
        const visible = (element) => {
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
        };
        const arabicChrome = [];
        const visibleTextNodes = [];
        const selectorFor = (element) => `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}${typeof element.className === 'string' && element.className.trim() ? `.${element.className.trim().split(/\s+/u).join('.')}` : ''}`;
        const textWalker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        while (textWalker.nextNode()) {
            const node = textWalker.currentNode;
            const parent = node.parentElement;
            if (!parent || parent.closest('#languageToggleButton,[aria-hidden="true"],[data-i18n-preserve]')) continue;
            const visibilityTarget = parent.tagName === 'OPTION' ? parent.closest('select') : parent;
            if (!visibilityTarget || !visible(visibilityTarget)) continue;
            const text = node.nodeValue.replace(/\s+/gu, ' ').trim();
            if (!text) continue;
            const entry = { selector: selectorFor(parent), text };
            visibleTextNodes.push(entry);
            if (/[\u0600-\u06ff]/u.test(text)) arabicChrome.push(entry);
        }
        [...document.querySelectorAll('[placeholder],[aria-label]')]
            .filter((element) => visible(element) && !element.closest('#languageToggleButton,[data-i18n-preserve]'))
            .forEach((element) => ['placeholder', 'aria-label'].forEach((attribute) => {
                const text = (element.getAttribute(attribute) || '').replace(/\s+/gu, ' ').trim();
                if (!text) return;
                const entry = { selector: `${selectorFor(element)}[${attribute}]`, text };
                visibleTextNodes.push(entry);
                if (/[\u0600-\u06ff]/u.test(text)) arabicChrome.push(entry);
            }));
        const overflowElements = [...document.body.querySelectorAll('*')]
            .filter(visible)
            .map((element) => {
                const rect = element.getBoundingClientRect();
                return { tag: element.tagName, id: element.id, className: typeof element.className === 'string' ? element.className : '', left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width), text: (element.innerText || '').trim().slice(0, 72) };
            })
            .filter((element) => element.right > document.documentElement.clientWidth + 1 || element.left < -1)
            .sort((a, b) => (b.right - document.documentElement.clientWidth) - (a.right - document.documentElement.clientWidth))
            .slice(0, 8);
        return {
            viewport: document.documentElement.clientWidth,
            documentWidth: document.documentElement.scrollWidth,
            bodyWidth: document.body.scrollWidth,
            shellWidth: document.querySelector('.trainer-workspace-shell')?.getBoundingClientRect().width || 0,
            overflowElements,
            route: document.body.dataset.trainerRoute,
            activeRoute: document.querySelector('.trainer-studio-nav-link.is-active')?.dataset.studioRoute || '',
            title: document.querySelector('#trainerStudioRouteTitle')?.textContent.trim() || '',
            routeEyebrow: document.querySelector('#trainerStudioRouteEyebrow')?.textContent.trim() || '',
            duplicateRouteHeadingCount: [...document.querySelectorAll('.trainer-studio-data-panel-head')].filter((head) => {
                const heading = head.querySelector('h2')?.textContent.replace(/\s+/gu, ' ').trim();
                const kicker = head.querySelector('.trainer-panel-kicker')?.textContent.replace(/\s+/gu, ' ').trim();
                return heading === document.querySelector('#trainerStudioRouteTitle')?.textContent.replace(/\s+/gu, ' ').trim()
                    || kicker === document.querySelector('#trainerStudioRouteEyebrow')?.textContent.replace(/\s+/gu, ' ').trim();
            }).length,
            visibleTextNodes,
            englishArabicTextNodes: visibleTextNodes.filter((entry) => /[\u0600-\u06ff]/u.test(entry.text)),
            arabicChrome,
            missingCentralKeys: [...new Set([...document.querySelectorAll('[data-i18n]')].map((element) => element.dataset.i18n).filter((key) => key && window.TopGymI18n.t(key) === key))],
            pageErrors: window.__trainerPageErrors || []
        };
    });
    expect(state.route, `${route} ${width} ${locale} ${theme}`).toBe(route);
    expect(state.activeRoute, `${route} navigation active state`).toBe(route);
    expect(state.title, `${route} title is present`).not.toBe('');
    expect(state.duplicateRouteHeadingCount, `${route} must not repeat its route kicker/title in the panel heading`).toBe(0);
    if (locale === 'en') {
        expect(state.englishArabicTextNodes, `${route} has Arabic in visible English UI text nodes: ${JSON.stringify(state.englishArabicTextNodes)}`).toEqual([]);
    }
    expect(state.documentWidth, `${route}: document overflow at ${width}px ${JSON.stringify(state.overflowElements)}`).toBeLessThanOrEqual(width + 1);
    expect(state.bodyWidth, `${route}: body overflow at ${width}px`).toBeLessThanOrEqual(width + 1);
    expect(state.shellWidth, `${route}: shell wider than viewport at ${width}px`).toBeLessThanOrEqual(width + 1);
    expect(state.missingCentralKeys, `${route} used missing central translation keys`).toEqual([]);
    expect(state.pageErrors, `${route} generated browser errors`).toEqual([]);
    if (route === 'clients') {
        const labels = await page.evaluate(() => ({
            training: window.TopGymI18n.t('trainerWorkspaceScreen.stat.training'),
            nutrition: window.TopGymI18n.t('trainerWorkspaceScreen.stat.nutrition'),
            measurements: window.TopGymI18n.t('trainerWorkspaceScreen.stat.measurements'),
            open: window.TopGymI18n.t('trainerWorkspaceScreen.action.open'),
            edit: window.TopGymI18n.t('trainerWorkspaceScreen.action.edit'),
            clientCount: window.TopGymI18n.t('trainerWorkspaceScreen.state.clientCountSingular', { count: 1 })
        }));
        const clientRow = page.locator('#trainerClientsList [data-client-id="7801"]');
        for (const [index, key] of ['training', 'nutrition', 'measurements'].entries()) {
            await expect(clientRow.locator('.trainer-client-stat').nth(index).locator('[data-i18n]')).toHaveText(labels[key]);
        }
        await expect(clientRow.locator('[data-client-action="details"] [data-i18n]')).toHaveText(labels.open);
        await expect(clientRow.locator('[data-client-action="edit"] [data-i18n]')).toHaveText(labels.edit);
        await expect(page.locator('#trainerClientsMessage')).toHaveText(labels.clientCount);
    }
    if (route === 'goals') {
        if (process.env.TRAINER_GOALS_EMPTY === '1') {
            const expectedTitle = await page.evaluate(() => window.TopGymI18n.t('trainerStudioV2.ui.goals.emptyTitle'));
            await expect(page.locator('.trainer-studio-empty strong')).toHaveText(expectedTitle);
            await expect(page.locator('.trainer-studio-empty p')).toHaveText(await page.evaluate(() => window.TopGymI18n.t('trainerStudioV2.ui.goals.emptyDescription')));
        } else {
            await expect(page.locator('.trainer-studio-data-row strong').filter({ hasText: 'QA Goal' })).toBeVisible();
            await expect(page.locator('[data-studio-goal-id="7806"]')).toBeVisible();
        }
    }
    return state;
}

test('Trainer Studio screen closure: every route, viewport, locale and theme', async ({ page }) => {
    test.setTimeout(900_000);
    fs.mkdirSync(output, { recursive: true });
    const runtime = await installReadOnlyRuntime(page);
    const matrix = [];
    const screenshotIndex = [];
    const translationGaps = [];
    await page.setViewportSize({ width: 390, height: 844 });
    const initialResponse = await page.goto('/trainer-workspace/dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.trainer-studio-topbar'), JSON.stringify({ url: page.url(), status: initialResponse?.status(), requests: runtime.requests, body: await page.locator('body').innerText().catch(() => '') })).toBeVisible();
    await expect(page.locator('#trainerStudioSidebar')).toBeAttached();
    await expect(page.locator('#trainerQuickActionsTitle')).toBeVisible();

    for (let routeIndex = 0; routeIndex < selectedRoutes.length; routeIndex += 1) {
        const route = selectedRoutes[routeIndex];
        for (let widthIndex = 0; widthIndex < selectedWidths.length; widthIndex += 1) {
            const width = selectedWidths[widthIndex];
            await page.setViewportSize({ width, height: width <= 390 ? 844 : 960 });
            await settleResponsiveTransition(page);
            await navigate(page, route, width);
            await waitForScreenReady(page, route);
            await settleResponsiveTransition(page);
            const screenshotVariant = (routeIndex + widthIndex) % 4;
            for (let themeIndex = 0; themeIndex < themes.length; themeIndex += 1) {
                const theme = themes[themeIndex];
                await setTheme(page, theme);
                for (let localeIndex = 0; localeIndex < locales.length; localeIndex += 1) {
                    const locale = locales[localeIndex];
                    await setLocale(page, locale);
                    await settleResponsiveTransition(page);
                    const state = await inspectRenderedState(page, width, route, locale, theme);
                    if (locale === 'en' && state.arabicChrome.length) {
                        translationGaps.push(...state.arabicChrome.map((entry) => ({ route, width, theme, ...entry })));
                    }
                    const isScreenshotState = route === 'dashboard' || route === 'goals' || (themeIndex * 2 + localeIndex) === screenshotVariant;
                    let screenshot = null;
                    if (isScreenshotState) {
                        screenshot = `${route}-${width}-${theme}-${locale}.png`;
                        await page.screenshot({ path: path.join(output, screenshot), fullPage: true, animations: 'disabled' });
                        screenshotIndex.push(screenshot);
                    }
                    matrix.push({ route, width, theme, locale, direction: locale === 'ar' ? 'rtl' : 'ltr', status: locale === 'en' && state.arabicChrome.length ? 'TRANSLATION_GAP' : 'PASS', screenshot, state });
                }
            }
        }
    }

    expect(matrix).toHaveLength(selectedRoutes.length * selectedWidths.length * themes.length * locales.length);
    expect(runtime.writes, 'Visual/read-only screen closure must not write to any API').toEqual([]);
    fs.writeFileSync(path.join(output, 'screen-closure-matrix.json'), JSON.stringify({ routes: selectedRoutes, widths: selectedWidths, themes, locales, cases: matrix, screenshots: screenshotIndex, translationGaps, apiWrites: runtime.writes, readRequestCount: runtime.requests.length }, null, 2));
    expect(translationGaps, 'English mode must not expose Arabic in any visible text node, placeholder or accessible label').toEqual([]);
});
