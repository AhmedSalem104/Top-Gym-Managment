const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const featureCatalog = require('../../src/services/feature-catalog');

function json(route, payload, status = 200) {
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) });
}

async function installNavigationRuntime(page) {
    await page.route('**/api/**', async (route) => {
        const pathname = new URL(route.request().url()).pathname;
        if (pathname === '/api/auth/session') {
            return json(route, {
                authenticated: true,
                user: { id: 901, name: 'Navigation QA Gym', role: 'Owner', tenantType: 'gym', permissions: [] }
            });
        }
        if (pathname === '/api/branding') return json(route, { identity: { brandName: 'Navigation QA Gym' } });
        if (pathname === '/api/saas/entitlements') {
            return json(route, {
                tenantStatus: 'active',
                subscription: { status: 'active', plan: { code: 'business', name: 'Business' } },
                entitlements: {
                    tenantType: 'gym',
                    featureCatalog: featureCatalog.getFeatureCatalog({ tenantType: 'gym' }),
                    features: Object.fromEntries([
                        'dashboard', 'members', 'attendance', 'reports', 'branches', 'trainees', 'library', 'notifications',
                        'store', 'intelligence', 'feedback', 'management', 'branding', 'member-payment-methods',
                        'permissions', 'expenses', 'member-subscription-requests', 'portal-analytics', 'saas-billing',
                        'backup-history'
                    ].map((key) => [key, true]))
                }
            });
        }
        if (pathname === '/api/branches/bootstrap') {
            return json(route, {
                branches: [
                    { id: 1, name: 'Main Branch', code: 'main', status: 'active', isMain: true },
                    { id: 2, name: 'North Branch', code: 'north', status: 'active', isMain: false }
                ],
                activeBranches: [
                    { id: 1, name: 'Main Branch', code: 'main', status: 'active', isMain: true },
                    { id: 2, name: 'North Branch', code: 'north', status: 'active', isMain: false }
                ],
                defaultBranch: { id: 1, name: 'Main Branch', code: 'main', status: 'active', isMain: true },
                sections: [
                    { id: 11, name: 'Mixed', type: 'mixed', branchId: 1, active: true },
                    { id: 21, name: 'Mixed', type: 'mixed', branchId: 2, active: true }
                ],
                branchLimit: null,
                hasMultipleActiveBranches: true,
                canUseAllBranches: true
            });
        }
        if (pathname === '/api/dashboard') return json(route, { stats: {}, alerts: [] });
        return json(route, {});
    });
}

test('branch and section context values keep distinct readable theme colors; account trigger is not an avatar', async ({ page }, testInfo) => {
    await installNavigationRuntime(page);
    await page.goto('/index.html#dashboard', { waitUntil: 'networkidle' });
    const branch = page.locator('#branchContextShell [data-context-field="branch"] .branch-context-trigger');
    const section = page.locator('#branchContextShell [data-context-field="section"] .branch-context-trigger');
    await expect(branch).toBeVisible();
    await expect(section).toBeVisible();
    await expect(page.locator('.topbar-account-avatar')).toHaveCount(0);
    await expect(page.locator('.topbar-more-trigger')).toHaveAttribute('aria-label', /More|المزيد/u);

    for (const theme of ['light', 'dark']) {
        await page.evaluate((value) => {
            document.documentElement.dataset.theme = value;
            document.body.dataset.theme = value;
        }, theme);
        const colors = await page.evaluate(() => {
            const read = (selector) => getComputedStyle(document.querySelector(selector)).color;
            return {
                branch: read('#branchContextShell [data-context-field="branch"] .branch-context-trigger'),
                section: read('#branchContextShell [data-context-field="section"] .branch-context-trigger'),
                surface: getComputedStyle(document.querySelector('.topbar')).backgroundColor
            };
        });
        expect(colors.branch).not.toBe(colors.section);
        const contrast = await page.evaluate(({ foregrounds, background }) => {
            const channels = (value) => value.match(/[\d.]+/gu).slice(0, 3).map(Number).map((channel) => {
                const normalized = channel / 255;
                return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
            });
            const luminance = (value) => {
                const [r, g, b] = channels(value);
                return .2126 * r + .7152 * g + .0722 * b;
            };
            const b = luminance(background);
            return foregrounds.map((foreground) => {
                const a = luminance(foreground);
                return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
            });
        }, { foregrounds: [colors.branch, colors.section], background: colors.surface });
        expect(contrast[0], `${theme} branch context contrast ${JSON.stringify({ colors, contrast })}`).toBeGreaterThanOrEqual(4.5);
        expect(contrast[1], `${theme} section context contrast`).toBeGreaterThanOrEqual(4.5);
        const screenshot = testInfo.outputPath(`branch-context-${theme}.png`);
        await page.screenshot({ path: screenshot, fullPage: false });
    }
});

test('responsive navigation stays organized and accessible at each viewport', async ({ page }, testInfo) => {
    await installNavigationRuntime(page);
    // `/` is the auth-aware login entry when no server session cookie exists;
    // use the static shell entry so the browser fixture can provide the local
    // authenticated runtime deterministically.
    await page.goto('/index.html#dashboard', { waitUntil: 'networkidle' });
    await expect(page.locator('#branchContextSelect')).toHaveValue('1');
    await expect(page.locator('#topAddMemberButton')).toBeHidden();
    await expect(page.locator('#addMemberButton')).toHaveCount(1);

    const width = testInfo.project.use.viewport.width;
    const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
    expect(dimensions.document, JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.viewport + 1);
    expect(dimensions.body, JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.viewport + 1);

    if (width <= 1023) {
        await expect(page.locator('#mobileNavToggle')).toBeVisible();
        await expect(page.locator('#pageTabs')).toBeHidden();
        await page.locator('#mobileNavToggle').click();
        await expect(page.locator('.app-shell')).toHaveClass(/mobile-nav-open/);
        await expect(page.locator('#pageTabs')).toBeVisible();
        await expect(page.locator('[data-nav-group-label="workspace"]')).toBeVisible();
        await expect(page.locator('[data-nav-group-label="location"]')).toBeVisible();
        await expect(page.locator('[data-page-tab="branches"]')).toBeVisible();
        await page.screenshot({ path: testInfo.outputPath(`navigation-drawer-open-${width}.png`), fullPage: false });
        await page.keyboard.press('Escape');
        await expect(page.locator('.app-shell')).not.toHaveClass(/mobile-nav-open/);
        await expect(page.locator('#pageTabs')).toBeHidden();
        await page.screenshot({ path: testInfo.outputPath(`navigation-mobile-${width}.png`), fullPage: true });
    } else {
        await expect(page.locator('#mobileNavToggle')).toBeHidden();
        await expect(page.locator('#pageTabs')).toBeVisible();
        await expect(page.locator('[data-page-tab="branches"]')).toBeVisible();
        await page.screenshot({ path: testInfo.outputPath('navigation-desktop.png'), fullPage: true });
    }
});

test('branch and section dropdowns support keyboard selection and dismiss predictably', async ({ page }, testInfo) => {
    await installNavigationRuntime(page);
    await page.goto('/index.html#dashboard', { waitUntil: 'networkidle' });
    await expect(page.locator('#branchContextSelect')).toHaveValue('1');

    const branchTrigger = page.locator('[data-context-field="branch"] .branch-context-trigger');
    const branchMenu = page.locator('#branchContextSelectMenu');
    await expect(branchTrigger).toBeVisible();
    await branchTrigger.focus();
    await page.keyboard.press('Enter');
    await expect(branchTrigger).toHaveAttribute('aria-expanded', 'true');
    await expect(branchMenu.locator('[data-context-option="1"]')).toBeFocused();
    await page.screenshot({ path: testInfo.outputPath('navigation-context-dropdown-open.png'), fullPage: false });
    await page.keyboard.press('ArrowDown');
    await expect(branchMenu.locator('[data-context-option="2"]')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#branchContextSelect')).toHaveValue('2');
    await expect(branchTrigger).toHaveAttribute('aria-expanded', 'false');

    const sectionTrigger = page.locator('[data-context-field="section"] .branch-context-trigger');
    const sectionMenu = page.locator('#sectionContextSelectMenu');
    await expect(sectionTrigger).toBeEnabled();
    await sectionTrigger.focus();
    await page.keyboard.press('Enter');
    await expect(sectionMenu).toBeVisible();
    await expect(sectionMenu.locator('[data-context-option=""]')).toBeFocused();
    await page.locator('.app-shell').click({ position: { x: 8, y: 100 } });
    await expect(sectionTrigger).toHaveAttribute('aria-expanded', 'false');
});

test('branch context menu uses theme surfaces and comfortable option sizing', async ({ page }, testInfo) => {
    await installNavigationRuntime(page);
    await page.goto('/index.html#dashboard', { waitUntil: 'networkidle' });

    const trigger = page.locator('[data-context-field="branch"] .branch-context-trigger');
    const menu = page.locator('#branchContextSelectMenu');
    const option = menu.locator('[data-context-option]').first();

    for (const theme of ['light', 'dark']) {
        await page.evaluate((value) => window.TopGymTheme.set(value), theme);
        await trigger.click();
        await expect(menu).toBeVisible();
        await page.screenshot({ path: testInfo.outputPath(`navigation-context-dropdown-${theme}.png`), fullPage: false });
        const metrics = await page.evaluate(() => {
            const menuElement = document.querySelector('#branchContextSelectMenu');
            const optionElement = menuElement?.querySelector('[data-context-option]');
            const probe = document.createElement('span');
            probe.style.backgroundColor = 'var(--bg-elevated)';
            document.body.append(probe);
            const expectedSurface = getComputedStyle(probe).backgroundColor;
            probe.remove();
            return {
                background: getComputedStyle(menuElement).backgroundColor,
                expectedSurface,
                menuCenter: menuElement?.getBoundingClientRect().left + (menuElement?.getBoundingClientRect().width || 0) / 2,
                fieldCenter: document.querySelector('[data-context-field="branch"]')?.getBoundingClientRect().left + (document.querySelector('[data-context-field="branch"]')?.getBoundingClientRect().width || 0) / 2,
                optionHeight: optionElement?.getBoundingClientRect().height || 0,
                optionFontSize: Number.parseFloat(getComputedStyle(optionElement).fontSize)
            };
        });
        expect(metrics.background).toBe(metrics.expectedSurface);
        expect(metrics.optionHeight).toBeGreaterThanOrEqual(48);
        expect(Math.abs(metrics.menuCenter - metrics.fieldCenter)).toBeLessThanOrEqual(1);
        expect(metrics.optionFontSize).toBeGreaterThanOrEqual(12);
        await page.keyboard.press('Escape');
        await expect(menu).toBeHidden();
    }
});

test('context dropdown stays a simple click menu and does not move on hover', async ({ page }) => {
    await installNavigationRuntime(page);
    await page.goto('/index.html#dashboard', { waitUntil: 'networkidle' });
    await expect(page.locator('#branchContextSelect')).toHaveValue('1');

    const field = page.locator('[data-context-field="branch"]');
    const shell = page.locator('#branchContextShell');
    const trigger = field.locator('.branch-context-trigger');
    const menu = page.locator('#branchContextSelectMenu');
    const beforeHover = await shell.boundingBox();
    const bounds = await field.boundingBox();
    expect(bounds).not.toBeNull();
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    const afterHover = await shell.boundingBox();
    expect(afterHover).not.toBeNull();
    expect(Math.abs(afterHover.x - beforeHover.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(afterHover.y - beforeHover.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(afterHover.width - beforeHover.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(afterHover.height - beforeHover.height)).toBeLessThanOrEqual(1);
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(menu).toBeHidden();
    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(menu).toBeVisible();
    await expect(menu).toHaveCSS('opacity', '1');

    const firstOption = menu.locator('[data-context-option]').first();
    const menuBeforeOptionHover = await menu.boundingBox();
    const optionBounds = await firstOption.boundingBox();
    expect(optionBounds).not.toBeNull();
    await page.mouse.move(optionBounds.x + optionBounds.width / 2, optionBounds.y + optionBounds.height / 2);
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(menu).toBeVisible();
    await expect(firstOption).toBeVisible();
    const menuAfterOptionHover = await menu.boundingBox();
    expect(Math.abs(menuAfterOptionHover.x - menuBeforeOptionHover.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(menuAfterOptionHover.y - menuBeforeOptionHover.y)).toBeLessThanOrEqual(1);

    await page.locator('.app-shell').click({ position: { x: 8, y: 100 } });
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(menu).toBeHidden();
});

test('navbar selectors and action controls keep accessible geometry across themes and widths', async ({ page }) => {
    await installNavigationRuntime(page);
    await page.goto('/index.html#dashboard', { waitUntil: 'networkidle' });
    await expect(page.locator('#branchContextSelect')).toHaveValue('1');
    await expect(page.locator('.notification-center-trigger')).toBeVisible();

    const branch = page.locator('[data-context-field="branch"] .branch-context-trigger');
    const section = page.locator('[data-context-field="section"] .branch-context-trigger');
    await expect(branch).toHaveAttribute('aria-label', /الفرع/);
    await expect(section).toHaveAttribute('aria-label', /القسم/);
    const longBranchName = 'فرع North Fitness Centre - القاهرة الجديدة رقم ٢';
    await branch.locator('[data-context-value]').evaluate((element, value) => { element.textContent = value; }, longBranchName);
    await branch.evaluate((element, value) => element.title = `الفرع: ${value}`, longBranchName);
    const longSectionName = 'قسم التدريب الوظيفي للسيدات والمبتدئات';
    await section.locator('[data-context-value]').evaluate((element, value) => { element.textContent = value; }, longSectionName);
    await section.evaluate((element, value) => element.title = `القسم: ${value}`, longSectionName);

    await branch.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#branchContextSelectMenu')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#branchContextSelectMenu')).toBeHidden();
    await expect(branch).toBeFocused();

    for (const width of [320, 360, 390, 430, 768, 1366, 1920]) {
        await page.setViewportSize({ width, height: 900 });
        for (const theme of ['light', 'dark']) {
            await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
            const geometry = await page.evaluate(() => {
                const shell = document.querySelector('.app-shell > .topbar');
                const controls = [
                    '#themeToggleButton', '#globalKioskToggle',
                    '#authLogoutButton', '.notification-center-trigger',
                    '#mobileNavToggle', '#mobileKioskAction', '#mobileLogoutAction'
                ].map((selector) => {
                    const element = document.querySelector(selector);
                    const rect = element?.getBoundingClientRect();
                    const styleVisible = Boolean(element && getComputedStyle(element).display !== 'none' && getComputedStyle(element).visibility !== 'hidden');
                    return { selector, visible: Boolean(styleVisible && rect.width && rect.height), width: rect?.width, height: rect?.height };
                });
                return {
                    viewport: innerWidth,
                    document: document.documentElement.scrollWidth,
                    body: document.body.scrollWidth,
                    shell: shell?.getBoundingClientRect().toJSON(),
                    controls
                };
            });
            expect(geometry.document, `${theme} ${width}px: ${JSON.stringify(geometry)}`).toBeLessThanOrEqual(width + 1);
            expect(geometry.body, `${theme} ${width}px: ${JSON.stringify(geometry)}`).toBeLessThanOrEqual(width + 1);
            const control = (selector) => geometry.controls.find((item) => item.selector === selector);
            expect(control('#themeToggleButton').visible).toBeTruthy();
            expect(control('#themeToggleButton').width).toBe(44);
            expect(control('#themeToggleButton').height).toBe(44);
            expect(control('.notification-center-trigger').visible).toBeTruthy();
            expect(control('.notification-center-trigger').width).toBe(44);
            expect(control('.notification-center-trigger').height).toBe(44);
            if (width <= 767) {
                expect(control('#mobileNavToggle').visible).toBeTruthy();
                expect(control('#mobileNavToggle').width).toBe(44);
                expect(control('#mobileNavToggle').height).toBe(44);
                for (const selector of ['#mobileKioskAction', '#mobileLogoutAction']) {
                    expect(control(selector).visible, `${theme} ${width}px ${selector}`).toBeTruthy();
                    expect(control(selector).width).toBe(44);
                    expect(control(selector).height).toBe(44);
                }
                expect(control('#globalKioskToggle').visible).toBeFalsy();
                expect(control('#authLogoutButton').visible).toBeFalsy();
            } else {
                expect(control('#mobileNavToggle').visible).toBeFalsy();
                expect(control('#mobileKioskAction').visible).toBeFalsy();
                expect(control('#mobileLogoutAction').visible).toBeFalsy();
                for (const selector of ['#globalKioskToggle', '#authLogoutButton']) {
                    expect(control(selector).visible, `${theme} ${width}px ${selector}`).toBeTruthy();
                    expect(control(selector).width).toBe(44);
                    expect(control(selector).height).toBe(44);
                }
            }
            expect(geometry.shell?.height, `${theme} ${width}px`).toBeGreaterThan(0);
            await expect(branch).toHaveAttribute('title', `الفرع: ${longBranchName}`);
            await expect(section).toHaveAttribute('title', `القسم: ${longSectionName}`);
        }
    }
});

test('shared navigation stays below the header without clipping across locale, theme, and viewport', async ({ page }) => {
    const evidenceDir = path.join(process.cwd(), 'qa', 'artifacts', 'navigation-responsive-v2');
    fs.mkdirSync(evidenceDir, { recursive: true });
    const navigationSource = fs.readFileSync(path.join(process.cwd(), 'public', 'css', 'components', 'navigation-shell.css'), 'utf8');
    const tabletRulesStart = navigationSource.indexOf('@media (min-width: 768px) and (max-width: 1199px)');
    const tabletRulesEnd = navigationSource.indexOf('\n@media (max-width: 767px)', tabletRulesStart);
    expect(tabletRulesStart).toBeGreaterThanOrEqual(0);
    expect(tabletRulesEnd).toBeGreaterThan(tabletRulesStart);
    const tabletRules = navigationSource.slice(tabletRulesStart, tabletRulesEnd);
    await page.route('**/css/app-shell.css*', async (route) => {
        const response = await route.fetch();
        await route.fulfill({ response, body: `${await response.text()}\n${tabletRules}` });
    });
    await installNavigationRuntime(page);
    await page.goto('/index.html#dashboard', { waitUntil: 'networkidle' });

    for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        let baselineHeights;
        for (const locale of ['ar', 'en']) {
            await page.evaluate((value) => window.TopGymI18n.set(value, { persist: false }), locale);
            for (const theme of ['light', 'dark']) {
                await page.evaluate((value) => window.TopGymTheme.set(value), theme);
                const geometry = await page.evaluate(() => {
                    const header = document.querySelector('.app-shell > .topbar');
                    const navigation = document.querySelector('#pageTabs');
                    const rect = (element) => {
                        const { top, bottom, left, right, width, height } = element.getBoundingClientRect();
                        return { top, bottom, left, right, width, height };
                    };
                    return {
                        viewport: innerWidth,
                        locale: document.documentElement.dataset.locale,
                        direction: document.documentElement.dir,
                        header: rect(header),
                        navigation: rect(navigation),
                        navigationScrollWidth: navigation.scrollWidth,
                        navigationClientWidth: navigation.clientWidth,
                        scrollbarWidth: getComputedStyle(navigation).scrollbarWidth,
                        scrollbarColor: getComputedStyle(navigation).scrollbarColor,
                        webkitScrollbarHeight: getComputedStyle(navigation, '::-webkit-scrollbar').height,
                        continuationCue: getComputedStyle(navigation, '::after').content,
                        continuationCueWidth: getComputedStyle(navigation, '::after').width,
                        documentWidth: document.documentElement.scrollWidth,
                        bodyWidth: document.body.scrollWidth
                    };
                });
                expect(geometry.documentWidth, JSON.stringify(geometry)).toBeLessThanOrEqual(width + 1);
                expect(geometry.bodyWidth, JSON.stringify(geometry)).toBeLessThanOrEqual(width + 1);
                expect(geometry.navigation.height, JSON.stringify(geometry)).toBeGreaterThan(0);
                expect(geometry.header.height, JSON.stringify(geometry)).toBeGreaterThan(0);
                const heights = { header: geometry.header.height, navigation: geometry.navigation.height };
                if (!baselineHeights) baselineHeights = heights;
                expect(Math.abs(heights.header - baselineHeights.header), `${locale}/${theme}/${width}: ${JSON.stringify(heights)}`).toBeLessThanOrEqual(1);
                expect(Math.abs(heights.navigation - baselineHeights.navigation), `${locale}/${theme}/${width}: ${JSON.stringify(heights)}`).toBeLessThanOrEqual(1);
                if (width > 767 && width < 1200) {
                    expect(geometry.navigation.top, JSON.stringify(geometry)).toBeGreaterThanOrEqual(geometry.header.bottom - 1);
                    expect(geometry.navigationScrollWidth).toBeGreaterThan(geometry.navigationClientWidth);
                    expect(geometry.scrollbarWidth).toBe('thin');
                    expect(geometry.scrollbarColor).not.toBe('auto');
                    expect(geometry.webkitScrollbarHeight).toBe('6px');
                    expect(geometry.continuationCue).not.toBe('none');
                    expect(geometry.continuationCueWidth).toBe('34px');

                    const navigation = page.locator('#pageTabs');
                    const scrollReachability = await page.evaluate(() => {
                        const rail = document.querySelector('#pageTabs');
                        const initialScrollLeft = rail.scrollLeft;
                        rail.scrollBy({ left: document.documentElement.dir === 'rtl' ? -10000 : 10000, behavior: 'instant' });
                        const railLeft = rail.getBoundingClientRect().left + rail.clientLeft;
                        const railRight = railLeft + rail.clientWidth;
                        const reachableTab = [...rail.querySelectorAll('.page-tab:not([hidden]):not([inert])')].find((tab) => {
                            const rect = tab.getBoundingClientRect();
                            return rect.left >= railLeft - 1 && rect.right <= railRight + 1;
                        });
                        return { initialScrollLeft, scrollLeft: rail.scrollLeft, tab: reachableTab?.dataset.pageTab || null };
                    });
                    expect(scrollReachability.scrollLeft, JSON.stringify(scrollReachability)).not.toBe(scrollReachability.initialScrollLeft);
                    expect(scrollReachability.tab, JSON.stringify(scrollReachability)).toBeTruthy();
                    const reachableTab = navigation.locator(`[data-page-tab="${scrollReachability.tab}"]`);
                    await reachableTab.focus();
                    await expect(reachableTab).toBeFocused();
                    const keyboardReachability = await page.evaluate(() => {
                        const rail = document.querySelector('#pageTabs');
                        const focused = document.activeElement.getBoundingClientRect();
                        const bounds = rail.getBoundingClientRect();
                        return {
                            left: focused.left,
                            right: focused.right,
                            visibleLeft: bounds.left + rail.clientLeft,
                            visibleRight: bounds.left + rail.clientLeft + rail.clientWidth
                        };
                    });
                    expect(keyboardReachability.left, JSON.stringify(keyboardReachability)).toBeGreaterThanOrEqual(keyboardReachability.visibleLeft - 1);
                    expect(keyboardReachability.right, JSON.stringify(keyboardReachability)).toBeLessThanOrEqual(keyboardReachability.visibleRight + 1);
                    await navigation.evaluate((rail) => { rail.scrollLeft = 0; });
                } else if (width >= 1200) {
                    expect(geometry.navigation.width, JSON.stringify(geometry)).toBeGreaterThan(0);
                } else {
                    await expect(page.locator('#pageTabs')).toBeHidden();
                    await page.locator('#mobileNavToggle').click();
                    await expect(page.locator('#pageTabs')).toBeVisible();
                    const drawerBounds = await page.locator('#pageTabs').evaluate((navigation) => {
                        const bounds = navigation.getBoundingClientRect();
                        const links = [...navigation.querySelectorAll('.page-tab, .smart-assistant-launcher')]
                            .filter((link) => getComputedStyle(link).display !== 'none')
                            .map((link) => {
                                const rect = link.getBoundingClientRect();
                                return { left: rect.left, right: rect.right };
                            });
                        return { left: bounds.left, right: bounds.right, links };
                    });
                    for (const link of drawerBounds.links) {
                        expect(link.left, `${locale}/${theme}/${width}: ${JSON.stringify(drawerBounds)}`).toBeGreaterThanOrEqual(drawerBounds.left - 1);
                        expect(link.right, `${locale}/${theme}/${width}: ${JSON.stringify(drawerBounds)}`).toBeLessThanOrEqual(drawerBounds.right + 1);
                    }
                    await page.keyboard.press('Escape');
                    await expect(page.locator('#pageTabs')).toBeHidden();
                }

                await page.evaluate(() => window.scrollTo(0, 500));
                const stickyGeometry = await page.evaluate(() => {
                    const header = document.querySelector('.app-shell > .topbar').getBoundingClientRect();
                    const navigation = document.querySelector('#pageTabs').getBoundingClientRect();
                    return { headerBottom: header.bottom, navigationTop: navigation.top, navigationBottom: navigation.bottom };
                });
                if (width > 767 && width < 1200) {
                    expect(stickyGeometry.navigationTop, `${locale}/${theme}/${width}: ${JSON.stringify(stickyGeometry)}`)
                        .toBeGreaterThanOrEqual(stickyGeometry.headerBottom - 1);
                }
                await page.evaluate(() => window.scrollTo(0, 0));
                if (width === 768) {
                    await page.screenshot({
                        path: path.join(evidenceDir, `navigation-tablet-768-${locale}-${theme}.png`),
                        fullPage: false
                    });
                }
            }
        }
    }
});

test('mobile topbar has two explicit rows and a single-icon theme action; Login uses a square theme button', async ({ page, context }, testInfo) => {
    await installNavigationRuntime(page);
    await page.goto('/index.html#dashboard', { waitUntil: 'networkidle' });
    await expect(page.locator('#branchContextSelect')).toHaveValue('1');
    await expect(page.locator('.notification-center-trigger')).toBeVisible();

    const loginPage = await context.newPage();
    await loginPage.goto('/login.html', { waitUntil: 'networkidle' });
    const loginToggle = loginPage.locator('.auth-screen[data-auth-stage="login"] .theme-toggle-switch');
    await expect(loginToggle).toBeVisible();
    const navbarIconColors = new Set();

    for (const width of [320, 360, 390, 430]) {
        await page.setViewportSize({ width, height: 900 });
        await loginPage.setViewportSize({ width, height: 900 });

        for (const theme of ['light', 'dark']) {
            await page.evaluate((value) => window.TopGymTheme.set(value), theme);
            await loginPage.evaluate((value) => window.TopGymTheme.set(value), theme);
            await page.waitForTimeout(200);
            await loginPage.waitForTimeout(200);

            const state = await page.evaluate(() => {
                const rect = (selector) => document.querySelector(selector)?.getBoundingClientRect().toJSON();
                const toggle = document.querySelector('#themeToggleButton');
                const icons = [...toggle.querySelectorAll('[data-theme-toggle-icon]')].map((icon) => ({
                    display: getComputedStyle(icon).display,
                    color: getComputedStyle(icon).color,
                    state: icon.dataset.themeState,
                    path: icon.querySelector('path')?.getAttribute('d') || icon.querySelector('circle')?.outerHTML
                }));
                const track = getComputedStyle(toggle, '::before');
                return {
                    viewport: innerWidth,
                    scrollWidth: document.documentElement.scrollWidth,
                    menu: rect('#mobileNavToggle'),
                    actionGroup: rect('.topbar-mobile-actions'),
                    row: rect('.topbar-mobile-row'),
                    branch: rect('[data-context-field="branch"]'),
                    section: rect('[data-context-field="section"]'),
                    theme: rect('#themeToggleButton'),
                    notification: rect('.notification-center-trigger'),
                    kiosk: rect('#mobileKioskAction'),
                    logout: rect('#mobileLogoutAction'),
                    themePressed: toggle.getAttribute('aria-pressed'),
                    themeState: toggle.querySelector('[data-theme-toggle-icon]')?.dataset.themeState,
                    themeControlCount: document.querySelectorAll('.topbar-mobile-actions [data-theme-toggle]').length,
                    toggleWidth: toggle.getBoundingClientRect().width,
                    toggleHeight: toggle.getBoundingClientRect().height,
                    toggleStyle: (() => {
                        const style = getComputedStyle(toggle);
                        return { radius: style.borderRadius, columns: style.gridTemplateColumns, direction: style.direction, background: style.backgroundColor, border: style.borderColor };
                    })(),
                    icons,
                    kioskHidden: getComputedStyle(document.querySelector('#globalKioskToggle')).display === 'none',
                    logoutContainerHidden: getComputedStyle(document.querySelector('#authAccountBar')).display === 'none'
                };
            });
            const loginGeometry = await loginToggle.evaluate((element) => {
                const rect = element.getBoundingClientRect();
                const style = getComputedStyle(element);
                const icons = [...element.querySelectorAll('.theme-toggle-icon')].map((icon) => ({
                    display: getComputedStyle(icon).display,
                    theme: icon.classList.contains('theme-toggle-icon-dark') ? 'dark' : 'light',
                    rect: icon.getBoundingClientRect().toJSON()
                }));
        const before = getComputedStyle(element, '::before');
        const after = getComputedStyle(element, '::after');
                return {
                    width: rect.width,
                    height: rect.height,
            localeHeight: element.closest('.auth-reference-controls')?.querySelector('[data-locale-segmented]')?.getBoundingClientRect().height,
                    radius: style.borderRadius,
                    columns: style.gridTemplateColumns,
                    direction: style.direction,
                    background: style.backgroundColor,
                    border: style.borderColor,
            pseudo: { before: before.display, after: after.display },
            icons: icons.map((icon) => ({ display: icon.display, theme: icon.theme, x: icon.rect.x - rect.x, y: icon.rect.y - rect.y, width: icon.rect.width, height: icon.rect.height }))
                };
            });

            expect(state.scrollWidth, `${theme} at ${width}px`).toBeLessThanOrEqual(width + 1);
            expect(state.menu.x).toBeGreaterThan(state.actionGroup.x);
            expect(state.menu.y).toBeLessThan(state.branch.y);
            expect(state.branch.y).toBe(state.section.y);
            expect(state.branch.y).toBeGreaterThanOrEqual(state.row.y + state.row.height + 8);
            expect(state.branch.x).toBeGreaterThan(state.section.x);
            expect(state.theme.width).toBeCloseTo(44, 2);
            expect(state.theme.height).toBe(44);
            expect(state.themePressed).toBe(String(theme === 'dark'));
            expect(state.themeState).toBe(theme);
            expect(state.themeControlCount).toBe(1);
            expect(loginGeometry.width).toBe(48);
            expect(loginGeometry.height).toBe(48);
            expect(loginGeometry.localeHeight).toBe(48);
            expect(loginGeometry.pseudo).toEqual({ before: 'none', after: 'none' });
            const visibleLoginIcons = loginGeometry.icons.filter((icon) => icon.display !== 'none');
            expect(visibleLoginIcons).toHaveLength(1);
            expect(visibleLoginIcons[0].theme).toBe(theme);
            expect(state.notification.width).toBe(44);
            expect(state.notification.x).toBeLessThan(state.theme.x);
            expect(state.theme.x).toBeLessThan(state.kiosk.x);
            expect(state.kiosk.x).toBeLessThan(state.logout.x);
            expect(state.toggleWidth).toBe(44);
            expect(state.toggleHeight).toBe(44);
            expect(state.icons).toHaveLength(1);
            expect(state.icons[0].state).toBe(theme);
            expect(state.icons[0].path).toContain(theme === 'dark' ? 'M20.5 15.2' : 'M12 2v2');
            navbarIconColors.add(state.icons[0].color);
            expect(state.kioskHidden).toBeTruthy();
            expect(state.logoutContainerHidden).toBeTruthy();

            if (theme === 'light') {
                await page.screenshot({ path: testInfo.outputPath(`topbar-mobile-${width}-light.png`), fullPage: false });
            } else {
                await page.screenshot({ path: testInfo.outputPath(`topbar-mobile-${width}-dark.png`), fullPage: false });
            }
            if (width === 390) {
                await loginPage.screenshot({ path: testInfo.outputPath(`login-theme-toggle-390-${theme}.png`), fullPage: false });
            }
        }
    }

    expect(navbarIconColors.size).toBe(2);

    await loginToggle.click();
    await expect(loginPage.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(loginToggle).toHaveAttribute('aria-pressed', 'false');
    expect(await loginPage.evaluate(() => localStorage.getItem('topgym-theme'))).toBe('light');

    for (const [action, originalId] of [
        [page.locator('#mobileKioskAction'), 'globalKioskToggle'],
        [page.locator('#mobileLogoutAction'), 'authLogoutButton']
    ]) {
        await page.evaluate((id) => {
            const target = document.getElementById(id);
            target.__qaForwarded = false;
            target.click = () => { target.__qaForwarded = true; };
        }, originalId);
        await action.click();
        await expect.poll(() => page.locator(`#${originalId}`).evaluate((element) => element.__qaForwarded)).toBeTruthy();
    }

    const branchTrigger = page.locator('[data-context-field="branch"] .branch-context-trigger');
    await branchTrigger.click();
    await expect(page.locator('#branchContextSelectMenu')).toBeVisible();
    await expect(page.locator('#branchContextSelectMenu [data-context-option]')).toHaveCount(3);
    await page.screenshot({ path: testInfo.outputPath('topbar-mobile-390-dropdown-open.png'), fullPage: false });
    await page.keyboard.press('Escape');
    await expect(page.locator('#branchContextSelectMenu')).toBeHidden();

    await page.locator('#themeToggleButton').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    expect(await page.evaluate(() => localStorage.getItem('topgym-theme'))).toBe('light');

    await page.setViewportSize({ width: 1366, height: 900 });
    await loginPage.setViewportSize({ width: 1366, height: 900 });
    for (const theme of ['light', 'dark']) {
        await page.evaluate((value) => window.TopGymTheme.set(value), theme);
        await loginPage.evaluate((value) => window.TopGymTheme.set(value), theme);
        const appRect = await page.locator('#themeToggleButton').boundingBox();
        const loginRect = await loginToggle.boundingBox();
        expect(appRect.width).toBe(44);
        expect(appRect.height).toBe(44);
        expect(loginRect.width).toBe(48);
        expect(loginRect.height).toBeCloseTo(48, 2);
        await expect(page.locator('#mobileNavToggle')).toBeHidden();
        await page.screenshot({ path: testInfo.outputPath(`topbar-desktop-1366-${theme}.png`), fullPage: false });
    }
    await loginPage.close();
});
