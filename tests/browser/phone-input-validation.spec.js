const { test, expect } = require('@playwright/test');

const catalog = {
    countries: [{ country: 'مصر', isoCode: 'EG', dialCode: '+20', exampleNational: '01015819700', exampleInternational: '+201015819700', validLengths: [8, 9, 10], mobileRules: { supported: true, validLengths: [10], nationalPattern: '1[0-25]\\d{8}', localPrefix: '0' } }]
};

async function installCatalog(page) {
    await page.route('**/api/phone/countries', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(catalog) }));
}

test.describe('Egyptian local phone validation', () => {
    test('keeps required phone and representative required fields neutral until feedback is triggered', async ({ page }) => {
        await installCatalog(page);
        await page.goto('/register-gym.html', { waitUntil: 'domcontentloaded' });

        const phone = page.locator('input[name="whatsapp"]');
        const error = page.locator('.phone-input-error');
        const gymName = page.locator('input[name="gymName"]');

        // Initial render and focus-only must not look invalid.
        await expect(phone).toHaveAttribute('aria-invalid', 'false');
        await expect(phone).not.toHaveClass(/is-invalid/);
        await expect(error).toBeHidden();
        await expect(gymName).not.toHaveClass(/is-invalid/);
        await expect(gymName).not.toHaveAttribute('aria-invalid', 'true');
        await phone.focus();
        await expect(phone).toHaveAttribute('aria-invalid', 'false');
        await expect(error).toBeHidden();

        // Blur marks the empty required field as touched and reveals feedback.
        await phone.blur();
        await expect(phone).toHaveAttribute('aria-invalid', 'true');
        await expect(error).toBeVisible();

        // A valid value clears the visual error immediately; an invalid value
        // after interaction is shown again without changing backend rules.
        await phone.fill('01015819700');
        await expect(phone).toHaveAttribute('aria-invalid', 'false');
        await expect(error).toBeHidden();
        await phone.fill('010123');
        await expect(phone).toHaveAttribute('aria-invalid', 'true');
        await expect(error).toBeVisible();
        await phone.fill('01015819700');
        await expect(phone).toHaveAttribute('aria-invalid', 'false');
        await expect(error).toBeHidden();

        // Submit promotes an untouched empty required phone to visible error.
        await phone.fill('');
        await page.evaluate(() => document.querySelector('#gymRegistrationForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
        await expect(phone).toHaveAttribute('aria-invalid', 'true');
        await expect(error).toBeVisible();

        // Native reset/reopen returns the custom phone presentation to neutral.
        await page.locator('#gymRegistrationForm').evaluate((form) => form.reset());
        await page.waitForTimeout(20);
        await expect(phone).toHaveAttribute('aria-invalid', 'false');
        await expect(phone).not.toHaveClass(/is-invalid/);
        await expect(error).toBeHidden();
    });

    test('shows local placeholder, rejects letters, and validates four mobile prefixes', async ({ page }) => {
        await installCatalog(page);
        await page.goto('/register-gym.html', { waitUntil: 'domcontentloaded' });
        const phone = page.locator('input[name="whatsapp"]');
        const error = page.locator('.phone-input-error');
        await expect(phone).toHaveAttribute('placeholder', 'مثال: 01015819700');
        await expect(page.locator('.phone-country-control')).toBeHidden();
        await expect(phone).toHaveAttribute('pattern', '(?:[0-9]|\\s|\\.|\\(|\\)|-)*');

        await phone.fill('010123');
        await phone.blur();
        await expect(error).toBeVisible();
        await expect(phone).toHaveAttribute('aria-invalid', 'true');

        await phone.fill('0101234abc');
        await phone.blur();
        await expect(error).toBeVisible();

        for (const prefix of ['010', '011', '012', '015']) {
            await phone.fill(`${prefix}15819700`);
            await phone.blur();
            await expect(error).toBeHidden();
            await expect(phone).toHaveAttribute('aria-invalid', 'false');
        }
    });

    test('rejects fixed-line and foreign numbers without layout overflow', async ({ page }) => {
        await installCatalog(page);
        await page.goto('/register-gym.html', { waitUntil: 'domcontentloaded' });
        const phone = page.locator('input[name="whatsapp"]');
        const error = page.locator('.phone-input-error');
        await phone.fill('0223456789');
        await phone.blur();
        await expect(error).toBeVisible();
        await phone.fill('201015819700');
        await phone.blur();
        await expect(error).toBeVisible();

        const metrics = await page.evaluate(() => ({
            viewport: document.documentElement.clientWidth,
            scroll: document.documentElement.scrollWidth,
            control: document.querySelector('.phone-input-control')?.getBoundingClientRect().toJSON()
        }));
        expect(metrics.scroll).toBeLessThanOrEqual(metrics.viewport);
        expect(metrics.control.right).toBeLessThanOrEqual(metrics.viewport + 1);
    });

    test('keeps error space stable at mobile width in both themes', async ({ page }) => {
        await page.setViewportSize({ width: 320, height: 568 });
        await installCatalog(page);
        await page.goto('/register-gym.html', { waitUntil: 'domcontentloaded' });
        const phone = page.locator('input[name="whatsapp"]');
        const control = page.locator('.phone-input-control');
        const before = await control.boundingBox();
        await phone.fill('010123');
        await phone.blur();
        const after = await control.boundingBox();
        expect(Math.abs((after?.height || 0) - (before?.height || 0))).toBeLessThanOrEqual(1);
        await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
        await expect(page.locator('.phone-input-error')).toBeVisible();
        await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    });
});
