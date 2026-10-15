'use strict';

const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const planCatalog = require('../../src/services/saas-plan-catalog');
const featureCatalog = require('../../src/services/feature-catalog');

const BASE_URL = process.env.BRANDING_QA_BASE_URL || 'http://127.0.0.1:4173';
const OUTPUT = path.resolve(process.cwd(), 'qa/artifacts/branding-i18n-central');
const WIDTHS = [320, 390, 768, 1440];
const THEMES = ['light', 'dark'];
const LOCALES = ['ar', 'en'];
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const BRANDING_FIXTURE = Object.freeze({
    draft: {
        identity: {
            brandName: 'نادي اختبار الهوية',
            englishBrandName: 'Brand QA Gym',
            shortName: 'BQ',
            paymentMethods: [{ id: 'fixture-method', name: 'بيانات دفع الجيم', accountReference: '01000000000', recipientName: 'مشترك الاختبار', instructions: 'قيمة يكتبها مالك الجيم', isActive: true, sortOrder: 0 }]
        },
        assets: {},
        themes: { light: {}, dark: {} }
    },
    published: {},
    version: 7,
    metadata: null,
    audit: []
});

test('Branding editor uses central Arabic/English copy and preserves draft data in read-only viewport/theme matrix', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'One desktop worker runs the complete Branding locale/theme/viewport matrix.');
    test.setTimeout(120_000);

    const requests = [];
    const plan = planCatalog.PLAN_CONFIGURATIONS.find((item) => item.code === 'business');
    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const method = request.method().toUpperCase();
        requests.push({ method, pathname: url.pathname });
        if (!READ_METHODS.has(method)) {
            return route.fulfill({ status: 405, contentType: 'application/json; charset=utf-8', body: JSON.stringify({ error: 'Read-only Branding i18n fixture: write blocked.' }) });
        }

        let payload = {};
        if (url.pathname === '/api/auth/session') {
            payload = { authenticated: true, user: { id: 98140, name: 'Brand QA Owner', role: 'Owner', tenantType: 'gym', permissions: [] } };
        } else if (url.pathname === '/api/saas/entitlements') {
            payload = { tenantStatus: 'active', subscription: { status: 'active', plan: { code: plan.code, name: plan.name } }, entitlements: { tenantType: 'gym', features: planCatalog.featureFlagsForPlan(plan.code), featureCatalog: featureCatalog.getFeatureCatalog({ tenantType: 'gym' }) } };
        } else if (url.pathname === '/api/branding/settings') {
            payload = JSON.parse(JSON.stringify(BRANDING_FIXTURE));
        } else if (url.pathname === '/api/branding') {
            payload = { branding: { identity: { brandName: BRANDING_FIXTURE.draft.identity.brandName }, assets: {} }, version: BRANDING_FIXTURE.version };
        } else if (url.pathname === '/api/bootstrap' || url.pathname === '/api/branches/bootstrap') {
            const branch = { id: 1, name: 'QA Main Branch', code: 'qa-main', status: 'active', isMain: true };
            payload = { branches: [branch], activeBranches: [branch], defaultBranch: branch, sections: [] };
        }
        return route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(payload) });
    });

    await page.goto(`${BASE_URL}/index.html#branding`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.topGymAuth?.isReady?.() === true, null, { timeout: 25_000 });
    const tab = page.locator('[data-page-tab="branding"]');
    await expect(tab).toBeVisible({ timeout: 25_000 });
    await tab.click();
    const section = page.locator('#brandingSection');
    await expect(section).toBeVisible();
    await expect(page.locator('#brandingBrandName')).toHaveValue(BRANDING_FIXTURE.draft.identity.brandName);
    await expect(page.locator('#brandingPaymentMethods [data-branding-payment-field="name"]')).toHaveValue(BRANDING_FIXTURE.draft.identity.paymentMethods[0].name);

    // Make an unsaved edit before switching locale. The fixture is in memory only;
    // all write methods remain blocked at the network boundary.
    const editedTenantValue = 'نادي اختبار الهوية — تعديل غير محفوظ';
    await page.locator('#brandingBrandName').fill(editedTenantValue);
    await expect(page.locator('#brandingActionTitle')).toContainText('تغييرات غير محفوظة');
    const draftBeforeLocaleSwitch = await page.locator('#brandingBrandName').inputValue();
    const staticDataBefore = await page.evaluate(() => ({
        paymentName: document.querySelector('[data-branding-payment-field="name"]')?.value,
        paymentReference: document.querySelector('[data-branding-payment-field="accountReference"]')?.value,
        previewBrand: document.querySelector('#brandingPreviewName')?.textContent,
        version: document.querySelector('#brandingVersionMeta')?.textContent
    }));

    await fs.mkdir(OUTPUT, { recursive: true });
    const evidence = [];
    for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: width <= 390 ? 844 : 900 });
        for (const theme of THEMES) {
            await page.evaluate((mode) => {
                window.TopGymTheme?.set?.(mode);
                document.documentElement.dataset.theme = mode;
                document.body.dataset.theme = mode;
            }, theme);
            for (const locale of LOCALES) {
                await page.evaluate((value) => window.TopGymI18n.set(value), locale);
                await expect(page.locator('#brandingPageTitle')).toHaveText(locale === 'en' ? 'Branding' : 'تخصيص الهوية');
                await expect(page.locator('[data-branding-section="assets"] span')).toHaveText(locale === 'en' ? 'Logos and assets' : 'الشعارات والأصول');
                await expect(page.locator('#brandingSaveDraftButton')).toHaveText(locale === 'en' ? 'Save draft' : 'حفظ كمسودة');
                await expect(page.locator('#brandingPaymentMethods [data-branding-payment-field="name"]')).toHaveValue(BRANDING_FIXTURE.draft.identity.paymentMethods[0].name);
                await expect(page.locator('#brandingBrandName')).toHaveValue(draftBeforeLocaleSwitch);
                await expect(page.locator('#brandingActionTitle')).toHaveText(locale === 'en' ? 'You have unsaved changes' : 'لديك تغييرات غير محفوظة');

                const snapshot = await page.evaluate(() => ({
                    width: innerWidth,
                    documentWidth: document.documentElement.scrollWidth,
                    bodyWidth: document.body.scrollWidth,
                    direction: getComputedStyle(document.querySelector('#brandingSection')).direction,
                    theme: document.documentElement.dataset.theme,
                    locale: window.TopGymI18n.get(),
                    title: document.querySelector('#brandingPageTitle')?.textContent,
                    brandName: document.querySelector('#brandingBrandName')?.value,
                    paymentName: document.querySelector('[data-branding-payment-field="name"]')?.value,
                    previewBrand: document.querySelector('#brandingPreviewName')?.textContent,
                    selectedSection: document.querySelector('[data-branding-section].active')?.dataset.brandingSection
                }));
                expect(snapshot.documentWidth, `${width}px ${theme} ${locale}: document overflow`).toBeLessThanOrEqual(width);
                expect(snapshot.bodyWidth, `${width}px ${theme} ${locale}: body overflow`).toBeLessThanOrEqual(width);
                expect(snapshot.direction).toBe(locale === 'ar' ? 'rtl' : 'ltr');
                expect(snapshot.theme).toBe(theme);
                expect(snapshot.locale).toBe(locale);
                expect(snapshot.brandName).toBe(draftBeforeLocaleSwitch);
                expect(snapshot.paymentName).toBe(staticDataBefore.paymentName);
                expect(snapshot.previewBrand).toBe(staticDataBefore.previewBrand);
                expect(snapshot.selectedSection).toBe('identity');
                evidence.push(snapshot);

                await section.screenshot({ path: path.join(OUTPUT, `branding-${width}-${theme}-${locale}.png`), animations: 'disabled' });
            }
        }
    }

    expect(requests.filter(({ method }) => !READ_METHODS.has(method)), 'No write request may escape the local fixture').toEqual([]);
    expect(requests.filter(({ pathname, method }) => pathname === '/api/branding/settings' && method === 'GET')).toHaveLength(1);
    expect(JSON.stringify(BRANDING_FIXTURE)).toContain('بيانات دفع الجيم');
    expect(await page.locator('#brandingBrandName').inputValue()).toBe(draftBeforeLocaleSwitch);
    await fs.writeFile(path.join(OUTPUT, 'matrix.json'), JSON.stringify({ generatedAt: new Date().toISOString(), viewports: WIDTHS, themes: THEMES, locales: LOCALES, readOnly: true, brandingSettingsReads: 1, writeRequests: 0, evidence }, null, 2), 'utf8');
});
