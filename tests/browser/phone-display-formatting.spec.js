const { test, expect } = require('@playwright/test');

const catalog = {
    countries: [
        { country: 'مصر', isoCode: 'EG', dialCode: '+20', exampleNational: '01015819700', validLengths: [10], mobileRules: { validLengths: [10], nationalPattern: '1[0-25]\\d{8}', localPrefix: '0' } },
        { country: 'السعودية', isoCode: 'SA', dialCode: '+966', exampleNational: '0501234567', validLengths: [9], mobileRules: { validLengths: [9], nationalPattern: '5\\d{8}', localPrefix: '0' } },
        { country: 'الإمارات', isoCode: 'AE', dialCode: '+971', exampleNational: '0501234567', validLengths: [9], mobileRules: { validLengths: [9], nationalPattern: '5[02-68]\\d{7}', localPrefix: '0' } },
        { country: 'الكويت', isoCode: 'KW', dialCode: '+965', exampleNational: '050123456', validLengths: [8], mobileRules: { validLengths: [8], nationalPattern: '[569]\\d{7}', localPrefix: '0' } },
        { country: 'الولايات المتحدة', isoCode: 'US', dialCode: '+1', exampleNational: '2025550123', validLengths: [10], mobileRules: { validLengths: [10], nationalPattern: '[2-9]\\d{9}', localPrefix: '' } }
    ]
};

async function installCatalog(page) {
    await page.route('**/api/phone/countries', (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(catalog)
    }));
    await page.route('**/api/phone/country', (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ countryCode: 'EG' })
    }));
}

test.describe('phone display formatting', () => {
    test('uses libphonenumber national display formatting without changing transport state', async ({ page }) => {
        await installCatalog(page);
        await page.goto('/register-gym.html', { waitUntil: 'domcontentloaded' });
        const phone = page.locator('input[name="whatsapp"]');
        await page.waitForFunction(() => Boolean(window.LogicFitPhoneFormatter && window.LogicFitPhoneInputs?.formatForDisplay));

        const displays = await page.evaluate(() => ({
            eg: window.LogicFitPhoneInputs.formatForDisplay('+201015819700', 'EG'),
            sa: window.LogicFitPhoneInputs.formatForDisplay('+966501234567', 'SA'),
            ae: window.LogicFitPhoneInputs.formatForDisplay('+971501234567', 'AE'),
            kw: window.LogicFitPhoneInputs.formatForDisplay('+96550123456', 'KW'),
            us: window.LogicFitPhoneInputs.formatForDisplay('+12025550123', 'US')
        }));
        expect(displays).toEqual({
            eg: '010 15819700',
            sa: '050 123 4567',
            ae: '050 123 4567',
            kw: '501 23456',
            us: '(202) 555-0123'
        });

        await phone.fill('');
        await phone.pressSequentially('01015819700');
        await expect(phone).toHaveValue('010 15819700');
        const typedState = await page.evaluate(() => ({
            value: document.querySelector('input[name="whatsapp"]').value,
            payload: window.LogicFitPhoneInputs.getSubmissionPayload(document.querySelector('input[name="whatsapp"]'))
        }));
        expect(typedState.value).toBe('010 15819700');
        expect(typedState.payload).toMatchObject({ phoneCountry: 'EG', phoneNational: '1015819700', phone: '+201015819700' });

        await phone.fill('+201015819700');
        await phone.blur();
        await expect(phone).toHaveValue('010 15819700');

        await phone.fill('');
        await phone.evaluate((input) => {
            const clipboard = new DataTransfer();
            clipboard.setData('text/plain', '010 1581 9700');
            input.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: clipboard }));
        });
        await phone.blur();
        await expect(phone).toHaveValue('010 15819700');
        await expect(phone).toHaveAttribute('aria-invalid', 'false');

        await phone.focus();
        await phone.press('End');
        await phone.press('Backspace');
        await expect(phone).toHaveValue('010 1581970');
        await phone.press('0');
        await expect(phone).toHaveValue('010 15819700');

        await phone.focus();
        await phone.evaluate((input) => input.setSelectionRange(1, 1));
        await phone.press('2');
        const cursorState = await phone.evaluate((input) => ({ value: input.value, start: input.selectionStart, end: input.selectionEnd }));
        expect(cursorState.value).toMatch(/^[0-9 ]+$/u);
        expect(cursorState.start).toBeGreaterThanOrEqual(0);
        expect(cursorState.end).toBeLessThanOrEqual(cursorState.value.length);
    });
});
