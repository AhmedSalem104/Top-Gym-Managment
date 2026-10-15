const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');

const CASES = [
    { width: 320, height: 700 },
    { width: 390, height: 844 },
    { width: 768, height: 900 },
    { width: 1440, height: 900 }
];
const OUTPUT = path.resolve(__dirname, '../../qa/artifacts/login-i18n-central');

test('Login uses central Arabic/English i18n across responsive themes without auth writes', async ({ page }) => {
    test.setTimeout(150_000);
    const blockedWrites = [];
    await page.route('**/*', async (route) => {
        const request = route.request();
        if (!['GET', 'HEAD'].includes(request.method())) {
            blockedWrites.push({ method: request.method(), url: request.url() });
            return route.fulfill({ status: 405, body: 'Read-only Login i18n QA' });
        }
        return route.continue();
    });
    await fs.mkdir(OUTPUT, { recursive: true });
    await page.goto('/login.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#authLoginCard')).toBeVisible();
    await expect(page.locator('#loginForm')).toBeVisible();
    await expect(page.locator('#languageToggleButton')).toBeVisible();
    await expect.poll(() => page.evaluate(() => Boolean(window.TopGymI18n))).toBe(true);
    await page.evaluate(() => window.TopGymI18n.set('ar', { persist: false }));

    const formContract = await page.evaluate(() => ({
        action: document.querySelector('#loginForm').getAttribute('action'),
        method: document.querySelector('#loginForm').getAttribute('method'),
        ids: ['loginForm', 'loginEmail', 'loginPassword', 'loginRememberMe', 'loginPasswordToggle', 'loginSubmit', 'loginMessage', 'authForgotHelp', 'authRegisterOpen'].map((id) => Boolean(document.getElementById(id))),
        emailType: document.querySelector('#loginEmail').type,
        passwordType: document.querySelector('#loginPassword').type,
        rememberType: document.querySelector('#loginRememberMe').type,
        submitType: document.querySelector('#loginSubmit').type
    }));
    expect(formContract).toEqual({
        action: null,
        method: null,
        ids: Array(9).fill(true),
        emailType: 'email',
        passwordType: 'password',
        rememberType: 'checkbox',
        submitType: 'submit'
    });

    await page.locator('#loginRememberMe').check();
    await expect(page.locator('#loginRememberMe')).toBeChecked();
    await page.locator('#loginRememberMe').uncheck();
    await page.locator('#loginPasswordToggle').click();
    await expect(page.locator('#loginPassword')).toHaveAttribute('type', 'text');
    await expect(page.locator('#loginPasswordToggle')).toHaveAttribute('aria-label', 'إخفاء كلمة المرور');
    await page.locator('#loginPasswordToggle').click();
    await expect(page.locator('#loginPassword')).toHaveAttribute('type', 'password');
    const themeBefore = await page.locator('html').getAttribute('data-theme');
    await page.locator('[data-theme-toggle]').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', themeBefore === 'dark' ? 'light' : 'dark');
    await page.locator('[data-theme-toggle]').click();

    // Exercise the same central annotation path used by Login feedback without
    // submitting credentials or invoking any authentication endpoint.
    await page.evaluate(() => {
        const error = document.getElementById('loginMessage');
        error.textContent = 'أدخل البريد الإلكتروني وكلمة المرور.';
        error.hidden = false;
        window.TopGymI18n.annotateText(error, 'login.error.');
    });

    for (const viewport of CASES) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.evaluate(() => document.fonts.ready);
        for (const theme of ['light', 'dark']) {
            await page.evaluate((value) => window.TopGymTheme.set(value), theme);
            for (const locale of ['ar', 'en']) {
                const activeLocale = await page.evaluate(() => window.TopGymI18n.get());
                if (activeLocale !== locale) await page.locator('#languageToggleButton').click();
                await expect(page.locator('html')).toHaveAttribute('lang', locale);
                await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
                await expect(page.locator('.auth-form-heading h2')).toHaveText(locale === 'ar' ? 'مرحبًا بعودتك' : 'Welcome back');
                await expect(page.locator('label[for="loginEmail"]')).toHaveText(locale === 'ar' ? 'البريد الإلكتروني' : 'Email address');
                await expect(page.locator('label[for="loginPassword"]')).toHaveText(locale === 'ar' ? 'كلمة المرور' : 'Password');
                await expect(page.locator('#loginEmail')).toHaveAttribute('placeholder', locale === 'ar' ? 'أدخل البريد الإلكتروني' : 'Enter your email address');
                await expect(page.locator('#loginMessage')).toHaveText(locale === 'ar' ? 'أدخل البريد الإلكتروني وكلمة المرور.' : 'Enter your email address and password.');
                await expect(page.locator('#authRegisterOpen')).toHaveText(locale === 'ar' ? 'إنشاء حساب جديد' : 'Create a new account');
                await expect(page.locator('.auth-reference-features article').first()).toContainText(locale === 'ar' ? 'إدارة متكاملة' : 'Complete management');
                await expect(page.locator('#loginPasswordToggle')).toHaveAttribute('aria-label', locale === 'ar' ? 'إظهار كلمة المرور' : 'Show password');

                const layout = await page.evaluate(() => {
                    const root = document.documentElement;
                    const body = document.body;
                    const panel = document.querySelector('.auth-form-panel');
                    const language = document.getElementById('languageToggleButton');
                    const button = document.getElementById('loginSubmit');
                    return {
                        viewport: innerWidth,
                        document: root.scrollWidth,
                        body: body.scrollWidth,
                        theme: root.dataset.theme,
                        locale: root.lang,
                        direction: root.dir,
                        bodyFont: getComputedStyle(body).fontFamily,
                        headingFont: getComputedStyle(document.querySelector('.auth-form-heading h2')).fontFamily,
                        panel: panel.getBoundingClientRect().toJSON(),
                        language: language.getBoundingClientRect().toJSON(),
                        submit: button.getBoundingClientRect().toJSON()
                    };
                });
                const label = `${viewport.width}/${theme}/${locale}: ${JSON.stringify(layout)}`;
                expect(layout.document, `${label} document overflow`).toBeLessThanOrEqual(viewport.width + 1);
                expect(layout.body, `${label} body overflow`).toBeLessThanOrEqual(viewport.width + 1);
                expect(layout.theme).toBe(theme);
                expect(layout.locale).toBe(locale);
                expect(layout.direction).toBe(locale === 'ar' ? 'rtl' : 'ltr');
                expect(layout.bodyFont).toContain(locale === 'ar' ? 'Tajawal' : 'Geist Variable');
                expect(layout.headingFont).toContain(locale === 'ar' ? 'Tajawal' : 'Geist Variable');
                expect(layout.language.width).toBeGreaterThanOrEqual(44);
                expect(layout.language.height).toBeGreaterThanOrEqual(44);
                expect(layout.submit.left).toBeGreaterThanOrEqual(0);
                expect(layout.submit.right).toBeLessThanOrEqual(viewport.width + 1);
                await page.evaluate(() => document.fonts.ready);
                await page.screenshot({
                    path: path.join(OUTPUT, `login-${viewport.width}-${theme}-${locale}.png`),
                    fullPage: true
                });
            }
        }
    }

    for (const locale of ['ar', 'en']) {
        const activeLocale = await page.evaluate(() => window.TopGymI18n.get());
        if (activeLocale !== locale) await page.locator('#languageToggleButton').click();
        await page.locator('#authRegisterOpen').click();
        await expect(page.locator('#authRegistrationDialog')).toBeVisible();
        await expect(page.locator('#authRegistrationTitle')).toHaveText(locale === 'ar' ? 'كيف ستستخدم Logic Fit؟' : 'How will you use Logic Fit?');
        await expect(page.locator('#authRegistrationDialog a[href="/register-gym"] strong')).toHaveText(locale === 'ar' ? 'منصة جيم' : 'Gym platform');
        await expect(page.locator('#authRegistrationDialog .auth-choice-close')).toHaveAttribute('aria-label', locale === 'ar' ? 'إغلاق' : 'Close');
        await page.locator('#authRegistrationDialog .auth-choice-close').click();
        await page.locator('#authForgotHelp').click();
        await expect(page.locator('#authRecoveryDialog')).toBeVisible();
        await expect(page.locator('#authRecoveryTitle')).toHaveText(locale === 'ar' ? 'استعادة الوصول' : 'Recover access');
        await expect(page.locator('#authRecoveryDialog .auth-dialog-confirm')).toHaveText(locale === 'ar' ? 'حسنًا' : 'Got it');
        await page.locator('#authRecoveryDialog .auth-choice-close').click();
    }

    // Capture the two secondary auth surfaces at opposite responsive ends;
    // the main screen already covers the complete viewport/theme/locale grid.
    const dialogCases = [
        { width: 320, height: 700, theme: 'dark', locale: 'ar' },
        { width: 1440, height: 900, theme: 'light', locale: 'en' }
    ];
    for (const state of dialogCases) {
        await page.setViewportSize({ width: state.width, height: state.height });
        await page.evaluate((theme) => window.TopGymTheme.set(theme), state.theme);
        await page.evaluate((locale) => window.TopGymI18n.set(locale, { persist: false }), state.locale);
        for (const dialog of ['registration', 'recovery']) {
            const trigger = dialog === 'registration' ? '#authRegisterOpen' : '#authForgotHelp';
            const selector = dialog === 'registration' ? '#authRegistrationDialog' : '#authRecoveryDialog';
            await page.locator(trigger).click();
            const surface = page.locator(selector);
            await expect(surface).toBeVisible();
            const bounds = await surface.boundingBox();
            expect(bounds, `${state.width}/${state.theme}/${state.locale}/${dialog}: dialog bounds`).not.toBeNull();
            expect(bounds.x).toBeGreaterThanOrEqual(0);
            expect(bounds.y).toBeGreaterThanOrEqual(0);
            expect(bounds.x + bounds.width).toBeLessThanOrEqual(state.width + 1);
            expect(bounds.y + bounds.height).toBeLessThanOrEqual(state.height + 1);
            await page.screenshot({
                path: path.join(OUTPUT, `login-${dialog}-dialog-${state.width}-${state.theme}-${state.locale}.png`),
                fullPage: true
            });
            await page.keyboard.press('Escape');
            await expect(surface).toBeHidden();
        }
    }

    expect(blockedWrites, 'Read-only Login QA must not issue non-GET/HEAD requests.').toEqual([]);
});
