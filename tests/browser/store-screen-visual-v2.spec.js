'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { test, expect } = require('@playwright/test');

const BASE_URL = process.env.STORE_QA_BASE_URL || 'http://127.0.0.1:4173';
const ARTIFACT_ROOT = path.resolve(process.env.STORE_VISUAL_ARTIFACT_ROOT || 'qa/artifacts/store-screen-visual-v2');
const VIEWS = ['pos', 'products', 'inventory', 'purchases', 'sales', 'suppliers', 'expenses', 'reports', 'bar'];
const WIDTHS = [320, 390, 768, 1024, 1440];

const product = {
    id: 9801,
    nameAr: 'زجاجة مياه رياضية للاختبار البصري',
    name: 'Visual QA Sports Water Bottle',
    categoryName: 'مشروبات رياضية',
    category: 'Sports Drinks',
    sku: 'QA-WATER-750',
    stock: 12,
    active: true,
    variants: [{ id: 9802, variantName: '750 مل', sku: 'QA-WATER-750', sellingPrice: 87.5, active: true }]
};

const supplier = { id: 9803, name: 'مورد اختبار مرئي', phone: '+201001234567', phoneCountry: 'EG', email: 'visual-qa@example.test', active: true };
const purchase = { id: 9804, invoiceNumber: 'QA-PUR-9804', supplierName: supplier.name, purchaseDate: '2026-10-10', totalAmount: 500, paidAmount: 300, remainingAmount: 200, status: 'received' };
const sale = { saleNumber: 'QA-SALE-9805', customerName: 'عميل اختبار مرئي', customerPhone: '+201001234567', saleDate: '2026-10-11T10:30:00Z', totalAmount: 175, paidAmount: 175, remainingAmount: 0, status: 'completed' };
const expense = { id: 9806, name: 'مصروف اختبار بصري', category: 'شحن', expenseDate: '2026-10-11', amount: 24.5, paymentMethod: 'cash' };

function response(pathname) {
    if (pathname === '/api/auth/session') return { authenticated: true, user: { id: 9891, name: 'Store Visual QA', role: 'Owner', tenantType: 'gym', permissions: [] } };
    if (pathname === '/api/branding') return { branding: { identity: { brandName: 'نادي الاختبار' }, assets: {} }, version: 1 };
    if (pathname === '/api/saas/entitlements') return { tenantStatus: 'active', subscription: { status: 'active', plan: { code: 'business', name: 'Business' } }, entitlements: { tenantType: 'gym', features: { dashboard: true, store: true }, featureCatalog: [{ key: 'dashboard', tenantTypes: ['gym'] }, { key: 'store', tenantTypes: ['gym'] }] } };
    if (pathname === '/api/bootstrap' || pathname === '/api/branches') return { branches: [{ id: 1, name: 'الفرع الرئيسي', status: 'active', isMain: true }], sections: [], defaultBranch: { id: 1 } };
    if (pathname === '/api/commerce/stock-locations') return { locations: [{ id: 41, name: 'مخزن الفرع الرئيسي', type: 'store', status: 'active' }] };
    if (pathname === '/api/bar/menu') return { items: [{ variantId: 9802, name: product.nameAr, variantName: '750 مل', sku: product.sku, price: 87.5, available: true }] };
    if (/^\/api\/bar\/shifts\/branch\/\d+\/open$/u.test(pathname)) return { shift: null };
    if (pathname === '/api/store/bootstrap') return { categories: [{ id: 3, nameAr: product.categoryName, active: true }], products: { items: [product] }, suppliers: [supplier] };
    if (pathname === '/api/store/dashboard') return { summary: { revenue: 175 }, profit: { expenses: 24.5, netProfit: 55 }, today: { revenue: 87.5 }, alerts: { lowStock: [] } };
    if (pathname === '/api/store/products') return { items: [product] };
    if (pathname === '/api/store/inventory') return { items: [{ id: 9802, productName: product.nameAr, variantName: '750 مل', sku: product.sku, quantityOnHand: 12, minimumStock: 3, nearestExpiry: '2027-01-01', lowStock: false }] };
    if (pathname === '/api/store/purchases') return { items: [purchase] };
    if (pathname === '/api/store/sales') return { items: [sale] };
    if (pathname === '/api/store/suppliers') return [supplier];
    if (pathname === '/api/store/expenses') return { expenses: [expense] };
    if (pathname === '/api/store/reports') return { summary: { revenue: 175, orders: 2, refunds: 0 }, profit: { cogs: 120, netProfit: 55 }, bestSelling: [{ productName: product.nameAr, variantName: '750 مل', sku: product.sku, quantity: 2, revenue: 175, cogs: 120 }], byCategory: [{ name: product.categoryName, quantity: 2, revenue: 175 }], byCustomer: [], paymentMethods: [], dailySales: [], purchases: [purchase], inventory: [], returns: [], expenses: [expense] };
    return {};
}

const primaryControls = {
    pos: ['#storePosSearch', '#storeProductCatalog', '#storeCompleteSale'],
    products: ['#storeAddProduct', '#storeProductForm', '#storeProductsTable'],
    inventory: ['#storeInventoryRefresh', '#storeInventoryTable'],
    purchases: ['#storeAddPurchase', '#storePurchaseForm', '#storePurchasesTable'],
    sales: ['#storeSalesRefresh', '#storeSalesTable'],
    suppliers: ['#storeAddSupplier', '#storeSupplierForm', '#storeSuppliersTable'],
    expenses: ['#storeAddExpense', '#storeExpenseForm', '#storeExpensesTable'],
    reports: ['#storeReportRun', '#storeReportMode', '#storeReportTable'],
    bar: ['#barPosSearch', '#barPosOpenShift', '#barPosCheckout']
};

test('Store mounted responsive surface visual matrix (read-only synthetic fixture)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The test controls all viewport sizes in one deterministic browser session.');
    test.setTimeout(600_000);
    await fs.mkdir(ARTIFACT_ROOT, { recursive: true });

    const requests = [];
    const pageErrors = [];
    const runViews = (process.env.STORE_VISUAL_VIEWS || VIEWS.join(',')).split(',').filter((view) => VIEWS.includes(view));
    const runWidths = (process.env.STORE_VISUAL_WIDTHS || WIDTHS.join(',')).split(',').map(Number).filter((width) => WIDTHS.includes(width));
    const runLocales = (process.env.STORE_VISUAL_LOCALES || 'ar,en').split(',').filter((locale) => ['ar', 'en'].includes(locale));
    const runThemes = (process.env.STORE_VISUAL_THEMES || 'light,dark').split(',').filter((theme) => ['light', 'dark'].includes(theme));
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.context().route('**/api/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        requests.push({ method: request.method(), pathname: url.pathname });
        if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
            await route.fulfill({ status: 405, contentType: 'application/json', body: JSON.stringify({ error: 'Read-only visual fixture' }) });
            return;
        }
        await route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(response(url.pathname)) });
    });

    await page.goto(`${BASE_URL}/index.html#store`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForFunction(() => window.topGymAuth?.isReady?.() === true, null, { timeout: 30_000 });
    await page.waitForFunction(() => document.documentElement.dataset.topGymActiveTab === 'store', null, { timeout: 30_000 });
    await expect(page.locator('#storeSection')).toBeVisible();
    await page.waitForFunction(() => [...document.styleSheets].some((sheet) => sheet.href?.includes('/css/pages/store.css')));
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('#storeSection .store-subnav-button')).toHaveCount(9);

    const cases = [];
    for (const width of runWidths) {
        for (const locale of runLocales) {
            const expectedDir = locale === 'ar' ? 'rtl' : 'ltr';
            await page.evaluate((nextLocale) => window.TopGymI18n.set(nextLocale, { persist: false }), locale);
            await expect(page.locator('html')).toHaveAttribute('lang', locale);
            await expect(page.locator('html')).toHaveAttribute('dir', expectedDir);
            await page.setViewportSize({ width, height: width <= 390 ? 844 : 960 });

            for (const theme of runThemes) {
                await page.evaluate((mode) => {
                    document.documentElement.dataset.theme = mode;
                    document.body.dataset.theme = mode;
                }, theme);
                await page.locator('#storeSection .store-subnav').screenshot({ path: path.join(ARTIFACT_ROOT, `navigation-${width}-${locale}-${theme}.png`), animations: 'disabled' });

                for (const view of runViews) {
                    const tab = page.locator(`#storeSection [data-store-view="${view}"]`);
                    const panel = page.locator(`#storeSection [data-store-view-panel="${view}"]`);
                    await expect(tab).toBeVisible();
                    await tab.click();
                    await expect(tab).toHaveAttribute('aria-selected', 'true');
                    await expect(panel).toBeVisible();
                    await expect(page.locator('#storeSection [data-store-view-panel]:not([hidden])')).toHaveCount(1);
                    for (const selector of primaryControls[view]) await expect(panel.locator(selector)).toHaveCount(1);

                    const layout = await page.evaluate(async (viewName) => {
                        const root = document.documentElement;
                        const section = document.querySelector('#storeSection');
                        const nav = section.querySelector('.store-subnav');
                        const panelNode = section.querySelector(`[data-store-view-panel="${viewName}"]`);
                        const interactive = [...panelNode.querySelectorAll('button:not([hidden]), input:not([hidden]), select:not([hidden]), textarea:not([hidden]), a[href]')]
                            .filter((node) => {
                                const style = getComputedStyle(node);
                                const rect = node.getBoundingClientRect();
                                return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
                            });
                        const hasScrollableInlineAncestor = (node) => {
                            for (let ancestor = node.parentElement; ancestor && ancestor !== panelNode.parentElement; ancestor = ancestor.parentElement) {
                                const style = getComputedStyle(ancestor);
                                if (/(auto|scroll)/u.test(style.overflowX) && ancestor.scrollWidth > ancestor.clientWidth + 1) return true;
                            }
                            return false;
                        };
                        const outOfBounds = interactive.filter((node) => !hasScrollableInlineAncestor(node)).map((node) => ({
                            id: node.id || node.getAttribute('aria-label') || node.textContent.trim().slice(0, 36),
                            rect: (() => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; })()
                        })).filter(({ rect }) => rect.left < -1 || rect.right > innerWidth + 1);
                        const occluded = interactive.map((node) => {
                            const rect = node.getBoundingClientRect();
                            // A partially clipped control is checked after the
                            // dedicated scroll-into-view hit test below. Testing
                            // only controls fully in the viewport avoids treating
                            // a viewport edge as an overlay occluding its target.
                            if (rect.left < 0 || rect.top < 0 || rect.right > innerWidth || rect.bottom > innerHeight) return null;
                            const x = rect.left + rect.width / 2;
                            const y = rect.top + rect.height / 2;
                            // A horizontally scrollable table intentionally clips
                            // offscreen columns. Their controls are checked below
                            // after scrollIntoView; they are not viewport overlays.
                            for (let ancestor = node.parentElement; ancestor && ancestor !== panelNode.parentElement; ancestor = ancestor.parentElement) {
                                const style = getComputedStyle(ancestor);
                                if (!/(auto|scroll|hidden|clip)/u.test(`${style.overflowX} ${style.overflowY}`)) continue;
                                const clip = ancestor.getBoundingClientRect();
                                if (x < clip.left || x > clip.right || y < clip.top || y > clip.bottom) return null;
                            }
                            const hit = document.elementFromPoint(x, y);
                            return hit && (hit === node || node.contains(hit))
                                ? null
                                : {
                                    id: node.id || node.getAttribute('aria-label') || node.textContent.trim().slice(0, 36),
                                    rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
                                    hit: hit ? `${hit.tagName.toLowerCase()}#${hit.id}.${String(hit.className?.baseVal || hit.className || '').trim().replace(/\s+/gu, '.')}` : null
                                };
                        }).filter(Boolean);
                        // A control below the fold is not occluded merely because its
                        // viewport coordinates lie outside the current screen. Scroll
                        // each real interactive control into view, hit-test it there,
                        // then restore the user's original scroll positions. This also
                        // catches sticky/fixed overlays that genuinely cover actions.
                        const scrollableNodes = new Set([...panelNode.querySelectorAll('*'), panelNode]);
                        for (let ancestor = panelNode.parentElement; ancestor; ancestor = ancestor.parentElement) scrollableNodes.add(ancestor);
                        const scrollPositions = [...scrollableNodes]
                            .filter((node) => node.scrollHeight > node.clientHeight + 1)
                            .map((node) => [node, node.scrollTop, node.scrollLeft]);
                        const windowScroll = { x: window.scrollX, y: window.scrollY };
                        const controlHitTests = [];
                        for (const node of interactive) {
                            node.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
                            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
                            const rect = node.getBoundingClientRect();
                            const x = Math.max(0, Math.min(innerWidth - 1, rect.left + rect.width / 2));
                            const y = Math.max(0, Math.min(innerHeight - 1, rect.top + rect.height / 2));
                            const hit = document.elementFromPoint(x, y);
                            const targetable = rect.width > 0 && rect.height > 0
                                && rect.right > 0 && rect.left < innerWidth
                                && rect.bottom > 0 && rect.top < innerHeight
                                && Boolean(hit && (hit === node || node.contains(hit)));
                            controlHitTests.push({
                                id: node.id || node.getAttribute('aria-label') || node.textContent.trim().slice(0, 36),
                                targetable,
                                rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }
                            });
                        }
                        for (const [node, top, left] of scrollPositions) {
                            node.scrollTop = top;
                            node.scrollLeft = left;
                        }
                        window.scrollTo(windowScroll.x, windowScroll.y);
                        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
                        const untargetable = controlHitTests.filter(({ targetable }) => !targetable).map(({ id }) => id);
                        const hiddenRequired = [...panelNode.querySelectorAll('button, input, select, textarea, a[href]')]
                            .filter((node) => node.matches('[data-store-visual-required]') && (node.hidden || getComputedStyle(node).display === 'none'))
                            .map((node) => node.id || node.tagName);
                        return {
                            viewportWidth: innerWidth,
                            documentWidth: root.scrollWidth,
                            bodyWidth: document.body.scrollWidth,
                            direction: getComputedStyle(section).direction,
                            activeView: nav.querySelector('[aria-selected="true"]')?.dataset.storeView,
                            visibleViews: [...section.querySelectorAll('[data-store-view-panel]:not([hidden])')].map((node) => node.dataset.storeViewPanel),
                            visibleTabs: [...nav.querySelectorAll('.store-subnav-button:not([hidden])')].length,
                            tabLabelMetrics: [...nav.querySelectorAll('.store-subnav-button:not([hidden]) .store-tab-label')].map((node) => ({ width: node.clientWidth, scrollWidth: node.scrollWidth, whiteSpace: getComputedStyle(node).whiteSpace })),
                            panelWidth: panelNode.clientWidth,
                            panelScrollWidth: panelNode.scrollWidth,
                            interactiveCount: interactive.length,
                            outOfBounds,
                            occluded,
                            controlHitTests,
                            untargetable,
                            hiddenRequired
                        };
                    }, view);

                    if (layout.occluded.length) {
                        await testInfo.attach(`store-${view}-${width}-${locale}-${theme}-occlusion.png`, {
                            body: await page.screenshot({ fullPage: true }),
                            contentType: 'image/png'
                        });
                        await testInfo.attach(`store-${view}-${width}-${locale}-${theme}-occlusion.json`, {
                            body: Buffer.from(JSON.stringify(layout, null, 2)),
                            contentType: 'application/json'
                        });
                    }

                    expect(layout.viewportWidth).toBe(width);
                    expect(layout.documentWidth, `${view}/${width}/${locale}/${theme}: document overflow`).toBeLessThanOrEqual(width);
                    expect(layout.bodyWidth, `${view}/${width}/${locale}/${theme}: body overflow`).toBeLessThanOrEqual(width);
                    expect(layout.direction).toBe(expectedDir);
                    expect(layout.activeView).toBe(view);
                    expect(layout.visibleViews).toEqual([view]);
                    expect(layout.visibleTabs).toBe(9);
                    expect(layout.tabLabelMetrics.every((item) => item.width > 0 && item.scrollWidth <= item.width + 1 || item.whiteSpace === 'normal')).toBe(true);
                    expect(layout.panelScrollWidth, `${view}/${width}/${locale}/${theme}: panel width`).toBeLessThanOrEqual(layout.panelWidth + 1);
                    expect(layout.outOfBounds, `${view}/${width}/${locale}/${theme}: controls outside viewport`).toEqual([]);
                    expect(layout.occluded, `${view}/${width}/${locale}/${theme}: controls covered by another element`).toEqual([]);
                    expect(layout.untargetable, `${view}/${width}/${locale}/${theme}: interactive controls not hit-testable when scrolled into view`).toEqual([]);
                    expect(layout.hiddenRequired).toEqual([]);
                    expect(layout.interactiveCount, `${view}/${width}/${locale}/${theme}: no visible controls`).toBeGreaterThan(0);

                    await expect(panel).toBeVisible();
                    await panel.screenshot({ path: path.join(ARTIFACT_ROOT, `${view}-${width}-${locale}-${theme}.png`), animations: 'disabled' });
                    cases.push({ view, width, locale, theme, ...layout });
                }
            }
        }
    }

    expect(requests.filter(({ method }) => !['GET', 'HEAD', 'OPTIONS'].includes(method))).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(cases).toHaveLength(runViews.length * runWidths.length * runLocales.length * runThemes.length);
    await fs.writeFile(path.join(ARTIFACT_ROOT, 'matrix.json'), JSON.stringify({ generatedAt: new Date().toISOString(), views: runViews, widths: runWidths, locales: runLocales, themes: runThemes, cases, requestCount: requests.length, rejectedWrites: 0, pageErrors }, null, 2), 'utf8');
});
