const { test, expect } = require('@playwright/test');

const catalog = {
    countries: [
        {
            country: 'مصر',
            isoCode: 'EG',
            dialCode: '+20',
            exampleNational: '010 01234567',
            exampleInternational: '+201001234567',
            validLengths: [8, 9, 10],
            mobileRules: { supported: true, validLengths: [10], nationalPattern: '1[0-25]\\d{8}', localPrefix: '0' }
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

test('phone input blocks invalid length/format before registration request', async ({ page }) => {
    await page.route('**/api/phone/countries', (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(catalog)
    }));
    await page.goto('/register-gym.html', { waitUntil: 'domcontentloaded' });

    const phone = page.locator('input[name="whatsapp"]');
    const country = page.locator('select[data-phone-country]');
    const error = page.locator('.phone-input-error');
    const flag = page.locator('[data-phone-country-flag]');
    await expect(country).toHaveValue('EG');
    await expect(phone).toHaveAttribute('placeholder', /010/);
    await expect(flag).toHaveText('🇪🇬');
    await expect(page.locator('.phone-country-trigger')).toContainText('+20');
    await expect(page.locator('.phone-country-trigger')).toContainText('مصر');

    await page.locator('input[name="gymName"]').fill('QA Phone Validation Gym');
    await page.locator('input[name="ownerName"]').fill('QA Owner');
    await page.locator('input[name="email"]').fill('qa-phone-validation@example.test');
    await phone.fill('010123');
    await phone.blur();
    await expect(error).toBeVisible();
    await expect(phone).toHaveAttribute('aria-invalid', 'true');
    await page.locator('#registrationNext').click();
    await expect(page.locator('[data-registration-step="1"]')).toBeVisible();

    await phone.fill('0101234abc');
    await phone.blur();
    await expect(error).toBeVisible();

    await phone.fill('0101581970000000');
    await phone.blur();
    await expect(error).toBeVisible();
    await expect(error).toContainText('11');

    await phone.fill('01012345678');
    await phone.blur();
    await expect(error).toBeHidden();
    await expect(phone).not.toHaveAttribute('aria-invalid', 'true');

    await page.locator('.phone-country-trigger').click();
    await expect(page.locator('.phone-country-menu')).toBeVisible();
    const countrySearch = page.locator('.phone-country-search');
    await expect(countrySearch).toBeVisible();
    await countrySearch.fill('+971');
    await expect(page.locator('[data-phone-country-option="AE"]')).toHaveCount(1);
    await page.locator('[data-phone-country-option="AE"]').click();
    await expect(phone).toHaveAttribute('placeholder', /050/);
    await expect(flag).toHaveText('🇦🇪');
    await phone.fill('+201012345678');
    await phone.blur();
    await expect(error).toBeVisible();
    await expect(error).toContainText('الدولة المختارة');
});

test('selected country enforces its local mobile prefix', async ({ page }) => {
    await page.route('**/api/phone/countries', (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(catalog)
    }));
    await page.goto('/register-gym.html', { waitUntil: 'domcontentloaded' });
    const phone = page.locator('input[name="whatsapp"]');
    const error = page.locator('.phone-input-error');
    await phone.fill('1012345678');
    await phone.blur();
    await expect(error).toBeVisible();
    await expect(phone).toHaveAttribute('aria-invalid', 'true');
    const errorColor = await error.evaluate((element) => getComputedStyle(element).color);
    const colorChannels = errorColor.match(/\d+/gu)?.map(Number) || [];
    expect(colorChannels.length).toBeGreaterThanOrEqual(3);
    expect(colorChannels[0]).toBeGreaterThan(colorChannels[1]);
    expect(colorChannels[0]).toBeGreaterThan(colorChannels[2]);
    await phone.fill('01012345678');
    await phone.blur();
    await expect(error).toBeHidden();
});
