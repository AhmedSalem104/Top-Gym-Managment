'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { test, expect } = require('@playwright/test');

const BASE_URL = process.env.STORE_QA_BASE_URL || 'http://127.0.0.1:4173';
const SCREENSHOT_ROOT = path.resolve(process.cwd(), 'qa/artifacts/store-v2-acceptance-2026-10-12');
const VIEWS = ['pos', 'products', 'inventory', 'purchases', 'sales', 'suppliers', 'expenses', 'reports', 'bar'];
const WIDTHS = [320, 375, 390, 768, 1024, 1440, 1920];
const VISUAL_CASES = [
    ...WIDTHS.map((width) => ({ width, theme: 'light', direction: 'rtl' })),
    { width: 390, theme: 'dark', direction: 'rtl' },
    { width: 390, theme: 'light', direction: 'ltr' },
    { width: 390, theme: 'dark', direction: 'ltr' },
    { width: 1440, theme: 'dark', direction: 'rtl' },
    { width: 1440, theme: 'light', direction: 'ltr' },
    { width: 1440, theme: 'dark', direction: 'ltr' }
];
const LOADING_NOT_APPLICABLE = new Set(['reports', 'bar']);
const VIEW_I18N_SENTINELS = {
    pos: 'store.pos.searchProducts',
    products: 'store.products.manage',
    inventory: 'store.inventory.description',
    purchases: 'store.purchases.title',
    sales: 'store.sales.title',
    suppliers: 'store.suppliers.description',
    expenses: 'store.expenses.description',
    reports: 'store.reports.description',
    bar: 'store.bar.description'
};

const product = {
    id: 9101,
    nameAr: 'زجاجة مياه رياضية للاختبار المرئي',
    categoryName: 'المشروبات الرياضية',
    sku: 'QA-BOTTLE-750-SPORT',
    stock: 12,
    active: true,
    variants: [{ id: 9102, variantName: '750 مل', sku: 'QA-BOTTLE-750-SPORT', sellingPrice: 87.5, active: true }]
};

const supplier = { id: 6101, name: 'مورد اختبار', phone: '+201001234567', phoneCountry: 'EG', email: 'qa@example.test', active: true };
const purchase = { id: 7101, invoiceNumber: 'QA-PUR-7101', supplierName: supplier.name, purchaseDate: '2026-10-10', totalAmount: 500, paidAmount: 300, remainingAmount: 200, status: 'received' };
const sale = { saleNumber: 'QA-SALE-8101', customerName: 'عميل اختبار طويل الاسم', customerPhone: '+201001234567', saleDate: '2026-10-11T10:30:00Z', totalAmount: 175, paidAmount: 175, remainingAmount: 0, status: 'completed' };
const expense = { id: 5101, name: 'مصروف شحن تجريبي', category: 'شحن', expenseDate: '2026-10-11', amount: 24.5, paymentMethod: 'cash' };

function deferred() {
    let resolve;
    const promise = new Promise((done) => { resolve = done; });
    return { promise, resolve };
}

function fixtureFor(pathname, state) {
    if (pathname === '/api/auth/session') {
        return { authenticated: true, user: state.user };
    }
    if (pathname === '/api/branding') return { branding: { identity: { brandName: 'نادي الاختبار' }, assets: {} }, version: 1 };
    if (pathname === '/api/saas/entitlements') {
        return { tenantStatus: 'active', subscription: { status: 'active', plan: { code: 'business', name: 'Business' } }, entitlements: { tenantType: 'gym', features: { dashboard: true, store: true }, featureCatalog: [{ key: 'dashboard', tenantTypes: ['gym'] }, { key: 'store', tenantTypes: ['gym'] }] } };
    }
    if (pathname === '/api/bootstrap' || pathname === '/api/branches') {
        return { branches: [{ id: 1, name: 'الفرع الرئيسي', status: 'active', isMain: true }], sections: [], defaultBranch: { id: 1 } };
    }
    if (pathname === '/api/commerce/stock-locations') return { locations: [{ id: 41, name: 'موقع بار تجريبي', type: 'bar', status: 'active' }] };
    if (pathname === '/api/bar/menu') return { items: [{ variantId: 9102, name: product.nameAr, variantName: '750 مل', sku: product.sku, price: 87.5, available: true }] };
    if (/^\/api\/bar\/shifts\/branch\/\d+\/open$/u.test(pathname)) return { shift: null };
    if (pathname === '/api/store/bootstrap') {
        return { categories: [{ id: 3, nameAr: product.categoryName, active: true }], products: { items: [product] }, suppliers: [supplier] };
    }
    if (pathname === '/api/store/dashboard') return { summary: { revenue: 175 }, profit: { expenses: 24.5, netProfit: 55 }, today: { revenue: 87.5 }, alerts: { lowStock: [] } };
    if (pathname === '/api/store/products') {
        if (state.emptyPaths.has(pathname)) return { items: [] };
        if (state.productsMode === 'error') return { status: 503, body: { code: 'QA_SYNTHETIC_READ_ERROR', message: 'Synthetic Store read failure' } };
        return { items: state.productsMode === 'empty' ? [] : [product] };
    }
    if (pathname === '/api/store/inventory') return { items: state.emptyPaths.has(pathname) ? [] : [{ id: 9102, productName: product.nameAr, variantName: '750 مل', sku: product.sku, quantityOnHand: 12, minimumStock: 3, nearestExpiry: '2027-01-01', lowStock: false }] };
    if (pathname === '/api/store/purchases') return { items: state.emptyPaths.has(pathname) ? [] : [purchase] };
    if (pathname === '/api/store/sales') return { items: state.emptyPaths.has(pathname) ? [] : [sale] };
    if (pathname === '/api/store/suppliers') return state.emptyPaths.has(pathname) ? [] : [supplier];
    if (pathname === '/api/store/expenses') return { expenses: state.emptyPaths.has(pathname) ? [] : [expense] };
    if (pathname === '/api/store/reports') {
        const empty = state.emptyPaths.has(pathname);
        return { summary: { revenue: empty ? 0 : 175, orders: empty ? 0 : 2, refunds: 0 }, profit: { cogs: empty ? 0 : 120, netProfit: empty ? 0 : 55 }, bestSelling: empty ? [] : [{ productName: product.nameAr, variantName: '750 مل', sku: product.sku, quantity: 2, revenue: 175, cogs: 120 }], byCategory: empty ? [] : [{ name: 'المشروبات الرياضية', quantity: 2, revenue: 175 }], byCustomer: [], paymentMethods: [], dailySales: [], purchases: empty ? [] : [purchase], inventory: [], returns: [], expenses: empty ? [] : [expense] };
    }
    return {};
}

test('Store V2 screen acceptance matrix — nine views, real navigation, state and viewport/theme/direction evidence', async ({ page, browser }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Viewport emulation is explicit; run one deterministic browser worker.');
    test.setTimeout(600_000);

    await fs.mkdir(SCREENSHOT_ROOT, { recursive: true });
    const state = {
        user: { id: 90091, name: 'Store QA Fixture', role: 'Owner', tenantType: 'gym', permissions: [] },
        productsMode: 'normal',
        emptyPaths: new Set(),
        errorPaths: new Set(),
        gates: new Map()
    };
    const requests = [];
    const rejectedWrites = [];

    await page.context().route('**/api/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const method = request.method();
        requests.push({ method, pathname: url.pathname, search: url.search });

        if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
            rejectedWrites.push({ method, pathname: url.pathname });
            await route.fulfill({ status: 405, contentType: 'application/json', body: JSON.stringify({ error: 'Read-only Store QA fixture' }) });
            return;
        }

        const gate = state.gates.get(url.pathname);
        if (gate) {
            state.gates.delete(url.pathname);
            gate.started.resolve();
            await gate.release.promise;
        }
        if (state.errorPaths.has(url.pathname)) {
            await route.fulfill({ status: 503, contentType: 'application/json; charset=utf-8', body: JSON.stringify({ code: 'QA_SYNTHETIC_READ_ERROR', message: 'Synthetic Store read failure' }) });
            return;
        }

        const result = fixtureFor(url.pathname, state);
        if (result?.status) {
            await route.fulfill({ status: result.status, contentType: 'application/json; charset=utf-8', body: JSON.stringify(result.body) });
            return;
        }
        await route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(result) });
    });

    const bootstrapGate = { started: deferred(), release: deferred() };
    state.gates.set('/api/store/bootstrap', bootstrapGate);
    console.log('[store-acceptance] navigate to #store');
    await page.goto(`${BASE_URL}/index.html#store`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    console.log('[store-acceptance] document ready; waiting for bootstrap request');
    await bootstrapGate.started.promise;
    console.log('[store-acceptance] bootstrap intercepted; waiting for auth readiness');
    await page.waitForFunction(() => window.topGymAuth?.isReady?.() === true);
    await expect(page.locator('#storeSection')).toBeVisible();
    await expect(page.locator('#storeProductCatalog .loading')).toBeVisible();
    bootstrapGate.release.resolve();
    console.log('[store-acceptance] bootstrap released');
    await page.waitForFunction(() => window.topGymPermissions?.canAccessTab?.(window.topGymAuth.getUser(), 'store') === true);
    await page.waitForFunction(() => window.topGymPermissions?.canUseFeature?.('store', window.topGymAuth.getUser()) === true);
    await page.waitForFunction(() => document.documentElement.dataset.topGymActiveTab === 'store');
    await expect(page.locator('#storeSection')).toBeVisible();
    await expect(page.locator('#dashboardStoreSummary')).toBeVisible();

    // Use the exact route stylesheet loaded by the production feature loader;
    // injecting a second source layer would produce misleading visual evidence.
    await page.waitForFunction(() => [...document.styleSheets].some((sheet) => sheet.href?.includes('/css/pages/store.css')));
    await page.evaluate(() => document.fonts.ready);

    // Exercise each existing first-load placeholder while its synthetic GET is held.
    const loadingEvidence = { pos: true, products: true, inventory: true, purchases: true, sales: true, suppliers: true, expenses: true, reports: true, bar: true };
    const firstLoad = [
        ['products', '/api/store/products', '#storeProductsTable .loading'],
        ['inventory', '/api/store/inventory', '#storeInventoryTable .loading'],
        ['purchases', '/api/store/purchases', '#storePurchasesTable .loading'],
        ['sales', '/api/store/sales', '#storeSalesTable .loading'],
        ['suppliers', '/api/store/suppliers', '#storeSuppliersTable .loading'],
        ['expenses', '/api/store/expenses', '#storeExpensesTable .loading'],
        ['reports', '/api/store/reports', '#storeReportTable .empty']
    ];
    for (const [view, endpoint, selector] of firstLoad) {
        console.log(`[store-acceptance] loading-state check: ${view}`);
        const gate = { started: deferred(), release: deferred() };
        state.gates.set(endpoint, gate);
        await page.locator(`#storeSection [data-store-view="${view}"]`).click();
        await gate.started.promise;
        console.log(`[store-acceptance] ${view} GET intercepted`);
        await expect(page.locator(selector)).toBeVisible();
        gate.release.resolve();
        console.log(`[store-acceptance] ${view} loading UI verified; response released`);
        const content = view === 'pos'
            ? '#storeProductCatalog .store-product-card'
            : (view === 'reports' ? '#storeReportTable table' : selector.replace(' .loading', ' .store-table'));
        if (view !== 'pos') await expect(page.locator(content)).toBeVisible();
        console.log(`[store-acceptance] ${view} response rendered`);
    }

    // Bar auto-initializes as soon as authentication is ready, before a user
    // selects its subview. Verify the existing request/render instead of waiting
    // for a second request that the current lifecycle intentionally won't issue.
    await page.locator('#storeSection [data-store-view="bar"]').click();
    await expect.poll(() => requests.filter((entry) => entry.pathname === '/api/bar/menu' && entry.method === 'GET').length).toBeGreaterThan(0);
    await expect(page.locator('#barPosMenu .bar-pos-item')).toBeVisible();

    const captures = [];
    const measurements = [];
    const layoutIssues = [];
    const textIssues = [];
    for (const { width, theme, direction } of VISUAL_CASES) {
                console.log(`[store-acceptance] matrix ${width}px ${theme}/${direction}`);
                await page.setViewportSize({ width, height: width <= 390 ? 844 : 1000 });
                await page.evaluate(({ mode, dir }) => {
                    document.documentElement.dataset.theme = mode;
                    document.body.dataset.theme = mode;
                }, { mode: theme, dir: direction });
                const locale = direction === 'ltr' ? 'en' : 'ar';
                if (await page.locator('html').getAttribute('lang') !== locale) {
                    await page.locator('#languageToggleButton').click();
                }
                await expect(page.locator('html')).toHaveAttribute('lang', locale);
                await expect(page.locator('html')).toHaveAttribute('dir', direction);

                const tabs = page.locator('#storeSection .store-subnav-button');
                await expect(tabs).toHaveCount(9);
                for (const view of VIEWS) {
                    const tab = page.locator(`#storeSection [data-store-view="${view}"]`);
                    const panel = page.locator(`#storeSection [data-store-view-panel="${view}"]`);
                    await expect(tab).toBeVisible();
                    await tab.click({ timeout: 10_000 });
                    await expect(tab).toHaveAttribute('aria-selected', 'true');
                    await expect(panel).toBeVisible();
                    await expect(page.locator('#storeSection [data-store-view-panel]:not([hidden])')).toHaveCount(1);
                    const expectedTabLabel = await page.evaluate((view) => window.TopGymI18n.t(`store.tabs.${view}`), view);
                    await expect(tab.locator('.store-tab-label')).toHaveText(expectedTabLabel);
                    if (locale === 'en') {
                        const sentinel = VIEW_I18N_SENTINELS[view];
                        await expect(panel.locator(`[data-i18n="${sentinel}"]`)).toHaveCount(1);
                        await expect(panel.locator(`[data-i18n="${sentinel}"]`)).toHaveText(await page.evaluate((key) => window.TopGymI18n.t(key), sentinel));
                        if (view === 'pos') await expect(panel.locator('#storeCartTotal')).toContainText('EGP');
                        if (view === 'purchases') await expect(panel.locator('.store-status')).toHaveText('Received');
                        if (view === 'sales') {
                            await expect(panel.locator('.store-status')).toHaveText('Completed');
                            await expect(panel.locator('.store-table tbody tr')).not.toContainText('2026-10-11');
                        }
                    } else {
                        if (view === 'pos') await expect(panel.locator('#storeCartTotal')).toContainText('ج.م');
                        if (view === 'purchases') await expect(panel.locator('.store-status')).toHaveText('مستلم');
                        if (view === 'sales') {
                            await expect(panel.locator('.store-status')).toHaveText('مكتمل');
                            await expect(panel.locator('.store-table tbody tr')).not.toContainText('2026-10-11');
                        }
                    }
                    if (view === 'pos' && width === 390 && theme === 'light' && direction === 'rtl') {
                        const requestCountBeforeLocaleFlip = requests.length;
                        await page.locator('#languageToggleButton').click();
                        await expect(page.locator('html')).toHaveAttribute('lang', 'en');
                        await expect(panel.locator('[data-i18n="store.pos.searchProducts"]')).toHaveText('Search products');
                        await expect(panel.locator('#storeCartTotal')).toContainText('EGP');
                        await expect.poll(() => requests.length).toBe(requestCountBeforeLocaleFlip);
                        await page.locator('#languageToggleButton').click();
                        await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
                        await expect(panel.locator('[data-i18n="store.pos.searchProducts"]')).toHaveText('بحث في المنتجات');
                        await expect(panel.locator('#storeCartTotal')).toContainText('ج.م');
                        await expect.poll(() => requests.length).toBe(requestCountBeforeLocaleFlip);
                    }

                    const metrics = await page.evaluate(() => {
                        const section = document.querySelector('#storeSection');
                        const nav = section.querySelector('.store-subnav');
                        const panel = section.querySelector('[data-store-view-panel]:not([hidden])');
                        const labels = [...nav.querySelectorAll('.store-tab-label')].filter((node) => !node.closest('[hidden]')).map((node) => ({
                            text: node.textContent.trim(),
                            width: node.clientWidth,
                            scrollWidth: node.scrollWidth,
                            lineHeight: getComputedStyle(node).lineHeight,
                            whiteSpace: getComputedStyle(node).whiteSpace
                        }));
                        const activeTab = nav.querySelector('[aria-selected="true"]');
                        return {
                            viewport: innerWidth,
                            documentWidth: document.documentElement.scrollWidth,
                            bodyWidth: document.body.scrollWidth,
                            direction: getComputedStyle(section).direction,
                            theme: document.documentElement.dataset.theme,
                            activeView: activeTab?.dataset.storeView,
                            visiblePanels: [...section.querySelectorAll('[data-store-view-panel]:not([hidden])')].map((node) => node.dataset.storeViewPanel),
                            tabCount: [...nav.querySelectorAll('.store-subnav-button:not([hidden])')].length,
                            navColumns: getComputedStyle(nav).gridTemplateColumns.split(' ').length,
                            activeTabContrast: getComputedStyle(activeTab).color,
                            panelWidth: panel.getBoundingClientRect().width,
                            panelScrollWidth: panel.scrollWidth,
                            overflowingElements: [...panel.querySelectorAll('*')].filter((node) => {
                                const style = getComputedStyle(node);
                                return style.display !== 'none' && node.getBoundingClientRect().width > 0 && node.scrollWidth > node.clientWidth + 2 && !node.closest('.store-table-wrap, .store-product-grid, .store-cart-lines, .bar-pos-menu-panel');
                            }).slice(0, 12).map((node) => ({ selector: node.id ? `#${node.id}` : node.className?.baseVal || node.className || node.tagName.toLowerCase(), client: node.clientWidth, scroll: node.scrollWidth })),
                            storeMobileCellColumns: [...panel.querySelectorAll('.store-table tbody td')]
                                .slice(0, 16)
                                .map((cell) => getComputedStyle(cell).gridTemplateColumns.split(' ').length),
                            labels
                        };
                    });

                    expect(metrics.viewport).toBe(width);
                    const caseName = `${view}/${width}/${theme}/${direction}`;
                    if (metrics.documentWidth > width || metrics.bodyWidth > width) layoutIssues.push(`${caseName}: page overflow ${metrics.documentWidth}/${metrics.bodyWidth}`);
                    if (metrics.direction !== direction || metrics.theme !== theme) layoutIssues.push(`${caseName}: expected ${theme}/${direction}, measured ${metrics.theme}/${metrics.direction}`);
                    if (metrics.activeView !== view || metrics.visiblePanels.length !== 1 || metrics.visiblePanels[0] !== view) layoutIssues.push(`${caseName}: active panel mismatch`);
                    if (metrics.tabCount !== 9) layoutIssues.push(`${caseName}: expected 9 visible tabs, got ${metrics.tabCount}`);
                    if (!metrics.labels.every((label) => label.text && label.width > 0)) layoutIssues.push(`${caseName}: empty or zero-width navigation label`);
                    if (metrics.panelScrollWidth > metrics.panelWidth + 1) layoutIssues.push(`${caseName}: panel wider than frame ${metrics.panelScrollWidth}/${metrics.panelWidth}`);
                    if (width <= 767 && metrics.storeMobileCellColumns.some((columns) => columns !== 1)) layoutIssues.push(`${caseName}: Store mobile table values must use one readable column`);
                    if (!metrics.labels.every((label) => label.scrollWidth <= label.width + 1 || label.whiteSpace === 'normal')) layoutIssues.push(`${caseName}: clipped navigation label`);
                    measurements.push({ view, width, theme, direction, ...metrics });

                    const requiredControls = {
                        pos: ['#storePosSearch', '#storeProductCatalog', '#storeCompleteSale'],
                        products: ['#storeAddProduct', '#storeProductForm', '#storeProductsTable'],
                        inventory: ['#storeInventoryRefresh', '#storeInventoryTable'],
                        purchases: ['#storeAddPurchase', '#storePurchaseForm', '#storePurchasesTable'],
                        sales: ['#storeSalesRefresh', '#storeSalesTable'],
                        suppliers: ['#storeAddSupplier', '#storeSupplierForm', '#storeSuppliersTable'],
                        expenses: ['#storeAddExpense', '#storeExpenseForm', '#storeExpensesTable'],
                        reports: ['#storeReportRun', '#storeReportMode', '#storeReportTable'],
                        bar: ['#barPosSearch', '#barPosOpenShift', '#barPosCheckout']
                    }[view];
                    for (const selector of requiredControls) await expect(panel.locator(selector)).toHaveCount(1);

                    const visibleText = await panel.innerText();
                    if (/[ÃÂØÙ][\u0080-\u00ff]/u.test(visibleText)) textIssues.push({ view, width, theme, direction, sample: visibleText.match(/[ÃÂØÙ][^\n]{0,48}/u)?.[0] || 'Mojibake marker in visible text' });

                    await page.evaluate(() => document.fonts.ready);
                    const viewDir = path.join(SCREENSHOT_ROOT, view, `${theme}-${direction}`);
                    await fs.mkdir(viewDir, { recursive: true });
                    await page.mouse.move(0, 0);
                    await panel.screenshot({ path: path.join(viewDir, `${width}.png`), animations: 'disabled' });
                    captures.push({ view, width, theme, direction, ...metrics });
                }
    }

    // Verify a keyboard-visible tab focus indicator without mutating application state.
    const posTab = page.locator('#storeSection [data-store-view="pos"]');
    await posTab.focus();
    await page.keyboard.press('Tab');
    const focusedTab = page.locator('#storeSection .store-subnav-button:focus-visible');
    await expect(focusedTab).toHaveCount(1);
    const focusStyle = await focusedTab.evaluate((element) => ({ borderColor: getComputedStyle(element).borderTopColor, outlineStyle: getComputedStyle(element).outlineStyle, boxShadow: getComputedStyle(element).boxShadow }));
    expect(focusStyle.borderColor).not.toBe('rgba(0, 0, 0, 0)');
    console.log('[store-acceptance] keyboard focus passed');

    // Exercise current read-only search, report filtering, and refresh affordances.
    await page.locator('#storeSection [data-store-view="pos"]').click();
    await page.locator('#storePosSearch').fill('no-such-qa-product');
    await expect(page.locator('#storeProductCatalog .empty')).toBeVisible();
    await page.locator('#storePosSearch').fill('');
    await expect(page.locator('#storeProductCatalog .store-product-card')).toHaveCount(1);
    console.log('[store-acceptance] POS search passed');

    await page.locator('#storeSection [data-store-view="bar"]').click();
    await page.locator('#barPosSearch').fill('no-such-qa-bar-item');
    await expect(page.locator('#barPosMenu .empty')).toBeVisible();
    await page.locator('#barPosSearch').fill('');
    await expect(page.locator('#barPosMenu .bar-pos-item')).toHaveCount(1);
    console.log('[store-acceptance] Bar search passed');

    await page.locator('#storeSection [data-store-view="inventory"]').click();
    const inventoryBefore = requests.filter((entry) => entry.pathname === '/api/store/inventory' && entry.method === 'GET').length;
    await page.locator('#storeInventoryRefresh').click();
    await expect.poll(() => requests.filter((entry) => entry.pathname === '/api/store/inventory' && entry.method === 'GET').length).toBe(inventoryBefore + 1);
    console.log('[store-acceptance] inventory refresh passed');

    await page.locator('#storeSection [data-store-view="sales"]').click();
    const salesBefore = requests.filter((entry) => entry.pathname === '/api/store/sales' && entry.method === 'GET').length;
    await page.locator('#storeSalesRefresh').click();
    await expect.poll(() => requests.filter((entry) => entry.pathname === '/api/store/sales' && entry.method === 'GET').length).toBe(salesBefore + 1);
    console.log('[store-acceptance] sales refresh passed');

    await page.locator('#storeSection [data-store-view="reports"]').click();
    await page.locator('#storeReportFrom').fill('2026-10-01');
    await page.locator('#storeReportTo').fill('2026-10-31');
    await page.locator('#storeReportMode').selectOption('categories');
    const reportBefore = requests.filter((entry) => entry.pathname === '/api/store/reports' && entry.method === 'GET').length;
    await page.locator('#storeReportRun').click();
    await expect.poll(() => requests.filter((entry) => entry.pathname === '/api/store/reports' && entry.method === 'GET').length).toBeGreaterThan(reportBefore);
    await expect(page.locator('#storeReportTable')).toContainText('المشروبات الرياضية');
    expect(requests.some((entry) => entry.pathname === '/api/store/reports' && entry.search.includes('from=2026-10-01') && entry.search.includes('to=2026-10-31'))).toBe(true);
    console.log('[store-acceptance] report filter passed');

    // Add-form actions are opened and cancelled only; submit controls are never activated.
    for (const [view, openSelector, formSelector, cancelSelector] of [
        ['products', '#storeAddProduct', '#storeProductFormCard', '#storeProductCancel'],
        ['purchases', '#storeAddPurchase', '#storePurchaseFormCard', '#storePurchaseCancel'],
        ['suppliers', '#storeAddSupplier', '#storeSupplierFormCard', '#storeSupplierCancel'],
        ['expenses', '#storeAddExpense', '#storeExpenseFormCard', '#storeExpenseCancel']
    ]) {
        console.log(`[store-acceptance] add form ${view}: open`);
        await page.locator(`#storeSection [data-store-view="${view}"]`).click({ timeout: 10_000 });
        await page.locator(openSelector).click({ timeout: 10_000 });
        await expect(page.locator(formSelector)).toBeVisible();
        console.log(`[store-acceptance] add form ${view}: visible`);
        await page.locator(cancelSelector).click({ timeout: 10_000 });
        await expect(page.locator(formSelector)).toBeHidden();
        console.log(`[store-acceptance] add form ${view}: cancelled`);
    }

    // Empty/read-error state per subview; all responses remain synthetic GETs.
    const readEndpoint = {
        products: '/api/store/products', inventory: '/api/store/inventory', purchases: '/api/store/purchases',
        sales: '/api/store/sales', suppliers: '/api/store/suppliers', expenses: '/api/store/expenses',
        reports: '/api/store/reports'
    };
    const emptyEvidence = {};
    for (const view of ['pos', 'bar']) {
        console.log(`[store-acceptance] empty state ${view}: search`);
        if (view === 'pos') {
            await page.locator('#storeSection [data-store-view="pos"]').click();
            await page.locator('#storePosSearch').fill('no-such-qa-product');
            await expect(page.locator('#storeProductCatalog .empty')).toBeVisible();
            await page.locator('#storePosSearch').fill('');
        } else {
            await page.locator('#storeSection [data-store-view="bar"]').click();
            await page.locator('#barPosSearch').fill('no-such-qa-bar-item');
            await expect(page.locator('#barPosMenu .empty')).toBeVisible();
            await page.locator('#barPosSearch').fill('');
        }
        emptyEvidence[view] = true;
        console.log(`[store-acceptance] empty state ${view}: passed`);
    }
    for (const [view, endpoint] of Object.entries(readEndpoint)) {
        console.log(`[store-acceptance] empty state ${view}: request`);
        state.emptyPaths.add(endpoint);
        await page.locator(`#storeSection [data-store-view="${view}"]`).click({ timeout: 10_000 });
        const emptyNode = view === 'products' ? '#storeProductsTable .empty' : `#storeSection [data-store-view-panel="${view}"] .store-table-wrap .empty`;
        await expect(page.locator(emptyNode)).toBeVisible();
        emptyEvidence[view] = true;
        state.emptyPaths.delete(endpoint);
        console.log(`[store-acceptance] empty state ${view}: passed`);
    }

    const errorEvidence = {};
    const errorTriggers = {
        pos: async () => page.locator('#storeRefreshButton').click({ timeout: 10_000 }),
        products: async () => page.locator('#storeSection [data-store-view="products"]').click({ timeout: 10_000 }),
        inventory: async () => page.locator('#storeInventoryRefresh').click({ timeout: 10_000 }),
        purchases: async () => page.locator('#storeSection [data-store-view="purchases"]').click({ timeout: 10_000 }),
        sales: async () => page.locator('#storeSalesRefresh').click({ timeout: 10_000 }),
        suppliers: async () => page.locator('#storeSection [data-store-view="suppliers"]').click({ timeout: 10_000 }),
        expenses: async () => page.locator('#storeSection [data-store-view="expenses"]').click({ timeout: 10_000 }),
        reports: async () => page.locator('#storeReportRun').click({ timeout: 10_000 }),
        bar: async () => page.locator('#barPosRefresh').click({ timeout: 10_000 })
    };
    const errorEndpoint = { ...readEndpoint, pos: '/api/store/bootstrap', bar: '/api/bar/menu' };
    for (const view of VIEWS) {
        console.log(`[store-acceptance] error state ${view}: request`);
        state.errorPaths.add(errorEndpoint[view]);
        const before = requests.filter((entry) => entry.pathname === errorEndpoint[view] && entry.method === 'GET').length;
        await page.locator(`#storeSection [data-store-view="${view}"]`).click({ timeout: 10_000 });
        console.log(`[store-acceptance] error state ${view}: selected`);
        await errorTriggers[view]();
        console.log(`[store-acceptance] error state ${view}: trigger dispatched`);
        await expect.poll(() => requests.filter((entry) => entry.pathname === errorEndpoint[view] && entry.method === 'GET').length, { timeout: 10_000 }).toBeGreaterThan(before);
        console.log(`[store-acceptance] error state ${view}: GET observed`);
        if (view === 'bar') {
            await expect(page.locator('#barPosStatus[data-status="error"]')).toBeVisible();
        } else {
            await expect(page.locator('#toast [role="alert"]').first()).toBeVisible();
        }
        console.log(`[store-acceptance] error state ${view}: message visible`);
        errorEvidence[view] = true;
        state.errorPaths.delete(errorEndpoint[view]);
        console.log(`[store-acceptance] ${view} error state passed`);
    }

    // Use a fresh browser context so the Owner session cannot be reused from
    // the visual run; every API response remains synthetic and read-only.
    const restrictedContext = await browser.newContext({ locale: 'ar-EG', viewport: { width: 1440, height: 900 } });
    const restrictedPage = await restrictedContext.newPage();
    const restrictedState = {
        user: { id: 90092, name: 'Store Restricted QA', role: 'Assistant', tenantType: 'gym', permissions: ['store.view'] },
        productsMode: 'normal', emptyPaths: new Set(), errorPaths: new Set(), gates: new Map()
    };
    await restrictedContext.route('**/api/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
            await route.fulfill({ status: 405, contentType: 'application/json', body: JSON.stringify({ error: 'Read-only Store permission fixture' }) });
            return;
        }
        const result = fixtureFor(url.pathname, restrictedState);
        if (result?.status) {
            await route.fulfill({ status: result.status, contentType: 'application/json; charset=utf-8', body: JSON.stringify(result.body) });
            return;
        }
        await route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(result) });
    });
    await restrictedPage.goto(`${BASE_URL}/index.html#store`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await restrictedPage.waitForFunction(() => window.topGymAuth?.isReady?.() === true);
    await expect.poll(() => restrictedPage.evaluate(() => window.topGymAuth?.getUser?.()?.role)).toBe('Assistant');
    await restrictedPage.waitForFunction(() => document.documentElement.dataset.topGymActiveTab === 'store');
    await expect(restrictedPage.locator('#storeSection')).toBeVisible();
    await expect(restrictedPage.locator('#storeAddProduct')).toBeHidden();
    await expect(restrictedPage.locator('#storeAddPurchase')).toBeHidden();
    await expect(restrictedPage.locator('#storeAddSupplier')).toBeHidden();
    await expect(restrictedPage.locator('#storeAddExpense')).toBeHidden();
    await expect(restrictedPage.locator('[data-store-view="purchases"]')).toBeHidden();
    await expect(restrictedPage.locator('[data-store-view="suppliers"]')).toBeHidden();
    await expect(restrictedPage.locator('[data-store-view="expenses"]')).toBeHidden();
    await expect(restrictedPage.locator('[data-store-view="reports"]')).toBeHidden();
    await expect(restrictedPage.locator('[data-store-view="bar"]')).toBeHidden();
    await expect(restrictedPage.locator('#storeCompleteSale')).toBeDisabled();
    await expect(restrictedPage.locator('[data-store-profit-only]:visible')).toHaveCount(0);
    await restrictedPage.locator('[data-store-view="products"]').click();
    await expect(restrictedPage.locator('#storeProductsTable')).toContainText(product.sku);
    await expect(restrictedPage.locator('#storeProductsTable [data-store-edit-product], #storeProductsTable [data-store-deactivate-product]')).toHaveCount(0);
    await restrictedPage.locator('[data-store-view="inventory"]').click();
    await expect(restrictedPage.locator('#storeInventoryTable')).toContainText(product.sku);
    await expect(restrictedPage.locator('#storeInventoryTable [data-store-adjust]')).toHaveCount(0);
    await restrictedContext.close();
    const permissionEvidence = 'Verified in a fresh synthetic Assistant browser context with store.view only and owner storage absent: create/manage entry points hidden, purchase/supplier/expense/report/bar subviews hidden, profit-only report selection hidden, product/inventory row-management actions absent, and sale checkout disabled. All fixture API writes reject with 405. No other role/permission permutations claimed.';
    state.user = { id: 90091, name: 'Store QA Fixture', role: 'Owner', tenantType: 'gym', permissions: [] };

    expect(captures).toHaveLength(VIEWS.length * VISUAL_CASES.length);
    expect(measurements).toHaveLength(VIEWS.length * VISUAL_CASES.length);
    expect.soft(layoutIssues, 'Every Store subview must fit all viewport/theme/direction cases').toEqual([]);
    expect(rejectedWrites, 'Store QA must not issue any non-read API request').toEqual([]);
    expect(requests.filter((entry) => entry.method !== 'GET' && entry.method !== 'HEAD' && entry.method !== 'OPTIONS')).toEqual([]);

    const actionGaps = 'Full screen acceptance remains partial: write/submit, delete, stock adjustment, sale checkout and bar shift/sale outcomes are intentionally not invoked against real data.';
    const matrix = VIEWS.map((view) => {
        const evidence = measurements.filter((item) => item.view === view);
        const viewCaptures = captures.filter((item) => item.view === view);
        const viewRequests = requests.filter((entry) => entry.method === 'GET' && (entry.pathname.includes('/store/') || entry.pathname.startsWith('/api/bar/')));
        const gap = [actionGaps];
        if (LOADING_NOT_APPLICABLE.has(view)) gap.push(view === 'reports' ? 'No separate report skeleton is designed; the instructional empty content remains stable while report GET is pending.' : 'Bar loads automatically with authenticated application context; its first-load state has no dedicated visible loader.');
        else if (!loadingEvidence[view]) gap.push('Loading affordance not exercised.');
        if (!emptyEvidence[view]) gap.push('Empty state not exercised.');
        if (!errorEvidence[view]) gap.push('Error state not exercised.');
        if (textIssues.some((item) => item.view === view)) gap.push('Visible fixture/UI text includes a UTF-8 mojibake marker; source ownership is outside this task except Store page CSS.');
        return {
            view,
            visualMatrixStatus: evidence.length === VISUAL_CASES.length && viewCaptures.length === VISUAL_CASES.length && !textIssues.some((item) => item.view === view) && !layoutIssues.some((item) => item.startsWith(`${view}/`)) ? 'PASS' : 'PARTIAL',
            fullScreenAcceptance: 'PARTIAL',
            screenshotCount: viewCaptures.length,
            measuredCases: evidence.length,
            dimensions: { cases: VISUAL_CASES },
            fixtureReadEndpoints: [...new Set(viewRequests.map((entry) => entry.pathname))],
            evidence: ['Actual in-app subview tab clicked; selected state and single visible panel asserted.', 'Central Arabic/English language switch exercised; locale, direction, selected tab label and a unique translated content sentinel are asserted for all nine views.', 'Page/panel overflow, tab-label fit, theme token mode and computed direction measured.', 'Loading/empty/error states are exercised where an explicit loading UI exists; intentional N/A cases are recorded in gaps.', 'Durable viewport screenshot captured for every view and every matrix case.'],
            gaps: gap
        };
    });
    const summary = {
        generatedAt: new Date().toISOString(),
        classification: { visualMatrixPass: matrix.filter((item) => item.visualMatrixStatus === 'PASS').length, fullScreenAccepted: matrix.filter((item) => item.fullScreenAcceptance === 'ACCEPTED').length, partial: matrix.filter((item) => item.fullScreenAcceptance === 'PARTIAL').length },
        screenshots: captures.length,
        layoutIssues,
        interactionCoverage: ['POS search empty/match', 'Bar menu search empty/match', 'Inventory refresh GET', 'Sales refresh GET', 'Report date/mode filter GET', 'Add-form open/cancel for products, purchases, suppliers, expenses', 'Keyboard focus-visible navigation', 'Synthetic loading/empty/read-error states checked per subview where a real UI affordance exists'],
        writes: rejectedWrites,
        permissionEvidence,
        actionGaps,
        textIssues,
        views: matrix
    };
    console.log(`STORE_ACCEPTANCE_MATRIX ${JSON.stringify(summary)}`);
    expect.soft(textIssues, 'Store UI should not render mojibake in user-facing copy').toEqual([]);
});
