const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const featureCatalog = require('../../src/services/feature-catalog');
const planCatalog = require('../../src/services/saas-plan-catalog');

const ORIGIN = 'http://127.0.0.1:4173';
const BLOCKED_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const VIEWPORTS = [1440, 1024, 768, 390, 320];
const THEMES = ['light', 'dark'];

async function installReadOnlyExpenseFixture(page) {
    const writes = [];
    const plan = planCatalog.PLAN_CONFIGURATIONS.find((item) => item.code === 'business');

    await page.route('**/*', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const method = request.method().toUpperCase();
        if (url.origin !== ORIGIN) return route.abort('blockedbyclient');
        if (!url.pathname.startsWith('/api/')) return route.continue();

        if (!BLOCKED_METHODS.has(method)) {
            writes.push({ path: url.pathname, method });
            return route.fulfill({ status: 405, contentType: 'application/json', body: '{"error":"Read-only visual fixture"}' });
        }

        const payloads = {
            '/api/auth/session': { authenticated: true, user: { id: 98201, name: 'Expenses V2 QA', role: 'Owner', tenantType: 'gym', permissions: [] } },
            '/api/branding': { identity: { brandName: 'Expenses V2 QA Gym' } },
            '/api/saas/entitlements': {
                tenantStatus: 'active',
                subscription: { status: 'active', plan: { code: 'business', name: plan.name } },
                entitlements: { tenantType: 'gym', features: planCatalog.featureFlagsForPlan('business'), featureCatalog: featureCatalog.getFeatureCatalog({ tenantType: 'gym' }) }
            },
            '/api/branches/bootstrap': { branches: [{ id: 1, name: 'QA Main', code: 'main', status: 'active', isMain: true }], activeBranches: [{ id: 1, name: 'QA Main', code: 'main', status: 'active', isMain: true }], defaultBranch: { id: 1, name: 'QA Main', code: 'main', status: 'active', isMain: true }, sections: [], branchLimit: 5, hasMultipleActiveBranches: false, canUseAllBranches: true },
            '/api/bootstrap': { branches: [{ id: 1, name: 'QA Main', code: 'main', status: 'active', isMain: true }], activeBranches: [{ id: 1, name: 'QA Main', code: 'main', status: 'active', isMain: true }], defaultBranch: { id: 1, name: 'QA Main', code: 'main', status: 'active', isMain: true }, sections: [] },
            '/api/monthly-finance': {
                period: { startDate: '2026-10-01', endDate: '2026-10-31' },
                subscriptions: { total: 18250, count: 17 },
                dayPasses: { total: 750, count: 5 },
                expenses: { total: 6200, count: 2, items: [
                    { id: 9201, name: 'Rent fixture', amount: 4200, expenseDate: '2026-10-03', notes: '' },
                    { id: 9202, name: 'مصروف صيانة معدات التدريب — وصف عربي طويل لاختبار التفاف النص في الشاشات الضيقة', amount: 2000, expenseDate: '2026-10-06', notes: '' }
                ] },
                refunds: 0,
                net: 14800
            }
        };
        return route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(payloads[url.pathname] || {}) });
    });
    return writes;
}

test.describe('Gym Expenses V2 continuation — touch target and action preservation', () => {
    test('keeps real expense actions intact and gives mobile controls 44px targets in both themes', async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== 'desktop', 'One deterministic desktop/mobile × theme matrix runs in the desktop project.');
        const writes = await installReadOnlyExpenseFixture(page);
        await page.setViewportSize({ width: 1440, height: 960 });
        await page.goto('/index.html#expenses', { waitUntil: 'domcontentloaded' });

        const screen = page.locator('#expensesSection');
        const item = screen.locator('.monthly-expense-item[data-expense-id="9201"]');
        const actions = item.locator('[data-expense-action]');
        await expect(screen).toBeVisible({ timeout: 20_000 });
        await expect(item).toContainText('Rent fixture');
        await expect(actions).toHaveCount(2);
        await page.addStyleTag({ content: await fs.promises.readFile(path.join(__dirname, '../../public/css/pages/expenses.css'), 'utf8') });

        for (const theme of THEMES) {
            for (const width of VIEWPORTS) {
                await page.setViewportSize({ width, height: 900 });
                await page.evaluate((mode) => {
                    document.documentElement.dataset.theme = mode;
                    document.body.dataset.theme = mode;
                    document.documentElement.dir = 'rtl';
                    document.body.dir = 'rtl';
                }, theme);
                await page.evaluate(() => document.fonts.ready);

                const state = await page.evaluate(() => {
                    const root = document.documentElement;
                    const body = document.body;
                    const screenNode = document.querySelector('#expensesSection');
                    const item = screenNode?.querySelector('.monthly-expense-item[data-expense-id="9201"]');
                    const buttons = [...(item?.querySelectorAll('[data-expense-action]') || [])];
                    const metrics = screenNode?.querySelector('.monthly-finance-metrics');
                    const expenseHeading = screenNode?.querySelector('.expenses-tab-heading');
                    const financeCard = screenNode?.querySelector('.monthly-finance-card');
                    const longItem = screenNode?.querySelector('.monthly-expense-item[data-expense-id="9202"]');
                    const expenseMetric = screenNode?.querySelector('.monthly-finance-metric.expenses');
                    const metricButton = expenseMetric?.querySelector('.add-expense-button');
                    const metricButtonRect = metricButton?.getBoundingClientRect();
                    const expenseMetricRect = expenseMetric?.getBoundingClientRect();
                    return {
                        documentWidth: root.scrollWidth,
                        bodyWidth: body.scrollWidth,
                        viewportWidth: innerWidth,
                        direction: getComputedStyle(screenNode).direction,
                        metricColumns: getComputedStyle(metrics).gridTemplateColumns.split(' ').length,
                        headingBorder: getComputedStyle(expenseHeading).borderTopColor,
                        financeCardBorder: getComputedStyle(financeCard).borderTopColor,
                        longItemTitle: longItem?.querySelector('.monthly-expense-copy strong')?.getAttribute('title'),
                        longItemCopyWidth: longItem?.querySelector('.monthly-expense-copy')?.getBoundingClientRect().width,
                        metricButtonContained: !metricButtonRect || (metricButtonRect.left >= expenseMetricRect.left && metricButtonRect.right <= expenseMetricRect.right),
                        metricValuesContained: [...(metrics?.querySelectorAll('.monthly-finance-value') || [])].every((value) => value.scrollWidth <= value.clientWidth),
                        expenseListMaxHeight: getComputedStyle(screenNode.querySelector('.monthly-expenses-list')).maxHeight,
                        buttons: buttons.map((button) => {
                            const rect = button.getBoundingClientRect();
                            return {
                                action: button.dataset.expenseAction,
                                id: button.dataset.expenseId,
                                permission: button.dataset.requiredPermission,
                                label: button.getAttribute('aria-label'),
                                width: rect.width,
                                height: rect.height
                            };
                        })
                    };
                });

                expect(state.documentWidth, `${width}px ${theme}: document overflow`).toBeLessThanOrEqual(width);
                expect(state.bodyWidth, `${width}px ${theme}: body overflow`).toBeLessThanOrEqual(width);
                expect(state.direction).toBe('rtl');
                expect(state.metricColumns, `${width}px ${theme}: compact metric layout`).toBe(width <= 359 ? 1 : width <= 991 ? 2 : 4);
                expect(state.headingBorder, `${width}px ${theme}: page heading matches its neutral finance surface`).toBe(state.financeCardBorder);
                expect(state.longItemTitle).toContain('وصف عربي طويل');
                expect(state.longItemCopyWidth).toBeGreaterThan(0);
                expect(state.metricButtonContained, `${width}px ${theme}: add-expense action stays in its metric`).toBe(true);
                expect(state.metricValuesContained, `${width}px ${theme}: financial values do not clip`).toBe(true);
                expect(state.expenseListMaxHeight).toBe('none');
                expect(state.buttons.map(({ action }) => action)).toEqual(['edit', 'delete']);
                expect(state.buttons.every((button) => button.id === '9201' && button.label)).toBe(true);
                expect(state.buttons.map(({ permission }) => permission)).toEqual(['finance.update', 'finance.delete']);
                if (width === 390) {
                    expect(state.buttons.every(({ width: w, height: h }) => w >= 44 && h >= 44), JSON.stringify(state.buttons)).toBe(true);
                }

                const screenshotName = `expenses-continuation-${width}-${theme}.png`;
                const screenshotPath = testInfo.outputPath(screenshotName);
                await page.screenshot({
                    path: screenshotPath,
                    fullPage: true
                });
                const evidenceDir = path.join(__dirname, '../../qa/reports/logicfit-v2-expenses');
                await fs.promises.mkdir(evidenceDir, { recursive: true });
                await fs.promises.copyFile(screenshotPath, path.join(evidenceDir, screenshotName));
            }
        }

        expect(writes, 'The visual test must not perform expense writes.').toEqual([]);
    });
});
