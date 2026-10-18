const fs = require('node:fs/promises');
const path = require('node:path');
const { test, expect } = require('@playwright/test');

const WIDTHS = [320, 390, 768, 1024, 1440, 1920];
const THEMES = ['light', 'dark'];
const LOCALES = ['ar', 'en'];
const OUTPUT = path.resolve(process.cwd(), 'qa/artifacts/saas-billing-v2-visual');

const terms = [
    { code: 'monthly', durationMonths: 1, price: 599, currency: 'EGP', isActive: true },
    { code: 'quarterly', durationMonths: 3, price: 1599, currency: 'EGP', isActive: true },
    { code: 'semiannual', durationMonths: 6, price: 2999, currency: 'EGP', isActive: true },
    { code: 'annual', durationMonths: 12, price: 5499, currency: 'EGP', isActive: true }
];

const plans = [
    { id: 9101, code: 'qa-basic', name: 'Basic', description: 'Synthetic visual fixture', price: 599, currency: 'EGP', billingPeriod: 'monthly', isActive: true, availableForNewSubscriptions: true, compatibleTenantTypes: ['gym'], terms, maxMembers: 500, maxClients: 100, maxUsers: 5, maxBranches: 2, maxAiGenerations: 100, maxStorageMb: 1024, features: { members: true, attendance: true, reports: true } },
    { id: 9102, code: 'qa-pro', name: 'Pro', description: 'Synthetic visual fixture', price: 999, currency: 'EGP', billingPeriod: 'monthly', isActive: true, availableForNewSubscriptions: true, compatibleTenantTypes: ['gym'], terms: terms.map((term, index) => ({ ...term, price: [999, 2699, 4999, 8999][index] })), maxMembers: 1500, maxClients: 300, maxUsers: 15, maxBranches: 5, maxAiGenerations: 400, maxStorageMb: 5120, features: { members: true, attendance: true, reports: true } },
    { id: 9103, code: 'qa-business', name: 'Business', description: 'Synthetic visual fixture', price: 1499, currency: 'EGP', billingPeriod: 'monthly', isActive: true, availableForNewSubscriptions: true, compatibleTenantTypes: ['gym'], terms: terms.map((term, index) => ({ ...term, price: [1499, 3999, 7499, 13499][index] })), maxMembers: null, maxClients: null, maxUsers: null, maxBranches: null, maxAiGenerations: 900, maxStorageMb: 10240, features: { members: true, attendance: true, reports: true } },
    { id: 9106, code: 'qa-enterprise', name: 'Enterprise', description: 'Synthetic visual fixture', price: 2499, currency: 'EGP', billingPeriod: 'monthly', isActive: true, availableForNewSubscriptions: true, compatibleTenantTypes: ['gym'], terms: terms.map((term, index) => ({ ...term, price: [2499, 6799, 12499, 22499][index] })), maxMembers: null, maxClients: null, maxUsers: null, maxBranches: null, maxAiGenerations: null, maxStorageMb: 20480, features: { members: true, attendance: true, reports: true } }
];

const billingFixture = {
    tenant: { id: 9100, name: 'Read-only QA Gym', slug: 'read-only-qa-gym', tenantType: 'gym', status: 'active' },
    subscription: { id: 9104, status: 'active', startsAt: '2026-01-01T00:00:00Z', expiresAt: '2027-01-01T00:00:00Z', termCodeSnapshot: 'monthly', durationMonthsSnapshot: 1, priceSnapshot: 599, plan: plans[0] },
    plans,
    featureCatalog: [{ key: 'members', description: 'Members entitlement retained in the API fixture', tenantTypes: ['gym'], limitKeys: ['maxMembers'] }],
    usage: { members: 24, clients: 2, users: 2, branches: 1, aiGenerations: 3, storageBytes: 1048576 },
    requests: [{ id: 9105, createdAt: '2026-10-01T09:00:00Z', plan: { name: 'Basic' }, durationMonths: 3, amount: 1599, currency: 'EGP', status: 'approved', proof: null, reviewNotes: 'Synthetic fixture only' }],
    requestsPagination: { page: 1, pages: 1, total: 1 }
};

test('saas billing read-only responsive visual matrix: widths, themes and locales', async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    test.skip(testInfo.project.name !== 'desktop', 'The test owns its complete internal responsive locale/theme matrix.');
    await fs.mkdir(OUTPUT, { recursive: true });

    const writes = [];
    const externalRequests = [];
    const apiReads = [];
    const pageErrors = [];
    const evidence = [];

    await page.route('**/*', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const method = request.method().toUpperCase();

        if (!['127.0.0.1', 'localhost'].includes(url.hostname)) {
            externalRequests.push(`${method} ${url.origin}${url.pathname}`);
            return route.abort('blockedbyclient');
        }

        if (!url.pathname.startsWith('/api/')) return route.continue();
        if (!['GET', 'HEAD'].includes(method)) {
            writes.push(`${method} ${url.pathname}`);
            return route.abort('blockedbyclient');
        }
        apiReads.push(`${method} ${url.pathname}`);

        const responses = {
            '/api/auth/session': { authenticated: true, user: { id: 9100, name: 'Read-only QA Owner', role: 'Owner', tenantType: 'gym', permissions: [] } },
            '/api/branding': { identity: { brandName: 'Read-only QA Gym' } },
            '/api/bootstrap': { branches: [], sections: [], defaultBranch: null },
            '/api/saas/subscription': billingFixture,
            '/api/saas/subscription-requests': { requests: [], pagination: { page: 1, pages: 1, total: 0 } },
            '/api/saas/entitlements': { tenantStatus: 'active', subscription: { status: 'active' }, entitlements: { features: {}, limits: {} } },
            '/api/dashboard': { stats: { total: 24, active: 24, expired: 0, expiringSoon: 0, frozen: 0 }, alerts: [] }
        };
        const body = responses[url.pathname] || {};
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });

    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto('/index.html#saas-billing', { waitUntil: 'domcontentloaded' });
    await page.evaluate(async () => {
        if (!window.topGymAuthReady) throw new Error('Application auth readiness contract is unavailable.');
        await window.topGymAuthReady;
    });
    await page.locator('[data-page-tab="saas-billing"]').click();
    await expect(page.locator('#saasBillingSection')).toBeVisible();
    await expect(page.locator('#saasPlansList [data-saas-plan-card]')).toHaveCount(4);
    await expect(page.locator('#saasPlansList .saas-plan-current-badge')).toHaveCount(1);
    await expect(page.locator('#saasPlansList .saas-plan-features, #saasPlansList .saas-plan-entitlements, #saasPlansList [data-saas-feature-key]')).toHaveCount(0);
    await expect(page.locator('#saasRequestsList tr')).toHaveCount(1);
    await expect(page.locator('.saas-summary-dates bdi')).toHaveCount(2);

    for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: width <= 390 ? 900 : 960 });
        for (const theme of THEMES) {
            for (const locale of LOCALES) {
                await page.evaluate(({ theme: nextTheme, locale: nextLocale }) => {
                    document.documentElement.dataset.theme = nextTheme;
                    document.body.dataset.theme = nextTheme;
                    window.TopGymI18n?.set(nextLocale, { persist: false });
                }, { theme, locale });

                const state = await page.evaluate(() => {
                    const root = document.querySelector('#saasBillingSection');
                    const planList = root?.querySelector('#saasPlansList');
                    const cards = [...(root?.querySelectorAll('[data-saas-plan-card]') || [])];
                    const form = root?.querySelector('#saasSubscriptionForm');
                    const writingControlState = [...(form?.querySelectorAll('input,select,textarea,button') || [])]
                        .map((element) => ({ id: element.id, value: element.value, disabled: element.disabled }));
                    const historyCells = [...(root?.querySelectorAll('#saasRequestsList td') || [])];
                    const dates = [...(root?.querySelectorAll('.saas-summary-dates bdi, #saasRequestsList time') || [])];
                    const cellOverflow = historyCells
                        .filter((element) => element.scrollWidth > element.clientWidth + 1)
                        .map((element) => element.dataset.label || element.textContent.trim());
                    return {
                        title: root?.querySelector('#saasBillingTitle')?.textContent.trim(),
                        lang: document.documentElement.lang,
                        dir: document.documentElement.dir,
                        rootTheme: document.documentElement.dataset.theme,
                        bodyTheme: document.body.dataset.theme,
                        screenBackground: getComputedStyle(root).backgroundColor,
                        viewportWidth: window.innerWidth,
                        documentWidth: document.documentElement.scrollWidth,
                        bodyWidth: document.body.scrollWidth,
                        screenWidth: root?.getBoundingClientRect().width,
                        planCount: cards.length,
                        planColumns: getComputedStyle(planList).gridTemplateColumns.split(' ').length,
                        planFeatureMarkupCount: planList?.querySelectorAll('.saas-plan-features, .saas-plan-entitlements, [data-saas-feature-key]').length || 0,
                        dates: dates.map((element) => ({ text: element.textContent.trim(), direction: element.dir })),
                        planListClientWidth: planList?.clientWidth,
                        planListScrollWidth: planList?.scrollWidth,
                        historyLayout: (() => {
                            const names = ['.saas-requests-panel', '.saas-table-wrap', '.saas-table', '#saasRequestsList', '#saasRequestsList tr'];
                            return Object.fromEntries(names.map((selector) => {
                                const element = root?.querySelector(selector);
                                return [selector, element ? `${Math.round(element.getBoundingClientRect().width)}|${getComputedStyle(element).width}|${getComputedStyle(element).display}` : 'missing'];
                            }));
                        })(),
                        cardWidths: cards.map((card) => Math.round(card.getBoundingClientRect().width)),
                        requestTableRows: root?.querySelectorAll('#saasRequestsList tr').length,
                        hasArabicUI: /[\u0600-\u06ff]/.test(root?.innerText || ''),
                        hasEnglishUI: /[A-Za-z]{3,}/.test(root?.innerText || ''),
                        formControls: writingControlState,
                        historyCells: historyCells.map((element) => ({ label: element.dataset.label, display: getComputedStyle(element).display, width: element.clientWidth, scrollWidth: element.scrollWidth })),
                        cellOverflow
                    };
                });

                expect(state.documentWidth, `${width}px ${theme}/${locale} document overflow`).toBeLessThanOrEqual(width);
                expect(state.bodyWidth, `${width}px ${theme}/${locale} body overflow`).toBeLessThanOrEqual(width);
                expect(state.planCount).toBe(4);
                expect(state.planFeatureMarkupCount).toBe(0);
                expect(state.planColumns).toBe(width >= 1280 ? 4 : width >= 561 ? 2 : 1);
                expect(state.dates).toHaveLength(3);
                for (const item of state.dates) {
                    expect(item.direction).toBe('ltr');
                    expect(item.text).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
                }
                expect(state.requestTableRows).toBe(1);
                expect(state.lang).toBe(locale);
                expect(state.dir).toBe(locale === 'ar' ? 'rtl' : 'ltr');
                expect(state.rootTheme).toBe(theme);
                expect(state.bodyTheme).toBe(theme);
                if (width <= 389) expect(state.historyCells.every((cell) => cell.display === 'grid')).toBe(true);

                const screenshot = path.join(OUTPUT, `saas-billing-${width}-${theme}-${locale}.png`);
                await page.screenshot({ path: screenshot, fullPage: true, animations: 'disabled' });
                evidence.push({ width, theme, locale, screenshot: path.basename(screenshot), ...state });
            }
        }
    }

    expect(writes, 'No API write may occur in this read-only visual task').toEqual([]);
    expect(externalRequests.filter((request) => /payment|checkout|gateway|stripe|paypal/i.test(request)), 'No payment-provider request may be attempted').toEqual([]);
    expect(pageErrors, 'No uncaught browser errors').toEqual([]);

    await fs.writeFile(path.join(OUTPUT, 'matrix.json'), JSON.stringify({
        generatedAt: new Date().toISOString(),
        route: '/index.html#saas-billing',
        widths: WIDTHS,
        themes: THEMES,
        locales: LOCALES,
        readOnly: true,
        fixtureOnly: true,
        apiWrites: writes,
        externalRequests,
        apiReads,
        pageErrors,
        evidence
    }, null, 2), 'utf8');
});
