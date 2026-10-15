const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const featureCatalog = require('../../src/services/feature-catalog');
const planCatalog = require('../../src/services/saas-plan-catalog');

const ORIGIN = 'http://127.0.0.1:4173';
const WIDTHS = [320, 375, 390, 768, 1024, 1440, 1920];
const THEMES = ['light', 'dark'];
const LOCALES = ['ar', 'en'];
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const ARTIFACT_DIR = path.join(process.cwd(), 'qa/artifacts/portal-analytics-central-i18n');

async function installOwnerReadOnlyFixtures(page) {
    const apiReads = [];
    const writes = [];
    const pageErrors = [];
    let scenario = 'data';
    let holdAnalytics = false;
    let releaseAnalytics = null;
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
        apiReads.push({ path: url.pathname, method, search: url.search });
        if (holdAnalytics && url.pathname === '/api/portal/analytics') await new Promise((resolve) => { releaseAnalytics = resolve; });
        if (url.pathname === '/api/portal/analytics' && scenario === 'error') {
            return route.fulfill({ status: 503, contentType: 'application/json; charset=utf-8', body: '{"error":"Synthetic read-only QA error"}' });
        }
        let payload = {};
        const plan = planCatalog.PLAN_CONFIGURATIONS.find((item) => item.code === 'business');
        if (url.pathname === '/api/auth/session') payload = { authenticated: true, user: { id: 99108, name: 'Portal Analytics QA', role: 'Owner', tenantType: 'gym', permissions: [] } };
        else if (url.pathname === '/api/branding') payload = { branding: { identity: { brandName: 'Portal Analytics QA Gym' }, assets: {} }, identity: { brandName: 'Portal Analytics QA Gym' }, version: 1 };
        else if (url.pathname === '/api/saas/entitlements') payload = { tenantStatus: 'active', subscription: { status: 'active', plan: { code: 'business', name: plan?.name || 'Business' } }, entitlements: { tenantType: 'gym', features: planCatalog.featureFlagsForPlan('business'), featureCatalog: featureCatalog.getFeatureCatalog({ tenantType: 'gym' }) } };
        else if (url.pathname === '/api/bootstrap' || url.pathname === '/api/branches/bootstrap') {
            const branch = { id: 1, name: 'QA Main Branch', code: 'qa-main', status: 'active', isMain: true };
            payload = { branches: [branch], activeBranches: [branch], defaultBranch: branch, sections: [], branchLimit: 5, hasMultipleActiveBranches: false, canUseAllBranches: true };
        } else if (url.pathname === '/api/portal/analytics') {
            payload = scenario === 'empty'
                ? { totals: { pageViews: 0, uniqueVisitors: 0, authenticatedMembers: 0 }, daily: [] }
                : { totals: { pageViews: 1240, uniqueVisitors: 184, authenticatedMembers: 97 }, daily: [{ date: '2026-10-12', pageViews: 76, uniqueVisitors: 31, authenticatedMembers: 19 }], mostVisitedDay: { date: '2026-10-12', pageViews: 76 } };
        }
        return route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(payload) });
    });
    return {
        apiReads, writes, pageErrors,
        setScenario(value) { scenario = value; },
        hold(value) { holdAnalytics = value; },
        release() { releaseAnalytics?.(); releaseAnalytics = null; holdAnalytics = false; }
    };
}

async function openOwnerAnalytics(page) {
    await page.goto('/index.html#portal-analytics', { waitUntil: 'domcontentloaded' });
    const tab = page.locator('[data-page-tab="portal-analytics"]');
    await expect(tab).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => page.locator('html').getAttribute('data-top-gym-active-tab'), { timeout: 20_000 }).toBe('portal-analytics');
    const section = page.locator('#portalAnalyticsSection');
    await expect(section).toBeVisible();
    return section;
}

test('Portal Analytics central Arabic/English copy preserves owner flow and fetched data', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The isolated desktop project records the complete deterministic viewport/theme/locale matrix.');
    test.setTimeout(180_000);
    const runtime = await installOwnerReadOnlyFixtures(page);
    runtime.hold(true);
    const section = await openOwnerAnalytics(page);
    await page.evaluate(() => window.TopGymI18n.set('ar', { persist: false }));
    await expect.poll(() => runtime.apiReads.filter((entry) => entry.path === '/api/portal/analytics').length).toBe(1);
    await expect(section.locator('.portal-analytics-loading')).toContainText('جارٍ تحميل الإحصائيات');
    await page.evaluate(() => window.TopGymI18n.set('en', { persist: false }));
    await expect(section.locator('.portal-analytics-loading')).toContainText('Loading analytics');
    runtime.release();
    await expect(section.locator('.portal-analytics-day')).toBeVisible({ timeout: 20_000 });
    await page.evaluate(() => window.TopGymI18n.set('ar', { persist: false }));
    await expect(section).toHaveAttribute('data-owner-only', '');
    await expect(section.locator('.portal-analytics-card')).toHaveCount(3);
    await expect(section.locator('#portalAnalyticsPageViews')).toHaveText('١٬٢٤٠');
    await section.locator('#portalAnalyticsRange').selectOption('7');
    await expect.poll(() => runtime.apiReads.filter((entry) => entry.path === '/api/portal/analytics').length).toBe(2);
    const rangeBefore = await section.locator('#portalAnalyticsRange').inputValue();
    const apiCountBeforeMatrix = runtime.apiReads.filter((entry) => entry.path === '/api/portal/analytics').length;
    const rangeQueryBefore = runtime.apiReads.filter((entry) => entry.path === '/api/portal/analytics').at(-1).search;
    await fs.mkdir(ARTIFACT_DIR, { recursive: true });

    const captures = [];
    for (const width of WIDTHS) {
        for (const theme of THEMES) {
            for (const locale of LOCALES) {
                await page.setViewportSize({ width, height: width < 600 ? 850 : 1000 });
                await page.evaluate(({ mode, language }) => {
                    document.documentElement.dataset.theme = mode;
                    document.body.dataset.theme = mode;
                    window.TopGymI18n.set(language, { persist: false });
                }, { mode: theme, language: locale });
                await expect(section.locator('#portalAnalyticsRange')).toHaveValue('7');
                await expect(section.locator('#portalAnalyticsPageViews')).toHaveText(locale === 'ar' ? '١٬٢٤٠' : '1,240');
                await expect(section.locator('.portal-analytics-day')).toContainText(locale === 'ar' ? 'مشاهدات' : 'Views');
                await expect(section.locator('.portal-analytics-highlight')).toContainText(locale === 'ar' ? 'أكثر يوم زيارة' : 'Most visited day');
                await expect(section.locator('#portalAnalyticsRangeLabel')).toBeVisible();
                await expect(page).toHaveURL(/#portal-analytics$/);
                const layout = await page.evaluate(() => ({
                    locale: document.documentElement.lang,
                    direction: document.documentElement.dir,
                    bodyWidth: document.body.scrollWidth,
                    documentWidth: document.documentElement.scrollWidth,
                    range: document.getElementById('portalAnalyticsRange').value,
                    displayedMemberCount: document.getElementById('portalAnalyticsAuthenticatedMembers').textContent
                }));
                expect(layout.locale).toBe(locale);
                expect(layout.direction).toBe(locale === 'ar' ? 'rtl' : 'ltr');
                expect(layout.bodyWidth, `${width}px ${theme}/${locale}: body overflow`).toBeLessThanOrEqual(width);
                expect(layout.documentWidth, `${width}px ${theme}/${locale}: document overflow`).toBeLessThanOrEqual(width);
                expect(layout.range).toBe('7');
                expect(layout.displayedMemberCount).toBe(locale === 'ar' ? '٩٧' : '97');
                const screenshot = `portal-analytics-${width}-${theme}-${locale}.png`;
                await page.screenshot({ path: path.join(ARTIFACT_DIR, screenshot), fullPage: true });
                captures.push({ width, theme, locale, screenshot, ...layout });
            }
        }
    }
    expect(await section.locator('#portalAnalyticsRange').inputValue()).toBe(rangeBefore);
    expect(runtime.apiReads.filter((entry) => entry.path === '/api/portal/analytics').length).toBe(apiCountBeforeMatrix);
    expect(runtime.apiReads.filter((entry) => entry.path === '/api/portal/analytics').at(-1).search).toBe(rangeQueryBefore);
    expect(runtime.writes).toEqual([]);

    await page.evaluate(() => window.TopGymI18n.set('ar', { persist: false }));
    runtime.setScenario('empty');
    await section.locator('#portalAnalyticsRefresh').click();
    await expect(section.locator('.portal-analytics-empty strong')).toContainText('لا توجد زيارات');
    await expect(section.locator('#portalAnalyticsRefresh')).toBeEnabled();
    await page.evaluate(() => window.TopGymI18n.set('en', { persist: false }));
    await expect(section.locator('.portal-analytics-empty strong')).toHaveText('No visits recorded for this period');

    runtime.setScenario('error');
    await page.evaluate(() => window.TopGymI18n.set('ar', { persist: false }));
    await section.locator('#portalAnalyticsRefresh').click();
    await expect(section.locator('#portalAnalyticsStatus')).toHaveText('تعذر تحميل إحصائيات البوابة. حاول مرة أخرى.');
    await expect(section.locator('#portalAnalyticsRefresh')).toBeEnabled();
    await page.evaluate(() => window.TopGymI18n.set('en', { persist: false }));
    await expect(section.locator('#portalAnalyticsStatus')).toHaveText('Could not load portal analytics. Please try again.');

    runtime.setScenario('data');
    runtime.hold(true);
    const readsBeforeLoading = runtime.apiReads.filter((entry) => entry.path === '/api/portal/analytics').length;
    await section.locator('#portalAnalyticsRefresh').click();
    await expect.poll(() => runtime.apiReads.filter((entry) => entry.path === '/api/portal/analytics').length).toBe(readsBeforeLoading + 1);
    await expect(section.locator('#portalAnalyticsRefresh')).toBeDisabled();
    await expect(section.locator('#portalAnalyticsRefresh')).toHaveAttribute('aria-busy', 'true');
    await page.evaluate(() => window.TopGymI18n.set('en', { persist: false }));
    await expect(section.locator('#portalAnalyticsRefresh')).toHaveAttribute('aria-busy', 'true');
    await expect(section.locator('#portalAnalyticsRefresh')).toHaveAttribute('aria-label', 'Refreshing analytics...');
    runtime.release();
    await expect(section.locator('#portalAnalyticsRefresh')).toBeEnabled();
    expect(runtime.writes).toEqual([]);
    expect(runtime.pageErrors).toEqual([]);
    await fs.writeFile(path.join(ARTIFACT_DIR, 'matrix.json'), JSON.stringify({ cases: captures.length, captures, apiReads: runtime.apiReads, writes: runtime.writes, pageErrors: runtime.pageErrors }, null, 2));
    expect(captures).toHaveLength(WIDTHS.length * THEMES.length * LOCALES.length);
});
