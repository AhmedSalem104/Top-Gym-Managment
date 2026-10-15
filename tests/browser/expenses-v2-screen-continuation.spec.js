const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const featureCatalog = require('../../src/services/feature-catalog');
const planCatalog = require('../../src/services/saas-plan-catalog');

const ORIGIN = 'http://127.0.0.1:4173';
const KNOWN_EXTERNAL_ASSET = 'https://cdn.jsdelivr.net/npm/sweetalert2@11';
const WIDTHS = [320, 375, 390, 768, 1024, 1440, 1920];
const THEMES = ['light', 'dark'];
const LOCALES = ['ar', 'en'];
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const LONG_EXPENSE = 'Annual facility maintenance and equipment service expense with a deliberately long title for narrow viewport layout verification';
const SAMPLE_EXPENSES = [
    { id: 98401, name: 'Facility rent', amount: 4200, expenseDate: '2026-10-03', notes: '' },
    { id: 98402, name: LONG_EXPENSE, amount: 2000, expenseDate: '2026-10-06', notes: '' }
];

async function installReadOnlyFixtures(page) {
    const writes = [];
    const externalRequests = [];
    let financeMode = 'loaded';
    let releaseFinance;
    let financeRequestSeen;
    const plan = planCatalog.PLAN_CONFIGURATIONS.find((entry) => entry.code === 'business');

    await page.route('**/*', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const method = request.method().toUpperCase();

        if (url.origin !== ORIGIN) {
            if (url.href === KNOWN_EXTERNAL_ASSET) return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
            externalRequests.push(url.href);
            return route.abort('blockedbyclient');
        }
        if (!url.pathname.startsWith('/api/')) return route.continue();
        if (!SAFE_METHODS.has(method)) {
            writes.push({ pathname: url.pathname, method });
            return route.fulfill({ status: 405, contentType: 'application/json', body: '{"error":"Read-only expense visual QA"}' });
        }

        if (url.pathname === '/api/monthly-finance') {
            financeRequestSeen?.();
            if (financeMode === 'loading') {
                await new Promise((resolve) => { releaseFinance = resolve; });
                return route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(financePayload('loaded')) });
            }
            if (financeMode === 'error') {
                return route.fulfill({ status: 503, contentType: 'application/json; charset=utf-8', body: JSON.stringify({ error: 'Finance data is temporarily unavailable.' }) });
            }
            return route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(financePayload(financeMode)) });
        }

        const payloads = {
            '/api/auth/session': { authenticated: true, user: { id: 98421, name: 'Expenses V2 QA', role: 'Owner', tenantType: 'gym', permissions: ['finance.read', 'finance.update', 'finance.delete'] } },
            '/api/branding': { identity: { brandName: 'Expenses V2 QA Gym' } },
            '/api/saas/entitlements': {
                tenantStatus: 'active',
                subscription: { status: 'active', plan: { code: 'business', name: plan.name } },
                entitlements: { tenantType: 'gym', features: planCatalog.featureFlagsForPlan('business'), featureCatalog: featureCatalog.getFeatureCatalog({ tenantType: 'gym' }) }
            },
            '/api/branches/bootstrap': { branches: [{ id: 1, name: 'QA Main Branch', code: 'qa', status: 'active', isMain: true }], activeBranches: [{ id: 1, name: 'QA Main Branch', code: 'qa', status: 'active', isMain: true }], defaultBranch: { id: 1, name: 'QA Main Branch', code: 'qa', status: 'active', isMain: true }, sections: [], branchLimit: 5, hasMultipleActiveBranches: false, canUseAllBranches: true },
            '/api/bootstrap': { branches: [{ id: 1, name: 'QA Main Branch', code: 'qa', status: 'active', isMain: true }], activeBranches: [{ id: 1, name: 'QA Main Branch', code: 'qa', status: 'active', isMain: true }], defaultBranch: { id: 1, name: 'QA Main Branch', code: 'qa', status: 'active', isMain: true }, sections: [] }
        };
        return route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(payloads[url.pathname] || {}) });
    });
    return {
        writes,
        externalRequests,
        setFinanceMode(mode) { financeMode = mode; },
        waitForFinanceRequest() { return new Promise((resolve) => { financeRequestSeen = resolve; }); },
        releaseFinance() { releaseFinance?.(); releaseFinance = null; }
    };
}

function financePayload(mode) {
    const items = mode === 'loaded' ? SAMPLE_EXPENSES : [];
    return {
        period: { startDate: '2026-10-01', endDate: '2026-10-31' },
        subscriptions: { total: 18250, count: 17 },
        dayPasses: { total: 750, count: 5 },
        expenses: { total: items.reduce((total, item) => total + item.amount, 0), count: items.length, items },
        refunds: 0,
        net: 14800
    };
}

async function setLocale(page, locale) {
    await page.evaluate((value) => window.TopGymI18n?.set?.(value), locale);
    await expect.poll(() => page.evaluate(() => window.TopGymI18n?.get?.())).toBe(locale);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
    await expect.poll(() => page.locator('#expensesSection').evaluate((element) => getComputedStyle(element).direction)).toBe(locale === 'ar' ? 'rtl' : 'ltr');
}

async function setTheme(page, theme) {
    await page.evaluate((value) => window.TopGymTheme?.set?.(value), theme);
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe(theme);
}

async function inspectLayout(page, width, theme, locale, state) {
    return page.evaluate(({ width, theme, locale, state }) => {
        const root = document.documentElement;
        const body = document.body;
        const screen = document.querySelector('#expensesSection');
        const financeCard = screen?.querySelector('#monthlyFinanceCard');
        const list = screen?.querySelector('#monthlyExpensesList');
        const metricGrid = screen?.querySelector('.monthly-finance-metrics');
        const screenRect = screen?.getBoundingClientRect();
        const rows = [...(screen?.querySelectorAll('.monthly-expense-item') || [])];
        const buttons = [...(screen?.querySelectorAll('[data-expense-action]') || [])];
        const metrics = metricGrid;
        const controls = [...(screen?.querySelectorAll('button, a, input, select, textarea') || [])]
            .filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true');
        const rect = (element) => {
            if (!element) return null;
            const value = element.getBoundingClientRect();
            return { left: value.left, right: value.right, width: value.width, height: value.height };
        };
        return {
            state, width: innerWidth, viewport: innerWidth, documentWidth: root.scrollWidth, bodyWidth: body.scrollWidth,
            screenBounds: rect(screen), metricsBounds: rect(metrics),
            metricBounds: [...(metrics?.querySelectorAll('.monthly-finance-metric') || [])].map(rect),
            screenWidth: rect(screen)?.width, listWidth: rect(list)?.width,
            financeCardBounds: rect(financeCard), financeCardScrollWidth: financeCard?.scrollWidth,
            metricGridBounds: rect(metricGrid), metricGridScrollWidth: metricGrid?.scrollWidth,
            financeCardInsideScreen: Boolean(financeCard && financeCard.getBoundingClientRect().left >= screenRect.left - 1 && financeCard.getBoundingClientRect().right <= screenRect.right + 1),
            metricGridInsideCard: Boolean(metricGrid && metricGrid.getBoundingClientRect().left >= financeCard.getBoundingClientRect().left - 1 && metricGrid.getBoundingClientRect().right <= financeCard.getBoundingClientRect().right + 1),
            direction: getComputedStyle(screen).direction, htmlLang: root.lang,
            theme: root.dataset.theme, locale, font: getComputedStyle(screen).fontFamily,
            rowCount: rows.length,
            rowBounds: rows.map((row) => rect(row)), listBounds: rect(list),
            metricColumns: metrics ? getComputedStyle(metrics).gridTemplateColumns.split(/\\s+/u).length : 0,
            metricValues: [...(screen?.querySelectorAll('.monthly-finance-value') || [])].map((element) => element.textContent.trim()),
            periodText: screen?.querySelector('#monthlyFinancePeriod')?.textContent.trim() || '',
            financeStatusText: screen?.querySelector('#monthlyFinanceStatus')?.textContent.trim() || '',
            emptyStateText: screen?.querySelector('.monthly-expenses-empty')?.textContent.trim() || '',
            headingTitle: screen?.querySelector('.expenses-tab-heading h3')?.textContent.trim() || '',
            headingDescription: screen?.querySelector('.expenses-tab-heading p')?.textContent.trim() || '',
            addButtonText: screen?.querySelector('#addExpenseFromTabButton')?.innerText.trim() || '',
            listHeaders: [...(screen?.querySelectorAll('.monthly-expenses-list-head > span') || [])].map((element) => element.textContent.trim()),
            arabicTextInEnglishUi: locale === 'en' ? controls
                .flatMap((element) => {
                    const text = [element.innerText, element.getAttribute('aria-label'), element.getAttribute('title')].filter(Boolean).join(' ');
                    return /[\u0600-\u06FF]/u.test(text) ? [{ selector: element.id ? `#${element.id}` : element.className || element.tagName.toLowerCase(), text: text.trim() }] : [];
                }) : [],
            actionNames: buttons.map((button) => button.getAttribute('aria-label')),
            actionIds: buttons.map((button) => button.dataset.expenseId),
            actionPermissions: buttons.map((button) => button.dataset.requiredPermission),
            actionRects: buttons.map((button) => {
                const style = getComputedStyle(button);
                return { ...rect(button), foreground: style.color, background: style.backgroundColor, outline: style.outlineStyle };
            }),
            longExpenseTitle: rows.find((row) => row.textContent.includes('98402'))?.querySelector('.monthly-expense-copy strong')?.getAttribute('title') || rows[1]?.querySelector('.monthly-expense-copy strong')?.getAttribute('title'),
            listText: list?.innerText || '',
            unnamedControls: controls.filter((element) => {
                if (element.matches('input,select,textarea')) return !(element.labels?.length || element.getAttribute('aria-label') || element.getAttribute('aria-labelledby'));
                return !(element.getAttribute('aria-label') || element.getAttribute('aria-labelledby') || element.innerText?.trim() || element.getAttribute('title'));
            }).map((element) => element.outerHTML.slice(0, 180)),
            outsideRows: rows.filter((row) => {
                const rowRect = row.getBoundingClientRect();
                const listRect = list.getBoundingClientRect();
                return rowRect.left < listRect.left - 1 || rowRect.right > listRect.right + 1;
            }).length,
            outsideSurfaces: [financeCard, metrics, list, ...(metrics?.querySelectorAll('.monthly-finance-metric') || [])]
                .filter(Boolean)
                .filter((element) => {
                    const itemRect = element.getBoundingClientRect();
                    const screenRect = screen.getBoundingClientRect();
                    return itemRect.left < screenRect.left - 1 || itemRect.right > screenRect.right + 1;
                })
                .map((element) => ({ selector: element.id || element.className, ...rect(element) })),
            untranslatedArabicUi: locale === 'en'
                ? [...screen.querySelectorAll('.expenses-tab-heading-copy, .monthly-finance-heading h3, .monthly-finance-heading p, .monthly-finance-status, .monthly-finance-label, .monthly-finance-metric small, .monthly-expenses-list-head span, .monthly-expenses-empty')]
                    .map((element) => element.innerText.trim())
                    .filter((value) => /[\u0600-\u06ff]/u.test(value))
                : [],
            localeSensitiveDataPresentation: locale === 'en'
                ? [...screen.querySelectorAll('.monthly-finance-value, .monthly-expense-amount, .monthly-expense-copy span')]
                    .map((element) => ({ selector: `.${[...element.classList].join('.')}`, text: element.innerText.trim() }))
                    .filter(({ text }) => /[\u0600-\u06ff\u0660-\u0669]/u.test(text))
                : []
        };
    }, { width, theme, locale, state });
}

function assertNoOverflow(layout) {
    expect(layout.documentWidth, `${layout.state} ${layout.width}px ${layout.locale}/${layout.theme}: document overflow`).toBeLessThanOrEqual(layout.width + 1);
    expect(layout.bodyWidth, `${layout.state} ${layout.width}px ${layout.locale}/${layout.theme}: body overflow`).toBeLessThanOrEqual(layout.width + 1);
    expect(layout.screenWidth, `${layout.state} ${layout.width}px: screen width`).toBeLessThanOrEqual(layout.width + 1);
    expect(layout.financeCardInsideScreen, `${layout.state} ${layout.width}px: summary card must stay inside expenses panel`).toBe(true);
    expect(layout.metricGridInsideCard, `${layout.state} ${layout.width}px: summary metrics must stay inside summary card; geometry=${JSON.stringify({ screen: layout.screenWidth, card: layout.financeCardBounds, metrics: layout.metricGridBounds, cardScrollWidth: layout.financeCardScrollWidth, metricsScrollWidth: layout.metricGridScrollWidth, metricCards: layout.metricBounds })}`).toBe(true);
    expect(layout.outsideRows, `${layout.state} ${layout.width}px: expense rows must stay inside the list`).toBe(0);
    expect(layout.outsideSurfaces, `${layout.state} ${layout.width}px ${layout.locale}/${layout.theme}: nested expense surfaces must stay inside the screen`).toEqual([]);
    expect(layout.untranslatedArabicUi, `${layout.state} ${layout.width}px: Arabic labels should not remain in English UI`).toEqual([]);
}

test.describe('Gym expenses V2 — isolated read-only visual acceptance slice', () => {
    test('captures responsive locale/theme matrix and loaded, empty, error, and loading states', async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== 'desktop', 'The desktop project owns the deterministic viewport matrix.');
        test.setTimeout(300_000);
        const runtime = await installReadOnlyFixtures(page);
        const pageErrors = [];
        page.on('pageerror', (error) => pageErrors.push(error.message));
        const evidenceDir = path.resolve(__dirname, '../../qa/artifacts/expenses-v2-screen-continuation');
        await fs.mkdir(evidenceDir, { recursive: true });

        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.goto('/index.html#expenses', { waitUntil: 'domcontentloaded' });
        const screen = page.locator('#expensesSection');
        await expect(screen).toBeVisible({ timeout: 20_000 });
        await expect(screen.locator('#monthlyExpensesList .monthly-expense-item')).toHaveCount(2);
        const matrix = [];

        // Complete loaded-state coverage at all approved widths, locales and themes.
        for (const locale of LOCALES) {
            await setLocale(page, locale);
            for (const theme of THEMES) {
                await setTheme(page, theme);
                for (const width of WIDTHS) {
                    await page.setViewportSize({ width, height: width <= 390 ? 844 : 960 });
                    await page.evaluate(() => document.fonts.ready);
                    const layout = await inspectLayout(page, width, theme, locale, 'loaded');
                    assertNoOverflow(layout);
                    expect(layout.direction).toBe(locale === 'ar' ? 'rtl' : 'ltr');
                    expect(layout.htmlLang).toMatch(locale === 'ar' ? /^ar/u : /^en/u);
                    expect(layout.theme).toBe(theme);
                    expect(layout.rowCount).toBe(2);
                    expect(layout.headingTitle).toBe(locale === 'ar' ? 'إدارة المصروفات' : 'Manage expenses');
                    expect(layout.headingDescription).toBe(locale === 'ar'
                        ? 'أضف وعدّل واحذف مصروفات الشهر الحالي من مكان واحد.'
                        : 'Add, edit, and delete this month’s expenses in one place.');
                    expect(layout.addButtonText).toContain(locale === 'ar' ? 'إضافة مصروف' : 'Add expense');
                    expect(layout.listHeaders).toEqual(locale === 'ar' ? ['البند والتاريخ', 'القيمة', 'الإجراءات'] : ['Item and date', 'Amount', 'Actions']);
                    expect(layout.actionIds).toEqual(['98401', '98401', '98402', '98402']);
                    expect(layout.actionPermissions).toEqual(['finance.update', 'finance.delete', 'finance.update', 'finance.delete']);
                    expect(layout.longExpenseTitle).toBe(LONG_EXPENSE);
                    expect(layout.unnamedControls, `${width}px ${locale}/${theme}: accessible names`).toEqual([]);
                    if (width <= 991) expect(layout.actionRects.every(({ width: w, height: h }) => w >= 44 && h >= 44), `${width}px: mobile/tablet actions must meet touch target size`).toBe(true);
                    const file = `loaded-${width}-${locale}-${theme}.png`;
                    await page.screenshot({ path: path.join(evidenceDir, file), fullPage: true });
                    matrix.push(layout);
                }
            }
        }

        // Each data state is loaded once from a fresh page, then inspected without extra requests.
        const stateSamples = [320, 390, 768, 1440];
        const stateMatrix = [];
        for (const state of ['empty', 'error']) {
            runtime.setFinanceMode(state);
            await page.reload({ waitUntil: 'domcontentloaded' });
            await expect(screen).toBeVisible({ timeout: 20_000 });
            if (state === 'empty') await expect(screen.locator('#monthlyExpensesList .monthly-expense-item')).toHaveCount(0);
            else {
                await expect(screen.locator('#monthlyFinanceStatus')).not.toContainText('جارٍ التحديث');
                await expect(screen.locator('#monthlyExpensesList .monthly-expenses-empty')).toBeVisible();
            }
            for (const locale of LOCALES) {
                await setLocale(page, locale);
                for (const theme of THEMES) {
                    await setTheme(page, theme);
                    for (const width of stateSamples) {
                        await page.setViewportSize({ width, height: width <= 390 ? 844 : 960 });
                        const layout = await inspectLayout(page, width, theme, locale, state);
                        assertNoOverflow(layout);
                        expect(layout.direction).toBe(locale === 'ar' ? 'rtl' : 'ltr');
                        if (state === 'error') {
                            expect(layout.emptyStateText.length).toBeGreaterThan(0);
                            // Error and empty currently share the same presentation hook; preserve that
                            // observed distinction in evidence for the runtime/i18n owner.
                            layout.errorPresentationUsesEmptyState = true;
                        }
                        if (state === 'empty') expect(layout.listText.trim().length).toBeGreaterThan(0);
                        else expect(layout.listText.trim().length).toBeGreaterThan(0);
                        const file = `${state}-${width}-${locale}-${theme}.png`;
                        await page.screenshot({ path: path.join(evidenceDir, file), fullPage: true });
                        stateMatrix.push(layout);
                    }
                }
            }
        }

        // Loading is held deterministically while viewport/locale/theme vary; one read request only.
        const loadingMatrix = [];
        runtime.setFinanceMode('loading');
        const loadingRequest = runtime.waitForFinanceRequest();
        const reload = page.reload({ waitUntil: 'domcontentloaded' });
        await loadingRequest;
        await reload;
        await expect(screen).toBeVisible();
        for (const locale of LOCALES) {
            await setLocale(page, locale);
            for (const theme of THEMES) {
                await setTheme(page, theme);
                for (const width of [320, 768, 1440]) {
                    await page.setViewportSize({ width, height: width <= 390 ? 844 : 960 });
                    await expect(screen.locator('#monthlyFinanceStatus')).not.toBeEmpty();
                    const layout = await inspectLayout(page, width, theme, locale, 'loading');
                    assertNoOverflow(layout);
                    const file = `loading-${width}-${locale}-${theme}.png`;
                    await page.screenshot({ path: path.join(evidenceDir, file), fullPage: true });
                    loadingMatrix.push(layout);
                }
            }
        }
        runtime.releaseFinance();
        await expect(screen.locator('#monthlyExpensesList .monthly-expense-item')).toHaveCount(2);

        // Keep an actual keyboard-focus and add-expense dialog check, without submitting.
        runtime.setFinanceMode('loaded');
        await page.evaluate(() => window.topGymRefreshMonthlyFinance?.());
        await expect(screen.locator('#monthlyExpensesList .monthly-expense-item')).toHaveCount(2);
        await setLocale(page, 'ar');
        await setTheme(page, 'light');
        await page.setViewportSize({ width: 390, height: 844 });
        const editAction = screen.locator('[data-expense-action="edit"][data-expense-id="98401"]');
        await editAction.evaluate((element) => element.focus({ focusVisible: true }));
        const focus = await editAction.evaluate((element) => ({ visible: element.matches(':focus-visible'), width: getComputedStyle(element).outlineWidth, style: getComputedStyle(element).outlineStyle }));
        expect(focus).toEqual({ visible: true, width: '2px', style: 'solid' });
        await page.locator('#addExpenseFromTabButton').click();
        const dialog = page.locator('#expenseDialog');
        await expect(dialog).toBeVisible();
        const dialogBounds = await dialog.evaluate((element) => {
            const value = element.getBoundingClientRect();
            return { open: element.open, left: value.left, right: value.right, width: value.width, viewport: innerWidth };
        });
        expect(dialogBounds.open).toBe(true);
        expect(dialogBounds.left).toBeGreaterThanOrEqual(0);
        expect(dialogBounds.right).toBeLessThanOrEqual(dialogBounds.viewport);
        await page.screenshot({ path: path.join(evidenceDir, 'dialog-390-ar-light.png') });
        await page.keyboard.press('Escape');
        await expect(dialog).not.toBeVisible();

        expect(runtime.writes, 'Visual QA must remain read-only.').toEqual([]);
        expect(runtime.externalRequests, 'Browser QA must not contact external services.').toEqual([]);
        expect(pageErrors, 'No browser runtime exceptions.').toEqual([]);
        const statePresentationFindings = [
            ...matrix.filter((entry) => /loading monthly finance|جاري تحميل حسابات الشهر/iu.test(entry.periodText))
                .map((entry) => ({ state: entry.state, locale: entry.locale, theme: entry.theme, width: entry.width, selector: '#monthlyFinancePeriod', observedText: entry.periodText, issue: 'Loaded finance data still presents a loading label.' })),
            ...stateMatrix.filter((entry) => entry.state === 'error').flatMap((entry) => {
                const emptyState = stateMatrix.find((candidate) => candidate.state === 'empty'
                    && candidate.width === entry.width && candidate.locale === entry.locale && candidate.theme === entry.theme);
                const findings = [];
                if (!emptyState || entry.emptyStateText === emptyState.emptyStateText) {
                    findings.push({ state: entry.state, locale: entry.locale, theme: entry.theme, width: entry.width, selector: '.monthly-expenses-empty', issue: 'The error message is missing or indistinguishable from the no-records state.' });
                }
                if (!emptyState || entry.financeStatusText === emptyState.financeStatusText) {
                    findings.push({ state: entry.state, locale: entry.locale, theme: entry.theme, width: entry.width, selector: '#monthlyFinanceStatus', issue: 'The finance status does not reflect request failure.' });
                }
                if (!entry.metricValues?.every((value) => value === '—')) {
                    findings.push({ state: entry.state, locale: entry.locale, theme: entry.theme, width: entry.width, selector: '.monthly-finance-metric', issue: 'A failed request leaves misleading numeric defaults visible.' });
                }
                return findings;
            })
        ];
        expect(statePresentationFindings, 'Loading, empty, loaded and failed finance states must remain distinct and truthful.').toEqual([]);
        await fs.writeFile(path.join(evidenceDir, 'matrix.json'), JSON.stringify({
            route: '#expenses', widths: WIDTHS, locales: LOCALES, themes: THEMES,
            loaded: matrix, emptyAndError: stateMatrix, loading: loadingMatrix,
            statePresentationFindings,
            focus, dialog: dialogBounds, writes: runtime.writes,
            externalRequests: runtime.externalRequests, pageErrors
        }, null, 2));
    });
});
