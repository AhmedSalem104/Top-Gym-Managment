'use strict';

const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');

const ORIGIN = 'http://127.0.0.1:4173';
const OUTPUT = path.resolve(process.cwd(), 'qa/artifacts/library-central-i18n');
const WIDTHS = [320, 390, 768, 1440];
const THEMES = ['light', 'dark'];
const LOCALES = ['ar', 'en'];
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

test('Gym Library uses central i18n without changing data, form state, or API reads', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'One application session captures the complete responsive/theme/locale matrix.');
    test.setTimeout(180_000);

    const reads = [];
    const writes = [];
    const externalRequests = [];
    const pageErrors = [];
    const food = {
        id: 98301,
        nameAr: 'تفاحة اختبار',
        nameEn: 'QA Apple',
        category: 'fruit',
        servingSize: 100,
        servingUnit: 'gram',
        calories: 52,
        protein: 0.3,
        carbs: 14,
        fat: 0.2,
        fiber: 2.4,
        sugar: 10,
        sodium: 1
    };

    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.route('**/*', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const method = request.method().toUpperCase();
        if (url.origin !== ORIGIN) {
            externalRequests.push(`${method} ${url.origin}${url.pathname}`);
            return route.abort('blockedbyclient');
        }
        if (!url.pathname.startsWith('/api/')) return route.continue();
        if (!SAFE_METHODS.has(method)) {
            writes.push(`${method} ${url.pathname}`);
            return route.fulfill({ status: 405, contentType: 'application/json', body: '{"error":"read-only Library QA"}' });
        }
        reads.push({ method, path: url.pathname, search: url.search });

        let body = {};
        if (url.pathname === '/api/auth/session') {
            body = { authenticated: true, user: { id: 98300, name: 'Library QA Owner', role: 'Owner', tenantType: 'gym', permissions: [] } };
        } else if (url.pathname === '/api/branding') {
            body = { identity: { brandName: 'Library QA Gym' }, assets: {} };
        } else if (url.pathname === '/api/saas/entitlements') {
            body = { tenantStatus: 'active', subscription: { status: 'active', plan: { code: 'business', name: 'Business' } }, entitlements: { tenantType: 'gym', features: { library: true }, featureCatalog: [{ key: 'library', tenantTypes: ['gym'] }] } };
        } else if (url.pathname === '/api/branches/bootstrap' || url.pathname === '/api/bootstrap') {
            body = { branches: [], activeBranches: [], sections: [], defaultBranch: null, canUseAllBranches: true };
        } else if (url.pathname === '/api/library/options') {
            body = { counts: { muscles: 3, foods: 2, exercises: 4 }, filters: { categories: ['fruit'], bodyParts: ['upper body'], exerciseCategories: ['strength'], difficulties: ['beginner'], equipment: ['body only'], muscles: [] } };
        } else if (url.pathname === '/api/library/foods') {
            body = { items: [food], pagination: { page: Number(url.searchParams.get('page') || 1), pageSize: 20, totalItems: 1, totalPages: 1 } };
        }
        return route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(body) });
    });

    await page.addInitScript(() => {
        localStorage.setItem('logic-fit-ui-locale', 'ar');
        localStorage.setItem('topgym-theme', 'light');
    });
    await fs.mkdir(OUTPUT, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto('/index.html#library', { waitUntil: 'domcontentloaded' });
    await expect.poll(() => page.locator('html').getAttribute('data-top-gym-active-tab')).toBe('library');

    const section = page.locator('#librarySection');
    await expect(section).toBeVisible();
    await expect(section.locator('#libraryList tbody tr')).toHaveCount(1);
    await expect(section.locator('#libraryTitle')).toHaveText('مكتبة التدريب والتغذية');
    await expect(section.locator('#libraryList')).toContainText(food.nameAr);
    await expect(section.locator('#libraryList')).toContainText(food.nameEn);
    const libraryReads = () => reads.filter((entry) => entry.path.startsWith('/api/library/'));
    await expect.poll(() => libraryReads().filter((entry) => entry.path === '/api/library/options').length).toBe(1);
    await expect.poll(() => libraryReads().filter((entry) => entry.path === '/api/library/foods').length).toBe(1);

    const search = section.locator('#librarySearch');
    await search.evaluate((input) => { input.value = 'draft state retained'; });
    const screenshots = [];
    for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: width <= 390 ? 850 : 960 });
        for (const theme of THEMES) {
            for (const locale of LOCALES) {
                const readCountBeforeSwitch = libraryReads().length;
                await page.evaluate(({ mode, language }) => {
                    document.documentElement.dataset.theme = mode;
                    document.body.dataset.theme = mode;
                    window.TopGymI18n.set(language, { persist: false });
                }, { mode: theme, language: locale });
                await expect(page.locator('html')).toHaveAttribute('lang', locale);
                await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
                const libraryDebug = await page.evaluate(() => ({
                    locale: window.TopGymI18n?.getLocale?.(),
                    translatedAdd: window.TopGymI18n?.t?.('gymLibrary.type.foods.add'),
                    addMarkup: document.querySelector('#libraryAddButton')?.innerHTML,
                    loadedLibraryScripts: performance.getEntriesByType('resource').map((entry) => entry.name).filter((name) => name.includes('/js/pages/library/library.js'))
                }));
                await expect(section.locator('#libraryTitle')).toHaveText(locale === 'en' ? 'Training & nutrition library' : 'مكتبة التدريب والتغذية');
                await expect(section.locator('#librarySearch')).toHaveAttribute('placeholder', locale === 'en' ? 'Search by name or description…' : 'ابحث بالاسم أو الوصف...');
                await expect(section.locator('#libraryAddButton'), JSON.stringify(libraryDebug)).toContainText(locale === 'en' ? 'Add food' : 'إضافة طعام');
                await expect(section.locator('#libraryRefreshButton')).toHaveText(locale === 'en' ? 'Refresh' : 'تحديث');
                await expect(section.locator('.library-data-table thead')).toContainText(locale === 'en' ? 'Carbohydrates' : 'الكربوهيدرات');
                await expect(section.locator('.library-data-table tbody')).toContainText(locale === 'en' ? 'Fruit' : 'فواكه');
                await expect(section.locator('.library-data-table tbody')).toContainText(food.nameAr);
                await expect(section.locator('.library-data-table tbody')).toContainText(food.nameEn);
                await expect(section.locator('[data-library-action="details"]').first()).toHaveAttribute('aria-label', locale === 'en' ? 'Details' : 'التفاصيل');
                await expect(search).toHaveValue('draft state retained');
                expect(libraryReads().length, 'locale switch must reuse cached Library options and records').toBe(readCountBeforeSwitch);

                const geometry = await page.evaluate(() => ({
                    viewport: innerWidth,
                    document: document.documentElement.scrollWidth,
                    body: document.body.scrollWidth,
                    section: document.getElementById('librarySection').scrollWidth,
                    direction: getComputedStyle(document.getElementById('librarySection')).direction,
                    theme: document.documentElement.dataset.theme
                }));
                expect(geometry.document).toBeLessThanOrEqual(width);
                expect(geometry.body).toBeLessThanOrEqual(width);
                expect(geometry.section).toBeLessThanOrEqual(width);
                expect(geometry.direction).toBe(locale === 'en' ? 'ltr' : 'rtl');
                expect(geometry.theme).toBe(theme);
                await page.evaluate(() => document.fonts.ready);
                const filename = `library-${width}-${theme}-${locale}.png`;
                await section.screenshot({ path: path.join(OUTPUT, filename), animations: 'disabled' });
                screenshots.push({ ...geometry, locale, filename, libraryReads: libraryReads().length });
            }
        }
    }

    await page.evaluate(() => window.TopGymI18n.set('ar', { persist: false }));
    await section.locator('#libraryAddButton').click();
    const dialog = page.locator('#libraryFormDialog');
    await expect(dialog).toBeVisible();
    await page.locator('#libraryField_nameAr').fill('مسودة يجب أن تبقى');
    const readsBeforeDialogSwitch = libraryReads().length;
    await page.evaluate(() => window.TopGymI18n.set('en', { persist: false }));
    await expect(dialog.locator('#libraryFormTitle')).toHaveText('Add food');
    await expect(dialog.locator('.library-form-section-title').first()).toHaveText('Basic information');
    await expect(page.locator('#libraryField_nameAr')).toHaveValue('مسودة يجب أن تبقى');
    expect(libraryReads().length).toBe(readsBeforeDialogSwitch);
    await page.evaluate(() => window.TopGymI18n.set('ar', { persist: false }));
    await expect(dialog.locator('#libraryFormTitle')).toHaveText('إضافة طعام');

    expect(writes, 'Library locale QA must not submit writes').toEqual([]);
    const allowedExternalRequests = new Set([
        'GET https://cdn.jsdelivr.net/npm/sweetalert2@11',
        'GET https://images.unsplash.com/photo-1505253716362-afaea1d3d1af'
    ]);
    expect(externalRequests.every((request) => allowedExternalRequests.has(request)), `Unexpected external request: ${externalRequests.join(', ')}`).toBe(true);
    expect(pageErrors).toEqual([]);
    expect(screenshots).toHaveLength(16);
    await fs.writeFile(path.join(OUTPUT, 'matrix.json'), JSON.stringify({ cases: screenshots.length, screenshots, libraryReads: libraryReads(), writes, externalRequests, pageErrors }, null, 2));
});
