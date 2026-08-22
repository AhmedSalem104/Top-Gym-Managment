const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');

const tabs = [
    ['dashboard', '#dashboardAnalytics'],
    ['members', '#membersSection'],
    ['trainees', '#traineesSection'],
    ['management', '#managementSection'],
    ['permissions', '#permissionsSection'],
    ['attendance', '#attendanceSection'],
    ['expenses', '#expensesSection'],
    ['library', '#librarySection'],
    ['reports', '#reportsSection']
];

async function waitForTab(page, name, selector) {
    const tab = page.locator(`[data-page-tab="${name}"]`);
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
        .filter(({ box }) => box.width > 0 && box.height > 0 && (box.width < 32 || box.height < 32)));
    expect(undersized, `interactive controls below the 32px minimum: ${JSON.stringify(undersized)}`).toEqual([]);
}

async function capture(page, testInfo, name) {
    const directory = path.join(process.cwd(), 'qa', 'artifacts', 'screenshots');
    fs.mkdirSync(directory, { recursive: true });
    await page.screenshot({ path: path.join(directory, `${testInfo.project.name}-${name}.png`), fullPage: true });
}

test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
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
    await page.locator('#memberDialogClose').click();
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
