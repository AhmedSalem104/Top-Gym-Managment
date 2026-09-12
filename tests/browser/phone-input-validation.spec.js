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
            country: 'Saudi Arabia',
            isoCode: 'SA',
            dialCode: '+966',
            exampleNational: '0501234567',
            exampleInternational: '+966501234567',
            validLengths: [9],
            mobileRules: { supported: true, validLengths: [9], nationalPattern: '5\\d{8}', localPrefix: '0' }
        },
        {
            country: 'United Arab Emirates',
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
    await expect(phone).toHaveValue('');
    await expect(phone).toHaveAttribute('placeholder', '1015819700');
    await expect(phone).toHaveAttribute('inputmode', 'numeric');
    await expect(phone).toHaveAttribute('autocomplete', 'tel');
    await expect(phone).toHaveAttribute('pattern', '(?:[0-9]|\\+|\\s|\\.|\\(|\\)|-)*');
    await expect(flag.locator('img')).toHaveAttribute('src', /\/eg\.png$/);
    await expect(page.locator('.phone-country-trigger')).toContainText('+20');
    await expect(page.locator('.phone-country-divider')).toBeVisible();
    await expect(page.locator('.phone-number-icon svg')).toBeVisible();
    await expect(page.locator('.phone-number-divider')).toBeVisible();
    await expect(page.locator('.phone-input-help')).toBeVisible();
    await page.screenshot({ path: `qa/artifacts/phone-control-${test.info().project.name}-initial.png`, fullPage: false });
    await page.locator('.phone-input-control').screenshot({ path: `qa/artifacts/phone-control-${test.info().project.name}-focused.png` });
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
    await expect(phone).toHaveValue('010123');

    await phone.fill('');
    await phone.pressSequentially('abc');
    await expect(phone).toHaveValue('');
    await expect(error).toBeVisible();

    await phone.fill('01012abc345678');
    await expect(phone).toHaveValue('');
    await expect(error).toBeVisible();

    await phone.fill('0101581970000000');
    await phone.blur();
    await expect(error).toBeVisible();
    await expect(error).toContainText('11');

    await phone.fill('1012345678');
    await phone.blur();
    await expect(error).toBeHidden();
    await expect(phone).not.toHaveAttribute('aria-invalid', 'true');
    await expect(phone).toHaveAttribute('data-phone-maximum-digits', '10');
    await phone.pressSequentially('9');
    await expect(phone).toHaveValue('1012345678');
    await expect(error).toBeVisible();
    await expect(error).toContainText('10');
    await phone.fill('01012345678');
    await phone.blur();
    await expect(error).toBeHidden();

    await page.locator('.phone-country-trigger').click();
    await expect(page.locator('.phone-country-menu')).toBeVisible();
    await expect(page.locator('.phone-country-option img')).toHaveCount(catalog.countries.length);
    await page.locator('.phone-input-control').screenshot({ path: `qa/artifacts/phone-control-${test.info().project.name}-dropdown.png` });
    const countrySearch = page.locator('.phone-country-search');
    await expect(countrySearch).toBeVisible();
    await countrySearch.fill('+971');
    await expect(page.locator('[data-phone-country-option="AE"]')).toHaveCount(1);
    await page.locator('[data-phone-country-option="AE"]').click();
    await expect(phone).toHaveAttribute('placeholder', /^5\d{8}$/);
    await expect(flag.locator('img')).toHaveAttribute('src', /\/ae\.png$/);
    await expect(page.locator('[data-phone-country-code]')).toHaveText('+971');
    await expect(page.locator('[data-phone-country-name]')).toHaveText(catalog.countries[2].country);
    await phone.fill('0101234567');
    await phone.blur();
    await expect(error).toBeVisible();
    await expect(phone).toHaveAttribute('aria-invalid', 'true');
});

test('selected country enforces its local mobile format', async ({ page }) => {
    await page.route('**/api/phone/countries', (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(catalog)
    }));
    await page.goto('/register-gym.html', { waitUntil: 'domcontentloaded' });
    const phone = page.locator('input[name="whatsapp"]');
    const error = page.locator('.phone-input-error');
    await phone.fill('2012345678');
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

test('phone input stays stable and usable at 320px in both themes', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.route('**/api/phone/countries', (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(catalog)
    }));
    await page.goto('/register-gym.html', { waitUntil: 'domcontentloaded' });
    const phone = page.locator('input[name="whatsapp"]');
    const control = page.locator('.phone-input-control');
    const error = page.locator('.phone-input-error');
    const beforeHeight = await control.evaluate((element) => element.getBoundingClientRect().height);
    const initialLayout = await page.evaluate(() => {
        const country = document.querySelector('.phone-country-control')?.getBoundingClientRect();
        const number = document.querySelector('.phone-number-control')?.getBoundingClientRect();
        return { countryWidth: country?.width || 0, numberWidth: number?.width || 0, countryHeight: country?.height || 0, numberHeight: number?.height || 0 };
    });
    expect(initialLayout.countryWidth).toBeLessThan(initialLayout.numberWidth);
    expect(Math.abs(initialLayout.countryHeight - initialLayout.numberHeight)).toBeLessThanOrEqual(1);
    await phone.fill('010123');
    await phone.blur();
    await expect(error).toBeVisible();
    const afterHeight = await control.evaluate((element) => element.getBoundingClientRect().height);
    expect(Math.abs(afterHeight - beforeHeight)).toBeLessThanOrEqual(1);
    const metrics = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
        control: document.querySelector('.phone-input-control')?.getBoundingClientRect().toJSON(),
        error: document.querySelector('.phone-input-error')?.getBoundingClientRect().toJSON(),
        errorColor: getComputedStyle(document.querySelector('.phone-input-error')).color
    }));
    expect(metrics.scroll).toBeLessThanOrEqual(metrics.viewport);
    expect(metrics.control.right).toBeLessThanOrEqual(metrics.viewport + 1);
    expect(metrics.error.right).toBeLessThanOrEqual(metrics.viewport + 1);
    expect(metrics.errorColor).toMatch(/\d+/);

    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await expect(page.locator('[data-phone-country-flag] img')).toBeVisible();
    await page.locator('.phone-input-control').screenshot({ path: `qa/artifacts/phone-control-${test.info().project.name}-320-dark.png` });
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    await expect(page.locator('[data-phone-country-flag] img')).toBeVisible();
    await page.screenshot({ path: `qa/artifacts/phone-control-${test.info().project.name}-320.png`, fullPage: false });
});

test('Egypt placeholder remains the national example after async country updates and reload', async ({ page }) => {
    await page.route('**/api/phone/countries', (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(catalog)
    }));
    await page.goto('/register-gym.html', { waitUntil: 'domcontentloaded' });

    const phone = page.locator('input[name="whatsapp"]');
    const country = page.locator('select[data-phone-country]');
    await expect(country).toHaveValue('EG');
    await expect(phone).toHaveAttribute('placeholder', '1015819700');

    await country.selectOption('SA');
    await expect(phone).toHaveAttribute('placeholder', '501234567');
    await country.selectOption('AE');
    await expect(phone).toHaveAttribute('placeholder', '501234567');
    await country.selectOption('EG');
    await expect(phone).toHaveAttribute('placeholder', '1015819700');

    // Waiting is intentional test observation; production code contains no timer-based fix.
    await page.waitForTimeout(1500);
    await expect(phone).toHaveAttribute('placeholder', '1015819700');
    expect(await phone.getAttribute('placeholder')).not.toBe('20');
    expect(await phone.getAttribute('placeholder')).not.toBe('+20');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(country).toHaveValue('EG');
    await page.waitForTimeout(1500);
    await expect(phone).toHaveAttribute('placeholder', '1015819700');
});
