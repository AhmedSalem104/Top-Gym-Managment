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
    variants: [{ id: 9101, variantName: '750 ml', sku: 'QA-BOTTLE-750', sellingPrice: 87.5, active: true }]
};

test('Store checkout preserves its request contract and renders validation, loading, success/receipt, and error outcomes with intercepted APIs only', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'One deterministic Chromium context exercises the checkout lifecycle.');
    test.setTimeout(60_000);

    const requests = [];
    const checkoutStarted = [];
    let releaseSuccessfulCheckout;
    let postCount = 0;

    await page.context().addInitScript(() => { window.print = () => {}; });
    await page.context().route('**/api/**', async (route) => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;
        const method = request.method();
        let payload = {};

        if (method === 'POST' && pathname === '/api/store/sales') {
            postCount += 1;
            const body = request.postDataJSON();
            requests.push({ method, pathname, body });
            if (postCount === 1) {
                checkoutStarted.push(body);
                await new Promise((resolve) => { releaseSuccessfulCheckout = resolve; });
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json; charset=utf-8',
                    body: JSON.stringify({
                        sale: {
                            id: 7201,
                            saleNumber: 'QA-SALE-07201',
                            totalAmount: 180,
                            items: [{ productName: product.nameAr, variantName: '750 ml', quantity: 2, lineTotal: 175 }]
                        }
                    })
                });
                return;
            }
            await route.fulfill({
                status: 422,
                contentType: 'application/json; charset=utf-8',
                body: JSON.stringify({ error: 'تعذر إتمام البيع للاختبار.', code: 'QA_CHECKOUT_REJECTED' })
            });
            return;
        }

        requests.push({ method, pathname });
        if (pathname === '/api/auth/session') {
            payload = { authenticated: true, user: { id: 90091, name: 'QA Store Owner', role: 'Owner', tenantType: 'gym', permissions: [] } };
        } else if (pathname === '/api/branding') {
            payload = { branding: { identity: { brandName: 'نادي الاختبار' }, assets: { primaryLogo: { url: '/assets/logic-fit-logo-horizontal.svg?v=1' } } }, version: 1 };
        } else if (pathname === '/api/saas/entitlements') {
            payload = { tenantStatus: 'active', subscription: { status: 'active', plan: { code: 'business', name: 'Business' } }, entitlements: { tenantType: 'gym', features: { dashboard: true, store: true }, featureCatalog: [{ key: 'dashboard', tenantTypes: ['gym'] }, { key: 'store', tenantTypes: ['gym'] }] } };
        } else if (pathname === '/api/bootstrap') {
            payload = { branches: [], sections: [], defaultBranch: null };
        } else if (pathname === '/api/store/bootstrap') {
            payload = { categories: [{ id: 3, nameAr: 'المشروبات', active: true }], products: { items: [product] }, suppliers: [] };
        } else if (pathname === '/api/store/dashboard') {
            payload = { summary: { revenue: 0 }, profit: {}, today: {}, alerts: { lowStock: [] } };
        }

        await route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(payload) });
    });

    await page.goto(`${baseUrl()}/#store`, { waitUntil: 'networkidle' });
    await expect(page.locator('#storeSection')).toBeVisible();
    await expect(page.locator('#storeCartTotal')).toHaveAttribute('data-i18n-value', '0');
    await expect(page.locator('#storeCompleteSale')).toBeDisabled();

    await page.locator('[data-store-add-variant="9101"]').click();
    await page.locator('[data-store-cart-plus="9101"]').click();
    await page.locator('#storeSaleDiscount').fill('-1');
    const nativeValidation = await page.locator('#storeSaleDiscount').evaluate((input) => ({
        valid: input.checkValidity(),
        rangeUnderflow: input.validity.rangeUnderflow,
        minimum: input.min
    }));
    expect(nativeValidation).toEqual({ valid: false, rangeUnderflow: true, minimum: '0' });
    await page.locator('#storeCheckoutForm').evaluate((form) => form.requestSubmit());
    expect(requests.filter((entry) => entry.method === 'POST' && entry.pathname === '/api/store/sales')).toHaveLength(0);

    await page.locator('#storeSaleDiscount').fill('5');
    await page.locator('#storeSaleTax').fill('10');
    await page.locator('#storeSalePaid').fill('100');
    await page.locator('#storeSalePaymentMethod').selectOption('cash');
    await page.locator('#storeSaleNotes').fill('fixture checkout');
    await expect(page.locator('#storeCartTotal')).toHaveAttribute('data-i18n-value', '180');

    const popupPromise = page.waitForEvent('popup');
    await page.locator('#storeCheckoutForm').evaluate((form) => form.requestSubmit());
    await expect.poll(() => checkoutStarted.length).toBe(1);
    await expect(page.locator('#storeCompleteSale')).toBeDisabled();
    expect(requests.filter((entry) => entry.method === 'POST' && entry.pathname === '/api/store/sales')).toHaveLength(1);

    const expectedPayload = {
        items: [{ variantId: 9101, quantity: 2 }],
        discountAmount: 5,
        taxAmount: 10,
        paidAmount: 100,
        paymentMethod: 'cash',
        notes: 'fixture checkout'
    };
    expect(checkoutStarted[0]).toEqual(expectedPayload);

    releaseSuccessfulCheckout();
    const receipt = await popupPromise;
    await expect(receipt.locator('.receipt-brand p')).toContainText('QA-SALE-07201');
    await expect(receipt.locator('tbody tr')).toHaveCount(1);
    await expect(receipt.locator('tbody')).toContainText(product.nameAr);
    await expect(receipt.locator('tbody')).toContainText('750 ml');
    await expect(receipt.locator('tbody')).toContainText('2');
    await expect(receipt.locator('.total')).toContainText((180).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    await expect(page.locator('#toast .toast-item.success')).toContainText('تم تسجيل البيع بنجاح.');
    await expect(page.locator('#storeCartLines')).toContainText('أضف منتجًا إلى السلة للبدء.');
    await expect(page.locator('#storeCartTotal')).toHaveAttribute('data-i18n-value', '0');
    await receipt.close();

    await page.locator('[data-store-add-variant="9101"]').click();
    await page.locator('#storeCheckoutForm').evaluate((form) => form.requestSubmit());
    await expect(page.locator('#toast .toast-item.error')).toContainText('تعذر إتمام البيع للاختبار.');
    await expect(page.locator('#storeCartLines')).toContainText(product.nameAr);
    await expect(page.locator('#storeCartTotal')).toHaveAttribute('data-i18n-value', '87.5');
    await expect(page.locator('#storeCompleteSale')).toBeEnabled();

    const evidenceDir = path.resolve(process.cwd(), 'qa/artifacts/store-sale-outcome-v2');
    await fs.mkdir(evidenceDir, { recursive: true });
    const errorScreenshot = path.join(evidenceDir, 'checkout-error-state.png');
    await page.locator('#storeSection').screenshot({ path: errorScreenshot });
    await fs.writeFile(path.join(evidenceDir, 'checkout-outcomes.json'), JSON.stringify({
        source: 'Store checkout UI with all /api/** responses intercepted by this Playwright test',
        node: process.version,
        project: testInfo.project.name,
        validation: nativeValidation,
        payload: checkoutStarted[0],
        outcomes: ['empty-cart button disabled', 'native min validation blocks invalid submit', 'submit button disabled while request is pending', 'success toast and receipt rendered', 'error toast leaves cart and total intact'],
        postCount: requests.filter((entry) => entry.method === 'POST' && entry.pathname === '/api/store/sales').length,
        writesOutsideFixture: 0,
        errorScreenshot
    }, null, 2), 'utf8');

    expect(requests.filter((entry) => entry.method === 'POST' && entry.pathname === '/api/store/sales')).toHaveLength(2);
    expect(requests.filter((entry) => entry.method !== 'GET').every((entry) => entry.pathname === '/api/store/sales')).toBe(true);
    expect(testInfo.project.name).toBe('desktop');
});
