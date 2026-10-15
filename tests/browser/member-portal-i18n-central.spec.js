'use strict';

const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');

const artifactDirectory = path.resolve(__dirname, '../../qa/artifacts/member-portal-i18n-2026-10-12');

test('Member Portal central locale switch preserves cached state across RTL/LTR, themes, and viewport sizes', async ({ page }) => {
    const apiRequests = [];
    const fixture = {
        tenant: { name: 'نادي اختبار العضوية', slug: 'qa-member-club' },
        member: { fullName: 'عضو اختبار', phone: '+201001234567', phoneCountry: 'EG', email: 'member@example.test', registrationDate: '2024-04-12' },
        currentMembership: { id: 11, status: 'active', plan: 'gym_only', type: 'monthly', startDate: '2026-09-01', endDate: '2026-10-31', daysRemaining: 20 },
        memberships: [], payments: [], attendance: [], freezes: [],
        attendanceSummary: { totalVisits: 2 }, financialSummary: { totalDue: 100, totalPaid: 100, totalRemaining: 0 },
        reportNumber: 'QA-I18N', issuedAt: '2026-10-12T09:00:00.000Z'
    };

    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        apiRequests.push({ method: request.method(), path: url.pathname });
        if (url.pathname === '/api/branding') {
            return route.fulfill({ json: { branding: { identity: { brandName: 'نادي اختبار العضوية' } }, version: 1 } });
        }
        if (url.pathname === '/api/member-portal/lookup' && request.method() === 'POST') {
            expect(request.postDataJSON().membershipCode).toBe('QA-MEMBER-I18N');
            return route.fulfill({ json: fixture });
        }
        if (url.pathname === '/api/member-portal/occupancy' && request.method() === 'POST') {
            return route.fulfill({ json: { presentCount: 2, level: 'quiet', observedAt: '2026-10-12T09:00:00.000Z' } });
        }
        if (url.pathname === '/api/member-portal/library/options') {
            return route.fulfill({ json: { filters: { categories: ['strength'], difficulties: ['beginner'], equipment: ['body only'] } } });
        }
        if (url.pathname === '/api/member-portal/library/exercises') {
            return route.fulfill({ json: { items: [{ id: 9, nameAr: 'تمرين تجريبي', name: 'Sample exercise', difficulty: 'beginner', equipment: 'body only', setsRange: '3', repsRange: '10' }], pagination: { page: 1, pageSize: 18, totalItems: 1, totalPages: 1 } } });
        }
        if (url.pathname === '/api/member-portal/library/foods') {
            return route.fulfill({ json: { items: [], pagination: { page: 1, pageSize: 18, totalItems: 0, totalPages: 0 } } });
        }
        if (url.pathname === '/api/member-portal/membership-catalog') {
            return route.fulfill({ json: { currency: 'EGP', plans: [{ code: 'gym_only', label: 'جيم فقط' }], types: [{ code: 'monthly', label: 'شهرية', durationDays: 30 }], prices: { gym_only: { monthly: 500 } } } });
        }
        if (url.pathname === '/api/member-portal/payment-methods') {
            return route.fulfill({ json: { paymentMethods: [{ id: 'fixture-cash', name: 'تحويل تجريبي', accountReference: 'TEST-000' }] } });
        }
        if (url.pathname === '/api/member-portal/subscription-requests') {
            return route.fulfill({ json: { requests: [{ id: 501, status: 'pending', requestType: 'membership', membership: { type: 'عضوية تجريبية', startDate: '2026-10-12' }, pricing: { amountDue: 500, currency: 'EGP' } }] } });
        }
        if (/^\/api\/member-portal\/library\/(exercises|foods)\//.test(url.pathname)) {
            return route.fulfill({ json: { item: { id: 9, nameAr: 'تمرين تجريبي', name: 'Sample exercise', difficulty: 'beginner', equipment: 'body only', setsRange: '3', repsRange: '10', instructionsAr: ['تعليمات تجريبية'] } } });
        }
        return route.fulfill({ status: 404, json: { error: 'Unexpected synthetic API request' } });
    });

    await page.addInitScript(() => {
        localStorage.setItem('logic-fit-ui-locale', 'ar');
        localStorage.setItem('topGym-theme', 'light');
    });
    await page.goto('/member-portal', { waitUntil: 'networkidle' });
    await expect(page.locator('#languageToggleButton')).toBeVisible();
    await expect(page.locator('#portalLoginPanel')).toBeVisible();
    await expect.poll(() => page.evaluate(() => [document.documentElement.lang, document.documentElement.dir])).toEqual(['ar', 'rtl']);
    await page.locator('#membershipCodeInput').fill('QA-MEMBER-I18N');
    await page.locator('#portalLookupForm button[type="submit"]').click();
    await expect(page.locator('#portalHomeView')).toBeVisible();
    await expect(page.locator('#portalOccupancyCount')).toHaveText('٢');
    await page.waitForTimeout(100);

    const identity = await page.evaluate(() => ({ hash: location.hash, lookupValue: document.querySelector('#membershipCodeInput').value }));
    for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
        for (const theme of ['light', 'dark']) {
            await setTheme(page, theme);
            for (const locale of ['ar', 'en']) {
                await setLocale(page, locale);
                await expect.poll(() => page.evaluate(() => [document.documentElement.lang, document.documentElement.dir])).toEqual(locale === 'ar' ? ['ar', 'rtl'] : ['en', 'ltr']);
                expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
                if ((width === 390 || width === 1440)) {
                    await fs.mkdir(artifactDirectory, { recursive: true });
                    await page.screenshot({ path: path.join(artifactDirectory, `portal-home-${width}-${theme}-${locale}.png`), fullPage: true });
                }
            }
        }
    }

    await setLocale(page, 'ar');
    await page.locator('[data-portal-tool="exercises"]').click();
    await expect(page.locator('#portalLibrarySearch')).toBeVisible();
    await expect(page.locator('.portal-exercise-card')).toHaveCount(1);
    await page.locator('#portalLibrarySearch').fill('تمرين محفوظ');
    await page.waitForTimeout(400);
    const libraryRequestCount = apiRequests.filter(({ path }) => path.startsWith('/api/member-portal/library/')).length;
    await setLocale(page, 'en');
    await expect(page.locator('#portalLibrarySearch')).toHaveValue('تمرين محفوظ');
    await expect(page.locator('#portalLibraryContent .portal-library-results-head h4')).toHaveText('Available exercises');
    expect(apiRequests.filter(({ path }) => path.startsWith('/api/member-portal/library/'))).toHaveLength(libraryRequestCount);
    await page.screenshot({ path: path.join(artifactDirectory, 'portal-library-1440-dark-en.png'), fullPage: true });
    await page.locator('#portalLibrarySearch').fill('');
    await page.locator('[data-library-details="exercises"]').click();
    await expect(page.locator('#portalLibraryModal')).toBeVisible();
    const detailRequestCount = apiRequests.filter(({ path }) => /\/library\/exercises\//.test(path)).length;
    // The native modal correctly blocks pointer interaction with the header
    // language control. Change the centralized locale state directly here to
    // verify the open dialog re-renders without bypassing its focus boundary.
    await page.evaluate(() => window.TopGymI18n.set('ar', { persist: false }));
    await expect(page.locator('#portalLibraryModal')).toBeVisible();
    expect(apiRequests.filter(({ path }) => /\/library\/exercises\//.test(path))).toHaveLength(detailRequestCount);
    await page.locator('[data-library-modal-close]').click();

    await page.locator('#portalLibraryMount [data-library-close]').click();
    await page.locator('[data-portal-tool="subscription"]').click();
    await expect(page.locator('#portalSubscriptionPlan')).toHaveValue('gym_only');
    await expect(page.locator('#portalSubscriptionHistory .portal-request-history-row')).toHaveCount(1);
    await page.locator('#portalSubscriptionNotes').fill('ملاحظة محفوظة');
    const requestCountBeforeLocaleChange = apiRequests.length;
    await setLocale(page, 'en');
    await expect(page.locator('#portalSubscriptionNotes')).toHaveValue('ملاحظة محفوظة');
    await expect(page.locator('#portalSubscriptionPlan')).toHaveValue('gym_only');
    await expect(page.locator('#portalRequestHistoryTitle')).toHaveText('Previous requests');
    expect(apiRequests).toHaveLength(requestCountBeforeLocaleChange);
    await page.screenshot({ path: path.join(artifactDirectory, 'portal-subscription-1440-dark-en.png'), fullPage: true });

    await page.locator('[data-portal-back]').click();
    await page.locator('[data-portal-tool="feedback"]').click();
    await expect(page.locator('#portalFeedbackMessage')).toBeVisible();
    await page.locator('#portalFeedbackMessage').fill('Keep this synthetic note');
    const feedbackRequestCount = apiRequests.length;
    await setLocale(page, 'ar');
    await setLocale(page, 'en');
    await expect(page.locator('#portalFeedbackMessage')).toHaveValue('Keep this synthetic note');
    expect(apiRequests).toHaveLength(feedbackRequestCount);
    await page.screenshot({ path: path.join(artifactDirectory, 'portal-feedback-1440-dark-en.png'), fullPage: true });

    expect(await page.evaluate(() => location.hash)).toBe(identity.hash);
    expect(await page.locator('#membershipCodeInput').inputValue()).toBe(identity.lookupValue);
    expect(apiRequests.filter(({ path, method }) => method !== 'GET' && !['/api/member-portal/lookup', '/api/member-portal/occupancy'].includes(path))).toEqual([]);
    const evidence = {
        viewports: [320, 390, 768, 1440],
        themes: ['light', 'dark'],
        locales: [{ locale: 'ar', dir: 'rtl' }, { locale: 'en', dir: 'ltr' }],
        apiRequests,
        lookupCount: apiRequests.filter(({ path }) => path === '/api/member-portal/lookup').length,
        noLocaleRefetch: true,
        noMutationRequests: true,
        finalHash: await page.evaluate(() => location.hash)
    };
    await fs.mkdir(artifactDirectory, { recursive: true });
    await fs.writeFile(path.join(artifactDirectory, 'evidence.json'), JSON.stringify(evidence, null, 2), 'utf8');
});

async function setLocale(page, locale) {
    const current = await page.evaluate(() => window.TopGymI18n?.get());
    if (current !== locale) await page.locator('#languageToggleButton').click();
    await expect.poll(() => page.evaluate(() => window.TopGymI18n?.get())).toBe(locale);
}

async function setTheme(page, theme) {
    const current = await page.evaluate(() => document.documentElement.dataset.theme);
    if (current !== theme) await page.locator('[data-theme-toggle]').first().click();
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe(theme);
}
