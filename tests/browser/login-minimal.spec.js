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
    await expect(page.locator('.auth-reference-hero')).toBeHidden();
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
        direction: getComputedStyle(document.querySelector('.auth-shell')).direction,
        emailDirection: getComputedStyle(document.querySelector('#loginEmail')).direction,
        card: document.querySelector('#authLoginCard').getBoundingClientRect().toJSON(),
        themeToggle: document.querySelector('.auth-theme-toggle').getBoundingClientRect().toJSON()
    }));

    expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewport + 1);
    expect(metrics.bodyWidth).toBeLessThanOrEqual(metrics.viewport + 1);
    expect(metrics.direction).toBe('rtl');
    expect(metrics.emailDirection).toBe('ltr');
    expect(metrics.card.width).toBeGreaterThan(280);
    expect(metrics.card.width).toBeLessThanOrEqual(metrics.viewport);
    expect(metrics.themeToggle.width).toBeGreaterThanOrEqual(44);
    expect(metrics.themeToggle.height).toBeGreaterThanOrEqual(44);
}

test.beforeEach(async ({ page }) => {
    await mockUnauthenticatedSession(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
});

test('login is a minimal responsive surface with preserved auth hooks', async ({ page }) => {
    await assertLoginSurface(page);
});

test('login keeps theme toggle accessible on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await assertLoginSurface(page);
    const toggle = page.locator('[data-theme-toggle]').first();
    const before = await page.locator('html').getAttribute('data-theme');
    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', before === 'dark' ? 'light' : 'dark');
    await expect(toggle).toHaveAttribute('aria-pressed', before === 'dark' ? 'false' : 'true');
});
