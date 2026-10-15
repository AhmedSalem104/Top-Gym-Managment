const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');

const widths = [320, 375, 390, 768, 1024, 1440, 1920];
const locales = ['ar', 'en'];
const themes = ['light', 'dark'];
const dashboardPath = '/api/platform-admin/dashboard';
const platformScreens = [
    { route: 'dashboard', titleKey: 'platformAdminScreen.page.dashboard' },
    { route: 'gyms', titleKey: 'platformAdminScreen.page.gyms' },
    { route: 'requests', titleKey: 'platformAdminScreen.page.requests' },
    { route: 'gym-registrations', titleKey: 'platformAdminScreen.page.gymRegistrations' },
    { route: 'payment-methods', titleKey: 'platformAdminScreen.page.paymentMethods' },
    { route: 'backups', titleKey: 'platformAdminScreen.page.backups' },
    { route: 'plans', titleKey: 'platformAdminScreen.page.plans' },
    { route: 'audit', titleKey: 'platformAdminScreen.page.audit' },
    { route: 'settings', titleKey: 'platformAdminScreen.page.settings' }
];
const platformRouteKeys = Object.freeze({
    dashboard: 'dashboard', gyms: 'gyms', requests: 'requests',
    'gym-registrations': 'gymRegistrations', 'payment-methods': 'paymentMethods',
    backups: 'backups', plans: 'plans', audit: 'audit', settings: 'settings'
});
const arabicScript = /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/u;
let platformAdminPageCss = '';
const dashboardFixture = {
    metrics: {
        gyms: { total: 18, active: 12, trial: 3, suspended: 1, expired: 1, archived: 1 },
        pendingRequests: 2,
        expiringSubscriptions: 2,
        members: 3270,
        users: 44,
        aiGenerations: 126,
        storageBytes: 734003200,
        newGyms: 4
    },
    recentGyms: [{
        id: 7001,
        name: 'QA Fixture Gym',
        tenantType: 'gym',
        slug: 'qa-fixture-gym',
        status: 'active',
        owner: { name: 'QA Fixture Owner' }
    }],
    recentActivity: [{
        action: 'Plan settings updated',
        actorName: 'QA Fixture Admin',
        details: 'Synthetic read-only dashboard event',
        createdAt: '2026-10-12T10:30:00.000Z'
    }]
};

function readOnlyReply(pathname, options = {}) {
    if (pathname === '/api/auth/session') {
        if (options.roleDenied) return { authenticated: true, user: { id: 91002, role: 'Assistant', name: 'QA Non-Admin' } };
        return { authenticated: true, user: { id: 91001, role: 'PlatformAdmin', name: 'QA Platform Admin' } };
    }
    if (pathname === dashboardPath) return dashboardFixture;
    if (pathname === '/api/platform-admin/plans') return { plans: [] };
    if (pathname === '/api/platform-admin/feature-catalog') return { featureCatalog: [] };
    if (pathname === '/api/platform-admin/backups/health') return {};
    if (pathname === '/api/platform-admin/backups') return { backups: [], audit: [] };
    if (pathname === '/api/platform/whatsapp-templates') return { templates: [] };
    return {};
}

async function installReadOnlyFixtures(page, audit, options = {}) {
    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;
        audit.requests.push(`${request.method()} ${pathname}`);
        if (!['GET', 'HEAD'].includes(request.method())) {
            audit.blockedWrites.push(`${request.method()} ${pathname}`);
            await route.fulfill({ status: 405, contentType: 'application/json', body: JSON.stringify({ error: 'Read-only visual fixture' }) });
            return;
        }
        if (options.dashboardError && pathname === dashboardPath) {
            await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Synthetic dashboard unavailable' }) });
            return;
        }
        if (options.holdDashboard && pathname === dashboardPath) {
            options.onDashboardRequest?.();
            await new Promise((resolve) => { options.releaseDashboard = resolve; });
        }
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(readOnlyReply(pathname, options)) });
    });
}

async function setPresentation(page, locale, theme, width) {
    await page.setViewportSize({ width, height: width <= 390 ? 844 : 960 });
    await page.evaluate(async ({ locale, theme }) => {
        document.documentElement.dataset.theme = theme;
        window.TopGymI18n.set(locale, { persist: false });
    }, { locale, theme });
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
}

async function applyPageSourceStyles(page) {
    // Keep generated main.css untouched; inject the permitted page-owner source
    // into this isolated browser run so screenshots exercise the current CSS.
    await page.addStyleTag({ content: platformAdminPageCss });
}

async function captureAtPageTop(page, screenshotPath) {
    await page.evaluate(() => {
        document.documentElement.style.scrollBehavior = 'auto';
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    });
    await page.waitForTimeout(50);
    await page.screenshot({ path: screenshotPath, fullPage: true, animations: 'disabled' });
}

async function inspectPlatformScreen(page, screen) {
    return page.evaluate(({ route, titleKey }) => {
        const panel = document.querySelector(`[data-platform-panel="${route}"]`);
        const visible = (element) => Boolean(element && element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden');
        const visibleText = (root) => {
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
            const parts = [];
            let node;
            while ((node = walker.nextNode())) {
                const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
                if (!visible(element) || element.closest('[hidden], [aria-hidden="true"], #languageToggleButton')) continue;
                if (node.nodeType === Node.TEXT_NODE && node.nodeValue.trim()) parts.push(node.nodeValue.trim());
                if (node.nodeType === Node.ELEMENT_NODE) {
                    for (const attribute of ['aria-label', 'title', 'placeholder']) {
                        const value = node.getAttribute(attribute);
                        if (value) parts.push(value.trim());
                    }
                }
            }
            return parts;
        };
        const missingKeys = [...new Set([...document.querySelectorAll('[data-i18n^="platformAdminScreen."]')]
            .filter(visible).map((element) => element.dataset.i18n)
            .filter((key) => window.TopGymI18n.t(key) === key))];
        const current = document.querySelector(`#platformNav [data-platform-view="${route}"]`);
        const title = document.querySelector('#platformPageTitle');
        const pageText = visibleText(document.body);
        const panelText = panel ? visibleText(panel) : [];
        const responsiveTableLabelIssues = innerWidth > 1100 ? [] : [...(panel?.querySelectorAll('table.platform-table') || [])].flatMap((table) => {
            const headers = [...(table.tHead?.rows || [])].flatMap((row) => [...row.cells]).map((cell) => cell.textContent.trim());
            return [...(table.tBodies || [])].flatMap((body) => [...body.rows]).flatMap((row) => [...row.cells]
                .filter((cell) => cell.colSpan <= 1)
                .map((cell, index) => ({ expected: headers[index] || '', actual: cell.dataset.label || '' }))
                .filter(({ expected, actual }) => expected !== actual || (window.TopGymI18n.get() === 'en' && /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/u.test(actual))));
        });
        const directoryToolbar = panel?.querySelector('.directory-toolbar');
        const directoryControls = [...(directoryToolbar?.querySelectorAll('.platform-search-field, select') || [])];
        const toolbarBounds = directoryToolbar?.getBoundingClientRect();
        const clippedDirectoryControls = toolbarBounds ? directoryControls.filter((element) => {
            const box = element.getBoundingClientRect();
            return box.left < toolbarBounds.left - 1 || box.right > toolbarBounds.right + 1;
        }).map((element) => element.id || element.className) : [];
        const html = document.documentElement;
        return {
            route,
            width: innerWidth,
            locale: window.TopGymI18n.get(),
            direction: getComputedStyle(html).direction,
            theme: html.dataset.theme,
            activeNav: current?.classList.contains('active') || false,
            activePanel: panel?.classList.contains('active') || false,
            title: title?.textContent.trim() || '',
            expectedTitle: window.TopGymI18n.t(titleKey),
            titleKeyResolved: window.TopGymI18n.t(titleKey) !== titleKey,
            documentWidth: html.scrollWidth,
            bodyWidth: document.body.scrollWidth,
            panelWidth: panel?.clientWidth || 0,
            panelScrollWidth: panel?.scrollWidth || 0,
            responsiveTableLabelIssues,
            clippedDirectoryControls,
            tenantPlanAll: document.querySelector('#tenantPlanFilter option[value=""]')?.textContent.trim() || '',
            whatsappEmptyText: panel?.querySelector('.whatsapp-template-empty')?.textContent.trim() || '',
            missingKeys,
            arabicVisibleText: window.TopGymI18n.get() === 'en'
                ? pageText.filter((text) => /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/u.test(text))
                : [],
            userFacingTextSamples: panelText.slice(0, 24)
        };
    }, screen);
}

async function waitForPlatformScreen(page, route) {
    await expect(page.locator(`[data-platform-panel="${route}"]`)).toHaveClass(/\bactive\b/);
    await expect(page.locator(`[data-platform-panel="${route}"]`)).toBeVisible();
    await expect(page.locator('#platformPageTitle')).not.toHaveText('');
    await page.locator(`[data-platform-panel="${route}"]`).evaluate(async (panel) => {
        await Promise.all([...panel.querySelectorAll('img')].map((image) => image.decode?.().catch(() => {})));
    });
}

async function inspectDashboard(page) {
    return page.evaluate(() => {
        const dashboard = document.querySelector('[data-platform-panel="dashboard"]');
        const visible = (element) => Boolean(element && element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden');
        const controls = [...dashboard.querySelectorAll('button, a[href], input, select, textarea, [role="button"]')].filter(visible);
        const focusable = controls.find((element) => element.matches(':focus-visible'));
        const keyElements = [...dashboard.querySelectorAll('[data-i18n^="platformAdminScreen."]')];
        const missingKeys = [...new Set(keyElements.map((element) => element.dataset.i18n)
            .filter((key) => window.TopGymI18n.t(key) === key))];
        const rect = (element) => {
            if (!element) return null;
            const box = element.getBoundingClientRect();
            return { x: box.x, y: box.y, width: box.width, height: box.height, right: box.right, bottom: box.bottom };
        };
        const touchTargets = controls.filter((element) => {
            const box = element.getBoundingClientRect();
            return box.width < 44 || box.height < 44;
        }).map((element) => ({ selector: element.id ? `#${element.id}` : element.className || element.tagName, width: Math.round(element.getBoundingClientRect().width), height: Math.round(element.getBoundingClientRect().height) }));
        const mobileShellControls = [...document.querySelectorAll('#platformMobileMenu, .mobile-menu-button, .platform-topbar-actions > button, .platform-topbar-actions > .platform-global-search')]
            .filter(visible);
        const shellTouchTargets = mobileShellControls.filter((element) => {
            const box = element.getBoundingClientRect();
            return box.width < 44 || box.height < 44;
        }).map((element) => ({ selector: element.id || element.className || element.tagName, width: Math.round(element.getBoundingClientRect().width), height: Math.round(element.getBoundingClientRect().height) }));
        const actionControls = controls.filter((element) => element.matches('button, a[href], [role="button"]'));
        const overlaps = [];
        for (let index = 0; index < actionControls.length; index += 1) {
            const left = actionControls[index].getBoundingClientRect();
            for (let next = index + 1; next < actionControls.length; next += 1) {
                const right = actionControls[next].getBoundingClientRect();
                if (left.left < right.right && left.right > right.left && left.top < right.bottom && left.bottom > right.top) {
                    overlaps.push([actionControls[index].id || actionControls[index].className, actionControls[next].id || actionControls[next].className]);
                }
            }
        }
        const shellOverlaps = [];
        for (let index = 0; index < mobileShellControls.length; index += 1) {
            const left = mobileShellControls[index].getBoundingClientRect();
            for (let next = index + 1; next < mobileShellControls.length; next += 1) {
                const right = mobileShellControls[next].getBoundingClientRect();
                if (left.left < right.right && left.right > right.left && left.top < right.bottom && left.bottom > right.top) {
                    shellOverlaps.push([mobileShellControls[index].id || mobileShellControls[index].className, mobileShellControls[next].id || mobileShellControls[next].className]);
                }
            }
        }
        return {
            viewport: innerWidth,
            documentWidth: document.documentElement.scrollWidth,
            bodyWidth: document.body.scrollWidth,
            dashboardWidth: dashboard.clientWidth,
            dashboardScrollWidth: dashboard.scrollWidth,
            dashboardVisible: visible(dashboard),
            direction: getComputedStyle(dashboard).direction,
            theme: document.documentElement.dataset.theme,
            locale: window.TopGymI18n.get(),
            shell: {
                nav: Object.fromEntries([...document.querySelectorAll('#platformNav [data-platform-view]')].map((item) => [item.dataset.platformView, item.querySelector(':scope > span:not(.nav-icon)')?.textContent.trim()])),
                logout: document.querySelector('#platformAdminLogoutButton > span:not(.nav-icon)')?.textContent.trim(),
                menuLabel: document.querySelector('#platformMobileMenu')?.getAttribute('aria-label'),
                brand: document.querySelector('.platform-sidebar-brand strong')?.textContent.trim(),
                brandDescription: document.querySelector('.platform-sidebar-brand small')?.textContent.trim(),
                caption: document.querySelector('.platform-sidebar-caption')?.textContent.trim(),
                scopeTitle: document.querySelector('.platform-scope-card strong')?.textContent.trim(),
                scopeDescription: document.querySelector('.platform-scope-card small')?.textContent.trim(),
                topbarEyebrow: document.querySelector('.platform-topbar-title .eyebrow')?.textContent.trim(),
                roleDescription: document.querySelector('.platform-admin-identity small')?.textContent.trim()
            },
            title: dashboard.querySelector('.platform-page-head h2')?.textContent.trim() || '',
            kpiCount: dashboard.querySelectorAll('.platform-kpi').length,
            statusCount: dashboard.querySelectorAll('.status-tile').length,
            recentGymCount: dashboard.querySelectorAll('.mini-tenant').length,
            activityCount: dashboard.querySelectorAll('.mini-activity').length,
            missingKeys,
            touchTargets,
            shellTouchTargets,
            overlaps,
            shellOverlaps,
            focusVisible: Boolean(focusable),
            focusTarget: focusable?.id || focusable?.className || focusable?.tagName || null,
            contentBounds: rect(dashboard.querySelector('.platform-page-head')),
            kpiBounds: rect(dashboard.querySelector('#platformKpis')),
            firstQuickAction: rect(dashboard.querySelector('.quick-actions button'))
        };
    });
}

test('Platform Admin main dashboard shell: all requested widths, Arabic/English, Light/Dark with read-only fixtures', async ({ page }) => {
    test.setTimeout(8 * 60 * 1000);
    const artifactDir = path.resolve(process.cwd(), 'qa/artifacts/platform-admin-dashboard-screen-slice-v2');
    await fs.mkdir(artifactDir, { recursive: true });
    platformAdminPageCss = (await fs.readFile(path.resolve(process.cwd(), 'public/css/pages/platform-admin.css'), 'utf8'))
        .replace(/^\s*@import\s+url\(["'][^"']+["']\);\s*/u, '');
    const audit = { requests: [], blockedWrites: [], browserErrors: [], matrix: [], translationGaps: [] };
    page.on('pageerror', (error) => audit.browserErrors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') audit.browserErrors.push(message.text()); });
    await installReadOnlyFixtures(page, audit);
    await page.goto('/platform-admin.html#dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#platformAdminApp')).toBeVisible();
    await applyPageSourceStyles(page);
    await expect(page.locator('[data-platform-panel="dashboard"]')).toHaveClass(/\bactive\b/);
    await expect(page.locator('#platformKpis .platform-kpi')).toHaveCount(10);
    await expect(page.locator('#platformStatusGrid .status-tile')).toHaveCount(5);

    for (const width of widths) {
        for (const locale of locales) {
            for (const theme of themes) {
                await setPresentation(page, locale, theme, width);
                await page.locator('.quick-actions button').first().focus();
                await page.keyboard.press('Tab');
                const state = await inspectDashboard(page);
                expect(state.dashboardVisible, `${width}/${locale}/${theme}: dashboard hidden`).toBe(true);
                expect(state.documentWidth, `${width}/${locale}/${theme}: document overflow`).toBeLessThanOrEqual(width);
                expect(state.bodyWidth, `${width}/${locale}/${theme}: body overflow`).toBeLessThanOrEqual(width);
                expect(state.dashboardScrollWidth, `${width}/${locale}/${theme}: dashboard overflow`).toBeLessThanOrEqual(state.dashboardWidth);
                expect(state.direction).toBe(locale === 'ar' ? 'rtl' : 'ltr');
                const shellKeys = {
                    dashboard: 'platformAdminScreen.page.dashboard',
                    gyms: 'platformAdminScreen.nav.gyms',
                    requests: 'platformAdminScreen.nav.requests',
                    'gym-registrations': 'platformAdminScreen.nav.registrations',
                    'payment-methods': 'platformAdminScreen.nav.paymentMethods',
                    backups: 'platformAdminScreen.nav.backups',
                    plans: 'platformAdminScreen.nav.plans',
                    audit: 'platformAdminScreen.nav.audit',
                    settings: 'platformAdminScreen.nav.settings'
                };
                const expectedShell = await page.evaluate((keys) => Object.fromEntries(Object.entries(keys).map(([view, key]) => [view, window.TopGymI18n.t(key)])), shellKeys);
                expect(state.shell.nav, `${width}/${locale}/${theme}: actual shell navigation localization`).toEqual(expectedShell);
                expect(state.shell.logout, `${width}/${locale}/${theme}: actual shell logout localization`).toBe(await page.evaluate(() => window.TopGymI18n.t('shell.logout')));
                expect(state.shell.menuLabel, `${width}/${locale}/${theme}: mobile menu accessible name`).toBe(await page.evaluate(() => window.TopGymI18n.t('shell.menu')));
                expect(state.kpiCount).toBe(10);
                expect(state.statusCount).toBe(5);
                expect(state.recentGymCount).toBe(1);
                expect(state.activityCount).toBe(1);
                expect(state.overlaps, `${width}/${locale}/${theme}: dashboard actions overlap`).toEqual([]);
                expect(state.focusVisible, `${width}/${locale}/${theme}: dashboard keyboard focus is visible`).toBe(true);
                if (width <= 768) expect(state.touchTargets, `${width}/${locale}/${theme}: dashboard touch targets meet 44px`).toEqual([]);
                if (width <= 840) {
                    expect(state.shellTouchTargets, `${width}/${locale}/${theme}: touch shell controls meet 44px`).toEqual([]);
                }
                if (width <= 680) {
                    expect(state.shellOverlaps, `${width}/${locale}/${theme}: mobile shell controls do not overlap`).toEqual([]);
                }
                audit.translationGaps.push(...state.missingKeys.map((key) => ({ width, locale, theme, key })));
                audit.matrix.push(state);
                await page.locator(':focus').evaluate((element) => element.blur());
                await page.mouse.move(0, 0);
                if (width <= 390) {
                    await page.locator('#platformMobileMenu').click();
                    await expect(page.locator('.platform-sidebar')).toHaveClass(/\bopen\b/);
                    await expect(page.locator('#platformNav [data-platform-view="dashboard"]')).toBeVisible();
                    const visibleShellNav = await page.locator('#platformNav [data-platform-view]').evaluateAll((items) => items.map((item) => item.querySelector(':scope > span:not(.nav-icon)')?.textContent.trim()));
                    expect(visibleShellNav, `${width}/${locale}/${theme}: opened mobile navigation uses current locale`).toEqual(Object.values(expectedShell));
                    await page.locator('.platform-sidebar').screenshot({ path: path.join(artifactDir, `mobile-sidebar-${width}-${locale}-${theme}.png`), animations: 'disabled' });
                    await page.locator('#platformMobileMenu').evaluate((button) => button.click());
                    await expect(page.locator('.platform-sidebar')).not.toHaveClass(/\bopen\b/);
                }
                await captureAtPageTop(page, path.join(artifactDir, `dashboard-${width}-${locale}-${theme}.png`));
            }
        }
    }

    expect(audit.translationGaps, 'Central i18n keys missing from dashboard UI').toEqual([]);
    expect(audit.blockedWrites, 'No write request may be sent by this visual slice').toEqual([]);
    expect(audit.browserErrors, 'No console/page errors in populated dashboard slice').toEqual([]);
    expect(audit.matrix).toHaveLength(widths.length * locales.length * themes.length);

    // Real loading state: hold only the synthetic GET response; no action is invoked.
    const loadingPage = await page.context().newPage();
    const loadingAudit = { requests: [], blockedWrites: [], browserErrors: [] };
    let releaseDashboard;
    let dashboardRequestStarted;
    const dashboardStarted = new Promise((resolve) => { dashboardRequestStarted = resolve; });
    loadingPage.on('pageerror', (error) => loadingAudit.browserErrors.push(error.message));
    await installReadOnlyFixtures(loadingPage, loadingAudit, {
        holdDashboard: true,
        onDashboardRequest: () => { dashboardRequestStarted(); },
        set releaseDashboard(value) { releaseDashboard = value; }
    });
    await loadingPage.goto('/platform-admin.html#dashboard', { waitUntil: 'domcontentloaded' });
    await expect(loadingPage.locator('#platformAdminApp')).toBeVisible();
    await applyPageSourceStyles(loadingPage);
    await dashboardStarted;
    await expect(loadingPage.locator('#platformKpis [role="status"]')).toBeVisible();
    await setPresentation(loadingPage, 'en', 'dark', 320);
    const loadingLayout = await loadingPage.evaluate(() => {
        const inspect = (host) => {
            const child = host.firstElementChild;
            return {
                hostWidth: host.clientWidth,
                childWidth: child?.getBoundingClientRect().width || 0,
                columns: child ? getComputedStyle(child).gridTemplateColumns.split(' ').length : 0
            };
        };
        return { metrics: inspect(document.querySelector('#platformKpis')), health: inspect(document.querySelector('#platformStatusGrid')) };
    });
    expect(loadingLayout.metrics.childWidth, 'mobile KPI skeleton fills its grid host').toBeGreaterThan(loadingLayout.metrics.hostWidth * 0.95);
    expect(loadingLayout.metrics.columns, 'mobile KPI skeleton uses a two-column layout').toBe(2);
    expect(loadingLayout.health.childWidth, 'status skeleton fills its grid host').toBeGreaterThan(loadingLayout.health.hostWidth * 0.95);
    await captureAtPageTop(loadingPage, path.join(artifactDir, 'state-loading-320-en-dark.png'));
    releaseDashboard?.();
    await expect(loadingPage.locator('#platformKpis .platform-kpi')).toHaveCount(10);
    await loadingPage.close();

    // Empty and error states are rendered through the existing refresh action (a GET only).
    let dashboardMode = 'empty';
    const statePage = await page.context().newPage();
    const stateAudit = { requests: [], blockedWrites: [], browserErrors: [] };
    statePage.on('pageerror', (error) => stateAudit.browserErrors.push(error.message));
    await statePage.route('**/api/**', async (route) => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;
        stateAudit.requests.push(`${request.method()} ${pathname}`);
        if (!['GET', 'HEAD'].includes(request.method())) {
            stateAudit.blockedWrites.push(`${request.method()} ${pathname}`);
            await route.fulfill({ status: 405, contentType: 'application/json', body: '{}' });
            return;
        }
        if (pathname === '/api/auth/session') {
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(readOnlyReply(pathname)) });
            return;
        }
        if (pathname === dashboardPath) {
            if (dashboardMode === 'error') {
                await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '\u062a\u0639\u0630\u0631 \u062a\u062d\u0645\u064a\u0644 \u0628\u064a\u0627\u0646\u0627\u062a \u0644\u0648\u062d\u0629 \u0627\u0644\u0627\u062e\u062a\u0628\u0627\u0631.' }) });
            } else {
                await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ metrics: { gyms: {} }, recentGyms: [], recentActivity: [] }) });
            }
            return;
        }
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(readOnlyReply(pathname)) });
    });
    await statePage.goto('/platform-admin.html#dashboard', { waitUntil: 'domcontentloaded' });
    await expect(statePage.locator('#platformAdminApp')).toBeVisible();
    await applyPageSourceStyles(statePage);
    await setPresentation(statePage, 'ar', 'light', 390);
    await expect(statePage.locator('#recentTenants')).toContainText('لا توجد جيمات مضافة بعد');
    await expect(statePage.locator('#recentActivity')).toContainText('لا توجد عمليات مسجلة');
    await captureAtPageTop(statePage, path.join(artifactDir, 'state-empty-390-ar-light.png'));
    dashboardMode = 'error';
    await statePage.locator('[data-platform-action="refresh-dashboard"]').click();
    await expect(statePage.locator('#platformToast')).toBeVisible();
    await captureAtPageTop(statePage, path.join(artifactDir, 'state-error-390-ar-light.png'));
    expect(stateAudit.blockedWrites).toEqual([]);
    expect(stateAudit.browserErrors).toEqual([]);
    await statePage.close();

    // Synthetic role denial validates only the presentation branch; it is not an authenticated permission test.
    const deniedPage = await page.context().newPage();
    const deniedAudit = { requests: [], blockedWrites: [], browserErrors: [] };
    deniedPage.on('pageerror', (error) => deniedAudit.browserErrors.push(error.message));
    await installReadOnlyFixtures(deniedPage, deniedAudit, { roleDenied: true });
    await deniedPage.goto('/platform-admin.html', { waitUntil: 'domcontentloaded' });
    await expect(deniedPage.locator('#platformAdminLoginScreen')).toBeVisible();
    await applyPageSourceStyles(deniedPage);
    await expect(deniedPage.locator('#platformAdminApp')).toBeHidden();
    await captureAtPageTop(deniedPage, path.join(artifactDir, 'state-role-denied-390-ar-light.png'));
    expect(deniedAudit.requests.some((request) => request.endsWith(dashboardPath))).toBe(false);
    expect(deniedAudit.blockedWrites).toEqual([]);
    expect(deniedAudit.browserErrors).toEqual([]);
    await deniedPage.close();

    await fs.writeFile(path.join(artifactDir, 'visual-slice-results.json'), JSON.stringify({
        status: audit.translationGaps.length ? 'visual-pass-blocked-by-translation-gaps' : 'dashboard-visual-matrix-passed-with-synthetic-read-only-data',
        scope: 'Platform Admin main dashboard panel only; sibling panels are out of scope',
        widths, locales, themes,
        combinations: audit.matrix.length,
        unresolvedShellKeys: [
            { key: 'platformAdminScreen.shell.brandName', element: '.platform-sidebar-brand strong', text: audit.matrix.find((item) => item.locale === 'en')?.shell.brand },
            { key: 'platformAdminScreen.shell.brandDescription', element: '.platform-sidebar-brand small', text: audit.matrix.find((item) => item.locale === 'en')?.shell.brandDescription },
            { key: 'platformAdminScreen.shell.sidebarCaption', element: '.platform-sidebar-caption', text: audit.matrix.find((item) => item.locale === 'en')?.shell.caption },
            { key: 'platformAdminScreen.shell.scopeTitle', element: '.platform-scope-card strong', text: audit.matrix.find((item) => item.locale === 'en')?.shell.scopeTitle },
            { key: 'platformAdminScreen.shell.scopeDescription', element: '.platform-scope-card small', text: audit.matrix.find((item) => item.locale === 'en')?.shell.scopeDescription },
            { key: 'platformAdminScreen.shell.topbarEyebrow', element: '.platform-topbar-title .eyebrow', text: audit.matrix.find((item) => item.locale === 'en')?.shell.topbarEyebrow },
            { key: 'platformAdminScreen.shell.roleDescription', element: '.platform-admin-identity small', text: audit.matrix.find((item) => item.locale === 'en')?.shell.roleDescription }
        ],
        translationGaps: audit.translationGaps,
        matrix: audit.matrix,
        populatedApiRequests: audit.requests,
        blockedWrites: [...audit.blockedWrites, ...stateAudit.blockedWrites, ...deniedAudit.blockedWrites],
        stateCoverage: {
            loading: { result: 'synthetic dashboard GET held; responsive skeleton layout asserted; screenshot captured', layout: loadingLayout },
            empty: 'synthetic empty dashboard response rendered and captured',
            error: 'synthetic 503 dashboard GET rendered through existing refresh action and captured',
            roleDenied: 'synthetic non-PlatformAdmin session rendered login/denial state; not an authenticated permission test'
        },
        browserErrors: [...audit.browserErrors, ...stateAudit.browserErrors, ...deniedAudit.browserErrors]
    }, null, 2));
});

test('Platform Admin Screen Closure Matrix: every implemented navigation screen, read-only synthetic GETs', async ({ page }) => {
    test.setTimeout(12 * 60 * 1000);
    const artifactDir = path.resolve(process.cwd(), 'qa/artifacts/platform-admin-screen-closure-matrix-agent-20261013');
    await fs.mkdir(artifactDir, { recursive: true });
    platformAdminPageCss = (await fs.readFile(path.resolve(process.cwd(), 'public/css/pages/platform-admin.css'), 'utf8'))
        .replace(/^\s*@import\s+url\(["'][^"']+["']\);\s*/u, '');
    const audit = { requests: [], blockedWrites: [], browserErrors: [], matrix: [], screenshots: [], failures: [] };
    page.on('pageerror', (error) => audit.browserErrors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') audit.browserErrors.push(message.text()); });
    await installReadOnlyFixtures(page, audit);
    await page.goto('/platform-admin.html#dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#platformAdminApp')).toBeVisible();
    await applyPageSourceStyles(page);

    const sampleStates = new Set([
        '320|en|light', '375|ar|light', '390|ar|dark',
        '768|en|dark', '1024|ar|dark',
        '1440|en|dark', '1440|ar|light', '1920|en|light'
    ]);
    for (const screen of platformScreens) {
        if (screen.route !== 'dashboard') {
            await page.locator(`#platformNav [data-platform-view="${screen.route}"]`).click();
            await waitForPlatformScreen(page, screen.route);
        }
        for (const width of widths) {
            for (const locale of locales) {
                for (const theme of themes) {
                    await setPresentation(page, locale, theme, width);
                    await waitForPlatformScreen(page, screen.route);
                    const state = await inspectPlatformScreen(page, screen);
                    const context = `${screen.route}/${width}/${locale}/${theme}`;
                    const checks = [
                        ['active navigation item', state.activeNav],
                        ['active and visible screen panel', state.activePanel],
                        ['localized screen title', state.title === state.expectedTitle && state.titleKeyResolved],
                        ['HTML direction matches locale', state.direction === (locale === 'ar' ? 'rtl' : 'ltr')],
                        ['document width has no overflow', state.documentWidth <= width],
                        ['body width has no overflow', state.bodyWidth <= width],
                        ['screen panel width has no overflow', state.panelScrollWidth <= state.panelWidth],
                        ['mobile table-card labels match localized headers', state.responsiveTableLabelIssues.length === 0]
                    ];
                    for (const [label, passed] of checks) {
                        if (!passed) audit.failures.push({ screen: screen.route, context, check: label, state });
                    }
                    if (screen.route === 'gyms') {
                        const expectedAllPlans = await page.evaluate(() => window.TopGymI18n.t('platformAdminScreen.filter.allPlans'));
                        if (state.tenantPlanAll !== expectedAllPlans) audit.failures.push({ screen: screen.route, context, check: 'all-plan filter follows the selected locale', state });
                        if (state.clippedDirectoryControls.length) audit.failures.push({ screen: screen.route, context, check: 'directory search and filters remain inside their toolbar', state });
                    }
                    audit.matrix.push(state);
                    if (sampleStates.has(`${width}|${locale}|${theme}`)) {
                        const screenshot = path.join(artifactDir, `${screen.route}-${width}-${locale}-${theme}.png`);
                        await captureAtPageTop(page, screenshot);
                        audit.screenshots.push(path.basename(screenshot));
                    }
                }
            }
        }
    }

    // This supported hash branch is a real settings sub-screen, not an invented navigation item.
    const settingsScreen = platformScreens.find((item) => item.route === 'settings');
    await page.locator('#platformNav [data-platform-view="settings"]').click();
    await page.locator('[data-settings-section="whatsapp"]').click();
    await expect(page.locator('[data-platform-whatsapp-templates]')).toBeVisible();
    await expect(page).toHaveURL(/#settings\/whatsapp$/u);
    for (const width of widths) {
        for (const locale of locales) {
            for (const theme of themes) {
                await setPresentation(page, locale, theme, width);
                const state = await inspectPlatformScreen(page, settingsScreen);
                state.route = 'settings/whatsapp';
                state.subscreenVisible = await page.locator('[data-platform-whatsapp-templates]').isVisible();
                state.subscreenHash = new URL(page.url()).hash;
                audit.matrix.push(state);
                const context = `${width}/${locale}/${theme}`;
                const subChecks = [
                    ['settings navigation and panel remain active', state.activeNav && state.activePanel],
                    ['WhatsApp settings sub-screen is visible and routed', state.subscreenVisible && state.subscreenHash === '#settings/whatsapp'],
                    ['settings page title resolves in the active locale', state.title === state.expectedTitle && state.titleKeyResolved],
                    ['document/body/panel have no horizontal overflow', state.documentWidth <= width && state.bodyWidth <= width && state.panelScrollWidth <= state.panelWidth]
                ];
                for (const [check, passed] of subChecks) {
                    if (!passed) audit.failures.push({ screen: 'settings/whatsapp', context, check, state });
                }
                const expectedEmptyText = await page.evaluate(() => window.TopGymI18n.t('platformAdminScreen.whatsapp.empty'));
                if (state.whatsappEmptyText !== expectedEmptyText) audit.failures.push({ screen: 'settings/whatsapp', context, check: 'WhatsApp template empty state follows the selected locale', state: { ...state, expectedEmptyText } });
                if (sampleStates.has(`${width}|${locale}|${theme}`)) {
                    const screenshot = path.join(artifactDir, `settings-whatsapp-${width}-${locale}-${theme}.png`);
                    await captureAtPageTop(page, screenshot);
                    audit.screenshots.push(path.basename(screenshot));
                }
            }
        }
    }

    const expectedMatrixCount = (platformScreens.length + 1) * widths.length * locales.length * themes.length;
    const unresolvedCentralKeys = [...new Set(audit.matrix.flatMap((state) => state.missingKeys || []))];
    const englishModeArabic = audit.matrix.filter((state) => state.arabicVisibleText?.length)
        .map((state) => ({ route: state.route, width: state.width, text: state.arabicVisibleText }));
    const complete = audit.matrix.length === expectedMatrixCount
        && audit.failures.length === 0
        && unresolvedCentralKeys.length === 0
        && englishModeArabic.length === 0
        && audit.blockedWrites.length === 0
        && audit.browserErrors.length === 0;
    const artifact = {
        status: complete ? 'PASS' : 'FAIL',
        scope: 'Every current Platform Admin HTML navigation panel plus the supported #settings/whatsapp sub-screen; no unlisted routes or actions inferred.',
        assumptions: [
            'Platform screen inventory is sourced from public/platform-admin.html data-platform-view/data-platform-panel and the supported route list in public/js/platform-admin.js.',
            'The settings/whatsapp sub-screen is included because applyHashRoute explicitly supports #settings/whatsapp and the existing settings UI opens it.',
            'All API data is synthetic and read-only. The harness records and blocks non-GET/HEAD API requests; it does not invoke business actions.',
            'An empty synthetic list state is used for operational directories. This checks empty-state composition, not populated data semantics or authenticated authorization.',
            'English Arabic-script detection applies to visible text, placeholders, titles and accessible labels in the rendered document; externally supplied dynamic data is intentionally absent from fixtures.'
        ],
        screens: platformScreens.map(({ route, titleKey }) => ({ route, titleKey })),
        subScreens: [{ route: 'settings/whatsapp', parent: 'settings', hash: '#settings/whatsapp' }],
        widths, locales, themes,
        expectedCombinations: expectedMatrixCount,
        combinations: audit.matrix.length,
        screenshots: audit.screenshots,
        matrix: audit.matrix,
        failures: audit.failures,
        unresolvedCentralKeys,
        englishModeArabic,
        requests: audit.requests,
        blockedWrites: audit.blockedWrites,
        browserErrors: audit.browserErrors
    };
    await fs.writeFile(path.join(artifactDir, 'screen-closure-matrix.json'), JSON.stringify(artifact, null, 2));

    expect(audit.matrix, 'all route/viewport/locale/theme combinations were inspected').toHaveLength(expectedMatrixCount);
    expect(audit.failures, 'every screen has its nav/panel/title/RTL/overflow assertions satisfied').toEqual([]);
    expect(artifact.unresolvedCentralKeys, 'all rendered Platform Admin central i18n keys resolve').toEqual([]);
    expect(artifact.englishModeArabic, 'English mode contains no visible Arabic user-facing strings').toEqual([]);
    expect(audit.blockedWrites, 'the matrix must not issue writes').toEqual([]);
    expect(audit.browserErrors, 'no browser console or page errors across the matrix').toEqual([]);
});
