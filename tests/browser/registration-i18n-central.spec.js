const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');

const routes = [
    { path: '/register-gym.html', kind: 'gym' },
    { path: '/register-trainer.html', kind: 'trainer' }
];
const viewports = [
    { width: 320, height: 720 },
    { width: 390, height: 844 },
    { width: 768, height: 900 },
    { width: 1440, height: 1000 }
];
const themes = ['light', 'dark'];
const locales = ['ar', 'en'];
const catalog = {
    plans: [{
        code: 'readonly-plan', name: 'Fixture plan', description: 'Synthetic fixture description', maxMembers: 25,
        terms: [{ code: 'monthly', durationMonths: 1, price: 100, currency: 'EGP', isActive: true }]
    }],
    paymentMethods: [{ methodCode: 'readonly-transfer', displayName: 'Fixture transfer', accountReference: '0000000000', recipientName: 'Fixture recipient', instructions: 'Read-only fixture', isActive: true }]
};

async function installReadOnlyFixtures(page) {
    const writes = [];
    await page.route('**/*', async (route) => {
        const request = route.request();
        const method = request.method().toUpperCase();
        const url = new URL(request.url());
        if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
            writes.push({ method, pathname: url.pathname });
            return route.fulfill({ status: 405, contentType: 'application/json', body: JSON.stringify({ error: 'Read-only registration test fixture' }) });
        }
        if (url.pathname === '/api/phone/countries') {
            return route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify({ countries: [{ country: 'Egypt', isoCode: 'EG', dialCode: '+20', exampleNational: '01015819700', exampleInternational: '+201015819700', validLengths: [10], mobileRules: { supported: true, validLengths: [10], nationalPattern: '1[0-25]\\d{8}', localPrefix: '0' } }] }) });
        }
        if (url.pathname === '/api/public/gym-registration/catalog' || url.pathname === '/api/public/trainer-registration/catalog') {
            return route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(catalog) });
        }
        if (url.pathname.startsWith('/api/')) {
            return route.fulfill({ status: 404, contentType: 'application/json; charset=utf-8', body: JSON.stringify({ error: 'Not included in read-only fixture' }) });
        }
        return route.continue();
    });
    return writes;
}

async function setInitialPreferences(page, { locale, theme }) {
    await page.addInitScript(({ localeValue, themeValue }) => {
        localStorage.setItem('logic-fit-ui-locale', localeValue);
        localStorage.setItem('topgym-theme', themeValue);
    }, { localeValue: locale, themeValue: theme });
}

async function expectNoOverflow(page, width) {
    const dimensions = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        document: document.documentElement.scrollWidth,
        body: document.body.scrollWidth
    }));
    expect(dimensions.document, JSON.stringify(dimensions)).toBeLessThanOrEqual(width + 1);
    expect(dimensions.body, JSON.stringify(dimensions)).toBeLessThanOrEqual(width + 1);
}

async function captureRepresentativeStep(page, route, viewport, theme, locale, step) {
    const shouldCapture = (viewport.width === 320 && theme === 'dark' && locale === 'ar')
        || (viewport.width === 1440 && theme === 'light' && locale === 'en');
    if (!shouldCapture) return;
    const directory = path.resolve(process.cwd(), 'qa/artifacts/registration-v2-all-steps');
    await fs.mkdir(directory, { recursive: true });
    await page.screenshot({
        path: path.join(directory, `${route.kind}-${viewport.width}-${theme}-${locale}-step-${step}.png`),
        fullPage: true,
        animations: 'disabled'
    });
}

for (const route of routes) {
    for (const viewport of viewports) {
        for (const theme of themes) {
            for (const locale of locales) {
                test(`${route.kind} registration central i18n ${viewport.width}px ${theme} ${locale}`, async ({ page }, testInfo) => {
                    const writes = await installReadOnlyFixtures(page);
                    await setInitialPreferences(page, { locale, theme });
                    await page.setViewportSize(viewport);
                    await page.goto(route.path, { waitUntil: 'domcontentloaded' });

                    await expect(page.locator('#registrationTitle')).toBeVisible();
                    await expect(page.locator('html')).toHaveAttribute('lang', locale);
                    await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
                    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
                    await expect(page.locator('.registration-aside')).toHaveCSS('direction', locale === 'ar' ? 'rtl' : 'ltr');
                    await expect(page.locator('.registration-card')).toHaveCSS('direction', locale === 'ar' ? 'rtl' : 'ltr');
                    await expect(page.locator('#registrationStageLabel')).toHaveText(await page.evaluate(() => window.TopGymI18n.t('registration.stageLabel', { step: '01' })));
                    await expect(page.locator('.registration-type-switch a[href="/register-gym"]')).toBeVisible();
                    await expect(page.locator('.registration-type-switch a[href="/register-trainer"]')).toBeVisible();
                    await expect(page).toHaveURL(new RegExp(`${route.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
                    await expectNoOverflow(page, viewport.width);
                    await captureRepresentativeStep(page, route, viewport, theme, locale, 1);

                    const expectedStepOneError = await page.evaluate(() => window.TopGymI18n.t('registration.validation.required'));
                    await page.locator('#registrationNext').click();
                    await expect(page.locator('#registrationError')).toHaveText(expectedStepOneError);

                    const entered = {
                        brand: route.kind === 'gym' ? 'QA Gym Fixture' : 'QA Trainer Fixture',
                        owner: 'Read-only owner',
                        phone: '01015819700',
                        email: 'registration-fixture@example.invalid'
                    };
                    await page.locator('input[name="gymName"]').fill(entered.brand);
                    await page.locator('input[name="ownerName"]').fill(entered.owner);
                    await page.locator('input[name="whatsapp"]').fill(entered.phone);
                    await page.locator('input[name="email"]').fill(entered.email);
                    await page.locator('#registrationNext').click();
                    await expect(page.locator('[data-registration-step="2"]')).toBeVisible();
                    await captureRepresentativeStep(page, route, viewport, theme, locale, 2);

                    await page.locator('#registrationNext').click();
                    await expect(page.locator('#registrationError')).toHaveText(await page.evaluate(() => window.TopGymI18n.t('registration.validation.plan')));
                    await page.locator('.registration-plan-option').first().click();
                    await page.locator('#registrationNext').click();
                    await expect(page.locator('[data-registration-step="3"]')).toBeVisible();

                    const selectedTerm = page.locator('.registration-term-option').first();
                    await selectedTerm.click();
                    await captureRepresentativeStep(page, route, viewport, theme, locale, 3);
                    const beforeLocaleChange = await page.evaluate(() => ({
                        path: location.pathname,
                        step: document.querySelector('[data-step-indicator="3"]').getAttribute('aria-current'),
                        fields: ['gymName', 'ownerName', 'whatsapp', 'email'].map((name) => document.querySelector(`[name="${name}"]`).value),
                        plan: document.querySelector('[name="registrationPlan"]:checked')?.value,
                        term: document.querySelector('[name="registrationTerm"]:checked')?.value
                    }));
                    await page.locator('[data-locale-toggle]').click();
                    const switchedLocale = locale === 'ar' ? 'en' : 'ar';
                    await expect(page.locator('html')).toHaveAttribute('lang', switchedLocale);
                    await expect(page.locator('html')).toHaveAttribute('dir', switchedLocale === 'ar' ? 'rtl' : 'ltr');
                    await expect(page.locator('[data-registration-step="3"]')).toBeVisible();
                    const afterLocaleChange = await page.evaluate(() => ({
                        path: location.pathname,
                        step: document.querySelector('[data-step-indicator="3"]').getAttribute('aria-current'),
                        fields: ['gymName', 'ownerName', 'whatsapp', 'email'].map((name) => document.querySelector(`[name="${name}"]`).value),
                        plan: document.querySelector('[name="registrationPlan"]:checked')?.value,
                        term: document.querySelector('[name="registrationTerm"]:checked')?.value
                    }));
                    expect(afterLocaleChange).toEqual(beforeLocaleChange);
                    await page.locator('[data-locale-toggle]').click();
                    await expect(page.locator('html')).toHaveAttribute('lang', locale);

                    await page.locator('#registrationNext').click();
                    await expect(page.locator('[data-registration-step="4"]')).toBeVisible();
                    await captureRepresentativeStep(page, route, viewport, theme, locale, 4);
                    await page.locator('#registrationNext').click();
                    await expect(page.locator('#registrationError')).toHaveText(await page.evaluate(() => window.TopGymI18n.t('registration.validation.paymentMethod')));
                    await page.locator('.registration-payment-option').first().click();
                    await page.locator('#registrationNext').click();
                    await expect(page.locator('[data-registration-step="5"]')).toBeVisible();
                    await captureRepresentativeStep(page, route, viewport, theme, locale, 5);
                    await page.locator('#registrationNext').click();
                    await expect(page.locator('#registrationError')).toHaveText(await page.evaluate(() => window.TopGymI18n.t('registration.validation.paymentProof')));
                    await page.locator('#registrationProof').setInputFiles({
                        name: 'read-only-fixture.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 synthetic fixture')
                    });
                    await page.locator('#registrationNext').click();
                    await expect(page.locator('[data-registration-step="6"]')).toBeVisible();
                    await captureRepresentativeStep(page, route, viewport, theme, locale, 6);
                    await expect(page.locator('#registrationSuccess')).toBeHidden();
                    await expect(page.locator('#registrationNext')).toContainText(await page.evaluate(() => window.TopGymI18n.t('registration.actions.submit')));
                    const phoneReview = await page.locator('.registration-review-row').evaluateAll((rows) => {
                        const row = rows.find((entry) => /WhatsApp|واتساب/i.test(entry.querySelector('span')?.textContent || ''));
                        return row ? { text: row.querySelector('strong')?.textContent, dir: row.querySelector('strong')?.getAttribute('dir') } : null;
                    });
                    expect(phoneReview?.dir).toBe('ltr');
                    expect(phoneReview?.text.replace(/\s+/gu, '')).toBe(entered.phone);
                    await expectNoOverflow(page, viewport.width);

                    await page.screenshot({ path: testInfo.outputPath(`${route.kind}-${viewport.width}-${theme}-${locale}-step6.png`), fullPage: true });
                    expect(writes, 'All POST/PUT/PATCH/DELETE and other non-read requests must be blocked.').toEqual([]);
                });
            }
        }
    }
}

for (const locale of locales) {
    test(`registration phone validation re-localizes without changing the invalid value (${locale})`, async ({ page }) => {
        const writes = await installReadOnlyFixtures(page);
        await setInitialPreferences(page, { locale, theme: 'light' });
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto('/register-gym.html', { waitUntil: 'domcontentloaded' });
        await page.locator('input[name="gymName"]').fill('QA Gym Fixture');
        await page.locator('input[name="ownerName"]').fill('Read-only owner');
        await page.locator('input[name="whatsapp"]').fill('010123');
        await page.locator('input[name="email"]').fill('registration-fixture@example.invalid');
        await page.locator('#registrationNext').click();

        const phoneInput = page.locator('input[name="whatsapp"]');
        const phoneError = page.locator('.phone-input-error');
        const phoneHelper = page.locator('.phone-input-help');
        await expect(phoneError).toBeVisible();
        await expect(phoneHelper).toHaveText(await page.evaluate(() => window.TopGymI18n.t('registration.phone.help')));
        const originalDigits = (await phoneInput.inputValue()).replace(/\D/gu, '');
        const originalMessage = await page.evaluate(() => window.TopGymI18n.t('registration.phone.length'));
        await expect(phoneError).toHaveText(originalMessage);

        await page.locator('[data-locale-toggle]').click();
        const switchedMessage = await page.evaluate(() => window.TopGymI18n.t('registration.phone.length'));
        await expect(phoneError).toHaveText(switchedMessage);
        await expect(phoneHelper).toHaveText(await page.evaluate(() => window.TopGymI18n.t('registration.phone.help')));
        expect((await phoneInput.inputValue()).replace(/\D/gu, '')).toBe(originalDigits);
        expect(await phoneInput.getAttribute('aria-invalid')).toBe('true');
        expect(writes).toEqual([]);
    });
}
