const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const planCatalog = require('../../src/services/saas-plan-catalog');
const featureCatalog = require('../../src/services/feature-catalog');

const OUTPUT_DIR = path.resolve('qa/artifacts/library-v2-screen-continuation');
const VIEWPORTS = [320, 390, 768, 1440];
const THEMES = ['light', 'dark'];
const DIRECTIONS = ['rtl', 'ltr'];
const LIBRARY_TYPES = [
    { key: 'muscles', label: 'العضلات', rowName: 'عضلة اختبار', firstHeader: 'العضلة' },
    { key: 'foods', label: 'الأطعمة', rowName: 'وجبة اختبار متوازنة', firstHeader: 'الطعام' },
    { key: 'exercises', label: 'التمارين', rowName: 'تمرين اختبار طويل الاسم', firstHeader: 'التمرين' }
];

function json(route, payload, status = 200) {
    return route.fulfill({ status, contentType: 'application/json; charset=utf-8', body: JSON.stringify(payload) });
}

function libraryPayload(type) {
    const item = type === 'muscles'
        ? { id: 6101, nameAr: 'عضلة اختبار', name: 'QA muscle', bodyPart: 'Upper body', descriptionAr: 'وصف تجريبي طويل لاختبار العرض دون تعديل بيانات حقيقية.' }
        : type === 'foods'
            ? { id: 6201, nameAr: 'وجبة اختبار متوازنة', nameEn: 'Balanced QA meal', category: 'meals', calories: 725, protein: 38, carbs: 64, fat: 22, fiber: 9, sugar: 5, sodium: 480, servingSize: 350, servingUnit: 'gram' }
            : { id: 6301, nameAr: 'تمرين اختبار طويل الاسم', name: 'Long QA exercise name', targetMuscleId: 6101, targetMuscleNameAr: 'الصدر', difficulty: 'intermediate', equipment: 'dumbbell', category: 'strength', isHighImpact: true, descriptionAr: 'وصف تمرين تجريبي.' };
    return { items: [item], pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } };
}

test('Library V2 tabs, records and dialogs remain usable in RTL/LTR across viewport, theme and direction', async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    test.skip(testInfo.project.name !== 'desktop', 'The test owns its complete internal viewport, theme and direction matrix.');
    const plan = planCatalog.PLAN_CONFIGURATIONS.find((entry) => entry.code === 'business');
    const writes = [];
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const method = request.method();
        if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
            writes.push(`${method} ${url.pathname}`);
            return json(route, { error: 'Read-only visual fixture: write blocked.' }, 405);
        }
        if (url.pathname === '/api/auth/session') return json(route, { authenticated: true, user: { id: 9301, name: 'Library QA Owner', role: 'Owner', tenantType: 'gym', permissions: [] } });
        if (url.pathname === '/api/branding') return json(route, { identity: { brandName: 'Library QA Gym' } });
        if (url.pathname === '/api/saas/entitlements') return json(route, {
            tenantStatus: 'active',
            subscription: { status: 'active', plan: { code: plan.code, name: plan.name } },
            entitlements: { tenantType: 'gym', features: planCatalog.featureFlagsForPlan(plan.code), featureCatalog: featureCatalog.getFeatureCatalog({ tenantType: 'gym' }) }
        });
        if (url.pathname === '/api/branches/bootstrap') return json(route, { branches: [], activeBranches: [], sections: [], defaultBranch: null });
        if (url.pathname === '/api/library/options') return json(route, {
            counts: { muscles: 1, foods: 1, exercises: 1 },
            filters: {
                bodyParts: ['Upper body'], categories: ['meals'], exerciseCategories: ['strength'], difficulties: ['intermediate'], equipment: ['dumbbell'],
                muscles: [{ id: 6101, nameAr: 'الصدر', name: 'Chest', bodyPart: 'Upper body' }]
            }
        });
        if (/^\/api\/library\/(muscles|foods|exercises)$/.test(url.pathname)) return json(route, libraryPayload(url.pathname.split('/').at(-1)));
        if (url.pathname === '/api/library/exercises/6301') return json(route, { item: libraryPayload('exercises').items[0] });
        return json(route, {});
    });

    for (const width of VIEWPORTS) {
        await page.setViewportSize({ width, height: width <= 390 ? 844 : 960 });
        await page.goto(`/index.html?libraryV2=${width}#library`, { waitUntil: 'domcontentloaded' });
        await expect(page.locator('#librarySection')).toBeVisible();
        await expect(page.locator('#libraryDetailsDialog')).toHaveCount(1);
        await expect(page.locator('#libraryFormDialog')).toHaveCount(1);

        for (const theme of THEMES) {
            await page.evaluate((value) => window.TopGymTheme?.set?.(value) || (document.documentElement.dataset.theme = value), theme);
            for (const direction of DIRECTIONS) {
            await page.evaluate((value) => {
                document.documentElement.dir = value;
                document.body.dir = value;
            }, direction);
            const defaultTab = page.locator('[data-library-type="foods"]');
            if (await defaultTab.getAttribute('aria-selected') !== 'true') await defaultTab.click();
            await expect(defaultTab).toHaveAttribute('aria-selected', 'true');

            for (const type of LIBRARY_TYPES) {
                const tab = page.locator(`[data-library-type="${type.key}"]`);
                if (await tab.getAttribute('aria-selected') !== 'true') await tab.click();
                await expect(tab).toHaveAttribute('aria-selected', 'true');
                const table = page.locator(`#libraryList .library-data-table.${type.key}`);
                await expect(table).toBeVisible();
                await expect(table.locator('tbody tr')).toHaveCount(1);
                await expect(table.locator('tbody tr td:first-child')).toContainText(type.rowName);
                await expect(table.locator('tbody tr td:last-child [data-library-action="details"]')).toBeVisible();
                await expect(table.locator('tbody tr td:last-child [data-library-action="edit"]')).toBeVisible();
                await expect(table.locator('tbody tr td:last-child [data-library-action="delete"]')).toBeVisible();

                const layout = await page.evaluate((key) => {
                    const root = document.querySelector('#librarySection');
                    const table = root.querySelector(`.library-data-table.${key}`);
                    const wrap = root.querySelector('.library-table-wrap');
                    const row = table.querySelector('tbody tr');
                    return {
                        viewport: innerWidth,
                        pageWidth: document.documentElement.scrollWidth,
                        direction: getComputedStyle(root).direction,
                        tableMinWidth: parseFloat(getComputedStyle(table).minWidth),
                        rowColumns: getComputedStyle(row).gridTemplateColumns,
                        wrapOverflowX: getComputedStyle(wrap).overflowX,
                        tabColumns: getComputedStyle(root.querySelector('.library-type-tabs')).gridTemplateColumns
                    };
                }, type.key);
                expect(layout.pageWidth, `${type.key} ${width}px ${theme} must not overflow the page`).toBeLessThanOrEqual(width);
                expect(layout.direction).toBe(direction);
                const searchGeometry = await page.locator('#librarySearch').evaluate((input) => {
                    const icon = input.closest('.library-search').querySelector(':scope > .ui-icon');
                    const inputRect = input.getBoundingClientRect();
                    const iconRect = icon.getBoundingClientRect();
                    const style = getComputedStyle(input);
                    const isRtl = style.direction === 'rtl';
                    const paddingStart = parseFloat(isRtl ? style.paddingRight : style.paddingLeft);
                    const iconClearance = isRtl
                        ? iconRect.left - (inputRect.right - paddingStart)
                        : inputRect.left + paddingStart - iconRect.right;
                    return { direction: style.direction, paddingStart, iconWidth: iconRect.width, iconClearance };
                });
                expect(searchGeometry.direction).toBe(direction);
                expect(searchGeometry.paddingStart).toBeGreaterThanOrEqual(44);
                expect(searchGeometry.iconClearance).toBeGreaterThanOrEqual(0);
                if (width <= 900) {
                    expect(layout.tableMinWidth).toBe(0);
                    expect(layout.wrapOverflowX).toBe('visible');
                    expect(layout.rowColumns.trim().split(/\s+/)).toHaveLength(width <= 390 ? 1 : 2);
                } else {
                    expect(layout.tableMinWidth).toBeGreaterThan(0);
                    expect(layout.rowColumns).toBe('none');
                }

                await fs.mkdir(OUTPUT_DIR, { recursive: true });
                const tabStyle = await tab.evaluate((element) => ({
                    background: getComputedStyle(element).backgroundColor,
                    themeColors: (() => {
                        const probe = document.createElement('span');
                        document.body.append(probe);
                        probe.style.backgroundColor = 'var(--color-primary)';
                        const primary = getComputedStyle(probe).backgroundColor;
                        probe.style.backgroundColor = 'var(--color-surface)';
                        const surface = getComputedStyle(probe).backgroundColor;
                        probe.remove();
                        return { primary, surface };
                    })(),
                    textAlign: getComputedStyle(element).textAlign,
                    direction: getComputedStyle(element).direction
                }));
                expect(tabStyle.direction).toBe(direction);
                expect(tabStyle.background, JSON.stringify(tabStyle)).toBe(tabStyle.themeColors.surface);
                expect(tabStyle.background).not.toBe(tabStyle.themeColors.primary);
                await page.locator('#librarySection').screenshot({ path: path.join(OUTPUT_DIR, `library-${type.key}-${width}-${theme}-${direction}.png`) });

                await table.locator('[data-library-action="details"]').click();
                const details = page.locator('#libraryDetailsDialog');
                await expect(details).toBeVisible();
                await expect(details.locator('#libraryDetailsContent')).not.toBeEmpty();
                const detailGeometry = await details.evaluate((dialog) => {
                    const rect = dialog.getBoundingClientRect();
                    const content = dialog.querySelector('#libraryDetailsContent').getBoundingClientRect();
                    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, contentLeft: content.left, contentRight: content.right, pageWidth: document.documentElement.scrollWidth };
                });
                expect(detailGeometry.left).toBeGreaterThanOrEqual(-1);
                expect(detailGeometry.right).toBeLessThanOrEqual(width + 1);
                expect(detailGeometry.contentLeft).toBeGreaterThanOrEqual(detailGeometry.left - 1);
                expect(detailGeometry.contentRight).toBeLessThanOrEqual(detailGeometry.right + 1);
                expect(detailGeometry.pageWidth).toBeLessThanOrEqual(width);
                const detailHeader = await details.locator('.details-dialog-head').evaluate((header) => {
                    const close = header.closest('dialog').querySelector('.dialog-close-button[data-dialog-close-generated]');
                    const b = close.getBoundingClientRect();
                    const textRects = [...header.querySelectorAll('h3, p')].flatMap((element) => {
                        const range = document.createRange();
                        range.selectNodeContents(element);
                        return [...range.getClientRects()].map((rect) => ({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }));
                    });
                    const overlaps = textRects.some((rect) => rect.left < b.right && rect.right > b.left && rect.top < b.bottom && rect.bottom > b.top);
                    return { overlaps, direction: getComputedStyle(header).direction, textRects, close: { left: b.left, right: b.right, top: b.top, bottom: b.bottom } };
                });
                expect(detailHeader.direction).toBe(direction);
                expect(detailHeader.overlaps, JSON.stringify(detailHeader)).toBeFalsy();
                await details.screenshot({ path: path.join(OUTPUT_DIR, `details-${type.key}-${width}-${theme}-${direction}.png`) });
                await details.locator(':scope > .dialog-close-button[data-dialog-close-generated]').click();

                await page.locator('#libraryAddButton').click();
                const formDialog = page.locator('#libraryFormDialog');
                await expect(formDialog).toBeVisible();
                await expect(formDialog.locator('#libraryFormFields input, #libraryFormFields select, #libraryFormFields textarea')).not.toHaveCount(0);
                await expect(page.locator('#libraryFormSave')).toBeVisible();
                await expect(page.locator('#libraryFormCancel')).toBeVisible();
                const formGeometry = await formDialog.evaluate((dialog) => {
                    const rect = dialog.getBoundingClientRect();
                    const body = dialog.querySelector(':scope > form.dialog-body').getBoundingClientRect();
                    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, bodyLeft: body.left, bodyRight: body.right, pageWidth: document.documentElement.scrollWidth, scrollHeight: dialog.scrollHeight, clientHeight: dialog.clientHeight };
                });
                expect(formGeometry.left).toBeGreaterThanOrEqual(-1);
                expect(formGeometry.right).toBeLessThanOrEqual(width + 1);
                expect(formGeometry.bodyLeft).toBeGreaterThanOrEqual(formGeometry.left - 1);
                expect(formGeometry.bodyRight).toBeLessThanOrEqual(formGeometry.right + 1);
                expect(formGeometry.pageWidth).toBeLessThanOrEqual(width);
                await formDialog.screenshot({ path: path.join(OUTPUT_DIR, `form-${type.key}-${width}-${theme}-${direction}.png`) });
                await page.locator('#libraryFormCancel').click();
            }
            }
        }
    }

    expect(writes, 'visual QA must not perform API mutations').toEqual([]);
    expect(pageErrors, 'the mounted Library screen must not emit page errors').toEqual([]);
});
