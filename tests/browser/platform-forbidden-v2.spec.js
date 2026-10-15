const { test, expect } = require('@playwright/test');

test('platform forbidden page remains readable and contained across themes and responsive widths', async ({ page }, testInfo) => {
    await page.goto('/platform-admin-forbidden');
    await expect(page.locator('.platform-forbidden-card h1')).toBeVisible();

    const widths = testInfo.project.name === 'desktop'
        ? [1920, 1440, 1024, 768, 430, 390, 360, 320]
        : [page.viewportSize().width];

    for (const width of widths) {
        const height = width <= 320 ? 568 : width < 768 ? 844 : 900;
        await page.setViewportSize({ width, height });
        for (const theme of ['light', 'dark']) {
            await page.locator('html').evaluate((element, value) => {
                element.dataset.theme = value;
            }, theme);
            await page.waitForTimeout(250);
            await page.screenshot({
                path: `qa/artifacts/platform-forbidden-${width}-${theme}.png`,
                fullPage: true
            });

            const layout = await page.evaluate(() => {
            const card = document.querySelector('.platform-forbidden-card');
            const heading = card.querySelector('h1');
            const actions = [...card.querySelectorAll('.platform-forbidden-actions > *')];
            const rect = card.getBoundingClientRect();
            const secondaryStyle = getComputedStyle(actions[0]);
            const rgb = (value) => value.match(/[\d.]+/gu).slice(0, 3).map(Number).map((channel) => {
                const normalized = channel / 255;
                return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
            });
            const [backgroundR, backgroundG, backgroundB] = rgb(secondaryStyle.backgroundColor);
            const [foregroundR, foregroundG, foregroundB] = rgb(secondaryStyle.color);
            const backgroundLuminance = 0.2126 * backgroundR + 0.7152 * backgroundG + 0.0722 * backgroundB;
            const foregroundLuminance = 0.2126 * foregroundR + 0.7152 * foregroundG + 0.0722 * foregroundB;
            const secondaryContrast = (Math.max(backgroundLuminance, foregroundLuminance) + 0.05)
                / (Math.min(backgroundLuminance, foregroundLuminance) + 0.05);
            return {
                viewportWidth: innerWidth,
                documentWidth: document.documentElement.scrollWidth,
                cardLeft: rect.left,
                cardRight: rect.right,
                cardWidth: rect.width,
                headingHeight: heading.getBoundingClientRect().height,
                actionHeights: actions.map((action) => action.getBoundingClientRect().height),
                actionWidths: actions.map((action) => action.getBoundingClientRect().width),
                background: getComputedStyle(card).backgroundColor,
                secondaryActionBackground: secondaryStyle.backgroundColor,
                secondaryActionForeground: secondaryStyle.color,
                elevatedToken: getComputedStyle(document.documentElement).getPropertyValue('--bg-elevated').trim(),
                primaryTextToken: getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim(),
                secondaryContrast
            };
            });

            expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
            expect(layout.cardLeft).toBeGreaterThanOrEqual(0);
            expect(layout.cardRight).toBeLessThanOrEqual(layout.viewportWidth);
            expect(layout.cardWidth).toBeGreaterThan(0);
            expect(layout.actionHeights).toHaveLength(2);
            const expectedTarget = layout.viewportWidth < 768 ? 44 : 40;
            expect(layout.actionHeights.every((actionHeight) => actionHeight >= expectedTarget)).toBe(true);
            expect(layout.actionWidths[0]).toBe(layout.actionWidths[1]);
            expect(layout.background).not.toBe('rgba(0, 0, 0, 0)');
            if (theme === 'dark') {
                expect(layout.secondaryContrast, JSON.stringify(layout)).toBeGreaterThanOrEqual(4.5);
            }
        }
    }
});

test('platform account switch action logs out then opens the platform sign-in route', async ({ page }) => {
    let logoutCalls = 0;
    await page.route('**/api/auth/logout', async (route) => {
        logoutCalls += 1;
        await route.fulfill({ status: 204, body: '' });
    });
    await page.goto('/platform-admin-forbidden');
    await page.getByRole('button', { name: 'تسجيل الخروج والدخول كمدير للمنصة' }).click();
    await expect(page).toHaveURL(/\/platform-admin$/u);
    expect(logoutCalls).toBe(1);
});
