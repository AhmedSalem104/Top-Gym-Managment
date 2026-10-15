const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const featureCatalog = require('../../src/services/feature-catalog');
const planCatalog = require('../../src/services/saas-plan-catalog');

const ORIGIN = 'http://127.0.0.1:4173';
const WIDTHS = [320, 390, 768, 1440];
const THEMES = ['light', 'dark'];
const LOCALES = ['ar', 'en'];
const ARTIFACT_DIR = path.join(process.cwd(), 'qa/artifacts/reports-central-i18n');
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const reportFixture = {
    period: { from: '2026-10-01', to: '2026-10-13' },
    summary: { currentMembers: 137, newMembers: 23, newMemberships: 19, collected: 48250, paidTransactions: 42, expenses: 13750, expensesCount: 8, net: 34500, outstanding: 6200, outstandingCount: 6, debtorsCount: 1 },
    timeline: [{ date: '2026-10-12', newMembers: 9, newMemberships: 8, collected: 18250, expenses: 2100 }],
    breakdown: { plans: [{ key: 'gym_only', value: 1 }], paymentMethods: [{ key: 'cash', amount: 300, count: 1 }], statuses: [{ key: 'active', value: 1 }] },
    members: [],
    memberships: [{ id: 8231, fullName: 'Client QA', phone: '01012345678', plan: 'gym_only', type: 'monthly', status: 'active', startDate: '2026-10-01', endDate: '2026-10-31', amountDue: 500, amountPaid: 200, amountRemaining: 300 }],
    debtors: [{ id: 8231, fullName: 'التفاصيل', phone: '01012345678', plan: 'gym_only', amountRemaining: 300 }],
    payments: [{ fullName: 'Client QA', phone: '01012345678', transactionType: 'payment', date: '2026-10-12', paymentMethod: 'cash', amountPaid: 200, amountRemaining: 300 }],
    expenses: [{ name: 'QA expense', notes: 'server note', date: '2026-10-12', amount: 50 }],
    coaching: { summary: {}, workoutPrograms: [], dietPlans: [] },
    library: { counts: { foods: 84, newFoods: 3, exercises: 240, newExercises: 8, muscles: 24, newMuscles: 1 } }
};

async function installReadOnlyFixtures(page) {
    const apiReads = [];
    const writes = [];
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.route('**/*', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin !== ORIGIN) return route.abort('blockedbyclient');
        if (!url.pathname.startsWith('/api/')) return route.continue();
        const method = request.method().toUpperCase();
        if (!READ_METHODS.has(method)) {
            writes.push({ path: url.pathname, method });
            return route.fulfill({ status: 405, contentType: 'application/json', body: '{"error":"read-only i18n test"}' });
        }
        apiReads.push({ path: url.pathname, method });
        const plan = planCatalog.PLAN_CONFIGURATIONS.find((item) => item.code === 'business') || planCatalog.PLAN_CONFIGURATIONS.find((item) => item.code === 'business');
        let payload = {};
        if (url.pathname === '/api/auth/session') payload = { authenticated: true, user: { id: 98321, name: 'Reports QA', role: 'Owner', tenantType: 'gym' } };
        else if (url.pathname === '/api/branding') payload = { branding: { identity: { brandName: 'Reports QA Gym' }, assets: {} }, identity: { brandName: 'Reports QA Gym' }, version: 1 };
        else if (url.pathname === '/api/saas/entitlements') payload = { tenantStatus: 'active', subscription: { status: 'active', plan: { code: 'business', name: plan?.name || 'Business' } }, entitlements: { tenantType: 'gym', features: planCatalog.featureFlagsForPlan('business'), featureCatalog: featureCatalog.getFeatureCatalog({ tenantType: 'gym' }) } };
        else if (url.pathname === '/api/reports') payload = reportFixture;
        else if (url.pathname === '/api/attendance/report') payload = { from: '2026-10-01', to: '2026-10-13', summary: { totalVisits: 24, uniqueMembers: 18, checkedOut: 17, averageMinutes: 68, absentMembers: 2 }, daily: [{ date: '2026-10-12', visits: 24, uniqueMembers: 18, checkedOut: 17 }], members: [], absentMembers: [] };
        else if (url.pathname === '/api/backup/history') payload = { archives: [], operations: [] };
        else if (url.pathname === '/api/branches/bootstrap' || url.pathname === '/api/bootstrap') {
            const branch = { id: 1, name: 'QA Main Branch', code: 'qa-main', status: 'active', isMain: true };
            payload = { branches: [branch], activeBranches: [branch], defaultBranch: branch, sections: [], branchLimit: 5, hasMultipleActiveBranches: false, canUseAllBranches: true };
        }
        return route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(payload) });
    });
    return { apiReads, writes, pageErrors };
}

test('Reports content switches locale safely across viewport and theme matrix', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'One deterministic runner produces the complete locale/theme/viewport matrix.');
    test.setTimeout(180_000);
    const runtime = await installReadOnlyFixtures(page);
    await page.goto('/index.html#reports', { waitUntil: 'domcontentloaded' });
    const reportsNav = page.locator('[data-page-tab="reports"]');
    await expect(reportsNav).toBeVisible({ timeout: 20_000 });
    await reportsNav.click();
    const section = page.locator('#reportsSection');
    await expect(section.locator('#reportsOverviewView .reports-debtors-table tbody tr')).toHaveCount(1, { timeout: 20_000 });
    await expect(section.locator('#reportsTabs [data-report-tab]')).toHaveCount(7);
    await expect.poll(() => runtime.apiReads.filter((entry) => entry.path === '/api/reports').length).toBe(1);

    // Visit every existing tab under the authorized Owner fixture. Auxiliary
    // report datasets may load once on explicit tab entry; locale changes must
    // not cause any further API request.
    for (const tab of ['attendance', 'memberships', 'finance', 'coaching', 'library', 'backups', 'overview']) {
        await section.locator(`[data-report-tab="${tab}"]`).click();
        await expect(section.locator(`[data-report-tab="${tab}"]`)).toHaveAttribute('aria-selected', 'true');
    }
    await section.locator('[data-report-tab="memberships"]').click();
    await section.locator('#reportsMembershipStatus').selectOption('active');
    await section.locator('#reportsLocalSearch').fill('Client');
    const rangeBefore = await page.locator('#reportsFrom, #reportsTo').evaluateAll((nodes) => nodes.map((node) => node.value));
    const reportReadPaths = new Set(['/api/reports', '/api/attendance/report', '/api/backup/history']);
    const readsBeforeLocaleMatrix = runtime.apiReads.filter((entry) => reportReadPaths.has(entry.path)).length;
    await fs.mkdir(ARTIFACT_DIR, { recursive: true });

    const measurements = [];
    for (const width of WIDTHS) {
        for (const theme of THEMES) {
            for (const locale of LOCALES) {
                await page.setViewportSize({ width, height: width < 600 ? 850 : 1000 });
                await page.evaluate(({ mode, language }) => {
                    document.documentElement.dataset.theme = mode;
                    document.body.dataset.theme = mode;
                    window.TopGymI18n.set(language, { persist: false });
                }, { mode: theme, language: locale });
                await expect(section.locator('#reportsTabs [data-report-tab]')).toHaveCount(7);
                await expect(section.locator('[data-report-tab="memberships"]')).toHaveAttribute('aria-selected', 'true');
                await expect(section.locator('#reportsMembershipStatus')).toHaveValue('active');
                await expect(section.locator('#reportsLocalSearch')).toHaveValue('Client');
                await expect(section.locator('#reportsMembershipsView tbody strong')).toContainText('Client QA');
                await expect(section.locator('#reportsTitle')).toContainText('Reports QA Gym');
                await expect(page).toHaveURL(/#reports$/);
                const state = await page.evaluate(() => ({
                    locale: document.documentElement.lang,
                    direction: document.documentElement.dir,
                    theme: document.documentElement.dataset.theme,
                    bodyWidth: document.body.scrollWidth,
                    documentWidth: document.documentElement.scrollWidth,
                    selectedTabs: document.querySelectorAll('#reportsTabs [aria-selected="true"]').length,
                    untranslatedStatic: (() => {
                        const root = document.querySelector('#reportsSection');
                        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
                        const values = [];
                        while (walker.nextNode()) {
                            const node = walker.currentNode;
                            const text = node.nodeValue.trim();
                            if (!text || node.parentElement.closest('[data-i18n-preserve]')) continue;
                            if (/[^\u0000-\u007f]/u.test(text) && /[\u0600-\u06ff]/u.test(text)) values.push(text);
                        }
                        return values.slice(0, 30);
                    })()
                }));
                expect(state.locale).toBe(locale);
                expect(state.direction).toBe(locale === 'ar' ? 'rtl' : 'ltr');
                expect(state.theme).toBe(theme);
                expect(state.bodyWidth, `${width}px ${theme}/${locale}: body overflow`).toBeLessThanOrEqual(width);
                expect(state.documentWidth, `${width}px ${theme}/${locale}: document overflow`).toBeLessThanOrEqual(width);
                expect(state.selectedTabs).toBe(1);
                if (locale === 'en') await expect(section.locator('#reportsTabs [data-report-tab="overview"]')).toContainText('Overview');
                else await expect(section.locator('#reportsTabs [data-report-tab="overview"]')).toContainText('الملخص العام');

                const screenshot = `reports-${width}-${theme}-${locale}.png`;
                await page.screenshot({ path: path.join(ARTIFACT_DIR, screenshot), fullPage: true });
                measurements.push({ width, theme, locale, ...state, screenshot });
            }
        }
    }

    await expect(section.locator('#reportsFrom, #reportsTo')).toHaveCount(2);
    expect(await page.locator('#reportsFrom, #reportsTo').evaluateAll((nodes) => nodes.map((node) => node.value))).toEqual(rangeBefore);
    expect(runtime.apiReads.filter((entry) => reportReadPaths.has(entry.path)).length, 'Locale/theme/viewport changes must not refetch report or auxiliary datasets.').toBe(readsBeforeLocaleMatrix);
    expect(runtime.writes, 'The report i18n matrix is read-only.').toEqual([]);
    expect(runtime.pageErrors, 'No uncaught browser errors.').toEqual([]);
    await fs.writeFile(path.join(ARTIFACT_DIR, 'matrix.json'), JSON.stringify({ cases: measurements.length, measurements, apiReads: runtime.apiReads, writes: runtime.writes, pageErrors: runtime.pageErrors }, null, 2));
    expect(measurements).toHaveLength(16);
});
