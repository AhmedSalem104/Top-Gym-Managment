const fs = require('node:fs/promises');
const path = require('node:path');
const { test, expect } = require('@playwright/test');

const OUTPUT = path.resolve(process.cwd(), 'qa/artifacts/saas-billing-responsive-fix');
const WIDTHS = [320, 390, 1440];
const THEMES = ['light', 'dark'];
const LOCALES = ['ar', 'en'];

const terms = [
    { code: 'monthly', durationMonths: 1, price: 599, currency: 'EGP', isActive: true },
    { code: 'quarterly', durationMonths: 3, price: 1599, currency: 'EGP', isActive: true },
    { code: 'semiannual', durationMonths: 6, price: 2999, currency: 'EGP', isActive: true },
    { code: 'annual', durationMonths: 12, price: 5499, currency: 'EGP', isActive: true }
];

const plans = [
    { id: 9101, code: 'qa-basic', name: 'Basic', description: 'Synthetic visual fixture', price: 599, currency: 'EGP', billingPeriod: 'monthly', isActive: true, availableForNewSubscriptions: true, compatibleTenantTypes: ['gym'], terms, maxMembers: 500, maxClients: 100, maxUsers: 5, maxBranches: 2, maxAiGenerations: 100, maxStorageMb: 1024, features: { members: true, attendance: true, reports: true } },
    { id: 9102, code: 'qa-pro', name: 'Pro', description: 'Synthetic visual fixture', price: 999, currency: 'EGP', billingPeriod: 'monthly', isActive: true, availableForNewSubscriptions: true, compatibleTenantTypes: ['gym'], terms: terms.map((term, index) => ({ ...term, price: [999, 2699, 4999, 8999][index] })), maxMembers: 1500, maxClients: 300, maxUsers: 15, maxBranches: 5, maxAiGenerations: 400, maxStorageMb: 5120, features: { members: true, attendance: true, reports: true } },
    { id: 9103, code: 'qa-business', name: 'Business', description: 'Synthetic visual fixture', price: 1499, currency: 'EGP', billingPeriod: 'monthly', isActive: true, availableForNewSubscriptions: true, compatibleTenantTypes: ['gym'], terms: terms.map((term, index) => ({ ...term, price: [1499, 3999, 7499, 13499][index] })), maxMembers: null, maxClients: null, maxUsers: null, maxBranches: null, maxAiGenerations: 900, maxStorageMb: 10240, features: { members: true, attendance: true, reports: true } }
];

const subscriptionFixture = {
    tenant: { id: 9100, name: 'Read-only QA Gym', slug: 'read-only-qa-gym', tenantType: 'gym', status: 'active' },
    subscription: { id: 9104, status: 'active', startsAt: '2026-01-01T00:00:00Z', expiresAt: '2027-01-01T00:00:00Z', termCodeSnapshot: 'monthly', durationMonthsSnapshot: 1, priceSnapshot: 599, plan: plans[0] },
    plans,
    featureCatalog: [],
    usage: { members: 24, clients: 2, users: 2, branches: 1, aiGenerations: 3, storageBytes: 1048576 },
    requests: [{ id: 9105, createdAt: '2026-10-01T09:00:00Z', plan: { name: 'Basic' }, durationMonths: 3, amount: 1599, currency: 'EGP', status: 'approved', proof: null, reviewNotes: 'Synthetic fixture only' }],
    requestsPagination: { page: 1, pages: 1, total: 1 }
};

test('SaaS billing history remains readable at 320/390px in both themes and locales without writes', async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    test.skip(testInfo.project.name !== 'desktop', 'The test owns both mobile widths, themes and locales internally.');
    await fs.mkdir(OUTPUT, { recursive: true });

    const writes = [];
    const pageErrors = [];
    const evidence = [];
    await page.route('**/*', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const method = request.method().toUpperCase();
        if (!['127.0.0.1', 'localhost'].includes(url.hostname)) return route.abort('blockedbyclient');
        if (!url.pathname.startsWith('/api/')) return route.continue();
        if (!['GET', 'HEAD'].includes(method)) {
            writes.push(`${method} ${url.pathname}`);
            return route.abort('blockedbyclient');
        }

        const responses = {
            '/api/auth/session': { authenticated: true, user: { id: 9100, name: 'Read-only QA Owner', role: 'Owner', tenantType: 'gym', permissions: [] } },
            '/api/branding': { identity: { brandName: 'Read-only QA Gym' } },
            '/api/bootstrap': { branches: [], sections: [], defaultBranch: null },
            '/api/saas/subscription': subscriptionFixture,
            '/api/saas/subscription-requests': { requests: [], pagination: { page: 1, pages: 1, total: 0 } },
            '/api/saas/entitlements': { tenantStatus: 'active', subscription: { status: 'active' }, entitlements: { features: {}, limits: {} } },
            '/api/dashboard': { stats: { total: 24, active: 24, expired: 0, expiringSoon: 0, frozen: 0 }, alerts: [] }
        };
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(responses[url.pathname] || {}) });
    });

    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto('/index.html#saas-billing', { waitUntil: 'domcontentloaded' });
    await page.evaluate(async () => {
        if (!window.topGymAuthReady) throw new Error('Application auth readiness contract is unavailable.');
        await window.topGymAuthReady;
    });
    await page.locator('[data-page-tab="saas-billing"]').click();
    const section = page.locator('#saasBillingSection');
    await expect(section).toBeVisible();
    await expect(page.locator('#saasRequestsList tr')).toHaveCount(1);

    // Test the edited canonical page stylesheet directly without rebuilding or editing generated CSS.
    await page.addStyleTag({ path: path.resolve(process.cwd(), 'public/css/pages/saas.css') });

    for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        for (const theme of THEMES) {
            for (const locale of LOCALES) {
                await page.evaluate(({ theme: nextTheme, locale: nextLocale }) => {
                    document.documentElement.dataset.theme = nextTheme;
                    document.body.dataset.theme = nextTheme;
                    window.TopGymI18n?.set(nextLocale, { persist: false });
                }, { theme, locale });

                const state = await page.locator('#saasRequestsList').evaluate((tbody) => {
                    const row = tbody.querySelector('tr');
                    const cells = [...row.querySelectorAll('td')];
                    const rowStyle = getComputedStyle(row);
                    return {
                        rowColumns: rowStyle.gridTemplateColumns.split(' ').length,
                        rowWidth: row.clientWidth,
                        cells: cells.map((cell) => ({
                            label: cell.dataset.label,
                            width: cell.clientWidth,
                            cellColumns: getComputedStyle(cell).gridTemplateColumns.split(' ').length,
                            scrollWidth: cell.scrollWidth
                        }))
                    };
                });

                if (width === 320) {
                    expect(state.rowColumns, `${theme}/${locale} history row must use one full-width track`).toBe(1);
                    expect(state.cells.every((cell) => cell.cellColumns === 1), `${theme}/${locale} labels/values must stack within each full-width field`).toBe(true);
                    expect(state.cells.every((cell) => cell.width > 180), `${theme}/${locale} each history field must have readable width`).toBe(true);
                } else {
                    expect(state.rowWidth).toBeGreaterThan(250);
                    const minimumCellWidth = width === 390 ? 80 : 40;
                    expect(state.cells.every((cell) => cell.width > minimumCellWidth), `${theme}/${locale} history fields should retain usable width at ${width}px`).toBe(true);
                }

                const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
                expect(dimensions.document, `${width}px ${theme}/${locale} document overflow`).toBeLessThanOrEqual(width);
                expect(dimensions.body, `${width}px ${theme}/${locale} body overflow`).toBeLessThanOrEqual(width);
                await page.screenshot({ path: path.join(OUTPUT, `saas-billing-${width}-${theme}-${locale}.png`), fullPage: true, animations: 'disabled' });
                evidence.push({ width, theme, locale, dimensions, historyRowColumns: state.rowColumns, historyFields: state.cells });
            }
        }
    }

    expect(writes, 'Responsive visual QA must not perform API writes').toEqual([]);
    expect(pageErrors, 'No uncaught browser errors').toEqual([]);
    await fs.writeFile(path.join(OUTPUT, 'verification.json'), JSON.stringify({ widths: WIDTHS, themes: THEMES, locales: LOCALES, apiWrites: writes, pageErrors, readOnly: true, fixtureOnly: true, evidence }, null, 2), 'utf8');
});
