const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');

const viewportMatrix = [
    { width: 320, height: 760 },
    { width: 375, height: 812 },
    { width: 390, height: 844 },
    { width: 768, height: 900 },
    { width: 1024, height: 900 },
    { width: 1440, height: 1000 },
    { width: 1920, height: 1080 }
];
const themes = ['light', 'dark'];
const registrationRoutes = [
    { path: '/register-gym.html', kind: 'gym' },
    { path: '/register-trainer.html', kind: 'trainer' }
];

const catalog = {
    plans: [{
        code: 'qa-plan',
        name: 'Read-only QA plan',
        description: 'Synthetic plan for browser navigation coverage.',
        maxMembers: 25,
        terms: [{ code: 'monthly', durationMonths: 1, price: 100, currency: 'EGP', isActive: true }]
    }],
    paymentMethods: [{
        methodCode: 'qa-transfer',
        displayName: 'Synthetic transfer method',
        accountReference: '0000000000',
        recipientName: 'Read-only fixture',
        isActive: true
    }]
};

async function installReadOnlyAuthFixtures(page, { forcedPassword = false } = {}) {
    const writes = [];
    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const method = request.method();
        if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
            writes.push({ method, pathname: url.pathname });
            return route.fulfill({ status: 405, contentType: 'application/json', body: JSON.stringify({ error: 'Read-only public-auth acceptance fixture' }) });
        }

        let body = {};
        if (url.pathname === '/api/auth/session') {
            body = forcedPassword
                ? { authenticated: true, user: { id: 880001, name: 'Read-only QA', role: 'Owner', tenantType: 'gym', mustChangePassword: true } }
                : { authenticated: false };
        } else if (url.pathname === '/api/phone/countries') {
            body = { countries: [{ country: 'Egypt', isoCode: 'EG', dialCode: '+20', exampleNational: '01015819700', exampleInternational: '+201015819700', validLengths: [8, 9, 10], mobileRules: { supported: true, validLengths: [10], nationalPattern: '1[0-25]\\d{8}', localPrefix: '0' } }] };
        } else if (url.pathname.endsWith('/gym-registration/catalog') || url.pathname.endsWith('/trainer-registration/catalog')) {
            body = catalog;
        }
        return route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(body) });
    });
    return writes;
}

async function setTheme(page, theme) {
    await page.evaluate((value) => window.TopGymTheme.set(value), theme);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

async function expectNoHorizontalOverflow(page, width, label) {
    const metrics = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        document: document.documentElement.scrollWidth,
        body: document.body.scrollWidth
    }));
    expect(metrics.document, `${label}: document overflow ${JSON.stringify(metrics)}`).toBeLessThanOrEqual(width + 1);
    expect(metrics.body, `${label}: body overflow ${JSON.stringify(metrics)}`).toBeLessThanOrEqual(width + 1);
}

test('Login V2 remains compact, theme-safe, keyboard-operable, and read-only across target widths', async ({ page }, testInfo) => {
    const writes = await installReadOnlyAuthFixtures(page);
    await page.goto('/login.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#authLoginCard')).toBeVisible();
    await expect(page.locator('#loginForm')).toBeVisible();
    const evidenceDir = testInfo.outputPath('login');
    await fs.mkdir(evidenceDir, { recursive: true });

    for (const viewport of viewportMatrix) {
        await page.setViewportSize(viewport);
        for (const theme of themes) {
            await setTheme(page, theme);
            await expect(page.locator('#loginEmail')).toBeVisible();
            await expect(page.locator('#loginPassword')).toBeVisible();
            await expect(page.locator('.auth-field label[for="loginEmail"]')).toBeVisible();
            await expect(page.locator('.auth-field label[for="loginPassword"]')).toBeVisible();
            await expectNoHorizontalOverflow(page, viewport.width, `login ${viewport.width}/${theme}`);

            const geometry = await page.evaluate(() => {
                const card = document.querySelector('.auth-form-panel').getBoundingClientRect();
                const submit = document.querySelector('#loginSubmit').getBoundingClientRect();
                const input = document.querySelector('.auth-input-wrap').getBoundingClientRect();
                const loginColumn = document.querySelector('.auth-login-column').getBoundingClientRect();
                const marketing = document.querySelector('.auth-marketing-panel').getBoundingClientRect();
                const style = getComputedStyle(document.querySelector('.auth-form-panel'));
                return {
                    direction: getComputedStyle(document.querySelector('.auth-screen')).direction,
                    loginColumnWidth: loginColumn.width,
                    marketingWidth: marketing.width,
                    loginColumnLeft: loginColumn.left,
                    marketingLeft: marketing.left,
                    cardLeft: card.left,
                    cardRight: card.right,
                    radius: style.borderTopLeftRadius,
                    inputHeight: input.height,
                    submitHeight: submit.height,
                    emailDirection: getComputedStyle(document.querySelector('#loginEmail')).direction
                };
            });
            expect(geometry.direction).toBe('rtl');
            expect(geometry.emailDirection).toBe('ltr');
            expect(geometry.cardLeft).toBeGreaterThanOrEqual(0);
            expect(geometry.cardRight).toBeLessThanOrEqual(viewport.width + 1);
            expect(geometry.inputHeight).toBe(48);
            expect(geometry.submitHeight).toBe(48);
            expect(geometry.radius).toBe('0px');
            if (viewport.width >= 1024) {
                expect(geometry.loginColumnWidth).toBeCloseTo(viewport.width * 0.5, 0);
                expect(geometry.marketingWidth).toBeCloseTo(viewport.width * 0.5, 0);
                expect(geometry.loginColumnLeft).toBeCloseTo(viewport.width * 0.5, 0);
                expect(geometry.marketingLeft).toBeCloseTo(0, 0);
            } else {
                expect(geometry.loginColumnWidth).toBe(viewport.width);
                expect(geometry.marketingWidth).toBe(0);
            }

            await page.locator('.auth-theme-toggle').focus();
            expect(await page.locator('.auth-theme-toggle').evaluate((element) => element.matches(':focus-visible'))).toBe(true);
            if ([320, 390, 768, 1440, 1920].includes(viewport.width)) {
                await page.screenshot({ path: `${evidenceDir}/login-${viewport.width}-${theme}.png`, fullPage: true });
            }
        }
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#loginPasswordToggle').click();
    await expect(page.locator('#loginPassword')).toHaveAttribute('type', 'text');
    await page.locator('#loginPasswordToggle').click();
    await expect(page.locator('#loginPassword')).toHaveAttribute('type', 'password');
    await page.locator('#authRegisterOpen').click();
    await expect(page.locator('#authRegistrationDialog')).toBeVisible();
    await expect(page.locator('#authRegistrationDialog a[href="/register-gym"]')).toBeVisible();
    await expect(page.locator('#authRegistrationDialog a[href="/register-trainer"]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#authRegistrationDialog')).toBeHidden();
    await expect(page.locator('#authForgotHelp')).toBeVisible();
    await page.locator('#authForgotHelp').click();
    await expect(page.locator('#authRecoveryDialog')).toBeVisible();
    await expect(page.locator('#authRecoveryEmail')).toBeVisible();
    await page.locator('#authRecoveryDialog .auth-choice-close').click();
    await expect(page.locator('#authRecoveryDialog')).toBeHidden();
    expect(writes, 'Login navigation must not submit credentials or mutate auth.').toEqual([]);
});

test('Gym and trainer registration preserve all six wizard steps without submitting requests', async ({ page }, testInfo) => {
    const writes = await installReadOnlyAuthFixtures(page);
    await page.setViewportSize({ width: 390, height: 844 });

    for (const route of registrationRoutes) {
        await page.goto(route.path, { waitUntil: 'domcontentloaded' });
        await expect(page.locator('.registration-steps [data-step-indicator]')).toHaveCount(6);
        await expect(page.locator('[data-registration-step="1"]')).toBeVisible();

        await page.locator('#registrationNext').click();
        await expect(page.locator('#registrationError')).toBeVisible();
        await expect(page.locator('[data-registration-step="1"]')).toBeVisible();
        await page.locator('input[name="gymName"]').fill('Read-only QA Workspace');
        await page.locator('input[name="ownerName"]').fill('Read-only QA Owner');
        await page.locator('input[name="whatsapp"]').fill('01015819700');
        await page.locator('input[name="email"]').fill('qa@example.test');
        await page.locator('#registrationNext').click();

        await expect(page.locator('[data-registration-step="2"]')).toBeVisible();
        await expect(page.locator('input[name="registrationPlan"]')).toBeVisible();
        // The radio is intentionally visually hidden inside its accessible
        // label; operate the visible plan option as a user does.
        await page.locator('.registration-plan-option').first().click();
        await expect(page.locator('input[name="registrationPlan"]').first()).toBeChecked();
        await page.locator('#registrationNext').click();

        await expect(page.locator('[data-registration-step="3"]')).toBeVisible();
        await expect(page.locator('input[name="registrationTerm"]')).toBeVisible();
        await page.locator('.registration-term-option').first().click();
        await expect(page.locator('input[name="registrationTerm"]').first()).toBeChecked();
        await page.locator('#registrationNext').click();

        await expect(page.locator('[data-registration-step="4"]')).toBeVisible();
        await expect(page.locator('input[name="registrationPaymentMethod"]')).toBeVisible();
        await page.locator('.registration-payment-option').first().click();
        await expect(page.locator('input[name="registrationPaymentMethod"]').first()).toBeChecked();
        await page.locator('#registrationNext').click();

        await expect(page.locator('[data-registration-step="5"]')).toBeVisible();
        await page.locator('#registrationProof').setInputFiles({
            name: 'read-only-proof.pdf',
            mimeType: 'application/pdf',
            buffer: Buffer.from('%PDF-1.4 read-only fixture')
        });
        await page.locator('#registrationNext').click();

        await expect(page.locator('[data-registration-step="6"]')).toBeVisible();
        await expect(page.locator('[data-step-indicator="6"]')).toHaveAttribute('aria-current', 'step');
        await expect(page.locator('#registrationReview')).toBeVisible();
        await expect(page.locator('#registrationSuccess')).toBeHidden();
        await expect(page.locator('#registrationNext')).toContainText(/إرسال طلب/);
        await expectNoHorizontalOverflow(page, 390, `${route.kind} wizard step 6`);

        await page.screenshot({ path: testInfo.outputPath(`${route.kind}-wizard-step-6.png`), fullPage: true });
        await page.locator('#registrationBack').click();
        await expect(page.locator('[data-registration-step="5"]')).toBeVisible();
        await page.locator('#registrationBack').click();
        await expect(page.locator('[data-registration-step="4"]')).toBeVisible();
    }

    expect(writes, 'Registration navigation may read public catalogs but must not create or upload a request.').toEqual([]);
});

test('Gym and trainer registration layout adapts across widths and themes', async ({ page }, testInfo) => {
    const writes = await installReadOnlyAuthFixtures(page);
    const evidenceDir = testInfo.outputPath('registration-layouts');
    await fs.mkdir(evidenceDir, { recursive: true });

    for (const route of registrationRoutes) {
        await page.goto(route.path, { waitUntil: 'domcontentloaded' });
        await expect(page.locator('.registration-card')).toBeVisible();
        for (const viewport of viewportMatrix) {
            await page.setViewportSize(viewport);
            for (const theme of themes) {
                await setTheme(page, theme);
                await expect(page.locator('.registration-card')).toBeVisible();
                await expect(page.locator('.registration-steps [data-step-indicator]')).toHaveCount(6);
                await expect(page.locator('[data-step-indicator="1"]')).toHaveAttribute('aria-current', 'step');
                await expectNoHorizontalOverflow(page, viewport.width, `${route.kind} ${viewport.width}/${theme}`);

                const state = await page.evaluate(() => {
                    const pageRoot = document.querySelector('.public-registration-page');
                    const card = document.querySelector('.registration-card').getBoundingClientRect();
                    const steps = [...document.querySelectorAll('.registration-steps > li')];
                    return {
                        direction: getComputedStyle(pageRoot).direction,
                        cardLeft: card.left,
                        cardRight: card.right,
                        stepRows: new Set(steps.map((step) => Math.round(step.getBoundingClientRect().top))).size,
                        phoneDirection: getComputedStyle(document.querySelector('input[name="whatsapp"]')).direction,
                        emailDirection: getComputedStyle(document.querySelector('input[name="email"]')).direction
                    };
                });
                expect(state.direction).toBe('rtl');
                expect(state.cardLeft).toBeGreaterThanOrEqual(0);
                expect(state.cardRight).toBeLessThanOrEqual(viewport.width + 1);
                expect(state.phoneDirection).toBe('ltr');
                expect(state.emailDirection).toBe('ltr');
                if (viewport.width === 768) expect(state.stepRows).toBe(2);
                if (viewport.width <= 620 || viewport.width >= 1024) expect(state.stepRows).toBe(1);

                if ([320, 390, 768, 1440, 1920].includes(viewport.width)) {
                    await page.screenshot({ path: `${evidenceDir}/${route.kind}-${viewport.width}-${theme}.png`, fullPage: true });
                }
            }
        }
    }

    expect(writes).toEqual([]);
});

test('Forced password surface preserves field visibility controls and stays read-only across widths', async ({ page }, testInfo) => {
    const writes = await installReadOnlyAuthFixtures(page, { forcedPassword: true });
    // This read-only acceptance fixture mocks the browser API session, not the
    // server-side cookie used by the protected extensionless document route.
    await page.goto('/change-password.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-forced-password-surface="true"]')).toBeVisible();

    for (const viewport of viewportMatrix) {
        await page.setViewportSize(viewport);
        for (const theme of themes) {
            await setTheme(page, theme);
            await expectNoHorizontalOverflow(page, viewport.width, `change-password ${viewport.width}/${theme}`);
            await expect(page.locator('#forceNewPassword')).toBeVisible();
            await expect(page.locator('#forceConfirmPassword')).toBeVisible();
            await page.locator('#forceNewPassword').focus();
            await page.keyboard.press('Tab');
            await expect(page.locator('[data-password-toggle="forceNewPassword"]')).toBeFocused();
            expect(await page.locator('[data-password-toggle="forceNewPassword"]').evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe('none');
            await page.locator('[data-password-toggle="forceNewPassword"]').click();
            await expect(page.locator('#forceNewPassword')).toHaveAttribute('type', 'text');
            await page.locator('[data-password-toggle="forceNewPassword"]').click();
            await expect(page.locator('#forceNewPassword')).toHaveAttribute('type', 'password');

            if ([320, 390, 768, 1440, 1920].includes(viewport.width)) {
                await page.screenshot({ path: testInfo.outputPath(`change-password-${viewport.width}-${theme}.png`), fullPage: true });
            }
        }
    }

    expect(writes, 'Forced-password acceptance must never submit new credentials.').toEqual([]);
});
