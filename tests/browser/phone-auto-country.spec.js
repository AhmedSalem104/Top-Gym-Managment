const { test, expect } = require('@playwright/test');

const catalog = {
    countries: [
        { country: 'مصر', isoCode: 'EG', dialCode: '+20', exampleNational: '01015819700', exampleInternational: '+201015819700', validLengths: [8, 9, 10], mobileRules: { supported: true, validLengths: [10], nationalPattern: '1[0-25]\\d{8}', localPrefix: '0' } },
        { country: 'السعودية', isoCode: 'SA', dialCode: '+966', exampleNational: '0501234567', exampleInternational: '+966501234567', validLengths: [9], mobileRules: { supported: true, validLengths: [9], nationalPattern: '5\\d{8}', localPrefix: '0' } },
        { country: 'الإمارات', isoCode: 'AE', dialCode: '+971', exampleNational: '0501234567', exampleInternational: '+971501234567', validLengths: [9], mobileRules: { supported: true, validLengths: [9], nationalPattern: '5[02-68]\\d{7}', localPrefix: '0' } }
    ]
};

async function routeCatalog(page, { delay = 0, status = 200 } = {}) {
    await page.route('**/api/phone/countries', async (route) => {
        if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
        await route.fulfill({ status, contentType: 'application/json', body: status === 200 ? JSON.stringify(catalog) : '{}' });
    });
}

test.describe('Egypt-only phone country policy', () => {
    test('always uses EG metadata and never calls IP/country detection', async ({ page }) => {
        const detectedRequests = [];
        page.on('request', (request) => { if (request.url().includes('/api/phone/country')) detectedRequests.push(request.url()); });
        await routeCatalog(page);
        await page.goto('/register-gym.html', { waitUntil: 'domcontentloaded' });
        const phone = page.locator('input[name="whatsapp"]');
        const countryControl = page.locator('.phone-country-control');
        await expect(phone).toHaveAttribute('placeholder', 'مثال: 01015819700');
        await expect(phone).toHaveAttribute('inputmode', 'numeric');
        await expect(countryControl).toBeHidden();
        await expect(page.locator('select[data-phone-country]')).toHaveValue('EG');
        expect(detectedRequests).toEqual([]);
    });

    test('timezone and locale do not alter the fixed Egyptian UX', async ({ page }) => {
        await routeCatalog(page);
        await page.goto('/register-gym.html', { waitUntil: 'domcontentloaded' });
        const phone = page.locator('input[name="whatsapp"]');
        await expect(phone).toHaveAttribute('placeholder', 'مثال: 01015819700');
        await expect(phone).toHaveValue('');
        await page.evaluate(() => { document.documentElement.lang = 'en'; document.documentElement.dir = 'ltr'; });
        await expect(phone).toHaveAttribute('placeholder', 'مثال: 01015819700');
    });

    test('delayed or failed catalog never injects a country or phone value', async ({ page }) => {
        await routeCatalog(page, { delay: 250 });
        await page.goto('/register-gym.html', { waitUntil: 'domcontentloaded' });
        const phone = page.locator('input[name="whatsapp"]');
        await expect(phone).toHaveValue('');
        await expect(phone).toHaveAttribute('placeholder', 'مثال: 01015819700');

        await page.reload({ waitUntil: 'domcontentloaded' });
        await expect(phone).toHaveValue('');
    });

    test('catalog failure fails closed without a country selector becoming actionable', async ({ page }) => {
        await routeCatalog(page, { status: 503 });
        await page.goto('/register-gym.html', { waitUntil: 'domcontentloaded' });
        await expect(page.locator('.phone-country-control')).toBeHidden();
        await expect(page.locator('input[name="whatsapp"]')).toHaveValue('');
    });
});
