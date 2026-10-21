'use strict';

const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');

const BASE_URL = process.env.STORE_QA_BASE_URL || 'http://127.0.0.1:4173';
const SCREENSHOTS = path.resolve(process.env.STORE_SCREENSHOTS_DIR || 'qa/artifacts/store-v2-screen-continuation');
const product = {
    id: 91,
    nameAr: 'زجاجة ماء رياضية باسم طويل لاختبار بقاء بيانات المنتج قابلة للقراءة',
    categoryName: 'المشروبات الرياضية',
    sku: 'QA-BOTTLE-750-SPORT',
    stock: 12,
    active: true,
    variants: [{ id: 9101, variantName: '750 مل', sku: 'QA-BOTTLE-750-SPORT', sellingPrice: 87.5, active: true }]
};

test('All Store views remain readable and usable across the responsive theme matrix', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'A single deterministic browser captures the complete Store matrix.');
    test.setTimeout(300_000);

    const requests = [];
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.context().route('**/api/**', async (route) => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;
        requests.push({ method: request.method(), pathname });
        let payload = {};

        if (pathname === '/api/auth/session') {
            payload = { authenticated: true, user: { id: 90091, name: 'Store QA Fixture', role: 'Owner', tenantType: 'gym', permissions: [] } };
        } else if (pathname === '/api/branding') {
            payload = { branding: { identity: { brandName: 'نادي الاختبار' }, assets: {} }, version: 1 };
        } else if (pathname === '/api/saas/entitlements') {
            payload = { tenantStatus: 'active', subscription: { status: 'active', plan: { code: 'business', name: 'Business' } }, entitlements: { tenantType: 'gym', features: { dashboard: true, store: true }, featureCatalog: [{ key: 'dashboard', tenantTypes: ['gym'] }, { key: 'store', tenantTypes: ['gym'] }] } };
        } else if (pathname === '/api/bootstrap') {
            payload = { branches: [{ id: 1, name: 'الفرع الرئيسي', status: 'active', isMain: true }], sections: [], defaultBranch: { id: 1 } };
        } else if (pathname === '/api/branches') {
            payload = { branches: [{ id: 1, name: 'الفرع الرئيسي', status: 'active', isMain: true }] };
        } else if (pathname === '/api/commerce/stock-locations') {
            payload = { locations: [{ id: 41, name: 'مخزن الفرع الرئيسي', type: 'store', status: 'active' }] };
        } else if (pathname === '/api/bar/menu') {
            payload = { items: [] };
        } else if (/^\/api\/bar\/shifts\/branch\/\d+\/open$/.test(pathname)) {
            payload = { shift: null };
        } else if (pathname === '/api/store/bootstrap') {
            payload = { categories: [{ id: 3, nameAr: 'المشروبات الرياضية', active: true }], products: { items: [product] }, suppliers: [] };
        } else if (pathname === '/api/store/dashboard') {
            payload = { summary: { revenue: 175 }, profit: { expenses: 12, netProfit: 55 }, today: { revenue: 175 }, alerts: { lowStock: [] } };
        } else if (pathname === '/api/store/products') {
            payload = { items: [{ ...product }] };
        } else if (pathname === '/api/store/inventory') {
            payload = { items: [{ id: 9101, productName: product.nameAr, variantName: '750 مل', sku: product.sku, quantityOnHand: 12, minimumStock: 3, nearestExpiry: '2027-01-01', lowStock: false }] };
        } else if (pathname === '/api/store/purchases') {
            payload = { items: [] };
        } else if (pathname === '/api/store/sales') {
            payload = { items: [] };
        } else if (pathname === '/api/store/suppliers') {
            payload = [];
        } else if (pathname === '/api/store/expenses') {
            payload = { expenses: [] };
        } else if (pathname === '/api/store/reports') {
            payload = { summary: { revenue: 0, orders: 0, refunds: 0 }, profit: { cogs: 0, netProfit: 0 }, bestSelling: [], byCategory: [], byCustomer: [], paymentMethods: [], dailySales: [], purchases: [], inventory: [], returns: [], expenses: [] };
        }

        await route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(payload) });
    });

    await page.goto(`${BASE_URL}/index.html#store`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.topGymAuth?.isReady?.() === true, null, { timeout: 20_000 });
    await page.waitForFunction(() => window.topGymPermissions?.canAccessTab?.(window.topGymAuth.getUser(), 'store') === true, null, { timeout: 20_000 });
    await page.waitForFunction(() => window.topGymPermissions?.canUseFeature?.('store', window.topGymAuth.getUser()) === true, null, { timeout: 20_000 });
    await page.waitForFunction(() => document.documentElement.dataset.topGymActiveTab === 'store', null, { timeout: 20_000 });
    await expect(page.locator('#storeSection')).toBeVisible();
    await expect(page.locator('#storeSection .store-subnav-button')).toHaveCount(9);
    await page.waitForFunction(() => [...document.styleSheets].some((sheet) => sheet.href && new URL(sheet.href, location.href).pathname === '/css/pages/store.css'));
    await fs.mkdir(SCREENSHOTS, { recursive: true });

    const cases = [];
    const i18nGaps = new Set();
    for (const locale of ['ar', 'en']) {
      await page.evaluate((value) => window.TopGymI18n?.set(value, { persist: false }), locale);
      await page.waitForFunction((value) => document.documentElement.dataset.locale === value, locale);
      const assistantLauncher = page.locator('#smartAssistantLauncher');
      await expect(assistantLauncher.locator('.smart-assistant-launcher-label')).toHaveCount(0);
      await expect(assistantLauncher).toHaveAttribute('title', locale === 'en' ? 'Ask the assistant' : 'اسأل المساعد');
      await expect(assistantLauncher).toHaveAttribute('aria-label', locale === 'en' ? 'Open the smart assistant' : 'فتح المساعد الذكي');
      for (const theme of ['light', 'dark']) {
        for (const width of [320, 375, 390, 768, 1024, 1440, 1920]) {
            await page.setViewportSize({ width, height: width <= 390 ? 844 : 960 });
            await page.evaluate((mode) => {
                document.documentElement.dataset.theme = mode;
                document.body.dataset.theme = mode;
            }, theme);

            const posTab = page.locator('[data-store-view="pos"]');
            await posTab.click();
            const activeShellTab = await page.locator('#pageTabs > .page-tab[data-page-tab="store"]').evaluate((tab) => {
                const probe = document.createElement('span');
                probe.style.backgroundColor = 'var(--nav-active-bg)';
                document.body.append(probe);
                const tokenColor = getComputedStyle(probe).backgroundColor;
                const activeStyle = getComputedStyle(tab);
                const result = { tokenColor, backgroundColor: activeStyle.backgroundColor, backgroundImage: activeStyle.backgroundImage };
                probe.remove();
                return result;
            });
            expect(activeShellTab.backgroundImage).toBe('none');
            expect(activeShellTab.backgroundColor).toBe(activeShellTab.tokenColor);
            if (await page.locator('#storeCartLines .store-cart-line').count()) {
                await page.locator('#storeCartClear').click();
            }
            const productCard = page.locator('#storeProductCatalog .store-product-card').first();
            await expect(productCard).toBeVisible();
            if (locale === 'en') {
                const chromeGaps = await collectEnglishChromeGaps(page, 'pos');
                chromeGaps.forEach((text) => i18nGaps.add(text));
            }
            await productCard.click();
            await expect(page.locator('#storeCartLines .store-cart-line')).toHaveCount(1);
            await expect(page.locator('#storeCompleteSale')).toBeEnabled();
            if (locale === 'en' && width <= 390) {
                const summaryLabels = await page.locator('#storeSection .store-page-heading h3, #storeSection .store-page-heading p, #storeRefreshButton').allTextContents();
                for (const text of summaryLabels) {
                    if (/[\u0600-\u06FF]/.test(text)) i18nGaps.add(text.trim());
                }
            }
            if (width <= 390) {
                const metrics = await page.locator('#storeSection .store-only-summary .dashboard-store-summary-grid strong').evaluateAll((nodes) => nodes.map((node) => ({
                    text: node.textContent.trim(),
                    fits: node.scrollWidth <= node.clientWidth + 1,
                    width: node.clientWidth,
                    contentWidth: node.scrollWidth
                })));
                expect(metrics.length).toBeGreaterThan(0);
                expect(metrics.every((metric) => metric.fits)).toBe(true);
            }
            if (width < 768) {
                const touchTargets = await page.locator('#storeCartLines .store-cart-quantity button, #storeCartLines .store-cart-remove').evaluateAll((buttons) => buttons.map((button) => {
                    const rect = button.getBoundingClientRect();
                    return { width: rect.width, height: rect.height };
                }));
                expect(touchTargets.length).toBeGreaterThan(0);
                expect(touchTargets.every((target) => target.width >= 44 && target.height >= 44)).toBe(true);
            }
            await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
            await page.screenshot({ path: path.join(SCREENSHOTS, `pos-${width}-${theme}-${locale}.png`), fullPage: true });
            cases.push(await measure(page, 'pos', width, theme));

            for (const view of ['products', 'inventory']) {
                await page.locator(`[data-store-view="${view}"]`).click();
                const panel = page.locator(`[data-store-view-panel="${view}"]`);
                const table = panel.locator('.store-table');
                await expect(table).toBeVisible();
                await expect(table.locator('tbody tr')).toHaveCount(1);
                if (locale === 'en') {
                    const chromeGaps = await collectEnglishChromeGaps(page, view);
                    chromeGaps.forEach((text) => i18nGaps.add(text));
                }
                const expectedColumns = view === 'products' ? 6 : 8;
                await expect(table.locator('thead th')).toHaveCount(expectedColumns);

                const mobileLayout = width < 768 ? await table.evaluate((node) => {
                    const identityCell = node.querySelector('tbody td:first-child');
                    const actionCell = node.querySelector('tbody td:last-child');
                    const actions = actionCell.querySelector('.store-row-actions');
                    const actionRect = actions?.getBoundingClientRect();
                    const cellRect = actionCell.getBoundingClientRect();
                    return {
                        cardsEnabled: node.classList.contains('table-card-layout'),
                        labels: [...node.querySelectorAll('tbody td')].map((cell) => cell.dataset.label),
                        valuesWrap: [...node.querySelectorAll('tbody td')].every((cell) => getComputedStyle(cell).whiteSpace === 'normal'),
                        sku: [...node.querySelectorAll('tbody td[dir="ltr"]')].map((cell) => {
                            const range = document.createRange();
                            range.selectNodeContents(cell);
                            return {
                                text: cell.textContent.trim(),
                                direction: getComputedStyle(cell).direction,
                                overflowWrap: getComputedStyle(cell).overflowWrap,
                                wordBreak: getComputedStyle(cell).wordBreak,
                                valueLineCount: range.getClientRects().length,
                                valueWidth: cell.getBoundingClientRect().width
                            };
                        }),
                        identity: [...identityCell.querySelectorAll(':scope > strong, :scope > small')].map((element) => ({
                            column: getComputedStyle(element).gridColumnStart,
                            fits: element.scrollWidth <= element.clientWidth + 1,
                            startsBelowCellTop: element.getBoundingClientRect().top > identityCell.getBoundingClientRect().top
                        })),
                        identityTracks: getComputedStyle(identityCell).gridTemplateColumns.split(' ').length,
                        actionWrap: actions ? getComputedStyle(actions).flexWrap : null,
                        actionMinWidth: actions ? getComputedStyle(actions).minWidth : null,
                        actionWithinCell: !actions || (actionRect.left >= cellRect.left - 1 && actionRect.right <= cellRect.right + 1),
                        actionButtonCount: actions?.querySelectorAll('button').length || 0
                    };
                }) : null;
                if (width < 768) {
                    expect(mobileLayout.cardsEnabled).toBe(true);
                    expect(mobileLayout.labels).toHaveLength(expectedColumns);
                    expect(mobileLayout.valuesWrap).toBe(true);
                    expect(mobileLayout.sku.length).toBeGreaterThan(0);
                    expect(mobileLayout.sku.every((sku) => sku.direction === 'ltr' && sku.overflowWrap === 'normal' && sku.wordBreak === 'normal' && sku.text.length > 0 && sku.valueLineCount <= 2)).toBe(true);
                    if (view === 'products') {
                        expect(mobileLayout.identity).toHaveLength(2);
                        expect(mobileLayout.identityTracks).toBe(1);
                        expect(mobileLayout.identity.every((element) => element.column === '1' && element.fits && element.startsBelowCellTop)).toBe(true);
                        expect(mobileLayout.actionWrap).toBe('wrap');
                        expect(mobileLayout.actionMinWidth).toBe('0px');
                        expect(mobileLayout.actionWithinCell).toBe(true);
                        expect(mobileLayout.actionButtonCount).toBe(2);
                    }
                }

                if (width >= 768 && width <= 1023) {
                    const firstCellText = await table.locator('tbody tr:first-child td:first-child').evaluate((cell) => {
                        const range = document.createRange();
                        range.selectNodeContents(cell);
                        const cellRect = cell.getBoundingClientRect();
                        return [...range.getClientRects()].map((rect) => ({
                            withinCell: rect.left >= cellRect.left - 1 && rect.right <= cellRect.right + 1
                        }));
                    });
                    expect(firstCellText.length).toBeGreaterThan(0);
                    expect(firstCellText.every((rect) => rect.withinCell)).toBe(true);
                }

                await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
                await page.screenshot({ path: path.join(SCREENSHOTS, `${view}-${width}-${theme}-${locale}.png`), fullPage: true });
                cases.push(await measure(page, view, width, theme));
            }

            for (const view of ['bar', 'purchases', 'sales', 'suppliers', 'expenses', 'reports']) {
                await page.locator(`[data-store-view="${view}"]`).click();
                const panel = page.locator(`[data-store-view-panel="${view}"]`);
                await expect(panel).toBeVisible();
                await expect(page.locator('#storeSection [data-store-view-panel]:not([hidden])')).toHaveCount(1);
                if (locale === 'en') {
                    const chromeGaps = await collectEnglishChromeGaps(page, view);
                    chromeGaps.forEach((text) => i18nGaps.add(text));
                }
                await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
                await page.screenshot({ path: path.join(SCREENSHOTS, `${view}-${width}-${theme}-${locale}.png`), fullPage: true });
                cases.push(await measure(page, view, width, theme));
            }
        }
        }
      }

    expect(cases).toHaveLength(252);
    for (const item of cases) {
        expect(item.documentWidth, `${item.view} ${item.width}px ${item.theme}: document horizontal overflow`).toBeLessThanOrEqual(item.viewportWidth);
        expect(item.bodyWidth, `${item.view} ${item.width}px ${item.theme}: body horizontal overflow`).toBeLessThanOrEqual(item.viewportWidth);
        expect(item.direction).toBe(item.locale === 'en' ? 'ltr' : 'rtl');
    }
    expect(requests.filter((request) => request.method !== 'GET')).toEqual([]);
    expect(requests.some((request) => request.pathname === '/api/store/products' && request.method === 'GET')).toBe(true);
    expect(requests.some((request) => request.pathname === '/api/store/inventory' && request.method === 'GET')).toBe(true);
    expect(i18nGaps, 'English UI chrome must not expose untranslated Arabic copy').toEqual(new Set());
    expect(pageErrors, 'Store matrix must not emit uncaught browser errors').toEqual([]);
    await fs.writeFile(path.join(SCREENSHOTS, 'matrix.json'), JSON.stringify({ generatedAt: new Date().toISOString(), cases, requestCount: requests.length, mutations: 0, englishChromeI18nGaps: [...i18nGaps], pageErrors }, null, 2), 'utf8');
});

async function measure(page, view, width, theme) {
    const layout = await page.evaluate(() => ({
        viewportWidth: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        direction: getComputedStyle(document.querySelector('#storeSection')).direction,
        activeView: document.querySelector('[data-store-view][aria-selected="true"]')?.dataset.storeView,
        visiblePanels: [...document.querySelectorAll('#storeSection [data-store-view-panel]:not([hidden])')].map((node) => node.dataset.storeViewPanel),
        locale: document.documentElement.dataset.locale
    }));
    expect(layout.activeView).toBe(view);
    expect(layout.visiblePanels).toEqual([view]);
    return { ...layout, view, width, theme, locale: layout.locale };
}

async function collectEnglishChromeGaps(page, view) {
    return page.evaluate((activeView) => {
        const root = document.querySelector(`#storeSection [data-store-view-panel="${activeView}"]`);
        const selectors = 'h3, h4, h5, p, label, button, th, .empty, .store-tab-label, .store-section-eyebrow, [role="status"], [aria-label], input, textarea, select';
        const candidates = [
            ...document.querySelectorAll('#storeSection .store-page-heading h3, #storeSection .store-page-heading p, #storeRefreshButton, #storeSection .store-subnav'),
            ...(root ? root.querySelectorAll(selectors) : [])
        ];
        const gaps = new Set();
        for (const element of candidates) {
            if (element.closest('tbody td, .store-product-card, .store-cart-line')) continue;
            const style = getComputedStyle(element);
            if (style.display === 'none' || style.visibility === 'hidden' || element.closest('[hidden]')) continue;
            const visibleText = (element.innerText || '').trim();
            if (!element.matches('[aria-label]') && /[\u0600-\u06FF]/.test(visibleText)) gaps.add(visibleText);
            const accessibleName = element.getAttribute('aria-label')?.trim();
            if (accessibleName && /[\u0600-\u06FF]/.test(accessibleName)) gaps.add(`aria-label: ${accessibleName}`);
            if (element.matches('input, textarea, select')) {
                const placeholder = element.getAttribute('placeholder')?.trim();
                if (placeholder && /[\u0600-\u06FF]/.test(placeholder)) gaps.add(`placeholder: ${placeholder}`);
            }
        }
        return [...gaps];
    }, view);
}
