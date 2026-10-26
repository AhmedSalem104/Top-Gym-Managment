'use strict';

const { test, expect } = require('@playwright/test');

test('crawler endpoints return their own documents and public registration pages expose canonical metadata', async ({ page }) => {
    const robots = await page.request.get('/robots.txt');
    expect(robots.status()).toBe(200);
    expect(robots.headers()['content-type']).toContain('text/plain');
    expect(await robots.text()).toContain('Sitemap: https://getlogicfit.com/sitemap.xml');

    const sitemap = await page.request.get('/sitemap.xml');
    expect(sitemap.status()).toBe(200);
    expect(sitemap.headers()['content-type']).toMatch(/(?:application|text)\/xml/u);
    const xml = await sitemap.text();
    expect(xml).toContain('https://getlogicfit.com/register-gym');
    expect(xml).toContain('https://getlogicfit.com/register-trainer');
    expect(xml).not.toMatch(/member-portal|platform-admin|trainer-workspace|change-password/u);

    for (const [route, canonical] of [
        ['/register-gym', 'https://getlogicfit.com/register-gym'],
        ['/register-trainer', 'https://getlogicfit.com/register-trainer']
    ]) {
        await page.goto(route, { waitUntil: 'domcontentloaded' });
        await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /.+/u);
        await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', canonical);
        await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
    }
});
