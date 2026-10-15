const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const registrationRoutes = [
    { path: '/register-gym.html', name: 'gym' },
    { path: '/register-trainer.html', name: 'trainer' }
];

const viewports = [
    { width: 1440, height: 1000, mode: 'desktop' },
    { width: 1024, height: 900, mode: 'desktop' },
    { width: 768, height: 900, mode: 'tablet' },
    { width: 390, height: 844, mode: 'mobile' },
    { width: 320, height: 720, mode: 'mobile-compact' }
];

test('registration steps adapt without losing tablet context or changing validation', async ({ page }, testInfo) => {
    await page.route('**/api/**', async (route) => {
        const isCatalog = new URL(route.request().url()).pathname.endsWith('/catalog');
        return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(isCatalog ? { plans: [], paymentMethods: [] } : {})
        });
    });

    for (const route of registrationRoutes) {
        for (const viewport of viewports) {
            await page.setViewportSize({ width: viewport.width, height: viewport.height });

            for (const theme of ['light', 'dark']) {
                await page.goto(route.path, { waitUntil: 'domcontentloaded' });
                await page.evaluate((value) => {
                    document.documentElement.dataset.theme = value;
                    localStorage.setItem('topgym-theme', value);
                }, theme);
                await page.reload({ waitUntil: 'domcontentloaded' });
                await expect(page.locator('.registration-card')).toBeVisible();
                await expect(page.locator('.registration-steps li')).toHaveCount(6);

                const layout = await page.evaluate(() => {
                    const steps = document.querySelector('.registration-steps');
                    const items = [...steps.children];
                    const labels = items.map((item) => getComputedStyle(item.querySelector(':scope > div')).display !== 'none');
                    const bounds = document.documentElement.getBoundingClientRect();
                    const rows = new Set(items.map((item) => Math.round(item.getBoundingClientRect().top)));
                    return {
                        viewportWidth: innerWidth,
                        documentWidth: document.documentElement.scrollWidth,
                        rows: rows.size,
                        labels,
                        badge: document.querySelector('.registration-card-badge').getBoundingClientRect().toJSON(),
                        returnAffordance: (() => {
                            const link = document.querySelector('.registration-return');
                            const after = getComputedStyle(link, '::before').content;
                            return link.innerText.trim().length > 0 || (after !== 'none' && after !== 'normal' && after !== '""');
                        })(),
                        progressVisible: steps.getBoundingClientRect().width > 0,
                        currentStep: document.querySelector('[data-step-indicator="1"]')?.getAttribute('aria-current'),
                        boundsWidth: bounds.width
                    };
                });

                expect(layout.documentWidth, JSON.stringify({ route, viewport, theme, layout }))
                    .toBeLessThanOrEqual(layout.viewportWidth + 1);
                expect(layout.progressVisible).toBe(true);
                expect(layout.currentStep).toBe('step');

                if (viewport.mode === 'tablet') {
                    expect(layout.rows, JSON.stringify({ route, viewport, theme, layout })).toBe(2);
                    expect(layout.labels.every(Boolean)).toBe(true);
                } else if (viewport.mode === 'mobile' || viewport.mode === 'mobile-compact') {
                    expect(layout.rows, JSON.stringify({ route, viewport, theme, layout })).toBe(1);
                    expect(layout.labels.every(Boolean)).toBe(false);
                    expect(layout.returnAffordance, JSON.stringify({ route, viewport, theme, layout })).toBe(true);
                    expect(layout.badge.height, JSON.stringify({ route, viewport, theme, layout })).toBeLessThanOrEqual(40);
                    expect(layout.badge.height, JSON.stringify({ route, viewport, theme, layout })).toBeLessThanOrEqual(layout.badge.width + 8);
                } else {
                    expect(layout.rows).toBe(1);
                    expect(layout.labels.every(Boolean)).toBe(true);
                }

                if (route.name === 'gym' && viewport.width === 768 && theme === 'light') {
                    const artifactDirectory = path.join(process.cwd(), 'qa/artifacts/registration-v2');
                    fs.mkdirSync(artifactDirectory, { recursive: true });
                    await page.screenshot({ path: path.join(artifactDirectory, 'registration-gym-tablet-768-light.png'), fullPage: true });
                }
                if (route.name === 'trainer' && viewport.width === 320 && theme === 'dark') {
                    const artifactDirectory = path.join(process.cwd(), 'qa/artifacts/registration-v2');
                    fs.mkdirSync(artifactDirectory, { recursive: true });
                    await page.screenshot({ path: path.join(artifactDirectory, 'registration-trainer-mobile-320-dark.png'), fullPage: true });
                }
            }
        }
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/register-gym.html', { waitUntil: 'domcontentloaded' });
    await page.locator('#registrationNext').click();
    await expect(page.locator('[data-registration-step="1"]')).toBeVisible();
    await expect(page.locator('[data-registration-step="2"]')).toBeHidden();
});
