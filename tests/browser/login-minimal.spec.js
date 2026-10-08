const { test, expect } = require('@playwright/test');

async function mockUnauthenticatedSession(page) {
    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;
        if (pathname === '/api/auth/session') {
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ authenticated: false })
            });
        }
        return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({})
        });
    });
}

async function assertLoginSurface(page) {
    await expect(page.locator('#authLoginCard')).toBeVisible();
    await expect(page.locator('.auth-reference-hero')).toHaveCount(0);
    await expect(page.locator('.auth-reference-features')).toBeVisible();
    await expect(page.locator('.auth-reference-features article')).toHaveCount(3);
    await expect(page.locator('.auth-reference-controls')).toBeHidden();
    await expect(page.locator('.saas-entry-card')).toBeHidden();
    await expect(page.locator('.auth-reference-security')).toBeHidden();
    await expect(page.locator('.auth-reference-copyright')).toBeHidden();
    await expect(page.locator('#authLoginCard [data-brand-text="brandName"]')).toBeVisible();
    await expect(page.locator('#loginEmail')).toBeVisible();
    await expect(page.locator('#loginPassword')).toBeVisible();
    await expect(page.locator('#loginPasswordToggle')).toBeVisible();
    await expect(page.locator('[data-theme-toggle]').first()).toBeVisible();

    const metrics = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        scrollY: window.scrollY,
        documentHeight: document.documentElement.scrollHeight,
        shell: document.querySelector('.auth-shell').getBoundingClientRect().toJSON(),
        cardShell: document.querySelector('#authLoginCard').getBoundingClientRect().toJSON(),
        direction: getComputedStyle(document.querySelector('.auth-shell')).direction,
        emailDirection: getComputedStyle(document.querySelector('#loginEmail')).direction,
        card: document.querySelector('#authLoginCard .auth-form-panel').getBoundingClientRect().toJSON(),
        visualCard: document.querySelector('#authLoginCard .auth-form-panel').getBoundingClientRect().toJSON(),
        features: document.querySelector('.auth-reference-features').getBoundingClientRect().toJSON(),
        backgroundImage: getComputedStyle(document.querySelector('.auth-screen')).backgroundImage,
        featuresAfterCard: Boolean(document.querySelector('.auth-form-panel').compareDocumentPosition(document.querySelector('.auth-reference-features')) & Node.DOCUMENT_POSITION_FOLLOWING),
        themeToggle: document.querySelector('.auth-theme-toggle').getBoundingClientRect().toJSON(),
        themeInsideCard: Boolean(document.querySelector('#authLoginCard .auth-theme-toggle')),
        themeWithinCard: (() => {
            const card = document.querySelector('#authLoginCard .auth-form-panel').getBoundingClientRect();
            const toggle = document.querySelector('#authLoginCard .auth-theme-toggle').getBoundingClientRect();
            return toggle.left >= card.left && toggle.right <= card.right && toggle.top >= card.top && toggle.bottom <= card.bottom;
        })(),
        submitGap: (() => {
            const registration = document.querySelector('.auth-registration-entry').getBoundingClientRect();
            const submit = document.querySelector('#loginSubmit').getBoundingClientRect();
            return Math.round(registration.top - submit.bottom);
        })(),
        submitHeight: document.querySelector('#loginSubmit').getBoundingClientRect().height
    }));

    expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewport + 1);
    expect(metrics.bodyWidth).toBeLessThanOrEqual(metrics.viewport + 1);
    expect(metrics.direction).toBe('rtl');
    expect(metrics.emailDirection).toBe('ltr');
    expect(metrics.card.width).toBeGreaterThan(280);
    expect(metrics.card.width).toBeLessThanOrEqual(metrics.viewport);
    expect(Math.abs((metrics.card.left + metrics.card.right) / 2 - metrics.viewport / 2)).toBeLessThanOrEqual(2);
    expect(metrics.featuresAfterCard).toBe(true);
    expect(metrics.features.top).toBeGreaterThan(metrics.card.bottom);
    expect(metrics.backgroundImage).not.toContain('gradient');
    expect(metrics.themeInsideCard).toBe(true);
    expect(metrics.themeWithinCard, JSON.stringify(metrics)).toBe(true);
    expect(metrics.themeToggle.width).toBe(96);
    expect(metrics.themeToggle.height).toBe(40);
    expect(metrics.card.height, JSON.stringify(metrics)).toBeLessThan(650);
    expect(metrics.submitGap, JSON.stringify(metrics)).toBeGreaterThanOrEqual(12);
    expect(metrics.submitGap).toBeLessThanOrEqual(32);
    expect(metrics.submitHeight).toBeGreaterThanOrEqual(54);
}

test.beforeEach(async ({ page }) => {
    await mockUnauthenticatedSession(page);
    await page.goto('/login.html', { waitUntil: 'domcontentloaded' });
});

test('login centers the form and places product benefits below without image overlays', async ({ page }, testInfo) => {
    await assertLoginSurface(page);
    if ((await page.evaluate(() => innerWidth)) > 980) {
        await page.screenshot({ path: testInfo.outputPath('login-desktop-split.png'), fullPage: true });
    }
});

test('login keeps its shared theme toggle accessible and visually stable on mobile', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await assertLoginSurface(page);
    const toggle = page.locator('[data-theme-toggle]').first();
    const before = await page.locator('html').getAttribute('data-theme');
    await page.screenshot({ path: testInfo.outputPath('login-390-before-toggle.png'), fullPage: false });
    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', before === 'dark' ? 'light' : 'dark');
    await expect(toggle).toHaveAttribute('aria-pressed', before === 'dark' ? 'false' : 'true');
    await expect(toggle).toHaveCSS('width', '96px');
    await expect(toggle).toHaveCSS('height', '40px');
    const toggleAccent = await toggle.evaluate((element) => getComputedStyle(element, '::before').backgroundImage);
    expect(toggleAccent).not.toContain('124, 58, 237');
    await page.screenshot({ path: testInfo.outputPath('login-390-after-toggle.png'), fullPage: false });
});

test('public registration offers only gym and independent trainer paths', async ({ page }) => {
    await page.locator('#authRegisterOpen').click();
    const dialog = page.locator('#authRegistrationDialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('a')).toHaveCount(2);
    await expect(dialog.locator('a[href="/register-gym"]')).toBeVisible();
    await expect(dialog.locator('a[href="/register-trainer"]')).toBeVisible();
    await expect(dialog.getByText(/عضو|مشترك/)).toHaveCount(0);
});

test('password recovery explains the actual supported path without claiming a self-service flow', async ({ page }) => {
    await page.locator('#authForgotHelp').click();
    await expect(page.locator('#authRecoveryDialog')).toBeVisible();
    await expect(page.locator('#authRecoveryDialog')).toContainText('لا تتوفر إعادة تعيين ذاتية');
});

test('login submits the existing API contract and keeps its error state in the card', async ({ page }) => {
    let submittedBody;
    await page.route('**/api/auth/login', async (route) => {
        submittedBody = route.request().postDataJSON();
        await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' }) });
    });
    await page.locator('#loginEmail').fill('qa@example.test');
    await page.locator('#loginPassword').fill('not-a-real-password');
    await page.locator('#loginSubmit').click();
    await expect(page.locator('#loginMessage')).toBeVisible();
    expect(submittedBody).toEqual({ email: 'qa@example.test', password: 'not-a-real-password' });
    await expect(page.locator('#loginSubmit')).toBeEnabled();
});

test('platform admin entry uses the same approved photo without changing its login form', async ({ page }, testInfo) => {
    await page.goto('/platform-admin.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#platformAdminLoginScreen')).toBeVisible();
    await expect(page.locator('#platformAdminLoginForm')).toBeVisible();
    const background = await page.locator('#platformAdminLoginScreen').evaluate((element) => getComputedStyle(element, '::before').backgroundImage);
    expect(background).toContain('/assets/logic-fit-login-gym.webp');
    await page.screenshot({ path: testInfo.outputPath('platform-admin-login.png'), fullPage: true });
});

test('login feedback uses centralized error and information alert states', async ({ page }) => {
    const feedback = await page.locator('#loginMessage').evaluate((element) => {
        const expectedErrorElement = document.createElement('div');
        expectedErrorElement.className = 'alert-danger';
        const expectedInfoElement = document.createElement('div');
        expectedInfoElement.className = 'alert-info';
        document.body.append(expectedErrorElement, expectedInfoElement);
        const expectedError = getComputedStyle(expectedErrorElement).backgroundColor;
        const expectedInfo = getComputedStyle(expectedInfoElement).backgroundColor;
        expectedErrorElement.remove();
        expectedInfoElement.remove();
        const errorBackground = getComputedStyle(element).backgroundColor;
        element.classList.add('info');
        const infoBackground = getComputedStyle(element).backgroundColor;
        return { errorBackground, infoBackground, expectedError, expectedInfo };
    });
    expect(feedback.errorBackground).toBe(feedback.expectedError);
    expect(feedback.infoBackground).toBe(feedback.expectedInfo);
});
