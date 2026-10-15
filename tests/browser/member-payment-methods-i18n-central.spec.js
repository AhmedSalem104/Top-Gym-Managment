'use strict';

const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const planCatalog = require('../../src/services/saas-plan-catalog');
const featureCatalog = require('../../src/services/feature-catalog');

const BASE_URL = process.env.MEMBER_PAYMENT_METHODS_QA_BASE_URL || 'http://127.0.0.1:4173';
const OUTPUT = path.resolve(process.cwd(), 'qa/artifacts/member-payment-methods-i18n-central');
const WIDTHS = [320, 390, 768, 1440];
const THEMES = ['light', 'dark'];
const LOCALES = ['ar', 'en'];
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const METHODS_FIXTURE = Object.freeze({
    draft: {
        identity: {
            paymentMethods: [
                { id: 'fixture-transfer-1', name: 'تحويل محفظة QA', accountReference: 'QA-ACCOUNT-2026', recipientName: 'اسم مستلم عربي غير مترجم', instructions: 'بيانات تجريبية تبقى كما هي عند تبديل اللغة.', isActive: true, sortOrder: 0 },
                { id: 'fixture-transfer-2', name: 'Fixture cash', accountReference: 'QA-CASH-2026', recipientName: 'Fixture recipient', instructions: 'Read-only synthetic fixture', isActive: false, sortOrder: 1 }
            ]
        },
        assets: {},
        themes: { light: {}, dark: {} }
    },
    published: { identity: { paymentMethods: [] }, assets: {}, themes: { light: {}, dark: {} } },
    version: 12,
    metadata: null,
    audit: []
});

test('Gym member payment methods use central Arabic/English i18n across viewport and theme matrix without writes or refetch', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'One desktop worker runs the complete member-payment-methods locale/theme/viewport matrix.');
    test.setTimeout(120_000);

    const requests = [];
    const plan = planCatalog.PLAN_CONFIGURATIONS.find((item) => item.code === 'business');
    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const method = request.method().toUpperCase();
        requests.push({ method, pathname: url.pathname });
        if (!READ_METHODS.has(method)) {
            return route.fulfill({ status: 405, contentType: 'application/json; charset=utf-8', body: JSON.stringify({ error: 'Read-only member payment methods fixture: write blocked.' }) });
        }

        let payload = {};
        if (url.pathname === '/api/auth/session') {
            payload = { authenticated: true, user: { id: 98151, name: 'Payment Methods QA Owner', role: 'Owner', tenantType: 'gym', permissions: [] } };
        } else if (url.pathname === '/api/saas/entitlements') {
            payload = { tenantStatus: 'active', subscription: { status: 'active', plan: { code: plan.code, name: plan.name } }, entitlements: { tenantType: 'gym', features: planCatalog.featureFlagsForPlan(plan.code), featureCatalog: featureCatalog.getFeatureCatalog({ tenantType: 'gym' }) } };
        } else if (url.pathname === '/api/branding/settings') {
            payload = JSON.parse(JSON.stringify(METHODS_FIXTURE));
        } else if (url.pathname === '/api/branding') {
            payload = { branding: { identity: { brandName: 'Synthetic Payment Methods Gym' }, assets: {} }, version: METHODS_FIXTURE.version };
        } else if (url.pathname === '/api/bootstrap' || url.pathname === '/api/branches/bootstrap') {
            const branch = { id: 1, name: 'QA Main Branch', code: 'qa-main', status: 'active', isMain: true };
            payload = { branches: [branch], activeBranches: [branch], defaultBranch: branch, sections: [] };
        }
        return route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(payload) });
    });

    await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173)/u, (route) => route.abort());
    await page.goto(`${BASE_URL}/index.html#member-payment-methods`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.topGymAuth?.isReady?.() === true, null, { timeout: 25_000 });
    await expect.poll(() => page.evaluate(() => Boolean(window.TopGymI18n))).toBe(true);
    const tab = page.locator('[data-page-tab="member-payment-methods"]');
    await expect(tab).toBeVisible({ timeout: 25_000 });
    if (await tab.getAttribute('aria-selected') !== 'true') await tab.click();
    const section = page.locator('#memberPaymentMethodsSection');
    await expect(section).toBeVisible();
    await expect(page.locator('[data-member-payment-row]')).toHaveCount(2);
    await expect(page.locator('#memberPaymentMethodsStatus')).toHaveText('توجد مسودة محفوظة لم تُنشر بعد.');

    // A local edit proves that translations do not rebuild the form or discard live values/state.
    const editedRecipient = 'مستلم اختباري — تعديل محلي غير محفوظ';
    await page.locator('[data-member-payment-field="recipientName"][data-member-payment-index="0"]').fill(editedRecipient);
    await expect(page.locator('#memberPaymentMethodsActionTitle')).toHaveText('لديك تغييرات غير محفوظة');
    const preservedBefore = await page.evaluate(() => ({
        values: [...document.querySelectorAll('#memberPaymentMethodsList [data-member-payment-field]')].map((field) => ({ name: field.dataset.memberPaymentField, index: field.dataset.memberPaymentIndex, value: field.type === 'checkbox' ? field.checked : field.value })),
        rows: [...document.querySelectorAll('#memberPaymentMethodsList [data-member-payment-row]')].map((row) => row.dataset.memberPaymentRow),
        dirtyTitle: document.querySelector('#memberPaymentMethodsActionTitle')?.textContent,
        selectedTab: document.querySelector('#pageTabs [data-page-tab][aria-selected="true"]')?.dataset.pageTab
    }));
    expect(preservedBefore.values.some((field) => field.name === 'recipientName' && field.value === editedRecipient)).toBe(true);
    expect(preservedBefore.selectedTab).toBe('member-payment-methods');

    // Let the shell's unrelated, one-time branch/notification bootstrap finish before
    // measuring whether presentation-only toggles cause any additional fetches.
    await page.setViewportSize({ width: WIDTHS[0], height: 844 });
    await page.evaluate(() => {
        window.TopGymTheme?.set?.('light');
        window.TopGymI18n.set('ar');
    });
    await page.waitForLoadState('networkidle');
    await expect.poll(() => requests.some(({ pathname }) => pathname === '/api/branches/bootstrap')).toBe(true);
    await expect.poll(() => ['/api/notifications', '/api/notifications/unread-count', '/api/notifications/stream'].every((pathname) => requests.some((request) => request.pathname === pathname))).toBe(true);
    const requestsBeforeLocaleThemeMatrix = requests.length;

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
                await page.evaluate(() => document.activeElement?.blur?.());
                await expect(page.locator('#memberPaymentMethodsTitle')).toHaveText(locale === 'en' ? 'Gym member payment methods' : 'وسائل دفع أعضاء الجيم');
                await expect(page.locator('#memberPaymentEditorTitle')).toHaveText(locale === 'en' ? 'Transfer details' : 'بيانات استقبال التحويلات');
                await expect(page.locator('#memberPaymentMethodsActionTitle')).toHaveText(locale === 'en' ? 'You have unsaved changes' : 'لديك تغييرات غير محفوظة');
                await expect(page.locator('#memberPaymentMethodsList [data-i18n="memberPayment.methods.name"]').first()).toHaveText(locale === 'en' ? 'Method name' : 'اسم الوسيلة');
                await expect(page.locator('#memberPaymentMethodsList [data-i18n="memberPayment.methods.active"]').first()).toHaveText(locale === 'en' ? 'Show this method to the member' : 'عرض هذه الوسيلة للعضو');
                await expect(page.locator('#memberPaymentSummaryNote')).toContainText(locale === 'en' ? 'Active payment methods' : 'وسيلة دفع نشطة');
                await expect(page.locator('[data-member-payment-field="name"][data-member-payment-index="0"]')).toHaveValue(METHODS_FIXTURE.draft.identity.paymentMethods[0].name);
                await expect(page.locator('[data-member-payment-field="accountReference"][data-member-payment-index="0"]')).toHaveValue('QA-ACCOUNT-2026');
                await expect(page.locator('[data-member-payment-field="recipientName"][data-member-payment-index="0"]')).toHaveValue(editedRecipient);
                await expect(page.locator('[data-member-payment-field="instructions"][data-member-payment-index="0"]')).toHaveValue('بيانات تجريبية تبقى كما هي عند تبديل اللغة.');
                await expect(page.locator('[data-member-payment-field="isActive"][data-member-payment-index="0"]')).toBeChecked();
                await expect(page.locator('[data-member-payment-field="isActive"][data-member-payment-index="1"]')).not.toBeChecked();

                const snapshot = await page.evaluate((activeLocale) => {
                    const screen = document.querySelector('#memberPaymentMethodsSection');
                    const box = screen.getBoundingClientRect();
                    return {
                        width: innerWidth,
                        documentWidth: document.documentElement.scrollWidth,
                        bodyWidth: document.body.scrollWidth,
                        screenWidth: screen.scrollWidth,
                        screenClientWidth: screen.clientWidth,
                        screenRight: box.right,
                        direction: getComputedStyle(screen).direction,
                        theme: document.documentElement.dataset.theme,
                        locale: window.TopGymI18n.get(),
                        title: document.querySelector('#memberPaymentMethodsTitle')?.textContent,
                        status: document.querySelector('#memberPaymentMethodsStatus')?.textContent,
                        actionTitle: document.querySelector('#memberPaymentMethodsActionTitle')?.textContent,
                        fieldValues: [...screen.querySelectorAll('[data-member-payment-field]')].map((field) => ({ name: field.dataset.memberPaymentField, index: field.dataset.memberPaymentIndex, value: field.type === 'checkbox' ? field.checked : field.value })),
                        selectedTab: document.querySelector('#pageTabs [data-page-tab][aria-selected="true"]')?.dataset.pageTab,
                        untranslatedKeys: [...screen.querySelectorAll('[data-i18n^="memberPayment."]')].filter((element) => element.textContent.trim() === element.dataset.i18n).map((element) => element.dataset.i18n),
                        untranslatedAttributes: [...screen.querySelectorAll('[data-i18n-placeholder^="memberPayment."]')].filter((element) => element.placeholder === element.dataset.i18nPlaceholder).map((element) => element.dataset.i18nPlaceholder),
                        englishUiContainingArabic: activeLocale === 'en' ? [...screen.querySelectorAll('[data-i18n^="memberPayment."]')].filter((element) => /[\u0600-\u06FF]/u.test(element.textContent)).map((element) => element.dataset.i18n) : []
                    };
                }, locale);
                expect(snapshot.documentWidth, `${width}px ${theme} ${locale}: document overflow`).toBeLessThanOrEqual(width);
                expect(snapshot.bodyWidth, `${width}px ${theme} ${locale}: body overflow`).toBeLessThanOrEqual(width);
                expect(snapshot.screenWidth, `${width}px ${theme} ${locale}: screen overflow`).toBeLessThanOrEqual(snapshot.screenClientWidth + 1);
                expect(snapshot.screenRight, `${width}px ${theme} ${locale}: screen outside viewport`).toBeLessThanOrEqual(width + 1);
                expect(snapshot.direction).toBe(locale === 'ar' ? 'rtl' : 'ltr');
                expect(snapshot.theme).toBe(theme);
                expect(snapshot.locale).toBe(locale);
                expect(snapshot.fieldValues).toEqual(preservedBefore.values);
                expect(snapshot.selectedTab).toBe(preservedBefore.selectedTab);
                expect(snapshot.untranslatedKeys, `${width}px ${theme} ${locale}: missing screen translation`).toEqual([]);
                expect(snapshot.untranslatedAttributes, `${width}px ${theme} ${locale}: missing placeholder translation`).toEqual([]);
                expect(snapshot.englishUiContainingArabic, `${width}px ${theme}: English UI labels must be English while member data remains unchanged`).toEqual([]);
                const presentationRequests = requests.slice(requestsBeforeLocaleThemeMatrix).filter(({ pathname }) => pathname !== '/api/notifications/stream');
                expect(presentationRequests, `${width}px ${theme} ${locale}: locale/theme/viewport presentation must not issue additional data requests`).toEqual([]);
                evidence.push(snapshot);
                await section.screenshot({ path: path.join(OUTPUT, `member-payment-methods-${width}-${theme}-${locale}.png`), fullPage: true, animations: 'disabled' });
            }
        }
    }

    expect(requests.filter(({ method }) => !READ_METHODS.has(method)), 'No write request may escape the local fixture').toEqual([]);
    expect(requests.filter(({ pathname, method }) => pathname === '/api/branding/settings' && method === 'GET')).toHaveLength(1);
    expect(JSON.stringify(METHODS_FIXTURE)).toContain('تحويل محفظة QA');
    const streamReconnects = requests.slice(requestsBeforeLocaleThemeMatrix).filter(({ pathname }) => pathname === '/api/notifications/stream').length;
    await fs.writeFile(path.join(OUTPUT, 'matrix.json'), JSON.stringify({ generatedAt: new Date().toISOString(), viewports: WIDTHS, themes: THEMES, locales: LOCALES, readOnly: true, settingsReads: 1, writeRequests: 0, additionalDataRequestsDuringMatrix: 0, unrelatedNotificationStreamReconnects: streamReconnects, preservedValues: true, evidence }, null, 2), 'utf8');
});
