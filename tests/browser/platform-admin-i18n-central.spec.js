const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');

const panels = ['dashboard', 'gyms', 'requests', 'gym-registrations', 'payment-methods', 'plans', 'backups', 'audit', 'settings'];
const titles = {
    ar: ['لوحة المنصة', 'الجيمات', 'طلبات الاشتراك', 'طلبات الانضمام', 'وسائل دفع Logic Fit', 'الباقات', 'النسخ والتعافي', 'سجل المنصة', 'إعدادات المنصة'],
    en: ['Platform dashboard', 'Gyms', 'Subscription requests', 'Join requests', 'Logic Fit payment methods', 'Plans', 'Backup & recovery', 'Platform audit log', 'Platform settings']
};

const fixtures = {
    '/api/platform-admin/dashboard': {
        metrics: { gyms: { total: 2, active: 1, trial: 1 }, newGyms: 1, members: 8, users: 3, aiGenerations: 4, storageBytes: 2048, pendingRequests: 1, expiringSubscriptions: 0 },
        recentGyms: [{ id: 41, name: 'Fixture Gym', tenantType: 'gym', slug: 'fixture-gym', status: 'active', owner: { name: 'QA Owner' } }],
        recentActivity: [{ action: 'member_created', actorName: 'QA Admin', details: 'read-only fixture', createdAt: '2026-10-12T10:00:00Z' }]
    },
    '/api/platform-admin/plans': { plans: [] },
    '/api/platform-admin/feature-catalog': { featureCatalog: [] },
    '/api/platform-admin/tenants': { tenants: [{ id: 41, name: 'Fixture Gym', slug: 'fixture-gym', tenantType: 'gym', owner: { name: 'QA Owner', email: 'qa@example.test' }, subscription: { status: 'active', plan: { name: 'Basic' }, expiresAt: '2026-11-12', daysRemaining: 31 }, usage: { members: 8, users: 2 }, status: 'active', lastActivityAt: '2026-10-12T10:00:00Z' }], pagination: { total: 1, page: 1, pages: 1 } },
    '/api/platform-admin/subscription-requests': { requests: [{ id: 51, tenantName: 'Fixture Gym', tenantSlug: 'fixture-gym', tenantType: 'gym', plan: { name: 'Basic' }, amount: 100, currency: 'EGP', status: 'pending', createdAt: '2026-10-12T10:00:00Z', durationMonths: 1 }], pagination: { total: 1, page: 1, pages: 1 } },
    '/api/platform-admin/gym-registration-requests': { requests: [{ id: 61, gymName: 'Fixture Join Request', ownerName: 'QA Owner', whatsapp: '+201000000000', email: 'qa@example.test', plan: { name: 'Basic' }, term: { durationMonths: 3 }, pricing: { amountDue: 300, currency: 'EGP' }, paymentMethod: { name: 'Fixture method' }, status: 'pending', createdAt: '2026-10-12T10:00:00Z' }], pagination: { total: 1, page: 1, pages: 1 }, pendingCount: 1 },
    '/api/platform-admin/payment-methods': { paymentMethods: [{ id: 71, displayName: 'Fixture transfer', methodCode: 'fixture-transfer', accountReference: 'QA-REFERENCE', recipientName: 'QA recipient', instructions: 'Fixture only', isActive: true, sortOrder: 1, updatedAt: '2026-10-12T10:00:00Z' }] },
    '/api/platform-admin/backups/health': { providerStatus: 'configured', summary: { eligibleTenants: 1, backupDay: '2026-10-12', verifiedToday: 1, failedToday: 0, missingToday: 0 }, registryCoverage: { status: 'covered' }, scheduledPolicy: { weekly: true }, tenantDaily: [{ tenantId: 41, slug: 'fixture-gym', status: 'VERIFIED', backupDay: '2026-10-12', sizeBytes: 1024, verifiedAt: '2026-10-12T10:00:00Z' }] },
    '/api/platform-admin/backups': { backups: [{ id: 81, backupType: 'platform_daily', status: 'VERIFIED', backupDay: '2026-10-12', sizeBytes: 2048, verifiedAt: '2026-10-12T10:00:00Z' }], audit: [] },
    '/api/platform-admin/audit': { audit: [{ createdAt: '2026-10-12T10:00:00Z', actorName: 'QA Admin', action: 'read_only_fixture', tenantId: 'Platform', reason: 'fixture', details: 'No production data' }] }
};

test('Platform Admin central i18n preserves panel, hash, filter state and performs read-only rendering', async ({ page }) => {
    test.setTimeout(150_000);
    const requests = [];
    await page.route('**/*', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (!url.pathname.startsWith('/api/')) { await route.continue(); return; }
        requests.push({ method: request.method(), pathname: url.pathname });
        if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
            await route.fulfill({ status: 405, contentType: 'application/json', body: JSON.stringify({ error: 'Read-only QA: mutation blocked' }) });
            return;
        }
        if (url.pathname === '/api/auth/session') {
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authenticated: true, user: { id: 9001, role: 'PlatformAdmin', name: 'QA Platform Admin' } }) });
            return;
        }
        const payload = Object.entries(fixtures).find(([prefix]) => url.pathname === prefix || (prefix.endsWith('/tenants') && url.pathname === prefix))?.[1] || {};
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
    });

    const evidenceDirectory = path.resolve(process.cwd(), 'qa/artifacts/platform-admin-i18n-central');
    await fs.mkdir(evidenceDirectory, { recursive: true });
    await page.goto('/platform-admin.html#dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#platformAdminApp')).toBeVisible();
    await page.waitForFunction(() => Boolean(window.TopGymI18n));
    const languageButton = page.locator('#languageToggleButton');
    await expect(languageButton).toBeVisible();

    const screenshotCombos = new Set(['dashboard|1440|ar|light', 'gyms|390|en|dark', 'requests|320|ar|dark', 'gym-registrations|768|en|light', 'payment-methods|1440|en|dark', 'plans|390|ar|light', 'backups|768|ar|dark', 'audit|320|en|light', 'settings|1440|ar|dark']);
    for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: width <= 390 ? 844 : 900 });
        for (const theme of ['light', 'dark']) {
            await page.locator('html').evaluate((html, value) => { html.dataset.theme = value; }, theme);
            for (const locale of ['ar', 'en']) {
                if (await page.locator('html').getAttribute('lang') !== locale) await languageButton.click();
                await expect(page.locator('html')).toHaveAttribute('lang', locale);
                await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
                for (const [index, panel] of panels.entries()) {
                    const nav = page.locator(`#platformNav [data-platform-view="${panel}"]`);
                    await nav.evaluate((button) => button.click());
                    const active = page.locator(`.platform-view[data-platform-panel="${panel}"]`);
                    await expect(active).toHaveClass(/\bactive\b/);
                    await expect(page.locator('#platformPageTitle')).toHaveText(titles[locale][index]);

                    if (panel === 'gyms') {
                        await expect(page.locator('#tenantsTableBody')).toContainText(locale === 'en' ? 'Active' : 'نشط');
                        await page.locator('#tenantSearch').fill('fixture-query');
                        await expect(page.locator('#tenantSearch')).toHaveValue('fixture-query');
                        await page.waitForTimeout(320);
                    }
                    if (panel === 'requests') await expect(page.locator('#requestsTableBody')).toContainText(locale === 'en' ? 'Pending review' : 'قيد المراجعة');
                    if (panel === 'gym-registrations') await expect(page.locator('#gymRegistrationTableBody')).toContainText(locale === 'en' ? 'Pending review' : 'قيد المراجعة');
                    if (panel === 'payment-methods') await expect(page.locator('#platformPaymentMethodsTableBody')).toContainText('Fixture transfer');
                    if (panel === 'backups') await expect(page.locator('#platformBackupsTableBody')).toContainText(locale === 'en' ? 'Daily platform backup' : 'نسخة يومية للمنصة');
                    if (panel === 'audit') await expect(page.locator('#auditTableBody')).toContainText('read_only_fixture');
                    if (panel === 'settings') {
                        await expect(active).toContainText(locale === 'en' ? 'Platform settings sections' : 'أقسام إعدادات المنصة');
                        await expect(active.locator('.platform-settings-overview-head .eyebrow')).toHaveText(locale === 'en' ? 'Settings' : 'الإعدادات');
                    }

                    const hashBefore = await page.evaluate(() => location.hash);
                    const panelBefore = await page.locator('.platform-view.active').getAttribute('data-platform-panel');
                    const requestCountBefore = requests.length;
                    await languageButton.click();
                    const nextLocale = locale === 'ar' ? 'en' : 'ar';
                    await expect(page.locator('html')).toHaveAttribute('lang', nextLocale);
                    if (panel === 'settings') {
                        await expect(active.locator('.platform-settings-overview-head .eyebrow')).toHaveText(nextLocale === 'en' ? 'Settings' : 'الإعدادات');
                    }
                    await expect(page.locator('.platform-view.active')).toHaveAttribute('data-platform-panel', panelBefore);
                    await expect.poll(() => page.evaluate(() => location.hash)).toBe(hashBefore);
                    expect(requests.length, `${panel}: locale toggle must not refetch or write`).toBe(requestCountBefore);
                    if (panel === 'gyms') await expect(page.locator('#tenantSearch')).toHaveValue('fixture-query');
                    await languageButton.click();
                    await expect(page.locator('html')).toHaveAttribute('lang', locale);

                    const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
                    expect(dimensions.document, `${panel}/${locale}/${theme}/${width}: document overflow`).toBeLessThanOrEqual(width);
                    expect(dimensions.body, `${panel}/${locale}/${theme}/${width}: body overflow`).toBeLessThanOrEqual(width);
                    const combo = `${panel}|${width}|${locale}|${theme}`;
                    if (screenshotCombos.has(combo)) {
                        await page.screenshot({ path: path.join(evidenceDirectory, `${panel}-${width}-${locale}-${theme}.png`), fullPage: true });
                    }
                }
            }
        }
    }

    expect(requests.filter(({ method }) => !['GET', 'HEAD', 'OPTIONS'].includes(method))).toEqual([]);
    expect(requests.filter(({ method }) => method === 'GET').length).toBeGreaterThan(9);
});

test('Platform Admin tenant status is translated from current state without refetching', async ({ page }) => {
    const requests = [];
    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        requests.push({ method: request.method(), pathname: url.pathname });
        if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
            await route.fulfill({ status: 405, contentType: 'application/json', body: JSON.stringify({ error: 'Read-only QA: mutation blocked' }) });
            return;
        }
        if (url.pathname === '/api/auth/session') {
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authenticated: true, user: { id: 9001, role: 'PlatformAdmin', name: 'QA Platform Admin' } }) });
            return;
        }
        const payload = url.pathname === '/api/platform-admin/tenants'
            ? fixtures['/api/platform-admin/tenants']
            : url.pathname === '/api/platform-admin/plans'
                ? fixtures['/api/platform-admin/plans']
                : url.pathname === '/api/platform-admin/feature-catalog'
                    ? fixtures['/api/platform-admin/feature-catalog']
                    : url.pathname === '/api/platform-admin/dashboard'
                        ? fixtures['/api/platform-admin/dashboard']
                        : {};
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
    });

    const evidenceDirectory = path.resolve(process.cwd(), 'qa/artifacts/platform-admin-i18n-central');
    await fs.mkdir(evidenceDirectory, { recursive: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/platform-admin.html#gyms', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#platformAdminApp')).toBeVisible();
    await page.waitForFunction(() => Boolean(window.TopGymI18n));
    const languageButton = page.locator('#languageToggleButton');
    if (await page.locator('html').getAttribute('lang') !== 'ar') await languageButton.click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.locator('#tenantsTableBody')).toContainText('نشط');
    await page.screenshot({ path: path.join(evidenceDirectory, 'gyms-390-ar-light-status.png'), fullPage: true });

    const hashBefore = await page.evaluate(() => location.hash);
    const getCountBefore = requests.filter(({ method }) => method === 'GET').length;
    await languageButton.click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('#tenantsTableBody')).toContainText('Active');
    expect(requests.filter(({ method }) => method === 'GET')).toHaveLength(getCountBefore);
    await expect.poll(() => page.evaluate(() => location.hash)).toBe(hashBefore);
    await languageButton.click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.locator('#tenantsTableBody')).toContainText('نشط');
    expect(requests.filter(({ method }) => !['GET', 'HEAD', 'OPTIONS'].includes(method))).toEqual([]);
});
