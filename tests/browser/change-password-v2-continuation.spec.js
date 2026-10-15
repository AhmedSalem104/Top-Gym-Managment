const { test, expect } = require('@playwright/test');

const viewports = [320, 390, 768, 1440];
const themes = ['light', 'dark'];

test('forced password surface keeps V2 layout, themes, direction, and keyboard targets', async ({ page }, testInfo) => {
    const apiRequests = [];
    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;
        apiRequests.push({ method: request.method(), pathname });

        if (pathname === '/api/auth/session' && request.method() === 'GET') {
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    authenticated: true,
                    user: { id: 987654, name: 'QA Local Account', role: 'Owner', tenantType: 'gym', mustChangePassword: true }
                })
            });
        }

        // A read-only fixture: this test must never submit a password change.
        return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await page.goto('/change-password', { waitUntil: 'networkidle' });
    await expect(page.locator('[data-forced-password-surface="true"]')).toBeVisible();
    await expect(page.locator('#forceNewPassword')).toBeFocused();

    for (const width of viewports) {
        await page.setViewportSize({ width, height: width < 400 ? 844 : 900 });

        for (const theme of themes) {
            await page.evaluate((nextTheme) => window.TopGymTheme.set(nextTheme), theme);
            await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
            await expect(page.locator('[data-forced-password-surface="true"]')).toBeVisible();

            const layout = await page.evaluate(() => {
                const shell = document.querySelector('.password-change-shell');
                const card = document.querySelector('.password-change-card');
                const toggle = document.querySelector('.password-change-toggle');
                const rect = card.getBoundingClientRect();
                const toggleRect = toggle.getBoundingClientRect();
                return {
                    viewportWidth: window.innerWidth,
                    documentWidth: document.documentElement.scrollWidth,
                    bodyWidth: document.body.scrollWidth,
                    cardLeft: rect.left,
                    cardRight: rect.right,
                    shellWidth: shell.getBoundingClientRect().width,
                    toggleWidth: toggleRect.width,
                    toggleHeight: toggleRect.height,
                    direction: document.documentElement.dir,
                    inputDirection: getComputedStyle(document.querySelector('#forceNewPassword')).direction
                };
            });

            expect(layout.documentWidth, `document overflow at ${width}px ${theme}`).toBeLessThanOrEqual(width);
            expect(layout.bodyWidth, `body overflow at ${width}px ${theme}`).toBeLessThanOrEqual(width);
            expect(layout.cardLeft, `card clipped at ${width}px ${theme}`).toBeGreaterThanOrEqual(0);
            expect(layout.cardRight, `card clipped at ${width}px ${theme}`).toBeLessThanOrEqual(width);
            expect(layout.toggleWidth).toBeGreaterThanOrEqual(44);
            expect(layout.toggleHeight).toBeGreaterThanOrEqual(44);
            expect(layout.direction).toBe('rtl');
            expect(layout.inputDirection).toBe('ltr');

            // Bootstrap focuses the first field. Tab should expose a visible keyboard ring
            // on the adjacent password-visibility control.
            await page.locator('#forceNewPassword').focus();
            await page.keyboard.press('Tab');
            const focusState = await page.locator('[data-password-toggle="forceNewPassword"]').evaluate((button) => ({
                focused: document.activeElement === button,
                outlineStyle: getComputedStyle(button).outlineStyle,
                outlineWidth: getComputedStyle(button).outlineWidth
            }));
            expect(focusState.focused, `password visibility control is keyboard reachable at ${width}px ${theme}`).toBe(true);
            expect(focusState.outlineStyle).not.toBe('none');
            expect(parseFloat(focusState.outlineWidth)).toBeGreaterThanOrEqual(3);

            await page.screenshot({
                path: testInfo.outputPath(`change-password-${width}-${theme}.png`),
                fullPage: true
            });

            await page.locator('[data-theme-toggle]').click();
            const nextTheme = theme === 'dark' ? 'light' : 'dark';
            await expect(page.locator('html')).toHaveAttribute('data-theme', nextTheme);
            expect(await page.evaluate(() => localStorage.getItem('topgym-theme'))).toBe(nextTheme);
        }
    }

    expect(apiRequests.filter(({ method, pathname }) => method !== 'GET' || pathname !== '/api/auth/session')).toEqual([]);
});
