const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');

const trainerHtml = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'trainer-workspace.html'), 'utf8');

test('Trainer Studio shell and dashboard switch locale without losing data or refetching', async ({ page }) => {
    test.setTimeout(120_000);
    const apiReads = [];
    const writes = [];
    await page.route('**/trainer-workspace/**', async (route) => {
        if (route.request().resourceType() === 'document') {
            return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: trainerHtml });
        }
        return route.continue();
    });
    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (request.method() !== 'GET' && request.method() !== 'HEAD') {
            writes.push(`${request.method()} ${url.pathname}`);
            return route.fulfill({ status: 405, contentType: 'application/json', body: JSON.stringify({ error: 'read_only_fixture' }) });
        }
        apiReads.push(`${request.method()} ${url.pathname}`);
        let payload = {};
        if (url.pathname === '/api/auth/session') {
            payload = { authenticated: true, user: { id: 9201, name: 'مدرب الاختبار', role: 'Owner', tenantType: 'independent_trainer', mustChangePassword: false } };
        } else if (url.pathname === '/api/saas/entitlements') {
            const features = ['clients', 'coaching', 'nutrition', 'library', 'assessments', 'progress', 'goals', 'sessions', 'packages', 'payments', 'reports', 'portal', 'notifications', 'tasks', 'templates'];
            payload = { tenantStatus: 'active', subscription: { status: 'active', plan: { code: 'basic', name: 'Basic' } }, entitlements: { tenantType: 'independent_trainer', features: Object.fromEntries(features.map((feature) => [feature, true])), featureCatalog: features.map((key) => ({ key, tenantTypes: ['independent_trainer'] })) } };
        } else if (url.pathname === '/api/saas/subscription') {
            payload = { tenant: { name: 'مساحة المدرب التجريبية' }, subscription: { status: 'active', plan: { name: 'Trainer' } } };
        } else if (url.pathname === '/api/trainer/workspace') {
            payload = { metrics: { activeClients: 3, sessionsToday: 2, upcomingSessions: 4, packagesExpiring: 1, outstandingPayments: 850, clientsNeedingFollowUp: 1, recentMeasurements: 2, recentCheckins: 1 } };
        } else if (url.pathname === '/api/trainer/sessions') {
            payload = { sessions: [], items: [] };
        }
        return route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(payload) });
    });

    await page.goto('/trainer-workspace/dashboard', { waitUntil: 'networkidle' });
    await expect(page.locator('.trainer-studio-topbar')).toBeVisible();
    await expect(page.locator('#trainerQuickActionsTitle')).toHaveText('خطوتك التالية');
    await expect(page.locator('#trainerMetricClients')).toHaveText('3');
    const readsAfterInitialRender = [...apiReads];
    const output = path.resolve(process.cwd(), 'qa/artifacts/trainer-studio-v2-i18n-central');
    await fs.promises.mkdir(output, { recursive: true });

    for (const width of [1440, 768, 390, 320]) {
        await page.setViewportSize({ width, height: width <= 390 ? 844 : 900 });
        for (const theme of ['light', 'dark']) {
            await page.evaluate((value) => window.TopGymTheme.set(value), theme);
            for (const locale of ['ar', 'en']) {
                const currentLocale = await page.evaluate(() => window.TopGymI18n.get());
                if (currentLocale !== locale) await page.locator('#languageToggleButton').click();
                await expect(page.locator('html')).toHaveAttribute('lang', locale);
                await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
                await expect(page.locator('#trainerQuickActionsTitle')).toHaveText(locale === 'ar' ? 'خطوتك التالية' : 'Your next step');
                await expect(page.locator('[data-studio-route="clients"]')).toContainText(locale === 'ar' ? 'العملاء' : 'Clients');
                await expect(page.locator('.trainer-studio-nav-group .trainer-studio-nav-label').first()).toHaveText(locale === 'ar' ? 'العمل اليومي' : 'Daily work');
                await expect(page.locator('#trainerMetricClients')).toHaveText('3');
                await expect(page.locator('#trainerMetricPayments')).toContainText(locale === 'ar' ? '٨٥٠' : '850');
                const sizes = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
                expect(sizes.document, `${width}px ${theme} ${locale}: ${JSON.stringify(sizes)}`).toBeLessThanOrEqual(width + 1);
                expect(sizes.body, `${width}px ${theme} ${locale}: ${JSON.stringify(sizes)}`).toBeLessThanOrEqual(width + 1);
                if ([1440, 390].includes(width)) {
                    await page.screenshot({ path: path.join(output, `dashboard-${width}-${theme}-${locale}.png`), fullPage: true });
                }
            }
        }
    }

    expect(apiReads).toEqual(readsAfterInitialRender);
    expect(writes).toEqual([]);
});
