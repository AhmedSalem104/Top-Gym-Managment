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
            mobileRules: { supported: true, validLengths: [10], nationalPattern: '1[0-25]\\d{8}' }
        },
        {
            country: 'الإمارات العربية المتحدة',
            isoCode: 'AE',
            dialCode: '+971',
            exampleNational: '050 123 4567',
            exampleInternational: '+971501234567',
            validLengths: [9],
            mobileRules: { supported: true, validLengths: [9], nationalPattern: '5[02-68]\\d{7}' }
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
    await expect(country).toHaveValue('EG');
    await expect(phone).toHaveAttribute('placeholder', /010/);
    await expect(country.locator('option[value="EG"]')).toContainText('🇪🇬');

    await page.locator('input[name="gymName"]').fill('QA Phone Validation Gym');
    await page.locator('input[name="ownerName"]').fill('QA Owner');
    await page.locator('input[name="email"]').fill('qa-phone-validation@example.test');
    await phone.fill('010123');
    await phone.blur();
    await expect(error).toBeVisible();
    await expect(phone).toHaveAttribute('aria-invalid', 'true');
    await page.locator('#registrationNext').click();
    await expect(page.locator('[data-registration-step="1"]')).toBeVisible();

    await phone.fill('01012345678');
    await phone.blur();
    await expect(error).toBeHidden();
    await expect(phone).not.toHaveAttribute('aria-invalid', 'true');

    await country.selectOption('AE');
    await expect(phone).toHaveAttribute('placeholder', /050/);
    await expect(country.locator('option:checked')).toContainText('🇦🇪');
    await phone.fill('+201012345678');
    await phone.blur();
    await expect(error).toBeVisible();
    await expect(error).toContainText('الدولة المختارة');
});
