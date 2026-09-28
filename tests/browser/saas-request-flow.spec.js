const { test, expect } = require('@playwright/test');
const { planRuntimeAssetVersions } = require('../../scripts/build-runtime-asset-versions');

const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);

function requestRow(id = 74) {
    return { id, createdAt: '2026-09-28T10:00:00.000Z', status: 'pending', amount: 2699, currency: 'EGP', termCode: 'semiannual', durationMonths: 6, plan: { id: 12, name: 'Basic' }, proof: { id: 88, mimeType: 'image/png', fileName: 'proof.png' } };
}

function billing(requests = []) {
    const plan = {
        id: 12, code: 'basic', name: 'Basic', description: 'QA plan', price: 599, currency: 'EGP', billingPeriod: 'monthly',
        isActive: true, availableForNewSubscriptions: true, compatibleTenantTypes: ['gym'], maxMembers: 500, maxUsers: 5,
        maxBranches: 2, maxStorageMb: 5120, maxAiGenerations: 200, features: { dashboard: true, members: true },
        terms: [
            { code: 'monthly', durationMonths: 1, price: 599, discountAmount: 0, currency: 'EGP', isActive: true },
            { code: 'quarterly', durationMonths: 3, price: 1699, discountAmount: 100, currency: 'EGP', isActive: true },
            { code: 'semiannual', durationMonths: 6, price: 2999, discountAmount: 300, currency: 'EGP', isActive: true },
            { code: 'annual', durationMonths: 12, price: 5399, discountAmount: 400, currency: 'EGP', isActive: true }
        ]
    };
    return {
        tenant: { id: 101, name: 'QA Gym', slug: 'qa-gym', tenantType: 'gym', status: 'active' },
        subscription: { status: 'active', expiresAt: '2027-09-01T00:00:00.000Z', plan },
        plans: [plan], featureCatalog: [{ key: 'members', description: 'Members', tenantTypes: ['gym'], limitKeys: [], screens: [], apiPaths: [] }],
        usage: { members: 1, users: 1, branches: 1, storageBytes: 0 },
        requests, requestsPagination: { page: 1, pages: 1, total: requests.length }
    };
}

async function openBilling(page, onSubmit, initialRequests = [], options = {}) {
    let requests = initialRequests;
    let submitCompleted = false;
    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;
        if (pathname === '/api/auth/session') return route.fulfill({ json: { authenticated: true, user: { id: 9, name: 'QA Owner', role: 'Owner', tenantType: 'gym', permissions: [] } } });
        if (pathname === '/api/branding') return route.fulfill({ json: { identity: { brandName: 'Logic Fit' } } });
        if (pathname === '/api/bootstrap') return route.fulfill({ json: { branches: [], sections: [], defaultBranch: null } });
        if (pathname === '/api/saas/subscription') {
            if (submitCompleted && options.holdPostSubmitRefresh) {
                options.onRefreshStarted?.();
                await options.waitForRefresh;
            }
            return route.fulfill({ json: billing(requests) });
        }
        if (pathname === '/api/saas/entitlements') {
            const data = billing(requests);
            return route.fulfill({ json: {
                tenantStatus: data.tenant.status,
                subscription: data.subscription,
                entitlements: { tenantType: data.tenant.tenantType, features: data.subscription.plan.features, featureCatalog: data.featureCatalog }
            } });
        }
        if (pathname === '/api/saas/subscription-requests/submit' && request.method() === 'POST') {
            const result = await onSubmit(route, request);
            submitCompleted = true;
            if (result) requests = [result];
            return;
        }
        return route.fulfill({ json: {} });
    });
    await page.goto('/index.html#saas-billing', { waitUntil: 'domcontentloaded' });
    await page.evaluate(async () => { if (window.topGymAuthReady) await window.topGymAuthReady; });
    if (await page.evaluate(() => window.matchMedia('(max-width: 767px)').matches)) {
        const mobileNavToggle = page.locator('#mobileNavToggle');
        await expect(mobileNavToggle).toBeVisible();
        await mobileNavToggle.click();
        await expect(page.locator('.app-shell')).toHaveClass(/mobile-nav-open/);
    }
    await page.locator('[data-page-tab="saas-billing"]').click();
    await expect(page.locator('#saasPlansList [data-saas-plan-card]')).toHaveCount(1);
    await page.locator('.saas-request-open').click();
    await page.locator('#saasPlanSelect').selectOption('12');
    await page.locator('#saasTermSelect').selectOption('semiannual');
    await page.locator('#saasPaymentProof').setInputFiles({ name: 'proof.png', mimeType: 'image/png', buffer: PNG });
    return page;
}

test('subscription submit is single-flight, visibly pending, cannot close, then refreshes history on success', async ({ page }) => {
    let release;
    let submitCount = 0;
    let submittedPayload = '';
    let submittedContentType = '';
    const subscriptionPostPaths = [];
    page.on('request', (request) => {
        const pathname = new URL(request.url()).pathname;
        if (request.method() === 'POST' && pathname.startsWith('/api/saas/subscription-requests')) subscriptionPostPaths.push(pathname);
    });
    const pendingResponse = new Promise((resolve) => { release = resolve; });
    await openBilling(page, async (route, request) => {
        submitCount += 1;
        submittedPayload = request.postDataBuffer()?.toString('utf8') || '';
        submittedContentType = request.headers()['content-type'] || '';
        await pendingResponse;
        await route.fulfill({ status: 201, json: { request: requestRow() } });
        return requestRow();
    });

    const dialog = page.locator('.saas-request-dialog');
    const form = page.locator('#saasSubscriptionForm');
    const button = page.locator('#saasSubscriptionSubmit');
    const idleBounds = await button.boundingBox();
    await button.click();
    await expect(button).toBeDisabled();
    const buttonState = await button.evaluate((element) => ({
        busy: element.getAttribute('aria-busy'),
        loadingClass: element.className,
        spinner: Boolean(element.querySelector('.logicfit-button-spinner'))
    }));
    expect(buttonState.busy).toBe('true');
    expect(buttonState.loadingClass).toContain('is-loading');
    expect(buttonState.spinner).toBe(true);
    await expect(button.locator('.logicfit-button-spinner')).toBeVisible();
    const pendingBounds = await button.boundingBox();
    expect(Math.abs((pendingBounds?.width || 0) - (idleBounds?.width || 0))).toBeLessThanOrEqual(0.5);
    expect(Math.abs((pendingBounds?.height || 0) - (idleBounds?.height || 0))).toBeLessThanOrEqual(0.5);
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    await page.evaluate(() => document.querySelector('#saasSubscriptionForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(submitCount).toBe(1);
    release();
    await expect(dialog).toBeHidden();
    await expect(page.locator('#saasRequestsList [data-saas-payment-proof]')).toHaveCount(1);
    await expect(button).toBeEnabled();
    await expect(page.locator('#saasPaymentProof')).toHaveValue('');
    expect(subscriptionPostPaths).toEqual(['/api/saas/subscription-requests/submit']);
    expect(submittedContentType).toMatch(/^multipart\/form-data;\s*boundary=/i);
    expect(submittedPayload).toContain('name="planId"\r\n\r\n12');
    expect(submittedPayload).toContain('name="termCode"\r\n\r\nsemiannual');
    expect(submittedPayload).toContain('name="proof"; filename="proof.png"');
    await expect(page.locator('#saasRequestsList [data-saas-request-duration]')).toHaveText(`${new Intl.NumberFormat('ar-EG').format(6)} شهر`);
});

test('successful submit closes and publishes its optimistic history before non-critical billing refresh completes', async ({ page }) => {
    let releaseRefresh;
    let refreshStarted;
    const refreshGate = new Promise((resolve) => { releaseRefresh = resolve; });
    const refreshSeen = new Promise((resolve) => { refreshStarted = resolve; });
    await openBilling(page, async (route) => {
        await route.fulfill({ status: 201, json: { request: requestRow(75) } });
        return requestRow(75);
    }, [], {
        holdPostSubmitRefresh: true,
        waitForRefresh: refreshGate,
        onRefreshStarted: refreshStarted
    });
    const dialog = page.locator('.saas-request-dialog');
    const submitButton = page.locator('#saasSubscriptionSubmit');
    await submitButton.click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('#saasRequestsList [data-saas-payment-proof]')).toHaveCount(1);
    await refreshSeen;
    await expect(dialog).toBeHidden();
    releaseRefresh();
});

test('subscription billing loads current fingerprinted assets on refresh, cache bypass, and a fresh browser session', async ({ page, browser }) => {
    await openBilling(page, async (route) => {
        await route.fulfill({ status: 503, json: { error: 'Temporary QA failure', code: 'TEMPORARY_FAILURE' } });
        return null;
    });

    const currentVersions = planRuntimeAssetVersions();
    const expectedManifest = `/js/core/feature-manifest.js?v=${currentVersions.manifestVersion}`;
    const expectedSaas = `/js/pages/saas/saas.js?v=${currentVersions.saasVersion}`;
    const assertCurrentAssets = async (targetPage) => {
        await expect(targetPage.locator('#saasPlansList [data-saas-plan-card]')).toHaveCount(1);
        const loaded = await targetPage.evaluate(() => performance.getEntriesByType('resource')
            .map((entry) => new URL(entry.name).pathname + new URL(entry.name).search)
            .filter((path) => path.includes('feature-manifest.js') || path.includes('/js/pages/saas/saas.js')));
        expect(loaded).toContain(expectedManifest);
        expect(loaded).toContain(expectedSaas);
        expect(loaded).not.toContain('/js/pages/saas/saas.js?v=6');
        await expect(targetPage.locator('#saasTermSelect')).toBeAttached();
    };

    await assertCurrentAssets(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await assertCurrentAssets(page);

    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await assertCurrentAssets(page);
    await cdp.detach();

    const freshContext = await browser.newContext({ locale: 'ar-EG', colorScheme: 'dark' });
    try {
        const freshPage = await freshContext.newPage();
        await openBilling(freshPage, async (route) => {
            await route.fulfill({ status: 503, json: { error: 'Temporary QA failure', code: 'TEMPORARY_FAILURE' } });
            return null;
        });
        await assertCurrentAssets(freshPage);
    } finally {
        await freshContext.close();
    }
});

test('subscription popup uses catalog durations and discounted server-catalog amount responsively in RTL light/dark', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openBilling(page, async (route) => {
        await route.fulfill({ status: 503, json: { error: 'Temporary QA failure', code: 'TEMPORARY_FAILURE' } });
        return null;
    });
    const terms = page.locator('#saasTermSelect option');
    await expect(terms).toHaveCount(4);
    await expect(page.locator('#saasRequestPriceSummary')).toContainText(new Intl.NumberFormat('ar-EG').format(2699));
    await page.locator('#saasTermSelect').selectOption('annual');
    await expect(page.locator('#saasRequestPriceSummary')).toContainText(new Intl.NumberFormat('ar-EG').format(4999));
    await expect(page.locator('#saasRequestCurrent')).toContainText('Basic');
    await expect(page.locator('.saas-request-dialog')).toBeVisible();
    await expect(page.locator('#saasTermSelect')).toBeVisible();
    const currentCard = await page.locator('#saasRequestCurrent').evaluate((element) => ({
        display: getComputedStyle(element).display,
        labelTop: element.querySelector('small')?.getBoundingClientRect().top,
        planTop: element.querySelector('strong')?.getBoundingClientRect().top,
        statusTop: element.querySelector('span')?.getBoundingClientRect().top,
        secureBadgeInsideUpload: Boolean(element.ownerDocument.querySelector('.saas-upload-box .status-badge.success'))
    }));
    expect(currentCard.display).toBe('grid');
    expect(currentCard.planTop).toBeGreaterThan(currentCard.labelTop);
    expect(currentCard.statusTop).toBeGreaterThan(currentCard.planTop);
    expect(currentCard.secureBadgeInsideUpload).toBe(true);
    for (const width of [320, 390, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        for (const theme of ['light', 'dark']) {
            await page.evaluate((value) => document.documentElement.setAttribute('data-theme', value), theme);
            const geometry = await page.evaluate(() => {
                const dialogElement = document.querySelector('.saas-request-dialog');
                const dialog = dialogElement.getBoundingClientRect();
                const body = dialogElement.querySelector(':scope > .modal-body');
                const form = body?.querySelector('#saasSubscriptionForm');
                const footer = dialogElement.querySelector(':scope > .form-actions');
                const header = dialogElement.querySelector(':scope > .modal-header');
                const headerRect = header?.getBoundingClientRect();
                return {
                    direction: getComputedStyle(document.documentElement).direction,
                    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
                    dialogWidth: dialog.width,
                    dialogLeft: dialog.left,
                    dialogRight: dialog.right,
                    dialogTop: dialog.top,
                    dialogBottom: dialog.bottom,
                    viewportWidth: document.documentElement.clientWidth,
                    viewportHeight: document.documentElement.clientHeight,
                    headerLeft: headerRect?.left,
                    headerRight: headerRect?.right,
                    headerTop: headerRect?.top,
                    dialogContainedVertically: dialog.top >= 0 && dialog.bottom <= document.documentElement.clientHeight,
                    termVisible: Boolean(document.querySelector('#saasTermSelect')?.getClientRects().length),
                    scrollOwners: [body, form].filter((element) => element && ['auto', 'scroll'].includes(getComputedStyle(element).overflowY)).length,
                    headerPosition: header && getComputedStyle(header).position,
                    footerPosition: footer && getComputedStyle(footer).position,
                    formColumns: form && getComputedStyle(form).gridTemplateColumns
                };
            });
            expect(geometry.direction).toBe('rtl');
            expect(geometry.overflow).toBe(false);
            expect(geometry.dialogWidth).toBeLessThanOrEqual(geometry.viewportWidth);
            expect(geometry.dialogLeft).toBeGreaterThanOrEqual(0);
            expect(geometry.dialogRight).toBeLessThanOrEqual(geometry.viewportWidth);
            expect(geometry.dialogContainedVertically).toBe(true);
            expect(geometry.headerLeft).toBeGreaterThanOrEqual(geometry.dialogLeft - 0.5);
            expect(geometry.headerRight).toBeLessThanOrEqual(geometry.dialogRight + 0.5);
            expect(geometry.headerTop).toBeGreaterThanOrEqual(geometry.dialogTop);
            expect(geometry.termVisible).toBe(true);
            expect(geometry.scrollOwners).toBe(1);
            expect(geometry.headerPosition).toBe('sticky');
            expect(geometry.footerPosition).toBe('sticky');
            expect(geometry.formColumns.split(' ').length).toBe(width < 601 ? 1 : 2);
        }
    }
    await page.setViewportSize({ width: 320, height: 568 });
    const scrollCheck = await page.locator('.saas-request-dialog').evaluate((dialogElement) => {
        const body = dialogElement.querySelector(':scope > .modal-body');
        body.scrollTop = body.scrollHeight;
        const upload = dialogElement.querySelector('.file-upload-control-trigger').getBoundingClientRect();
        const footer = dialogElement.querySelector(':scope > .form-actions').getBoundingClientRect();
        return { uploadBottom: upload.bottom, footerTop: footer.top, bodyHasOverflow: body.scrollHeight > body.clientHeight };
    });
    expect(scrollCheck.bodyHasOverflow).toBe(true);
    expect(scrollCheck.uploadBottom).toBeLessThanOrEqual(scrollCheck.footerTop + 1);
});

test('failed subscription submit keeps dialog and entered form state and restores submit control', async ({ page }) => {
    await openBilling(page, async (route) => {
        await route.fulfill({ status: 503, json: { error: 'تعذر إتمام الطلب.', code: 'TEMPORARY_FAILURE' } });
        return null;
    });
    await page.locator('#saasRequestNotes').fill('keep this note');
    await page.locator('#saasSubscriptionSubmit').click();
    await expect(page.locator('.saas-request-dialog')).toBeVisible();
    await expect(page.locator('#saasRequestNotes')).toHaveValue('keep this note');
    await expect(page.locator('#saasPaymentProof')).not.toHaveValue('');
    await expect(page.locator('#saasSubscriptionSubmit')).toBeEnabled();
    await expect(page.locator('#saasSubscriptionSubmit')).not.toHaveAttribute('aria-busy');
});

test('payment proof preview opens actual image bytes through the authenticated API client, not JSON metadata', async ({ page }) => {
    await openBilling(page, async () => null, [requestRow()]);
    await page.route('**/api/saas/payment-proofs/88/file', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
    await page.keyboard.press('Escape');
    const popupPromise = page.waitForEvent('popup');
    await page.locator('[data-saas-payment-proof]').click();
    const popup = await popupPromise;
    await expect.poll(() => popup.url()).toMatch(/^blob:/);
});
