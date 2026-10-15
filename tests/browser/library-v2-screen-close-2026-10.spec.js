'use strict';

const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const planCatalog = require('../../src/services/saas-plan-catalog');
const featureCatalog = require('../../src/services/feature-catalog');

const OUTPUT = path.resolve(process.cwd(), 'qa/artifacts/library-v2-screen-close-2026-10');
const VIEWPORTS = [320, 375, 390, 768, 1024, 1440, 1920];
const THEMES = ['light', 'dark'];
const LOCALES = ['ar', 'en'];
const TYPES = ['muscles', 'foods', 'exercises'];
const fixtures = {
    muscles: { id: 76101, nameAr: 'QA muscle', name: 'QA muscle', bodyPart: 'upper body', descriptionAr: 'QA description for a long enough responsive content sample.' },
    foods: { id: 76201, nameAr: 'QA apple', nameEn: 'QA apple', category: 'fruit', servingSize: 100, servingUnit: 'gram', calories: 52, protein: 0.3, carbs: 14, fat: 0.2, fiber: 2.4, sugar: 10, sodium: 1 },
    exercises: { id: 76301, nameAr: 'QA exercise with a deliberately long name to test wrapping without causing horizontal overflow', name: 'QA exercise with a deliberately long name to test wrapping without causing horizontal overflow', targetMuscleId: 76101, targetMuscleNameAr: 'Chest', difficulty: 'intermediate', equipment: 'dumbbell', category: 'strength', isHighImpact: true, restSeconds: 45, descriptionAr: 'QA exercise description.', instructionsAr: ['Keep a stable position.', 'Use a controlled range of motion.'], tipsAr: ['Choose an appropriate range of motion.'] }
};

function json(route, payload, status = 200) {
    return route.fulfill({ status, contentType: 'application/json; charset=utf-8', body: JSON.stringify(payload) });
}

test('Gym Library V2 visual close matrix preserves localized presentation and existing hooks', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'One authenticated read-only session captures the full viewport/theme/locale matrix.');
    test.setTimeout(240_000);

    const plan = planCatalog.PLAN_CONFIGURATIONS.find((entry) => entry.code === 'business');
    const writes = [];
    const pageErrors = [];
    const reads = [];
    const matrix = [];
    let collectionMode = 'loaded';
    let releaseLoadingResponse;
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const method = request.method().toUpperCase();
        if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
            writes.push(`${method} ${url.pathname}`);
            return json(route, { error: 'Read-only QA blocked a write.' }, 405);
        }
        reads.push({ method, path: url.pathname, search: url.search });
        if (url.pathname === '/api/auth/session') return json(route, { authenticated: true, user: { id: 97601, name: 'Library QA Owner', role: 'Owner', tenantType: 'gym', permissions: [] } });
        if (url.pathname === '/api/branding') return json(route, { identity: { brandName: 'Library QA Gym' }, assets: {} });
        if (url.pathname === '/api/saas/entitlements') return json(route, { tenantStatus: 'active', subscription: { status: 'active', plan: { code: plan.code, name: plan.name } }, entitlements: { tenantType: 'gym', features: planCatalog.featureFlagsForPlan(plan.code), featureCatalog: featureCatalog.getFeatureCatalog({ tenantType: 'gym' }) } });
        if (url.pathname === '/api/branches/bootstrap' || url.pathname === '/api/bootstrap') return json(route, { branches: [], activeBranches: [], sections: [], defaultBranch: null, canUseAllBranches: true });
        if (url.pathname === '/api/library/options') return json(route, { counts: { muscles: 1, foods: 21, exercises: 1 }, filters: { bodyParts: ['upper body'], categories: ['fruit'], exerciseCategories: ['strength'], difficulties: ['intermediate'], equipment: ['dumbbell'], muscles: [{ id: fixtures.muscles.id, nameAr: 'Chest', name: 'Chest' }] } });
        const collectionMatch = url.pathname.match(/^\/api\/library\/(muscles|foods|exercises)$/);
        if (collectionMatch) {
            if (collectionMode === 'loading') {
                await new Promise((resolve) => { releaseLoadingResponse = resolve; });
                return json(route, { items: [fixtures[collectionMatch[1]]], pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } });
            }
            if (collectionMode === 'error') return json(route, { error: 'QA server error.' }, 503);
            if (collectionMode === 'empty') return json(route, { items: [], pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 1 } });
            return json(route, { items: [fixtures[collectionMatch[1]]], pagination: { page: Number(url.searchParams.get('page') || 1), pageSize: 20, totalItems: 1, totalPages: 1 } });
        }
        const detailMatch = url.pathname.match(/^\/api\/library\/(muscles|foods|exercises)\/(\d+)$/);
        if (detailMatch) return json(route, { item: fixtures[detailMatch[1]] });
        return json(route, {});
    });

    await page.addInitScript(() => {
        localStorage.setItem('logic-fit-ui-locale', 'ar');
        localStorage.setItem('topgym-theme', 'light');
    });
    await fs.mkdir(OUTPUT, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto('/index.html#library', { waitUntil: 'domcontentloaded' });
    const section = page.locator('#librarySection');
    await expect(section).toBeVisible();
    await expect.poll(() => page.locator('html').getAttribute('data-top-gym-active-tab')).toBe('library');
    await expect(section.locator('#libraryList tbody tr')).toHaveCount(1);

    for (const width of VIEWPORTS) {
        await page.setViewportSize({ width, height: width <= 390 ? 844 : 960 });
        for (const theme of THEMES) {
            for (const locale of LOCALES) {
                await page.evaluate(({ theme: nextTheme, locale: nextLocale }) => {
                    window.TopGymTheme?.set?.(nextTheme);
                    window.TopGymI18n?.set?.(nextLocale, { persist: false });
                }, { theme, locale });
                await expect(page.locator('html')).toHaveAttribute('lang', locale);
                await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
                const expected = await page.evaluate(() => ({
                    title: window.TopGymI18n.t('gymLibrary.title'),
                    searchPlaceholder: window.TopGymI18n.t('gymLibrary.search.placeholder')
                }));
                await expect(section.locator('#libraryTitle')).toHaveText(expected.title);
                await expect(section.locator('#librarySearch')).toHaveAttribute('placeholder', expected.searchPlaceholder);

                for (const type of TYPES) {
                    const tab = section.locator(`[data-library-type="${type}"]`);
                    if (await tab.getAttribute('aria-selected') !== 'true') await tab.click();
                    await expect(tab).toHaveAttribute('aria-selected', 'true');
                    const table = section.locator(`#libraryList .library-data-table.${type}`);
                    await expect(table.locator('tbody tr')).toHaveCount(1);
                    for (const action of ['details', 'edit', 'delete']) await expect(table.locator(`[data-library-action="${action}"]`)).toBeVisible();
                    const addLabel = await page.evaluate((activeType) => window.TopGymI18n.t(`gymLibrary.type.${activeType}.add`), type);
                    await expect(section.locator('#libraryAddButton')).toContainText(addLabel);

                    const audit = await table.evaluate((element) => {
                        const cells = [...element.querySelectorAll('tbody tr:first-child td')];
                        const actions = [...element.querySelectorAll('.library-action-button')].map((button) => {
                            const rect = button.getBoundingClientRect();
                            return { label: button.getAttribute('aria-label'), width: rect.width, height: rect.height, right: rect.right, left: rect.left };
                        });
                        const root = document.querySelector('#librarySection');
                        return {
                            viewport: innerWidth,
                            documentWidth: document.documentElement.scrollWidth,
                            bodyWidth: document.body.scrollWidth,
                            sectionWidth: root.scrollWidth,
                            direction: getComputedStyle(root).direction,
                            rowColumns: getComputedStyle(element.querySelector('tbody tr')).gridTemplateColumns,
                            wrapOverflow: getComputedStyle(element.closest('.library-table-wrap')).overflowX,
                            narrowestDataCell: Math.min(...cells.slice(1, -1).map((cell) => cell.getBoundingClientRect().width)),
                            labels: cells.map((cell) => cell.dataset.label || ''),
                            actions
                        };
                    });
                    expect(audit.documentWidth, JSON.stringify({ width, theme, locale, type, audit })).toBeLessThanOrEqual(width);
                    expect(audit.bodyWidth).toBeLessThanOrEqual(width);
                    expect(audit.sectionWidth).toBeLessThanOrEqual(width);
                    expect(audit.direction).toBe(locale === 'ar' ? 'rtl' : 'ltr');
                    expect(audit.labels.every(Boolean), JSON.stringify({ type, labels: audit.labels })).toBeTruthy();
                    const minActionTarget = width <= 900 ? 44 : 40;
                    expect(audit.actions.every((action) => action.label && action.width >= minActionTarget && action.height >= minActionTarget && action.right <= width + 1 && action.left >= -1), JSON.stringify({ width, minActionTarget, theme, locale, type, actions: audit.actions })).toBeTruthy();
                    if (width <= 900) expect(audit.rowColumns.trim().split(/\s+/u).length).toBe(width <= 390 ? 1 : 2);
                    if (width > 390 && width <= 900) expect(audit.narrowestDataCell, JSON.stringify({ width, type, audit })).toBeGreaterThan(120);

                    const filename = `library-${type}-${width}-${theme}-${locale}.png`;
                    await section.screenshot({ path: path.join(OUTPUT, filename), animations: 'disabled' });
                    matrix.push({ ...audit, type, theme, locale, filename });
                }
            }
        }
    }

    await page.setViewportSize({ width: 320, height: 844 });
    await page.evaluate(() => {
        window.TopGymTheme?.set?.('light');
        window.TopGymI18n?.set?.('ar', { persist: false });
    });
    await section.locator('[data-library-type="foods"]').click();
    await section.locator('#libraryList [data-library-action="details"]').click();
    const detailsDialog = page.locator('#libraryDetailsDialog');
    const detailsContent = page.locator('#libraryDetailsContent');
    await expect(detailsDialog).toBeVisible();
    const arabicMilligrams = await page.evaluate(() => window.TopGymI18n.t('gymLibrary.value.milligrams'));
    await expect(detailsContent).toContainText(arabicMilligrams);
    await detailsDialog.screenshot({ path: path.join(OUTPUT, 'details-food-320-ar-light.png'), animations: 'disabled' });
    await page.evaluate(() => window.TopGymI18n?.set?.('en', { persist: false }));
    const englishMilligrams = await page.evaluate(() => window.TopGymI18n.t('gymLibrary.value.milligrams'));
    await expect(detailsContent).toContainText(englishMilligrams);
    await detailsDialog.screenshot({ path: path.join(OUTPUT, 'details-food-320-en-light.png'), animations: 'disabled' });
    await detailsDialog.locator('[data-dialog-close]').click();

    await section.locator('[data-library-type="exercises"]').click();
    await section.locator('#libraryList [data-library-action="details"]').click();
    await expect(detailsDialog).toBeVisible();
    const exerciseDetails = await page.evaluate(() => ({
        seconds: window.TopGymI18n.t('gymLibrary.value.seconds'),
        yes: window.TopGymI18n.t('gymLibrary.value.yes')
    }));
    await expect(detailsContent).toContainText(exerciseDetails.seconds);
    await expect(detailsContent).toContainText(exerciseDetails.yes);
    await page.screenshot({ path: path.join(OUTPUT, 'details-exercise-320-en-light.png'), fullPage: true });
    await detailsDialog.locator('[data-dialog-close]').click();

    await page.setViewportSize({ width: 320, height: 844 });
    await page.evaluate(() => {
        window.TopGymTheme?.set?.('light');
        window.TopGymI18n?.set?.('ar', { persist: false });
    });
    await section.locator('[data-library-type="foods"]').click();
    const foodFilter = section.locator('[data-library-filter="category"]');
    await foodFilter.selectOption('fruit');
    await expect.poll(() => reads.some((entry) => entry.path === '/api/library/foods' && new URLSearchParams(entry.search).get('category') === 'fruit')).toBe(true);
    await expect(foodFilter).toHaveValue('fruit');

    await section.locator('#libraryAddButton').click();
    const formDialog = page.locator('#libraryFormDialog');
    await expect(formDialog).toBeVisible();
    const draft = 'QA draft remains intact across locale changes';
    await page.locator('#libraryField_nameAr').fill(draft);
    await page.evaluate(() => window.TopGymI18n?.set?.('en', { persist: false }));
    const translatedFormTitle = await page.evaluate(() => window.TopGymI18n.t('gymLibrary.type.foods.add'));
    await expect(formDialog.locator('#libraryFormTitle')).toHaveText(translatedFormTitle);
    await expect(page.locator('#libraryField_nameAr')).toHaveValue(draft);
    await page.locator('#libraryFormCancel').click();

    collectionMode = 'empty';
    await section.locator('#libraryRefreshButton').click();
    const emptyMessage = await page.evaluate(() => window.TopGymI18n.t('gymLibrary.type.foods.empty'));
    await expect(section.locator('#libraryList .library-empty')).toContainText(emptyMessage);
    await page.screenshot({ path: path.join(OUTPUT, 'state-empty-320-en-light.png'), fullPage: true });

    collectionMode = 'error';
    await section.locator('#libraryRefreshButton').click();
    await expect(section.locator('#libraryList .library-empty')).toBeVisible();
    await page.screenshot({ path: path.join(OUTPUT, 'state-error-320-en-light.png'), fullPage: true });
    await expect(section.locator('#libraryMessage')).toBeHidden({ timeout: 7000 });

    collectionMode = 'loading';
    await section.locator('#libraryRefreshButton').click();
    await expect(section.locator('#libraryList .loading')).toBeVisible();
    await page.screenshot({ path: path.join(OUTPUT, 'state-loading-320-en-light.png'), fullPage: true });
    expect(releaseLoadingResponse, 'loading fixture must hold a library request').toBeTruthy();
    releaseLoadingResponse();
    await expect(section.locator('#libraryList tbody tr')).toHaveCount(1);

    const missingTranslationKeys = await page.evaluate(() => [...new Set([...document.querySelectorAll('#librarySection [data-i18n], #libraryFormDialog [data-i18n], #libraryDetailsDialog [data-i18n]')].map((element) => element.dataset.i18n).filter((key) => key && window.TopGymI18n?.t?.(key) === key))]);
    expect(missingTranslationKeys).toEqual([]);
    expect(writes, 'visual QA must not perform API writes').toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(matrix).toHaveLength(VIEWPORTS.length * THEMES.length * LOCALES.length * TYPES.length);
    await fs.writeFile(path.join(OUTPUT, 'matrix.json'), JSON.stringify({ cases: matrix.length, matrix, reads, writes, pageErrors, missingTranslationKeys }, null, 2));
});
