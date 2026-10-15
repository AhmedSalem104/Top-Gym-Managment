'use strict';

const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');

const baseUrl = () => process.env.STORE_QA_BASE_URL || 'http://127.0.0.1:4173';
const product = {
    id: 91,
    nameAr: 'زجاجة ماء للاختبار',
    categoryName: 'المشروبات',
    sku: 'QA-BOTTLE',
    stock: 12,
    active: true,
    variants: [{ id: 9101, variantName: '750 ml', sku: 'QA-BOTTLE-750', sellingPrice: 87.5, purchaseCost: 30, active: true }]
};

test('Store purchase and stock adjustment preserve request contracts and UI state with fixture-only APIs', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'One deterministic Chromium context exercises the Store write flows.');
    test.setTimeout(60_000);

    const origin = new URL(baseUrl()).origin;
    expect(['http://127.0.0.1:4173', 'http://localhost:4173']).toContain(origin);

    const fixtureRequests = [];
    const escapedApiRequests = [];
    const unexpectedApiRequests = [];
    const blockedExternalRequests = [];
    let purchaseCalls = 0;
    let adjustmentCalls = 0;
    let inventoryQuantity = 12;
    let releasePurchase;
    let releaseAdjustment;
    let releaseAdjustmentError;

    // This guard is registered first; the more-specific fixture route below takes precedence.
    await page.context().route('**/*', async (route) => {
        const requestUrl = new URL(route.request().url());
        if (requestUrl.origin !== origin) {
            blockedExternalRequests.push(requestUrl.origin);
            await route.abort('blockedbyclient');
            return;
        }
        if (requestUrl.pathname.startsWith('/api/')) {
            escapedApiRequests.push({ method: route.request().method(), pathname: requestUrl.pathname });
            await route.fulfill({ status: 599, contentType: 'application/json', body: JSON.stringify({ error: 'Unmocked API request blocked by QA guard' }) });
            return;
        }
        await route.continue();
    });

    await page.context().route('**/api/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const method = request.method();
        const pathname = url.pathname;
        if (url.origin !== origin) {
            escapedApiRequests.push({ method, origin: url.origin, pathname });
            await route.abort('blockedbyclient');
            return;
        }
        const body = method === 'POST' ? request.postDataJSON() : undefined;
        fixtureRequests.push({ method, pathname, body });

        if (method === 'POST' && pathname === '/api/store/purchases') {
            purchaseCalls += 1;
            if (purchaseCalls === 1) {
                await new Promise((resolve) => { releasePurchase = resolve; });
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json; charset=utf-8',
                    body: JSON.stringify({ purchase: { id: 7301, invoiceNumber: 'QA-PUR-07301', totalAmount: 90, paidAmount: 30, remainingAmount: 60, status: 'received' } })
                });
                return;
            }
            await route.fulfill({ status: 422, contentType: 'application/json; charset=utf-8', body: JSON.stringify({ error: 'تعذر حفظ فاتورة الشراء للاختبار.', code: 'QA_PURCHASE_REJECTED' }) });
            return;
        }

        if (method === 'POST' && pathname === '/api/store/inventory/adjustments') {
            adjustmentCalls += 1;
            if (adjustmentCalls === 1) {
                await new Promise((resolve) => { releaseAdjustment = resolve; });
                inventoryQuantity = 15;
                await route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify({ movement: { id: 7401 } }) });
                return;
            }
            await new Promise((resolve) => { releaseAdjustmentError = resolve; });
            await route.fulfill({ status: 422, contentType: 'application/json; charset=utf-8', body: JSON.stringify({ error: 'تعذر تسوية المخزون للاختبار.', code: 'QA_ADJUSTMENT_REJECTED' }) });
            return;
        }

        if (pathname === '/api/notifications/stream') {
            await route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache' }, body: '' });
            return;
        }

        let payload;
        if (pathname === '/api/auth/session') {
            payload = { authenticated: true, user: { id: 90091, name: 'QA Store Owner', role: 'Owner', tenantType: 'gym', permissions: [] } };
        } else if (pathname === '/api/branding') {
            payload = { branding: { identity: { brandName: 'نادي الاختبار' }, assets: { primaryLogo: { url: '/assets/logic-fit-logo-horizontal.svg?v=1' } } }, version: 1 };
        } else if (pathname === '/api/saas/entitlements') {
            payload = { tenantStatus: 'active', subscription: { status: 'active', plan: { code: 'business', name: 'Business' } }, entitlements: { tenantType: 'gym', features: { dashboard: true, store: true }, featureCatalog: [{ key: 'dashboard', tenantTypes: ['gym'] }, { key: 'store', tenantTypes: ['gym'] }] } };
        } else if (pathname === '/api/bootstrap') {
            payload = { branches: [], sections: [], defaultBranch: null };
        } else if (pathname === '/api/branches/bootstrap') {
            payload = { branches: [], defaultBranch: null, selectedBranch: null };
        } else if (pathname === '/api/branches') {
            payload = [];
        } else if (pathname === '/api/phone/countries') {
            payload = { countries: [{ country: 'مصر', isoCode: 'EG', dialCode: '+20', exampleNational: '01015819700', exampleInternational: '+201015819700', validLengths: [10], mobileRules: { supported: true, validLengths: [10], nationalPattern: '1[0-25]\\d{8}', localPrefix: '0' } }] };
        } else if (pathname === '/api/notifications') {
            payload = { items: [], unreadCount: 0, hasMore: false };
        } else if (pathname === '/api/notifications/unread-count') {
            payload = { unreadCount: 0, count: 0 };
        } else if (pathname === '/api/store/bootstrap') {
            payload = { categories: [{ id: 3, nameAr: 'المشروبات', active: true }], products: { items: [product] }, suppliers: [{ id: 51, name: 'مورد الاختبار', active: true }] };
        } else if (pathname === '/api/store/dashboard') {
            payload = { summary: { revenue: 0 }, profit: {}, today: {}, alerts: { lowStock: [] } };
        } else if (pathname === '/api/store/purchases') {
            payload = { items: [] };
        } else if (pathname === '/api/store/inventory') {
            payload = { items: [{ id: 9101, productName: product.nameAr, variantName: '750 ml', sku: 'QA-BOTTLE-750', quantityOnHand: inventoryQuantity, minimumStock: 2, nearestExpiry: null, lowStock: false }] };
        } else {
            unexpectedApiRequests.push({ method, pathname });
            await route.fulfill({ status: 599, contentType: 'application/json', body: JSON.stringify({ error: `Unexpected API fixture: ${method} ${pathname}` }) });
            return;
        }
        await route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(payload) });
    });

    await page.goto(`${origin}/#store`, { waitUntil: 'networkidle' });
    await expect(page.locator('#storeSection')).toBeVisible();

    // Purchase success path and the currently implemented pending-submit affordance.
    await page.locator('[data-store-view="purchases"]').click();
    await expect(page.locator('#storeAddPurchase')).toBeVisible();
    await page.locator('#storeAddPurchase').click();
    await expect(page.locator('#storePurchaseFormCard')).toBeVisible();
    await page.locator('#storePurchaseSupplier').selectOption('51');
    await page.locator('#storePurchaseInvoice').fill('QA-INVOICE-1');
    await page.locator('#storePurchaseDate').fill('2026-10-13');
    await page.locator('#storePurchaseVariant').selectOption('9101');
    await page.locator('#storePurchaseQuantity').fill('3');
    await page.locator('#storePurchaseUnitCost').fill('30');
    await page.locator('#storePurchasePaid').fill('30');
    await page.locator('#storePurchasePayment').selectOption('cash');

    await page.locator('#storePurchaseForm').evaluate((form) => form.requestSubmit());
    await expect.poll(() => purchaseCalls).toBe(1);
    const purchaseSubmitWhilePending = await page.locator('#storePurchaseForm button[type="submit"]').isDisabled();
    expect(purchaseSubmitWhilePending).toBe(true);
    const purchasePayload = fixtureRequests.find((entry) => entry.method === 'POST' && entry.pathname === '/api/store/purchases').body;
    expect(purchasePayload).toEqual({
        supplierId: '51',
        invoiceNumber: 'QA-INVOICE-1',
        purchaseDate: '2026-10-13',
        items: [{ variantId: 9101, quantity: 3, unitCost: 30 }],
        paidAmount: 30,
        paymentMethod: 'cash'
    });
    releasePurchase();
    await expect(page.locator('#storePurchaseFormCard')).toBeHidden();
    await expect(page.locator('#toast .toast-item.success')).toContainText('تم استلام فاتورة الشراء');

    // Re-open and force an API failure; the form values must remain editable and unchanged.
    await page.locator('#storeAddPurchase').click();
    await page.locator('#storePurchaseSupplier').selectOption('51');
    await page.locator('#storePurchaseInvoice').fill('QA-INVOICE-ERROR');
    await page.locator('#storePurchaseVariant').selectOption('9101');
    await page.locator('#storePurchaseQuantity').fill('4');
    await page.locator('#storePurchaseUnitCost').fill('32.5');
    await page.locator('#storePurchasePaid').fill('10');
    await page.locator('#storePurchaseForm').evaluate((form) => form.requestSubmit());
    await expect(page.locator('#toast .toast-item.error').filter({ hasText: 'تعذر حفظ فاتورة الشراء للاختبار.' })).toBeVisible();
    await expect(page.locator('#storePurchaseFormCard')).toBeVisible();
    expect(await page.locator('#storePurchaseInvoice').inputValue()).toBe('QA-INVOICE-ERROR');
    expect(await page.locator('#storePurchaseQuantity').inputValue()).toBe('4');
    expect(await page.locator('#storePurchaseUnitCost').inputValue()).toBe('32.5');

    // Inventory adjustment uses a native prompt (not a dialog/form); verify its exact request and outcomes.
    await page.locator('[data-store-view="inventory"]').click();
    await expect(page.locator('#storeInventoryTable tbody tr')).toHaveCount(1);
    await expect(page.locator('#storeInventoryTable tbody tr [data-i18n-value="12"]')).toBeVisible();
    const adjustmentRow = page.locator('[data-store-adjust="9101"]');
    const promptPromise = new Promise((resolve, reject) => page.once('dialog', async (dialog) => {
        try {
            expect(dialog.type()).toBe('prompt');
            await dialog.accept('3');
            resolve();
        } catch (error) { reject(error); }
    }));
    await adjustmentRow.click();
    await promptPromise;
    await expect.poll(() => adjustmentCalls).toBe(1);
    const adjustmentPayload = fixtureRequests.find((entry) => entry.method === 'POST' && entry.pathname === '/api/store/inventory/adjustments').body;
    expect(adjustmentPayload).toEqual({ variantId: 9101, quantity: 3, direction: 'in', movementType: 'adjustment', notes: 'تسوية من شاشة المتجر' });
    await expect(page.locator('#storeInventoryTable tbody tr [data-i18n-value="12"]')).toBeVisible();
    releaseAdjustment();
    await expect(page.locator('#storeInventoryTable tbody tr [data-i18n-value="15"]')).toBeVisible();
    await expect(page.locator('#toast .toast-item.success').filter({ hasText: 'تمت تسوية المخزون.' })).toBeVisible();

    // Hold a failing adjustment request to observe the inventory while pending, then prove the error leaves it intact.
    const errorPromptPromise = new Promise((resolve, reject) => page.once('dialog', async (dialog) => {
        try {
            expect(dialog.type()).toBe('prompt');
            await dialog.accept('2');
            resolve();
        } catch (error) { reject(error); }
    }));
    await page.locator('[data-store-adjust="9101"]').click();
    await errorPromptPromise;
    await expect.poll(() => adjustmentCalls).toBe(2);
    await expect(page.locator('#storeInventoryTable tbody tr [data-i18n-value="15"]')).toBeVisible();
    releaseAdjustmentError();
    await expect(page.locator('#toast .toast-item.error').filter({ hasText: 'تعذر تسوية المخزون للاختبار.' })).toBeVisible();
    await expect(page.locator('#storeInventoryTable tbody tr [data-i18n-value="15"]')).toBeVisible();

    const writes = fixtureRequests.filter((entry) => entry.method !== 'GET');
    expect(writes.map(({ method, pathname }) => `${method} ${pathname}`).sort()).toEqual([
        'POST /api/store/inventory/adjustments',
        'POST /api/store/inventory/adjustments',
        'POST /api/store/purchases',
        'POST /api/store/purchases'
    ]);
    expect(escapedApiRequests).toEqual([]);
    expect(unexpectedApiRequests).toEqual([]);
    expect(blockedExternalRequests.every((requestOrigin) => requestOrigin !== origin)).toBe(true);

    const evidenceDir = path.resolve(process.cwd(), 'qa/artifacts/store-purchase-inventory-outcomes-v2');
    await fs.mkdir(evidenceDir, { recursive: true });
    const screenshot = path.join(evidenceDir, 'inventory-adjustment-error-state.png');
    await page.locator('#storeSection').screenshot({ path: screenshot });
    await fs.writeFile(path.join(evidenceDir, 'purchase-inventory-outcomes.json'), JSON.stringify({
        source: 'Store UI; every API request handled by Playwright fixtures; only local QA server used for static application assets',
        node: process.version,
        project: testInfo.project.name,
        purchasePayload,
        adjustmentPayload,
        outcomes: {
            purchaseSuccess: 'form closed and success toast rendered',
            purchaseError: 'form remains open and draft values preserved',
            purchasePendingDuplicateSubmitBlocked: purchaseSubmitWhilePending,
            inventoryAdjustmentSuccess: 'quantity refreshed from fixture 12 to 15',
            inventoryAdjustmentError: 'fixture inventory display remains at 15',
            inventoryPendingDuplicateSubmit: 'not applicable: action is a native prompt, no submit button/disabled state exists'
        },
        fixtureApiRequests: fixtureRequests.length,
        interceptedWrites: writes.length,
        escapedApiRequests: escapedApiRequests.length,
        unexpectedApiRequests: unexpectedApiRequests.length,
        blockedExternalRequests: blockedExternalRequests.length,
        blockedExternalOrigins: [...new Set(blockedExternalRequests)],
        externalRequestsEscaped: 0,
        screenshot
    }, null, 2), 'utf8');

    expect(testInfo.project.name).toBe('desktop');
});
