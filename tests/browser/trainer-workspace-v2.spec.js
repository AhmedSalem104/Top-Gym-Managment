const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const path = require('node:path');
const { test, expect } = require('@playwright/test');

const trainerHtml = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'trainer-workspace.html'), 'utf8');

async function installReadOnlyTrainerFixture(page) {
    const writes = [];
    await page.route('**/trainer-workspace/**', async (route) => {
        if (route.request().resourceType() === 'document') {
            return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: trainerHtml });
        }
        return route.continue();
    });
    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (request.method() !== 'GET' && request.method() !== 'HEAD') {
            writes.push(`${request.method()} ${url.pathname}`);
            return route.fulfill({ status: 405, contentType: 'application/json', body: JSON.stringify({ error: 'read_only_fixture' }) });
        }

        let payload = {};
        if (url.pathname === '/api/auth/session') {
            payload = { authenticated: true, user: { id: 9201, name: 'مدرب الاختبار', role: 'Owner', tenantType: 'independent_trainer', mustChangePassword: false } };
        } else if (url.pathname === '/api/saas/entitlements') {
            const features = ['clients', 'coaching', 'nutrition', 'library', 'assessments', 'progress', 'goals', 'sessions', 'packages', 'payments', 'reports', 'portal', 'notifications', 'tasks', 'templates'];
            payload = {
                tenantStatus: 'active',
                subscription: { status: 'active', plan: { code: 'basic', name: 'Basic' } },
                entitlements: {
                    tenantType: 'independent_trainer',
                    features: Object.fromEntries(features.map((feature) => [feature, true])),
                    featureCatalog: features.map((key) => ({ key, tenantTypes: ['independent_trainer'] }))
                }
            };
        } else if (url.pathname === '/api/saas/subscription') {
            payload = { tenant: { name: 'مساحة المدرب التجريبية' }, subscription: { status: 'active', plan: { name: 'Trainer' } } };
        } else if (url.pathname === '/api/trainer/workspace') {
            payload = { metrics: { activeClients: 3, sessionsToday: 2, upcomingSessions: 4, packagesExpiring: 1, outstandingPayments: 850, clientsNeedingFollowUp: 1, recentMeasurements: 2, recentCheckins: 1 } };
        } else if (url.pathname === '/api/trainer/clients') {
            payload = { clients: [{ id: 1, fullName: 'عميل اختبار', phone: '01000000000', primaryGoal: 'قوة', status: 'active' }], pagination: { page: 1, totalPages: 1, total: 1 } };
        }
        return route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(payload) });
    });
    return writes;
}

async function expectNoHorizontalOverflow(page, width) {
    const dimensions = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        document: document.documentElement.scrollWidth,
        body: document.body.scrollWidth
    }));
    expect(dimensions.document, `${width}px document overflow: ${JSON.stringify(dimensions)}`).toBeLessThanOrEqual(width + 1);
    expect(dimensions.body, `${width}px body overflow: ${JSON.stringify(dimensions)}`).toBeLessThanOrEqual(width + 1);
}

test('Trainer Workspace V2 keeps its shell accessible and contained across themes and breakpoints', async ({ page }) => {
    const writes = await installReadOnlyTrainerFixture(page);
    await page.goto('/trainer-workspace/dashboard', { waitUntil: 'networkidle' });
    await expect(page.locator('.trainer-studio-topbar')).toBeVisible();
    await expect(page.locator('[data-studio-route="dashboard"]')).toHaveClass(/is-active/);
    await expect(page.locator('#trainerMetricClients')).toHaveText('3');

    for (const width of [1440, 1024, 768, 390, 320]) {
        await page.setViewportSize({ width, height: width <= 390 ? 844 : 900 });
        for (const theme of ['light', 'dark']) {
            await page.evaluate((value) => window.TopGymTheme.set(value), theme);
            await expect(page.locator('.trainer-studio-topbar')).toBeVisible();
            const themeState = await page.evaluate(() => ({
                theme: document.documentElement.dataset.theme,
                appSurface: getComputedStyle(document.body).backgroundColor
            }));
            expect(themeState.theme).toBe(theme);
            expect(themeState.appSurface, `${width}px ${theme} surface should use the theme token`).toBe(theme === 'dark' ? 'rgb(9, 9, 11)' : 'rgb(245, 247, 251)');
            const chromeOrder = await page.evaluate(() => {
                const topbar = document.querySelector('.trainer-studio-topbar').getBoundingClientRect();
                const route = document.querySelector('.trainer-studio-route-bar').getBoundingClientRect();
            const firstDashboardSurface = document.querySelector('.trainer-workspace-summary').getBoundingClientRect();
                const brand = getComputedStyle(document.querySelector('.trainer-studio-topbar-brand > div')).flexDirection;
                return { topbarTop: topbar.top, routeTop: route.top, firstDashboardTop: firstDashboardSurface.top, brandDirection: brand };
            });
            expect(chromeOrder.topbarTop, `${width}px topbar should precede the route title`).toBeLessThanOrEqual(chromeOrder.routeTop);
            expect(chromeOrder.routeTop, `${width}px route title should precede dashboard content`).toBeLessThanOrEqual(chromeOrder.firstDashboardTop);
            expect(chromeOrder.brandDirection).toBe('column');
            await expectNoHorizontalOverflow(page, width);
            const evidenceDirectory = path.resolve(process.cwd(), 'qa/artifacts/trainer-workspace-v2-qa');
            await fsPromises.mkdir(evidenceDirectory, { recursive: true });
            await page.screenshot({ path: path.join(evidenceDirectory, `trainer-workspace-${width}-${theme}.png`), fullPage: true });
        }
    }

    await page.setViewportSize({ width: 390, height: 844 });
    const menu = page.locator('#trainerStudioMenuButton');
    const menuBounds = await menu.boundingBox();
    expect(menuBounds.width).toBeGreaterThanOrEqual(44);
    expect(menuBounds.height).toBeGreaterThanOrEqual(44);
    const menuLines = await menu.locator('span').evaluateAll((lines) => lines.map((line) => {
        const rect = line.getBoundingClientRect();
        return { width: rect.width, height: rect.height, visible: getComputedStyle(line).backgroundColor !== 'rgba(0, 0, 0, 0)' };
    }));
    expect(menuLines).toHaveLength(3);
    for (const line of menuLines) {
        expect(line.width).toBeGreaterThanOrEqual(16);
        expect(line.height).toBeGreaterThanOrEqual(2);
        expect(line.visible).toBe(true);
    }
    await page.keyboard.press('Tab');
    await menu.focus();
    const menuOutline = await menu.evaluate((element) => getComputedStyle(element).outlineStyle);
    expect(menuOutline).not.toBe('none');

    await menu.click();
    await expect(page.locator('body')).toHaveClass(/trainer-sidebar-open/);
    await expect(page.locator('#trainerStudioSidebar')).toBeVisible();
    const close = page.locator('#trainerStudioSidebarClose');
    const closeBounds = await close.boundingBox();
    expect(closeBounds.width).toBeGreaterThanOrEqual(44);
    expect(closeBounds.height).toBeGreaterThanOrEqual(44);
    await close.click();
    await expect(page.locator('body')).not.toHaveClass(/trainer-sidebar-open/);

    await menu.click();
    await page.locator('[data-studio-route="clients"]').click();
    await expect(page).toHaveURL(/\/trainer-workspace\/clients$/);
    await expect(page.locator('#trainerClients')).toBeVisible();
    await expect(page.locator('body')).not.toHaveClass(/trainer-sidebar-open/);
    await expectNoHorizontalOverflow(page, 390);
    expect(writes).toEqual([]);
});

test('Trainer Studio V2 route and dialog surfaces stay composed across the supported viewport matrix', async ({ page }) => {
    test.setTimeout(600_000);
    const writes = await installReadOnlyTrainerFixture(page);
    const routes = ['dashboard', 'clients', 'calendar', 'sessions', 'training', 'nutrition', 'exercises', 'measurements', 'progress', 'checkins', 'goals', 'packages', 'sales', 'renewals', 'finance', 'reports', 'notifications', 'tasks', 'portal', 'templates', 'settings'];
    const dialogIds = ['trainerClientDialog', 'trainerClientDetailsDialog', 'trainerTimelineDialog', 'trainerMeasurementDialog', 'trainerCheckinDialog', 'trainerPackageDialog', 'trainerSessionDialog', 'trainerPurchaseDialog', 'trainerPaymentDialog'];
    const widths = [1440, 1024, 768, 390, 320];
    const evidenceDirectory = path.resolve(process.cwd(), 'qa/artifacts/trainer-workspace-v2-qa');
    await fsPromises.mkdir(evidenceDirectory, { recursive: true });
    await page.goto('/trainer-workspace/dashboard', { waitUntil: 'networkidle' });

    // Each actual route is visited, checked for its resolved surface, and measured
    // at every supported width/theme. LTR is a direction-layout smoke only: this
    // surface currently ships Arabic markup and exposes no English locale switch.
    for (const route of routes) {
        await page.evaluate(() => { document.documentElement.dir = 'rtl'; });
        if (route !== 'dashboard') {
            if (page.viewportSize().width <= 860) await page.locator('#trainerStudioMenuButton').click();
            await page.locator(`[data-studio-route="${route}"]`).click();
        }
        await expect(page.locator('body')).toHaveAttribute('data-trainer-route', route);
        if (['dashboard', 'clients', 'packages', 'sales', 'reports'].includes(route)) {
            await expect(page.locator(`[data-studio-surface="${route}"]:visible`).first()).toBeVisible();
        } else {
            await expect(page.locator('#trainerStudioDynamicView')).toBeVisible();
        }

        for (const width of widths) {
            await page.setViewportSize({ width, height: width <= 390 ? 844 : 900 });
            for (const theme of ['light', 'dark']) {
                await page.evaluate((value) => window.TopGymTheme.set(value), theme);
                for (const direction of ['rtl', 'ltr']) {
                    await page.evaluate((value) => { document.documentElement.dir = value; }, direction);
                    const dimensions = await page.evaluate(() => ({
                        viewport: document.documentElement.clientWidth,
                        document: document.documentElement.scrollWidth,
                        body: document.body.scrollWidth,
                        route: document.body.dataset.trainerRoute,
                        direction: document.documentElement.dir,
                        overflowing: Array.from(document.querySelectorAll('body *')).map((element) => {
                            const rect = element.getBoundingClientRect();
                            return { selector: `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}${typeof element.className === 'string' && element.className.trim() ? `.${element.className.trim().split(/\\s+/).slice(0, 2).join('.')}` : ''}`, left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width), scrollWidth: element.scrollWidth };
                        }).filter((element) => element.width && (element.left < -1 || element.right > window.innerWidth + 1)).sort((a, b) => (b.right - window.innerWidth) - (a.right - window.innerWidth)).slice(0, 8)
                    }));
                    expect(dimensions.route).toBe(route);
                    expect(dimensions.direction).toBe(direction);
                    expect(dimensions.document, `${route} ${width}px ${theme} ${direction}: ${JSON.stringify(dimensions)}`).toBeLessThanOrEqual(width + 1);
                    expect(dimensions.body, `${route} ${width}px ${theme} ${direction}: ${JSON.stringify(dimensions)}`).toBeLessThanOrEqual(width + 1);

                    // Capture every viewport/theme in the primary Arabic direction;
                    // keep explicit LTR artifacts at desktop and phone widths too.
                    if (direction === 'rtl' || [1440, 390].includes(width)) {
                        await page.screenshot({
                            path: path.join(evidenceDirectory, `${route}-${width}-${theme}-${direction}.png`),
                            fullPage: false
                        });
                    }
                }
            }
        }
    }

    // These are the nine native dialogs in the real HTML. Open/close is visual
    // QA only; no submit, write request, or business action is invoked here.
    for (const dialogId of dialogIds) {
        const dialog = page.locator(`#${dialogId}`);
        await expect(dialog).toBeAttached();
        for (const width of widths) {
            await page.setViewportSize({ width, height: width <= 390 ? 844 : 900 });
            for (const theme of ['light', 'dark']) {
                await page.evaluate((value) => window.TopGymTheme.set(value), theme);
                for (const direction of ['rtl', 'ltr']) {
                    await page.evaluate((value) => { document.documentElement.dir = value; }, direction);
                    await dialog.evaluate((element) => element.showModal());
                    const bounds = await dialog.boundingBox();
                    expect(bounds, `${dialogId} ${width}px ${theme} ${direction}`).not.toBeNull();
                    expect(bounds.x).toBeGreaterThanOrEqual(-1);
                    expect(bounds.y).toBeGreaterThanOrEqual(-1);
                    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 1);
                    if (dialogId === 'trainerClientDialog' && width === 320) {
                        const actions = await page.locator('#trainerClientDialog .trainer-dialog-actions').boundingBox();
                        const cancel = await page.locator('#trainerClientCancel').boundingBox();
                        const save = await page.locator('#trainerClientSave').boundingBox();
                        const finalField = await page.locator('#trainerClientNotes').boundingBox();
                        expect(actions).not.toBeNull();
                        expect(actions.y + actions.height).toBeLessThanOrEqual(bounds.y + bounds.height + 1);
                        expect(finalField.y + finalField.height, '320px fixed actions must not cover the final form field').toBeLessThanOrEqual(actions.y);
                        expect(cancel.y).toBeGreaterThanOrEqual(actions.y);
                        expect(save.y).toBeGreaterThanOrEqual(actions.y);
                        expect(cancel.x + cancel.width).toBeLessThanOrEqual(width + 1);
                        expect(save.x + save.width).toBeLessThanOrEqual(width + 1);
                    }
                    if (direction === 'rtl' || [1440, 390].includes(width)) {
                        await page.screenshot({ path: path.join(evidenceDirectory, `${dialogId}-${width}-${theme}-${direction}.png`), fullPage: false });
                    }
                    await dialog.evaluate((element) => element.close());
                }
            }
        }
    }
    expect(writes, 'visual coverage must not issue write requests').toEqual([]);
});
