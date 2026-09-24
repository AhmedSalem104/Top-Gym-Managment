const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');

const tabs = [
    ['dashboard', '#dashboardAnalytics'],
    ['members', '#membersSection'],
    ['trainees', '#traineesSection'],
    ['intelligence', '#intelligenceSection'],
    ['management', '#managementSection'],
    ['permissions', '#permissionsSection'],
    ['attendance', '#attendanceSection'],
    ['expenses', '#expensesSection'],
    ['library', '#librarySection'],
    ['reports', '#reportsSection']
];

async function waitForTab(page, name, selector) {
    const tab = page.locator(`[data-page-tab="${name}"]`);
    const isMobileViewport = (page.viewportSize()?.width || 1440) <= 900;
    const shell = page.locator('.app-shell');
    const drawerOpen = await shell.evaluate((element) => element.classList.contains('mobile-nav-open')).catch(() => false);
    if (isMobileViewport || !(await tab.isVisible().catch(() => false))) {
        const mobileToggle = page.locator('#mobileNavToggle');
        if (!drawerOpen && await mobileToggle.isVisible().catch(() => false)) {
            await mobileToggle.click();
        }
        await expect(tab).toBeVisible({ timeout: 10_000 });
    }
    await tab.click();
    await expect(tab).toHaveClass(/active/);
    await expect(page.locator('[data-top-gym-loading-tab]')).toHaveCount(0, { timeout: 20_000 });
    await expect(page.locator(selector)).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(200);
}

async function assertNoPageOverflow(page) {
    const metrics = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth
    }));
    expect(metrics.documentWidth, `document overflow: ${JSON.stringify(metrics)}`).toBeLessThanOrEqual(metrics.viewport + 1);
    expect(metrics.bodyWidth, `body overflow: ${JSON.stringify(metrics)}`).toBeLessThanOrEqual(metrics.viewport + 1);
}

async function assertTouchTargets(page) {
    const undersized = await page.locator('button:visible, input:visible, select:visible, textarea:visible').evaluateAll((elements) => elements
        .map((element) => {
            const box = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return {
                tag: element.tagName,
                id: element.id,
                className: element.className,
                text: element.textContent?.trim().slice(0, 30),
                box: box.toJSON(),
                minHeight: style.minHeight,
                height: style.height,
                padding: style.padding,
                lineHeight: style.lineHeight,
                boxSizing: style.boxSizing
            };
        })
        .filter(({ box }) => box.width > 1 && box.height > 1 && (box.width < 32 || box.height < 32)));
    expect(undersized, `interactive controls below the 32px minimum: ${JSON.stringify(undersized)}`).toEqual([]);
}

async function capture(page, testInfo, name) {
    const directory = path.join(process.cwd(), 'qa', 'artifacts', 'screenshots');
    fs.mkdirSync(directory, { recursive: true });
    await page.screenshot({ path: path.join(directory, `${testInfo.project.name}-${name}.png`), fullPage: true });
}

test.beforeEach(async ({ page }) => {
    const email = process.env.QA_OWNER_EMAIL || process.env.AUTH_OWNER_EMAIL;
    const password = process.env.QA_OWNER_PASSWORD || process.env.AUTH_OWNER_PASSWORD;
    // Authenticated Gym browser flows must never fall back to fake data or a
    // hidden gateway click. Keep the suite honest when a safe QA account is
    // not configured: report the scenario as skipped/NOT VERIFIED instead of
    // turning missing credentials into a misleading timeout.
    test.skip(!email || !password, 'NOT VERIFIED: QA_OWNER_* credentials are not configured.');
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const entryButton = page.locator('#saasEntryContinue');
    if (await entryButton.isVisible().catch(() => false)) {
        await entryButton.click();
    }
    await expect(page.locator('#loginEmail')).toBeVisible({ timeout: 20_000 });
    await page.locator('#loginEmail').fill(email);
    await page.locator('#loginPassword').fill(password);
    await page.locator('#loginSubmit').click();
    await expect(page.locator('[data-page-tab="dashboard"]')).toHaveClass(/active/, { timeout: 20_000 });
});

test('all application tabs open without layout breakage', async ({ page }, testInfo) => {
    for (const [name, selector] of tabs) {
        await waitForTab(page, name, selector);
        await assertNoPageOverflow(page);
        await assertTouchTargets(page);
        if (name !== 'dashboard') await expect(page.locator('#dashboardAnalytics')).toBeHidden();
        if (name === 'dashboard' || name === 'members') await capture(page, testInfo, name);
    }
});

test('dashboard daily passes use the wider column beside the alerts rail', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The wide desktop project owns the dashboard column contract.');
    await waitForTab(page, 'dashboard', '#dashboardSection');
    const layout = await page.evaluate(() => {
        const grid = document.querySelector('.overview-grid');
        const alerts = grid?.querySelector('.alerts-panel');
        const dayPasses = grid?.querySelector('.dashboard-day-pass-card');
        return {
            gridColumns: grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0,
            alertsColumn: alerts ? getComputedStyle(alerts).gridColumn : '',
            dayPassesColumn: dayPasses ? getComputedStyle(dayPasses).gridColumn : '',
            documentWidth: document.documentElement.scrollWidth,
            viewportWidth: document.documentElement.clientWidth
        };
    });
    expect(layout.gridColumns).toBe(12);
    expect(layout.alertsColumn).toBe('1 / span 4');
    expect(layout.dayPassesColumn).toBe('5 / span 8');
    expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
    await capture(page, testInfo, 'dashboard-day-passes-8-alerts-4');
});

test('mobile UI remains compact and usable', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const [name, selector] of tabs) {
        await waitForTab(page, name, selector);
        await assertNoPageOverflow(page);
        await assertTouchTargets(page);
    }
    await capture(page, testInfo, 'mobile');
});

test('members modal and action menu stay inside the viewport', async ({ page }) => {
    await waitForTab(page, 'members', '#membersSection');
    const addButton = page.locator('#addMemberButton');
    await expect(addButton).toBeVisible();
    await addButton.click();
    const dialog = page.locator('#memberDialog');
    await expect(dialog).toBeVisible();
    const dialogBox = await dialog.boundingBox();
    const viewport = page.viewportSize();
    expect(dialogBox).not.toBeNull();
    expect(dialogBox.x).toBeGreaterThanOrEqual(0);
    expect(dialogBox.y).toBeGreaterThanOrEqual(0);
    expect(dialogBox.x + dialogBox.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(dialogBox.y + dialogBox.height).toBeLessThanOrEqual(viewport.height + 1);
    const dialogClose = page.locator('#memberDialog .dialog-close-button');
    await expect(dialogClose).toBeVisible();
    await dialogClose.click();
    await expect(dialog).not.toBeVisible();

    const menuToggle = page.locator('#membersList [data-menu-toggle]').first();
    if (await menuToggle.count()) {
        await menuToggle.click();
        const menu = menuToggle.locator('..').locator('.action-menu-panel');
        await expect(menu).toBeVisible();
        const menuBox = await menu.boundingBox();
        expect(menuBox).not.toBeNull();
        expect(menuBox.x).toBeGreaterThanOrEqual(0);
        expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(viewport.width + 1);
    }
});

test('initial dashboard load keeps heavy feature scripts lazy and stable', async ({ page }, testInfo) => {
    await page.waitForTimeout(1_000);
    const metrics = await page.evaluate(() => {
        const navigation = performance.getEntriesByType('navigation')[0];
        const resources = performance.getEntriesByType('resource');
        const shifts = performance.getEntriesByType('layout-shift');
        const longTasks = performance.getEntriesByType('longtask');
        return {
            domContentLoadedMs: Math.round(navigation?.domContentLoadedEventEnd || 0),
            loadEventMs: Math.round(navigation?.loadEventEnd || 0),
            resourceCount: resources.length,
            scriptCount: resources.filter((entry) => /\.js(?:\?|$)/.test(entry.name)).length,
            stylesheetCount: resources.filter((entry) => /\.css(?:\?|$)/.test(entry.name)).length,
            transferBytes: resources.reduce((sum, entry) => sum + (entry.transferSize || 0), 0),
            cumulativeLayoutShift: shifts.reduce((sum, entry) => sum + (entry.hadRecentInput ? 0 : entry.value || 0), 0),
            longTaskCount: longTasks.length,
            resourceNames: resources.map((entry) => entry.name)
        };
    });
    await testInfo.attach('initial-performance.json', {
        body: Buffer.from(JSON.stringify(metrics, null, 2)),
        contentType: 'application/json'
    });
    console.log(`[PERF][${testInfo.project.name}] ${JSON.stringify({ ...metrics, resourceNames: undefined })}`);
    const resources = metrics.resourceNames;
    expect(resources.some((resource) => /\/js\/(?:pages\/)?coaching\/coaching\.js/.test(resource))).toBe(false);
    expect(resources.some((resource) => /\/js\/(?:pages\/)?reports\/reports\.js/.test(resource))).toBe(false);
    expect(resources.some((resource) => /\/js\/(?:pages\/)?library\/library\.js/.test(resource))).toBe(false);
    expect(metrics.stylesheetCount).toBe(1);
    expect(metrics.domContentLoadedMs).toBeGreaterThan(0);
    expect(metrics.domContentLoadedMs).toBeLessThan(5_000);
    expect(metrics.cumulativeLayoutShift).toBeLessThan(0.25);
});
