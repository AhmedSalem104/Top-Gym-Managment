const { test, expect } = require('@playwright/test');

test('platform access-denied page localizes without writes across themes and viewport sizes', async ({ page }) => {
    const mutationRequests = [];
    await page.route('**/*', async (route) => {
        const request = route.request();
        if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
            mutationRequests.push({ method: request.method(), url: request.url() });
        }
        await route.continue();
    });

    // This is a presentation test for the static forbidden surface. The
    // authenticated server-side role gate is verified separately; without a
    // server-issued non-PlatformAdmin session `/platform-admin` correctly
    // serves the login flow instead of this page.
    const response = await page.goto('/platform-admin-forbidden.html');
    expect(response?.status()).toBe(200);
    await page.waitForFunction(() => Boolean(window.TopGymI18n));

    const expectedCopy = {
        ar: {
            title: 'هذه المساحة مخصصة لمدير المنصة',
            description: 'حسابات مالك الجيم والمساعد تستخدم تطبيق الجيم من المسار الرئيسي.',
            returnToGym: 'العودة إلى تطبيق الجيم',
            switchAccount: 'تسجيل الخروج والدخول كمدير للمنصة'
        },
        en: {
            title: 'This area is for platform administrators',
            description: 'Gym Owner and Assistant accounts must use the gym application from its main route.',
            returnToGym: 'Return to the gym app',
            switchAccount: 'Sign out and sign in as a platform administrator'
        }
    };

    for (const width of [320, 390, 768, 1440]) {
        const height = width === 320 ? 568 : width < 768 ? 844 : 900;
        await page.setViewportSize({ width, height });

        for (const locale of ['ar', 'en']) {
            for (const theme of ['light', 'dark']) {
                await page.locator('html').evaluate((html, value) => {
                    html.dataset.theme = value.theme;
                    window.TopGymI18n.set(value.locale, { persist: false });
                }, { locale, theme });

                const copy = expectedCopy[locale];
                await expect(page.locator('html')).toHaveAttribute('lang', locale);
                await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
                await expect.poll(() => page.title()).toBe(locale === 'ar' ? 'غير مصرح | Logic Fit' : 'Access denied | Logic Fit');
                await expect(page.locator('.platform-forbidden-card .eyebrow')).toHaveText(locale === 'ar' ? 'لإدارة المنصة فقط' : 'PLATFORM ADMIN ONLY');
                await expect(page.locator('.platform-forbidden-card h1')).toHaveText(copy.title);
                await expect(page.locator('.platform-forbidden-card p')).toHaveText(copy.description);
                await expect(page.locator('.platform-forbidden-actions a')).toHaveText(copy.returnToGym);
                await expect(page.locator('#platformAdminSwitchAccount')).toHaveText(copy.switchAccount);
                await expect(page.locator('.platform-forbidden-actions a')).toHaveAttribute('href', '/');
                await expect(page.locator('#platformAdminSwitchAccount')).toBeEnabled();

                const languageButton = page.locator('#languageToggleButton');
                await expect(languageButton).toBeVisible();
                await expect(languageButton).toHaveAccessibleName(locale === 'ar' ? 'التبديل إلى الإنجليزية' : 'Switch to Arabic');

                const dimensions = await page.evaluate(() => ({
                    viewport: document.documentElement.clientWidth,
                    document: document.documentElement.scrollWidth,
                    body: document.body.scrollWidth,
                    card: document.querySelector('.platform-forbidden-card').getBoundingClientRect().toJSON()
                }));
                expect(dimensions.document, JSON.stringify({ width, locale, theme, dimensions })).toBeLessThanOrEqual(width);
                expect(dimensions.body, JSON.stringify({ width, locale, theme, dimensions })).toBeLessThanOrEqual(width);
                expect(dimensions.card.width).toBeGreaterThan(0);
                expect(dimensions.card.left).toBeGreaterThanOrEqual(0);
                expect(dimensions.card.right).toBeLessThanOrEqual(width);

                await page.screenshot({
                    path: `qa/artifacts/platform-admin-forbidden-i18n/${width}-${locale}-${theme}.png`,
                    fullPage: true
                });
            }
        }
    }

    expect(mutationRequests).toEqual([]);
});
