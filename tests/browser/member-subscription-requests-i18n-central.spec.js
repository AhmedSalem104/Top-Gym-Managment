'use strict';

const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const planCatalog = require('../../src/services/saas-plan-catalog');
const featureCatalog = require('../../src/services/feature-catalog');

const BASE_URL = process.env.MEMBER_SUBSCRIPTION_REQUESTS_QA_BASE_URL || 'http://127.0.0.1:4173';
const OUTPUT = path.resolve(process.cwd(), 'qa/artifacts/member-subscription-requests-i18n-central');
const WIDTHS = [320, 375, 390, 768, 1024, 1440, 1920];
const THEMES = ['light', 'dark'];
const LOCALES = ['ar', 'en'];
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function requestFixture(requestId, status = 'pending') {
    return {
        id: requestId,
        status,
        requestType: 'renewal',
        createdAt: '2026-10-10T09:30:00.000Z',
        paymentDate: '2026-10-09',
        reviewNotes: status === 'pending' ? '' : 'Fixture review note محفوظ كما هو',
        member: { name: 'QA Member اختبار', membershipCode: { maskedCode: 'QA-MEMBER-42' } },
        membership: { plan: 'Fixture gym plan', type: 'Monthly', startDate: '2026-10-01', endDate: '2026-10-31' },
        pricing: { amountDue: 1250, listPrice: 1500, currency: 'EGP' },
        proof: { id: requestId + 1000, verified: true }
    };
}

test('member subscription requests use central Arabic/English i18n across viewport and theme matrix without writes or locale refetch', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'One desktop worker runs the complete member-subscription-requests locale/theme/viewport matrix.');
    test.setTimeout(150_000);

    const requests = [];
    let fixtureScenario = 'populated';
    let releaseHeldRequest = null;
    const plan = planCatalog.PLAN_CONFIGURATIONS.find((item) => item.code === 'business');
    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const method = request.method().toUpperCase();
        requests.push({ method, pathname: url.pathname, search: url.search });
        if (!READ_METHODS.has(method)) {
            return route.fulfill({ status: 405, contentType: 'application/json; charset=utf-8', body: JSON.stringify({ error: 'Read-only subscription request fixture: write blocked.' }) });
        }

        let payload = {};
        if (url.pathname === '/api/auth/session') {
            payload = { authenticated: true, user: { id: 98152, name: 'Subscription Requests QA Owner', role: 'Owner', tenantType: 'gym', permissions: [] } };
        } else if (url.pathname === '/api/saas/entitlements') {
            payload = { tenantStatus: 'active', subscription: { status: 'active', plan: { code: plan.code, name: plan.name } }, entitlements: { tenantType: 'gym', features: planCatalog.featureFlagsForPlan(plan.code), featureCatalog: featureCatalog.getFeatureCatalog({ tenantType: 'gym' }) } };
        } else if (url.pathname === '/api/branches/bootstrap' || url.pathname === '/api/bootstrap') {
            const branch = { id: 1, name: 'QA Main Branch', code: 'qa-main', status: 'active', isMain: true };
            payload = { branches: [branch], activeBranches: [branch], defaultBranch: branch, sections: [] };
        } else if (url.pathname === '/api/notifications' || url.pathname === '/api/notifications/unread-count' || url.pathname === '/api/notifications/stream') {
            payload = { items: [], notifications: [], unreadCount: 0, hasMore: false };
        } else if (url.pathname === '/api/member-subscription-requests') {
            if (fixtureScenario === 'loading') {
                await new Promise((resolve) => { releaseHeldRequest = resolve; });
            }
            if (fixtureScenario === 'error') {
                return route.fulfill({ status: 503, contentType: 'application/json; charset=utf-8', body: JSON.stringify({ error: 'Synthetic read-only QA failure.', code: 'QA_SYNTHETIC_READ_FAILURE' }) });
            }
            if (fixtureScenario === 'empty') {
                return route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify({ requests: [], pagination: { page: 1, pageSize: 15, total: 0, pages: 1 } }) });
            }
            const requestedPage = Number(url.searchParams.get('page') || 1);
            const selectedStatus = url.searchParams.get('status') || 'pending';
            payload = {
                requests: [requestFixture(requestedPage === 1 ? 72001 : 72002, selectedStatus)],
                pagination: { page: requestedPage, pageSize: 15, total: 30, pages: 2 }
            };
        }
        return route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(payload) });
    });
    await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173)/u, (route) => route.abort());

    await page.goto(`${BASE_URL}/index.html#member-subscription-requests`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.topGymAuth?.isReady?.() === true, null, { timeout: 25_000 });
    await expect.poll(() => page.evaluate(() => Boolean(window.TopGymI18n))).toBe(true);
    await page.evaluate(() => window.TopGymI18n.set('ar'));
    const tab = page.locator('[data-page-tab="member-subscription-requests"]');
    const mobileNav = page.locator('#mobileNavToggle');
    if (await mobileNav.isVisible().catch(() => false)) {
        const shell = page.locator('.app-shell');
        if (!(await shell.evaluate((element) => element.classList.contains('mobile-nav-open')))) await mobileNav.click();
    }
    await expect(tab).toBeVisible({ timeout: 25_000 });
    if (await tab.getAttribute('aria-selected') !== 'true') await tab.click();
    if (await mobileNav.isVisible().catch(() => false)) {
        const shell = page.locator('.app-shell');
        if (await shell.evaluate((element) => element.classList.contains('mobile-nav-open'))) await mobileNav.click();
    }
    const section = page.locator('#memberSubscriptionRequestsSection');
    await expect(section).toBeVisible();
    await expect(page.locator('#memberSubscriptionRequestsTable [data-member-request-id]')).toHaveCount(1);
    await expect(page.locator('#memberSubscriptionRequestsTitle')).toHaveText('طلبات اشتراك الأعضاء');
    await expect(page.locator('.member-requests-table thead th').first()).toHaveText('العضو');
    await expect(page.locator('.member-request-member strong')).toHaveText('QA Member اختبار');
    await expect.poll(() => requests.filter(({ pathname }) => pathname === '/api/member-subscription-requests').length).toBe(1);

    // Exercise existing filter and pagination GET flows; mutations stay blocked by the fixture.
    await page.locator('#memberSubscriptionRequestStatus').selectOption('approved');
    await expect.poll(() => requests.filter(({ pathname }) => pathname === '/api/member-subscription-requests').length).toBe(2);
    await expect(page.locator('#memberSubscriptionRequestStatus')).toHaveValue('approved');
    await page.locator('[data-member-request-page="next"]').click();
    await expect.poll(() => requests.filter(({ pathname }) => pathname === '/api/member-subscription-requests').length).toBe(3);
    await expect(page.locator('.member-requests-pagination span')).toHaveText('صفحة 2 من 2');
    const requestsBeforeMatrix = requests.filter(({ pathname }) => pathname === '/api/member-subscription-requests').length;

    await page.waitForLoadState('networkidle');
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
                await expect(page.locator('#memberSubscriptionRequestsTitle')).toHaveText(locale === 'en' ? 'Member subscription requests' : 'طلبات اشتراك الأعضاء');
                await expect(page.locator('.member-requests-table thead th').first()).toHaveText(locale === 'en' ? 'Member' : 'العضو');
                await expect(page.locator('#memberSubscriptionRequestStatus')).toHaveValue('approved');
                await expect(page.locator('.member-requests-pagination span')).toHaveText(locale === 'en' ? 'Page 2 of 2' : 'صفحة 2 من 2');
                await expect(page.locator('.member-request-member strong')).toHaveText('QA Member اختبار');

                const snapshot = await page.evaluate(() => {
                    const screen = document.querySelector('#memberSubscriptionRequestsSection');
                    return {
                        width: innerWidth,
                        documentWidth: document.documentElement.scrollWidth,
                        bodyWidth: document.body.scrollWidth,
                        screenWidth: screen.scrollWidth,
                        screenClientWidth: screen.clientWidth,
                        requestCardColumns: getComputedStyle(document.querySelector('.member-requests-table tbody tr')).gridTemplateColumns.trim().split(/\s+/u).length,
                        direction: getComputedStyle(screen).direction,
                        theme: document.documentElement.dataset.theme,
                        locale: window.TopGymI18n.get(),
                        statusValue: document.querySelector('#memberSubscriptionRequestStatus').value,
                        pageLabel: document.querySelector('.member-requests-pagination span')?.textContent,
                        selectedTab: document.querySelector('#pageTabs [data-page-tab][aria-selected="true"]')?.dataset.pageTab,
                        dataRows: [...document.querySelectorAll('#memberSubscriptionRequestsTable [data-member-request-id]')].map((row) => row.dataset.memberRequestId),
                        untranslatedKeys: [...screen.querySelectorAll('[data-i18n^="memberSubscriptionRequests."]')].filter((element) => element.textContent.trim() === element.dataset.i18n).map((element) => element.dataset.i18n)
                    };
                });
                expect(snapshot.documentWidth, `${width}px ${theme} ${locale}: document overflow`).toBeLessThanOrEqual(width);
                expect(snapshot.bodyWidth, `${width}px ${theme} ${locale}: body overflow`).toBeLessThanOrEqual(width);
                expect(snapshot.screenWidth, `${width}px ${theme} ${locale}: screen overflow`).toBeLessThanOrEqual(snapshot.screenClientWidth + 1);
                if (width <= 430) expect(snapshot.requestCardColumns, `${width}px ${theme} ${locale}: single-column request record`).toBe(1);
                expect(snapshot.direction).toBe(locale === 'ar' ? 'rtl' : 'ltr');
                expect(snapshot.theme).toBe(theme);
                expect(snapshot.locale).toBe(locale);
                expect(snapshot.statusValue).toBe('approved');
                expect(snapshot.pageLabel).toBe(locale === 'en' ? 'Page 2 of 2' : 'صفحة 2 من 2');
                expect(snapshot.selectedTab).toBe('member-subscription-requests');
                expect(snapshot.dataRows).toEqual(['72002']);
                expect(snapshot.untranslatedKeys).toEqual([]);
                expect(requests.filter(({ pathname }) => pathname === '/api/member-subscription-requests')).toHaveLength(requestsBeforeMatrix);
                evidence.push(snapshot);
                await section.screenshot({ path: path.join(OUTPUT, `member-subscription-requests-${width}-${theme}-${locale}.png`), fullPage: true, animations: 'disabled' });
            }
        }
    }

    expect(requests.filter(({ pathname, method }) => pathname === '/api/member-subscription-requests' && method === 'GET')).toHaveLength(3);

    const stateEvidence = [];
    for (const width of [320, 1440]) {
        await page.setViewportSize({ width, height: width <= 390 ? 844 : 1000 });
        for (const theme of THEMES) {
            await page.evaluate((mode) => window.TopGymTheme?.set(mode), theme);
            for (const locale of LOCALES) {
                await page.evaluate((value) => window.TopGymI18n.set(value), locale);
                fixtureScenario = 'loading';
                await page.locator('#memberSubscriptionRequestsRefresh').click();
                await expect(page.locator('.member-requests-loading')).toContainText(locale === 'en' ? 'Loading member requests…' : 'جارٍ تحميل طلبات الأعضاء…');
                const loadingPath = `member-subscription-requests-loading-${width}-${theme}-${locale}.png`;
                await section.screenshot({ path: path.join(OUTPUT, loadingPath), animations: 'disabled' });
                stateEvidence.push({ state: 'loading', width, theme, locale, screenshot: loadingPath });
                releaseHeldRequest?.();
                releaseHeldRequest = null;
                await expect(page.locator('#memberSubscriptionRequestsTable [data-member-request-id]')).toHaveCount(1);

                fixtureScenario = 'empty';
                await page.locator('#memberSubscriptionRequestsRefresh').click();
                await expect(page.locator('.member-requests-empty strong')).toHaveText(locale === 'en' ? 'No matching requests' : 'لا توجد طلبات مطابقة');
                await expect(page.locator('.member-requests-empty span')).toHaveText(locale === 'en' ? 'Subscription and renewal requests will appear here after members submit them through the portal.' : 'ستظهر طلبات الاشتراك والتجديد هنا بعد إرسالها من بوابة العضو.');
                const emptyPath = `member-subscription-requests-empty-${width}-${theme}-${locale}.png`;
                await section.screenshot({ path: path.join(OUTPUT, emptyPath), animations: 'disabled' });
                stateEvidence.push({ state: 'empty', width, theme, locale, screenshot: emptyPath });

                fixtureScenario = 'error';
                await page.locator('#memberSubscriptionRequestsRefresh').click();
                await expect(page.locator('.member-requests-error strong')).toHaveText(locale === 'en' ? 'Could not load requests' : 'تعذر تحميل الطلبات');
                await expect(page.locator('.member-requests-error span')).toHaveText(locale === 'en' ? 'The operation could not be completed. Try again.' : 'تعذر تنفيذ العملية. حاول مرة أخرى.');
                const errorPath = `member-subscription-requests-error-${width}-${theme}-${locale}.png`;
                await section.screenshot({ path: path.join(OUTPUT, errorPath), animations: 'disabled' });
                stateEvidence.push({ state: 'error', width, theme, locale, screenshot: errorPath });
            }
        }
    }

    expect(requests.filter(({ method }) => !READ_METHODS.has(method)), 'No write request may escape the local fixture').toEqual([]);
    expect(requests.filter(({ pathname, method }) => pathname === '/api/member-subscription-requests' && method === 'GET')).toHaveLength(27);
    await fs.writeFile(path.join(OUTPUT, 'matrix.json'), JSON.stringify({ generatedAt: new Date().toISOString(), viewports: WIDTHS, themes: THEMES, locales: LOCALES, readOnly: true, ownerSession: 'synthetic fixture', subscriptionRequestReads: 27, writes: 0, extraSubscriptionRequestReadsDuringLocaleThemeViewportMatrix: 0, retainedStatusFilter: 'approved', retainedPage: 2, retainedMemberData: true, evidence, stateEvidence }, null, 2), 'utf8');
});

test('locale rerender keeps an in-flight review disabled and cannot duplicate the locally mocked request', async ({ page }) => {
    let requestStatus = 'pending';
    let postCount = 0;
    let startPost;
    let completePost;
    const postStarted = new Promise((resolve) => { startPost = resolve; });
    const postGate = new Promise((resolve) => { completePost = resolve; });
    const plan = planCatalog.PLAN_CONFIGURATIONS.find((item) => item.code === 'business');

    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const method = request.method().toUpperCase();
        if (method === 'POST' && url.pathname === '/api/member-subscription-requests/72001/approve') {
            postCount += 1;
            startPost();
            await postGate;
            requestStatus = 'approved';
            return route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify({ success: true }) });
        }
        if (!READ_METHODS.has(method)) {
            return route.fulfill({ status: 405, contentType: 'application/json; charset=utf-8', body: JSON.stringify({ error: 'Unapproved write blocked by local QA fixture.' }) });
        }

        let payload = {};
        if (url.pathname === '/api/auth/session') {
            payload = { authenticated: true, user: { id: 98153, name: 'Review Race QA Owner', role: 'Owner', tenantType: 'gym', permissions: [] } };
        } else if (url.pathname === '/api/saas/entitlements') {
            payload = { tenantStatus: 'active', subscription: { status: 'active', plan: { code: plan.code, name: plan.name } }, entitlements: { tenantType: 'gym', features: planCatalog.featureFlagsForPlan(plan.code), featureCatalog: featureCatalog.getFeatureCatalog({ tenantType: 'gym' }) } };
        } else if (url.pathname === '/api/branches/bootstrap' || url.pathname === '/api/bootstrap') {
            const branch = { id: 1, name: 'QA Main Branch', code: 'qa-main', status: 'active', isMain: true };
            payload = { branches: [branch], activeBranches: [branch], defaultBranch: branch, sections: [] };
        } else if (url.pathname === '/api/notifications' || url.pathname === '/api/notifications/unread-count' || url.pathname === '/api/notifications/stream') {
            payload = { items: [], notifications: [], unreadCount: 0, hasMore: false };
        } else if (url.pathname === '/api/member-subscription-requests') {
            payload = {
                requests: [requestFixture(72001, requestStatus)],
                pagination: { page: 1, pageSize: 15, total: 1, pages: 1 }
            };
        }
        return route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(payload) });
    });
    await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173)/u, (route) => route.abort());

    await page.goto(`${BASE_URL}/index.html#member-subscription-requests`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.topGymAuth?.isReady?.() === true, null, { timeout: 25_000 });
    // The mobile shell keeps navigation inside its drawer. Verify the selected
    // route's real content rather than requiring the desktop tab to be visible.
    await expect(page.locator('#memberSubscriptionRequestsSection')).toBeVisible({ timeout: 25_000 });
    await expect(page.locator('[data-member-request-action="approve"]')).toBeVisible();
    await page.evaluate(() => {
        window.TopGymI18n?.set?.('ar');
        window.Swal = { fire: async () => ({ isConfirmed: true, value: '2026-10-09' }) };
    });

    await page.locator('[data-member-request-action="approve"]').click();
    await postStarted;
    const firstPendingButton = page.locator('[data-member-request-action="approve"]');
    await expect(firstPendingButton).toBeDisabled();
    await page.evaluate(() => window.TopGymI18n.set('en'));
    const rerenderedButton = page.locator('[data-member-request-action="approve"]');
    await expect(rerenderedButton).toBeDisabled();
    await expect(rerenderedButton).toHaveText('Approving…');
    await rerenderedButton.evaluate((button) => button.click());
    expect(postCount).toBe(1);

    completePost();
    await expect(page.locator('.member-request-status-approved')).toBeVisible();
    await expect(page.locator('[data-member-request-action="approve"]')).toHaveCount(0);
    expect(postCount).toBe(1);
});

test('real approve and reject dialogs are localized, bounded, and safely cancellable', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The desktop worker owns the dialog viewport/locale/theme matrix.');
    test.setTimeout(120_000);

    const requests = [];
    const pageErrors = [];
    const artifactDirectory = path.resolve(process.cwd(), 'qa/artifacts/member-subscription-requests-dialog-closure-20261014');
    await fs.mkdir(artifactDirectory, { recursive: true });

    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const method = request.method().toUpperCase();
        requests.push({ method, pathname: url.pathname });
        if (!READ_METHODS.has(method)) {
            return route.fulfill({ status: 405, contentType: 'application/json; charset=utf-8', body: JSON.stringify({ error: 'Read-only dialog-closure fixture blocked this write.' }) });
        }

        let payload = {};
        if (url.pathname === '/api/auth/session') {
            payload = { authenticated: true, user: { id: 98154, name: 'Dialog Closure QA Owner', role: 'Owner', tenantType: 'gym', permissions: [] } };
        } else if (url.pathname === '/api/saas/entitlements') {
            const plan = planCatalog.PLAN_CONFIGURATIONS.find((item) => item.code === 'business');
            payload = { tenantStatus: 'active', subscription: { status: 'active', plan: { code: plan.code, name: plan.name } }, entitlements: { tenantType: 'gym', features: planCatalog.featureFlagsForPlan(plan.code), featureCatalog: featureCatalog.getFeatureCatalog({ tenantType: 'gym' }) } };
        } else if (url.pathname === '/api/branches/bootstrap' || url.pathname === '/api/bootstrap') {
            const branch = { id: 1, name: 'QA Main Branch', code: 'qa-main', status: 'active', isMain: true };
            payload = { branches: [branch], activeBranches: [branch], defaultBranch: branch, sections: [] };
        } else if (url.pathname === '/api/notifications' || url.pathname === '/api/notifications/unread-count' || url.pathname === '/api/notifications/stream') {
            payload = { items: [], notifications: [], unreadCount: 0, hasMore: false };
        } else if (url.pathname === '/api/member-subscription-requests') {
            payload = { requests: [requestFixture(72003)], pagination: { page: 1, pageSize: 15, total: 1, pages: 1 } };
        }
        return route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(payload) });
    });
    // Use the actual optional library from its canonical CDN URL. Do not stub or imitate SweetAlert UI.
    await page.route('https://cdn.jsdelivr.net/npm/sweetalert2@11', (route) => route.continue());
    await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173|cdn\.jsdelivr\.net\/npm\/sweetalert2@11)/u, (route) => route.abort());
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto(`${BASE_URL}/index.html#member-subscription-requests`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.topGymAuth?.isReady?.() === true, null, { timeout: 25_000 });
    await expect(page.locator('[data-page-tab="member-subscription-requests"]')).toBeVisible({ timeout: 25_000 });
    const tab = page.locator('[data-page-tab="member-subscription-requests"]');
    if (await tab.getAttribute('aria-selected') !== 'true') await tab.click();
    const approveAction = page.locator('[data-member-request-action="approve"]');
    const rejectAction = page.locator('[data-member-request-action="reject"]');
    await expect(approveAction).toBeVisible();
    await expect(rejectAction).toBeVisible();

    let libraryBlocker = null;
    try {
        await page.evaluate(async () => {
            await window.topGymLoadExternalAsset('sweetalert');
        });
        await expect.poll(() => page.evaluate(() => Boolean(window.Swal?.fire))).toBe(true);
    } catch (error) {
        libraryBlocker = `The real SweetAlert2 library could not be loaded from its configured CDN: ${String(error?.message || error)}`;
        await fs.writeFile(path.join(artifactDirectory, 'blocker.json'), JSON.stringify({ generatedAt: new Date().toISOString(), blocker: libraryBlocker, fakeUiUsed: false, apiRequests: requests }, null, 2), 'utf8');
        test.skip(true, libraryBlocker);
        return;
    }

    const cases = [];
    for (const width of [320, 1440]) {
        await page.setViewportSize({ width, height: width === 320 ? 700 : 900 });
        for (const theme of THEMES) {
            await page.evaluate((mode) => window.TopGymTheme?.set?.(mode), theme);
            for (const locale of LOCALES) {
                await page.evaluate((value) => window.TopGymI18n?.set?.(value), locale);
                for (const action of ['approve', 'reject']) {
                    const trigger = action === 'approve' ? approveAction : rejectAction;
                    await trigger.click();
                    const popup = page.locator('.swal2-popup');
                    await expect(popup).toBeVisible();
                    const title = action === 'approve'
                        ? (locale === 'en' ? 'Approve this subscription request?' : 'اعتماد طلب الاشتراك؟')
                        : (locale === 'en' ? 'Reject subscription request' : 'رفض طلب الاشتراك');
                    const cancel = locale === 'en' ? 'Cancel' : 'إلغاء';
                    const confirm = action === 'approve'
                        ? (locale === 'en' ? 'Approve and activate' : 'اعتماد وتفعيل')
                        : (locale === 'en' ? 'Reject request' : 'رفض الطلب');
                    await expect(popup.locator('.swal2-title')).toHaveText(title);
                    await expect(popup.locator('.swal2-cancel')).toHaveText(cancel);
                    await expect(popup.locator('.swal2-confirm')).toHaveText(confirm);
                    if (action === 'approve') {
                        await expect(popup.locator('.swal2-html-container')).toContainText(locale === 'en'
                            ? 'The membership will be created or renewed and the payment recorded in one transaction.'
                            : 'سيتم إنشاء أو تجديد العضوية وتسجيل الدفعة داخل معاملة واحدة.');
                        await expect(popup.locator('#swal2-input')).toBeVisible();
                    } else {
                        await expect(popup.locator('.swal2-textarea')).toBeVisible();
                        await expect(popup.locator('.swal2-textarea')).toHaveAttribute('aria-label', locale === 'en' ? 'Reason for rejection' : 'سبب الرفض');
                    }

                    const bounds = await popup.evaluate((element) => {
                        const rect = element.getBoundingClientRect();
                        const confirmButton = element.querySelector('.swal2-confirm').getBoundingClientRect();
                        const cancelButton = element.querySelector('.swal2-cancel').getBoundingClientRect();
                            const fields = [...element.querySelectorAll('.swal2-textarea, #swal2-input')];
                            const field = fields.find((candidate) => candidate.getClientRects().length > 0 && candidate.getBoundingClientRect().width > 0)
                                || fields[0]
                                || null;
                        const fieldRect = field?.getBoundingClientRect();
                        return {
                            left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom,
                            insideViewport: rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight,
                            buttonsInBounds: confirmButton.left >= rect.left && cancelButton.right <= rect.right && confirmButton.bottom <= rect.bottom && cancelButton.bottom <= rect.bottom,
                            overlappingButtons: !(confirmButton.right <= cancelButton.left || cancelButton.right <= confirmButton.left || confirmButton.bottom <= cancelButton.top || cancelButton.bottom <= confirmButton.top),
                            field: fieldRect ? { left: fieldRect.left, right: fieldRect.right, top: fieldRect.top, bottom: fieldRect.bottom } : null,
                            fieldInPopup: Boolean(fieldRect && fieldRect.left >= rect.left && fieldRect.right <= rect.right && fieldRect.top >= rect.top && fieldRect.bottom <= rect.bottom),
                            fieldInViewport: Boolean(fieldRect && fieldRect.left >= 0 && fieldRect.right <= innerWidth && fieldRect.top >= 0 && fieldRect.bottom <= innerHeight)
                        };
                    });
                    const screenshot = `member-subscription-requests-dialog-${action}-${width}-${theme}-${locale}.png`;
                    await page.screenshot({ path: path.join(artifactDirectory, screenshot), animations: 'disabled' });
                    if (!bounds.fieldInPopup || !bounds.fieldInViewport) {
                        await fs.writeFile(path.join(artifactDirectory, 'dialog-defect.json'), JSON.stringify({
                            detectedAt: new Date().toISOString(),
                            defect: 'The approval date input extends beyond the real SweetAlert popup on a 320px viewport.',
                            case: { width, theme, locale, action, screenshot },
                            popup: { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom },
                            field: bounds.field,
                            fieldInPopup: bounds.fieldInPopup,
                            fieldInViewport: bounds.fieldInViewport,
                            apiRequestsSoFar: requests,
                            writesSoFar: requests.filter(({ method }) => !READ_METHODS.has(method)),
                            uiSourceChanged: false
                        }, null, 2), 'utf8');
                    }
                    expect(bounds.insideViewport, `${width}/${theme}/${locale}/${action}: popup bounds`).toBe(true);
                    expect(bounds.buttonsInBounds, `${width}/${theme}/${locale}/${action}: action controls remain in popup`).toBe(true);
                    expect(bounds.overlappingButtons, `${width}/${theme}/${locale}/${action}: actions do not overlap`).toBe(false);
                    expect(bounds.fieldInPopup, `${width}/${theme}/${locale}/${action}: input bounds ${JSON.stringify(bounds.field)} must stay inside popup ${JSON.stringify({ left: bounds.left, right: bounds.right })}`).toBe(true);
                    expect(bounds.fieldInViewport, `${width}/${theme}/${locale}/${action}: input remains inside viewport`).toBe(true);
                    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);

                    if (action === 'reject' && width === 320 && locale === 'ar' && theme === 'dark') {
                        await page.keyboard.press('Escape');
                    } else {
                        await popup.locator('.swal2-cancel').click();
                    }
                    await expect(popup).toBeHidden();
                    await expect(trigger).toBeFocused();
                    expect(requests.filter(({ pathname, method }) => pathname.startsWith('/api/member-subscription-requests/') && !READ_METHODS.has(method))).toEqual([]);
                    cases.push({ width, theme, locale, action, title, screenshot, bounds, dismissedBy: action === 'reject' && width === 320 && locale === 'ar' && theme === 'dark' ? 'Escape' : 'Cancel', focusReturned: true });
                }
            }
        }
    }

    const writes = requests.filter(({ method }) => !READ_METHODS.has(method));
    expect(writes, 'The dialogs must be dismissed without submitting approval or rejection').toEqual([]);
    expect(requests.filter(({ pathname }) => pathname === '/api/member-subscription-requests' && !pathname.endsWith('/')).length).toBeGreaterThan(0);
    expect(pageErrors).toEqual([]);
    await fs.writeFile(path.join(artifactDirectory, 'matrix.json'), JSON.stringify({
        generatedAt: new Date().toISOString(),
        viewports: [320, 1440], themes: THEMES, locales: LOCALES,
        dialogLibrary: 'SweetAlert2 loaded from configured CDN; real UI (not stubbed)',
        fixture: 'Synthetic read-only Owner; all API methods other than GET/HEAD/OPTIONS rejected',
        cases, apiRequests: requests, writes, pageErrors,
        dialogsOpened: cases.length, dialogsCancelled: cases.filter((item) => item.dismissedBy === 'Cancel').length,
        escapeClosures: cases.filter((item) => item.dismissedBy === 'Escape').length
    }, null, 2), 'utf8');
});
