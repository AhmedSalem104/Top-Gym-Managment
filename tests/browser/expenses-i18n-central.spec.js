const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const featureCatalog = require('../../src/services/feature-catalog');
const planCatalog = require('../../src/services/saas-plan-catalog');

const ORIGIN = 'http://127.0.0.1:4173';
const KNOWN_EXTERNAL_ASSET = 'https://cdn.jsdelivr.net/npm/sweetalert2@11';
const WIDTHS = [320, 390, 768, 1440];
const THEMES = ['light', 'dark'];
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const LONG_EXPENSE = 'مصروف صيانة معدات التدريب — وصف عربي طويل لاختبار التفاف النص في الشاشات الضيقة';
const OUTPUT = path.resolve(__dirname, '../../qa/artifacts/expenses-i18n-central');

async function installReadOnlyFixtures(page) {
    const writes = [];
    const externalRequests = [];
    let monthlyFinanceReads = 0;
    const plan = planCatalog.PLAN_CONFIGURATIONS.find((entry) => entry.code === 'business');

    await page.route('**/*', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const method = request.method().toUpperCase();
        if (url.origin !== ORIGIN) {
            if (url.href === KNOWN_EXTERNAL_ASSET) {
                return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
            }
            externalRequests.push(url.href);
            return route.abort('blockedbyclient');
        }
        if (!url.pathname.startsWith('/api/')) return route.continue();
        if (!SAFE_METHODS.has(method)) {
            writes.push({ pathname: url.pathname, method });
            return route.fulfill({ status: 405, contentType: 'application/json', body: '{"error":"Read-only expenses i18n QA"}' });
        }
        if (url.pathname === '/api/monthly-finance') monthlyFinanceReads += 1;
        const payloads = {
            '/api/auth/session': { authenticated: true, user: { id: 98421, name: 'Expenses i18n QA', role: 'Owner', tenantType: 'gym', permissions: [] } },
            '/api/branding': { identity: { brandName: 'Expenses i18n QA Gym' } },
            '/api/saas/entitlements': {
                tenantStatus: 'active',
                subscription: { status: 'active', plan: { code: 'business', name: plan.name } },
                entitlements: { tenantType: 'gym', features: planCatalog.featureFlagsForPlan('business'), featureCatalog: featureCatalog.getFeatureCatalog({ tenantType: 'gym' }) }
            },
            '/api/branches/bootstrap': { branches: [{ id: 1, name: 'فرع الاختبار', code: 'qa', status: 'active', isMain: true }], activeBranches: [{ id: 1, name: 'فرع الاختبار', code: 'qa', status: 'active', isMain: true }], defaultBranch: { id: 1, name: 'فرع الاختبار', code: 'qa', status: 'active', isMain: true }, sections: [], branchLimit: 5, hasMultipleActiveBranches: false, canUseAllBranches: true },
            '/api/bootstrap': { branches: [{ id: 1, name: 'فرع الاختبار', code: 'qa', status: 'active', isMain: true }], activeBranches: [{ id: 1, name: 'فرع الاختبار', code: 'qa', status: 'active', isMain: true }], defaultBranch: { id: 1, name: 'فرع الاختبار', code: 'qa', status: 'active', isMain: true }, sections: [] },
            '/api/monthly-finance': {
                period: { startDate: '2026-10-01', endDate: '2026-10-31' },
                subscriptions: { total: 18250, count: 17 },
                dayPasses: { total: 750, count: 5 },
                expenses: { total: 6200, count: 2, items: [
                    { id: 98401, name: 'إيجار الفرع', amount: 4200, expenseDate: '2026-10-03', notes: '' },
                    { id: 98402, name: LONG_EXPENSE, amount: 2000, expenseDate: '2026-10-06', notes: '' }
                ] },
                refunds: 0,
                net: 14800
            }
        };
        return route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(payloads[url.pathname] || {}) });
    });
    return { writes, externalRequests, getMonthlyFinanceReads: () => monthlyFinanceReads };
}

test('Gym expenses uses central Arabic/English i18n across viewport and theme matrix without writes or refetch', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The desktop project captures the deterministic locale, theme, and viewport matrix.');
    test.setTimeout(60_000);
    const runtime = await installReadOnlyFixtures(page);
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await fs.mkdir(OUTPUT, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/index.html#expenses', { waitUntil: 'domcontentloaded' });
    const screen = page.locator('#expensesSection');
    try {
        await expect(screen).toBeVisible({ timeout: 8_000 });
    } catch (error) {
        console.error('[expenses-i18n] screen did not initialize', JSON.stringify({
            pageErrors,
            title: await page.title().catch(() => ''),
            currentUrl: page.url(),
            startupState: await page.evaluate(() => ({
                activeTab: document.documentElement.dataset.topGymActiveTab,
                loadingTab: document.documentElement.dataset.topGymLoadingTab,
                financeLoaded: Boolean(window.__topGymMonthlyFinanceLoaded),
                expenseScreenExists: Boolean(document.querySelector('#expensesSection')),
                resourceUrls: performance.getEntriesByType('resource').map((entry) => entry.name).filter((name) => /monthly-finance|expenses\.css|\/api\/monthly-finance/.test(name))
            })).catch((runtimeError) => ({ evaluationError: runtimeError.message }))
        }));
        throw error;
    }
    await expect(screen.locator('#monthlyExpensesList .monthly-expense-item')).toHaveCount(2);
    await expect(page.locator('#languageToggleButton')).toBeVisible();
    await expect.poll(() => page.evaluate(() => Boolean(window.TopGymI18n))).toBe(true);

    const initialContract = await page.evaluate(() => ({
        route: location.hash,
        ids: ['expensesSection', 'monthlyFinanceCard', 'monthlyExpensesList', 'monthlyExpensesMeta', 'expenseDialog', 'expenseForm', 'expenseName', 'expenseAmount', 'expenseDate', 'expenseNotes', 'expenseSave', 'editingExpenseId'].map((id) => Boolean(document.getElementById(id))),
        rows: [...document.querySelectorAll('#expensesSection .monthly-expense-item')].map((row) => ({ id: row.dataset.expenseId, text: row.innerText, amount: row.querySelector('.monthly-expense-amount')?.textContent, date: row.querySelector('.monthly-expense-copy > span')?.textContent, actions: [...row.querySelectorAll('[data-expense-action]')].map((button) => [button.dataset.expenseAction, button.dataset.expenseId, button.dataset.requiredPermission]) })),
        selectedTab: document.querySelector('[data-page-tab="expenses"]')?.getAttribute('aria-selected'),
        state: document.querySelector('#expenseForm')?.dataset
    }));
    expect(initialContract.route).toBe('#expenses');
    expect(initialContract.ids).toEqual(Array(12).fill(true));
    expect(initialContract.rows).toHaveLength(2);
    const initialReads = runtime.getMonthlyFinanceReads();
    expect(initialReads).toBeGreaterThanOrEqual(1);

    const matrix = [];
    for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: width <= 390 ? 844 : 960 });
        for (const theme of THEMES) {
            await page.evaluate((mode) => window.TopGymTheme.set(mode), theme);
            for (const locale of ['ar', 'en']) {
                const active = await page.evaluate(() => window.TopGymI18n.get());
                if (active !== locale) await page.locator('#languageToggleButton').click();
                await expect(page.locator('html')).toHaveAttribute('lang', locale);
                await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
                await expect(screen.locator('.expenses-tab-heading h3')).toHaveText(locale === 'ar' ? 'إدارة المصروفات' : 'Manage expenses');
                await expect(screen.locator('.expenses-tab-heading p')).toHaveText(locale === 'ar'
                    ? 'أضف وعدّل واحذف مصروفات الشهر الحالي من مكان واحد.'
                    : 'Add, edit, and delete this month’s expenses in one place.');
                await expect(screen.locator('#addExpenseFromTabButton')).toContainText(locale === 'ar' ? 'إضافة مصروف' : 'Add expense');
                await expect(screen.locator('.monthly-expenses-list-head')).toContainText(locale === 'ar' ? 'البند والتاريخ' : 'Item and date');
                await expect(screen.locator('.monthly-expenses-list-head')).toContainText(locale === 'ar' ? 'الإجراءات' : 'Actions');
                await expect(screen.locator('#monthlyExpensesMeta')).toContainText(locale === 'ar'
                    ? /مصروف\s*·\s*مسجل خلال الفترة/u
                    : /\d+\s+expenses?\s*·\s*recorded during the period/u);
                await expect(screen.locator('[data-expense-action="edit"]').first()).toHaveAttribute('aria-label', locale === 'ar' ? 'تعديل المصروف' : 'Edit expense');
                await expect(screen.locator('[data-expense-action="delete"]').first()).toHaveAttribute('title', locale === 'ar' ? 'حذف المصروف' : 'Delete expense');
                await expect(screen.locator('.monthly-expense-copy strong').nth(0)).toHaveText('إيجار الفرع');
                await expect(screen.locator('.monthly-expense-copy strong').nth(1)).toHaveText(LONG_EXPENSE);

                const layout = await page.evaluate(() => {
                    const root = document.documentElement;
                    const body = document.body;
                    const area = document.querySelector('#expensesSection');
                    return {
                        viewport: innerWidth,
                        documentWidth: root.scrollWidth,
                        bodyWidth: body.scrollWidth,
                        areaWidth: area.scrollWidth,
                        direction: getComputedStyle(area).direction,
                        theme: root.dataset.theme,
                        locale: root.lang,
                        font: getComputedStyle(area.querySelector('h3')).fontFamily,
                        rows: [...area.querySelectorAll('.monthly-expense-item')].map((row) => ({ id: row.dataset.expenseId, name: row.querySelector('.monthly-expense-copy strong')?.textContent, amount: row.querySelector('.monthly-expense-amount')?.textContent, date: row.querySelector('.monthly-expense-copy > span')?.textContent, actions: [...row.querySelectorAll('[data-expense-action]')].map((button) => [button.dataset.expenseAction, button.dataset.expenseId, button.dataset.requiredPermission]) }))
                    };
                });
                expect(layout.documentWidth, `${width}px ${theme}/${locale} document overflow`).toBeLessThanOrEqual(width + 1);
                expect(layout.bodyWidth, `${width}px ${theme}/${locale} body overflow`).toBeLessThanOrEqual(width + 1);
                expect(layout.areaWidth).toBeLessThanOrEqual(width + 1);
                expect(layout.direction).toBe(locale === 'ar' ? 'rtl' : 'ltr');
                expect(layout.theme).toBe(theme);
                expect(layout.locale).toBe(locale);
                expect(layout.font).toContain(locale === 'ar' ? 'Tajawal' : 'Geist Variable');
                expect(layout.rows.map(({ id, name, actions }) => ({ id, name, actions })))
                    .toEqual(initialContract.rows.map((row) => ({ id: row.id, name: row.text.split('\n')[0], actions: row.actions })));
                const localizedFormatting = await page.evaluate(() => [
                    { amount: window.TopGymI18n.format('currency', 4200, { currency: 'EGP', minimumFractionDigits: 2, maximumFractionDigits: 2 }), date: window.TopGymI18n.format('date', '2026-10-03', { dateStyle: 'medium' }) },
                    { amount: window.TopGymI18n.format('currency', 2000, { currency: 'EGP', minimumFractionDigits: 2, maximumFractionDigits: 2 }), date: window.TopGymI18n.format('date', '2026-10-06', { dateStyle: 'medium' }) }
                ]);
                expect(layout.rows.map(({ amount, date }) => ({ amount, date }))).toEqual(localizedFormatting);
                expect(runtime.getMonthlyFinanceReads()).toBe(initialReads);
                await page.screenshot({ path: path.join(OUTPUT, `expenses-${width}-${theme}-${locale}.png`), fullPage: true });
                matrix.push({ width, theme, locale, direction: layout.direction, documentWidth: layout.documentWidth, expenseRows: layout.rows.length, monthlyFinanceReads: runtime.getMonthlyFinanceReads() });
            }
        }
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.TopGymTheme.set('light'));
    for (const locale of ['ar', 'en']) {
        const active = await page.evaluate(() => window.TopGymI18n.get());
        if (active !== locale) await page.locator('#languageToggleButton').click();
        await page.locator('#addExpenseFromTabButton').click();
        const dialog = page.locator('#expenseDialog');
        await expect(dialog).toBeVisible();
        await expect(dialog.locator('#expenseDialogTitle')).toHaveText(locale === 'ar' ? 'إضافة مصروف' : 'Add expense');
        await expect(dialog.locator('#expenseDialogDescription')).toHaveText(locale === 'ar'
            ? 'سجّل مصروفًا جديدًا ليُخصم مباشرة من صافي الشهر الحالي.'
            : 'Record a new expense to deduct it from the current month’s net total.');
        await expect(dialog.locator('label[for="expenseName"]')).toHaveText(locale === 'ar' ? 'اسم المصروف *' : 'Expense name *');
        await expect(dialog.locator('#expenseName')).toHaveAttribute('placeholder', locale === 'ar' ? 'مثال: إيجار أو صيانة' : 'Example: rent or maintenance');
        await expect(dialog.locator('#expenseSave')).toHaveText(locale === 'ar' ? 'حفظ المصروف' : 'Save expense');
        const viewport = page.viewportSize();
        expect(viewport).toEqual({ width: 390, height: 844 });
        expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');
        await page.screenshot({ path: path.join(OUTPUT, `expense-dialog-390-${locale}.png`) });
        await page.keyboard.press('Escape');
        await expect(dialog).not.toBeVisible();
    }

    expect(runtime.getMonthlyFinanceReads()).toBe(initialReads);
    expect(runtime.writes, 'Locale and theme QA must not make API writes.').toEqual([]);
    expect(runtime.externalRequests, 'Expenses i18n QA must not contact external services.').toEqual([]);
    expect(pageErrors, 'No browser runtime exceptions.').toEqual([]);
    await fs.writeFile(path.join(OUTPUT, 'matrix.json'), JSON.stringify({ route: '#expenses', widths: WIDTHS, themes: THEMES, locales: ['ar', 'en'], results: matrix, monthlyFinanceReads: initialReads, writes: runtime.writes, externalRequests: runtime.externalRequests }, null, 2));
});
