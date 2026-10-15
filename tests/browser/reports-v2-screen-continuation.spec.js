const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const featureCatalog = require('../../src/services/feature-catalog');
const planCatalog = require('../../src/services/saas-plan-catalog');

const ORIGIN = 'http://127.0.0.1:4173';
const WIDTHS = [320, 375, 390, 768, 1024, 1440, 1920];
const THEMES = ['light', 'dark'];
const LOCALES = ['ar', 'en'];
const REPORT_TABS = ['overview', 'attendance', 'memberships', 'finance', 'coaching', 'library', 'backups'];
const OUTPUT = path.join(process.cwd(), 'qa/artifacts/reports-v2-screen-continuation');
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function reportFixture({ empty = false } = {}) {
    return {
        period: { from: '2026-10-01', to: '2026-10-12' },
        summary: {
            currentMembers: 137, newMembers: 23, newMemberships: 19,
            collected: 48250, paidTransactions: 42, expenses: 13750,
            expensesCount: 8, net: 34500, outstanding: 6200, outstandingCount: 6, debtorsCount: 1
        },
        timeline: [{ date: '2026-10-12', newMembers: 9, newMemberships: 8, collected: 18250, expenses: 2100 }],
        breakdown: {
            plans: [{ key: 'gym_only', value: 81 }, { key: 'gym_cardio', value: 56 }],
            paymentMethods: [{ key: 'cash', amount: 30250, count: 29 }],
            statuses: [{ key: 'active', value: 119 }, { key: 'expired', value: 6 }]
        },
        members: [],
        memberships: empty ? [] : [{ id: 8231, fullName: 'Client QA', phone: '01012345678', plan: 'gym_only', type: 'monthly', status: 'active', startDate: '2026-10-01', endDate: '2026-10-31', amountDue: 500, amountPaid: 200, amountRemaining: 300 }],
        debtors: empty ? [] : [{ id: 8231, fullName: 'Reports QA Member', phone: '01012345678', plan: 'gym_only', amountRemaining: 300 }],
        payments: [], expenses: [], coaching: { summary: {} },
        library: { counts: { foods: 84, newFoods: 3, exercises: 240, newExercises: 8, muscles: 24, newMuscles: 1 } }
    };
}

async function installSyntheticReadOnlyApi(page, { empty = false, reportsStatus = 200, reportsDelay = 0 } = {}) {
    const writes = [];
    const apiReads = [];
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
            return route.fulfill({ status: 405, contentType: 'application/json', body: '{"error":"read-only QA"}' });
        }
        apiReads.push({ path: url.pathname, method });

        let payload = {};
        if (url.pathname === '/api/auth/session') {
            payload = { authenticated: true, user: { id: 97201, name: 'Reports Visual QA', role: 'Owner', tenantType: 'gym' } };
        } else if (url.pathname === '/api/branding') {
            payload = { branding: { identity: { brandName: 'Reports QA Gym' }, assets: {} }, version: 1 };
        } else if (url.pathname === '/api/saas/entitlements') {
            payload = {
                tenantStatus: 'active', subscription: { status: 'active', plan: { code: 'business', name: 'Business' } },
                entitlements: {
                    tenantType: 'gym', features: planCatalog.featureFlagsForPlan('business'),
                    featureCatalog: featureCatalog.getFeatureCatalog({ tenantType: 'gym' })
                }
            };
        } else if (url.pathname === '/api/reports') {
            if (reportsDelay) await new Promise((resolve) => setTimeout(resolve, reportsDelay));
            if (reportsStatus !== 200) return route.fulfill({ status: reportsStatus, contentType: 'application/json', body: '{"error":"synthetic report failure"}' });
            payload = reportFixture({ empty });
        } else if (url.pathname === '/api/attendance/report') {
            payload = { summary: {}, daily: [], members: [], absentMembers: [] };
        } else if (url.pathname.includes('/branches/bootstrap') || url.pathname === '/api/bootstrap') {
            const branch = { id: 1, name: 'QA Main Branch', code: 'qa-main', status: 'active', isMain: true };
            payload = { branches: [branch], activeBranches: [branch], defaultBranch: branch, sections: [], branchLimit: 5, hasMultipleActiveBranches: false, canUseAllBranches: true };
        }
        return route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(payload) });
    });
    return { writes, apiReads, pageErrors };
}

async function openReports(page) {
    await page.goto('/index.html#reports', { waitUntil: 'domcontentloaded' });
    const reportsTab = page.locator('[data-page-tab="reports"]');
    await expect(reportsTab).toBeVisible({ timeout: 20_000 });
    await reportsTab.click();
    await expect(page.locator('#reportsSection')).toBeVisible();
}

async function captureArabicUiText(page) {
    return page.locator('#reportsSection').evaluate((root) => {
        const arabicLetters = /[\u0621-\u064A\u066E-\u06D3\u06FA-\u06FF]/u;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const values = new Set();
        const skipped = [];
        while (walker.nextNode()) {
            const node = walker.currentNode;
            const text = node.nodeValue.replace(/\s+/gu, ' ').trim();
            if (!text || !arabicLetters.test(text)) continue;
            if (node.parentElement.getClientRects().length === 0) continue;
            const preserve = node.parentElement.closest('[data-i18n-preserve]');
            const memberData = node.parentElement.closest('.reports-table tbody strong');
            if (preserve || memberData) {
                skipped.push({ text, reason: preserve ? 'preserved-copy' : 'member-data' });
                continue;
            }
            // Do not report numeral/date-only strings or the Arabic EGP abbreviation as untranslated prose.
            const prose = text.replace(/[\d٠-٩۰-۹\s.,:٪%()/\-–—]/gu, '').replace(/ج\.م/gu, '');
            if (!arabicLetters.test(prose)) continue;
            values.add(text);
        }
        return { values: [...values].sort(), skipped };
    });
}

test('Reports V2 visual, locale and loaded-CSS matrix', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'One deterministic runner covers the complete viewport/theme/locale matrix.');
    test.setTimeout(300_000);
    const runtime = await installSyntheticReadOnlyApi(page);
    await openReports(page);
    const section = page.locator('#reportsSection');
    await expect(section.locator('#reportsTabs [data-report-tab]')).toHaveCount(7, { timeout: 20_000 });
    await expect(section.locator('#reportsOverviewView .report-kpi')).toHaveCount(6, { timeout: 20_000 });

    const loadedStyles = await page.evaluate(() => [...document.styleSheets]
        .map((sheet) => sheet.href)
        .filter((href) => href && href.includes('/css/pages/reports.css')));
    expect(loadedStyles, 'Reports CSS must be loaded through the application feature loader, not injected into the test page.').toHaveLength(1);
    const loadedRule = await page.locator('#reportsSection .reports-header').evaluate((node) => ({
        display: getComputedStyle(node).display,
        radius: getComputedStyle(node).borderRadius,
        padding: getComputedStyle(node).padding
    }));
    expect(loadedRule.display).toBe('flex');
    await fs.mkdir(OUTPUT, { recursive: true });

    const measurements = [];
    const mobileCardAudits = [];
    const translationGaps = new Map();
    const preservedArabicData = new Map();
    const tabScreenshots = new Set();
    for (const locale of LOCALES) {
        for (const theme of THEMES) {
            for (const width of WIDTHS) {
                await page.setViewportSize({ width, height: width < 600 ? 820 : 960 });
                await page.evaluate(({ mode, language }) => {
                    document.documentElement.dataset.theme = mode;
                    document.body.dataset.theme = mode;
                    window.TopGymI18n.set(language, { persist: false });
                }, { mode: theme, language: locale });

                for (const tabName of REPORT_TABS) {
                    const tab = section.locator(`[data-report-tab="${tabName}"]`);
                    await tab.click();
                    await expect(tab).toHaveAttribute('aria-selected', 'true');
                    const activeView = section.locator('.reports-view:not([hidden])').first();
                    await expect(activeView).toBeVisible();
                    const state = await page.evaluate(() => {
                        const root = document.querySelector('#reportsSection');
                        const active = root.querySelector('.reports-view:not([hidden])');
                        const rect = active.getBoundingClientRect();
                        return {
                            locale: document.documentElement.lang,
                            direction: getComputedStyle(root).direction,
                            theme: document.documentElement.dataset.theme,
                            body: document.body.scrollWidth,
                            document: document.documentElement.scrollWidth,
                            activeViewWidth: rect.width,
                            activeViewRight: rect.right,
                            mobileTables: window.innerWidth <= 767
                                ? [...active.querySelectorAll('.reports-table.table-card-layout')].map((table) => ({
                                    table: table.className,
                                    rows: [...table.tBodies].flatMap((body) => [...body.rows]).map((row) => ({
                                        columns: getComputedStyle(row).gridTemplateColumns,
                                        cells: [...row.cells].map((cell) => ({
                                            label: cell.dataset.label || '',
                                            width: Math.round(cell.clientWidth),
                                            contentWidth: Math.round(cell.scrollWidth),
                                            columns: getComputedStyle(cell).gridTemplateColumns
                                        }))
                                    })),
                                    actions: [...table.querySelectorAll('.reports-debtor-actions, .reports-coaching-actions')].map((node) => ({
                                        flexWrap: getComputedStyle(node).flexWrap,
                                        clientWidth: node.clientWidth,
                                        scrollWidth: node.scrollWidth
                                    }))
                                }))
                                : [],
                            touchTargets: window.innerWidth <= 767
                                ? [...active.querySelectorAll('button, input, select, a[href]')]
                                    .filter((node) => node.getClientRects().length > 0)
                                    .map((node) => ({
                                        label: (node.getAttribute('aria-label') || node.textContent || node.getAttribute('placeholder') || '').trim().replace(/\s+/gu, ' ').slice(0, 50),
                                        width: Math.round(node.getBoundingClientRect().width),
                                        height: Math.round(node.getBoundingClientRect().height)
                                    }))
                                : [],
                            cssLoaded: [...document.styleSheets].some((sheet) => sheet.href && sheet.href.includes('/css/pages/reports.css'))
                        };
                    });
                    expect(state.locale, `${tabName}/${width}/${theme}/${locale}: locale`).toBe(locale);
                    expect(state.direction, `${tabName}/${width}/${theme}/${locale}: direction`).toBe(locale === 'ar' ? 'rtl' : 'ltr');
                    expect(state.theme).toBe(theme);
                    expect(state.body, `${tabName}/${width}/${theme}/${locale}: body overflow`).toBeLessThanOrEqual(width);
                    expect(state.document, `${tabName}/${width}/${theme}/${locale}: document overflow`).toBeLessThanOrEqual(width);
                    expect(state.activeViewWidth, `${tabName}/${width}/${theme}/${locale}: visible tab view`).toBeGreaterThan(0);
                    expect(state.cssLoaded).toBe(true);
                    if (width <= 767) {
                        const tableErrors = state.mobileTables.flatMap((table) => table.rows.flatMap((row) => {
                            const rowTracks = row.columns.trim().split(/\s+/u).length;
                            return [
                                ...(rowTracks !== 1 ? [`${table.table}: expected one stacked row track, got ${row.columns}`] : []),
                                ...row.cells.filter((cell) => cell.contentWidth > cell.width + 1)
                                    .map((cell) => `${table.table}/${cell.label}: content ${cell.contentWidth}px > cell ${cell.width}px`)
                            ];
                        }));
                        const actionErrors = state.mobileTables.flatMap((table) => table.actions
                            .filter((actions) => actions.flexWrap !== 'wrap' || actions.scrollWidth > actions.clientWidth + 1)
                            .map(() => `${table.table}: action group must wrap without overflow`));
                        const undersizedTargets = state.touchTargets.filter((target) => target.width < 44 || target.height < 44);
                        expect(tableErrors, `${tabName}/${width}/${theme}/${locale}: mobile report table readability`).toEqual([]);
                        expect(actionErrors, `${tabName}/${width}/${theme}/${locale}: mobile report action fit`).toEqual([]);
                        expect(undersizedTargets, `${tabName}/${width}/${theme}/${locale}: mobile touch target minimum`).toEqual([]);
                        mobileCardAudits.push({ tab: tabName, width, theme, locale, tables: state.mobileTables, touchTargets: state.touchTargets });
                    }

                    const audit = locale === 'en' ? await captureArabicUiText(page) : { values: [], skipped: [] };
                    for (const copy of audit.values) translationGaps.set(`${tabName}\t${copy}`, { tab: tabName, text: copy });
                    for (const item of audit.skipped) preservedArabicData.set(`${tabName}\t${item.text}`, { tab: tabName, text: item.text, excludedAs: item.reason });

                    const matrixKey = `${tabName}-${width}-${theme}-${locale}`;
                    if (width === 390 || width === 1440) {
                        const screenshotName = `reports-${matrixKey}.png`;
                        await page.screenshot({ path: path.join(OUTPUT, screenshotName), fullPage: true });
                        tabScreenshots.add(screenshotName);
                    }

                    if (tabName === 'overview') {
                        measurements.push({ tab: tabName, width, theme, locale, ...state });
                        const screenshotName = `reports-overview-${width}-${theme}-${locale}.png`;
                        await page.screenshot({ path: path.join(OUTPUT, screenshotName), fullPage: true });
                        if (width === 320 || width === 390 || width === 1440) {
                            await page.screenshot({ path: path.join(OUTPUT, `reports-overview-viewport-${width}-${theme}-${locale}.png`) });
                        }
                        if (width === 320 && theme === 'light' && locale === 'en') {
                            const debtorTable = section.locator('#reportsOverviewView .reports-debtors-table');
                            if (await debtorTable.count()) {
                                await debtorTable.scrollIntoViewIfNeeded();
                                await page.screenshot({ path: path.join(OUTPUT, 'reports-debtors-viewport-320-light-en.png') });
                                await page.evaluate(() => window.scrollTo(0, 0));
                            }
                        }
                    }
                }
            }
        }
    }

    const reportStateBefore = await page.evaluate(() => ({ hash: location.hash, selected: document.querySelector('#reportsTabs [aria-selected="true"]')?.dataset.reportTab }));
    expect(reportStateBefore.hash).toMatch(/#reports$/);
    expect(runtime.writes, 'Read-only synthetic report QA must not write to the API.').toEqual([]);
    expect(runtime.pageErrors).toEqual([]);
    await fs.writeFile(path.join(OUTPUT, 'matrix.json'), JSON.stringify({
        cases: measurements.length,
        tabCases: LOCALES.length * THEMES.length * WIDTHS.length * REPORT_TABS.length,
        widths: WIDTHS, locales: LOCALES, themes: THEMES, tabs: REPORT_TABS,
        loadedStyles, loadedRule, measurements,
        mobileCardAudits,
        translationGaps: [...translationGaps.values()],
        preservedArabicData: [...preservedArabicData.values()],
        screenshots: [...tabScreenshots], writes: runtime.writes, pageErrors: runtime.pageErrors
    }, null, 2));
    expect(measurements).toHaveLength(28);
    expect(tabScreenshots.size).toBe(56);
});

test('Reports empty, loading and error states remain styled without API writes', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'State coverage runs once with deterministic read-only fixtures.');
    test.setTimeout(90_000);
    const states = {};
    const emptyRuntime = await installSyntheticReadOnlyApi(page, { empty: true });
    await openReports(page);
    await page.locator('#reportsTabs [data-report-tab="memberships"]').click();
    const emptyState = page.locator('#reportsMembershipsView .reports-empty-state').first();
    await expect(emptyState).toBeVisible();
    states.empty = await emptyState.evaluate((node) => ({ text: node.textContent.trim(), minHeight: getComputedStyle(node).minHeight, background: getComputedStyle(node).backgroundColor }));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(OUTPUT, 'reports-empty-390-dark-ar.png'), fullPage: true });

    const loadingPage = await page.context().newPage();
    const loadingRuntime = await installSyntheticReadOnlyApi(loadingPage, { reportsDelay: 900 });
    await openReports(loadingPage);
    const loadingNode = loadingPage.locator('#reportsOverviewView .reports-loading');
    await expect(loadingNode).toBeVisible();
    states.loading = await loadingNode.evaluate((node) => ({ text: node.textContent.trim(), minHeight: getComputedStyle(node).minHeight, color: getComputedStyle(node).color }));
    await loadingPage.setViewportSize({ width: 390, height: 844 });
    await loadingPage.screenshot({ path: path.join(OUTPUT, 'reports-loading-390-dark-ar.png'), fullPage: true });
    await expect(loadingPage.locator('#reportsOverviewView .report-kpi')).toHaveCount(6, { timeout: 20_000 });
    expect(emptyRuntime.writes).toEqual([]);
    expect(loadingRuntime.writes).toEqual([]);

    const errorPage = await page.context().newPage();
    const errorRuntime = await installSyntheticReadOnlyApi(errorPage, { reportsStatus: 503 });
    await openReports(errorPage);
    const errorState = errorPage.locator('#reportsOverviewView .reports-error').first();
    await expect(errorState).toBeVisible({ timeout: 20_000 });
    states.error = await errorState.evaluate((node) => ({ text: node.textContent.trim(), minHeight: getComputedStyle(node).minHeight, color: getComputedStyle(node).color }));
    expect(errorRuntime.writes).toEqual([]);
    expect(errorRuntime.pageErrors).toEqual([]);
    await fs.writeFile(path.join(OUTPUT, 'states.json'), JSON.stringify(states, null, 2));
    await errorPage.screenshot({ path: path.join(OUTPUT, 'reports-error-390-dark-ar.png'), fullPage: true });
    await Promise.all([loadingPage.close(), errorPage.close()]);
});

test('Reports debtor record stays readable as a mobile card at 320px', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The focused narrow-screen check runs once in the deterministic desktop project.');
    const runtime = await installSyntheticReadOnlyApi(page);
    await openReports(page);
    await page.setViewportSize({ width: 320, height: 820 });
    await page.evaluate(() => {
        document.documentElement.dataset.theme = 'light';
        document.body.dataset.theme = 'light';
        window.TopGymI18n.set('en', { persist: false });
    });

    const table = page.locator('#reportsOverviewView .reports-debtors-table');
    await expect(table).toBeVisible();
    await expect(table.locator('tbody tr')).toHaveCount(1);
    await table.scrollIntoViewIfNeeded();
    const audit = await table.evaluate((node) => {
        const row = node.tBodies[0].rows[0];
        const actions = node.querySelector('.reports-debtor-actions');
        return {
            tableWidth: node.clientWidth,
            rowColumns: getComputedStyle(row).gridTemplateColumns,
            cells: [...row.cells].map((cell) => ({
                label: cell.dataset.label,
                width: cell.clientWidth,
                contentWidth: cell.scrollWidth,
                text: cell.textContent.trim()
            })),
            actionLayout: actions ? {
                flexWrap: getComputedStyle(actions).flexWrap,
                width: actions.clientWidth,
                contentWidth: actions.scrollWidth,
                targets: [...actions.querySelectorAll('button, a')].map((target) => ({
                    width: Math.round(target.getBoundingClientRect().width),
                    height: Math.round(target.getBoundingClientRect().height)
                }))
            } : null
        };
    });
    expect(audit.rowColumns.trim().split(/\s+/u)).toHaveLength(1);
    expect(audit.cells.every((cell) => cell.contentWidth <= cell.width + 1)).toBe(true);
    expect(audit.actionLayout.flexWrap).toBe('wrap');
    expect(audit.actionLayout.contentWidth).toBeLessThanOrEqual(audit.actionLayout.width + 1);
    expect(audit.actionLayout.targets.every((target) => target.width >= 44 && target.height >= 44)).toBe(true);
    expect(runtime.writes).toEqual([]);
    expect(runtime.pageErrors).toEqual([]);
    await fs.mkdir(OUTPUT, { recursive: true });
    await page.screenshot({ path: path.join(OUTPUT, 'reports-debtors-viewport-320-light-en.png') });
    await fs.writeFile(path.join(OUTPUT, 'debtors-320-audit.json'), JSON.stringify({ audit, writes: runtime.writes, pageErrors: runtime.pageErrors }, null, 2));
});
