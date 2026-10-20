const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const featureCatalog = require('../../src/services/feature-catalog');
const planCatalog = require('../../src/services/saas-plan-catalog');

const WIDTHS = [320, 375, 390, 768, 1024, 1440, 1846, 1920];
const THEMES = ['light', 'dark'];
const LOCALES = ['ar', 'en'];
const SCREENSHOT_DIR = path.resolve(process.cwd(), 'qa/artifacts/dashboard-v2-screen-continuation');

function normalizeLocalizedDigits(value) {
    return value.replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
}

async function installReadOnlyDashboardFixture(page, { multipleScopes = false } = {}) {
    const writes = [];
    const thirdParty = [];
    const dashboardRequests = [];
    const dayPassRequests = [];
    let analyticsMode = 'empty';
    let dashboardMode = 'ready';
    let dashboardDelayCount = 0;
    const plan = planCatalog.PLAN_CONFIGURATIONS.find((item) => item.code === 'business');

    await page.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== 'http://127.0.0.1:4173') {
            thirdParty.push(url.href);
            return route.abort('blockedbyclient');
        }
        return route.continue();
    });

    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;
        if (pathname === '/api/dashboard-analytics') {
            if (analyticsMode === 'loading') await new Promise((resolve) => setTimeout(resolve, 900));
            if (analyticsMode === 'error') {
                return route.fulfill({ status: 503, contentType: 'application/json; charset=utf-8', body: JSON.stringify({ error: 'Analytics unavailable in the read-only visual fixture.' }) });
            }
            return route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify({}) });
        }
        if (pathname.endsWith('/stream')) {
            return route.fulfill({ status: 200, contentType: 'text/event-stream; charset=utf-8', body: ': read-only visual fixture\n\n' });
        }
        if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method().toUpperCase())) {
            writes.push(`${request.method()} ${pathname}`);
            return route.fulfill({ status: 405, contentType: 'application/json', body: JSON.stringify({ error: 'Read-only dashboard fixture.' }) });
        }

        let payload = {};
        if (pathname === '/api/auth/session') {
            payload = { authenticated: true, user: { id: 98201, name: 'V2 Dashboard QA', role: 'Owner', tenantId: 98201, tenantType: 'gym', permissions: ['dashboard.read', 'members.read', 'finance.read', 'expenses.read', 'attendance.read'] } };
        } else if (pathname === '/api/branding') {
            payload = { branding: { identity: { brandName: 'V2 Dashboard QA Gym' }, assets: {} } };
        } else if (pathname === '/api/saas/entitlements') {
            payload = {
                tenantStatus: 'active',
                subscription: { status: 'active', plan: { code: 'business', name: plan.name } },
                entitlements: {
                    tenantType: 'gym',
                    features: planCatalog.featureFlagsForPlan('business'),
                    featureCatalog: featureCatalog.getFeatureCatalog({ tenantType: 'gym' }),
                    limits: {}
                }
            };
        } else if (pathname === '/api/branches/bootstrap') {
            const branch = { id: 98201, name: 'QA Main Branch', status: 'active', isMain: true };
            const secondBranch = { id: 98202, name: 'QA Riverside Branch', status: 'active', isMain: false };
            const branches = multipleScopes ? [branch, secondBranch] : [branch];
            const sections = multipleScopes ? [
                { id: 98211, branchId: 98201, name: 'QA Main Section', type: 'mixed', active: true },
                { id: 98221, branchId: 98202, name: 'QA Riverside Section', type: 'women', active: true }
            ] : [];
            payload = { branch, branches, activeBranches: branches, defaultBranch: branch, sections, branchLimit: branches.length, hasMultipleActiveBranches: multipleScopes };
        } else if (pathname === '/api/bootstrap') {
            payload = { branches: [{ id: 98201, name: 'QA Main Branch', status: 'active' }], sections: [] };
        } else if (pathname === '/api/dashboard') {
            const branchId = request.headers()['x-branch-id'] || '';
            dashboardRequests.push({ search: new URL(request.url()).search, branchId });
            if (dashboardMode === 'slow' || dashboardDelayCount > 0) {
                if (dashboardDelayCount > 0) dashboardDelayCount -= 1;
                await new Promise((resolve) => setTimeout(resolve, 900));
            }
            const total = multipleScopes && branchId === '98202' ? 222 : 125;
            payload = { stats: { total, active: 98, expiringSoon: 8, expired: 12, frozen: 7 }, alerts: [] };
        } else if (pathname.startsWith('/api/day-passes')) {
            dayPassRequests.push(pathname);
            payload = pathname.endsWith('/summary') ? { count: 0, amount: 0 } : { records: [], pagination: { total: 0 } };
        } else if (pathname === '/api/saas/subscription') {
            payload = { subscription: { status: 'active', plan: { code: 'business', name: plan.name }, startsAt: '2026-01-01' } };
        }

        return route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(payload) });
    });

    return {
        writes,
        dashboardRequests,
        dayPassRequests,
        thirdParty,
        setAnalyticsMode: (mode) => { analyticsMode = mode; },
        setDashboardMode: (mode) => { dashboardMode = mode; },
        delayNextDashboardRequest: () => { dashboardDelayCount += 1; }
    };
}

test.describe('Dashboard V2 visual continuation (read-only)', () => {
    test('never mounts the obsolete top loading row during slow direct open, reload or navigation', async ({ page }, testInfo) => {
        test.setTimeout(30_000);
        const width = testInfo.project.name.startsWith('mobile') ? 320 : 1440;
        await page.setViewportSize({ width, height: width <= 390 ? 700 : 900 });
        const runtime = await installReadOnlyDashboardFixture(page);
        runtime.setDashboardMode('slow');

        const assertNoTopLoadingRow = async () => {
            const rowCount = await page.locator('#dashboardInitialSkeleton, #dashboardSection > .dashboard-initial-skeleton, #dashboardSection > .skeleton-cards').count();
            expect(rowCount, 'The obsolete top loading row must not be created in the DOM.').toBe(0);
            const layout = await page.locator('#dashboardSection').evaluate((root) => {
                const firstVisibleChild = [...root.children].find((element) => {
                    const style = getComputedStyle(element);
                    return !element.hidden && style.display !== 'none' && style.visibility !== 'hidden';
                });
                return {
                    hasTopLoadingRegion: Boolean(root.querySelector(':scope > .loading, :scope > .skeleton-cards')),
                    firstChildClass: firstVisibleChild?.className || '',
                    firstChildOffsetWithinDashboard: firstVisibleChild
                        ? firstVisibleChild.getBoundingClientRect().top - root.getBoundingClientRect().top
                        : null
                };
            });
            expect(layout.hasTopLoadingRegion).toBe(false);
            expect(layout.firstChildClass).toContain('dashboard-view-tabs');
            return layout.firstChildOffsetWithinDashboard;
        };

        await page.goto('/index.html?noTopSkeleton=direct#dashboard', { waitUntil: 'domcontentloaded' });
        const dashboard = page.locator('#dashboardSection');
        await expect(dashboard).toHaveClass(/data-loading/u);
        const directOpenTop = await assertNoTopLoadingRow();
        await page.screenshot({ path: testInfo.outputPath('dashboard-no-top-skeleton-slow.png'), fullPage: true });
        await expect(dashboard).not.toHaveClass(/data-loading/u, { timeout: 15_000 });
        await expect(page.locator('.dashboard-overview-cards')).toBeVisible();
        await expect(page.locator('.dashboard-overview-cards > .dashboard-overview-card')).toHaveCount(4);
        await expect(page.locator('[data-dashboard-member-count]')).toHaveText(/125|١٢٥/u);
        await page.screenshot({ path: testInfo.outputPath('dashboard-no-top-skeleton-loaded.png'), fullPage: true });
        expect(Math.abs((await assertNoTopLoadingRow()) - directOpenTop)).toBeLessThanOrEqual(1);

        await page.reload({ waitUntil: 'domcontentloaded' });
        await expect(dashboard).toHaveClass(/data-loading/u);
        const reloadTop = await assertNoTopLoadingRow();
        await page.screenshot({ path: testInfo.outputPath('dashboard-no-top-skeleton-reload.png'), fullPage: true });
        await expect(dashboard).not.toHaveClass(/data-loading/u, { timeout: 15_000 });
        expect(Math.abs((await assertNoTopLoadingRow()) - reloadTop)).toBeLessThanOrEqual(1);

        await page.evaluate(() => { window.location.hash = '#members'; });
        await expect(page.locator('#membersSection')).toBeVisible();
        await expect(page.locator('.dashboard-overview-shell')).toBeHidden();
        await page.evaluate(() => { window.location.hash = '#dashboard'; });
        await expect(page.locator('.dashboard-overview-shell')).toBeVisible();
        expect(Math.abs((await assertNoTopLoadingRow()) - reloadTop)).toBeLessThanOrEqual(1);
        expect(runtime.writes).toEqual([]);
    });

    test('overview cards are exclusive to Dashboard for direct routes, reload and browser history', async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== 'desktop', 'Route-scope browser verification runs once in the desktop project.');
        const runtime = await installReadOnlyDashboardFixture(page);

        await page.goto('/index.html?overviewRouteScope=1#members', { waitUntil: 'domcontentloaded' });
        await expect(page.locator('body')).toHaveAttribute('data-top-gym-authenticated', 'true');
        const overview = page.locator('.dashboard-overview-shell');
        await expect(overview).toBeHidden();
        await expect(page.locator('#membersSection')).toBeVisible();

        await page.evaluate(() => { window.location.hash = '#dashboard'; });
        await expect(overview).toBeVisible();
        await page.evaluate(() => { window.location.hash = '#members'; });
        await expect(overview).toBeHidden();
        await page.goBack();
        await expect(overview).toBeVisible();

        await page.goto('/index.html?overviewRouteScopeReload=1#members', { waitUntil: 'domcontentloaded' });
        await expect(overview).toBeHidden();
        expect(runtime.writes).toEqual([]);
    });

    test('scope dialog stages authorized branch and section changes until one atomic Apply', async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== 'desktop', 'Scope state verification runs once in the desktop project.');
        const runtime = await installReadOnlyDashboardFixture(page, { multipleScopes: true });
        await fs.mkdir(SCREENSHOT_DIR, { recursive: true });
        await page.goto('/index.html?dashboardScope=1#dashboard', { waitUntil: 'domcontentloaded' });
        await expect(page.locator('#dashboardScopeBar')).toBeVisible({ timeout: 15000 });
        const scopeButtonSize = await page.locator('#dashboardScopeOpen').evaluate((element) => element.getBoundingClientRect().height);
        expect(scopeButtonSize).toBeGreaterThanOrEqual(48);
        await expect(page.locator('#branchContextShell')).toBeHidden();
        await expect(page.locator('#dashboardScopeBranch')).toHaveText('QA Main Branch');
        await page.evaluate(() => window.addEventListener('topgym:branch-context-changed', (event) => {
            window.__dashboardScopeEvents = [...(window.__dashboardScopeEvents || []), event.detail];
        }));
        await expect.poll(() => runtime.dayPassRequests.length).toBeGreaterThanOrEqual(2);
        const initialBranch = await page.locator('#branchContextSelect').inputValue();
        const initialSection = await page.locator('#sectionContextSelect').inputValue();
        const requestCountBeforeCancel = runtime.dashboardRequests.length;
        const dayPassCountBeforeCancel = runtime.dayPassRequests.length;

        await page.locator('#dashboardScopeOpen').click();
        const dialog = page.locator('#dashboardScopeDialog');
        await expect(dialog).toBeVisible();
        const dialogFrame = await dialog.boundingBox();
        expect(dialogFrame.width).toBeGreaterThan(500);
        expect(dialogFrame.height).toBeLessThanOrEqual(900);
        await expect(dialog).toHaveClass(/lf-modal--form/u);
        await expect(page.locator('.dashboard-scope-dialog-heading-icon')).toBeVisible();
        const chrome = await dialog.evaluate((element) => {
            const header = element.querySelector('.dialog-header');
            const body = element.querySelector('.dashboard-scope-dialog-body');
            const footer = element.querySelector('.dashboard-scope-dialog-actions');
            const styles = (node) => getComputedStyle(node);
            return {
                headerSurface: styles(header).backgroundColor,
                footerSurface: styles(footer).backgroundColor,
                headerHeight: header.getBoundingClientRect().height,
                footerHeight: footer.getBoundingClientRect().height,
                headerPadding: styles(header).padding,
                headerMargin: styles(header).margin,
                headerMinHeight: styles(header).minHeight,
                headerAlign: styles(header).alignItems,
                headerChildren: [...header.children].map((node) => ({ className: node.className, height: node.getBoundingClientRect().height, display: styles(node).display, padding: styles(node).padding, margin: styles(node).margin })),
                headingHeight: element.querySelector('.dashboard-scope-dialog-heading').getBoundingClientRect().height,
                bodyScroll: styles(body).overflowY,
                rowGap: styles(element.querySelector('.dashboard-scope-fields')).gridTemplateColumns
            };
        });
        expect(chrome.headerSurface).toBe(chrome.footerSurface);
        expect(chrome.headerHeight).toBeGreaterThanOrEqual(64);
        expect(chrome.headerHeight, JSON.stringify(chrome)).toBeLessThanOrEqual(90);
        expect(chrome.footerHeight).toBeGreaterThanOrEqual(60);
        expect(chrome.bodyScroll).toBe('auto');
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'scope-dialog-1440-ar-dark.png'), fullPage: false });
        await expect(page.locator('#dashboardScopeBranchSelect option')).toContainText(['QA Main Branch', 'QA Riverside Branch']);
        await page.locator('#dashboardScopeBranchSelect').selectOption('98202');
        await expect(page.locator('#dashboardScopeSectionSelect option')).toContainText(['QA Riverside Section']);
        await page.locator('#dashboardScopeSectionSelect').selectOption('98221');
        await expect(page.locator('#dashboardScopePreviewBranch')).toHaveText('QA Riverside Branch');
        await page.locator('#dashboardScopeCancel').click();
        await expect(dialog).toBeHidden();
        await expect(page.locator('#branchContextSelect')).toHaveValue(initialBranch);
        await expect(page.locator('#sectionContextSelect')).toHaveValue(initialSection);
        expect(runtime.dashboardRequests).toHaveLength(requestCountBeforeCancel);
        expect(runtime.dayPassRequests).toHaveLength(dayPassCountBeforeCancel);
        expect(await page.evaluate(() => window.__dashboardScopeEvents || [])).toEqual([]);

        runtime.delayNextDashboardRequest();
        await page.evaluate(() => window.dispatchEvent(new CustomEvent('topgym:branch-context-changed', {
            detail: { branchId: Number(sessionStorage.getItem('logicfit.branchId')), sectionId: null }
        })));
        await expect.poll(() => runtime.dashboardRequests.length).toBe(requestCountBeforeCancel + 1);

        await page.locator('#dashboardScopeOpen').click();
        await expect(dialog).toBeVisible();
        await page.locator('#dashboardScopeBranchSelect').selectOption('98202');
        await page.locator('#dashboardScopeSectionSelect').selectOption('98221');
        await page.locator('#dashboardScopeApply').click();
        await expect(dialog).toBeHidden();
        await expect(page.locator('#branchContextSelect')).toHaveValue('98202');
        await expect(page.locator('#sectionContextSelect')).toHaveValue('98221');
        await expect(page.locator('#dashboardScopeBranch')).toHaveText('QA Riverside Branch');
        await expect(page.locator('#dashboardScopeSection')).toContainText('QA Riverside Section');
        await expect.poll(() => page.evaluate(() => window.__dashboardScopeEvents || [])).toHaveLength(2);
        await expect.poll(async () => normalizeLocalizedDigits(await page.locator('[data-dashboard-member-count]').innerText())).toBe('222');
        expect(runtime.dashboardRequests.length).toBe(requestCountBeforeCancel + 2);
        expect(runtime.dashboardRequests.slice(-2).map((request) => request.branchId)).toEqual(['98201', '98202']);
        await expect.poll(() => runtime.dayPassRequests.length).toBe(dayPassCountBeforeCancel + 2);
        expect(runtime.writes).toEqual([]);
        await page.screenshot({ path: testInfo.outputPath('dashboard-scope-desktop.png'), fullPage: true });

        await page.setViewportSize({ width: 390, height: 844 });
        await page.locator('#dashboardScopeOpen').click();
        await expect(dialog).toBeVisible();
        for (const width of [320, 375, 390, 430, 768, 1024, 1280, 1440, 1920]) {
            await page.setViewportSize({ width, height: width <= 390 ? 568 : 900 });
            for (const locale of ['ar', 'en']) {
                for (const theme of ['light', 'dark']) {
                    await page.evaluate(({ locale, theme }) => {
                        document.documentElement.lang = locale;
                        document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
                        document.documentElement.dataset.theme = theme;
                        document.body.dataset.theme = theme;
                    }, { locale, theme });
                    const geometry = await page.evaluate(() => {
                const dialogRect = document.querySelector('#dashboardScopeDialog').getBoundingClientRect();
                const headerRect = document.querySelector('.dashboard-scope-dialog-heading').getBoundingClientRect();
                const header = document.querySelector('#dashboardScopeDialog .dialog-header');
                const footer = document.querySelector('#dashboardScopeDialog .dashboard-scope-dialog-actions');
                const preview = document.querySelector('#dashboardScopePreview');
                return {
                    viewport: document.documentElement.clientWidth,
                    document: document.documentElement.scrollWidth,
                    dialog: { left: dialogRect.left, right: dialogRect.right, top: dialogRect.top, bottom: dialogRect.bottom },
                    heading: { left: headerRect.left, right: headerRect.right },
                    headerHeight: header.getBoundingClientRect().height,
                    chromeSurfaces: [getComputedStyle(header).backgroundColor, getComputedStyle(footer).backgroundColor],
                    previewVisible: !preview.hidden
                };
            });
                    const context = `${width}px ${locale}/${theme}`;
                    expect(geometry.document, `${context}: page overflow`).toBeLessThanOrEqual(geometry.viewport + 1);
                    expect(geometry.dialog.left, `${context}: dialog left`).toBeGreaterThanOrEqual(-1);
                    expect(geometry.dialog.right, `${context}: dialog right`).toBeLessThanOrEqual(geometry.viewport + 1);
                    expect(geometry.heading.left, `${context}: heading left`).toBeGreaterThanOrEqual(geometry.dialog.left);
                    expect(geometry.heading.right, `${context}: heading right`).toBeLessThanOrEqual(geometry.dialog.right);
                    expect(geometry.headerHeight, `${context}: compact header`).toBeLessThanOrEqual(width < 600 ? 120 : 90);
                    expect(geometry.chromeSurfaces[0], `${context}: form chrome mismatch ${geometry.chromeSurfaces}`).toBe(geometry.chromeSurfaces[1]);
                    expect(geometry.previewVisible, `${context}: selected scope preview missing`).toBeTruthy();
                    if ((width === 320 || width === 390 || width === 1440) && locale === 'ar' && theme === 'light') {
                        await page.screenshot({ path: path.join(SCREENSHOT_DIR, `scope-dialog-${width}-ar-light.png`), fullPage: false });
                    }
                }
            }
        }
        await page.locator('#dashboardScopeCancel').click();

        await page.evaluate(() => { window.location.hash = '#members'; });
        await expect(page.locator('#dashboardScopeBar')).toBeHidden();
    });

    test('preserves dashboard information and fits the locale/theme/viewport matrix', async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== 'desktop', 'The complete 7-width × 2-locale × 2-theme matrix is captured once in the desktop project.');
        test.setTimeout(120_000);

        const runtime = await installReadOnlyDashboardFixture(page);
        const pageErrors = [];
        const consoleErrors = [];
        page.on('pageerror', (error) => pageErrors.push(error.message));
        page.on('console', (message) => {
            if (message.type() === 'error' && !message.text().includes('ERR_BLOCKED_BY_CLIENT') && !message.text().includes('503 (Service Unavailable)')) consoleErrors.push(message.text());
        });

        await page.goto('/index.html?welcome=1#dashboard', { waitUntil: 'domcontentloaded' });
        await expect(page.locator('body')).toHaveAttribute('data-top-gym-authenticated', 'true');
        await page.evaluate(() => window.topGymAppUsable);
        await expect(page.locator('#dashboardSection .dashboard-overview-cards')).toBeVisible({ timeout: 15000 });
        const overviewCardOwners = await page.locator('body .dashboard-overview-cards').evaluateAll((elements) => elements.map((element) => Boolean(element.closest('#dashboardSection'))));
        expect(overviewCardOwners, 'The overview cards must be rendered only inside the Dashboard overview section.').toEqual([true]);
        // Apply the canonical page stylesheet in this disposable source-QA page.
        // The generated shell bundle is outside this task's permitted write set.
        await page.addStyleTag({ path: path.resolve(process.cwd(), 'public/css/pages/dashboard.css') });
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await expect(page.locator('#dashboardSection [data-skeleton-region="dashboard-stats"] .stat-card')).toHaveCount(5);
        for (const [selector, expected] of [['#statTotal', '125'], ['#statActive', '98'], ['#statExpiring', '8'], ['#statExpired', '12'], ['#statFrozen', '7']]) {
            const displayed = await page.locator(selector).innerText();
            expect(normalizeLocalizedDigits(displayed)).toBe(expected);
        }
        await expect(page.locator('.dashboard-overview-shortcut-actions [data-page-tab-link="members"]')).toBeVisible();
        await expect(page.locator('.dashboard-overview-cards > .dashboard-overview-card')).toHaveCount(4);
        await expect(page.locator('[data-dashboard-member-count]')).toHaveText(/125|١٢٥/);

        await fs.mkdir(SCREENSHOT_DIR, { recursive: true });
        const matrix = [];
        const localizationGaps = new Map();
        const touchTargetGaps = new Map();
        const runtimeStateGaps = [];
        for (const width of WIDTHS) {
            await page.setViewportSize({ width, height: width <= 390 ? 844 : 1000 });
            for (const locale of LOCALES) {
              for (const theme of THEMES) {
                await page.evaluate((mode) => {
                    document.documentElement.dataset.theme = mode;
                    document.body.dataset.theme = mode;
                    window.scrollTo(0, 0);
                }, theme);
                await page.evaluate((value) => window.TopGymI18n.set(value, { persist: false }), locale);
                await page.evaluate(() => document.fonts.ready);
                for (const [selector, expected] of [['#statTotal', '125'], ['#statActive', '98'], ['#statExpiring', '8'], ['#statExpired', '12'], ['#statFrozen', '7']]) {
                    expect(normalizeLocalizedDigits(await page.locator(selector).innerText()), `${width}px ${locale}/${theme}: locale switch changed dashboard data`).toBe(expected);
                }

                const localeState = await page.evaluate(() => {
                    const root = document.querySelector('#dashboardSection');
                    const isVisible = (element) => {
                        const style = getComputedStyle(element);
                        const box = element.getBoundingClientRect();
                        return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0;
                    };
                    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
                    const untranslatedArabic = [];
                    while (walker.nextNode()) {
                        const node = walker.currentNode;
                        const text = node.nodeValue.trim();
                        const owner = node.parentElement;
                        const isFormattedAmount = /^[\d\s.,٬٫٠-٩\u066b\u066c]*(?:ج\.م|EGP)?$/i.test(text);
                        if (text && !isFormattedAmount && /[\u0621-\u064a]/.test(text) && owner && isVisible(owner) && !owner.closest('[data-i18n]')) untranslatedArabic.push({ key: null, text, selector: owner.id ? `#${owner.id}` : `${owner.tagName.toLowerCase()}.${String(owner.className?.baseVal || owner.className || '').trim().replace(/\s+/g, '.')}` });
                    }
                    return {
                        locale: window.TopGymI18n.get(),
                        htmlLang: document.documentElement.lang,
                        bodyLang: document.body.lang,
                        htmlDir: document.documentElement.dir,
                        bodyDir: document.body.dir,
                        unresolvedAnalyticsKeys: [...(document.querySelector('#dashboardAnalytics')?.innerText || '').matchAll(/\bdashboard\.analytics\.[A-Za-z0-9_.]+\b/g)].map((match) => match[0]),
                        untranslatedArabic
                    };
                });
                expect(localeState.locale).toBe(locale);
                expect(localeState.htmlDir).toBe(locale === 'ar' ? 'rtl' : 'ltr');
                expect(localeState.bodyDir).toBe(locale === 'ar' ? 'rtl' : 'ltr');
                expect(localeState.htmlLang).toBe(locale);
                expect(localeState.bodyLang).toBe(localeState.htmlLang);
                expect(localeState.unresolvedAnalyticsKeys, `${width}px ${locale}/${theme}: unresolved dashboard analytics translation keys`).toEqual([]);
                if (locale === 'en') {
                    localeState.untranslatedArabic.forEach((gap) => localizationGaps.set(`${gap.selector}|${gap.text}`, gap));
                }

                const layout = await page.evaluate(() => {
                    const dashboard = document.querySelector('#dashboardSection');
                    const cards = dashboard.querySelector('.dashboard-overview-cards');
                    const tabs = dashboard.querySelector('#dashboardViewTabs');
                    const scope = dashboard.querySelector('#dashboardScopeBar');
                    const overviewCards = [...dashboard.querySelectorAll('.dashboard-overview-card')];
                    const stats = [...dashboard.querySelectorAll('[data-skeleton-region="dashboard-stats"] .stat-card')];
                    const actionButtons = [...dashboard.querySelectorAll('.dashboard-overview-shortcut-actions .btn')].filter((button) => getComputedStyle(button).display !== 'none');
                    const rect = (element) => {
                        const box = element.getBoundingClientRect();
                        return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height };
                    };
                    const statBoxes = stats.map(rect);
                    const alerts = dashboard.querySelector('#alertsSection');
                    const dayPasses = dashboard.querySelector('#dashboardDayPassCard');
                    return {
                        viewport: document.documentElement.clientWidth,
                        documentWidth: document.documentElement.scrollWidth,
                        bodyWidth: document.body.scrollWidth,
                        direction: getComputedStyle(dashboard).direction,
                        theme: document.documentElement.dataset.theme,
                        locale: document.documentElement.dataset.locale,
                        dashboard: rect(dashboard),
                        alerts: rect(alerts),
                        dayPasses: rect(dayPasses),
                        tabs: rect(tabs),
                        scope: rect(scope),
                        scopeIntro: rect(scope.querySelector('.dashboard-scope-intro')),
                        scopeValues: [...scope.querySelectorAll('.dashboard-scope-value')].map(rect),
                        scopeChange: rect(scope.querySelector('.dashboard-scope-change')),
                        cards: rect(cards),
                        cardBoxes: overviewCards.map(rect),
                        cardMetricLayout: [...dashboard.querySelectorAll('.dashboard-overview-metric')].map((card) => ({
                            icon: rect(card.querySelector('.dashboard-overview-icon')),
                            label: rect(card.querySelector('small')),
                            value: rect(card.querySelector('strong')),
                            direction: getComputedStyle(card).direction
                        })),
                        scopeValueStyles: [...scope.querySelectorAll('.dashboard-scope-value')].map((element) => {
                            const style = getComputedStyle(element);
                            return { borderWidth: style.borderTopWidth, radius: style.borderTopLeftRadius, background: style.backgroundColor };
                        }),
                        cardCount: overviewCards.length,
                        cardColumns: getComputedStyle(cards).gridTemplateColumns.split(' ').length,
                        cardChildren: [...cards.children].map((element) => ({
                            className: element.className,
                            height: rect(element).height,
                            scrollHeight: element.scrollHeight
                        })),
                        statCount: stats.length,
                        statGridColumns: getComputedStyle(dashboard.querySelector('[data-skeleton-region="dashboard-stats"]')).gridTemplateColumns,
                        statGrid: rect(dashboard.querySelector('[data-skeleton-region="dashboard-stats"]')),
                        statBoxes,
                        actionCount: actionButtons.length,
                        actionBoxes: actionButtons.map(rect),
                        actionGridColumns: getComputedStyle(dashboard.querySelector('.dashboard-overview-shortcut-actions')).gridTemplateColumns.split(' ').length,
                        actionWhitespace: actionButtons.map((button) => getComputedStyle(button).whiteSpace),
                        memberCount: dashboard.querySelector('[data-dashboard-member-count]')?.textContent.trim(),
                        memberCountSource: dashboard.querySelector('[data-dashboard-member-count]')?.getAttribute('aria-live')
                    };
                });

                expect(layout.documentWidth, `${width}px ${theme}: document horizontal overflow`).toBeLessThanOrEqual(width);
                expect(layout.bodyWidth, `${width}px ${theme}: body horizontal overflow`).toBeLessThanOrEqual(width);
                expect(layout.direction).toBe(locale === 'ar' ? 'rtl' : 'ltr');
                expect(layout.theme).toBe(theme);
                expect(layout.locale).toBe(locale);
                expect(layout.cards.width).toBeGreaterThan(0);
                expect(layout.cards.height).toBeGreaterThan(0);
                if (width >= 992) {
                    expect(Math.abs(layout.alerts.top - layout.dayPasses.top), `${width}px ${locale}/${theme}: alerts and daily passes must share one row`).toBeLessThanOrEqual(1);
                } else {
                    expect(layout.alerts.top, `${width}px ${locale}/${theme}: alerts should precede daily passes on narrow layouts`).toBeLessThan(layout.dayPasses.top);
                }
                expect(layout.cardCount).toBe(4);
                expect(layout.cardBoxes.every((box) => box.width > 0 && box.height > 0 && box.left >= -1 && box.right <= width + 1), `${width}px ${locale}/${theme}: overview card exceeds viewport`).toBeTruthy();
                if (width >= 1280) {
                    expect(layout.cardColumns).toBe(4);
                    expect(Math.abs((layout.tabs.left + layout.tabs.right) / 2 - (layout.dashboard.left + layout.dashboard.right) / 2), `${width}px ${locale}/${theme}: dashboard tabs are not centered`).toBeLessThanOrEqual(1);
                    const scopeCenters = [layout.scopeIntro, ...layout.scopeValues, layout.scopeChange].map((box) => box.top + box.height / 2);
                    expect(Math.max(...scopeCenters) - Math.min(...scopeCenters), `${width}px ${locale}/${theme}: scope bar groups are not vertically aligned`).toBeLessThanOrEqual(2);
                    expect(layout.scopeValueStyles.every((style) => style.borderWidth === '1px' && style.radius !== '0px'), `${width}px ${locale}/${theme}: branch/department summaries must have outlined surfaces`).toBeTruthy();
                    const [membersCard, planCard, dateCard, shortcutsCard] = layout.cardBoxes;
                    if (locale === 'ar') {
                        expect(shortcutsCard.left).toBeGreaterThan(dateCard.left);
                        expect(dateCard.left).toBeGreaterThan(planCard.left);
                        expect(planCard.left).toBeGreaterThan(membersCard.left);
                    } else {
                        expect(membersCard.left).toBeLessThan(planCard.left);
                        expect(planCard.left).toBeLessThan(dateCard.left);
                        expect(dateCard.left).toBeLessThan(shortcutsCard.left);
                    }
                    if (width === 1846 && locale === 'ar' && theme === 'light') {
                        expect(layout.scopeValues).toHaveLength(2);
                        expect(layout.cardBoxes.every((box) => box.height <= 140), 'Reference desktop summary cards should remain compact.').toBeTruthy();
                        await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'dashboard-approved-reference-1846-ar-light-viewport.png'), fullPage: false });
                    }
                    for (const metric of layout.cardMetricLayout) {
                        if (locale === 'ar') expect(metric.icon.right).toBeLessThan(metric.label.left, `${width}px ${locale}/${theme}: metric icon should sit to the left of its text in RTL`);
                        else expect(metric.icon.left).toBeGreaterThan(metric.label.right, `${width}px ${locale}/${theme}: metric icon should sit to the right of its text in LTR`);
                    }
                }
                expect(normalizeLocalizedDigits(layout.memberCount)).toBe('125');
                expect(layout.memberCountSource).toBe('polite');
                expect(layout.statCount).toBe(5);
                expect(
                    layout.statBoxes.every((box) => box.width > 0 && box.height > 0 && box.left >= -1 && box.right <= width + 1),
                    `${width}px ${locale}/${theme}: dashboard stat cards exceed the viewport (grid=${layout.statGridColumns}, parent=${JSON.stringify(layout.statGrid)}): ${JSON.stringify(layout.statBoxes)}`
                ).toBeTruthy();
                expect(layout.actionCount).toBeGreaterThanOrEqual(2);
                expect(layout.actionBoxes.every((box) => box.width > 0 && box.height >= 38 && box.left >= -1 && box.right <= width + 1)).toBeTruthy();
                expect(layout.actionWhitespace.every((value) => value === 'nowrap')).toBeTruthy();
                if (width < 768 && layout.actionCount === 2) {
                    expect(layout.actionGridColumns).toBe(1);
                    expect(layout.actionBoxes[0].bottom).toBeLessThanOrEqual(layout.actionBoxes[1].top + 1);
                    expect(Math.abs(layout.actionBoxes[0].width - layout.actionBoxes[1].width)).toBeLessThanOrEqual(1);
                } else if (width >= 768 && width <= 1023) {
                    expect(layout.actionGridColumns).toBe(2);
                }

                const visibleControls = await page.locator('#dashboardSection button:visible, #dashboardSection a:visible, #dashboardSection input:visible, #dashboardSection select:visible').evaluateAll((elements) => elements.map((element) => {
                    const box = element.getBoundingClientRect();
                    return {
                        label: element.getAttribute('aria-label') || element.innerText.trim() || element.getAttribute('title') || '',
                        height: box.height,
                        left: box.left,
                        right: box.right,
                        top: box.top,
                        bottom: box.bottom,
                        hasAccessibleName: Boolean(element.getAttribute('aria-label') || element.innerText.trim() || element.getAttribute('title') || element.labels?.length)
                    };
                }));
                expect(visibleControls.every((control) => control.hasAccessibleName), `${width}px ${locale}/${theme}: unnamed dashboard controls`).toBeTruthy();
                if (width <= 1024) expect(visibleControls.filter((control) => control.height < 44), `${width}px ${locale}/${theme}: undersized touch targets`).toEqual([]);
                const controlOverlaps = visibleControls.flatMap((a, index) => visibleControls.slice(index + 1)
                    .filter((b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1)
                    .map((b) => [a.label, b.label]));
                expect(controlOverlaps, `${width}px ${locale}/${theme}: overlapping dashboard controls`).toEqual([]);

                if ([320, 768, 1440].includes(width)) {
                    const memberShortcut = page.locator('.dashboard-overview-shortcut-actions [data-page-tab-link="members"]');
                    await memberShortcut.focus();
                    await page.keyboard.press('Tab');
                    const focusState = await page.evaluate(() => ({
                        insideDashboard: Boolean(document.activeElement?.closest('#dashboardSection')),
                        visibleRing: document.activeElement?.matches(':focus-visible') === true
                    }));
                    expect(focusState.insideDashboard, `${width}px ${locale}/${theme}: keyboard focus left Dashboard unexpectedly`).toBeTruthy();
                    expect(focusState.visibleRing, `${width}px ${locale}/${theme}: keyboard focus indicator missing`).toBeTruthy();
                    await page.evaluate(() => window.scrollTo(0, 0));
                }

                const states = await page.locator('#dashboardSection .loading:visible, #dashboardSection .empty:visible, #dashboardSection [role="alert"]:visible, #dashboardSection .error:visible').allTextContents();
                matrix.push({ width, theme, locale, localeState, visibleControls, states, ...layout });
                await page.screenshot({ path: path.join(SCREENSHOT_DIR, `dashboard-${width}-${locale}-${theme}.png`), fullPage: true });
                await page.screenshot({ path: path.join(SCREENSHOT_DIR, `dashboard-${width}-${locale}-${theme}-viewport.png`), fullPage: false });
              }
            }
        }

        await page.setViewportSize({ width: 1440, height: 900 });
        await page.evaluate(() => window.TopGymI18n.set('ar', { persist: false }));
        await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; document.body.dataset.theme = 'light'; });
        await page.locator('#dayPassDialog').evaluate((dialog) => dialog.showModal());
        await expect(page.locator('#dayPassForm')).toBeVisible();
        await expect(page.locator('#dayPassDialog #dayPassTableWrap')).toHaveCount(0);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'dashboard-day-pass-form-1440-ar-light.png'), fullPage: false });
        await page.locator('#dayPassDialog').evaluate((dialog) => dialog.close());
        await page.setViewportSize({ width: 390, height: 844 });
        await page.locator('#dayPassDialog').evaluate((dialog) => dialog.showModal());
        await expect(page.locator('#dayPassForm')).toBeVisible();
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'dashboard-day-pass-form-390-ar-light.png'), fullPage: false });
        await page.locator('#dayPassDialog').evaluate((dialog) => dialog.close());
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.locator('#dashboardAnalyticsTab').click();
        await expect(page.locator('#dashboardAnalyticsPanel')).toBeVisible();
        runtime.setAnalyticsMode('loading');
        await page.evaluate(() => { void window.topGymRefreshDashboardAnalytics?.(); });
        await expect(page.locator('#dashboardAnalyticsLoading')).toBeVisible();
        await page.locator('#dashboardAnalyticsLoading').scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'dashboard-analytics-loading-1440-ar-light-viewport.png'), fullPage: false });
        await page.locator('#dashboardAnalytics').screenshot({ path: path.join(SCREENSHOT_DIR, 'dashboard-analytics-loading-1440-ar-light.png') });
        await expect(page.locator('#dashboardAnalyticsLoading')).toBeHidden();
        runtime.setAnalyticsMode('error');
        await page.evaluate(() => { void window.topGymRefreshDashboardAnalytics?.(); });
        await expect(page.locator('#dashboardAnalytics .analytics-error')).toBeVisible();
        await expect(page.locator('#dashboardAnalytics .analytics-error')).toHaveText('تعذر تحميل التحليلات.');
        const periodText = (await page.locator('#dashboardAnalyticsPeriod').innerText()).trim();
        if (/loading analytics|جاري تحميل التحليلات/i.test(periodText)) {
            runtimeStateGaps.push({ selector: '#dashboardAnalyticsPeriod', expectedState: 'localized error summary', actualText: periodText, cause: 'The central i18n annotation restores the loading label after the request enters its error state.' });
        }
        expect(periodText).toBe('تعذر تحميل التحليلات.');
        await page.evaluate(() => window.TopGymI18n.set('en', { persist: false }));
        await expect(page.locator('#dashboardAnalytics .analytics-error')).toHaveText('Could not load analytics.');
        await expect(page.locator('#dashboardAnalyticsPeriod')).toHaveText('Could not load analytics.');
        await page.evaluate(() => window.TopGymI18n.set('ar', { persist: false }));
        await expect(page.locator('#dashboardAnalytics .analytics-error')).toHaveText('تعذر تحميل التحليلات.');
        const errorLayout = await page.locator('#dashboardAnalytics .analytics-error').evaluate((element) => ({
            text: element.innerText.trim(),
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
            clientHeight: element.clientHeight,
            scrollHeight: element.scrollHeight
        }));
        const periodErrorLayout = await page.locator('#dashboardAnalyticsPeriod').evaluate((element) => ({
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
            clientHeight: element.clientHeight,
            scrollHeight: element.scrollHeight
        }));
        expect(errorLayout.scrollWidth).toBeLessThanOrEqual(errorLayout.clientWidth);
        expect(errorLayout.scrollHeight).toBeLessThanOrEqual(errorLayout.clientHeight);
        expect(periodErrorLayout.scrollWidth).toBeLessThanOrEqual(periodErrorLayout.clientWidth);
        expect(periodErrorLayout.scrollHeight).toBeLessThanOrEqual(periodErrorLayout.clientHeight);
        await fs.writeFile(path.join(SCREENSHOT_DIR, 'analytics-error-state.json'), JSON.stringify({ periodText, errorText: errorLayout.text, runtimeStateGaps }, null, 2));
        if (/[A-Za-z]/.test(errorLayout.text)) localizationGaps.set(`analytics-error|${errorLayout.text}`, { key: null, locale: 'ar', state: 'error', selector: '#dashboardAnalytics .analytics-error', text: errorLayout.text });
        await page.locator('#dashboardAnalytics .analytics-error').scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'dashboard-analytics-error-1440-ar-light-viewport.png'), fullPage: false });
        await page.locator('#dashboardAnalytics').screenshot({ path: path.join(SCREENSHOT_DIR, 'dashboard-analytics-error-1440-ar-light.png') });

        expect(runtime.writes, 'The dashboard fixture must not perform any API writes.').toEqual([]);
        expect(runtime.thirdParty.every((url) => {
            const parsed = new URL(url);
            return parsed.hostname === 'cdn.jsdelivr.net' && parsed.pathname.startsWith('/npm/sweetalert2@11');
        }), `Only the existing SweetAlert CDN request may be attempted; all external requests are aborted by the fixture: ${runtime.thirdParty.join(', ')}`).toBe(true);
        expect(pageErrors, 'Unexpected uncaught browser errors.').toEqual([]);
        expect(consoleErrors, 'Unexpected browser console errors.').toEqual([]);
        await fs.writeFile(path.join(SCREENSHOT_DIR, 'matrix.json'), JSON.stringify(matrix, null, 2));
        const localizationGapList = [...localizationGaps.values()];
        const touchTargetGapList = [...touchTargetGaps.values()];
        await fs.writeFile(path.join(SCREENSHOT_DIR, 'localization-gaps.json'), JSON.stringify(localizationGapList, null, 2));
        await fs.writeFile(path.join(SCREENSHOT_DIR, 'touch-target-gaps.json'), JSON.stringify(touchTargetGapList, null, 2));
        await fs.writeFile(path.join(SCREENSHOT_DIR, 'runtime-state-gaps.json'), JSON.stringify(runtimeStateGaps, null, 2));
        expect(touchTargetGapList, `Dashboard touch targets below 44px; see ${path.join(SCREENSHOT_DIR, 'touch-target-gaps.json')}`).toEqual([]);
        expect(runtimeStateGaps, `Dashboard async state gaps; see ${path.join(SCREENSHOT_DIR, 'runtime-state-gaps.json')}`).toEqual([]);
        expect(localizationGapList, `Visible dashboard text missing English localization; see ${path.join(SCREENSHOT_DIR, 'localization-gaps.json')}`).toEqual([]);
    });
});
