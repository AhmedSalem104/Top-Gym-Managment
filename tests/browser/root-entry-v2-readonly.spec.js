const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');

const viewports = [
    { width: 320, height: 760 },
    { width: 390, height: 844 },
    { width: 768, height: 900 },
    { width: 1440, height: 960 }
];

test('root public entry renders the real login surface without writes across viewport and theme matrix', async ({ page }) => {
    const writes = [];
    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
            writes.push({ method: request.method(), pathname: url.pathname });
            return route.fulfill({ status: 405, contentType: 'application/json', body: JSON.stringify({ error: 'Read-only root-entry fixture' }) });
        }
        let body = {};
        if (url.pathname === '/api/auth/session') body = { authenticated: false };
        return route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(body) });
    });

    const evidence = process.env.LOGICFIT_LOGIN_QA_DIR
        ? path.resolve(process.env.LOGICFIT_LOGIN_QA_DIR, 'root-entry-v2-readonly')
        : path.join(process.cwd(), 'qa', 'artifacts', 'root-entry-v2-readonly');
    await fs.mkdir(evidence, { recursive: true });
    const matrix = [];
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#authLoginCard')).toBeVisible();
    await expect(page.locator('#loginForm')).toBeVisible();
    // The unauthenticated `/` handler serves login.html directly. That page
    // includes the canonical entry stylesheet itself, so a root-only lazy
    // stylesheet link is not part of this response contract.
    await expect(page.locator('link[rel="stylesheet"][href*="/css/login-entry.css"]')).toHaveCount(1);

    for (const viewport of viewports) {
        await page.setViewportSize(viewport);
        for (const theme of ['light', 'dark']) {
            await page.evaluate((value) => window.TopGymTheme.set(value), theme);
            await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
            await page.evaluate(() => document.activeElement?.blur());
            for (const locale of ['ar', 'en']) {
                await page.evaluate((value) => window.TopGymI18n.set(value, { persist: false }), locale);
                await expect(page.locator('html')).toHaveAttribute('lang', locale);
                await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
                await expect(page.locator('#languageToggleButton')).toBeVisible();
                await expect(page.locator('#authLoginCard .auth-form-heading h2')).toHaveText(locale === 'ar' ? 'مرحبًا بعودتك' : 'Welcome back');
                await expect(page.locator('#authLoginCard .auth-form-heading p')).toHaveText(locale === 'ar' ? 'سجّل الدخول إلى حسابك لمتابعة عملك' : 'Sign in to your account to continue your work');
                await expect(page.locator('label[for="loginEmail"]')).toHaveText(locale === 'ar' ? 'البريد الإلكتروني' : 'Email address');
                await expect(page.locator('label[for="loginPassword"]')).toHaveText(locale === 'ar' ? 'كلمة المرور' : 'Password');
                await expect(page.locator('#loginEmail')).toHaveAttribute('placeholder', locale === 'ar' ? 'أدخل البريد الإلكتروني' : 'Enter your email address');
                await expect(page.locator('#loginPassword')).toHaveAttribute('placeholder', locale === 'ar' ? 'أدخل كلمة المرور' : 'Enter your password');
                await expect(page.locator('.auth-remember span')).toHaveText(locale === 'ar' ? 'تذكرني' : 'Remember me');
                await expect(page.locator('#authForgotHelp')).toBeVisible();
                await expect(page.locator('.auth-submit-label')).toHaveText(locale === 'ar' ? 'تسجيل الدخول' : 'Sign in');
                const measurements = await page.evaluate(() => ({
                    viewport: document.documentElement.clientWidth,
                    document: document.documentElement.scrollWidth,
                    body: document.body.scrollWidth,
                    direction: document.documentElement.dir,
                    stage: document.querySelector('#authScreen')?.dataset.authStage,
                    loginVisible: !document.querySelector('#authLoginCard')?.hidden,
                    gatewayVisible: !document.querySelector('#saasEntryCard')?.hidden,
                    actualLanguageToggle: Boolean(document.querySelector('#languageToggleButton')),
                    languageControlVisible: (() => {
                        const button = document.querySelector('#languageToggleButton');
                        if (!button) return false;
                        const rect = button.getBoundingClientRect();
                        const style = getComputedStyle(button);
                        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
                    })(),
                    authStylesheetLoaded: Boolean(document.querySelector('link[rel="stylesheet"][href*="/css/login-entry.css"]')?.sheet)
                }));
                expect(measurements.document).toBeLessThanOrEqual(viewport.width + 1);
                expect(measurements.body).toBeLessThanOrEqual(viewport.width + 1);
                expect(measurements.loginVisible).toBe(true);
                expect(measurements.stage).toBe('login');
                expect(measurements.actualLanguageToggle).toBe(true);
                expect(measurements.languageControlVisible).toBe(true);
                expect(measurements.authStylesheetLoaded).toBe(true);
                matrix.push({ width: viewport.width, height: viewport.height, theme, locale, ...measurements });
                await page.screenshot({ path: path.join(evidence, `root-${viewport.width}-${theme}-${locale}.png`), fullPage: true });
            }
        }
    }

    await page.locator('#languageToggleButton').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await page.evaluate(() => window.TopGymTheme.set('light'));
    await expect(page.locator('#languageToggleButton')).toHaveAttribute('aria-label', 'التبديل إلى الإنجليزية');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#authRegisterOpen').click();
    await expect(page.locator('#authRegistrationDialog')).toBeVisible();
    await expect(page.locator('#authRegistrationDialog a[href="/register-gym"]')).toBeVisible();
    await expect(page.locator('#authRegistrationDialog a[href="/register-trainer"]')).toBeVisible();
    await expect(page.locator('#authRegistrationDialog a[href*="member"]')).toHaveCount(0);
    await page.screenshot({ path: path.join(evidence, 'root-registration-dialog-390-light-ar.png'), fullPage: true });
    await page.keyboard.press('Escape');
    await expect(page.locator('#authRegistrationDialog')).toBeHidden();
    await page.locator('#authForgotHelp').click();
    await expect(page.locator('#authRecoveryDialog')).toBeVisible();
    await page.screenshot({ path: path.join(evidence, 'root-recovery-dialog-390-light-ar.png'), fullPage: true });
    await page.keyboard.press('Escape');
    await expect(page.locator('#authRecoveryDialog')).toBeHidden();
    await fs.writeFile(path.join(evidence, 'matrix.json'), JSON.stringify({ route: '/', state: 'unauthenticated login', readOnly: true, cells: matrix }, null, 2));

    expect(writes, 'Root entry inspection is read-only.').toEqual([]);
});
