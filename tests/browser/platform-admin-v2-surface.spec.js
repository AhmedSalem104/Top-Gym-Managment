const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');

test('Platform Admin shell follows the canonical sidebar surface in both themes and stays contained', async ({ page }, testInfo) => {
    await page.route('**/api/**', async (route) => {
        const pathname = new URL(route.request().url()).pathname;
        const payload = pathname === '/api/auth/session'
            ? { authenticated: true, user: { id: 9001, role: 'PlatformAdmin', name: 'QA Platform Admin' } }
            : {};
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
    });

    await page.goto('/platform-admin.html#gyms', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#platformAdminApp')).toBeVisible();

    const widths = testInfo.project.name === 'desktop' ? [1440, 1024, 768, 390, 320] : [page.viewportSize().width];
    for (const width of widths) {
        await page.setViewportSize({ width, height: width < 600 ? 780 : 900 });
        for (const theme of ['light', 'dark']) {
            await page.locator('html').evaluate((element, value) => { element.dataset.theme = value; }, theme);
            await page.waitForTimeout(100);
            const shell = await page.evaluate(() => {
                const sidebar = document.querySelector('.platform-sidebar');
                const probe = document.createElement('div');
                probe.style.backgroundColor = 'var(--bg-sidebar)';
                document.body.append(probe);
                const expectedSurface = getComputedStyle(probe).backgroundColor;
                probe.remove();
                const actualSurface = getComputedStyle(sidebar).backgroundColor;
                return {
                    viewportWidth: innerWidth,
                    documentWidth: document.documentElement.scrollWidth,
                    sidebarSurface: actualSurface,
                    expectedSurface,
                    sidebarGradient: getComputedStyle(sidebar).backgroundImage,
                    sidebarVisible: sidebar.getBoundingClientRect().height > 0
                };
            });
            expect(shell.documentWidth, `${theme} at ${width}px`).toBeLessThanOrEqual(width);
            expect(shell.sidebarVisible).toBe(true);
            expect(shell.sidebarSurface).toBe(shell.expectedSurface);
            expect(shell.sidebarGradient).toBe('none');
            if (['desktop', 'mobile320-light'].includes(testInfo.project.name) && [1440, 390, 320].includes(width)) {
                const evidenceDirectory = path.resolve(process.cwd(), 'qa/artifacts/platform-admin-v2-shell');
                await fs.mkdir(evidenceDirectory, { recursive: true });
                await page.screenshot({ path: path.join(evidenceDirectory, `platform-admin-shell-${width}-${theme}.png`), fullPage: false });
            }
        }
    }
});
