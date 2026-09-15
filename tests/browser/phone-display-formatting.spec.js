const { test, expect } = require('@playwright/test');

const catalog = {
    countries: [{
        country: 'مصر', isoCode: 'EG', dialCode: '+20', exampleNational: '01015819700', exampleInternational: '+201015819700', validLengths: [8, 9, 10],
        mobileRules: { supported: true, validLengths: [10], nationalPattern: '1[0-25]\\d{8}', localPrefix: '0' }
    }]
};

async function installCatalog(page) {
    await page.route('**/api/phone/countries', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(catalog) }));
}

test.describe('Egyptian phone display and canonical transport', () => {
    test('formats local input on blur while preserving canonical E.164 payload', async ({ page }) => {
        await installCatalog(page);
        await page.goto('/register-gym.html', { waitUntil: 'domcontentloaded' });
        const phone = page.locator('input[name="whatsapp"]');
        await page.waitForFunction(() => Boolean(window.LogicFitPhoneFormatter && window.LogicFitPhoneInputs?.formatForDisplay));

        const display = await page.evaluate(() => window.LogicFitPhoneInputs.formatForDisplay('+201015819700', 'EG'));
        expect(display).toBe('010 15819700');
        await expect(page.locator('.phone-country-control')).toBeHidden();

        await phone.fill('01015819700');
        await expect(phone).toHaveAttribute('aria-invalid', 'false');
        await phone.blur();
        await expect(phone).toHaveValue('010 15819700');
        await expect(phone).toHaveAttribute('aria-invalid', 'false');
        await expect(page.locator('.phone-input-error')).toBeHidden();
        const payload = await page.evaluate(() => window.LogicFitPhoneInputs.getSubmissionPayload(document.querySelector('input[name="whatsapp"]')));
        expect(payload).toEqual({ phoneCountry: 'EG', phoneNational: '1015819700', phone: '+201015819700' });
    });

    test('accepts paste/legacy canonical values but rejects international non-Egyptian input', async ({ page }) => {
        await installCatalog(page);
        await page.goto('/register-gym.html', { waitUntil: 'domcontentloaded' });
        const phone = page.locator('input[name="whatsapp"]');
        await phone.evaluate((input) => {
            const clipboard = new DataTransfer();
            clipboard.setData('text/plain', '010 1581 9700');
            input.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: clipboard }));
        });
        await phone.blur();
        await expect(phone).toHaveValue('010 15819700');
        await expect(phone).toHaveAttribute('aria-invalid', 'false');

        await phone.fill('');
        await phone.evaluate((input) => {
            const clipboard = new DataTransfer();
            clipboard.setData('text/plain', '+201015819700');
            input.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: clipboard }));
        });
        await phone.blur();
        await expect(phone).toHaveValue('010 15819700');
        await expect(phone).toHaveAttribute('aria-invalid', 'false');

        await phone.fill('');
        await phone.evaluate((input) => {
            const clipboard = new DataTransfer();
            clipboard.setData('text/plain', '+966501234567');
            input.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: clipboard }));
        });
        await phone.blur();
        await expect(phone).toHaveAttribute('aria-invalid', 'true');
        await expect(page.locator('.phone-input-error')).toContainText('محلي');
    });

    test('keeps cursor usable when formatting during edits', async ({ page }) => {
        await installCatalog(page);
        await page.goto('/register-gym.html', { waitUntil: 'domcontentloaded' });
        const phone = page.locator('input[name="whatsapp"]');
        await phone.fill('01015819700');
        await phone.blur();
        await phone.focus();
        await phone.press('End');
        await phone.press('Backspace');
        await expect(phone).toHaveValue('010 1581970');
        await phone.press('0');
        await expect(phone).toHaveValue('010 15819700');
    });
});
