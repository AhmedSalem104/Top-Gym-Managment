const { test, expect } = require('@playwright/test');
const featureCatalog = require('../../src/services/feature-catalog');

function fulfill(route, body) {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

async function installShellFixture(page) {
    await page.route('**/api/**', async (route) => {
        const pathname = new URL(route.request().url()).pathname;
        if (pathname === '/api/auth/session') return fulfill(route, {
            authenticated: true,
            user: { id: 901, name: 'Responsive QA Gym', role: 'Owner', tenantType: 'gym', permissions: [] }
        });
        if (pathname === '/api/branding') return fulfill(route, { identity: { brandName: 'Responsive QA Gym' } });
        if (pathname === '/api/saas/entitlements') return fulfill(route, {
            tenantStatus: 'active',
            subscription: { status: 'active', plan: { code: 'business', name: 'Business' } },
            entitlements: {
                tenantType: 'gym',
                featureCatalog: featureCatalog.getFeatureCatalog({ tenantType: 'gym' }),
                features: Object.fromEntries([
                    'dashboard', 'members', 'attendance', 'reports', 'branches', 'trainees', 'library', 'notifications',
                    'store', 'intelligence', 'feedback', 'management', 'branding', 'member-payment-methods',
                    'permissions', 'expenses', 'member-subscription-requests', 'portal-analytics', 'saas-billing', 'backup-history'
                ].map((key) => [key, true]))
            }
        });
        if (pathname === '/api/branches/bootstrap') return fulfill(route, {
            branches: [{ id: 1, name: 'Main Branch', code: 'main', status: 'active', isMain: true }],
            activeBranches: [{ id: 1, name: 'Main Branch', code: 'main', status: 'active', isMain: true }],
            defaultBranch: { id: 1, name: 'Main Branch', code: 'main', status: 'active', isMain: true },
            sections: [{ id: 11, name: 'Mixed', type: 'mixed', branchId: 1, active: true }],
            branchLimit: null,
            hasMultipleActiveBranches: false,
            canUseAllBranches: true
        });
        if (pathname === '/api/dashboard') return fulfill(route, { stats: {}, alerts: [] });
        return fulfill(route, {});
    });
}

test('V2 app shell follows full-width header, directional drawer, dashboard grid and account controls', async ({ page }, testInfo) => {
    const pageErrors = [];
    const assetFailures = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('response', (response) => {
        const request = response.request();
        if (new URL(response.url()).origin === 'http://127.0.0.1:4173'
            && ['stylesheet', 'script', 'font', 'image'].includes(request.resourceType())
            && !response.ok()) assetFailures.push(`${response.status()} ${request.resourceType()} ${new URL(response.url()).pathname}`);
    });
    await installShellFixture(page);
    await page.goto('/index.html#dashboard', { waitUntil: 'networkidle' });
    await expect(page.locator('#dashboardOverviewPanel')).toBeVisible();
    await expect(page.locator('.dashboard-overview-cards')).toBeVisible();

    const captures = new Set();
    for (const width of [320, 375, 390, 430, 768, 1023, 1024, 1279, 1280, 1440, 1920]) {
        await page.setViewportSize({ width, height: width === 320 ? 568 : 900 });
        for (const locale of ['ar', 'en']) {
            await page.evaluate((value) => window.TopGymI18n.set(value, { persist: false }), locale);
            for (const theme of ['light', 'dark']) {
                await page.evaluate((value) => window.TopGymTheme.set(value), theme);
                const metrics = await page.evaluate(() => {
                    const rect = (selector) => {
                        const element = document.querySelector(selector);
                        if (!element) return null;
                        const { x, y, width, height, right, bottom } = element.getBoundingClientRect();
                        return { x, y, width, height, right, bottom, display: getComputedStyle(element).display };
                    };
                    const cards = document.querySelector('.dashboard-overview-cards');
                    const overviewGrid = document.querySelector('.overview-grid');
                    return {
                        width: innerWidth,
                        dir: document.documentElement.dir,
                        theme: document.documentElement.dataset.theme,
                        documentWidth: document.documentElement.scrollWidth,
                        header: rect('.app-shell > .topbar'),
                        topbarInner: rect('.topbar-inner'),
                        topbarControls: rect('.topbar-controls'),
                        headerColor: getComputedStyle(document.querySelector('.app-shell > .topbar')).backgroundColor,
                        topbarOrder: ['#branchContextShell', '.topbar-language-toggle', '#themeToggleButton', '#authAccountBar', '.notification-center-trigger'].map((selector) => rect(selector)),
                        headerInner: rect('.topbar-inner'),
                        nav: rect('#pageTabs'),
                        sidebar: rect('.app-shell > .page-tabs'),
                        main: rect('.app-shell > main.page'),
                        menuButton: rect('#mobileNavToggle'),
                        context: rect('.branch-context-mobile-trigger'),
                        notifications: rect('.notification-center-trigger'),
                        account: rect('.topbar-more-trigger'),
                        overviewGrid: rect('.overview-grid'),
                        alerts: rect('#alertsSection'),
                        financeParent: document.querySelector('#monthlyFinanceCard')?.parentElement?.className || null,
                        shellGrid: getComputedStyle(document.querySelector('.app-shell')).gridTemplateRows,
                        navGridRow: getComputedStyle(document.querySelector('#pageTabs')).gridRow,
                        navRules: (() => {
                            const output = [];
                            const visit = (rules) => [...rules].forEach((rule) => {
                                if (rule.cssRules) visit(rule.cssRules);
                                if (rule.selectorText?.includes('page-tabs') && rule.style?.gridRow) output.push({ selector: rule.selectorText, value: rule.style.gridRow });
                            });
                            [...document.styleSheets].forEach((sheet) => { try { visit(sheet.cssRules); } catch {} });
                            return output.slice(-12);
                        })(),
                        cardColumns: getComputedStyle(cards).gridTemplateColumns.split(' ').length,
                        dailyClasses: rect('.overview-grid > .dashboard-day-pass-card'),
                        overviewTitleVisible: (() => {
                            const title = document.querySelector('#dashboardOverviewTitle');
                            const style = getComputedStyle(title);
                            return style.display !== 'none' && style.clip !== 'rect(0px, 0px, 0px, 0px)';
                        })()
                    };
                });

                expect(metrics.documentWidth, JSON.stringify(metrics)).toBeLessThanOrEqual(width + 1);
                expect(metrics.header.y).toBe(0);
                expect(metrics.header.height, JSON.stringify(metrics)).toBe(width < 768 ? 56 : 64);
                if (width >= 1024) {
                    expect(metrics.sidebar.width).toBe(width >= 1280 ? 256 : 224);
                    expect(metrics.header.width + metrics.sidebar.width).toBe(width);
                    if (metrics.dir === 'rtl') {
                        expect(metrics.header.x).toBe(0);
                        expect(metrics.header.right).toBe(metrics.sidebar.x);
                    } else {
                        expect(metrics.sidebar.x).toBe(0);
                        expect(metrics.header.x).toBe(metrics.sidebar.right);
                        expect(metrics.header.right).toBe(width);
                    }
                } else {
                    expect(metrics.header.x).toBe(0);
                    expect(metrics.header.width).toBe(width);
                }
                if (theme === 'light') expect(metrics.headerColor).toBe('rgb(255, 255, 255)');
                if (theme === 'dark') expect(metrics.headerColor).not.toBe('rgb(255, 255, 255)');
                await expect(page.locator('#alertsSection h3')).toHaveText(locale === 'ar' ? 'التنبيهات' : 'Alerts');
                expect(metrics.overviewTitleVisible).toBeFalsy();
                if (width >= 1280) expect(metrics.cardColumns).toBe(4);
                else if (width >= 1024) expect(metrics.cardColumns).toBe(2);
                else if (width >= 768) expect(metrics.cardColumns).toBe(2);
                else if (width <= 359) expect(metrics.cardColumns).toBe(1);
                else expect(metrics.cardColumns).toBe(2);
                if (width >= 1280 && metrics.dailyClasses) {
                    expect(Math.abs(metrics.alerts.y - metrics.dailyClasses.y)).toBeLessThanOrEqual(1);
                    const panelsLeft = Math.min(metrics.alerts.x, metrics.dailyClasses.x);
                    const panelsRight = Math.max(metrics.alerts.right, metrics.dailyClasses.right);
                    expect(Math.abs((panelsRight - panelsLeft) - metrics.overviewGrid.width)).toBeLessThanOrEqual(1);
                }

                if (width >= 1024) {
                    expect(metrics.menuButton.display).toBe('none');
                    expect(metrics.nav.y).toBeGreaterThanOrEqual(metrics.header.bottom - 1);
                    expect(metrics.nav.width).toBe(width >= 1280 ? 256 : 224);
                    expect(metrics.topbarInner.x).toBe(metrics.header.x);
                    expect(metrics.topbarInner.width).toBe(metrics.header.width);
                    expect(metrics.topbarControls.width).toBeGreaterThan(0);
                    expect(metrics.topbarControls.x).toBeGreaterThanOrEqual(metrics.header.x - 1);
                    expect(metrics.topbarControls.right).toBeLessThanOrEqual(metrics.header.right + 1);
                    await expect(page.locator('.topbar-language-toggle')).toBeVisible();
                    await expect(page.locator('#themeToggleButton')).toBeVisible();
                    await expect(page.locator('.topbar-more-trigger')).toBeHidden();
                    await expect(page.locator('#branchContextShell')).toBeHidden();
                    const utilities = await page.locator('.topbar-mobile-actions').boundingBox();
                    if (metrics.dir === 'rtl') {
                        expect(utilities.x).toBeGreaterThanOrEqual(metrics.header.x - 1);
                        expect(utilities.x).toBeLessThanOrEqual(metrics.header.x + 40);
                    } else {
                        expect(utilities.x + utilities.width).toBeLessThanOrEqual(metrics.header.right + 1);
                        expect(utilities.x + utilities.width).toBeGreaterThan(metrics.header.right - 40);
                    }
                } else {
                    expect(metrics.menuButton.width).toBeGreaterThanOrEqual(44);
                    expect(metrics.context).not.toBeNull();
                    expect(metrics.notifications.width).toBeGreaterThanOrEqual(44);
                    expect(metrics.account.width).toBeGreaterThanOrEqual(44);
                    expect(metrics.nav.display).not.toBe('none');
                    await expect(page.locator('#pageTabs')).toBeHidden();
                }

                if (width <= 430 && locale === 'ar' && theme === 'light') {
                    const row = [metrics.menuButton, metrics.context, metrics.notifications, metrics.account].filter(Boolean);
                    for (const item of row) {
                        expect(item.x).toBeGreaterThanOrEqual(-1);
                        expect(item.right).toBeLessThanOrEqual(width + 1);
                    }
                }

                const captureKey = `${width}-${locale}-${theme}`;
                if ([390, 768, 1440].includes(width) && !captures.has(captureKey)) {
                    await page.screenshot({ path: testInfo.outputPath(`app-shell-${captureKey}.png`), fullPage: width === 1440 });
                    captures.add(captureKey);
                }
            }
        }

        if (width <= 1023) {
            await page.locator('#mobileNavToggle').click();
            await expect(page.locator('#pageTabs')).toBeVisible();
            if ([390, 768].includes(width)) await page.screenshot({ path: testInfo.outputPath(`app-shell-drawer-${width}.png`), fullPage: false });
            await page.keyboard.press('Escape');
            await expect(page.locator('#pageTabs')).toBeHidden();
            if (width === 390) {
                await expect(page.locator('.branch-context-mobile-trigger')).toBeHidden();
                const scopeDialog = page.locator('#dashboardScopeDialog');
                await page.locator('#dashboardScopeOpen').click();
                await expect(scopeDialog).toBeVisible();
                const scopeRect = await scopeDialog.boundingBox();
                expect(scopeRect.x).toBeGreaterThanOrEqual(0);
                expect(scopeRect.x + scopeRect.width).toBeLessThanOrEqual(width);
                await page.keyboard.press('Escape');
                await expect(scopeDialog).toBeHidden();
                await page.locator('.topbar-more-trigger').click();
                await expect(page.locator('.topbar-language-toggle [data-locale-choice="en"]')).toBeVisible();
                await expect(page.locator('#themeToggleButton')).toBeVisible();
                const accountMenu = await page.locator('.topbar-more-items').boundingBox();
                expect(accountMenu.x).toBeGreaterThanOrEqual(0);
                expect(accountMenu.x + accountMenu.width).toBeLessThanOrEqual(width);
                await page.screenshot({ path: testInfo.outputPath('app-shell-account-menu-390.png'), fullPage: false });
                await page.keyboard.press('Escape');
            }
        }
    }
    expect(pageErrors).toEqual([]);
    expect(assetFailures).toEqual([]);
});
