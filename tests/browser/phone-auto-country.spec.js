const { test, expect } = require('@playwright/test');

const catalog = {
    countries: [
        {
            country: '\u0645\u0635\u0631',
            isoCode: 'EG',
            dialCode: '+20',
            exampleNational: '01015819700',
            exampleInternational: '+201015819700',
            validLengths: [8, 9, 10],
            mobileRules: { supported: true, validLengths: [10], nationalPattern: '1[0-25]\\d{8}', localPrefix: '0' }
        },
        {
            country: '\u0627\u0644\u0633\u0639\u0648\u062f\u064a\u0629',
            isoCode: 'SA',
            dialCode: '+966',
            exampleNational: '0501234567',
            exampleInternational: '+966501234567',
            validLengths: [9],
            mobileRules: { supported: true, validLengths: [9], nationalPattern: '5\\d{8}', localPrefix: '0' }
        },
        {
            country: '\u0627\u0644\u0625\u0645\u0627\u0631\u0627\u062a \u0627\u0644\u0639\u0631\u0628\u064a\u0629 \u0627\u0644\u0645\u062a\u062d\u062f\u0629',
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

async function routeDetectedCountry(page, { code = null, delay = 0, status = 200 } = {}) {
    await page.route('**/api/phone/country', async (route) => {
        if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
        if (status !== 200) {
            await route.fulfill({ status, contentType: 'application/json', body: '{}' });
            return;
        }
        await route.fulfill({
            status,
            contentType: 'application/json',
            body: JSON.stringify({ countryCode: code })
        });
    });
}

function skipMobile(testInfo) {
    testInfo.skip(testInfo.project.name === 'mobile', 'The same behavior is covered by the desktop viewport; avoid duplicate locale runs.');
}

test.describe('automatic country detection', () => {
    test.describe('IP detection', () => {
        test.use({ locale: 'en-US', timezoneId: 'Europe/Berlin' });

        test('Egypt IP selects Egypt metadata, local placeholder and empty value', async ({ page }, testInfo) => {
            skipMobile(testInfo);
            await routeCatalog(page);
            await routeDetectedCountry(page, { code: 'EG' });
            await page.goto('/register-gym.html', { waitUntil: 'domcontentloaded' });

            const phone = page.locator('input[name="whatsapp"]');
            await expect(page.locator('select[data-phone-country]')).toHaveValue('EG');
            await expect(phone).toHaveValue('');
            await expect(phone).toHaveAttribute('placeholder', '1015819700');
            await expect(page.locator('[data-phone-country-code]')).toHaveText('+20');
            await expect(page.locator('[data-phone-country-name]')).toHaveText(catalog.countries[0].country);
            await page.waitForTimeout(900);
            await page.reload({ waitUntil: 'domcontentloaded' });
            await expect(phone).toHaveValue('');
            await expect(phone).toHaveAttribute('placeholder', '1015819700');
        });

        test('Saudi IP selects Saudi metadata from the same catalog', async ({ page }, testInfo) => {
            skipMobile(testInfo);
            await routeCatalog(page);
            await routeDetectedCountry(page, { code: 'SA' });
            await page.goto('/register-gym.html', { waitUntil: 'domcontentloaded' });

            const phone = page.locator('input[name="whatsapp"]');
            await expect(page.locator('select[data-phone-country]')).toHaveValue('SA');
            await expect(phone).toHaveValue('');
            await expect(phone).toHaveAttribute('placeholder', '501234567');
            await expect(page.locator('[data-phone-country-code]')).toHaveText('+966');
            await expect(page.locator('[data-phone-country-name]')).toHaveText(catalog.countries[1].country);
        });

        test('UAE IP selects UAE metadata and keeps the input value empty', async ({ page }, testInfo) => {
            skipMobile(testInfo);
            await routeCatalog(page);
            await routeDetectedCountry(page, { code: 'AE' });
            await page.goto('/register-gym.html', { waitUntil: 'domcontentloaded' });

            const phone = page.locator('input[name="whatsapp"]');
            await expect(phone).toHaveValue('');
            await expect(page.locator('select[data-phone-country]')).toHaveValue('AE');
            await expect(phone).toHaveAttribute('placeholder', '501234567');
            await expect(page.locator('[data-phone-country-code]')).toHaveText('+971');
            await expect(page.locator('[data-phone-country-name]')).toHaveText(catalog.countries[2].country);
        });
    });

    test.describe('manual priority and fallback chain', () => {
        test.use({ locale: 'en-US', timezoneId: 'Europe/Berlin' });

        test('manual country selection wins over a delayed IP response', async ({ page }, testInfo) => {
            skipMobile(testInfo);
            await routeCatalog(page);
            await routeDetectedCountry(page, { code: 'EG', delay: 900 });
            await page.goto('/register-gym.html', { waitUntil: 'domcontentloaded' });

            const phone = page.locator('input[name="whatsapp"]');
            const country = page.locator('select[data-phone-country]');
            await expect(country).toHaveValue('EG');
            await country.selectOption('SA');
            await expect(phone).toHaveValue('');
            await expect(phone).toHaveAttribute('placeholder', '501234567');
            await page.waitForTimeout(1_200);
            await expect(country).toHaveValue('SA');
            await expect(phone).toHaveAttribute('placeholder', '501234567');
            await expect(phone).toHaveValue('');
        });

        test.describe('IP failure', () => {
            test('falls back to the central catalog fallback when timezone and locale are unavailable', async ({ page }, testInfo) => {
                skipMobile(testInfo);
                await routeCatalog(page);
                await routeDetectedCountry(page, { status: 503 });
                await page.goto('/register-gym.html', { waitUntil: 'domcontentloaded' });
                const phone = page.locator('input[name="whatsapp"]');
                await expect(page.locator('select[data-phone-country]')).toHaveValue('EG');
                await expect(phone).toHaveAttribute('placeholder', '1015819700');
                await expect(phone).toHaveValue('');
            });

            test.describe('timezone fallback', () => {
                test.use({ timezoneId: 'Asia/Riyadh' });
                test('uses Saudi timezone when IP detection fails', async ({ page }, testInfo) => {
                    skipMobile(testInfo);
                    await routeCatalog(page);
                    await routeDetectedCountry(page, { status: 503 });
                    await page.goto('/register-gym.html', { waitUntil: 'domcontentloaded' });
                    await expect(page.locator('select[data-phone-country]')).toHaveValue('SA');
                    await expect(page.locator('input[name="whatsapp"]')).toHaveAttribute('placeholder', '501234567');
                });
            });

            test.describe('locale fallback', () => {
                test.use({ locale: 'en-AE' });
                test('uses the browser locale after timezone and IP fail', async ({ page }, testInfo) => {
                    skipMobile(testInfo);
                    await routeCatalog(page);
                    await routeDetectedCountry(page, { status: 503 });
                    await page.goto('/register-gym.html', { waitUntil: 'domcontentloaded' });
                    await expect(page.locator('select[data-phone-country]')).toHaveValue('AE');
                    await expect(page.locator('input[name="whatsapp"]')).toHaveAttribute('placeholder', '501234567');
                });
            });
        });
    });

    test.describe('catalog failure', () => {
        test.use({ locale: 'en-US', timezoneId: 'Asia/Riyadh' });

        test('uses the single central fallback without injecting a phone value', async ({ page }, testInfo) => {
            skipMobile(testInfo);
            await routeCatalog(page, { status: 503 });
            await routeDetectedCountry(page, { code: 'SA' });
            await page.goto('/register-gym.html', { waitUntil: 'domcontentloaded' });
            const phone = page.locator('input[name="whatsapp"]');
            await expect(phone).toHaveValue('');
            await expect(page.locator('select[data-phone-country]')).toHaveValue('EG');
            await expect(phone).toHaveAttribute('placeholder', '1015819700');
        });
    });
});
