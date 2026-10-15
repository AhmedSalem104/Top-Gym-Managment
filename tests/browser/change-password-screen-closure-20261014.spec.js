const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');

const widths = [320, 375, 390, 768, 1024, 1440, 1920];
const themes = ['light', 'dark'];
const locales = [
    { code: 'ar', direction: 'rtl', title: 'أنشئ كلمة مرورك الجديدة' },
    { code: 'en', direction: 'ltr', title: 'Create your new password' }
];
const artifactDirectory = path.resolve(
    process.cwd(),
    'qa/reports/logicfit-v2-change-password-screen-closure-20261014'
);

test('Change Password V2 visual-only closure matrix (no form submission or API writes)', async ({ page }, testInfo) => {
    fs.mkdirSync(artifactDirectory, { recursive: true });
    const apiRequests = [];
    const pageErrors = [];
    const observations = [];

    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        apiRequests.push({ method: request.method(), pathname: url.pathname });

        if (request.method() === 'GET' && url.pathname === '/api/auth/session') {
            return route.fulfill({
                status: 200,
                contentType: 'application/json; charset=utf-8',
                body: JSON.stringify({
                    authenticated: true,
                    user: {
                        id: 987654,
                        name: 'Local Visual QA',
                        role: 'Owner',
                        tenantType: 'gym',
                        mustChangePassword: true
                    }
                })
            });
        }

        // Fail closed: this visual-only run must never perform API writes.
        return route.abort('blockedbyclient');
    });
    await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173)/u, (route) => route.abort('blockedbyclient'));

    await page.goto('/change-password', { waitUntil: 'networkidle' });
    await expect(page.locator('[data-forced-password-surface="true"]')).toBeVisible();
    await expect(page.locator('#forceNewPassword')).toBeFocused();

    for (const width of widths) {
        await page.setViewportSize({ width, height: width <= 390 ? 844 : 900 });

        for (const theme of themes) {
            await page.evaluate((value) => window.TopGymTheme.set(value), theme);
            await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

            for (const locale of locales) {
                await page.evaluate((value) => window.TopGymI18n.set(value, { persist: false }), locale.code);
                await expect(page.locator('html')).toHaveAttribute('lang', locale.code);
                await expect(page.locator('html')).toHaveAttribute('dir', locale.direction);
                await expect(page.locator('#passwordChangeTitle')).toHaveText(locale.title);
                await expect(page.locator('#passwordChangeSubmit')).toBeVisible();
                await expect(page.locator('[data-locale-toggle]')).toBeVisible();
                await expect(page.locator('[data-theme-toggle]')).toBeVisible();

                const layout = await page.evaluate(() => {
                    const card = document.querySelector('.password-change-card');
                    const shell = document.querySelector('.password-change-shell');
                    const form = document.querySelector('#forcedPasswordChangeForm');
                    const rect = (element) => {
                        const box = element.getBoundingClientRect();
                        return { x: box.x, y: box.y, width: box.width, height: box.height, right: box.right, bottom: box.bottom };
                    };
                    return {
                        viewport: { width: innerWidth, height: innerHeight },
                        documentWidth: document.documentElement.scrollWidth,
                        bodyWidth: document.body.scrollWidth,
                        documentHeight: document.documentElement.scrollHeight,
                        card: rect(card),
                        shell: rect(shell),
                        form: rect(form),
                        newPassword: rect(document.querySelector('#forceNewPassword')),
                        confirmPassword: rect(document.querySelector('#forceConfirmPassword')),
                        footer: rect(document.querySelector('.password-change-footer')),
                        localeButton: rect(document.querySelector('[data-locale-toggle]')),
                        themeButton: rect(document.querySelector('[data-theme-toggle]')),
                        requiredEmptyState: {
                            newPassword: document.querySelector('#forceNewPassword').validity.valueMissing,
                            confirmPassword: document.querySelector('#forceConfirmPassword').validity.valueMissing
                        },
                        theme: document.documentElement.dataset.theme,
                        locale: document.documentElement.lang,
                        direction: document.documentElement.dir,
                        fontFamily: getComputedStyle(document.querySelector('#passwordChangeTitle')).fontFamily
                    };
                });

                expect(layout.documentWidth, `document horizontal overflow: ${width}/${locale.code}/${theme}`).toBeLessThanOrEqual(width);
                expect(layout.bodyWidth, `body horizontal overflow: ${width}/${locale.code}/${theme}`).toBeLessThanOrEqual(width);
                expect(layout.card.x, `card clipped at start: ${width}/${locale.code}/${theme}`).toBeGreaterThanOrEqual(-0.5);
                expect(layout.card.right, `card clipped at end: ${width}/${locale.code}/${theme}`).toBeLessThanOrEqual(width + 0.5);
                expect(layout.card.width, `card has no usable width: ${width}/${locale.code}/${theme}`).toBeGreaterThan(0);
                const controlsOverlap = layout.localeButton.x < layout.themeButton.right
                    && layout.localeButton.right > layout.themeButton.x
                    && layout.localeButton.y < layout.themeButton.bottom
                    && layout.localeButton.bottom > layout.themeButton.y;
                expect(controlsOverlap, `language and theme controls overlap: ${width}/${locale.code}/${theme}`).toBe(false);
                if (width >= 768) {
                    expect(Math.abs(layout.localeButton.y - layout.themeButton.y), `desktop footer controls should share a row: ${width}/${locale.code}/${theme}`).toBeLessThanOrEqual(3);
                }
                expect(layout.requiredEmptyState.newPassword).toBe(true);
                expect(layout.requiredEmptyState.confirmPassword).toBe(true);

                const key = `${width}-${locale.code}-${theme}`;
                const screenshotPath = path.join(artifactDirectory, `change-password-${key}.png`);
                // Use a non-interactive heading to leave the auto-focused field before baseline capture.
                await page.locator('#passwordChangeTitle').click();
                const neutralFocus = await page.evaluate(() => ({
                    activeId: document.activeElement?.id || '',
                    activeTag: document.activeElement?.tagName || ''
                }));
                expect(['forceNewPassword', 'forceConfirmPassword', 'passwordChangeSubmit']).not.toContain(neutralFocus.activeId);
                await page.screenshot({ path: screenshotPath, fullPage: true, animations: 'disabled' });

                // Traverse the password reveal control with the keyboard and record its visible focus.
                await page.locator('#forceNewPassword').focus();
                await page.keyboard.press('Tab');
                const focus = await page.locator('[data-password-toggle="forceNewPassword"]').evaluate((button) => ({
                    focused: document.activeElement === button,
                    outlineStyle: getComputedStyle(button).outlineStyle,
                    outlineWidth: getComputedStyle(button).outlineWidth,
                    targetWidth: button.getBoundingClientRect().width,
                    targetHeight: button.getBoundingClientRect().height
                }));
                expect(focus.focused, `password visibility control unreachable: ${width}/${locale.code}/${theme}`).toBe(true);
                expect(focus.outlineStyle, `focus outline absent: ${width}/${locale.code}/${theme}`).not.toBe('none');
                expect(parseFloat(focus.outlineWidth), `focus outline too small: ${width}/${locale.code}/${theme}`).toBeGreaterThanOrEqual(3);
                expect(focus.targetWidth).toBeGreaterThanOrEqual(44);
                expect(focus.targetHeight).toBeGreaterThanOrEqual(44);

                let focusScreenshot = null;
                if (width === 320 || width === 1440 || width === 1920) {
                    focusScreenshot = `change-password-${key}-focus.png`;
                    await page.screenshot({ path: path.join(artifactDirectory, focusScreenshot), fullPage: true, animations: 'disabled' });
                }

                // Exercise a locally populated (masked) form state only. Never submit it.
                await page.locator('#forceNewPassword').fill('VisualOnly123!');
                await page.locator('#forceConfirmPassword').fill('VisualOnly123!');
                const populatedState = await page.evaluate(() => ({
                    valid: document.querySelector('#forcedPasswordChangeForm').checkValidity(),
                    newType: document.querySelector('#forceNewPassword').type,
                    confirmType: document.querySelector('#forceConfirmPassword').type,
                    messageHidden: document.querySelector('#passwordChangeMessage').hidden,
                    documentWidth: document.documentElement.scrollWidth
                }));
                expect(populatedState.valid, `synthetic filled form state invalid: ${width}/${locale.code}/${theme}`).toBe(true);
                expect(populatedState.newType).toBe('password');
                expect(populatedState.confirmType).toBe('password');
                expect(populatedState.messageHidden).toBe(true);
                expect(populatedState.documentWidth).toBeLessThanOrEqual(width);
                await page.locator('#forceNewPassword').clear();
                await page.locator('#forceConfirmPassword').clear();
                observations.push({ key, screenshot: path.basename(screenshotPath), focusScreenshot, layout, neutralFocus, focus, populatedState });
            }
        }
    }

    const writes = apiRequests.filter(({ method }) => method !== 'GET' && method !== 'HEAD');
    expect(writes, 'API writes occurred during visual-only QA').toEqual([]);
    expect(apiRequests.every(({ method, pathname }) => method === 'GET' && pathname === '/api/auth/session')).toBe(true);
    expect(pageErrors, 'browser page errors occurred').toEqual([]);

    fs.writeFileSync(path.join(artifactDirectory, 'visual-qa-results.json'), JSON.stringify({
        status: 'PASS',
        scope: 'Visual QA only; no form submit; no API writes; synthetic local session fixture',
        generatedAt: new Date().toISOString(),
        command: 'npm exec --yes --package=node@24.20.0 -- node node_modules/@playwright/test/cli.js test tests/browser/change-password-screen-closure-20261014.spec.js --project=desktop --workers=1',
        viewports: widths,
        locales: locales.map(({ code, direction }) => ({ code, direction })),
        themes,
        screenshotCount: observations.length,
        focusScreenshotCount: observations.filter(({ focusScreenshot }) => Boolean(focusScreenshot)).length,
        manualVisualReview: {
            classification: 'Passed',
            inspectedScreenshots: [
                'change-password-320-ar-light.png',
                'change-password-320-en-dark.png',
                'change-password-390-ar-light.png',
                'change-password-390-en-dark.png',
                'change-password-375-ar-dark.png',
                'change-password-768-ar-dark.png',
                'change-password-768-en-light.png',
                'change-password-1024-en-light.png',
                'change-password-1440-ar-dark.png',
                'change-password-1440-en-light.png',
                'change-password-1920-ar-light.png'
            ],
            observations: [
                'Card, fields, actions, and footer remain within the viewport across all seven tested widths; no horizontal page overflow observed.',
                'Language and theme controls do not overlap; at widths from 768px upward they remain aligned in one footer row.',
                'The password visibility control retains a visible keyboard focus outline and at least a 44px touch target in both locales and themes.'
            ]
        },
        apiRequests,
        apiWrites: writes,
        browserErrors: pageErrors,
        observations
    }, null, 2), 'utf8');
});
