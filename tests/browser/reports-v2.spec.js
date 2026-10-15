const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const featureCatalog = require('../../src/services/feature-catalog');
const planCatalog = require('../../src/services/saas-plan-catalog');

const BASE_ORIGIN = 'http://127.0.0.1:4173';
const VIEWPORTS = [1440, 1024, 768, 390, 320];
const THEMES = ['light', 'dark'];
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const KNOWN_EXTERNAL_ASSET = 'https://cdn.jsdelivr.net/npm/sweetalert2@11';

function json(route, payload, status = 200) {
    return route.fulfill({
        status,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify(payload)
    });
}

function reportsFixture(period = {}) {
    return {
        period: { from: period.from || '2026-10-01', to: period.to || '2026-10-11' },
        summary: {
            currentMembers: 137,
            newMembers: 23,
            newMemberships: 19,
            collected: 48250,
            paidTransactions: 42,
            expenses: 13750,
            expensesCount: 8,
            net: 34500,
            outstanding: 6200,
            outstandingCount: 6,
            debtorsCount: 6
        },
        timeline: [
            { date: '2026-10-04', newMembers: 7, newMemberships: 5, collected: 12000, expenses: 3400 },
            { date: '2026-10-11', newMembers: 9, newMemberships: 8, collected: 18250, expenses: 2100 }
        ],
        breakdown: {
            plans: [{ key: 'gym_only', value: 81 }, { key: 'gym_cardio', value: 56 }],
            paymentMethods: [{ key: 'cash', amount: 30250, count: 29 }, { key: 'card', amount: 18000, count: 13 }],
            statuses: [{ key: 'active', value: 119 }, { key: 'expiring_soon', value: 12 }, { key: 'expired', value: 6 }]
        },
        members: [{ id: 8701, fullName: 'عضو تجريبي للتقارير', phone: '01012345678', plan: 'gym_only', type: 'monthly', status: 'active', startDate: '2026-10-01', endDate: '2026-10-31', amountDue: 1200, amountPaid: 900, amountRemaining: 300 }],
        memberships: [{ id: 8701, fullName: 'عضو تجريبي للتقارير', phone: '01012345678', plan: 'gym_only', type: 'monthly', status: 'active', startDate: '2026-10-01', endDate: '2026-10-31', amountDue: 1200, amountPaid: 900, amountRemaining: 300 }],
        debtors: [{ id: 8701, fullName: 'عضو تجريبي للتقارير', phone: '01012345678', plan: 'gym_only', amountRemaining: 300 }],
        payments: [{ id: 8702, fullName: 'عضو تجريبي للتقارير', phone: '01012345678', transactionType: 'payment', date: '2026-10-04', paymentMethod: 'cash', amountPaid: 900, amountRemaining: 300 }],
        expenses: [{ id: 8703, name: 'صيانة معدات التدريب', notes: 'مصروف تشغيلي تجريبي', date: '2026-10-06', amount: 1800 }],
        coaching: {
            summary: { workoutVolumeInPeriod: 1260, mealCaloriesInPeriod: 2150, mealProteinInPeriod: 130, mealCarbsInPeriod: 210, mealFatsInPeriod: 62, checkinsInPeriod: 11, totalWorkoutPrograms: 2, activeWorkoutPrograms: 1, totalDietPlans: 1, activeDietPlans: 1, workoutSessionsInPeriod: 14, completedWorkoutSessions: 11, mealLogsInPeriod: 18, measurementsInPeriod: 4 },
            workoutPrograms: [{ id: 8710, name: 'برنامج قوة ولياقة', fullName: 'عضو تجريبي للتقارير', phone: '01012345678', startDate: '2026-10-01', endDate: '2026-10-31', status: 'active', routines: 4, exercises: 16 }],
            dietPlans: [{ id: 8711, name: 'خطة غذائية متوازنة', fullName: 'عضو تجريبي للتقارير', phone: '01012345678', startDate: '2026-10-01', endDate: '2026-10-31', status: 'active', targetCalories: 2150, meals: 4, foods: 12 }]
        },
        library: { counts: { foods: 84, newFoods: 3, exercises: 240, newExercises: 8, muscles: 24, newMuscles: 1 } }
    };
}

async function installReadOnlyRuntime(page) {
    const apiRequests = [];
    const writes = [];
    const externalAttempts = [];
    const externalEgress = [];
    const plan = planCatalog.PLAN_CONFIGURATIONS.find((item) => item.code === 'business');

    page.on('request', (request) => {
        const url = new URL(request.url());
        if (url.origin !== BASE_ORIGIN) externalAttempts.push(url.href);
    });

    // Intercept the entire browser network boundary. API writes are explicitly
    // rejected, API reads use synthetic fixtures, and third-party egress is blocked.
    await page.route('**/*', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const method = request.method().toUpperCase();

        if (url.origin !== BASE_ORIGIN) {
            if (url.href === KNOWN_EXTERNAL_ASSET) {
                return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
            }
            externalEgress.push(url.href);
            return route.abort('blockedbyclient');
        }

        if (url.pathname.startsWith('/api/')) {
            apiRequests.push({ pathname: url.pathname, method });
            if (!READ_METHODS.has(method)) {
                writes.push({ pathname: url.pathname, method });
                return json(route, { error: 'Writes are blocked in this browser test.' }, 405);
            }

            if (url.pathname === '/api/auth/session') {
                return json(route, {
                    authenticated: true,
                    user: { id: 98301, name: 'Reports V2 QA', role: 'Owner', tenantType: 'gym', permissions: [] }
                });
            }
            if (url.pathname === '/api/branding') {
                return json(route, { branding: { identity: { brandName: 'Reports V2 QA Gym' }, assets: {} }, version: 1 });
            }
            if (url.pathname === '/api/saas/entitlements') {
                return json(route, {
                    tenantStatus: 'active',
                    subscription: { status: 'active', plan: { code: 'business', name: plan.name } },
                    entitlements: {
                        tenantType: 'gym',
                        features: planCatalog.featureFlagsForPlan('business'),
                        featureCatalog: featureCatalog.getFeatureCatalog({ tenantType: 'gym' })
                    }
                });
            }
            if (url.pathname === '/api/reports') {
                return json(route, reportsFixture({ from: url.searchParams.get('from'), to: url.searchParams.get('to') }));
            }
            if (url.pathname === '/api/attendance/report') {
                return json(route, {
                    from: url.searchParams.get('from'), to: url.searchParams.get('to'),
                    summary: { totalVisits: 24, uniqueMembers: 18, checkedOut: 17, averageMinutes: 68, absentMembers: 2 },
                    daily: [{ date: '2026-10-11', visits: 24, uniqueMembers: 18, checkedOut: 17 }], members: [], absentMembers: []
                });
            }
            if (url.pathname === '/api/branches/bootstrap' || url.pathname === '/api/bootstrap') {
                const mainBranch = { id: 1, name: 'QA Main Branch', code: 'qa-main', status: 'active', isMain: true };
                return json(route, {
                    branches: [mainBranch], activeBranches: [mainBranch], defaultBranch: mainBranch,
                    sections: [], branchLimit: 5, hasMultipleActiveBranches: false, canUseAllBranches: true
                });
            }

            // Unknown read-only shell requests get inert fixtures; no request
            // can fall through to a database or a live service.
            return json(route, {});
        }

        return route.continue();
    });

    return { apiRequests, writes, externalAttempts, externalEgress };
}

async function openReportsScreen(page) {
    await page.goto('/index.html#reports', { waitUntil: 'domcontentloaded' });
    const reportsTab = page.locator('[data-page-tab="reports"]');
    await expect(reportsTab).toBeVisible({ timeout: 20_000 });
    await reportsTab.click();
    await expect(page.locator('#reportsSection')).toBeVisible();
    await expect(page.locator('#reportsOverviewView .report-kpi')).toHaveCount(6, { timeout: 20_000 });
    await expect(page.locator('#reportsOverviewView .reports-grid .report-card')).toHaveCount(2);
    await expect(page.locator('#reportsTitle')).toContainText('Reports V2 QA Gym');
}

async function inspectViewportAndTheme(page, width, theme, testInfo) {
    await page.setViewportSize({ width, height: width < 600 ? 820 : 960 });
    await page.evaluate((mode) => {
        document.documentElement.dataset.theme = mode;
        document.body.dataset.theme = mode;
        document.documentElement.dir = 'rtl';
        document.body.dir = 'rtl';
    }, theme);
    await page.evaluate(() => document.fonts.ready);

    const layout = await page.evaluate(() => {
        const reports = document.querySelector('#reportsSection');
        const tabs = document.querySelector('#reportsTabs');
        const reportGrid = document.querySelector('#reportsOverviewView .reports-grid');
        const kpis = [...document.querySelectorAll('#reportsOverviewView .report-kpi')];
        const expectedContent = document.querySelector('#reportsTitle')?.textContent || '';
        return {
            viewportWidth: innerWidth,
            documentWidth: document.documentElement.scrollWidth,
            bodyWidth: document.body.scrollWidth,
            direction: getComputedStyle(reports).direction,
            htmlTheme: document.documentElement.dataset.theme,
            bodyTheme: document.body.dataset.theme,
            appSurfaceToken: getComputedStyle(document.body).getPropertyValue('--bg-app').trim().toLowerCase(),
            reportsWidth: reports.getBoundingClientRect().width,
            reportsVisible: getComputedStyle(reports).display !== 'none' && !reports.hidden,
            tabCount: tabs.querySelectorAll('[role="tab"]').length,
            tabColumns: getComputedStyle(tabs).gridTemplateColumns.split(' ').length,
            reportGridColumns: getComputedStyle(reportGrid).gridTemplateColumns.split(' ').length,
            kpiCount: kpis.length,
            kpiColumns: getComputedStyle(document.querySelector('#reportsOverviewView .reports-kpis')).gridTemplateColumns.split(' ').length,
            kpiFirstText: kpis[0]?.textContent || '',
            contentText: expectedContent,
            kpiMinWidth: Math.min(...kpis.map((item) => item.getBoundingClientRect().width))
        };
    });

    expect(layout.reportsVisible, `${width}px ${theme}: Reports section should be visible`).toBe(true);
    expect(layout.direction, `${width}px ${theme}: Reports content should be RTL`).toBe('rtl');
    expect(layout.htmlTheme).toBe(theme);
    expect(layout.bodyTheme).toBe(theme);
    expect(layout.appSurfaceToken, `${width}px ${theme}: applied theme token`).toBe(theme === 'dark' ? '#09090b' : '#f5f7fb');
    expect(layout.documentWidth, `${width}px ${theme}: document overflow`).toBeLessThanOrEqual(width);
    expect(layout.bodyWidth, `${width}px ${theme}: body overflow`).toBeLessThanOrEqual(width);
    expect(layout.reportsWidth).toBeGreaterThan(0);
    expect(layout.tabCount).toBe(7);
    expect(layout.kpiCount).toBe(6);
    expect(layout.kpiFirstText).toContain(new Intl.NumberFormat('ar-EG').format(23));
    expect(layout.contentText).toContain('Reports V2 QA Gym');
    expect(layout.kpiMinWidth).toBeGreaterThan(0);

    const expectedTabColumns = width > 1199 ? 7 : width > 767 ? 4 : 2;
    expect(layout.tabColumns, `${width}px ${theme}: responsive report tabs`).toBe(expectedTabColumns);
    expect(layout.reportGridColumns, `${width}px ${theme}: responsive overview content`).toBe(width > 991 ? 2 : 1);
    expect(layout.kpiColumns, `${width}px ${theme}: overview KPI composition`).toBe(width > 991 ? 3 : width > 359 ? 2 : 1);

    const screenshotName = `reports-${width}-${theme}.png`;
    const screenshotPath = testInfo.outputPath(screenshotName);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    const evidenceDir = path.join(__dirname, '../../qa/reports/logicfit-v2-reports');
    await fs.promises.mkdir(evidenceDir, { recursive: true });
    await fs.promises.copyFile(screenshotPath, path.join(evidenceDir, screenshotName));
}

test.describe('real dynamically-mounted Reports screen V2 visual QA', () => {
    test('renders synthetic report data across viewport and theme matrix without writes or network egress', async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== 'desktop', 'One deterministic desktop-project matrix covers every requested viewport and theme.');
        const runtime = await installReadOnlyRuntime(page);
        await openReportsScreen(page);
        await page.addStyleTag({ content: await fs.promises.readFile(path.join(__dirname, '../../public/css/pages/reports.css'), 'utf8') });

        for (const theme of THEMES) {
            for (const width of VIEWPORTS) {
                await inspectViewportAndTheme(page, width, theme, testInfo);
            }
        }

        expect(runtime.apiRequests).toContainEqual({ pathname: '/api/reports', method: 'GET' });
        expect(runtime.writes, 'The report view must not issue an API write in this spec.').toEqual([]);
        expect(runtime.externalEgress, 'No external network request may leave the isolated browser.').toEqual([]);
        expect(runtime.externalAttempts, 'All attempted external requests must remain blocked or locally stubbed.')
            .toEqual(runtime.externalAttempts.filter((url) => url === KNOWN_EXTERNAL_ASSET));
        expect(runtime.apiRequests.every(({ method }) => READ_METHODS.has(method))).toBe(true);
    });

    test('keeps all seven existing report subviews reachable and contained across the viewport/theme matrix', async ({ page }, testInfo) => {
        test.setTimeout(120_000);
        test.skip(testInfo.project.name !== 'desktop', 'One deterministic desktop-project matrix covers every report tab, viewport and theme.');
        await installReadOnlyRuntime(page);
        await openReportsScreen(page);
        await page.addStyleTag({ content: await fs.promises.readFile(path.join(__dirname, '../../public/css/pages/reports.css'), 'utf8') });
        const tabs = ['overview', 'attendance', 'memberships', 'finance', 'coaching', 'library', 'backups'];

        for (const theme of THEMES) {
            for (const width of VIEWPORTS) {
                await page.setViewportSize({ width, height: width < 600 ? 820 : 960 });
                await page.evaluate((mode) => {
                    document.documentElement.dataset.theme = mode;
                    document.body.dataset.theme = mode;
                    document.documentElement.dir = 'rtl';
                    document.body.dir = 'rtl';
                }, theme);
                for (const tabName of tabs) {
                    const tab = page.locator(`[data-report-tab="${tabName}"]`);
                    await expect(tab, `${tabName} available at ${width}px ${theme}`).toBeVisible();
                    await tab.click();
                    const view = page.locator(`#reports${tabName[0].toUpperCase()}${tabName.slice(1)}View`);
                    await expect(tab, `${tabName} should become the selected tab at ${width}px ${theme}`).toHaveAttribute('aria-selected', 'true');
                    const visibleViews = await page.locator('.reports-view').evaluateAll((nodes) => nodes.map((node) => ({ id: node.id, hidden: node.hidden, display: getComputedStyle(node).display })));
                    await expect(view, `${tabName} ${width}px ${theme}; panes=${JSON.stringify(visibleViews)}`).toBeVisible();
                    await expect(page.locator('#reportsTabs [aria-selected="true"]')).toHaveCount(1);
                    await expect(view.locator('.reports-loading')).toHaveCount(0, { timeout: 20_000 });

                    const bounds = await page.evaluate(() => ({
                        viewport: innerWidth,
                        document: document.documentElement.scrollWidth,
                        body: document.body.scrollWidth,
                        view: document.querySelector('.reports-view:not([hidden])')?.getBoundingClientRect().width || 0
                    }));
                    expect(bounds.document, `${tabName} ${width}px ${theme}: document overflow`).toBeLessThanOrEqual(width);
                    expect(bounds.body, `${tabName} ${width}px ${theme}: body overflow`).toBeLessThanOrEqual(width);
                    expect(bounds.view).toBeGreaterThan(0);

                    if ((width === 1440 && theme === 'light') || (width === 390 && theme === 'dark')) {
                        const screenshotName = `reports-${tabName}-${width}-${theme}.png`;
                        const screenshotPath = testInfo.outputPath(screenshotName);
                        await page.screenshot({
                            path: screenshotPath,
                            fullPage: true
                        });
                        const evidenceDir = path.join(__dirname, '../../qa/reports/logicfit-v2-reports');
                        await fs.promises.mkdir(evidenceDir, { recursive: true });
                        await fs.promises.copyFile(screenshotPath, path.join(evidenceDir, screenshotName));
                    }
                }
            }
        }
    });
});
