const { test, expect } = require('@playwright/test');
const featureCatalog = require('../../src/services/feature-catalog');
const planCatalog = require('../../src/services/saas-plan-catalog');

const BASE_ORIGIN = 'http://127.0.0.1:4173';
const VIEWPORTS = [1440, 1024, 768, 390, 320];
const THEMES = ['light', 'dark'];
const BLOCKED_WRITES = new Set(['GET', 'HEAD', 'OPTIONS']);
const KNOWN_EXTERNAL_ASSET = 'https://cdn.jsdelivr.net/npm/sweetalert2@11';

function json(route, payload, status = 200) {
    return route.fulfill({
        status,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify(payload)
    });
}

function monthlyFinanceFixture() {
    return {
        period: { startDate: '2026-10-01', endDate: '2026-10-31' },
        subscriptions: { total: 18250, count: 17 },
        dayPasses: { total: 750, count: 5 },
        expenses: {
            total: 6375.5,
            count: 3,
            items: [
                { id: 9201, name: 'إيجار ومرافق الفرع الرئيسي', amount: 4200, expenseDate: '2026-10-03', notes: 'fixture' },
                { id: 9202, name: 'مستلزمات النظافة والصيانة', amount: 1575.5, expenseDate: '2026-10-08', notes: 'fixture' },
                { id: 9203, name: 'مياه للمشتركين', amount: 600, expenseDate: '2026-10-10', notes: '' }
            ]
        },
        refunds: 0,
        net: 12624.5
    };
}

async function installReadOnlyFixtures(page) {
    const apiRequests = [];
    const writes = [];
    const externalAttempts = [];
    const externalEgress = [];
    const plan = planCatalog.PLAN_CONFIGURATIONS.find((item) => item.code === 'business');

    page.on('request', (request) => {
        const url = new URL(request.url());
        if (url.origin !== BASE_ORIGIN) externalAttempts.push(url.href);
    });

    // One route owns all network traffic: API mutations are rejected and all
    // third-party requests are blocked before they can leave the test browser.
    await page.route('**/*', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const method = request.method().toUpperCase();

        if (url.origin !== BASE_ORIGIN) {
            if (url.href === KNOWN_EXTERNAL_ASSET) {
                return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
            }
            externalEgress.push(url.href);
            return route.abort('blockedbyclient');
        }

        if (url.pathname.startsWith('/api/')) {
            apiRequests.push({ pathname: url.pathname, method });
            if (!BLOCKED_WRITES.has(method)) {
                writes.push({ pathname: url.pathname, method });
                return json(route, { error: 'Writes are blocked in this visual test.' }, 405);
            }

            if (url.pathname === '/api/auth/session') {
                return json(route, {
                    authenticated: true,
                    user: { id: 98201, name: 'Expenses V2 QA', role: 'Owner', tenantType: 'gym', permissions: [] }
                });
            }
            if (url.pathname === '/api/branding') {
                return json(route, { identity: { brandName: 'Expenses V2 QA Gym' } });
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
            if (url.pathname === '/api/branches/bootstrap' || url.pathname === '/api/bootstrap') {
                return json(route, {
                    branches: [{ id: 1, name: 'الفرع الرئيسي', code: 'main', status: 'active', isMain: true }],
                    activeBranches: [{ id: 1, name: 'الفرع الرئيسي', code: 'main', status: 'active', isMain: true }],
                    defaultBranch: { id: 1, name: 'الفرع الرئيسي', code: 'main', status: 'active', isMain: true },
                    sections: [],
                    branchLimit: 5,
                    hasMultipleActiveBranches: false,
                    canUseAllBranches: true
                });
            }
            if (url.pathname === '/api/monthly-finance') return json(route, monthlyFinanceFixture());

            // Inert synthetic fixture for unrelated read-only shell requests.
            return json(route, {});
        }

        return route.continue();
    });

    return { apiRequests, writes, externalAttempts, externalEgress };
}

async function openActualExpensesScreen(page) {
    await page.goto('/index.html#expenses', { waitUntil: 'domcontentloaded' });
    const screen = page.locator('#expensesSection');
    await expect(screen).toBeVisible({ timeout: 20_000 });
    await expect(screen.locator('#expensesTabHost #monthlyFinanceCard')).toBeVisible();
    await expect(screen.locator('#monthlyExpensesList .monthly-expense-item')).toHaveCount(3);
    await expect(screen.locator('#monthlyExpensesList')).toContainText('إيجار ومرافق الفرع الرئيسي');
}

async function setPresentation(page, width, theme) {
    await page.setViewportSize({ width, height: width <= 390 ? 844 : 960 });
    await page.evaluate(({ nextTheme }) => {
        // Match theme.js runtime: both document root and body carry the mode.
        document.documentElement.dataset.theme = nextTheme;
        document.body.dataset.theme = nextTheme;
        document.documentElement.dir = 'rtl';
        document.body.dir = 'rtl';
    }, { nextTheme: theme });
    await page.evaluate(() => document.fonts.ready);
}

async function inspectActualLayout(page, width, theme) {
    return page.evaluate(() => {
        const screen = document.querySelector('#expensesSection');
        const card = document.querySelector('#expensesTabHost #monthlyFinanceCard');
        const metrics = screen?.querySelector('.monthly-finance-metrics');
        const list = screen?.querySelector('#monthlyExpensesList');
        const row = list?.querySelector('.monthly-expense-item');
        const addButton = screen?.querySelector('#addExpenseFromTabButton');
        const heading = screen?.querySelector('.expenses-tab-heading');
        const rect = (element) => {
            const box = element?.getBoundingClientRect();
            return box ? { x: box.x, y: box.y, width: box.width, height: box.height, right: box.right, bottom: box.bottom } : null;
        };
        const gridColumnCount = (element) => getComputedStyle(element).gridTemplateColumns
            .split(/\s+(?![^()]*\))/)
            .filter(Boolean).length;
        const headingStyle = getComputedStyle(heading);
        const headingContentWidth = heading.clientWidth
            - parseFloat(headingStyle.paddingInlineStart || '0')
            - parseFloat(headingStyle.paddingInlineEnd || '0');

        return {
            viewportWidth: innerWidth,
            documentWidth: document.documentElement.scrollWidth,
            bodyWidth: document.body.scrollWidth,
            htmlTheme: document.documentElement.dataset.theme,
            bodyTheme: document.body.dataset.theme,
            bodyAppSurfaceToken: getComputedStyle(document.body).getPropertyValue('--bg-app').trim().toLowerCase(),
            direction: getComputedStyle(document.body).direction,
            screen: rect(screen),
            card: rect(card),
            metrics: rect(metrics),
            metricsColumns: gridColumnCount(metrics),
            expenseList: rect(list),
            expenseRow: rect(row),
            expenseRowColumns: gridColumnCount(row),
            addButton: rect(addButton),
            headingFlexDirection: headingStyle.flexDirection,
            headingContentWidth,
            expenseRowDisplay: getComputedStyle(row).display,
            expenseCount: list.querySelectorAll('.monthly-expense-item').length
        };
    });
}

test.describe('actual dynamically mounted Gym Expenses screen — V2 visual matrix', () => {
    test('mounts read-only fixtures across desktop, tablet and mobile in Light/Dark', async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== 'desktop', 'One deterministic 5-width × 2-theme matrix is captured in the desktop project.');

        const runtime = await installReadOnlyFixtures(page);
        await openActualExpensesScreen(page);

        for (const theme of THEMES) {
            for (const width of VIEWPORTS) {
                await setPresentation(page, width, theme);
                await expect(page.locator('#expensesSection')).toBeVisible();
                await expect(page.locator('#expensesSection #addExpenseFromTabButton')).toBeVisible();
                await expect(page.locator('#expensesSection #monthlyExpensesList .monthly-expense-item')).toHaveCount(3);

                const layout = await inspectActualLayout(page, width, theme);
                expect(layout.documentWidth, `${width}px ${theme}: document overflow ${JSON.stringify(layout)}`).toBeLessThanOrEqual(width);
                expect(layout.bodyWidth, `${width}px ${theme}: body overflow ${JSON.stringify(layout)}`).toBeLessThanOrEqual(width);
                expect(layout.htmlTheme).toBe(theme);
                expect(layout.bodyTheme).toBe(theme);
                expect(layout.bodyAppSurfaceToken).toBe(theme === 'dark' ? '#09090b' : '#f5f7fb');
                expect(layout.direction).toBe('rtl');
                expect(layout.screen?.width).toBeGreaterThan(0);
                expect(layout.card?.width).toBeGreaterThan(0);
                expect(layout.metrics?.width).toBeGreaterThan(0);
                expect(layout.expenseList?.width).toBeGreaterThan(0);
                expect(layout.expenseCount).toBe(3);

                const expectedMetricColumns = width <= 359 ? 1 : width <= 991 ? 2 : 4;
                expect(layout.metricsColumns, `${width}px ${theme}: unexpected KPI composition ${JSON.stringify(layout)}`)
                    .toBe(expectedMetricColumns);
                if (width <= 767) {
                    expect(layout.headingFlexDirection, `${width}px ${theme}: mobile heading must stack`).toBe('column');
                    const expectedExpenseRowColumns = width <= 359 ? 1 : 2;
                    expect(layout.expenseRowColumns, `${width}px ${theme}: expense record must use the narrow-screen column contract`)
                        .toBe(expectedExpenseRowColumns);
                    expect(Math.abs(layout.addButton.width - layout.headingContentWidth),
                        `${width}px ${theme}: add action should fill the header's actual content width ${JSON.stringify(layout)}`)
                        .toBeLessThanOrEqual(1);
                } else {
                    expect(layout.expenseRowColumns, `${width}px ${theme}: desktop/tablet record structure changed`).toBe(3);
                }

                await page.screenshot({
                    path: testInfo.outputPath(`expenses-${width}-${theme}.png`),
                    fullPage: true
                });
            }
        }

        expect(runtime.apiRequests, 'The real monthly-finance read must be intercepted with a synthetic fixture.')
            .toContainEqual({ pathname: '/api/monthly-finance', method: 'GET' });
        expect(runtime.apiRequests.length, 'Expected all observed API traffic to be recorded by the fixture route.')
            .toBeGreaterThan(0);
        expect(runtime.writes, 'The visual matrix must not issue any API write.')
            .toEqual([]);
        expect(runtime.externalEgress, 'No external request may leave the isolated browser test.')
            .toEqual([]);
        expect(runtime.externalAttempts.every((url) => url === KNOWN_EXTERNAL_ASSET),
            `Unexpected external resource attempt: ${runtime.externalAttempts.join(', ')}`).toBe(true);
        expect(runtime.apiRequests.every(({ method }) => BLOCKED_WRITES.has(method)),
            `Unexpected mutating API method: ${JSON.stringify(runtime.apiRequests)}`).toBe(true);
    });
});
