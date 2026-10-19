'use strict';

const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const storeQaBaseUrl = () => process.env.STORE_QA_BASE_URL || 'http://127.0.0.1:4173';

const product = {
    id: 91,
    nameAr: 'زجاجة ماء طويلة الاسم لاختبار التفاف النص',
    categoryName: 'المشروبات',
    sku: 'QA-BOTTLE',
    stock: 12,
    active: true,
    variants: [{ id: 9101, variantName: '750 ml', sku: 'QA-BOTTLE-750', sellingPrice: 87.5, active: true }]
};

test('Store subviews render without page overflow at desktop/mobile sizes in both themes', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'One deterministic project captures the full Store viewport/theme matrix.');
    test.setTimeout(120_000);

    const requests = [];
    const fixtureSupplier = { id: 31, name: 'مورد أدوات التدريب', phone: '+201001234567', phoneCountry: 'EG', email: 'store@example.test', active: true };
    const fixtureSale = { id: 61, saleNumber: 'SALE-QA-0061', customerName: 'عضو تجريبي', customerPhone: '+201001234567', saleDate: '2026-10-12T10:00:00.000Z', totalAmount: 175, paidAmount: 175, remainingAmount: 0, status: 'paid' };
    await page.context().route('**/api/**', async (route) => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;
        requests.push({ method: request.method(), pathname });
        let payload = {};

        if (pathname === '/api/auth/session') {
            payload = { authenticated: true, user: { id: 90091, name: 'QA Store Owner', role: 'Owner', tenantType: 'gym', permissions: [] } };
        } else if (pathname === '/api/branding') {
            payload = { branding: { identity: { brandName: 'نادي الاختبار' }, assets: { primaryLogo: { url: '/assets/logic-fit-logo-horizontal.svg?v=1' } } }, version: 1 };
        } else if (pathname === '/api/saas/entitlements') {
            payload = { tenantStatus: 'active', subscription: { status: 'active', plan: { code: 'business', name: 'Business' } }, entitlements: { tenantType: 'gym', features: { dashboard: true, store: true }, featureCatalog: [{ key: 'dashboard', tenantTypes: ['gym'] }, { key: 'store', tenantTypes: ['gym'] }] } };
        } else if (pathname === '/api/bootstrap') {
            payload = { branches: [{ id: 1, name: 'الفرع الرئيسي', status: 'active', isMain: true }], sections: [], defaultBranch: { id: 1 } };
        } else if (pathname === '/api/branches') {
            payload = { branches: [{ id: 1, name: 'الفرع الرئيسي', status: 'active', isMain: true }] };
        } else if (pathname === '/api/commerce/stock-locations') {
            payload = { locations: [{ id: 41, name: 'بار الفرع الرئيسي', type: 'bar', status: 'active' }] };
        } else if (pathname === '/api/bar/menu') {
            payload = { items: [{ variantId: 9101, recipeId: null, name: 'ماء', variantName: 'زجاجة 750 مل', sku: 'QA-WATER', price: 20, available: true }] };
        } else if (/^\/api\/bar\/shifts\/branch\/\d+\/open$/.test(pathname)) {
            payload = { shift: null };
        } else if (pathname === '/api/store/bootstrap') {
            payload = { categories: [{ id: 3, nameAr: 'المشروبات', active: true }], products: { items: [product] }, suppliers: [fixtureSupplier] };
        } else if (pathname === '/api/store/dashboard') {
            payload = { summary: { revenue: 175 }, profit: { expenses: 12, netProfit: 55 }, today: { revenue: 175 }, alerts: { lowStock: [{ id: 91 }] } };
        } else if (pathname === '/api/store/products') {
            payload = { items: [{ id: 91, nameAr: product.nameAr, sku: product.sku, categoryName: product.categoryName, stock: 12, active: true, variants: product.variants }] };
        } else if (pathname === '/api/store/inventory') {
            payload = { items: [{ id: 9101, productName: product.nameAr, variantName: '750 ml', sku: 'QA-BOTTLE-750', quantityOnHand: 12, minimumStock: 3, nearestExpiry: '2027-01-01', lowStock: false }] };
        } else if (pathname === '/api/store/purchases') {
            payload = { items: [{ id: 51, invoiceNumber: 'PUR-QA-0051', supplierName: fixtureSupplier.name, purchaseDate: '2026-10-11', totalAmount: 350, paidAmount: 250, remainingAmount: 100, status: 'partial' }] };
        } else if (pathname === '/api/store/sales') {
            payload = { items: [fixtureSale] };
        } else if (pathname === '/api/store/suppliers') {
            payload = [fixtureSupplier];
        } else if (pathname === '/api/store/expenses') {
            payload = { expenses: [{ id: 71, name: 'شحن مخزون', category: 'شحن', expenseDate: '2026-10-10', amount: 35, paymentMethod: 'cash' }] };
        } else if (pathname === '/api/store/reports') {
            payload = { summary: { revenue: 175, orders: 1, refunds: 0 }, profit: { cogs: 80, netProfit: 95 }, bestSelling: [{ productName: product.nameAr, variantName: '750 ml', sku: 'QA-BOTTLE-750', quantity: 2, revenue: 175, cogs: 80 }], byCategory: [], byCustomer: [], paymentMethods: [], dailySales: [], purchases: [], inventory: [], returns: [], expenses: [] };
        }

        await route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(payload) });
    });

    await page.goto(`${storeQaBaseUrl()}/#store`, { waitUntil: 'networkidle' });
    await expect(page.locator('#storeSection')).toBeVisible();
    const subnav = page.locator('#storeSection .store-subnav');
    await expect(subnav.locator('[data-store-view]')).toHaveCount(9);
    const storeStyles = await fs.readFile(path.resolve(process.cwd(), 'public/css/pages/store.css'), 'utf8');
    const desktopRuleStart = storeStyles.lastIndexOf('@media (min-width: 1200px)');
    const desktopBarGridRule = desktopRuleStart >= 0 ? storeStyles.slice(desktopRuleStart) : '';
    expect(desktopBarGridRule, 'The canonical Store source must include the responsive nine-tab desktop layout.').toContain('grid-template-columns: repeat(9, minmax(0, 1fr))');
    // Keep generated bundles untouched; apply the exact canonical source rule in-memory for this visual QA run.
    await page.addStyleTag({ content: desktopBarGridRule });
    const screenshotDir = path.resolve(process.cwd(), 'qa/reports/logicfit-v2-store');
    await fs.mkdir(screenshotDir, { recursive: true });
    const matrix = [];

    for (const theme of ['light', 'dark']) {
        for (const width of [1440, 390]) {
            await page.setViewportSize({ width, height: width < 600 ? 844 : 960 });
            await page.evaluate((mode) => {
                document.documentElement.dataset.theme = mode;
                document.body.dataset.theme = mode;
            }, theme);
            for (const view of ['pos', 'bar', 'products', 'inventory', 'purchases', 'sales', 'suppliers', 'expenses', 'reports']) {
                const tab = page.locator(`[data-store-view="${view}"]`);
                await expect(tab, `${view} tab should be visible`).toBeVisible();
                await tab.click();
                const panel = page.locator(`[data-store-view-panel="${view}"]`);
                await expect(panel).toBeVisible();
                if (view === 'pos') await expect(panel.locator('.store-product-card')).toHaveCount(1);
                else if (view === 'bar') await expect(panel.locator('#barPosMenu .bar-pos-item')).toHaveCount(1);
                else if (view === 'reports') await expect(panel.locator('#storeReportSummary article')).toHaveCount(5);
                else await expect(panel.locator('.store-table')).toBeVisible();

                const layout = await page.evaluate(() => ({
                    viewport: innerWidth,
                    document: document.documentElement.scrollWidth,
                    body: document.body.scrollWidth,
                    direction: getComputedStyle(document.querySelector('#storeSection')).direction,
                    activeView: document.querySelector('[data-store-view][aria-selected="true"]')?.dataset.storeView,
                    visiblePanels: [...document.querySelectorAll('#storeSection [data-store-view-panel]:not([hidden])')].map((node) => node.dataset.storeViewPanel),
                    tabCount: [...document.querySelectorAll('#storeSection [data-store-view]:not([hidden])')].length,
                    gridColumns: getComputedStyle(document.querySelector('.store-subnav')).gridTemplateColumns.split(' ').length,
                    clippedTabLabels: [...document.querySelectorAll('#storeSection .store-tab-label')].filter((node) => node.scrollWidth > node.clientWidth + 1).map((node) => node.textContent.trim())
                }));
                expect(layout.document, `${view} ${width}px ${theme}: document overflow`).toBeLessThanOrEqual(width);
                expect(layout.body, `${view} ${width}px ${theme}: body overflow`).toBeLessThanOrEqual(width);
                expect(layout.direction).toBe('rtl');
                expect(layout.activeView).toBe(view);
                expect(layout.visiblePanels).toEqual([view]);
                expect(layout.tabCount).toBe(9);
                const expectedNavigationColumns = width >= 1200 ? 9 : width >= 768 ? 4 : 3;
                expect(layout.gridColumns, `${view} ${width}px ${theme}: Store navigation columns`).toBe(expectedNavigationColumns);
                expect(layout.clippedTabLabels, `${view} ${width}px ${theme}: Store tab label clipping`).toEqual([]);
                matrix.push({ ...layout, view, width, theme });
                await page.evaluate(() => document.fonts.ready);
                await page.screenshot({ path: path.join(screenshotDir, `store-${view}-${width}-${theme}.png`), fullPage: false });
            }
        }
    }

    expect(requests.some((entry) => entry.pathname === '/api/store/products' && entry.method === 'GET')).toBe(true);
    expect(requests.some((entry) => entry.pathname === '/api/store/reports' && entry.method === 'GET')).toBe(true);
    expect(requests.some((entry) => entry.pathname === '/api/bar/menu' && entry.method === 'GET')).toBe(true);
    expect(requests.filter((entry) => entry.method !== 'GET')).toEqual([]);
    await fs.writeFile(path.join(screenshotDir, 'store-view-matrix.json'), JSON.stringify({ generatedAt: new Date().toISOString(), subviews: matrix }, null, 2), 'utf8');
});

test('Store checkout prints the returned sale as a tenant-branded RTL receipt without touching a backend', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The real Store receipt popup and its generated PDF are captured once in a deterministic Chromium project.');
    test.setTimeout(120_000);
    const requests = [];
    const popupResourceEvents = [];
    page.context().on('page', (popupPage) => {
        popupPage.on('request', (request) => { if (/\/(?:main|print)\.css/.test(request.url())) popupResourceEvents.push({ type: 'request', url: request.url() }); });
        popupPage.on('requestfailed', (request) => { if (/\/(?:main|print)\.css/.test(request.url())) popupResourceEvents.push({ type: 'failed', url: request.url(), error: request.failure()?.errorText }); });
        popupPage.on('response', (response) => { if (/\/(?:main|print)\.css/.test(response.url())) popupResourceEvents.push({ type: 'response', url: response.url(), status: response.status() }); });
    });
    await page.context().addInitScript(() => { window.print = () => {}; });
    await page.context().route('**/api/**', async (route) => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;
        requests.push({ method: request.method(), pathname });
        let payload = {};

        if (pathname === '/api/auth/session') {
            payload = { authenticated: true, user: { id: 90091, name: 'QA Store Owner', role: 'Owner', tenantType: 'gym', permissions: [] } };
        } else if (pathname === '/api/branding') {
            payload = {
                branding: {
                    identity: { brandName: 'النادي الاختباري' },
                    assets: { primaryLogo: { url: '/assets/logic-fit-logo-horizontal.svg?v=1' } }
                },
                version: 1
            };
        } else if (pathname === '/api/saas/entitlements') {
            payload = {
                tenantStatus: 'active',
                subscription: { status: 'active', plan: { code: 'business', name: 'Business' } },
                entitlements: {
                    tenantType: 'gym',
                    features: { dashboard: true, store: true },
                    featureCatalog: [{ key: 'dashboard', tenantTypes: ['gym'] }, { key: 'store', tenantTypes: ['gym'] }]
                }
            };
        } else if (pathname === '/api/bootstrap') {
            payload = { branches: [], sections: [], defaultBranch: null };
        } else if (pathname === '/api/store/bootstrap') {
            payload = { categories: [{ id: 3, nameAr: 'المشروبات', active: true }], products: { items: [product] }, suppliers: [] };
        } else if (pathname === '/api/store/dashboard') {
            payload = { summary: {}, profit: {}, today: {}, alerts: { lowStock: [] } };
        } else if (pathname === '/api/store/sales' && request.method() === 'POST') {
            payload = {
                sale: {
                    saleNumber: 'QA-2026-0091',
                    totalAmount: 175,
                    items: [{ productName: product.nameAr, variantName: '750 ml', quantity: 2, lineTotal: 175 }]
                }
            };
        }

        await route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(payload) });
    });

    await page.goto(`${storeQaBaseUrl()}/#store`, { waitUntil: 'networkidle' });
    await expect(page.locator('#storeSection')).toBeVisible();
    await page.evaluate(() => {
        const logo = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="10" fill="#0070f3"/><path d="M13 24h22M24 13v22" stroke="white" stroke-width="4"/></svg>')}`;
        window.topGymBranding.apply({ identity: { brandName: 'النادي الاختباري' }, assets: { primaryLogo: { url: logo } } }, 1);
    });
    await expect(page.locator('[data-store-add-variant="9101"]')).toBeVisible();
    await page.locator('[data-store-add-variant="9101"]').click();
    await expect(page.locator('#storeCompleteSale')).toBeEnabled();

    const popupPromise = page.waitForEvent('popup');
    await page.locator('#storeCheckoutForm').evaluate((form) => form.requestSubmit());
    const receipt = await popupPromise;
    await expect(receipt.locator('.print-store-receipt-brand h1')).toHaveText('النادي الاختباري');
    await expect(receipt.locator('.print-store-receipt-brand p')).toContainText('QA-2026-0091');
    await expect(receipt.locator('tbody tr')).toHaveCount(1);
    await expect(receipt.locator('tbody')).toContainText(product.nameAr);
    await expect(receipt.locator('tbody')).toContainText('750 ml');
    await expect(receipt.locator('.print-store-receipt-total')).toContainText((175).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    await expect(receipt.locator('html')).toHaveAttribute('dir', 'rtl');
    await receipt.evaluate(() => document.fonts?.ready);
    await receipt.locator('.print-store-receipt-brand img').evaluate((image) => image.decode());

    const receiptLayout = await receipt.evaluate(() => {
        const body = document.body.getBoundingClientRect();
        const nodes = [...document.querySelectorAll('.print-store-receipt-brand, table, .print-store-receipt-total, .print-store-receipt-thanks')];
        const outside = nodes.filter((node) => {
            const rect = node.getBoundingClientRect();
            return rect.width > 0 && (rect.left < body.left - 1 || rect.right > body.right + 1 || rect.top < body.top - 1 || rect.bottom > body.bottom + 1);
        }).map((node) => node.className || node.tagName.toLowerCase());
        return {
            direction: document.documentElement.dir,
            title: document.title,
            width: Math.round(body.width),
            height: Math.round(body.height),
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
            outside,
            logoLoaded: document.querySelector('.print-store-receipt-brand img')?.naturalWidth > 0,
            printStylesheetLinked: Boolean(document.querySelector('link[href*="print.css"]'))
        };
    });
    const printStylesheet = await page.request.get(new URL('/css/print.css', storeQaBaseUrl()).toString());
    const printStylesheetText = await printStylesheet.text();
    expect(receiptLayout.direction).toBe('rtl');
    expect(receiptLayout.scrollWidth).toBeLessThanOrEqual(receiptLayout.clientWidth);
    expect(receiptLayout.outside).toEqual([]);
    expect(receiptLayout.logoLoaded).toBe(true);
    expect(receiptLayout.printStylesheetLinked).toBe(true);
    expect(printStylesheet.ok()).toBe(true);
    expect(printStylesheetText).toMatch(/@page\s*\{[^}]*size:\s*A4/s);
    expect(printStylesheetText).toMatch(/@page\s*\{[^}]*margin:\s*12mm/s);
    expect(requests.filter((entry) => entry.pathname === '/api/store/sales' && entry.method === 'POST')).toHaveLength(1);
    const printEvidenceDir = path.resolve(process.cwd(), 'qa/artifacts/store-sale-receipt-print-v2');
    await fs.mkdir(printEvidenceDir, { recursive: true });
    await receipt.emulateMedia({ media: 'print' });
    await receipt.setViewportSize({ width: 794, height: 1123 });
    const previewPath = path.join(printEvidenceDir, 'store-sale-receipt-a4-print-preview.png');
    const pdfPath = path.join(printEvidenceDir, 'store-sale-receipt-a4.pdf');
    const printGeometry = await receipt.evaluate(() => ({
        width: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
        receiptVisible: Boolean(document.querySelector('.print-store-receipt-brand h1')?.getClientRects().length)
    }));
    expect(printGeometry.receiptVisible).toBe(true);
    expect(printGeometry.scrollWidth).toBeLessThanOrEqual(printGeometry.width);
    expect(printGeometry.bodyScrollWidth).toBeLessThanOrEqual(printGeometry.width);

    const receiptAudit = await receipt.evaluate(() => {
        const rows = [...document.querySelectorAll('tbody tr')].map((row) => {
            const cells = [...row.cells].map((cell) => cell.innerText.trim());
            const amountText = cells[2] || '';
            const amountToken = amountText.match(/[\d٠-٩۰-۹]+(?:[\d٠-٩۰-۹٬,٫.]*[\d٠-٩۰-۹])?/u)?.[0] || '';
            const amount = Number(amountToken.replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit))).replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))).replace(/[٬,]/g, '').replace(/٫/g, '.'));
            return { cells, amount };
        });
        const totalText = document.querySelector('.print-store-receipt-total')?.innerText || '';
        const totalValue = totalText.match(/[٠-٩۰-۹\d][٠-٩۰-۹\d,٬]*(?:[.,٫][٠-٩۰-۹\d]{1,2})?/g)?.at(-1) || '';
        const normalizeDigits = (value) => value.replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit))).replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));
        const total = Number(normalizeDigits(totalValue).replace(/[٬,]/g, '').replace(/٫/g, '.'));
        const bodyStyle = getComputedStyle(document.body);
        const printCss = document.querySelector('link[href*="print.css"]');
        return {
            title: document.title,
            brand: document.querySelector('.print-store-receipt-brand h1')?.innerText.trim(),
            saleNumber: document.querySelector('.print-store-receipt-brand p')?.innerText.trim(),
            headers: [...document.querySelectorAll('thead th')].map((cell) => cell.innerText.trim()),
            rows,
            totalText: totalText.trim(),
            total,
            direction: document.documentElement.dir,
            language: document.documentElement.lang,
            pageSize: getComputedStyle(document.documentElement).getPropertyValue('size'),
            bodyPadding: bodyStyle.padding,
            printStylesheetLoaded: Boolean(printCss?.sheet),
            printStylesheetHref: printCss?.href || null,
            loadedStylesheets: [...document.styleSheets].map((sheet) => sheet.href || 'inline'),
            contentBounds: [...document.querySelectorAll('.print-store-receipt-brand, table, .print-store-receipt-total, .print-store-receipt-thanks')].map((node) => {
                const rect = node.getBoundingClientRect();
                return { name: node.className || node.tagName.toLowerCase(), left: Math.round(rect.left), right: Math.round(rect.right), top: Math.round(rect.top), bottom: Math.round(rect.bottom) };
            })
        };
    });
    expect(receiptAudit.brand).toBe('النادي الاختباري');
    expect(receiptAudit.saleNumber).toContain('QA-2026-0091');
    expect(receiptAudit.headers).toEqual(['المنتج', 'الكمية', 'الإجمالي']);
    expect(receiptAudit.rows).toHaveLength(1);
    expect(receiptAudit.rows[0].cells.join(' ')).toContain(product.nameAr);
    expect(receiptAudit.rows[0].cells.join(' ')).toContain('750 ml');
    expect(receiptAudit.rows[0].cells.join(' ')).toContain('2');
    expect(receiptAudit.rows[0].amount).toBe(175);
    expect(receiptAudit.total).toBe(175);
    expect(receiptAudit.rows.reduce((sum, row) => sum + row.amount, 0)).toBe(receiptAudit.total);
    expect(receiptAudit.direction).toBe('rtl');
    expect(receiptAudit.language).toBe('ar');
    expect(receiptAudit.printStylesheetHref).toContain('/css/print.css');
    expect(receiptAudit.printStylesheetHref).toMatch(/\/css\/print\.css\?v=[a-f0-9]{16}$/);
    expect(popupResourceEvents.filter((entry) => entry.type === 'failed')).toEqual([]);
    expect(popupResourceEvents.find((entry) => entry.type === 'response' && entry.url.includes('/css/print.css'))?.status).toBe(200);
    expect(receiptAudit.contentBounds.every((item) => item.left >= 0 && item.right <= 794 && item.top >= 0 && item.bottom <= 1123)).toBe(true);

    const html = await receipt.content();
    await receipt.close();
    const preview = await page.context().newPage();
    await preview.setViewportSize({ width: 794, height: 1123 });
    await preview.goto(storeQaBaseUrl(), { waitUntil: 'domcontentloaded' });
    await preview.setContent(html, { waitUntil: 'load' });
    await expect.poll(() => preview.locator('link[href*="print.css"]').evaluate((link) => Boolean(link.sheet))).toBe(true);
    await preview.evaluate(() => document.fonts?.ready);
    await preview.emulateMedia({ media: 'print' });
    await preview.screenshot({ path: previewPath, fullPage: true });
    const pdf = await preview.pdf({ path: pdfPath, printBackground: true, preferCSSPageSize: true });
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.byteLength).toBeGreaterThan(1500);
    const mediaBox = pdf.toString('latin1').match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/);
    expect(mediaBox, 'The exported PDF must carry a readable page MediaBox.').not.toBeNull();
    const pdfPageSizePt = { width: Number(mediaBox[1]), height: Number(mediaBox[2]) };
    expect(pdfPageSizePt.width).toBeGreaterThan(590);
    expect(pdfPageSizePt.width).toBeLessThan(600);
    expect(pdfPageSizePt.height).toBeGreaterThan(835);
    expect(pdfPageSizePt.height).toBeLessThan(850);
    const pdfPageCount = (pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length;
    expect(pdfPageCount).toBe(1);

    await fs.writeFile(path.join(printEvidenceDir, 'store-sale-receipt-audit.json'), JSON.stringify({
        source: 'Visible Store product -> checkout form -> intercepted POST /api/store/sales -> actual printReceipt popup document',
        data: 'Synthetic browser fixture; every API request was intercepted; no database or Production access',
        pdfBytes: pdf.byteLength,
        pdfPageCount,
        pdfPageSizePt,
        previewPath,
        pdfPath,
        receiptLayout,
        receiptAudit,
        previewStylesheetLoaded: await preview.locator('link[href*="print.css"]').evaluate((link) => Boolean(link.sheet)),
        printStylesheetStatus: printStylesheet.status(),
        requestedPaper: 'A4 portrait via existing @page size A4; no thermal-roll dimensions are declared by the current receipt template.',
        margins: 'Canonical global @page margin is 12mm; receipt uses 16px padding from the canonical print stylesheet.',
        writes: requests.filter((entry) => entry.method !== 'GET')
    }, null, 2), 'utf8');
    await preview.close();
});
