const { test, expect } = require('@playwright/test');
const path = require('node:path');
const featureCatalog = require('../../src/services/feature-catalog');
const planCatalog = require('../../src/services/saas-plan-catalog');

const ORIGIN = 'http://127.0.0.1:4173';
const WIDTHS = [320, 375, 390, 768, 1024, 1440, 1920];
const THEMES = ['light', 'dark'];
const DIRECTIONS = ['rtl', 'ltr'];
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const longLabel = 'مصروف صيانة معدات التدريب — وصف عربي طويل للتأكد من التفاف النص وعدم خروج المحتوى عن مساحة الشاشة الصغيرة';

const reportsFixture = {
    period: { from: '2026-10-01', to: '2026-10-12' },
    summary: { currentMembers: 137, newMembers: 23, newMemberships: 19, collected: 48250, paidTransactions: 42, expenses: 13750, expensesCount: 8, net: 34500, outstanding: 6200, outstandingCount: 6, debtorsCount: 1 },
    timeline: [{ date: '2026-10-12', newMembers: 9, newMemberships: 8, collected: 18250, expenses: 2100 }],
    breakdown: { plans: [{ key: 'gym_only', value: 81 }], paymentMethods: [{ key: 'cash', amount: 30250, count: 29 }], statuses: [{ key: 'active', value: 119 }] },
    members: [{ id: 4201, fullName: 'عضو اختبار التقارير', phone: '+201001234567', plan: 'gym_only', type: 'monthly', status: 'active', startDate: '2026-10-01', endDate: '2026-10-31', amountDue: 600, amountPaid: 400, amountRemaining: 200 }],
    memberships: [],
    debtors: [{ id: 4201, fullName: 'عضو اختبار التقارير', phone: '+201001234567', plan: 'gym_only', amountRemaining: 200 }],
    payments: [{ id: 5201, fullName: 'عضو اختبار التقارير', phone: '+201001234567', transactionType: 'payment', date: '2026-10-10', paymentMethod: 'cash', amountPaid: 400, amountRemaining: 200 }],
    expenses: [{ id: 6201, name: longLabel, notes: 'بيانات اصطناعية للعرض فقط', date: '2026-10-06', amount: 1250 }],
    coaching: { summary: {}, workoutPrograms: [], dietPlans: [] },
    library: { counts: { foods: 84, newFoods: 3, exercises: 240, newExercises: 8, muscles: 24, newMuscles: 1 } }
};

async function installFixtures(page) {
    const writes = [];
    const externalRequests = [];
    const plan = planCatalog.PLAN_CONFIGURATIONS.find((entry) => entry.code === 'business');
    let scenario = 'normal';
    let slowPath = '';

    await page.route('**/*', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const method = request.method().toUpperCase();
        if (url.origin !== ORIGIN) {
            if (/^https:\/\/cdn\.jsdelivr\.net\/npm\/sweetalert2@11(?:\/|$)/.test(url.href)) {
                return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
            }
            externalRequests.push(url.href);
            return route.abort('blockedbyclient');
        }
        if (!SAFE_METHODS.has(method)) {
            writes.push({ path: url.pathname, method });
            return route.fulfill({ status: 405, contentType: 'application/json', body: '{"error":"Read-only synthetic UI fixture"}' });
        }
        if (!url.pathname.startsWith('/api/')) return route.continue();

        if (slowPath && url.pathname === slowPath) await new Promise((resolve) => setTimeout(resolve, 1_000));
        if ((scenario === 'reports-error' && url.pathname === '/api/reports')
            || (scenario === 'intelligence-error' && url.pathname === '/api/intelligence/overview')
            || (scenario === 'portal-error' && url.pathname === '/api/portal/analytics')) {
            return route.fulfill({ status: 503, contentType: 'application/json; charset=utf-8', body: '{"error":"Synthetic read-only QA error"}' });
        }

        let payload = {};
        switch (url.pathname) {
            case '/api/auth/session':
                payload = { authenticated: true, user: { id: 90201, name: 'Gym Finance V2 QA', role: 'Owner', tenantType: 'gym', permissions: [] } };
                break;
            case '/api/branding':
                payload = { branding: { identity: { brandName: 'Gym Finance V2 QA' }, assets: {} }, identity: { brandName: 'Gym Finance V2 QA' }, version: 1 };
                break;
            case '/api/saas/entitlements':
                payload = { tenantStatus: 'active', subscription: { status: 'active', plan: { code: 'business', name: plan.name } }, entitlements: { tenantType: 'gym', features: planCatalog.featureFlagsForPlan('business'), featureCatalog: featureCatalog.getFeatureCatalog({ tenantType: 'gym' }) } };
                break;
            case '/api/branches/bootstrap':
            case '/api/bootstrap': {
                const branch = { id: 1, name: 'فرع الاختبار', code: 'qa', status: 'active', isMain: true };
                payload = { branches: [branch], activeBranches: [branch], defaultBranch: branch, sections: [], branchLimit: 5, hasMultipleActiveBranches: false, canUseAllBranches: true };
                break;
            }
            case '/api/monthly-finance':
                payload = { period: { startDate: '2026-10-01', endDate: '2026-10-31' }, subscriptions: { total: 18250, count: 17 }, dayPasses: { total: 750, count: 5 }, expenses: { total: scenario === 'expenses-empty' ? 0 : 1250, count: scenario === 'expenses-empty' ? 0 : 1, items: scenario === 'expenses-empty' ? [] : [{ id: 6201, name: longLabel, amount: 1250, expenseDate: '2026-10-06', notes: '' }] }, refunds: 0, net: scenario === 'expenses-empty' ? 17750 : 16500 };
                break;
            case '/api/reports':
                payload = scenario === 'reports-empty' ? { ...reportsFixture, timeline: [], debtors: [], payments: [], expenses: [], memberships: [], members: [] } : reportsFixture;
                break;
            case '/api/attendance/report':
                payload = { summary: { totalVisits: 1, uniqueMembers: 1, checkedOut: 1, averageMinutes: 45, absentMembers: 0 }, from: '2026-10-01', to: '2026-10-12', daily: [{ date: '2026-10-12', visits: 1, uniqueMembers: 1, checkedOut: 1 }], members: [], absentMembers: [] };
                break;
            case '/api/backup/history':
                payload = { archives: [], operations: [] };
                break;
            case '/api/portal/analytics':
                payload = scenario === 'portal-empty' ? { totals: { pageViews: 0, uniqueVisitors: 0, authenticatedMembers: 0 }, daily: [] } : { totals: { pageViews: 1240, uniqueVisitors: 184, authenticatedMembers: 97 }, daily: [{ date: '2026-10-12', pageViews: 76, uniqueVisitors: 31, authenticatedMembers: 19 }], mostVisitedDay: { date: '2026-10-12', pageViews: 76 } };
                break;
            case '/api/intelligence/overview':
                payload = { mode: 'hybrid-rules', stats: { highRiskMembers: 2, expiringMemberships: 4, activeMemberships: 119, activeWorkoutPrograms: 8, activeDietPlans: 5, totalMembers: 137 }, priorities: [{ tone: 'warning', title: 'مراجعة انتهاء الاشتراك', action: 'بيانات اصطناعية' }], churn: [{ id: 7101, fullName: 'اسم عضو طويل للاختبار البصري', phone: '+201001234567', level: 'high', score: 82, daysSinceLastVisit: 12, daysToExpiry: 3, reasons: ['بيانات عرض اصطناعية'] }], prompts: ['ملخص العضويات'] };
                break;
            case '/api/coaching/clients':
                payload = { clients: [{ id: 7101, fullName: 'عميل اختبار', phone: '+201001234567' }] };
                break;
            case '/api/coaching/catalog':
                payload = { exercises: [], foods: [] };
                break;
            default:
                payload = {};
        }
        return route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(payload) });
    });

    return {
        writes,
        externalRequests,
        setScenario(value) { scenario = value; },
        setSlowPath(value) { slowPath = value; }
    };
}

async function openGymTab(page, key, sectionSelector, readySelector) {
    // Load through the product's existing hash route so startup can restore the
    // authenticated shell and the requested tab together. A click before that
    // async shell restoration silently targets navigation that is not bound.
    await page.goto(`/index.html#${encodeURIComponent(key)}`, { waitUntil: 'domcontentloaded' });
    const tab = page.locator(`[data-page-tab="${key}"]`);
    await expect(tab).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => page.locator('html').getAttribute('data-top-gym-active-tab'), { timeout: 20_000 }).toBe(key);
    await expect(tab).toHaveClass(/\bactive\b/);
    const section = page.locator(sectionSelector);
    await expect(section).toBeVisible({ timeout: 20_000 });
    if (readySelector) await expect(section.locator(readySelector).first()).toBeVisible({ timeout: 20_000 });
    return section;
}

async function verifyMatrix(page, section, label, testInfo) {
    const results = [];
    for (const width of WIDTHS) {
        for (const direction of DIRECTIONS) {
            for (const theme of THEMES) {
                await page.setViewportSize({ width, height: width < 600 ? 850 : 1000 });
                await page.evaluate(({ direction: dir, theme: mode }) => {
                    document.documentElement.dir = dir;
                    document.body.dir = dir;
                    document.documentElement.dataset.theme = mode;
                    document.body.dataset.theme = mode;
                }, { direction, theme });
                await page.evaluate(() => document.fonts.ready);
                const state = await page.evaluate((selector) => {
                    const root = document.documentElement;
                    const body = document.body;
                    const sectionNode = document.querySelector(selector);
                    return {
                        viewport: innerWidth,
                        documentWidth: root.scrollWidth,
                        bodyWidth: body.scrollWidth,
                        sectionWidth: sectionNode?.getBoundingClientRect().width || 0,
                        direction: getComputedStyle(sectionNode).direction,
                        theme: root.dataset.theme,
                        visible: Boolean(sectionNode && !sectionNode.hidden && getComputedStyle(sectionNode).display !== 'none'),
                        touchTargets: [...(sectionNode?.querySelectorAll('[data-v2-touch-check]') || [])]
                            .filter((element) => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden')
                            .map((element) => {
                                const rect = element.getBoundingClientRect();
                                return { id: element.id, selector: element.tagName.toLowerCase(), width: rect.width, height: rect.height };
                            })
                    };
                }, `#${await section.getAttribute('id')}`);
                expect(state.visible, `${label} ${width}px ${theme} ${direction}: screen visible`).toBe(true);
                expect(state.sectionWidth, `${label} ${width}px: screen has layout width`).toBeGreaterThan(0);
                expect(state.direction).toBe(direction);
                expect(state.theme).toBe(theme);
                expect(state.documentWidth, `${label} ${width}px ${theme} ${direction}: document overflow`).toBeLessThanOrEqual(width);
                expect(state.bodyWidth, `${label} ${width}px ${theme} ${direction}: body overflow`).toBeLessThanOrEqual(width);
                if (width <= 991) {
                    expect(state.touchTargets.every(({ width: targetWidth, height }) => targetWidth >= 44 && height >= 44), `${label} ${width}px: touch targets ${JSON.stringify(state.touchTargets)}`).toBe(true);
                }
                const screenshot = testInfo.outputPath(`${label}-${width}-${theme}-${direction}.png`);
                await page.screenshot({ path: screenshot, fullPage: true });
                results.push(state);
            }
        }
    }
    return results;
}

test.describe('Gym finance and reporting V2 acceptance', () => {
    test('expenses workspace — real navigation, representative data and 7 × 2 × 2 visual matrix', async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== 'desktop', 'One serial desktop project records the complete viewport/theme/direction matrix.');
        test.setTimeout(240_000);
        const runtime = await installFixtures(page);
        const section = await openGymTab(page, 'expenses', '#expensesSection', '.monthly-finance-card');
        await expect(section.locator('.monthly-expense-item')).toHaveCount(1);
        await expect(section.locator('.monthly-expense-item')).toContainText(longLabel);
        await expect(section.locator('[data-expense-action]')).toHaveCount(2);
        await section.locator('.monthly-expense-action, .expenses-tab-add-button, .monthly-finance-metric-top .add-expense-button').evaluateAll((nodes) => nodes.forEach((node) => node.setAttribute('data-v2-touch-check', '')));
        await verifyMatrix(page, section, 'expenses', testInfo);
        expect(runtime.writes).toEqual([]);
        expect(runtime.externalRequests).toEqual([]);
    });

    test('reports and finance — activate every real report tab and verify layout matrix', async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== 'desktop', 'One serial desktop project records the complete viewport/theme/direction matrix.');
        test.setTimeout(360_000);
        const runtime = await installFixtures(page);
        const section = await openGymTab(page, 'reports', '#reportsSection', '#reportsOverviewView .report-kpi');
        await expect(section.locator('#reportsOverviewView .reports-debtors-table tbody tr')).toHaveCount(1);
        const results = await verifyMatrix(page, section, 'reports-overview', testInfo);

        for (const key of ['attendance', 'memberships', 'finance', 'coaching', 'library', 'backups']) {
            const tab = section.locator(`#reportsTabs [data-report-tab="${key}"]`);
            await expect(tab).toBeVisible();
            await tab.click();
            await expect(tab).toHaveAttribute('aria-selected', 'true');
            await expect(section.locator(`#reports${key[0].toUpperCase()}${key.slice(1)}View`)).toBeVisible({ timeout: 20_000 });
            const view = section.locator(`#reports${key[0].toUpperCase()}${key.slice(1)}View`);
            if (key === 'finance') {
                await expect(view.locator('.reports-table')).toHaveCount(2);
                await expect(view).toContainText(longLabel);
            }
            await view.locator('.reports-tab, .reports-actions > .btn, .reports-debtor-actions > .btn, .reports-debtor-actions .alert-whatsapp-button, .reports-filters input:not([type="checkbox"]), .reports-filters select').evaluateAll((nodes) => nodes.forEach((node) => node.setAttribute('data-v2-touch-check', '')));
            if (key === 'finance') await verifyMatrix(page, view, 'reports-finance', testInfo);
            await page.setViewportSize({ width: 1440, height: 1000 });
            await page.evaluate(() => { document.documentElement.dir = 'rtl'; document.body.dir = 'rtl'; document.documentElement.dataset.theme = 'light'; document.body.dataset.theme = 'light'; });
            await page.screenshot({ path: testInfo.outputPath(`reports-${key}-1440-light-rtl.png`), fullPage: true });
        }
        expect(results).toHaveLength(WIDTHS.length * DIRECTIONS.length * THEMES.length);
        expect(runtime.writes).toEqual([]);
        expect(runtime.externalRequests).toEqual([]);
    });

    test('intelligence — actual owner tab, table and representative analysis data across matrix', async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== 'desktop', 'One serial desktop project records the complete viewport/theme/direction matrix.');
        test.setTimeout(240_000);
        const runtime = await installFixtures(page);
        const section = await openGymTab(page, 'intelligence', '#intelligenceSection', '.intelligence-stat-card');
        await expect(section.locator('.intelligence-stat-card')).toHaveCount(6);
        await expect(section.locator('.intelligence-table tbody tr')).toHaveCount(1);
        await section.locator('.intelligence-prompt, .intelligence-plan-type button, .intelligence-table [data-intelligence-member], .intelligence-query-form input, .intelligence-refine-form textarea, .intelligence-plan-form input, .intelligence-plan-form select').evaluateAll((nodes) => nodes.forEach((node) => node.setAttribute('data-v2-touch-check', '')));
        await verifyMatrix(page, section, 'intelligence', testInfo);
        expect(runtime.writes).toEqual([]);
        expect(runtime.externalRequests).toEqual([]);
    });

    test('portal analytics — actual owner tab, cards and daily data across matrix', async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== 'desktop', 'One serial desktop project records the complete viewport/theme/direction matrix.');
        test.setTimeout(240_000);
        const runtime = await installFixtures(page);
        const section = await openGymTab(page, 'portal-analytics', '#portalAnalyticsSection', '.portal-analytics-day');
        await expect(section.locator('.portal-analytics-card')).toHaveCount(3);
        await section.locator('.portal-analytics-actions select, .portal-analytics-actions > .btn').evaluateAll((nodes) => nodes.forEach((node) => node.setAttribute('data-v2-touch-check', '')));
        await verifyMatrix(page, section, 'portal-analytics', testInfo);
        expect(runtime.writes).toEqual([]);
        expect(runtime.externalRequests).toEqual([]);
    });

    test('safe empty, loading and error states remain readable without write requests', async ({ page }) => {
        test.skip(test.info().project.name !== 'desktop', 'State checks use the deterministic desktop project.');
        test.setTimeout(120_000);
        const runtime = await installFixtures(page);
        runtime.setScenario('expenses-empty');
        let section = await openGymTab(page, 'expenses', '#expensesSection', '.monthly-finance-card');
        await expect(section.locator('.monthly-expense-item')).toHaveCount(0);
        await expect(section.locator('.monthly-expenses-empty')).toBeVisible();

        runtime.setScenario('portal-empty');
        section = await openGymTab(page, 'portal-analytics', '#portalAnalyticsSection', '.portal-analytics-empty');
        await expect(section.locator('.portal-analytics-card')).toHaveCount(3);

        runtime.setScenario('normal');
        runtime.setSlowPath('/api/portal/analytics');
        section = await openGymTab(page, 'portal-analytics', '#portalAnalyticsSection');
        const refresh = section.locator('#portalAnalyticsRefresh');
        await refresh.click();
        // Refresh intentionally retains already-rendered analytics while the
        // request is pending; loading is communicated by the button, not by
        // replacing the data region with a skeleton.
        await expect(refresh).toHaveAttribute('aria-busy', 'true');
        await expect(section.locator('.portal-analytics-day')).toBeVisible({ timeout: 20_000 });
        await expect(refresh).not.toHaveAttribute('aria-busy', 'true', { timeout: 20_000 });
        runtime.setSlowPath('');

        runtime.setScenario('portal-error');
        // The route is unchanged, so force a fresh document to guarantee a
        // first-load failure instead of a refresh over cached successful data.
        await page.reload({ waitUntil: 'domcontentloaded' });
        section = page.locator('#portalAnalyticsSection');
        await expect(section).toBeVisible({ timeout: 20_000 });
        await expect(section.locator('.portal-analytics-error')).toBeVisible();
        await expect(section.locator('#portalAnalyticsStatus')).toBeVisible();

        runtime.setScenario('normal');
        section = await openGymTab(page, 'reports', '#reportsSection', '#reportsOverviewView .report-kpi');
        runtime.setScenario('reports-error');
        await section.locator('#reportsRefreshButton').click();
        await expect(section.locator('#reportsOverviewView .reports-error')).toBeVisible();

        runtime.setScenario('normal');
        section = await openGymTab(page, 'intelligence', '#intelligenceSection', '.intelligence-stat-card');
        runtime.setScenario('intelligence-error');
        await section.locator('#intelligenceRefreshButton').click();
        await expect(section.locator('#intelligenceMessage.error')).toBeVisible();

        expect(runtime.writes).toEqual([]);
        expect(runtime.externalRequests).toEqual([]);
    });
});
