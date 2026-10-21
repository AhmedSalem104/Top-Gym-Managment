const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const featureCatalog = require('../../src/services/feature-catalog');

const SCREENSHOT_ROOT = path.resolve(process.cwd(), 'qa/artifacts/localization-shell-2026-10-12');

async function installShellFixtures(page) {
    await page.route('**/api/**', async (route) => {
        const pathname = new URL(route.request().url()).pathname;
        let payload = {};
        if (pathname === '/api/auth/session') {
            payload = { authenticated: true, user: { id: 944, name: 'Localization QA Gym', role: 'Owner', tenantType: 'gym', permissions: [] } };
        } else if (pathname === '/api/branding') {
            payload = { branding: { identity: { brandName: 'Localization QA Gym' }, assets: {} } };
        } else if (pathname === '/api/saas/entitlements') {
            payload = {
                tenantStatus: 'active',
                subscription: { status: 'active', plan: { code: 'business', name: 'Business' } },
                entitlements: {
                    tenantType: 'gym',
                    features: { dashboard: true, members: true, attendance: true, reports: true },
                    featureCatalog: featureCatalog.getFeatureCatalog({ tenantType: 'gym' }),
                    limits: {}
                }
            };
        } else if (pathname === '/api/branches/bootstrap') {
            payload = {
                branches: [{ id: 1, name: 'Main Branch', status: 'active', isMain: true }],
                activeBranches: [{ id: 1, name: 'Main Branch', status: 'active', isMain: true }],
                defaultBranch: { id: 1, name: 'Main Branch', status: 'active', isMain: true },
                sections: [{ id: 11, name: 'Mixed', type: 'mixed', branchId: 1, active: true }],
                branchLimit: 1,
                hasMultipleActiveBranches: false,
                canUseAllBranches: false
            };
        } else if (pathname === '/api/dashboard') {
            payload = { stats: {}, alerts: [] };
        }
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
    });
}

test('Gym shell language switch is live, persistent, route-safe, theme-safe, and direction-aware', async ({ page }, testInfo) => {
    await fs.mkdir(SCREENSHOT_ROOT, { recursive: true });
    await page.addInitScript(() => localStorage.setItem('topgym-theme', 'dark'));
    await installShellFixtures(page);
    await page.goto('/index.html#dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toHaveAttribute('data-top-gym-authenticated', 'true');
    await page.waitForFunction(() => Boolean(window.TopGymI18n));
    const arabicChoice = page.locator('.topbar-language-toggle [data-locale-choice="ar"]');
    const englishChoice = page.locator('.topbar-language-toggle [data-locale-choice="en"]');
    await expect(arabicChoice).toBeVisible();
    await expect(englishChoice).toBeVisible();
    await expect(arabicChoice).toHaveAttribute('aria-pressed', 'true');
    await expect(englishChoice).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('[data-page-tab="members"] > span')).toHaveText('المشتركون');
    expect(await page.locator('.topbar-inner').evaluate((element) => getComputedStyle(element).direction)).toBe('rtl');
    expect(await page.locator('[data-page-tab="members"] > span').evaluate((element) => getComputedStyle(element).fontFamily)).toContain('Tajawal');
    const languageButtonSize = await page.locator('.topbar-language-toggle').evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
    });
    expect(languageButtonSize.width).toBeGreaterThanOrEqual(40);
    expect(languageButtonSize.height).toBeGreaterThanOrEqual(40);
    if (page.viewportSize().width <= 767) {
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow).toBeLessThanOrEqual(1);
    }
    const projectShots = path.join(SCREENSHOT_ROOT, testInfo.project.name);
    await fs.mkdir(projectShots, { recursive: true });
    await page.screenshot({ path: path.join(projectShots, 'arabic-rtl.png'), fullPage: false });

    let mainFrameNavigations = 0;
    page.on('framenavigated', (frame) => {
        if (frame === page.mainFrame()) mainFrameNavigations += 1;
    });
    const originalUrl = page.url();
    await englishChoice.click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.locator('[data-page-tab="members"] > span')).toHaveText('Members');
    await expect(page.locator('[data-page-tab="branches"] > span')).toHaveText('Branches & sections');
    await expect(page.locator('[data-nav-group-label="workspace"]')).toContainText('Workspace');
    await expect(page.locator('#mobileNavCurrent')).toHaveText('Dashboard');
    await page.evaluate(() => {
        const button = document.createElement('button');
        button.id = 'i18nDynamicTabProbe';
        button.className = 'page-tab';
        button.dataset.pageTab = 'members';
        button.innerHTML = '<span>المشتركون</span>';
        document.getElementById('pageTabs').append(button);
    });
    await expect(page.locator('#i18nDynamicTabProbe > span')).toHaveText('Members');
    await page.locator('#i18nDynamicTabProbe').evaluate((element) => element.remove());
    expect(await page.locator('.topbar-inner').evaluate((element) => getComputedStyle(element).direction)).toBe('ltr');
    expect(await page.locator('[data-page-tab="members"] > span').evaluate((element) => getComputedStyle(element).fontFamily)).toContain('Geist Variable');
    await expect(arabicChoice).toHaveAttribute('aria-pressed', 'false');
    await expect(englishChoice).toHaveAttribute('aria-pressed', 'true');
    expect(page.url()).toBe(originalUrl);
    expect(mainFrameNavigations).toBe(0);
    expect(await page.evaluate(() => localStorage.getItem('logic-fit-ui-locale'))).toBe('en');
    expect(await page.evaluate(() => localStorage.getItem('topgym-theme'))).toBe('dark');
    await page.screenshot({ path: path.join(projectShots, 'english-ltr.png'), fullPage: false });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('[data-page-tab="members"] > span')).toHaveText('Members');
    await expect(page.locator('#themeToggleButton')).toHaveAttribute('aria-pressed', 'true');

    await arabicChoice.click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('[data-page-tab="members"] > span')).toHaveText('المشتركون');
    await expect(arabicChoice).toHaveAttribute('aria-pressed', 'true');
});
