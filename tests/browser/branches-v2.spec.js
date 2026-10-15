const { test, expect } = require('@playwright/test');
const featureCatalog = require('../../src/services/feature-catalog');
const planCatalog = require('../../src/services/saas-plan-catalog');

const BASE_ORIGIN = 'http://127.0.0.1:4173';
const VIEWPORTS = [1440, 1024, 900, 768, 390, 320];
const THEMES = ['light', 'dark'];

function json(route, payload, status = 200) {
    return route.fulfill({
        status,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify(payload)
    });
}

function branchFixtures() {
    const branches = [
        {
            id: 8101,
            name: 'فرع مدينة نصر الرئيسي',
            code: 'nasr-main',
            address: 'شارع طويل لاختبار التفاف العنوان عند الشاشات الصغيرة — مدينة نصر، القاهرة، بجوار مركز الخدمات الرياضية',
            phone: '+201001234567',
            status: 'active',
            isMain: true,
            storeEnabled: true,
            barEnabled: false
        },
        {
            id: 8102,
            name: 'فرع التجمع الخامس للتدريب واللياقة البدنية',
            code: 'new-cairo-training',
            address: 'محور طويل لاختبار اسم وعنوان الفرع العربي عند 320 بكسل — القاهرة الجديدة، بجوار مجمع الخدمات الرياضي المتكامل',
            phone: '+201009876543',
            status: 'active',
            isMain: false,
            storeEnabled: false,
            barEnabled: true
        },
        {
            id: 8103,
            name: 'فرع الاختبار التجاري',
            code: 'commerce-qa',
            address: 'شارع التحرير، الدقي',
            phone: '+201112223333',
            status: 'inactive',
            isMain: false,
            storeEnabled: true,
            barEnabled: true
        }
    ];

    return {
        branches,
        activeBranches: branches,
        defaultBranch: branches[0],
        sections: [],
        branchLimit: 5,
        hasMultipleActiveBranches: true,
        canUseAllBranches: true
    };
}

async function installIsolatedRuntime(page) {
    const writes = [];
    const externalAttempts = [];
    const externalEgress = [];
    const apiRequests = [];
    const fixture = branchFixtures();
    const plan = planCatalog.PLAN_CONFIGURATIONS.find((item) => item.code === 'business');

    page.on('request', (request) => {
        const url = new URL(request.url());
        if (url.origin !== BASE_ORIGIN) externalAttempts.push(request.url());
    });

    // Keep every non-local request from leaving the isolated browser runtime.
    await page.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== BASE_ORIGIN) {
            // SweetAlert2 is currently referenced from jsDelivr by the app
            // shell. Fulfill that known dependency locally so no network call
            // leaves Playwright; abort any other third-party destination.
            if (url.href === 'https://cdn.jsdelivr.net/npm/sweetalert2@11') {
                return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
            }
            externalEgress.push(url.href);
            return route.abort('blockedbyclient');
        }
        return route.continue();
    });

    // This route owns every API request. Writes are recorded and rejected;
    // unknown reads receive an inert fixture rather than reaching a server DB.
    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const method = request.method().toUpperCase();
        apiRequests.push({ pathname: url.pathname, method });
        if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
            writes.push({ pathname: url.pathname, method });
            return json(route, { error: 'Writes are blocked in this visual test.' }, 405);
        }

        if (url.pathname === '/api/auth/session') {
            return json(route, {
                authenticated: true,
                user: { id: 98101, name: 'Branches V2 QA', role: 'Owner', tenantType: 'gym', permissions: [] }
            });
        }
        if (url.pathname === '/api/branding') {
            return json(route, { identity: { brandName: 'Branches V2 QA Gym' } });
        }
        if (url.pathname === '/api/saas/entitlements') {
            return json(route, {
                tenantStatus: 'active',
                subscription: { status: 'active', plan: { code: 'business', name: plan.name } },
                entitlements: {
                    tenantType: 'gym',
                    features: planCatalog.featureFlagsForPlan('business'),
                    featureCatalog: featureCatalog.getFeatureCatalog({ tenantType: 'gym' })
                }
            });
        }
        if (url.pathname === '/api/branches/bootstrap') return json(route, fixture);
        if (url.pathname === '/api/bootstrap') {
            return json(route, { branches: fixture.activeBranches, sections: [], defaultBranch: fixture.defaultBranch });
        }
        if (url.pathname === '/api/dashboard') return json(route, { stats: {}, alerts: [] });
        return json(route, {});
    });

    return { writes, externalAttempts, externalEgress, apiRequests };
}

async function openMobileNavigationIfNeeded(page) {
    const toggle = page.locator('#mobileNavToggle');
    if (await toggle.isVisible().catch(() => false)) {
        const isOpen = await page.locator('.app-shell').evaluate((shell) => shell.classList.contains('mobile-nav-open'));
        if (!isOpen) await toggle.click();
        await expect(page.locator('#pageTabs')).toBeVisible();
    }
}

async function openRealBranchesScreen(page) {
    await page.goto('/index.html#branches', { waitUntil: 'domcontentloaded' });
    await expect.poll(() => page.locator('#branchesSection').count()).toBe(1);
    await openMobileNavigationIfNeeded(page);

    const branchesTab = page.locator('[data-page-tab="branches"]');
    await expect(branchesTab).toBeVisible();
    if (await branchesTab.getAttribute('aria-selected') !== 'true') await branchesTab.click();
    await expect(page.locator('#branchesSection')).toBeVisible();
    const mobileNavOpen = await page.locator('.app-shell').evaluate((shell) => shell.classList.contains('mobile-nav-open'));
    if (mobileNavOpen) {
        await page.keyboard.press('Escape');
        await expect(page.locator('#pageTabs')).toBeHidden();
    }
    await expect(page.locator('#branchesList .branch-list-item')).toHaveCount(3);
    await expect(page.locator('#branchesList .branch-list-item').first()).toContainText('فرع مدينة نصر الرئيسي');
}

async function assertBranchesLayout(page, width, theme, testInfo) {
    await page.setViewportSize({ width, height: width < 600 ? 820 : 960 });
    await page.evaluate((mode) => {
        document.documentElement.dataset.theme = mode;
        document.body.dataset.theme = mode;
        document.documentElement.dir = 'rtl';
    }, theme);
    await page.evaluate(() => document.fonts.ready);

    const layout = await page.evaluate(() => {
        const list = document.querySelector('#branchesList');
        const rows = [...document.querySelectorAll('#branchesList .branch-list-item')];
        const row = rows[0];
        const copy = row?.querySelector('.branch-list-copy');
        const actions = row?.querySelector('.branch-list-actions');
        const rect = (element) => {
            const value = element.getBoundingClientRect();
            return { x: value.x, y: value.y, width: value.width, height: value.height, right: value.right, bottom: value.bottom };
        };
        return {
            viewportWidth: innerWidth,
            theme: document.documentElement.dataset.theme,
            bodyTheme: document.body.dataset.theme,
            appSurfaceToken: getComputedStyle(document.body).getPropertyValue('--bg-app').trim().toLowerCase(),
            documentWidth: document.documentElement.scrollWidth,
            bodyWidth: document.body.scrollWidth,
            listWidth: rect(list).width,
            row: rect(row),
            copy: rect(copy),
            actions: rect(actions),
            rowGridColumnCount: getComputedStyle(row).gridTemplateColumns.split(' ').length,
            actionsGridColumn: getComputedStyle(actions).gridColumnStart,
            archiveActionCount: actions.querySelectorAll('[data-branch-archive]').length
        };
    });

    expect(layout.documentWidth, `${width}px ${theme}: document overflow ${JSON.stringify(layout)}`).toBeLessThanOrEqual(width);
    expect(layout.bodyWidth, `${width}px ${theme}: body overflow ${JSON.stringify(layout)}`).toBeLessThanOrEqual(width);
    expect(layout.theme).toBe(theme);
    expect(layout.bodyTheme).toBe(theme);
    expect(layout.appSurfaceToken).toBe(theme === 'dark' ? '#09090b' : '#f5f7fb');
    expect(layout.row.width).toBeGreaterThan(0);
    expect(layout.copy.width).toBeGreaterThan(0);
    expect(layout.archiveActionCount).toBe(0); // Main branch is protected from archive actions.

    const mainRowActions = page.locator('[data-branch-row="8102"] .branch-list-actions');
    await expect(mainRowActions.getByRole('button', { name: 'إيقاف البار' })).toBeVisible();
    await expect(mainRowActions.getByRole('button', { name: 'أرشفة الفرع فرع التجمع الخامس للتدريب واللياقة البدنية' })).toBeVisible();
    await expect(page.locator('[data-branch-row="8102"] .branch-commerce-chip')).toHaveCount(2);
    await expect(page.locator('[data-branch-row="8102"]')).toContainText('المتجر غير مفعل');
    await expect(page.locator('[data-branch-row="8102"]')).toContainText('البار مفعل');

    if (width > 900) {
        expect(layout.row.height, `expected compact desktop row at ${width}px: ${JSON.stringify(layout)}`).toBeLessThanOrEqual(220);
        expect(layout.actions.height).toBeGreaterThan(0);
    } else {
        expect(layout.rowGridColumnCount, `expected mobile/tablet content and action rows at ${width}px: ${JSON.stringify(layout)}`).toBeGreaterThanOrEqual(2);
        expect(layout.actionsGridColumn).toBe('2');
        expect(layout.actions.y).toBeGreaterThanOrEqual(layout.copy.y + layout.copy.height - 1);
    }

    await page.screenshot({
        path: testInfo.outputPath(`branches-${width}-${theme}.png`),
        fullPage: true
    });
}

test.describe('real dynamically-created branches page V2', () => {
    test('renders branch fixtures without overflow across viewports and themes', async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== 'desktop', 'A single deterministic viewport/theme sweep runs in the desktop project.');
        const runtime = await installIsolatedRuntime(page);
        await openRealBranchesScreen(page);

        for (const theme of THEMES) {
            for (const width of VIEWPORTS) {
                await assertBranchesLayout(page, width, theme, testInfo);
            }
        }

        expect(runtime.apiRequests).toContainEqual({ pathname: '/api/branches/bootstrap', method: 'GET' });
        expect(runtime.writes, 'The branch screen must not issue a mutating API request in this spec.').toEqual([]);
        expect(runtime.externalEgress, 'No external request may leave the isolated browser test.').toEqual([]);
        expect(runtime.externalAttempts.every((url) => url === 'https://cdn.jsdelivr.net/npm/sweetalert2@11'),
            `Unexpected external resource request: ${runtime.externalAttempts.join(', ')}`).toBe(true);
        expect(runtime.apiRequests.every(({ method }) => ['GET', 'HEAD', 'OPTIONS'].includes(method))).toBe(true);
    });

    test('uses the real create dialog and exposes its required accessible controls', async ({ page }) => {
        const runtime = await installIsolatedRuntime(page);
        await openRealBranchesScreen(page);

        const openButton = page.locator('#branchCreateOpen');
        await expect(openButton).toHaveAccessibleName('إضافة فرع');
        await openButton.click();

        const dialog = page.locator('#branchCreateDialog');
        await expect(dialog).toBeVisible();
        await expect(dialog).toHaveAttribute('open', '');
        await expect(dialog.getByRole('heading', { name: 'إضافة فرع' })).toBeVisible();
        await expect(dialog.locator('#branchCreateForm')).toBeVisible();
        await expect(dialog.locator('#branchCodeInput')).toHaveAttribute('required', '');
        await expect(dialog.locator('#branchNameInput')).toHaveAttribute('required', '');
        await expect(dialog.locator('#branchAddressInput')).toBeVisible();
        await expect(dialog.locator('#branchPhoneInput')).toBeVisible();
        await expect(dialog.locator('#branchFormStatus')).toHaveAttribute('aria-live', 'polite');
        await expect(dialog.getByRole('button', { name: 'إلغاء' })).toBeVisible();
        await expect(dialog.getByRole('button', { name: 'إضافة الفرع' })).toBeVisible();

        // The legacy header close hook is intentionally aria-hidden by the
        // canonical dialog shell; exercise the visible, user-operable cancel.
        await dialog.locator('#branchCreateCancel').click();
        await expect(dialog).not.toBeVisible();
        await openButton.click();
        await expect(dialog).toBeVisible();
        await dialog.locator('#branchCreateCancel').click();
        await expect(dialog).not.toBeVisible();

        expect(runtime.writes).toEqual([]);
        expect(runtime.externalEgress).toEqual([]);
    });
});
