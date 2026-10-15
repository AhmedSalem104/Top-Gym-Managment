const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');

async function installReadOnlyLoginFixture(page) {
    const writes = [];
    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;
        if (request.method() !== 'GET' && request.method() !== 'HEAD' && request.method() !== 'OPTIONS') {
            writes.push({ pathname, method: request.method() });
            return route.fulfill({
                status: 405,
                contentType: 'application/json',
                body: JSON.stringify({ error: 'Read-only Login visual fixture' })
            });
        }

        return route.fulfill({
            status: 200,
            contentType: 'application/json; charset=utf-8',
            body: JSON.stringify(pathname === '/api/auth/session' ? { authenticated: false } : {})
        });
    });
    return writes;
}

test('Login V2 uses the canonical primary token and preserves the read-only auth surface', async ({ page }) => {
    const writes = await installReadOnlyLoginFixture(page);
    const evidenceDir = path.join(__dirname, '../../qa/reports/logicfit-v2-login');
    await fs.mkdir(evidenceDir, { recursive: true });

    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/login$/u);
    await expect(page.locator('#authLoginCard')).toBeVisible();
    await expect(page.locator('#loginForm')).toBeVisible();

    const preservedContract = await page.evaluate(() => ({
        formId: document.querySelector('#loginForm')?.id,
        email: {
            id: document.querySelector('#loginEmail')?.id,
            type: document.querySelector('#loginEmail')?.type,
            autocomplete: document.querySelector('#loginEmail')?.autocomplete,
            required: document.querySelector('#loginEmail')?.required
        },
        password: {
            id: document.querySelector('#loginPassword')?.id,
            type: document.querySelector('#loginPassword')?.type,
            autocomplete: document.querySelector('#loginPassword')?.autocomplete,
            required: document.querySelector('#loginPassword')?.required
        },
        submit: {
            id: document.querySelector('#loginSubmit')?.id,
            type: document.querySelector('#loginSubmit')?.type
        },
        passwordToggle: document.querySelector('#loginPasswordToggle')?.type,
        register: document.querySelector('#authRegisterOpen')?.type,
        forgot: document.querySelector('#authForgotHelp')?.type
    }));
    expect(preservedContract).toEqual({
        formId: 'loginForm',
        email: { id: 'loginEmail', type: 'email', autocomplete: 'username', required: true },
        password: { id: 'loginPassword', type: 'password', autocomplete: 'current-password', required: true },
        submit: { id: 'loginSubmit', type: 'submit' },
        passwordToggle: 'button',
        register: 'button',
        forgot: 'button'
    });

    for (const theme of ['light', 'dark']) {
        await page.evaluate((value) => window.TopGymTheme.set(value), theme);
        for (const viewport of [
            { name: 'desktop', width: 1440, height: 900 },
            { name: 'mobile', width: 390, height: 844 }
        ]) {
            await page.setViewportSize({ width: viewport.width, height: viewport.height });
            await page.evaluate(() => document.fonts.ready);
            await expect(page.locator('#loginEmail')).toBeVisible();
            await expect(page.locator('#loginPassword')).toBeVisible();
            await expect(page.locator('.auth-field label[for="loginEmail"]')).toBeVisible();
            await expect(page.locator('.auth-field label[for="loginPassword"]')).toBeVisible();

            const state = await page.evaluate(() => {
                const root = document.documentElement;
                const body = document.body;
                const button = document.querySelector('#loginSubmit');
                const pageSurface = document.querySelector('.auth-screen');
                const expected = document.createElement('span');
                expected.style.backgroundColor = 'var(--login-primary)';
                pageSurface.append(expected);
                const expectedPrimary = getComputedStyle(expected).backgroundColor;
                expected.remove();
                const rect = button.getBoundingClientRect();
                return {
                    theme: root.dataset.theme,
                    direction: getComputedStyle(pageSurface).direction,
                    documentWidth: root.scrollWidth,
                    bodyWidth: body.scrollWidth,
                    viewportWidth: innerWidth,
                    buttonBackground: getComputedStyle(button).backgroundColor,
                    buttonBackgroundImage: getComputedStyle(button).backgroundImage,
                    expectedPrimary,
                    button: { left: rect.left, right: rect.right, width: rect.width, height: rect.height }
                };
            });

            expect(state.theme).toBe(theme);
            expect(state.direction).toBe('rtl');
            expect(state.documentWidth, `${viewport.name}/${theme}: document overflow`).toBeLessThanOrEqual(viewport.width);
            expect(state.bodyWidth, `${viewport.name}/${theme}: body overflow`).toBeLessThanOrEqual(viewport.width);
            expect(state.buttonBackgroundImage).toBe('none');
            expect(state.buttonBackground).toBe(state.expectedPrimary);
            expect(state.button.left).toBeGreaterThanOrEqual(0);
            expect(state.button.right).toBeLessThanOrEqual(viewport.width);
            expect(state.button.height).toBeGreaterThanOrEqual(44);

            const localeToggle = page.locator('#languageToggleButton');
            await expect(localeToggle).toBeVisible();
            await localeToggle.focus();
            await page.keyboard.press('Tab');
            await expect(page.locator('.auth-theme-toggle')).toBeFocused();
            await page.keyboard.press('Tab');
            await expect(page.locator('#loginEmail')).toBeFocused();
            const localeToggleBox = await localeToggle.boundingBox();
            expect(localeToggleBox.width, `${viewport.name}/${theme}: login language control must remain compact`).toBeLessThan(140);
            await expect(page.locator('#loginEmail')).toHaveCSS('direction', 'ltr');
            await page.keyboard.press('Tab');
            await expect(page.locator('#loginPassword')).toBeFocused();
            const focusState = await page.locator('.auth-password-wrap').evaluate((element) => ({
                focusVisible: element.querySelector('input').matches(':focus-visible'),
                boxShadow: getComputedStyle(element).boxShadow,
                outlineStyle: getComputedStyle(element.querySelector('input')).outlineStyle
            }));
            expect(focusState.focusVisible).toBe(true);
            expect(focusState.boxShadow !== 'none' || focusState.outlineStyle !== 'none').toBe(true);

            await page.locator('body').click({ position: { x: 8, y: 8 } });
            const screenshotPath = path.join(evidenceDir, `login-${viewport.name}-${viewport.width}-${theme}.png`);
            await page.screenshot({ path: screenshotPath, fullPage: true });
        }
    }

    expect(writes, 'Login QA must not submit credentials or perform any API writes.').toEqual([]);
});
