'use strict';

const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const planCatalog = require('../../src/services/saas-plan-catalog');
const featureCatalog = require('../../src/services/feature-catalog');

const BASE_URL = process.env.BRANDING_QA_BASE_URL || 'http://127.0.0.1:4173';
const OUTPUT = path.resolve(process.cwd(), 'qa/artifacts/branding-interactions-readonly-v2');
const WIDTHS = [320, 390, 768, 1440];
const LOCALES = ['ar', 'en'];
const THEMES = ['light', 'dark'];
const TENANT_NAME = 'Branding QA Gym';
const BASE_FIXTURE = {
    draft: {
        identity: { brandName: TENANT_NAME, englishBrandName: TENANT_NAME, shortName: 'BQ', paymentMethods: [] },
        assets: {},
        themes: { light: {}, dark: {} }
    },
    published: {},
    version: 3,
    metadata: null,
    audit: []
};
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

test('Branding asset controls, existing-asset preview and confirmation dialogs are keyboard accessible and read only', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'A single desktop browser runs the full Branding interaction matrix.');
    test.setTimeout(180_000);

    const requests = [];
    const pageErrors = [];
    const fixture = structuredClone(BASE_FIXTURE);
    fixture.draft.assets.primaryLogo = {
        key: 'primaryLogo',
        url: '/assets/gym-brand.svg',
        fileName: 'qa-brand.svg',
        mimeType: 'image/svg+xml',
        width: 256,
        height: 256
    };
    const plan = planCatalog.PLAN_CONFIGURATIONS.find((item) => item.code === 'business');

    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const method = request.method().toUpperCase();
        requests.push({ method, pathname: url.pathname });
        if (!READ_METHODS.has(method)) {
            return route.fulfill({ status: 405, contentType: 'application/json; charset=utf-8', body: JSON.stringify({ error: 'Read-only Branding interaction QA: mutation blocked.' }) });
        }

        let payload = {};
        if (url.pathname === '/api/auth/session') {
            payload = { authenticated: true, user: { id: 98140, name: 'Brand QA Owner', role: 'Owner', tenantType: 'gym', permissions: [] } };
        } else if (url.pathname === '/api/saas/entitlements') {
            payload = { tenantStatus: 'active', subscription: { status: 'active', plan: { code: plan.code, name: plan.name } }, entitlements: { tenantType: 'gym', features: planCatalog.featureFlagsForPlan(plan.code), featureCatalog: featureCatalog.getFeatureCatalog({ tenantType: 'gym' }) } };
        } else if (url.pathname === '/api/branding/settings') {
            payload = fixture;
        } else if (url.pathname === '/api/branding') {
            payload = { branding: { identity: { brandName: TENANT_NAME }, assets: fixture.draft.assets }, version: fixture.version };
        } else if (url.pathname === '/api/bootstrap' || url.pathname === '/api/branches/bootstrap') {
            const branch = { id: 1, name: 'QA Main Branch', code: 'qa-main', status: 'active', isMain: true };
            payload = { branches: [branch], activeBranches: [branch], defaultBranch: branch, sections: [] };
        }
        return route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(payload) });
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await fs.mkdir(OUTPUT, { recursive: true });
    await page.goto(`${BASE_URL}/index.html#branding`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.topGymAuth?.isReady?.() === true, null, { timeout: 25_000 });
    await page.locator('[data-page-tab="branding"]').click();
    const section = page.locator('#brandingSection');
    await expect(section).toBeVisible();
    await expect(page.locator('#brandingBrandName')).toHaveValue(TENANT_NAME);
    await page.locator('[data-branding-section="assets"]').click();

    const evidence = [];
    let expectedDraftName = TENANT_NAME;
    for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: width <= 390 ? 844 : 960 });
        for (const theme of THEMES) {
            await page.evaluate((mode) => window.TopGymTheme?.set?.(mode), theme);
            for (const locale of LOCALES) {
                await page.evaluate((value) => window.TopGymI18n?.set?.(value), locale);
                await page.locator('[data-branding-section="assets"]').click();
                const assetCard = page.locator('.branding-asset-card').first();
                const upload = assetCard.locator('[data-branding-file-trigger="primaryLogo"]');
                const remove = assetCard.locator('[data-branding-remove="primaryLogo"]');
                const image = assetCard.locator('.branding-asset-preview img');

                await expect(upload).toBeVisible();
                await expect(upload).toHaveAccessibleName(locale === 'en' ? 'Upload or replace' : 'رفع أو استبدال');
                await expect(image).toBeVisible();
                expect(await image.evaluate((element) => element.naturalWidth)).toBeGreaterThan(0);
                await expect(page.locator('#brandingBrandName')).toHaveValue(expectedDraftName);

                // Shift+Tab from the adjacent remove action proves the upload control
                // participates in native keyboard order and receives the V2 focus ring.
                await remove.focus();
                await page.keyboard.press('Shift+Tab');
                const focus = await upload.evaluate((element) => ({
                    active: document.activeElement === element,
                    visible: element.matches(':focus-visible'),
                    outline: getComputedStyle(element).outlineStyle,
                    outlineWidth: parseFloat(getComputedStyle(element).outlineWidth)
                }));
                expect(focus.active, `${width}/${locale}/${theme}: upload action should be in keyboard order`).toBe(true);
                expect(focus.visible, `${width}/${locale}/${theme}: upload action should show keyboard focus`).toBe(true);
                expect(focus.outline).not.toBe('none');
                expect(focus.outlineWidth).toBeGreaterThanOrEqual(2);
                await section.screenshot({ path: path.join(OUTPUT, `assets-${width}-${locale}-${theme}.png`), animations: 'disabled' });

                // Open the native picker from the focused button, then close it with
                // an empty selection. No file is provided and no upload request can run.
                const pickerPromise = page.waitForEvent('filechooser');
                await page.keyboard.press('Enter');
                const picker = await pickerPromise;
                await picker.setFiles([]);
                expect(await assetCard.locator('input[type="file"]').evaluate((input) => input.files.length)).toBe(0);

                await remove.click();
                const removeDialog = page.locator('.swal2-popup');
                await expect(removeDialog).toBeVisible();
                await expect(removeDialog.locator('.swal2-title')).toHaveText(locale === 'en' ? 'Remove this branding asset?' : 'إزالة أصل الهوية؟');
                await expectDialogWithinViewport(removeDialog, width);
                await page.screenshot({ path: path.join(OUTPUT, `remove-dialog-${width}-${locale}-${theme}.png`), animations: 'disabled' });
                await removeDialog.locator('.swal2-cancel').click();
                await expect(removeDialog).toBeHidden();
                await expect(image).toBeVisible();

                const reset = page.locator('#brandingResetButton');
                await reset.scrollIntoViewIfNeeded();
                await reset.click();
                const resetDialog = page.locator('.swal2-popup');
                await expect(resetDialog).toBeVisible();
                await expect(resetDialog.locator('.swal2-title')).toHaveText(locale === 'en' ? 'Restore the default identity?' : 'استعادة الهوية الافتراضية؟');
                await expectDialogWithinViewport(resetDialog, width);
                await page.screenshot({ path: path.join(OUTPUT, `reset-dialog-${width}-${locale}-${theme}.png`), animations: 'disabled' });
                await resetDialog.locator('.swal2-cancel').click();
                await expect(resetDialog).toBeHidden();

                await page.locator('[data-branding-section="identity"]').click();
                const brandName = page.locator('#brandingBrandName');
                const unsavedValue = `${TENANT_NAME} ${width}`;
                await brandName.fill(unsavedValue);
                expectedDraftName = unsavedValue;
                await page.evaluate(() => { window.__brandingLeaveResult = window.topGymBrandingEditor.confirmLeave(); });
                const leaveDialog = page.locator('.swal2-popup');
                await expect(leaveDialog).toBeVisible();
                await expect(leaveDialog.locator('.swal2-title')).toHaveText(locale === 'en' ? 'You have unsaved changes' : 'لديك تغييرات غير محفوظة');
                await expectDialogWithinViewport(leaveDialog, width);
                await page.screenshot({ path: path.join(OUTPUT, `leave-dialog-${width}-${locale}-${theme}.png`), animations: 'disabled' });
                await leaveDialog.locator('.swal2-cancel').click();
                await expect(leaveDialog).toBeHidden();
                expect(await page.evaluate(async () => await window.__brandingLeaveResult)).toBe(false);
                await expect(brandName).toHaveValue(unsavedValue);

                evidence.push({ width, locale, theme, imageLoaded: true, keyboardFocus: focus, chooserCancelledWithoutFile: true, removeDialog: 'opened-and-cancelled', resetDialog: 'opened-and-cancelled', leaveDialog: 'opened-and-cancelled-with-draft-preserved' });
            }
        }
    }

    const writes = requests.filter(({ method }) => !READ_METHODS.has(method));
    expect(writes, 'Every branding mutation API must remain blocked and uncalled').toEqual([]);
    expect(pageErrors, 'No browser runtime errors during Branding interactions').toEqual([]);
    await fs.writeFile(path.join(OUTPUT, 'matrix.json'), JSON.stringify({
        generatedAt: new Date().toISOString(),
        viewports: WIDTHS,
        themes: THEMES,
        locales: LOCALES,
        cases: evidence.length,
        expectedCases: WIDTHS.length * THEMES.length * LOCALES.length,
        readOnly: true,
        mutationRequests: writes.length,
        loadedFixtureAsset: '/assets/gym-brand.svg',
        uploadFilesSelected: 0,
        dialogsSubmitted: 0,
        pageErrors,
        evidence
    }, null, 2), 'utf8');
});

async function expectDialogWithinViewport(dialog, width) {
    const bounds = await dialog.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, width: rect.width, viewport: innerWidth };
    });
    expect(bounds.width, `${width}px dialog must have visible width`).toBeGreaterThan(0);
    expect(bounds.left, `${width}px dialog clipped at inline start: ${JSON.stringify(bounds)}`).toBeGreaterThanOrEqual(0);
    expect(bounds.right, `${width}px dialog clipped at inline end: ${JSON.stringify(bounds)}`).toBeLessThanOrEqual(width + 1);
}
