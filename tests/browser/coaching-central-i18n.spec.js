'use strict';

const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');

const ORIGIN = 'http://127.0.0.1:4173';
const OUTPUT = path.resolve(process.cwd(), 'qa/artifacts/coaching-central-i18n');
const WIDTHS = [320, 390, 768, 1440];
const THEMES = ['light', 'dark'];
const LOCALES = ['ar', 'en'];

test('Coaching central i18n preserves screen state and makes no locale-triggered requests or writes', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'One real application session records the complete responsive/theme/locale matrix.');
    test.setTimeout(180_000);

    const reads = [];
    const writes = [];
    const externalRequests = [];
    const pageErrors = [];
    const trainee = {
        id: 99201,
        fullName: 'Coaching QA Trainee — domain data remains unchanged',
        phone: '+201001234567',
        phoneCountry: 'EG',
        email: 'coaching.qa@example.test',
        workoutCount: 1,
        dietCount: 1,
        measurementCount: 2,
        lastActivity: '2026-10-12T10:00:00.000Z',
        workoutPlans: [{ id: 99211, name: 'Provider Workout Plan — unchanged', status: 'active', exerciseCount: 3, durationWeeks: 4, daysPerWeek: 3 }],
        dietPlans: [{ id: 99212, name: 'Provider Nutrition Plan — unchanged', status: 'draft', targetCalories: 2100, meals: 4, itemCount: 8 }]
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
        if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
            writes.push(`${method} ${url.pathname}`);
            return route.fulfill({ status: 405, contentType: 'application/json', body: '{"error":"read-only Coaching QA"}' });
        }
        // The static QA fixture closes the mocked EventSource response, so
        // browsers may reconnect to this read-only background stream while
        // the locale matrix is running. Reconnects are not locale-triggered
        // domain-data requests and must not make this assertion timing-based.
        if (url.pathname !== '/api/notifications/stream') {
            reads.push({ method, path: url.pathname, search: url.search });
        }
        let body = {};
        if (url.pathname === '/api/auth/session') {
            body = { authenticated: true, user: { id: 99200, name: 'Read-only Coaching QA Owner', role: 'Owner', tenantType: 'gym', permissions: [] } };
        } else if (url.pathname === '/api/branding') {
            body = { identity: { brandName: 'Read-only Coaching QA Gym' }, assets: {} };
        } else if (url.pathname === '/api/saas/entitlements') {
            body = { tenantStatus: 'active', subscription: { status: 'active', plan: { code: 'business', name: 'Business' } }, entitlements: { tenantType: 'gym', features: { coaching: true }, featureCatalog: [{ key: 'coaching', tenantTypes: ['gym'] }] } };
        } else if (url.pathname === '/api/branches/bootstrap' || url.pathname === '/api/bootstrap') {
            body = { branches: [], activeBranches: [], sections: [], defaultBranch: null, canUseAllBranches: true };
        } else if (url.pathname === '/api/external-trainees') {
            body = { trainees: [trainee], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1, hasPrevious: false, hasNext: false } };
        }
        return route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(body) });
    });

    await page.addInitScript(() => {
        localStorage.setItem('logic-fit-ui-locale', 'ar');
        localStorage.setItem('topgym-theme', 'light');
    });
    await fs.mkdir(OUTPUT, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto('/index.html#trainees', { waitUntil: 'domcontentloaded' });
    await expect.poll(() => page.locator('html').getAttribute('data-top-gym-active-tab')).toBe('trainees');

    const section = page.locator('#traineesSection');
    await expect(section).toBeVisible();
    await expect(section.locator('#externalTraineesList')).toContainText(trainee.fullName);
    await expect(section.locator('#traineesTitle')).toHaveText('المتدربون غير المشتركين');
    await expect(section.locator('.coaching-summary-card')).toHaveCount(4);
    await expect(section.locator('.external-trainees-table')).toContainText('المتدرب');
    const externalReads = () => reads.filter((entry) => entry.path === '/api/external-trainees');
    await expect.poll(() => externalReads().length).toBe(1);

    const search = section.locator('#externalTraineeSearch');
    await search.evaluate((input) => { input.value = 'search state remains'; });
    const screenshots = [];
    for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: width <= 390 ? 850 : 960 });
        for (const theme of THEMES) {
            for (const locale of LOCALES) {
                await page.evaluate(({ mode, language }) => {
                    document.documentElement.dataset.theme = mode;
                    document.body.dataset.theme = mode;
                    window.TopGymI18n.set(language, { persist: false });
                }, { mode: theme, language: locale });
                await expect(page.locator('html')).toHaveAttribute('lang', locale);
                await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
                await expect(section.locator('#traineesTitle')).toHaveText(locale === 'ar' ? 'المتدربون غير المشتركين' : 'External trainees');
                await expect(section.locator('.coaching-kicker')).toHaveText(locale === 'ar' ? 'إدارة التدريب والتغذية' : 'Training & nutrition management');
                await expect(section.locator('#addExternalTraineeButton')).toContainText(locale === 'ar' ? 'إضافة متدرب خارجي' : 'Add external trainee');
                await expect(section.locator('#externalTraineeRefreshButton')).toContainText(locale === 'ar' ? 'تحديث القائمة' : 'Refresh list');
                await expect(section.locator('.external-trainees-table thead')).toContainText(locale === 'ar' ? 'المتدرب' : 'Trainee');
                await expect(section.locator('#externalTraineesList')).toContainText(trainee.fullName);
                await expect(section.locator('#externalTraineesList')).toContainText('Provider Workout Plan — unchanged');
                await expect(search).toHaveValue('search state remains');

                const geometry = await page.evaluate(() => ({
                    viewport: innerWidth,
                    document: document.documentElement.scrollWidth,
                    body: document.body.scrollWidth,
                    section: document.getElementById('traineesSection').scrollWidth,
                    locale: document.documentElement.lang,
                    direction: document.documentElement.dir,
                    theme: document.documentElement.dataset.theme
                }));
                expect(geometry.document, `document overflow at ${width}/${theme}/${locale}`).toBeLessThanOrEqual(width);
                expect(geometry.body, `body overflow at ${width}/${theme}/${locale}`).toBeLessThanOrEqual(width);
                expect(geometry.section, `Coaching overflow at ${width}/${theme}/${locale}`).toBeLessThanOrEqual(width);
                expect(geometry.locale).toBe(locale);
                expect(geometry.direction).toBe(locale === 'ar' ? 'rtl' : 'ltr');
                expect(geometry.theme).toBe(theme);

                const filename = `coaching-${width}-${theme}-${locale}.png`;
                await section.screenshot({ path: path.join(OUTPUT, filename) });
                screenshots.push({ ...geometry, filename });
            }
        }
    }
    expect(externalReads(), 'locale and theme changes must not refetch trainees').toHaveLength(1);

    await page.evaluate(() => window.TopGymI18n.set('ar', { persist: false }));
    await section.locator('#addExternalTraineeButton').click();
    const dialog = page.locator('#externalTraineeDialog');
    await expect(dialog).toBeVisible();
    await page.locator('#externalFullName').fill('Input must survive locale change');
    await page.locator('#externalNotes').fill('No submit during this test');
    const requestCountBeforeDialogLocaleChanges = reads.length;
    await page.evaluate(() => window.TopGymI18n.set('en', { persist: false }));
    await expect(dialog.locator('#externalTraineeTitle')).toHaveText('Add external trainee');
    await expect(page.locator('#externalFullName')).toHaveValue('Input must survive locale change');
    await expect(page.locator('#externalNotes')).toHaveValue('No submit during this test');
    await page.evaluate(() => window.TopGymI18n.set('ar', { persist: false }));
    await expect(dialog.locator('#externalTraineeTitle')).toHaveText('إضافة متدرب خارجي');
    expect(reads).toHaveLength(requestCountBeforeDialogLocaleChanges);

    expect(writes, 'the test must not submit any write request').toEqual([]);
    expect(externalRequests.every((request) => request === 'GET https://cdn.jsdelivr.net/npm/sweetalert2@11'), `Unexpected external request: ${externalRequests.join(', ')}`).toBe(true);
    expect(pageErrors, 'the actual Coaching route must remain free of uncaught errors').toEqual([]);
    await fs.writeFile(path.join(OUTPUT, 'matrix.json'), JSON.stringify({ cases: screenshots.length, screenshots, externalTraineeReads: externalReads(), writes, externalRequests, pageErrors }, null, 2));
    expect(screenshots).toHaveLength(16);
});
