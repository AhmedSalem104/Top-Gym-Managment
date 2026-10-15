const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const featureCatalog = require('../../src/services/feature-catalog');
const planCatalog = require('../../src/services/saas-plan-catalog');

const ORIGIN = 'http://127.0.0.1:4173';
const WIDTHS = [320, 390, 768, 1440];
const THEMES = ['light', 'dark'];
const DIRECTIONS = ['rtl', 'ltr'];
const ARTIFACT_DIR = path.join(process.cwd(), 'qa/artifacts/reports-v2-acceptance-visual-matrix');
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const reportFixture = {
    period: { from: '2026-10-01', to: '2026-10-13' },
    summary: { currentMembers: 137, newMembers: 23, newMemberships: 19, collected: 48250, paidTransactions: 42, expenses: 13750, expensesCount: 8, net: 34500, outstanding: 6200, outstandingCount: 6, debtorsCount: 6 },
    timeline: [{ date: '2026-10-12', newMembers: 9, newMemberships: 8, collected: 18250, expenses: 2100 }],
    breakdown: { plans: [{ key: 'gym_only', value: 81 }], paymentMethods: [{ key: 'cash', amount: 30250, count: 29 }], statuses: [{ key: 'active', value: 119 }] },
    members: [], memberships: [],
    debtors: [{ id: 87321, fullName: 'عضو تقارير تجريبي', phone: '01012345678', plan: 'gym_only', amountRemaining: 300 }],
    payments: [], expenses: [], coaching: { summary: {} },
    library: { counts: { foods: 84, newFoods: 3, exercises: 240, newExercises: 8, muscles: 24, newMuscles: 1 } }
};

async function installReadOnlyFixtures(page) {
    const writes = [];
    const externalRequests = [];
    const stylesheetRequests = [];
    const plan = planCatalog.PLAN_CONFIGURATIONS.find((entry) => entry.code === 'business');
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('request', (request) => {
        const url = new URL(request.url());
        if (url.origin !== ORIGIN && !/^https:\/\/cdn\.jsdelivr\.net\/npm\/sweetalert2@11(?:\/|$)/.test(url.href)) externalRequests.push(url.href);
        if (url.pathname === '/css/pages/reports.css') stylesheetRequests.push(url.href);
    });

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
        if (!url.pathname.startsWith('/api/')) return route.continue();
        if (!READ_METHODS.has(method)) {
            writes.push({ path: url.pathname, method });
            return route.fulfill({ status: 405, contentType: 'application/json', body: '{"error":"read-only visual test"}' });
        }

        let payload = {};
        if (url.pathname === '/api/auth/session') {
            payload = { authenticated: true, user: { id: 97432, name: 'Reports Visual QA', role: 'Owner', tenantType: 'gym' } };
        } else if (url.pathname === '/api/branding') {
            payload = { branding: { identity: { brandName: 'Reports QA Gym' }, assets: {} }, identity: { brandName: 'Reports QA Gym' }, version: 1 };
        } else if (url.pathname === '/api/saas/entitlements') {
            payload = { tenantStatus: 'active', subscription: { status: 'active', plan: { code: 'business', name: plan.name } }, entitlements: { tenantType: 'gym', features: planCatalog.featureFlagsForPlan('business'), featureCatalog: featureCatalog.getFeatureCatalog({ tenantType: 'gym' }) } };
        } else if (url.pathname === '/api/reports') {
            payload = reportFixture;
        } else if (url.pathname === '/api/attendance/report') {
            payload = { from: '2026-10-01', to: '2026-10-13', summary: { totalVisits: 24, uniqueMembers: 18, checkedOut: 17, averageMinutes: 68, absentMembers: 2 }, daily: [{ date: '2026-10-12', visits: 24, uniqueMembers: 18, checkedOut: 17 }], members: [], absentMembers: [] };
        } else if (url.pathname === '/api/branches/bootstrap' || url.pathname === '/api/bootstrap') {
            const branch = { id: 1, name: 'QA Main Branch', code: 'qa-main', status: 'active', isMain: true };
            payload = { branches: [branch], activeBranches: [branch], defaultBranch: branch, sections: [], branchLimit: 5, hasMultipleActiveBranches: false, canUseAllBranches: true };
        }
        return route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(payload) });
    });
    return { writes, externalRequests, stylesheetRequests, pageErrors };
}

test('Reports route dynamically mounts and remains visually contained across viewport, theme and direction matrix', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'A single deterministic browser project records the visual matrix.');
    test.setTimeout(180_000);
    const runtime = await installReadOnlyFixtures(page);
    await page.goto('/index.html#reports', { waitUntil: 'domcontentloaded' });
    const reportsNav = page.locator('[data-page-tab="reports"]');
    await expect(reportsNav).toBeVisible({ timeout: 20_000 });
    await reportsNav.click();
    const section = page.locator('#reportsSection');
    await expect(section).toBeVisible();
    await expect(section.locator('#reportsOverviewView .report-kpi')).toHaveCount(6, { timeout: 20_000 });
    await expect(section.locator('#reportsOverviewView .reports-debtors-table tbody tr')).toHaveCount(1);
    await expect.poll(() => page.evaluate(() => [...document.styleSheets].some((sheet) => sheet.href?.includes('/css/pages/reports.css')))).toBe(true);
    await expect.poll(() => runtime.stylesheetRequests.length).toBeGreaterThan(0);
    await fs.promises.mkdir(ARTIFACT_DIR, { recursive: true });

    const measurements = [];
    for (const width of WIDTHS) {
        for (const theme of THEMES) {
            for (const direction of DIRECTIONS) {
                await page.setViewportSize({ width, height: width < 600 ? 850 : 1000 });
                await page.evaluate(({ mode, dir }) => {
                    document.documentElement.dataset.theme = mode;
                    document.body.dataset.theme = mode;
                    document.documentElement.dir = dir;
                    document.body.dir = dir;
                }, { mode: theme, dir: direction });
                await page.evaluate(() => document.fonts.ready);

                const state = await section.evaluate((root) => {
                    const rect = (selector) => {
                        const node = root.querySelector(selector);
                        if (!node || !node.getClientRects().length) return null;
                        const box = node.getBoundingClientRect();
                        return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height };
                    };
                    const rootRect = root.getBoundingClientRect();
                    const tableWrap = root.querySelector('#reportsOverviewView .reports-table-wrap');
                    const table = root.querySelector('#reportsOverviewView .reports-table');
                    return {
                        viewport: innerWidth,
                        documentWidth: document.documentElement.scrollWidth,
                        bodyWidth: document.body.scrollWidth,
                        sectionWidth: rootRect.width,
                        direction: getComputedStyle(root).direction,
                        theme: document.documentElement.dataset.theme,
                        title: rect('.reports-heading'),
                        headerActions: rect('.reports-actions'),
                        tabs: rect('.reports-tabs'),
                        filters: rect('.reports-filters'),
                        kpis: [...root.querySelectorAll('#reportsOverviewView .report-kpi')].map((node) => {
                            const box = node.getBoundingClientRect();
                            return { left: box.left, right: box.right, width: box.width, height: box.height };
                        }),
                        tableViewport: tableWrap ? { left: tableWrap.getBoundingClientRect().left, right: tableWrap.getBoundingClientRect().right, width: tableWrap.clientWidth } : null,
                        tableContentWidth: table?.scrollWidth || 0,
                        activeTabCount: root.querySelectorAll('#reportsTabs [aria-selected="true"]').length,
                        hiddenViewsRemain: [...root.querySelectorAll('.reports-view')].filter((node) => node.hidden).length
                    };
                });

                expect(state.direction, `${width}px ${theme}/${direction}: reports direction`).toBe(direction);
                expect(state.theme).toBe(theme);
                expect(state.documentWidth, `${width}px ${theme}/${direction}: document overflow`).toBeLessThanOrEqual(width);
                expect(state.bodyWidth, `${width}px ${theme}/${direction}: body overflow`).toBeLessThanOrEqual(width);
                expect(state.sectionWidth).toBeGreaterThan(0);
                expect(state.title).not.toBeNull();
                expect(state.headerActions).not.toBeNull();
                expect(state.tabs).not.toBeNull();
                expect(state.filters).not.toBeNull();
                expect(state.kpis).toHaveLength(6);
                expect(state.activeTabCount).toBe(1);
                expect(state.tableViewport.width).toBeLessThanOrEqual(state.sectionWidth);
                expect(state.tableContentWidth).toBeGreaterThanOrEqual(state.tableViewport.width);
                expect(state.title.left).toBeGreaterThanOrEqual(0);
                expect(state.title.right).toBeLessThanOrEqual(width);

                const screenshot = path.join(ARTIFACT_DIR, `reports-${width}-${theme}-${direction}.png`);
                await page.screenshot({ path: screenshot, fullPage: true });
                measurements.push({ width, theme, direction, ...state, screenshot: path.basename(screenshot) });
            }
        }
    }

    await fs.promises.writeFile(path.join(ARTIFACT_DIR, 'matrix.json'), JSON.stringify({ cases: measurements.length, measurements, writes: runtime.writes, pageErrors: runtime.pageErrors, dynamicStylesheetRequests: runtime.stylesheetRequests }, null, 2));
    expect(runtime.writes, 'The read-only matrix must not issue API writes.').toEqual([]);
    expect(runtime.pageErrors, 'No uncaught page errors during reports visual matrix.').toEqual([]);
    expect(runtime.externalRequests, 'The isolated test must not make external network requests.').toEqual([]);
    expect(measurements).toHaveLength(16);
});
