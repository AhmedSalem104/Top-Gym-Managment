const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');

const panels = ['dashboard', 'gyms', 'requests', 'gym-registrations', 'payment-methods', 'plans', 'backups', 'audit', 'settings'];

test('all Platform Admin panels remain reachable and viewport-contained in V2 themes', async ({ page }) => {
    await page.route('**/api/**', async (route) => {
        const pathname = new URL(route.request().url()).pathname;
        const payload = pathname === '/api/auth/session'
            ? { authenticated: true, user: { id: 9001, role: 'PlatformAdmin', name: 'QA Platform Admin' } }
            : {};
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
    });

    const evidenceDirectory = path.resolve(process.cwd(), 'qa/artifacts/platform-admin-panels-v2');
    await fs.mkdir(evidenceDirectory, { recursive: true });
    await page.goto('/platform-admin.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#platformAdminApp')).toBeVisible();

    for (const width of [1440, 1024, 768, 390, 320]) {
        await page.setViewportSize({ width, height: width <= 390 ? 844 : 900 });
        for (const theme of ['light', 'dark']) {
            await page.locator('html').evaluate((element, value) => { element.dataset.theme = value; }, theme);
            for (const panel of panels) {
                if (width < 768) {
                    const sidebarOpen = await page.locator('.platform-sidebar').evaluate((element) => element.classList.contains('open'));
                    if (!sidebarOpen) await page.locator('#platformMobileMenu').click();
                }
                const navItem = page.locator(`#platformNav [data-platform-view="${panel}"]`);
                await expect(navItem).toBeAttached();
                // This matrix captures every panel at each viewport; the separate
                // shell test covers the physical mobile drawer trigger. Dispatch
                // the real button click handler here to avoid scrolling the page
                // behind the fixed off-canvas sidebar between captures.
                await navItem.evaluate((button) => button.click());
                const activePanel = page.locator(`.platform-view[data-platform-panel="${panel}"]`);
                await expect(activePanel).toHaveClass(/\bactive\b/);
                const metrics = await page.evaluate(() => ({
                    viewport: innerWidth,
                    document: document.documentElement.scrollWidth,
                    activePanel: document.querySelector('.platform-view.active')?.dataset.platformPanel,
                    title: document.querySelector('#platformPageTitle')?.textContent?.trim()
                }));
                expect(metrics.document, `${panel} ${theme} ${width}px page overflow`).toBeLessThanOrEqual(width);
                expect(metrics.activePanel).toBe(panel);
                if ([1440, 390].includes(width)) {
                    await page.screenshot({
                        path: path.join(evidenceDirectory, `${panel}-${width}-${theme}.png`),
                        fullPage: true
                    });
                }
            }
        }
    }
    console.log(`PLATFORM_ADMIN_PANELS_VERIFIED=${panels.length} VIEWPORTS=5 THEMES=2`);
});
