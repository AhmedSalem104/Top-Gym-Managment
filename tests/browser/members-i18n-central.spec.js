'use strict';

const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const featureCatalog = require('../../src/services/feature-catalog');
const planCatalog = require('../../src/services/saas-plan-catalog');

const OUTPUT = path.resolve(process.cwd(), process.env.MEMBERS_I18N_QA_OUTPUT || 'qa/artifacts/members-i18n-central-2026-10-12');

test('Members screen uses central Arabic/English i18n without changing member data or query state', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'One browser context exercises the deterministic responsive matrix.');
    test.setTimeout(90_000);
    const requests = [];
    const member = {
        id: 991,
        fullName: 'QA Member Long Name',
        phone: '+201001234567',
        phoneCountry: 'EG',
        registrationDate: '2026-09-01',
        membershipCode: { maskedCode: 'LF-QA-991-******' },
        membership: {
            id: 1991, plan: 'gym_only', type: 'monthly', status: 'active',
            effectiveEndDate: '2026-11-12', daysRemaining: 31,
            freezeCount: 1, freezeLimit: 3, amountDue: 750, amountRemaining: 150
        }
    };
    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        requests.push({ method: request.method(), path: url.pathname, search: url.search });
        if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method().toUpperCase())) {
            return route.fulfill({ status: 405, json: { error: 'Read-only i18n fixture blocks writes.' } });
        }
        let body = {};
        if (url.pathname === '/api/auth/session') {
            body = { authenticated: true, user: { id: 991, name: 'i18n QA Owner', role: 'Owner', tenantType: 'gym', permissions: [] } };
        } else if (url.pathname === '/api/branding') {
            body = { identity: { brandName: 'Central i18n QA Gym' }, assets: {} };
        } else if (url.pathname === '/api/saas/entitlements') {
            body = {
                tenantStatus: 'active',
                subscription: { status: 'active', plan: { code: 'business', name: 'Business' } },
                entitlements: { tenantType: 'gym', features: planCatalog.featureFlagsForPlan('business'), featureCatalog: featureCatalog.getFeatureCatalog({ tenantType: 'gym' }), limits: {} }
            };
        } else if (url.pathname === '/api/branches/bootstrap') {
            const branch = { id: 1, name: 'Main Branch', status: 'active', isMain: true };
            body = { branches: [branch], activeBranches: [branch], defaultBranch: branch, sections: [], branchLimit: 5, hasMultipleActiveBranches: false, canUseAllBranches: true };
        } else if (url.pathname === '/api/dashboard') {
            body = { stats: { total: 1, active: 1, expiringSoon: 0, expired: 0 }, alerts: [] };
        } else if (url.pathname === '/api/pricing') {
            body = { plans: { gym_only: { label: 'Gym only', monthlyPrice: 750, active: true } }, types: { monthly: { label: 'Monthly', active: true } }, durations: { monthly: 1 } };
        } else if (url.pathname === '/api/members') {
            body = { members: [member], pagination: { page: 1, pageSize: 5, total: 1, totalItems: 1, totalPages: 1, hasPrevious: false, hasNext: false } };
        }
        return route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(body) });
    });

    await page.addInitScript(() => {
        localStorage.setItem('logic-fit-ui-locale', 'ar');
        localStorage.setItem('topgym-theme', 'light');
    });
    await fs.mkdir(OUTPUT, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 950 });
    await page.goto('/index.html#members', { waitUntil: 'networkidle' });
    await expect(page.locator('#membersSection')).toBeVisible();
    await expect(page.locator('#membersList')).toContainText('QA Member Long Name');
    await expect(page.locator('#membersPageSize, #membersPagination [data-members-page-size]')).toHaveCount(1);
    await expect(page.locator('#membersSection h3')).toHaveText('المشتركون');
    await expect(page.locator('#membersList .members-table thead')).toContainText('العضو');
    const initialMemberRequests = requests.filter((entry) => entry.path === '/api/members').length;
    await page.locator('#statusFilter').selectOption('active');
    await expect.poll(() => requests.filter((entry) => entry.path === '/api/members').length).toBe(initialMemberRequests + 1);
    await page.locator('#sortFilter').selectOption('remaining');
    await expect.poll(() => requests.filter((entry) => entry.path === '/api/members').length).toBe(initialMemberRequests + 2);
    const retainedStatus = await page.locator('#statusFilter').inputValue();
    const retainedSort = await page.locator('#sortFilter').inputValue();
    const hashBefore = await page.evaluate(() => location.hash);
    const membersRequestCount = () => requests.filter((entry) => entry.path === '/api/members').length;
    const beforeLocaleSwitchRequests = membersRequestCount();

    for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: width <= 390 ? 860 : 950 });
        for (const theme of ['light', 'dark']) {
            await page.evaluate((value) => window.TopGymTheme.set(value), theme);
            for (const locale of ['ar', 'en']) {
                await page.evaluate((value) => window.TopGymI18n.set(value), locale);
                const expectedTitle = locale === 'ar' ? 'المشتركون' : 'Members';
                const expectedDirection = locale === 'ar' ? 'rtl' : 'ltr';
                await expect(page.locator('#membersSection h3')).toHaveText(expectedTitle);
                await expect(page.locator('html')).toHaveAttribute('dir', expectedDirection);
                const expectedStatusOptions = locale === 'ar'
                    ? ['كل الحالات', 'نشطة', 'قريبة الانتهاء', 'منتهية', 'مجمدة']
                    : ['All statuses', 'Active', 'Expiring soon', 'Expired', 'Frozen'];
                const expectedSortOptions = locale === 'ar'
                    ? ['الأقرب انتهاءً', 'الأحدث تسجيلًا', 'الأعلى مبلغًا متبقيًا']
                    : ['Expiring soonest', 'Recently registered', 'Highest balance due'];
                expect(await page.locator('#statusFilter option').evaluateAll((options) => options.map((option) => option.value)))
                    .toEqual(['', 'active', 'expiring_soon', 'expired', 'frozen']);
                expect(await page.locator('#sortFilter option').evaluateAll((options) => options.map((option) => option.value)))
                    .toEqual(['expiry', 'newest', 'remaining']);
                const actualOptions = {
                    status: await page.locator('#statusFilter option').allTextContents(),
                    sort: await page.locator('#sortFilter option').allTextContents()
                };
                expect(actualOptions, `status and sort options follow ${locale}`).toEqual({ status: expectedStatusOptions, sort: expectedSortOptions });
                await expect(page.locator('#statusFilter')).toHaveValue(retainedStatus);
                await expect(page.locator('#sortFilter')).toHaveValue(retainedSort);
                await expect(page.locator('#membersList')).toContainText('QA Member Long Name');
                await expect(page.locator('#membersCount')).toContainText(locale === 'ar' ? 'مشترك' : 'member');
                await expect(page.locator('#membersList [data-action="details"]').first()).toHaveAttribute('aria-label', locale === 'ar' ? 'التفاصيل' : 'View details');
                if (width < 768) {
                    await expect(page.locator('.members-mobile-card [data-action="details"] .table-action-label')).toHaveText(locale === 'ar' ? 'عرض' : 'View');
                    await expect(page.locator('.members-mobile-card [data-action="renew"] .table-action-label')).toHaveText(locale === 'ar' ? 'تجديد' : 'Renew');
                }
                if (width >= 768) {
                    await expect(page.locator('#membersList .members-table thead')).toContainText(locale === 'ar' ? 'العضو' : 'Member');
                    await expect(page.locator('#membersPagination .members-pagination-info')).toContainText(locale === 'ar' ? 'عرض' : 'Showing');
                } else {
                    await expect(page.locator('#membersList .members-mobile-card')).toHaveCount(1);
                    await expect(page.locator('.members-filter-disclosure summary')).toContainText(locale === 'ar' ? 'الفلاتر' : 'Filters');
                }
                const geometry = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
                expect(geometry.document, `document overflow @${width} ${theme} ${locale}`).toBeLessThanOrEqual(width);
                expect(geometry.body, `body overflow @${width} ${theme} ${locale}`).toBeLessThanOrEqual(width);
                expect(await page.evaluate(() => location.hash)).toBe(hashBefore);
                expect(await page.evaluate(() => localStorage.getItem('topgym-theme'))).toBe(theme);
                expect(membersRequestCount()).toBeGreaterThan(0);
                const target = path.join(OUTPUT, `members-${width}-${theme}-${locale}.png`);
                if ([320, 1440].includes(width)) await page.locator('#membersSection').screenshot({ path: target });
            }
        }
    }
    expect(membersRequestCount()).toBe(beforeLocaleSwitchRequests);
    expect(requests.some((entry) => !['GET', 'HEAD', 'OPTIONS'].includes(entry.method.toUpperCase()))).toBe(false);
});
