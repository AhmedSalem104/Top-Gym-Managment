const { test, expect } = require('@playwright/test');

const catalog = {
    countries: [
        {
            country: 'مصر',
            isoCode: 'EG',
            dialCode: '+20',
            exampleNational: '01015819700',
            exampleInternational: '+201015819700',
            validLengths: [8, 9, 10],
            mobileRules: { supported: true, validLengths: [10], nationalPattern: '1[0-25]\\d{8}', localPrefix: '0' }
        },
        {
            country: 'السعودية',
            isoCode: 'SA',
            dialCode: '+966',
            exampleNational: '0501234567',
            exampleInternational: '+966501234567',
            validLengths: [9],
            mobileRules: { supported: true, validLengths: [9], nationalPattern: '5\\d{8}', localPrefix: '0' }
        },
        {
            country: 'الإمارات العربية المتحدة',
            isoCode: 'AE',
            dialCode: '+971',
            exampleNational: '050 123 4567',
            exampleInternational: '+971501234567',
            validLengths: [9],
            mobileRules: { supported: true, validLengths: [9], nationalPattern: '5[02-68]\\d{7}', localPrefix: '0' }
        }
    ]
};

async function routeCatalog(page, { delay = 0, status = 200 } = {}) {
    await page.route('**/api/phone/countries', async (route) => {
        if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
        if (status !== 200) {
            await route.fulfill({ status, contentType: 'application/json', body: '{}' });
            return;
        }
        await route.fulfill({
            status,
            contentType: 'application/json',
            body: JSON.stringify(catalog)
        });
    });
}

test.describe('automatic country detection', () => {
    test.describe('Egypt timezone', () => {
        test.use({ locale: 'en-US', timezoneId: 'Africa/Cairo' });
        test('Egypt timezone selects Egypt metadata and keeps the national example local', async ({ page }) => {
        test.skip(test.info().project.name === 'mobile', 'The same behavior is covered by the desktop viewport; avoid duplicate locale runs.');
        await routeCatalog(page, { delay: 350 });
        await page.goto('/register-gym.html', { waitUntil: 'domcontentloaded' });

        const phone = page.locator('input[name="whatsapp"]');
        const country = page.locator('select[data-phone-country]');
        await expect(country).toHaveValue('EG');
        await expect(phone).toHaveValue('');
        await expect(phone).toHaveAttribute('placeholder', '1015819700');
        await expect(page.locator('[data-phone-country-code]')).toHaveText('+20');
        await expect(page.locator('[data-phone-country-name]')).toHaveText('مصر');
        await page.waitForTimeout(900);
        await expect(country).toHaveValue('EG');
        await expect(phone).toHaveValue('');
        await expect(phone).toHaveAttribute('placeholder', '1015819700');
    });
    });

    test.describe('Saudi timezone', () => {
        test.use({ locale: 'en-US', timezoneId: 'Asia/Riyadh' });
        test('Saudi timezone selects Saudi metadata, and manual Egypt selection wins after async work', async ({ page }) => {
        test.skip(test.info().project.name === 'mobile', 'The same behavior is covered by the desktop viewport; avoid duplicate locale runs.');
        await routeCatalog(page, { delay: 350 });
        await page.goto('/register-gym.html', { waitUntil: 'domcontentloaded' });

        const phone = page.locator('input[name="whatsapp"]');
        const country = page.locator('select[data-phone-country]');
        await expect(phone).toHaveValue('');
        await expect(country).toHaveValue('SA');
        await expect(phone).toHaveAttribute('placeholder', '501234567');
        await expect(page.locator('[data-phone-country-code]')).toHaveText('+966');
        await expect(page.locator('[data-phone-country-name]')).toHaveText('السعودية');

        await country.selectOption('EG');
        await expect(phone).toHaveValue('');
        await expect(phone).toHaveAttribute('placeholder', '1015819700');
        await expect(page.locator('[data-phone-country-code]')).toHaveText('+20');
        await page.waitForTimeout(1200);
        await expect(country).toHaveValue('EG');
        await expect(phone).toHaveAttribute('placeholder', '1015819700');
        await expect(phone).toHaveValue('');

        await page.reload({ waitUntil: 'domcontentloaded' });
        await expect(country).toHaveValue('SA');
        await expect(phone).toHaveAttribute('placeholder', '501234567');
        await expect(phone).toHaveValue('');
        });
    });

    test.describe('Dubai timezone', () => {
        test.use({ locale: 'en-US', timezoneId: 'Asia/Dubai' });
        test('Dubai timezone selects UAE metadata and keeps the input value empty', async ({ page }) => {
        test.skip(test.info().project.name === 'mobile', 'The same behavior is covered by the desktop viewport; avoid duplicate locale runs.');
        await routeCatalog(page);
        await page.goto('/register-gym.html', { waitUntil: 'domcontentloaded' });
        const phone = page.locator('input[name="whatsapp"]');
        await expect(phone).toHaveValue('');
        await expect(page.locator('select[data-phone-country]')).toHaveValue('AE');
        await expect(phone).toHaveAttribute('placeholder', '501234567');
        await expect(page.locator('[data-phone-country-code]')).toHaveText('+971');
        await expect(page.locator('[data-phone-country-name]')).toHaveText('الإمارات العربية المتحدة');
        });
    });

    test.describe('catalog failure', () => {
        test.use({ locale: 'en-US', timezoneId: 'Asia/Riyadh' });
        test('catalog failure uses the single central fallback without injecting a phone value', async ({ page }) => {
        test.skip(test.info().project.name === 'mobile', 'The same behavior is covered by the desktop viewport; avoid duplicate locale runs.');
        await routeCatalog(page, { status: 503 });
        await page.goto('/register-gym.html', { waitUntil: 'domcontentloaded' });
        const phone = page.locator('input[name="whatsapp"]');
        await expect(phone).toHaveValue('');
        await expect(page.locator('select[data-phone-country]')).toHaveValue('EG');
        await expect(phone).toHaveAttribute('placeholder', '1015819700');
        await page.waitForTimeout(800);
        await expect(phone).toHaveValue('');
        await expect(phone).toHaveAttribute('placeholder', '1015819700');
        });
    });
});
