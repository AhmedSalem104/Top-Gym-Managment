const { test, expect } = require('@playwright/test');

test('Platform Admin pagination uses the central compact variant without page geometry overrides', async ({ page }) => {
    await page.route('**/api/**', async (route) => {
        const pathname = new URL(route.request().url()).pathname;
        const payload = pathname === '/api/auth/session'
            ? { authenticated: true, user: { id: 9001, role: 'PlatformAdmin', name: 'QA Platform Admin' } }
            : {};
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
    });
    await page.goto('/platform-admin.html#gyms', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#platformAdminApp')).toBeVisible();

    const sharedComponents = await page.evaluate(() => {
        const button = document.querySelector('.platform-btn');
        const table = document.querySelector('#tenantDirectory .table-scroll');
        return {
            buttonTarget: Number.parseFloat(getComputedStyle(button).minHeight) >= 42,
            tableHorizontalScroll: getComputedStyle(table).overflowX === 'auto',
            tableVerticalOverflowClosed: getComputedStyle(table).overflowY === 'hidden'
        };
    });
    expect(sharedComponents).toEqual({
        buttonTarget: true,
        tableHorizontalScroll: true,
        tableVerticalOverflowClosed: true
    });

    const pagination = page.locator('#tenantPagination');
    await expect(pagination).toHaveClass(/pagination--compact/u);
    await pagination.evaluate((element) => {
        element.innerHTML = '<button type="button" class="active">1</button><button type="button">2</button>';
    });
    const measurements = await pagination.evaluate((element) => {
        const host = getComputedStyle(element);
        const button = getComputedStyle(element.querySelector('button'));
        const rect = element.getBoundingClientRect();
        return {
            compactHost: host.minHeight === '0px' && host.paddingTop === '0px' && host.borderTopWidth === '0px',
            canonicalTarget: Number.parseFloat(button.minHeight) >= 38,
            fitsViewport: rect.left >= 0 && rect.right <= innerWidth
        };
    });
    expect(measurements).toEqual({ compactHost: true, canonicalTarget: true, fitsViewport: true });

    for (const width of [1440, 1024, 768, 390, 320]) {
        await page.setViewportSize({ width, height: width < 600 ? 800 : 900 });
        const fits = await pagination.evaluate((element) => {
            const rect = element.getBoundingClientRect();
            return rect.left >= 0 && rect.right <= innerWidth
                && Array.from(element.querySelectorAll('button')).every((button) => button.getBoundingClientRect().height >= 38);
        });
        expect(fits, `pagination remains usable at ${width}px`).toBe(true);
    }
});
