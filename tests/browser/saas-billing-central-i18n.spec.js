const fs = require('node:fs/promises');
const path = require('node:path');
const { test, expect } = require('@playwright/test');

const OUTPUT = path.resolve(process.cwd(), 'qa/artifacts/saas-billing-central-i18n');
const WIDTHS = [320, 375, 390, 768, 1024, 1440, 1920];
const THEMES = ['light', 'dark'];
const LOCALES = ['ar', 'en'];

const terms = [
    { code: 'monthly', durationMonths: 1, price: 599, currency: 'EGP', isActive: true },
    { code: 'quarterly', durationMonths: 3, price: 1599, currency: 'EGP', isActive: true },
    { code: 'semiannual', durationMonths: 6, price: 2999, currency: 'EGP', isActive: true },
    { code: 'annual', durationMonths: 12, price: 5499, currency: 'EGP', isActive: true }
];

const plans = [
    { id: 9101, code: 'qa-basic', name: 'Basic plan (server)', description: 'Provider plan description — keep unchanged', billingPeriod: 'monthly', isActive: true, terms, maxMembers: 500, maxClients: 100, maxUsers: 5, maxBranches: 2, maxAiGenerations: 100, maxStorageMb: 1024, features: { members: true, attendance: true } },
    { id: 9102, code: 'qa-pro', name: 'Pro plan (server)', description: 'Provider Pro description — keep unchanged', billingPeriod: 'monthly', isActive: true, terms: terms.map((term) => ({ ...term, price: term.price + 400 })), maxMembers: 1500, maxClients: 300, maxUsers: 15, maxBranches: 5, maxAiGenerations: 400, maxStorageMb: 5120, features: { members: true, attendance: true } }
];

const billingFixture = {
    tenant: { id: 9100, name: 'Read-only QA Gym (server)', slug: 'read-only-qa-gym', tenantType: 'gym', status: 'active' },
    subscription: { id: 9104, status: 'active', startsAt: '2026-01-01T00:00:00Z', expiresAt: '2027-01-01T00:00:00Z', plan: plans[0] },
    plans,
    featureCatalog: [
        { key: 'members', description: 'Provider feature description — do not translate' },
        { key: 'attendance', description: 'Provider attendance description — do not translate' }
    ],
    usage: { members: 24, clients: 2, users: 2, branches: 1, aiGenerations: 3, storageBytes: 1048576 },
    requests: [{ id: 9105, createdAt: '2026-10-01T09:00:00Z', plan: { name: 'Basic request (server)' }, durationMonths: 3, amount: 1599, currency: 'EGP', status: 'approved', proof: { id: 9106 }, reviewNotes: 'Server review note — unchanged' }],
    requestsPagination: { page: 1, pages: 1, total: 1 }
};

function normalizeDigits(value) {
    return String(value).replace(/[٠-٩۰-۹]/gu, (digit) => String('٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹'.indexOf(digit) % 10)).replace(/[^0-9]/gu, '');
}

test('SaaS billing central i18n retains billing/form data and performs no locale-triggered requests', async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    test.skip(testInfo.project.name !== 'desktop', 'The test owns its complete internal locale/theme/viewport matrix.');
    await fs.mkdir(OUTPUT, { recursive: true });
    const apiReads = [];
    const apiWrites = [];
    const externalRequests = [];
    const pageErrors = [];
    const evidence = [];
    let holdInitialBilling = true;
    let releaseInitialBilling;
    const initialBillingGate = new Promise((resolve) => { releaseInitialBilling = resolve; });

    await page.route('**/*', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const method = request.method().toUpperCase();
        if (!['localhost', '127.0.0.1'].includes(url.hostname)) {
            externalRequests.push(`${method} ${url.origin}${url.pathname}`);
            return route.abort('blockedbyclient');
        }
        if (!url.pathname.startsWith('/api/')) return route.continue();
        if (!['GET', 'HEAD'].includes(method)) {
            apiWrites.push(`${method} ${url.pathname}`);
            return route.abort('blockedbyclient');
        }
        apiReads.push({ method, path: url.pathname, query: url.search });
        if (url.pathname === '/api/saas/subscription' && holdInitialBilling) await initialBillingGate;
        const responses = {
            '/api/auth/session': { authenticated: true, user: { id: 9100, name: 'Read-only QA Owner', role: 'Owner', tenantType: 'gym', permissions: [] } },
            '/api/branding': { identity: { brandName: 'Read-only QA Gym' } },
            '/api/bootstrap': { branches: [], sections: [], defaultBranch: null },
            '/api/saas/subscription': billingFixture,
            '/api/saas/subscription-requests': { requests: [], pagination: { page: 1, pages: 1, total: 0 } },
            '/api/saas/entitlements': { tenantStatus: 'active', subscription: { status: 'active' }, entitlements: { features: {}, limits: {} } },
            '/api/dashboard': { stats: { total: 24, active: 24, expired: 0, expiringSoon: 0, frozen: 0 }, alerts: [] }
        };
        return route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(responses[url.pathname] || {}) });
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto('/index.html#saas-billing', { waitUntil: 'domcontentloaded' });
    await page.evaluate(async () => {
        if (!window.topGymAuthReady) throw new Error('Auth readiness is unavailable.');
        await window.topGymAuthReady;
    });
    const billingTab = page.locator('[data-page-tab="saas-billing"]:visible');
    if (!(await billingTab.count())) {
        await page.locator('#mobileNavToggle').click();
        await expect(page.locator('.app-shell')).toHaveClass(/mobile-nav-open/);
    }
    await billingTab.click();
    const section = page.locator('#saasBillingSection');
    await expect(section).toBeVisible();
    await expect.poll(() => apiReads.some((entry) => entry.path === '/api/saas/subscription')).toBe(true);
    const loadingEvidence = [];
    try {
        for (const width of [320, 1440]) {
            await page.setViewportSize({ width, height: width <= 390 ? 900 : 960 });
            for (const theme of THEMES) {
                for (const locale of LOCALES) {
                    await page.evaluate(({ mode, language }) => {
                        document.documentElement.dataset.theme = mode;
                        document.body.dataset.theme = mode;
                        window.TopGymI18n.set(language, { persist: false });
                    }, { mode: theme, language: locale });
                    const expected = locale === 'en'
                        ? ['Loading subscription details…', 'Loading plans…', 'Loading requests…']
                        : ['جارٍ تحميل بيانات الاشتراك…', 'جارٍ تحميل الباقات…', 'جارٍ تحميل الطلبات…'];
                    const loading = [
                        section.locator('#saasSubscriptionSummary .saas-loading-block'),
                        section.locator('#saasPlansList .saas-empty'),
                        section.locator('#saasRequestsList .saas-empty')
                    ];
                    for (let index = 0; index < loading.length; index += 1) await expect(loading[index]).toHaveText(expected[index]);
                    const screenshot = `saas-billing-loading-${width}-${theme}-${locale}.png`;
                    await page.screenshot({ path: path.join(OUTPUT, screenshot), fullPage: true, animations: 'disabled' });
                    loadingEvidence.push({ width, theme, locale, screenshot, messages: expected });
                }
            }
        }
    } finally {
        holdInitialBilling = false;
        releaseInitialBilling();
    }
    const dialog = page.locator('.saas-request-dialog');
    await expect(section.locator('#saasPlansList [data-saas-plan-card]')).toHaveCount(2);
    await expect(section.locator('#saasRequestsList tr')).toHaveCount(1);
    await expect(section.locator('[data-saas-payment-proof]')).toHaveAttribute('href', '/api/saas/payment-proofs/9106/file');

    await page.locator('.saas-request-open').click();
    await expect(dialog).toBeVisible();
    const form = page.locator('#saasSubscriptionForm');
    await expect(form).toBeVisible();
    await page.locator('#saasPlanSelect').selectOption('9102');
    await page.locator('#saasTermSelect').selectOption('quarterly');
    await page.locator('#saasRequestNotes').fill('QA note must stay unchanged');
    await page.locator('#saasPaymentProof').setInputFiles({ name: 'proof-qa.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 read-only fixture') });
    await expect(page.locator('.file-upload-control-name')).toContainText('proof-qa.pdf');
    const billingReadsBeforeMatrix = apiReads.filter((entry) => entry.path.startsWith('/api/saas/')).length;
    const formSnapshot = {
        planId: await page.locator('#saasPlanSelect').inputValue(),
        termCode: await page.locator('#saasTermSelect').inputValue(),
        notes: await page.locator('#saasRequestNotes').inputValue(),
        fileName: await page.locator('#saasPaymentProof').evaluate((input) => input.files?.[0]?.name || '')
    };

    const dialogEvidence = [];
    const applicationEvidence = [];
    for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: width <= 390 ? 900 : 960 });
        for (const theme of THEMES) {
            for (const locale of LOCALES) {
                await page.evaluate(({ mode, language }) => {
                    document.documentElement.dataset.theme = mode;
                    document.body.dataset.theme = mode;
                    window.TopGymI18n.set(language, { persist: false });
                }, { mode: theme, language: locale });

                await expect(page.locator('html')).toHaveAttribute('lang', locale);
                await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
                await expect(section).toHaveCSS('direction', locale === 'ar' ? 'rtl' : 'ltr');
                await expect(section.locator('.saas-table th').first()).toHaveCSS('text-align', 'start');
                await expect(section.locator('#saasBillingTitle')).toHaveText(locale === 'en' ? 'Gym subscription to the platform' : 'اشتراك الجيم في المنصة');
                await expect(section.locator('#saasPlansTitle')).toHaveText(locale === 'en' ? 'Available plans' : 'الباقات المتاحة');
                await expect(section.locator('#saasRequestsTitle')).toHaveText(locale === 'en' ? 'Subscription request history' : 'سجل طلبات الاشتراك');
                await expect(page.locator('#saasPlanSelect')).toHaveValue(formSnapshot.planId);
                await expect(page.locator('#saasTermSelect')).toHaveValue(formSnapshot.termCode);
                await expect(page.locator('#saasRequestNotes')).toHaveValue(formSnapshot.notes);
                await expect(page.locator('#saasPaymentProof')).toHaveJSProperty('files.length', 1);
                await expect.poll(() => page.locator('#saasPaymentProof').evaluate((input) => input.files?.[0]?.name || '')).toBe(formSnapshot.fileName);
                await expect(section.locator('[data-saas-plan-card="9101"] h5')).toHaveText('Basic plan (server)');
                await expect(section.locator('[data-saas-plan-card="9101"] .saas-muted')).toContainText('Provider plan description — keep unchanged');
                await expect(section.locator('.saas-summary-gym strong')).toHaveText('Read-only QA Gym (server)');
                await expect(section.locator('#saasRequestsList tr')).toContainText('Basic request (server)');
                await expect(section.locator('#saasRequestsList tr')).toContainText('Server review note — unchanged');
                await expect(section.locator('#saasRequestsList .saas-status')).toHaveAttribute('data-status', 'approved');
                await expect(section.locator('#saasRequestsList .saas-status')).toHaveText(locale === 'en' ? 'Approved' : 'مقبول');
                await expect(section.locator('[data-saas-payment-proof]')).toHaveAttribute('href', '/api/saas/payment-proofs/9106/file');
                await expect(dialog.locator('label[for="saasRequestNotes"] .saas-muted')).toHaveText(locale === 'en' ? 'Optional' : 'اختياري');
                await expect(dialog.locator('label[for="saasPaymentProof"] .saas-muted')).toHaveText(locale === 'en' ? 'Image or PDF up to 4MB' : 'أي صورة أو PDF حتى 4MB');
                const currentBadge = await section.locator('[data-saas-plan-card="9101"]').evaluate((card) => ({
                    label: card.dataset.currentLabel,
                    renderedLabel: getComputedStyle(card, '::before').content.replace(/^['"]|['"]$/gu, '')
                }));
                expect(currentBadge.label).toBe(locale === 'en' ? 'Current plan' : 'الباقة الحالية');
                expect(currentBadge.renderedLabel).toBe(currentBadge.label);

                if (locale === 'en') {
                    await expect(page.locator('label[for="saasPlanSelect"]')).toContainText('Requested plan');
                    await expect(page.locator('label[for="saasPaymentProof"]')).toContainText('Payment proof');
                    await expect(section.locator('[data-saas-payment-proof]')).toHaveText('View proof');
                    await expect(section.locator('.saas-requests-panel thead')).toContainText('Duration');
                } else {
                    await expect(page.locator('label[for="saasPlanSelect"]')).toContainText('الباقة المطلوبة');
                    await expect(page.locator('label[for="saasPaymentProof"]')).toContainText('إثبات الدفع');
                    await expect(section.locator('[data-saas-payment-proof]')).toHaveText('عرض الإثبات');
                }

                const state = await page.evaluate(() => ({
                    locale: document.documentElement.lang,
                    direction: document.documentElement.dir,
                    theme: document.documentElement.dataset.theme,
                    documentWidth: document.documentElement.scrollWidth,
                    bodyWidth: document.body.scrollWidth,
                    planIds: [...document.querySelectorAll('#saasPlanSelect option')].map((option) => option.value),
                    termCodes: [...document.querySelectorAll('#saasTermSelect option')].map((option) => option.value),
                    statusValues: [...document.querySelectorAll('#saasRequestsList [data-status]')].map((node) => node.dataset.status),
                    proofHref: document.querySelector('[data-saas-payment-proof]')?.getAttribute('href') || null,
                    amountDigits: (() => {
                        const cell = document.querySelector('#saasRequestsList tr td:nth-child(4)');
                        return cell?.textContent || '';
                    })()
                }));
                const dialogGeometry = await dialog.evaluate((element) => {
                    const rect = element.getBoundingClientRect();
                    const title = element.querySelector('#saasRequestTitle')?.getBoundingClientRect();
                    const close = element.querySelector(':scope > .dialog-close-button')?.getBoundingClientRect();
                    return {
                        open: element.open,
                        viewportWidth: window.innerWidth,
                        viewportHeight: window.innerHeight,
                        left: rect.left,
                        right: rect.right,
                        top: rect.top,
                        bottom: rect.bottom,
                        width: rect.width,
                        height: rect.height,
                        clientWidth: element.clientWidth,
                        scrollWidth: element.scrollWidth,
                        titleInside: Boolean(title && title.left >= rect.left && title.right <= rect.right),
                        closeRect: close ? { left: close.left, right: close.right, top: close.top, bottom: close.bottom } : null,
                        closeInside: Boolean(close && close.left >= rect.left && close.right <= rect.right)
                    };
                });
                expect(state.theme).toBe(theme);
                expect(state.documentWidth, `${width}px ${theme}/${locale} document overflow`).toBeLessThanOrEqual(width);
                expect(state.bodyWidth, `${width}px ${theme}/${locale} body overflow`).toBeLessThanOrEqual(width);
                expect(state.planIds).toContain('9102');
                expect(state.termCodes).toContain('quarterly');
                expect(state.statusValues).toEqual(['approved']);
                expect(state.proofHref).toBe('/api/saas/payment-proofs/9106/file');
                expect(normalizeDigits(state.amountDigits)).toBe('1599');
                expect(dialogGeometry.open).toBe(true);
                expect(dialogGeometry.width).toBeGreaterThanOrEqual(Math.min(width - 32, 560) - 2);
                expect(dialogGeometry.left).toBeGreaterThanOrEqual(-1);
                expect(dialogGeometry.right).toBeLessThanOrEqual(width + 1);
                expect(dialogGeometry.top).toBeGreaterThanOrEqual(-1);
                expect(dialogGeometry.bottom).toBeLessThanOrEqual(dialogGeometry.viewportHeight + 1);
                expect(dialogGeometry.scrollWidth).toBeLessThanOrEqual(dialogGeometry.clientWidth + 1);
                expect(dialogGeometry.titleInside).toBe(true);
                expect(dialogGeometry.closeInside, `${width}px ${theme}/${locale}: ${JSON.stringify(dialogGeometry)}`).toBe(true);

                const dialogScreenshot = `saas-billing-dialog-${width}-${theme}-${locale}.png`;
                await page.screenshot({ path: path.join(OUTPUT, dialogScreenshot), animations: 'disabled' });
                dialogEvidence.push({ width, theme, locale, screenshot: dialogScreenshot, dialog: dialogGeometry, currentBadge, form: formSnapshot });
            }
        }
    }

    await dialog.evaluate((element) => element.close());
    await expect(dialog).not.toBeVisible();
    for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: width <= 390 ? 900 : 960 });
        for (const theme of THEMES) {
            for (const locale of LOCALES) {
                await page.evaluate(({ mode, language }) => {
                    document.documentElement.dataset.theme = mode;
                    document.body.dataset.theme = mode;
                    window.TopGymI18n.set(language, { persist: false });
                }, { mode: theme, language: locale });
                await expect(section.locator('[data-saas-plan-card="9101"]')).toHaveAttribute('data-current-label', locale === 'en' ? 'Current plan' : 'الباقة الحالية');
                const screenshot = `saas-billing-${width}-${theme}-${locale}.png`;
                await page.screenshot({ path: path.join(OUTPUT, screenshot), fullPage: true, animations: 'disabled' });
                applicationEvidence.push({ width, theme, locale, screenshot });
            }
        }
    }

    expect(apiReads.filter((entry) => entry.path.startsWith('/api/saas/')).length, 'Locale changes must not refetch billing or subscription request data').toBe(billingReadsBeforeMatrix);
    expect(apiWrites, 'The focused matrix must remain read-only').toEqual([]);
    expect(externalRequests.filter((entry) => /payment|checkout|gateway|stripe|paypal/iu.test(entry))).toEqual([]);
    expect(pageErrors).toEqual([]);
    await fs.writeFile(path.join(OUTPUT, 'matrix.json'), JSON.stringify({ route: '/index.html#saas-billing', widths: WIDTHS, themes: THEMES, locales: LOCALES, cases: dialogEvidence.length, fixtureOnly: true, readOnly: true, apiReads, apiWrites, externalRequests, pageErrors, loadingEvidence, dialogEvidence, applicationEvidence }, null, 2), 'utf8');
    expect(dialogEvidence).toHaveLength(WIDTHS.length * THEMES.length * LOCALES.length);
    expect(applicationEvidence).toHaveLength(WIDTHS.length * THEMES.length * LOCALES.length);
});
