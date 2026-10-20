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

test('branch and section context values, profile, and application launcher keep readable theme colors', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The inline branch and section selectors are desktop-only; compact mobile context is covered in the responsive navigation test.');
    await installNavigationRuntime(page);
    await page.goto('/index.html#dashboard', { waitUntil: 'networkidle' });
    const branch = page.locator('#branchContextShell [data-context-field="branch"] .branch-context-trigger');
    const section = page.locator('#branchContextShell [data-context-field="section"] .branch-context-trigger');
    await expect(branch).toBeVisible();
    await expect(section).toBeVisible();
    await expect(page.locator('#topbarProfile')).toBeVisible();
    await expect(page.locator('#applicationLauncherTrigger')).toBeVisible();
    await expect(page.locator('.topbar-more-trigger')).toHaveAttribute('aria-label', /More|المزيد/u);

    for (const theme of ['light', 'dark']) {
        await page.evaluate((value) => {
            document.documentElement.dataset.theme = value;
            document.body.dataset.theme = value;
        }, theme);
        await page.waitForTimeout(180);
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
        await expect(page.locator('#applicationLauncherTrigger')).toBeHidden();
        for (const responsiveWidth of [320, 375, 390, 430, 768, 1024]) {
            await page.setViewportSize({ width: responsiveWidth, height: 900 });
            const navbarLayout = await page.evaluate(() => {
                const selectors = ['#mobileNavToggle', '#applicationLauncherTrigger', '#branchContextShell', '.topbar-more-trigger', '.notification-center-trigger', '#topbarProfile'];
                const visible = (element) => element && getComputedStyle(element).display !== 'none' && element.getBoundingClientRect().width > 0;
                return {
                    rows: selectors.map((selector) => document.querySelector(selector)).filter(visible).map((element) => element.getBoundingClientRect().top),
                    navigationControls: selectors.slice(0, 2).filter((selector) => visible(document.querySelector(selector))),
                    viewport: document.documentElement.clientWidth,
                    documentWidth: document.documentElement.scrollWidth,
                    bodyWidth: document.body.scrollWidth
                };
            });
            expect(navbarLayout.navigationControls, `${responsiveWidth}px should show one navigation icon`).toHaveLength(1);
            expect(navbarLayout.navigationControls[0]).toBe(responsiveWidth <= 1023 ? '#mobileNavToggle' : '#applicationLauncherTrigger');
            expect(Math.max(...navbarLayout.rows) - Math.min(...navbarLayout.rows), `${responsiveWidth}px header rows`).toBeLessThanOrEqual(4);
            expect(navbarLayout.documentWidth, `${responsiveWidth}px document overflow`).toBeLessThanOrEqual(navbarLayout.viewport + 1);
            expect(navbarLayout.bodyWidth, `${responsiveWidth}px body overflow`).toBeLessThanOrEqual(navbarLayout.viewport + 1);
        }
        await page.setViewportSize({ width, height: 900 });
        await page.locator('.topbar-more-trigger').click();
        const moreGeometry = await page.evaluate(() => {
            const rect = (selector) => document.querySelector(selector)?.getBoundingClientRect().toJSON();
            return {
                viewport: innerWidth,
                menu: rect('.topbar-more-items'),
                language: rect('.topbar-language-toggle'),
                theme: rect('#themeToggleButton'),
                fullscreen: rect('#globalKioskToggle')
            };
        });
        expect(moreGeometry.menu.x).toBeGreaterThanOrEqual(0);
        expect(moreGeometry.menu.right).toBeLessThanOrEqual(moreGeometry.viewport);
        expect(moreGeometry.theme.width).toBeGreaterThanOrEqual(160);
        expect(moreGeometry.fullscreen.width).toBeGreaterThanOrEqual(160);
        expect(moreGeometry.theme.y).toBeGreaterThan(moreGeometry.language.y);
        expect(moreGeometry.fullscreen.y).toBeGreaterThan(moreGeometry.theme.y);
        const screenshotDir = path.join(process.cwd(), 'qa', 'artifacts', 'screenshots');
        fs.mkdirSync(screenshotDir, { recursive: true });
        await page.screenshot({ path: path.join(screenshotDir, `navbar-more-mobile-${width}-v2.png`), fullPage: false });
        await page.keyboard.press('Escape');
        await expect(page.locator('.topbar-more-trigger')).toBeFocused();
        await page.locator('#mobileNavToggle').click();
        await expect(page.locator('.app-shell')).toHaveClass(/mobile-nav-open/);
        await expect(page.locator('[data-page-tab="members"]')).toBeVisible();
        await page.locator('[data-page-tab="members"]').click();
        await expect(page.locator('[data-page-tab="members"]')).toHaveClass(/active/);
        await expect(page.locator('#membersSection')).toBeVisible();
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
        await expect(page.locator('#applicationLauncherTrigger')).toBeVisible();
        const sidebarPin = page.locator('#sidebarPinToggle');
        await expect(sidebarPin).toBeVisible();
        await expect(sidebarPin.locator('span')).toHaveCount(0);
        await expect(sidebarPin).toHaveAttribute('aria-label', /Pin sidebar|تثبيت القائمة/u);
        await expect(sidebarPin).toHaveAttribute('title', /Pin sidebar|تثبيت القائمة/u);
        await expect(page.locator('#pageTabs')).toBeVisible();
        await expect(page.locator('[data-page-tab="branches"]')).toBeVisible();
        const navbarRows = await page.evaluate(() => ['#mobileNavToggle', '#applicationLauncherTrigger', '#branchContextShell', '.topbar-more-trigger', '.notification-center-trigger', '#topbarProfile']
            .map((selector) => document.querySelector(selector))
            .filter((element) => element && getComputedStyle(element).display !== 'none' && element.getBoundingClientRect().width > 0)
            .map((element) => element.getBoundingClientRect().top));
        expect(Math.max(...navbarRows) - Math.min(...navbarRows)).toBeLessThanOrEqual(4);
        await page.screenshot({ path: testInfo.outputPath('navigation-desktop.png'), fullPage: true });
    }
});

test('dashboard daily classes occupy seven columns beside five alert columns on desktop', async ({ page }, testInfo) => {
    await installNavigationRuntime(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/index.html#dashboard', { waitUntil: 'networkidle' });
    await page.evaluate(() => {
        window.__qaMotionAnimations = [];
        const nativeAnimate = Element.prototype.animate;
        Element.prototype.animate = function (...args) {
            const animation = nativeAnimate.apply(this, args);
            window.__qaMotionAnimations.push(animation);
            return animation;
        };
    });
    await page.locator('[data-page-tab="members"]').click();
    await expect(page.locator('#membersSection')).toBeVisible();
    await page.locator('[data-page-tab="dashboard"]').click();
    await expect(page.locator('#dashboardSection')).toBeVisible();
    const dashboardSignalAnimations = await page.evaluate(() => window.__qaMotionAnimations
        .filter((animation) => animation.id === 'logicfit-dashboard-signal-enter').length);
    expect(dashboardSignalAnimations).toBeGreaterThan(0);
    const panels = await page.evaluate(() => {
        const grid = document.querySelector('.overview-grid');
        const alerts = grid?.querySelector('.alerts-panel');
        const classes = grid?.querySelector('.dashboard-day-pass-card');
        return {
            columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
            alerts: getComputedStyle(alerts).gridColumn,
            classes: getComputedStyle(classes).gridColumn,
            viewportWidth: document.documentElement.clientWidth,
            documentWidth: document.documentElement.scrollWidth
        };
    });
    expect(panels.columns).toBe(12);
    expect(panels.alerts).toBe('8 / span 5');
    expect(panels.classes).toBe('1 / span 7');
    expect(panels.documentWidth).toBeLessThanOrEqual(panels.viewportWidth + 1);
    const screenshotDir = path.join(process.cwd(), 'qa', 'artifacts', 'screenshots');
    fs.mkdirSync(screenshotDir, { recursive: true });
    await page.screenshot({ path: path.join(screenshotDir, 'dashboard-classes-7-alerts-5-v2.png'), fullPage: true });
});

test('sidebar width and logout danger treatment remain consistent in light and dark themes', async ({ page }) => {
    await installNavigationRuntime(page);
    await page.goto('/index.html#dashboard', { waitUntil: 'networkidle' });
    const metrics = [];

    for (const width of [390, 1100, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        for (const theme of ['light', 'dark']) {
            await page.evaluate((value) => window.TopGymTheme.set(value), theme);
            await page.waitForFunction(() => {
                const logout = document.querySelector('#authAccountBar .auth-logout-button');
                const probe = document.createElement('span');
                probe.style.color = 'var(--danger-text)';
                probe.style.backgroundColor = 'var(--danger-soft)';
                document.body.append(probe);
                const expected = getComputedStyle(probe);
                const actual = getComputedStyle(logout);
                const matches = actual.color === expected.color && actual.backgroundColor === expected.backgroundColor;
                probe.remove();
                return matches;
            });
            metrics.push(await page.evaluate(() => {
                const shell = document.querySelector('.app-shell');
                const logout = document.querySelector('#authAccountBar .auth-logout-button');
                const probe = document.createElement('span');
                probe.style.color = 'var(--danger-text)';
                probe.style.backgroundColor = 'var(--danger-soft)';
                document.body.append(probe);
                const expected = getComputedStyle(probe);
                const actual = getComputedStyle(logout);
                const result = {
                    expanded: getComputedStyle(shell).getPropertyValue('--sidebar-width-expanded').trim(),
                    collapsed: getComputedStyle(shell).getPropertyValue('--sidebar-width-collapsed').trim(),
                    logoutColor: actual.color,
                    logoutBackground: actual.backgroundColor,
                    expectedColor: expected.color,
                    expectedBackground: expected.backgroundColor,
                    theme: document.documentElement.dataset.theme
                };
                probe.remove();
                return result;
            }));
        }
    }

    expect(metrics.filter((item) => item.expanded === '256px')).toHaveLength(4);
    expect(metrics.filter((item) => item.expanded === '224px')).toHaveLength(2);
    expect(metrics.every((item) => item.collapsed === '72px')).toBe(true);
    expect(metrics.every((item) => item.logoutColor === item.expectedColor), JSON.stringify(metrics)).toBe(true);
    expect(metrics.every((item) => item.logoutBackground === item.expectedBackground), JSON.stringify(metrics)).toBe(true);
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

test('responsive topbar keeps every primary action on one row; Login keeps its square theme button', async ({ page, context }, testInfo) => {
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
            if (!await page.locator('.topbar-more-menu').evaluate((element) => element.open)) {
                await page.locator('.topbar-more-trigger').click();
            }
            await expect(page.locator('#themeToggleButton')).toBeVisible();

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
                    controls: ['#mobileNavToggle', '#applicationLauncherTrigger', '#branchContextShell', '.topbar-more-trigger', '.notification-center-trigger', '#topbarProfile']
                        .map((selector) => document.querySelector(selector))
                        .filter((element) => {
                            const rect = element?.getBoundingClientRect();
                            return Boolean(element && getComputedStyle(element).display !== 'none' && getComputedStyle(element).visibility !== 'hidden' && rect.width && rect.height);
                        })
                        .map((element) => ({ selector: element.id ? `#${element.id}` : `.${element.classList[0]}`, top: element.getBoundingClientRect().top, height: element.getBoundingClientRect().height })),
                    theme: rect('#themeToggleButton'),
                    notification: rect('.notification-center-trigger'),
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
                    kioskVisibleInMore: getComputedStyle(document.querySelector('#globalKioskToggle')).display !== 'none'
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
            const controlTops = state.controls.map((control) => control.top);
            expect(Math.max(...controlTops) - Math.min(...controlTops), `${theme} ${width}px one-row controls ${JSON.stringify(state.controls)}`).toBeLessThanOrEqual(4);
            expect(state.theme.width).toBeGreaterThanOrEqual(44);
            expect(state.theme.height).toBeGreaterThanOrEqual(44);
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
            expect(state.kioskVisibleInMore).toBeTruthy();
            expect(state.toggleWidth).toBeGreaterThanOrEqual(44);
            expect(state.toggleHeight).toBeGreaterThanOrEqual(44);
            expect(state.icons).toHaveLength(1);
            expect(state.icons[0].state).toBe(theme);
            expect(state.icons[0].path).toContain(theme === 'dark' ? 'M20.5 15.2' : 'M12 2v2');
            navbarIconColors.add(state.icons[0].color);

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

    await expect(page.locator('#authAccountBar #authLogoutButton')).toHaveCount(1);
    const contextTrigger = page.locator('#branchContextMobileTrigger');
    await contextTrigger.click();
    const branchTrigger = page.locator('[data-context-field="branch"] .branch-context-trigger');
    await expect(branchTrigger).toBeVisible();
    await branchTrigger.click();
    await expect(page.locator('#branchContextSelectMenu')).toBeVisible();
    await expect(page.locator('#branchContextSelectMenu [data-context-option]')).toHaveCount(3);
    await page.screenshot({ path: testInfo.outputPath('topbar-mobile-390-dropdown-open.png'), fullPage: false });
    await page.keyboard.press('Escape');
    await expect(page.locator('#branchContextSelectMenu')).toBeHidden();

    await page.locator('.topbar-more-trigger').click();
    await page.locator('#themeToggleButton').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    expect(await page.evaluate(() => localStorage.getItem('topgym-theme'))).toBe('light');

    await page.setViewportSize({ width: 1366, height: 900 });
    await loginPage.setViewportSize({ width: 1366, height: 900 });
    for (const theme of ['light', 'dark']) {
        await page.evaluate((value) => window.TopGymTheme.set(value), theme);
        await loginPage.evaluate((value) => window.TopGymTheme.set(value), theme);
        if (!await page.locator('.topbar-more-menu').evaluate((element) => element.open)) {
            await page.locator('.topbar-more-trigger').click();
        }
        await expect(page.locator('#themeToggleButton')).toBeVisible();
        const appRect = await page.locator('#themeToggleButton').boundingBox();
        const loginRect = await loginToggle.boundingBox();
        expect(appRect.width).toBe(44);
        expect(appRect.height).toBe(44);
        expect(loginRect.width).toBe(48);
        expect(loginRect.height).toBeCloseTo(48, 2);
        await expect(page.locator('#mobileNavToggle')).toBeHidden();
        await expect(page.locator('#applicationLauncherTrigger')).toBeVisible();
        await page.screenshot({ path: testInfo.outputPath(`topbar-desktop-1366-${theme}.png`), fullPage: false });
    }
    await loginPage.close();
});

test('navbar settings dropdown is anchored to More and remains compact, localized, and independent', async ({ page }, testInfo) => {
    await installNavigationRuntime(page);
    await page.goto('/index.html#dashboard', { waitUntil: 'networkidle' });

    const details = page.locator('.topbar-more-menu');
    const trigger = page.locator('.topbar-more-trigger');
    const panel = page.locator('.topbar-more-items');
    await expect(details).not.toHaveAttribute('open', '');
    await expect(page.locator('#globalKioskToggle')).toHaveCount(0);
    await expect(page.locator('#attendanceKioskButton')).toHaveCount(1);

    const captures = new Set();
    for (const width of [320, 375, 430, 768, 1024, 1440, 1920]) {
        await page.setViewportSize({ width, height: 820 });
        const localeTheme = width % 2 === 0 ? ['en', 'dark'] : ['ar', 'light'];
        for (const [locale, theme] of [localeTheme]) {
                await page.evaluate(({ locale: nextLocale, theme: nextTheme }) => {
                    window.TopGymI18n.set(nextLocale);
                    window.TopGymTheme.set(nextTheme);
                }, { locale, theme });
                await page.locator('.notification-center-trigger').click();
                await expect(details).not.toHaveAttribute('open', '');
                await page.keyboard.press('Escape');
                if (await page.locator('#topbarProfile').isVisible()) {
                    await page.locator('#topbarProfile').click();
                    await expect(details).not.toHaveAttribute('open', '');
                }
                await trigger.click();
                await expect(panel).toBeVisible();
                await expect(panel.locator('.topbar-settings-section')).toHaveCount(2);
                await expect(panel.locator('#themeToggleButton')).toHaveAttribute('role', 'switch');
                await expect(panel.locator('#topbarFullscreenAction')).toBeVisible();
                await expect(panel.locator('#topbarLogoutAction')).toBeVisible();
                await expect(panel.locator('[data-kiosk-toggle]')).toHaveCount(0);

                const geometry = await page.evaluate(() => {
                    const triggerRect = document.querySelector('.topbar-more-trigger').getBoundingClientRect();
                    const panelRect = document.querySelector('.topbar-more-items').getBoundingClientRect();
                    return {
                        direction: document.documentElement.dir,
                        viewportWidth: innerWidth,
                        triggerBottom: triggerRect.bottom,
                        panel: { left: panelRect.left, right: panelRect.right, top: panelRect.top, width: panelRect.width, height: panelRect.height },
                        scrollWidth: document.documentElement.scrollWidth
                    };
                });
                expect(geometry.panel.width).toBeLessThanOrEqual(340);
                expect(geometry.panel.left).toBeGreaterThanOrEqual(0);
                expect(geometry.panel.right).toBeLessThanOrEqual(width);
                expect(geometry.panel.top).toBeGreaterThanOrEqual(geometry.triggerBottom - 1);
                expect(geometry.panel.height).toBeLessThanOrEqual(820);
                expect(geometry.scrollWidth).toBeLessThanOrEqual(width);
                if (width === 320 && !captures.has('mobile')) {
                    await page.screenshot({ path: testInfo.outputPath(`navbar-settings-mobile-320-${locale}-${theme}.png`), fullPage: false });
                    captures.add('mobile');
                }
                if (width === 375 && !captures.has('rtl-light')) {
                    await page.screenshot({ path: testInfo.outputPath('navbar-settings-mobile-375-ar-light.png'), fullPage: false });
                    captures.add('rtl-light');
                }
                if (width === 1440 && locale === 'en' && theme === 'dark' && !captures.has('desktop')) {
                    await page.screenshot({ path: testInfo.outputPath('navbar-settings-desktop-1440-en-dark.png'), fullPage: false });
                    captures.add('desktop');
                }
                await page.keyboard.press('Escape');
                await expect(panel).toBeHidden();
                await expect(trigger).toBeFocused();
        }
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => window.TopGymI18n.set('ar'));
    await trigger.click();
    await panel.locator('[data-locale-choice="en"]').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(panel).toBeHidden();

    await trigger.click();
    const themeSwitch = page.locator('#themeToggleButton');
    const initialTheme = await page.locator('html').getAttribute('data-theme');
    await themeSwitch.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', initialTheme === 'dark' ? 'light' : 'dark');
    await expect(themeSwitch).toHaveAttribute('aria-checked', initialTheme === 'dark' ? 'false' : 'true');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('topgym-theme'))).toBe(initialTheme === 'dark' ? 'light' : 'dark');

    await trigger.click();
    const fullscreenAction = page.locator('#topbarFullscreenAction');
    if (await fullscreenAction.isEnabled()) {
        await fullscreenAction.click();
        await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
        await trigger.click();
        await expect(fullscreenAction.locator('[data-fullscreen-label]')).toHaveText(/Exit full screen|إنهاء ملء الشاشة/u);
        await fullscreenAction.click();
        await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);
    } else {
        await expect(fullscreenAction).toHaveAttribute('aria-label', /unavailable|غير متاح/u);
    }

    await trigger.click();
    await page.evaluate(() => {
        const logout = document.getElementById('authLogoutButton');
        logout.click = () => { window.__settingsLogoutDelegated = true; };
    });
    await page.locator('#topbarLogoutAction').click();
    await expect.poll(() => page.evaluate(() => window.__settingsLogoutDelegated)).toBe(true);
});
