const { test, expect } = require('@playwright/test');

const widths = [320, 390, 768, 1440];
const themes = ['light', 'dark'];
const locales = [
    { code: 'ar', direction: 'rtl', title: 'أنشئ كلمة مرورك الجديدة', submit: 'حفظ كلمة المرور والمتابعة', mismatch: 'كلمتا المرور غير متطابقتين.' },
    { code: 'en', direction: 'ltr', title: 'Create your new password', submit: 'Save password and continue', mismatch: 'The passwords do not match.' }
];

test('forced password page uses central i18n while keeping its auth flow and password state unchanged', async ({ page }, testInfo) => {
    const requests = [];
    let returnApiError = false;
    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;
        requests.push({ method: request.method(), pathname });
        if (pathname === '/api/auth/session' && request.method() === 'GET') {
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ authenticated: true, user: { id: 987654, name: 'Local QA Account', role: 'Owner', tenantType: 'gym', mustChangePassword: true } })
            });
        }
        if (pathname === '/api/auth/change-password' && request.method() === 'POST' && returnApiError) {
            return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'fixture error', code: 'PASSWORD_CONFIRMATION_MISMATCH' }) });
        }
        return route.fulfill({ status: 405, contentType: 'application/json', body: JSON.stringify({ error: 'Read-only QA fixture.' }) });
    });

    await page.goto('/change-password', { waitUntil: 'networkidle' });
    await expect(page.locator('[data-forced-password-surface="true"]')).toBeVisible();
    await expect(page.locator('#forceNewPassword')).toBeFocused();

    for (const width of widths) {
        await page.setViewportSize({ width, height: width < 400 ? 844 : 900 });
        for (const theme of themes) {
            await page.evaluate((value) => window.TopGymTheme.set(value), theme);
            for (const locale of locales) {
                await page.evaluate((value) => window.TopGymI18n.set(value), locale.code);
                await expect(page.locator('html')).toHaveAttribute('lang', locale.code);
                await expect(page.locator('html')).toHaveAttribute('dir', locale.direction);
                await expect(page.locator('#passwordChangeTitle')).toHaveText(locale.title);
                await expect(page.locator('#passwordChangeSubmit')).toContainText(locale.submit);
                await expect(page.locator('#passwordChangeIdentity')).toContainText(locale.code === 'ar' ? 'الحساب:' : 'Account:');
                await expect(page.locator('[data-locale-toggle]')).toBeVisible();
                await expect(page.locator('[data-theme-toggle]')).toBeVisible();

                await page.locator('#forceNewPassword').fill('12345678');
                await page.locator('#forceConfirmPassword').fill('different1');
                await page.locator('#forcedPasswordChangeForm').evaluate((form) => form.requestSubmit());
                await expect(page.locator('#passwordChangeMessage')).toHaveText(locale.mismatch);
                await expect(page.locator('#forceNewPassword')).toHaveValue('12345678');
                await expect(page.locator('#forceConfirmPassword')).toHaveValue('different1');

                const alternateLocale = locales.find((candidate) => candidate.code !== locale.code);
                await page.evaluate((value) => window.TopGymI18n.set(value), alternateLocale.code);
                await expect(page.locator('#passwordChangeMessage')).toHaveText(alternateLocale.mismatch);
                await expect(page.locator('#passwordChangeIdentity')).toContainText(alternateLocale.code === 'ar' ? 'الحساب:' : 'Account:');
                await page.evaluate((value) => window.TopGymI18n.set(value), locale.code);
                await expect(page.locator('#passwordChangeMessage')).toHaveText(locale.mismatch);

                const dimensions = await page.evaluate(() => ({
                    viewport: window.innerWidth,
                    html: document.documentElement.scrollWidth,
                    body: document.body.scrollWidth,
                    card: document.querySelector('.password-change-card').getBoundingClientRect().toJSON()
                }));
                expect(dimensions.html).toBeLessThanOrEqual(width);
                expect(dimensions.body).toBeLessThanOrEqual(width);
                expect(dimensions.card.left).toBeGreaterThanOrEqual(0);
                expect(dimensions.card.right).toBeLessThanOrEqual(width);

                if (width === 320 || width === 1440) {
                    await page.screenshot({
                        path: testInfo.outputPath(`change-password-${width}-${theme}-${locale.code}.png`),
                        fullPage: true
                    });
                }
            }
        }
    }

    await page.evaluate(() => window.TopGymI18n.set('en'));
    await page.locator('#forceNewPassword').fill('SafeLocalPassword123!');
    await page.locator('#forceConfirmPassword').fill('SafeLocalPassword123!');
    returnApiError = true;
    await page.locator('#forcedPasswordChangeForm').evaluate((form) => form.requestSubmit());
    await expect(page.locator('#passwordChangeMessage')).toHaveText('The passwords do not match.');
    await expect(page.locator('#passwordChangeSubmit')).toBeEnabled();
    await page.evaluate(() => window.TopGymI18n.set('ar'));
    await expect(page.locator('#passwordChangeMessage')).toHaveText('كلمتا المرور غير متطابقتين.');

    expect(requests.filter(({ method, pathname }) => method !== 'GET' || pathname !== '/api/auth/session')).toEqual([
        { method: 'POST', pathname: '/api/auth/change-password' }
    ]);
});
