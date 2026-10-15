'use strict';

const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const planCatalog = require('../../src/services/saas-plan-catalog');
const featureCatalog = require('../../src/services/feature-catalog');

const OUTPUT = path.resolve(process.cwd(), 'qa/artifacts/library-dialog-accessibility-v2');
const WIDTHS = [320, 390, 768, 1440];
const THEMES = ['light', 'dark'];
const LOCALES = ['ar', 'en'];
const food = {
    id: 98221,
    nameAr: '\u062a\u0641\u0627\u062d\u0629 \u0627\u062e\u062a\u0628\u0627\u0631',
    nameEn: 'QA apple',
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

function fulfill(route, payload, status = 200) {
    return route.fulfill({
        status,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify(payload)
    });
}

test('Library native dialogs retain controls and keyboard access across locale, theme and viewport', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'A single session captures all Library dialog dimensions and presentation modes.');
    test.setTimeout(240_000);

    const plan = planCatalog.PLAN_CONFIGURATIONS.find((entry) => entry.code === 'business');
    const writes = [];
    const pageErrors = [];
    const evidence = [];
    let deleteConfirmSurface = 'not-tested';
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.route('**/*', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const method = request.method().toUpperCase();
        if (url.origin !== 'http://127.0.0.1:4173') return route.abort('blockedbyclient');
        if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
            writes.push(`${method} ${url.pathname}`);
            return fulfill(route, { error: 'Read-only Library QA blocked this request.' }, 405);
        }
        if (!url.pathname.startsWith('/api/')) return route.continue();
        if (url.pathname === '/api/auth/session') return fulfill(route, { authenticated: true, user: { id: 98220, name: 'Library QA Owner', role: 'Owner', tenantType: 'gym', permissions: [] } });
        if (url.pathname === '/api/branding') return fulfill(route, { identity: { brandName: 'Library QA Gym' }, assets: {} });
        if (url.pathname === '/api/saas/entitlements') return fulfill(route, {
            tenantStatus: 'active',
            subscription: { status: 'active', plan: { code: plan.code, name: plan.name } },
            entitlements: { tenantType: 'gym', features: planCatalog.featureFlagsForPlan(plan.code), featureCatalog: featureCatalog.getFeatureCatalog({ tenantType: 'gym' }) }
        });
        if (url.pathname === '/api/branches/bootstrap' || url.pathname === '/api/bootstrap') return fulfill(route, { branches: [], activeBranches: [], sections: [], defaultBranch: null, canUseAllBranches: true });
        if (url.pathname === '/api/library/options') return fulfill(route, {
            counts: { muscles: 1, foods: 1, exercises: 1 },
            filters: { categories: ['fruit'], bodyParts: ['upper body'], exerciseCategories: ['strength'], difficulties: ['beginner'], equipment: ['body only'], muscles: [{ id: 98222, nameAr: '\u0627\u0644\u0635\u062f\u0631', name: 'Chest' }] }
        });
        if (url.pathname === '/api/library/foods') return fulfill(route, { items: [food], pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } });
        return fulfill(route, {});
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
    const formDialog = page.locator('#libraryFormDialog');
    const detailsDialog = page.locator('#libraryDetailsDialog');

    // There is no Library-specific overflow/context menu in the existing UI:
    // row actions are three direct, permission-tagged buttons. Cover the two
    // actual native dialogs and both add/edit form states without submitting.
    const actionInventory = await section.locator('#libraryList [data-library-action]').evaluateAll((buttons) => buttons.map((button) => ({ action: button.dataset.libraryAction, permission: button.dataset.requiredPermission })));
    expect(actionInventory.map((entry) => entry.action)).toEqual(['details', 'edit', 'delete']);
    expect(actionInventory.map((entry) => entry.permission)).toEqual(['library.read', 'library.update', 'library.delete']);

    for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: width <= 390 ? 844 : 960 });
        for (const theme of THEMES) {
            for (const locale of LOCALES) {
                await page.evaluate(({ nextTheme, nextLocale }) => {
                    window.TopGymTheme?.set?.(nextTheme);
                    window.TopGymI18n?.set?.(nextLocale, { persist: false });
                }, { nextTheme: theme, nextLocale: locale });
                await expect(page.locator('html')).toHaveAttribute('lang', locale);
                await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');

                const addTrigger = section.locator('#libraryAddButton');
                await addTrigger.focus();
                await page.keyboard.press('Enter');
                await expect(formDialog).toBeVisible();
                await expect(formDialog).toHaveAttribute('aria-modal', 'true');
                await expect(formDialog.locator('h3')).toHaveAttribute('id', 'libraryFormTitle');
                const addFields = formDialog.locator('#libraryFormFields [data-library-field]');
                await expect(addFields).toHaveCount(12);
                const unlabeledFields = await addFields.evaluateAll((fields) => fields.filter((field) => !field.id || !document.querySelector(`label[for="${CSS.escape(field.id)}"]`)).map((field) => field.dataset.libraryField));
                expect(unlabeledFields, 'all current food form controls keep their visible label association').toEqual([]);
                for (const fieldName of ['nameAr', 'nameEn', 'category', 'servingSize', 'calories', 'protein', 'carbs', 'fat', 'fiber', 'sugar', 'sodium']) {
                    await expect(formDialog.locator(`[data-library-field="${fieldName}"]`)).toBeAttached();
                }
                await expect(page.locator('#libraryFormSave')).toBeVisible();
                await expect(page.locator('#libraryFormCancel')).toBeVisible();
                await expect.poll(() => formDialog.evaluate((dialog) => dialog.contains(document.activeElement))).toBe(true);
                await assertKeyboardFocusStaysInside(page, formDialog);
                const addGeometry = await inspectDialog(formDialog, page);
                assertDialogBounds(addGeometry, width, 'add form', locale);
                await formDialog.screenshot({ path: path.join(OUTPUT, `form-add-${width}-${theme}-${locale}.png`), animations: 'disabled' });
                await page.keyboard.press('Escape');
                await expect(formDialog).toBeHidden();
                await expect(addTrigger).toBeFocused();
                evidence.push({ width, theme, locale, dialog: 'form-add', ...addGeometry });

                const editTrigger = section.locator('#libraryList [data-library-action="edit"]');
                await editTrigger.focus();
                await page.keyboard.press('Enter');
                await expect(formDialog).toBeVisible();
                await expect(formDialog.locator('#libraryFormTitle')).toContainText(locale === 'en' ? 'Edit' : '\u062a\u0639\u062f\u064a\u0644');
                await expect(formDialog.locator('[data-library-field="nameAr"]')).toHaveValue(food.nameAr);
                await expect(formDialog.locator('[data-library-field="nameEn"]')).toHaveValue(food.nameEn);
                await expect(page.locator('#libraryFormSave')).toBeVisible();
                await expect(page.locator('#libraryFormCancel')).toBeVisible();
                await assertKeyboardFocusStaysInside(page, formDialog);
                const editGeometry = await inspectDialog(formDialog, page);
                assertDialogBounds(editGeometry, width, 'edit form', locale);
                await formDialog.screenshot({ path: path.join(OUTPUT, `form-edit-${width}-${theme}-${locale}.png`), animations: 'disabled' });
                await page.keyboard.press('Escape');
                await expect(formDialog).toBeHidden();
                await expect(editTrigger).toBeFocused();
                evidence.push({ width, theme, locale, dialog: 'form-edit', ...editGeometry });

                const detailsTrigger = section.locator('#libraryList [data-library-action="details"]');
                await detailsTrigger.focus();
                await page.keyboard.press('Enter');
                await expect(detailsDialog).toBeVisible();
                await expect(detailsDialog).toHaveAttribute('aria-modal', 'true');
                await expect(detailsDialog.locator('#libraryDetailsContent')).not.toBeEmpty();
                await expect(detailsDialog.locator(':scope > .dialog-close-button[data-dialog-close-generated]')).toBeVisible();
                await expect.poll(() => detailsDialog.evaluate((dialog) => dialog.contains(document.activeElement))).toBe(true);
                await assertKeyboardFocusStaysInside(page, detailsDialog);
                const detailsGeometry = await inspectDialog(detailsDialog, page);
                assertDialogBounds(detailsGeometry, width, 'details dialog', locale);
                await detailsDialog.screenshot({ path: path.join(OUTPUT, `details-${width}-${theme}-${locale}.png`), animations: 'disabled' });
                await page.keyboard.press('Escape');
                await expect(detailsDialog).toBeHidden();
                await expect(detailsTrigger).toBeFocused();
                evidence.push({ width, theme, locale, dialog: 'details', ...detailsGeometry });
            }
        }
    }

    // The delete action is a direct button, not a menu. Decline its existing
    // confirmation once: if the optional SweetAlert asset is present, inspect
    // that real dialog; otherwise dismiss the browser-native fallback.
    await page.setViewportSize({ width: 320, height: 844 });
    await page.evaluate(() => {
        window.TopGymTheme?.set?.('light');
        window.TopGymI18n?.set?.('ar', { persist: false });
    });
    const deleteTrigger = section.locator('#libraryList [data-library-action="delete"]');
    await deleteTrigger.focus();
    const hasSweetAlert = await page.evaluate(() => Boolean(window.Swal?.fire));
    if (hasSweetAlert) {
        await page.keyboard.press('Enter');
        const confirmation = page.locator('.swal2-popup');
        await expect(confirmation).toBeVisible();
        await expect(confirmation.locator('.swal2-cancel')).toBeVisible();
        await expect(confirmation.locator('.swal2-confirm')).toBeVisible();
        const confirmationGeometry = await confirmation.evaluate((element) => {
            const rect = element.getBoundingClientRect();
            return { left: rect.left, right: rect.right, viewport: innerWidth, pageWidth: document.documentElement.scrollWidth };
        });
        expect(confirmationGeometry.left).toBeGreaterThanOrEqual(-1);
        expect(confirmationGeometry.right).toBeLessThanOrEqual(321);
        expect(confirmationGeometry.pageWidth).toBeLessThanOrEqual(320);
        await confirmation.screenshot({ path: path.join(OUTPUT, 'delete-confirm-320-light-ar.png'), animations: 'disabled' });
        deleteConfirmSurface = 'SweetAlert DOM confirmation inspected and cancelled';
        await page.keyboard.press('Escape');
        await expect(confirmation).toBeHidden();
    } else {
        let browserConfirmType = '';
        page.once('dialog', (confirmation) => {
            browserConfirmType = confirmation.type();
            void confirmation.dismiss();
        });
        await page.keyboard.press('Enter');
        await expect.poll(() => browserConfirmType).toBe('confirm');
        deleteConfirmSurface = 'browser-native confirmation dismissed; optional SweetAlert asset was unavailable in the isolated fixture';
    }
    await expect(deleteTrigger).toBeFocused();

    expect(writes, 'QA must never submit or mutate Library data').toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(evidence).toHaveLength(WIDTHS.length * THEMES.length * LOCALES.length * 3);
    await fs.writeFile(path.join(OUTPUT, 'matrix.json'), JSON.stringify({ cases: evidence.length, actionInventory, deleteConfirmSurface, evidence, writes, pageErrors }, null, 2));
});

async function inspectDialog(dialog, page) {
    return dialog.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const controls = [...element.querySelectorAll('input:not([type="hidden"]), select, textarea, button:not([hidden])')]
            .filter((control) => getComputedStyle(control).display !== 'none' && control.getClientRects().length)
            .map((control) => {
                const box = control.getBoundingClientRect();
                return { id: control.id || control.dataset.libraryField || control.dataset.dialogClose || control.type, left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height };
            });
        return {
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
            pageWidth: document.documentElement.scrollWidth,
            viewport: innerWidth,
            viewportHeight: innerHeight,
            direction: getComputedStyle(element).direction,
            controls
        };
    });
}

async function assertKeyboardFocusStaysInside(page, dialog) {
    await page.keyboard.press('Tab');
    const afterTab = await inspectFocus(dialog);
    expect(afterTab.inside, `Tab escaped the modal: ${JSON.stringify(afterTab)}`).toBe(true);
    await page.keyboard.press('Shift+Tab');
    const afterShiftTab = await inspectFocus(dialog);
    expect(afterShiftTab.inside, `Shift+Tab escaped the modal: ${JSON.stringify(afterShiftTab)}`).toBe(true);
}

async function inspectFocus(dialog) {
    return dialog.evaluate((element) => ({
        inside: element.contains(document.activeElement),
        dialogOpen: element.open,
        activeTag: document.activeElement?.tagName || '',
        activeId: document.activeElement?.id || '',
        activeClass: typeof document.activeElement?.className === 'string' ? document.activeElement.className : ''
    }));
}

function assertDialogBounds(geometry, width, label, locale) {
    expect(geometry.left, `${label}: left edge ${JSON.stringify(geometry)}`).toBeGreaterThanOrEqual(-1);
    expect(geometry.right, `${label}: right edge ${JSON.stringify(geometry)}`).toBeLessThanOrEqual(width + 1);
    expect(geometry.bottom, `${label}: bottom edge ${JSON.stringify(geometry)}`).toBeLessThanOrEqual(geometry.viewportHeight + 1);
    expect(geometry.pageWidth, `${label}: document overflow ${JSON.stringify(geometry)}`).toBeLessThanOrEqual(width);
    expect(geometry.scrollWidth, `${label}: horizontal dialog overflow ${JSON.stringify(geometry)}`).toBeLessThanOrEqual(geometry.clientWidth + 1);
    expect(geometry.direction, `${label}: direction ${JSON.stringify(geometry)}`).toBe(locale === 'ar' ? 'rtl' : 'ltr');
    expect(geometry.controls.length, `${label}: expected visible controls`).toBeGreaterThan(0);
    for (const control of geometry.controls) {
        expect(control.left, `${label}/${control.id} clips left: ${JSON.stringify(control)}`).toBeGreaterThanOrEqual(geometry.left - 1);
        expect(control.right, `${label}/${control.id} clips right: ${JSON.stringify(control)}`).toBeLessThanOrEqual(geometry.right + 1);
    }
}
