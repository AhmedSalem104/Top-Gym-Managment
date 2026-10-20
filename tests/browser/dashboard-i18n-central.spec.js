const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const featureCatalog = require('../../src/services/feature-catalog');
const planCatalog = require('../../src/services/saas-plan-catalog');

const WIDTHS = [320, 390, 768, 1440];
const THEMES = ['light', 'dark'];
const SCREENSHOT_DIR = path.resolve(process.cwd(), 'qa/artifacts/dashboard-i18n-central-2026-10-12');

async function installReadOnlyFixture(page) {
    const writes = [];
    const external = [];
    const apiRequests = [];
    const plan = planCatalog.PLAN_CONFIGURATIONS.find((item) => item.code === 'business');

    await page.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== 'http://127.0.0.1:4173') {
            external.push(url.href);
            return route.abort('blockedbyclient');
        }
        return route.continue();
    });

    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;
        const method = request.method().toUpperCase();
        if (pathname.endsWith('/stream')) {
            return route.fulfill({ status: 200, contentType: 'text/event-stream; charset=utf-8', body: ': read-only localization fixture\n\n' });
        }
        if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
            writes.push(`${method} ${pathname}`);
            return route.fulfill({ status: 405, contentType: 'application/json', body: JSON.stringify({ error: 'Read-only dashboard fixture.' }) });
        }
        apiRequests.push(`${method} ${pathname}${new URL(request.url()).search}`);

        let payload = {};
        if (pathname === '/api/auth/session') {
            payload = { authenticated: true, user: { id: 98201, name: 'Dashboard QA Owner', role: 'Owner', tenantId: 98201, tenantType: 'gym', permissions: ['dashboard.read', 'finance.read', 'attendance.read', 'day_passes.read'] } };
        } else if (pathname === '/api/branding') {
            payload = { branding: { identity: { brandName: 'Dashboard QA Gym' }, assets: {} } };
        } else if (pathname === '/api/saas/entitlements') {
            payload = { tenantStatus: 'active', subscription: { status: 'active', plan: { code: 'business', name: plan.name } }, entitlements: { tenantType: 'gym', features: planCatalog.featureFlagsForPlan('business'), featureCatalog: featureCatalog.getFeatureCatalog({ tenantType: 'gym' }), limits: {} } };
        } else if (pathname === '/api/branches/bootstrap') {
            const branch = { id: 98201, name: 'QA Main Branch', status: 'active', isMain: true };
            payload = { branch, branches: [branch], activeBranches: [branch], defaultBranch: branch, sections: [], branchLimit: 1, hasMultipleActiveBranches: false };
        } else if (pathname === '/api/bootstrap') {
            payload = { branches: [{ id: 98201, name: 'QA Main Branch', status: 'active' }], sections: [] };
        } else if (pathname === '/api/dashboard') {
            payload = {
                stats: { total: 125, active: 98, expiringSoon: 8, expired: 12, frozen: 7 },
                alerts: [
                    { id: 501, fullName: 'QA Member One', phone: '+201001234567', phoneCountry: 'EG', alertKind: 'membership', alertKey: 'expired-501', membership: { status: 'expired', endDate: '2026-08-08', effectiveEndDate: '2026-08-08', amountRemaining: 0 } },
                    { id: 502, fullName: 'QA Member Two', phone: '+201009876543', phoneCountry: 'EG', alertKind: 'debt', alertKey: 'debt-502', membership: { status: 'active', effectiveEndDate: '2026-12-30', amountRemaining: 275.5 } },
                    { id: 503, fullName: 'QA Member Three', phone: '+201001112233', phoneCountry: 'EG', alertKind: 'inactive', daysSinceLastVisit: 14, alertKey: 'inactive-503', membership: { status: 'frozen', freezeEnd: '2026-10-20', effectiveEndDate: '2026-10-20', amountRemaining: 0 } }
                ]
            };
        } else if (pathname === '/api/saas/subscription') {
            payload = { subscription: { status: 'active', plan: { code: 'business', name: plan.name }, startsAt: '2026-01-01' } };
        }
        return route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(payload) });
    });

    return { writes, external, apiRequests };
}

test.describe('Gym Dashboard centralized Arabic/English localization (read-only)', () => {
    test('switches dashboard locale live across responsive themes without route or API changes', async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== 'desktop', 'Capture the full width/theme/locale matrix once in the desktop project.');
        test.setTimeout(120_000);
        await page.addInitScript(() => localStorage.setItem('logic-fit-ui-locale', 'ar'));
        const runtime = await installReadOnlyFixture(page);
        const pageErrors = [];
        const consoleErrors = [];
        page.on('pageerror', (error) => pageErrors.push(error.message));
        page.on('console', (message) => {
            if (message.type() === 'error' && !message.text().includes('ERR_BLOCKED_BY_CLIENT')) consoleErrors.push(message.text());
        });
        const selectLocale = async (locale) => {
            const button = page.locator(`.topbar-language-toggle [data-locale-choice="${locale}"]`);
            if (!(await button.isVisible())) {
                const menu = page.locator('.topbar-more-menu');
                if (!(await menu.getAttribute('open'))) await menu.locator('summary').click();
            }
            await button.click();
        };

        await page.goto('/index.html?welcome=1#dashboard', { waitUntil: 'domcontentloaded' });
        await expect(page.locator('body')).toHaveAttribute('data-top-gym-authenticated', 'true');
        await page.evaluate(() => window.topGymAppUsable);
        await expect(page.locator('#dashboardViewTabs')).toBeVisible();
        await expect(page.locator('#dashboardOverviewTab')).toHaveAttribute('aria-selected', 'true');
        await expect(page.locator('#dashboardOverviewPanel')).toBeVisible();
        await expect(page.locator('#dashboardSection .dashboard-overview-shell')).toBeVisible();
        await expect(page.locator('#dashboardSection .dashboard-overview-cards')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('#dashboardSection .dashboard-overview-card')).toHaveCount(4);
        await expect.poll(() => runtime.apiRequests.filter((request) => request.includes('/api/notifications')).length).toBe(2);
        await expect.poll(() => runtime.apiRequests.some((request) => request.includes('/api/saas/subscription'))).toBe(true);
        await expect(page.locator('[data-dashboard-overview-date]')).not.toHaveText('—');
        await expect(page.locator('[data-dashboard-overview-plan]')).not.toHaveText('—');
        await expect(page.locator('#alertsList .alert-card')).toHaveCount(3);
        await expect(page.locator('#dashboardDayPassTableWrap .day-pass-empty')).toHaveText('لا توجد حصص مسجلة خلال هذا الشهر.');
        await expect(page.locator('#dashboardAnalyticsTab')).toBeVisible();
        await page.locator('#dashboardOverviewTab').focus();
        await page.keyboard.press('ArrowLeft');
        await expect(page.locator('#dashboardAnalyticsTab')).toHaveAttribute('aria-selected', 'true');
        await page.keyboard.press('ArrowRight');
        await expect(page.locator('#dashboardOverviewTab')).toHaveAttribute('aria-selected', 'true');
        const dashboardHash = await page.evaluate(() => location.hash);
        await page.locator('#dashboardAnalyticsTab').click();
        await expect(page.locator('#dashboardAnalyticsTab')).toHaveAttribute('aria-selected', 'true');
        await expect(page.locator('#dashboardAnalyticsPanel')).toBeVisible();
        await expect(page.locator('#dashboardAnalytics')).toBeVisible();
        await expect(page.locator('#dashboardAnalyticsTitle')).toBeVisible();
        await expect(page.locator('#dashboardOverviewPanel')).toBeHidden();
        await page.locator('#dashboardOverviewTab').click();
        await expect(page.locator('#dashboardOverviewPanel')).toBeVisible();
        await expect(page.locator('#alertsSection')).toBeVisible();
        await expect(page.locator('#dashboardDayPassCard')).toBeVisible();
        expect(await page.evaluate(() => location.hash)).toBe(dashboardHash);
        await expect(page.locator('#statTotal')).toHaveText('١٢٥');
        await expect(page.locator('#alertsList .alert-card-detail').first()).toContainText('انتهت في');
        await fs.mkdir(SCREENSHOT_DIR, { recursive: true });

        const screenshots = [];
        for (const width of WIDTHS) {
            await page.setViewportSize({ width, height: width <= 390 ? 844 : 1000 });
            for (const theme of THEMES) {
                await page.evaluate((mode) => {
                    document.documentElement.dataset.theme = mode;
                    document.body.dataset.theme = mode;
                }, theme);
                if (await page.evaluate(() => window.TopGymI18n.get()) !== 'ar') {
                    await selectLocale('ar');
                    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
                }
                await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
                await expect(page.locator('#dashboardOverviewTab')).toContainText('نظرة عامة');
                await expect(page.locator('#dashboardAnalyticsTab')).toContainText('التحليلات');
                const rtlDirection = await page.evaluate(() => ({
                    scope: getComputedStyle(document.querySelector('#dashboardScopeBar')).direction,
                    overview: getComputedStyle(document.querySelector('#dashboardSection .overview-grid')).direction
                }));
                expect(rtlDirection).toEqual({ scope: 'rtl', overview: 'rtl' });
                await expect(page.locator('#dashboardScopeTitle')).toHaveText('نطاق البيانات المعروضة');
                await expect(page.locator('[data-dashboard-member-count]')).toHaveText('١٢٥');
                await expect(page.locator('#alertsSearch')).toHaveAttribute('placeholder', 'ابحث باسم المشترك أو رقم الهاتف');
                if ([320, 1440].includes(width)) {
                    await page.evaluate(() => document.fonts.ready);
                    const arPath = path.join(SCREENSHOT_DIR, `dashboard-${width}-${theme}-ar.png`);
                    await page.screenshot({ path: arPath, fullPage: false, timeout: 15000 });
                    screenshots.push(arPath);
                }

                const hashBefore = await page.evaluate(() => location.hash);
                const requestsBefore = [...runtime.apiRequests].sort();
                await selectLocale('en');
                await expect(page.locator('html')).toHaveAttribute('lang', 'en');
                await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
                await expect(page.locator('#dashboardOverviewTab')).toContainText('Overview');
                await expect(page.locator('#dashboardAnalyticsTab')).toContainText('Analytics');
                const ltrDirection = await page.evaluate(() => {
                    const input = document.querySelector('#alertsSearch');
                    const icon = input?.closest('.alerts-search-field')?.querySelector('svg');
                    return {
                        scope: getComputedStyle(document.querySelector('#dashboardScopeBar')).direction,
                        overview: getComputedStyle(document.querySelector('#dashboardSection .overview-grid')).direction,
                        search: getComputedStyle(input).direction,
                        paddingInlineStart: Number.parseFloat(getComputedStyle(input).paddingInlineStart),
                        searchIconOffset: Math.abs(icon.getBoundingClientRect().left - input.getBoundingClientRect().left)
                    };
                });
                expect(ltrDirection.scope).toBe('ltr');
                expect(ltrDirection.overview).toBe('ltr');
                expect(ltrDirection.search).toBe('ltr');
                expect(ltrDirection.paddingInlineStart).toBeGreaterThanOrEqual(28);
                expect(ltrDirection.searchIconOffset).toBeLessThan(24);
                await expect(page.locator('#dashboardScopeTitle')).toHaveText('Displayed data scope');
                await expect(page.locator('[data-dashboard-member-count]')).toHaveText('125');
                await expect(page.locator('#dashboardSection .dashboard-overview-shortcuts-title')).toContainText('Quick shortcuts');
                await expect(page.locator('#alertsSearch')).toHaveAttribute('placeholder', 'Search by member name or phone');
                await expect(page.locator('#alertsSection h3')).toHaveText('Alerts');
                await expect(page.locator('#alertsList .alert-card-detail').first()).toContainText('Expired on');
                await expect(page.locator('#alertsCount')).toContainText('alerts');
                await expect(page.locator('#dashboardDayPassTableWrap .day-pass-empty')).toHaveText('No passes recorded this month.');
                await expect(page.locator('#dashboardDayPassMonthMeta')).toContainText('Summary of passes recorded in');
                await expect(page.locator('#dashboardDayPassCount')).toHaveText('0');
                await expect(page.locator('#dashboardDayPassTotal')).toContainText('EGP');
                await expect.poll(() => [...runtime.apiRequests].sort()).toEqual(requestsBefore);
                expect(await page.evaluate(() => location.hash)).toBe(hashBefore);
                if ([320, 1440].includes(width)) {
                    await page.evaluate(() => document.fonts.ready);
                    const enPath = path.join(SCREENSHOT_DIR, `dashboard-${width}-${theme}-en.png`);
                    await page.screenshot({ path: enPath, fullPage: false, timeout: 15000 });
                    screenshots.push(enPath);
                }

                const layout = await page.evaluate(() => ({
                    viewport: document.documentElement.clientWidth,
                    documentWidth: document.documentElement.scrollWidth,
                    bodyWidth: document.body.scrollWidth,
                    direction: getComputedStyle(document.querySelector('#dashboardSection')).direction,
                    fontFamily: getComputedStyle(document.querySelector('#dashboardSection')).fontFamily
                }));
                expect(layout.documentWidth, `${width}px ${theme}: page overflow`).toBeLessThanOrEqual(width);
                expect(layout.bodyWidth, `${width}px ${theme}: body overflow`).toBeLessThanOrEqual(width);
                expect(layout.direction).toBe('ltr');
                expect(layout.fontFamily).toMatch(/Geist|sans-serif/i);
            }
        }

        expect(runtime.writes, 'Localization must not send API writes.').toEqual([]);
        expect(runtime.external.every((url) => {
            const parsed = new URL(url);
            return parsed.hostname === 'cdn.jsdelivr.net' && parsed.pathname.startsWith('/npm/sweetalert2@11');
        }), `Unexpected third-party requests: ${runtime.external.join(', ')}`).toBe(true);
        expect(pageErrors).toEqual([]);
        expect(consoleErrors).toEqual([]);
        await fs.writeFile(path.join(SCREENSHOT_DIR, 'screenshots.json'), JSON.stringify(screenshots, null, 2));
    });
});
