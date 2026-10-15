'use strict';

const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const planCatalog = require('../../src/services/saas-plan-catalog');
const featureCatalog = require('../../src/services/feature-catalog');

const BASE_URL = process.env.MEMBER_PAYMENT_METHODS_QA_BASE_URL || 'http://127.0.0.1:4173';
const OUTPUT = path.resolve(process.cwd(), 'qa/artifacts/member-payment-methods-v2-visual-20261014');
const WIDTHS = [320, 390, 768, 1440];
const THEMES = ['light', 'dark'];
const LOCALES = ['ar', 'en'];
const STATES = ['loading', 'empty', 'error', 'draft'];
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const EMPTY_CONFIG = Object.freeze({ identity: { paymentMethods: [] }, assets: {}, themes: { light: {}, dark: {} } });
const DRAFT_CONFIG = Object.freeze({
    identity: {
        paymentMethods: [
            { id: 'qa-transfer', name: 'Fixture transfer', accountReference: 'QA-ACCOUNT-01', recipientName: 'Fixture recipient', instructions: 'Synthetic read-only fixture', isActive: true, sortOrder: 0 },
            { id: 'qa-cash', name: 'Fixture cash', accountReference: 'QA-CASH-02', recipientName: '', instructions: '', isActive: false, sortOrder: 1 }
        ]
    },
    assets: {}, themes: { light: {}, dark: {} }
});

test('member payment methods V2 covers loading, empty, error and draft states across responsive locale/theme matrix', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'One desktop worker runs the full payment-methods state matrix.');
    test.setTimeout(240_000);

    let scenario = 'loading';
    let activeLoading = null;
    const requests = [];
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    const plan = planCatalog.PLAN_CONFIGURATIONS.find((item) => item.code === 'business');

    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const method = request.method().toUpperCase();
        requests.push({ method, pathname: url.pathname, scenario });
        if (!READ_METHODS.has(method)) {
            return route.fulfill({ status: 405, contentType: 'application/json; charset=utf-8', body: JSON.stringify({ error: 'Read-only payment-method QA: writes are blocked.' }) });
        }

        if (url.pathname === '/api/branding/settings') {
            if (scenario === 'loading') {
                const loading = activeLoading;
                loading?.started?.();
                await loading?.gate;
            }
            if (scenario === 'error') {
                return route.fulfill({ status: 503, contentType: 'application/json; charset=utf-8', body: JSON.stringify({}) });
            }
            const config = scenario === 'empty' ? EMPTY_CONFIG : DRAFT_CONFIG;
            return route.fulfill({
                status: 200,
                contentType: 'application/json; charset=utf-8',
                body: JSON.stringify({ draft: config, published: EMPTY_CONFIG, version: 4, metadata: null, audit: [] })
            });
        }

        let payload = {};
        if (url.pathname === '/api/auth/session') {
            payload = { authenticated: true, user: { id: 98152, name: 'Synthetic Payment QA Owner', role: 'Owner', tenantType: 'gym', permissions: [] } };
        } else if (url.pathname === '/api/saas/entitlements') {
            payload = { tenantStatus: 'active', subscription: { status: 'active', plan: { code: plan.code, name: plan.name } }, entitlements: { tenantType: 'gym', features: planCatalog.featureFlagsForPlan(plan.code), featureCatalog: featureCatalog.getFeatureCatalog({ tenantType: 'gym' }) } };
        } else if (url.pathname === '/api/branding') {
            payload = { branding: { identity: { brandName: 'Synthetic Payment QA Gym' }, assets: {} }, version: 4 };
        } else if (url.pathname === '/api/bootstrap' || url.pathname === '/api/branches/bootstrap') {
            const branch = { id: 1, name: 'QA Main Branch', code: 'qa-main', status: 'active', isMain: true };
            payload = { branches: [branch], activeBranches: [branch], defaultBranch: branch, sections: [] };
        }
        return route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(payload) });
    });
    const localOrigin = new URL(BASE_URL).origin;
    await page.route('**/*', (route) => {
        if (new URL(route.request().url()).origin !== localOrigin) return route.abort('blockedbyclient');
        return route.fallback();
    });

    let releaseInitialLoad;
    let signalInitialLoad;
    const initialLoadStarted = new Promise((resolve) => { signalInitialLoad = resolve; });
    const initialLoadGate = new Promise((resolve) => { releaseInitialLoad = resolve; });
    activeLoading = { started: signalInitialLoad, gate: initialLoadGate };
    await fs.mkdir(OUTPUT, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE_URL}/index.html#member-payment-methods`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.topGymAuth?.isReady?.() === true, null, { timeout: 25_000 });
    await expect.poll(async () => Boolean(await page.evaluate(() => Boolean(window.TopGymI18n)))).toBe(true);
    const tab = page.locator('[data-page-tab="member-payment-methods"]');
    await expect(tab).toBeVisible({ timeout: 25_000 });
    if (await tab.getAttribute('aria-selected') !== 'true') await tab.click();
    const section = page.locator('#memberPaymentMethodsSection');
    await expect(section).toBeVisible();
    await page.setViewportSize({ width: 320, height: 844 });
    await page.evaluate(() => {
        window.TopGymTheme?.set?.('light');
        document.documentElement.dataset.theme = 'light';
        document.body.dataset.theme = 'light';
        window.TopGymI18n.set('ar');
    });
    await initialLoadStarted;
    await expect(page.locator('#memberPaymentMethodsList')).toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('#memberPaymentMethodsList .member-payment-loading')).toBeVisible();
    await expect(page.locator('#memberPaymentMethodsStatus')).toContainText('إعدادات الدفع');
    await section.screenshot({ path: path.join(OUTPUT, 'member-payment-methods-initial-loading-320-light-ar.png'), fullPage: true, animations: 'disabled' });
    releaseInitialLoad();
    await expect(page.locator('#memberPaymentMethodsList')).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('[data-member-payment-row]')).toHaveCount(2);
    activeLoading = null;
    scenario = 'draft';

    const captureSnapshot = (stateName, language) => page.evaluate(({ state, locale }) => {
        const root = document.querySelector('#memberPaymentMethodsSection');
        const rect = (selector) => {
            const element = document.querySelector(selector);
            if (!element) return null;
            const box = element.getBoundingClientRect();
            return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height };
        };
        return {
            state,
            width: innerWidth,
            documentWidth: document.documentElement.scrollWidth,
            bodyWidth: document.body.scrollWidth,
            sectionWidth: root.scrollWidth,
            sectionClientWidth: root.clientWidth,
            direction: getComputedStyle(root).direction,
            theme: document.documentElement.dataset.theme,
            locale: window.TopGymI18n.get(),
            busy: document.querySelector('#memberPaymentMethodsList')?.getAttribute('aria-busy'),
            status: document.querySelector('#memberPaymentMethodsStatus')?.textContent?.trim(),
            contentState: document.querySelector('#memberPaymentMethodsList .member-payment-empty strong')?.textContent?.trim() || null,
            section: rect('#memberPaymentMethodsSection'),
            header: rect('.member-payment-page-head'),
            statusbar: rect('.member-payment-statusbar'),
            content: rect('.member-payment-layout'),
            footer: rect('.member-payment-action-bar'),
            touchTargets: ['#memberPaymentMethodAdd', '[data-member-payment-remove]', '#memberPaymentMethodsSave', '#memberPaymentMethodsPublish', '.member-payment-method-active'].map((selector) => ({ selector, ...rect(selector) })),
            untranslatedKeys: [...root.querySelectorAll('[data-i18n^="memberPayment."]')].filter((element) => element.textContent.trim() === element.dataset.i18n).map((element) => element.dataset.i18n),
            untranslatedAttributes: [...root.querySelectorAll('[data-i18n-placeholder^="memberPayment."]')].filter((element) => element.placeholder === element.dataset.i18nPlaceholder).map((element) => element.dataset.i18nPlaceholder),
            englishLabelsContainingArabic: locale === 'en' ? [...root.querySelectorAll('[data-i18n^="memberPayment."]')].filter((element) => /[\u0600-\u06FF]/u.test(element.textContent)).map((element) => element.dataset.i18n) : []
        };
    }, { state: stateName, locale: language });

    const evidence = [];
    for (const state of STATES) {
        for (const width of WIDTHS) {
            await page.setViewportSize({ width, height: width <= 390 ? 844 : 900 });
            for (const theme of THEMES) {
                for (const locale of LOCALES) {
                    let inFlightSnapshot = null;
                    await page.evaluate(({ mode, language }) => {
                        window.TopGymTheme?.set?.(mode);
                        document.documentElement.dataset.theme = mode;
                        document.body.dataset.theme = mode;
                        window.TopGymI18n.set(language);
                    }, { mode: theme, language: locale });

                    if (state === 'loading') {
                        scenario = 'loading';
                        let release;
                        let signalStarted;
                        const started = new Promise((resolve) => { signalStarted = resolve; });
                        const gate = new Promise((resolve) => { release = resolve; });
                        activeLoading = { started: signalStarted, gate };
                        await page.evaluate(() => { window.__qaPaymentMethodsReload = window.topGymMemberPaymentMethodsEditor.reload(); });
                        await started;
                        await expect(page.locator('#memberPaymentMethodsList')).toHaveAttribute('aria-busy', 'true');
                        await expect(page.locator('#memberPaymentMethodsStatus')).toContainText(locale === 'en' ? 'Loading payment settings' : 'إعدادات الدفع');
                        await expect(page.locator('[data-member-payment-row]')).toHaveCount(2);
                        inFlightSnapshot = await captureSnapshot(state, locale);
                        if ((width === 320 && theme === 'light' && locale === 'ar') || (width === 1440 && theme === 'dark' && locale === 'en')) {
                            await section.screenshot({ path: path.join(OUTPUT, `member-payment-methods-loading-${width}-${theme}-${locale}.png`), fullPage: true, animations: 'disabled' });
                        }
                        release();
                        await page.evaluate(async () => { await window.__qaPaymentMethodsReload; delete window.__qaPaymentMethodsReload; });
                        activeLoading = null;
                        scenario = 'draft';
                    } else {
                        scenario = state;
                        await page.evaluate(async () => { await window.topGymMemberPaymentMethodsEditor.reload(); });
                    }

                    await expect(page.locator('#memberPaymentMethodsList')).toHaveAttribute('aria-busy', 'false');
                    if (state === 'empty') {
                        await expect(page.locator('#memberPaymentMethodsList .member-payment-empty strong')).toBeVisible();
                        await expect(page.locator('[data-member-payment-row]')).toHaveCount(0);
                    } else if (state === 'error') {
                        await expect(page.locator('#memberPaymentMethodsList .member-payment-empty strong')).toBeVisible();
                        await expect(page.locator('#memberPaymentMethodsStatus')).toHaveClass(/is-error/u);
                        await expect(page.locator('#memberPaymentMethodsStatus')).toHaveAttribute('data-i18n', 'memberPayment.status.loadError');
                        await expect(page.locator('#memberPaymentMethodsStatus')).toHaveText(locale === 'en' ? 'Could not load payment settings.' : 'تعذر تحميل إعدادات الدفع.');
                        await expect(page.locator('[data-member-payment-row]')).toHaveCount(0);
                    } else {
                        await expect(page.locator('[data-member-payment-row]')).toHaveCount(2);
                    }

                    const snapshot = inFlightSnapshot || await captureSnapshot(state, locale);

                    expect(snapshot.documentWidth, `${state}/${width}/${theme}/${locale}: document overflow`).toBeLessThanOrEqual(width);
                    expect(snapshot.bodyWidth, `${state}/${width}/${theme}/${locale}: body overflow`).toBeLessThanOrEqual(width);
                    expect(snapshot.sectionWidth, `${state}/${width}/${theme}/${locale}: section overflow`).toBeLessThanOrEqual(snapshot.sectionClientWidth + 1);
                    expect(snapshot.section.left).toBeGreaterThanOrEqual(-1);
                    expect(snapshot.section.right).toBeLessThanOrEqual(width + 1);
                    if (width < 768) {
                        for (const target of snapshot.touchTargets) {
                            if (target.width && target.height) expect(target.height, `${state}/${width}/${theme}/${locale}: touch target ${target.selector}`).toBeGreaterThanOrEqual(44);
                        }
                    }
                    expect(snapshot.direction).toBe(locale === 'ar' ? 'rtl' : 'ltr');
                    expect(snapshot.theme).toBe(theme);
                    expect(snapshot.locale).toBe(locale);
                    expect(snapshot.untranslatedKeys).toEqual([]);
                    expect(snapshot.untranslatedAttributes).toEqual([]);
                    expect(snapshot.englishLabelsContainingArabic).toEqual([]);
                    evidence.push(snapshot);

                    if (state !== 'loading' && ((width === 320 && theme === 'light' && locale === 'ar') || (width === 1440 && theme === 'dark' && locale === 'en'))) {
                        await section.screenshot({ path: path.join(OUTPUT, `member-payment-methods-${state}-${width}-${theme}-${locale}.png`), fullPage: true, animations: 'disabled' });
                    }
                }
            }
        }
    }

    expect(requests.filter(({ method }) => !READ_METHODS.has(method)), 'All payment-method writes must remain blocked in QA').toEqual([]);
    expect(requests.filter(({ pathname, method }) => pathname === '/api/branding/settings' && method === 'GET')).toHaveLength(1 + STATES.length * WIDTHS.length * THEMES.length * LOCALES.length);
    expect(pageErrors, 'No browser runtime errors in the state matrix').toEqual([]);
    await fs.writeFile(path.join(OUTPUT, 'matrix.json'), JSON.stringify({
        generatedAt: new Date().toISOString(), states: STATES, viewports: WIDTHS, themes: THEMES, locales: LOCALES,
        matrixCells: evidence.length, readOnly: true,
        settingsReads: requests.filter(({ pathname }) => pathname === '/api/branding/settings').length,
        writeRequests: requests.filter(({ method }) => !READ_METHODS.has(method)).length,
        pageErrors, evidence
    }, null, 2), 'utf8');
});
