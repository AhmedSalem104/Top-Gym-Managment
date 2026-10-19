const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const featureCatalog = require('../../src/services/feature-catalog');
const planCatalog = require('../../src/services/saas-plan-catalog');

const WIDTHS = [320, 375, 390, 768, 1024, 1440, 1920];
const THEMES = ['light', 'dark'];
const LOCALES = ['ar', 'en'];
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const ARTIFACT_ROOT = path.resolve(process.cwd(), 'qa/artifacts/feedback-i18n-central');

async function installReadOnlyFixture(page) {
    const writes = [];
    const externalRequests = [];
    const feedbackReads = [];
    let feedbackState = 'results';
    const plan = planCatalog.PLAN_CONFIGURATIONS.find((item) => item.code === 'business');

    await page.route('**/*', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const method = request.method().toUpperCase();
        if (url.origin !== 'http://127.0.0.1:4173') {
            externalRequests.push(`${method} ${url.origin}`);
            return route.abort('blockedbyclient');
        }
        if (!SAFE_METHODS.has(method)) {
            writes.push(`${method} ${url.pathname}`);
            return route.fulfill({ status: 405, contentType: 'application/json', body: JSON.stringify({ error: 'Read-only QA fixture.' }) });
        }
        if (!url.pathname.startsWith('/api/')) return route.continue();

        let payload = {};
        if (url.pathname === '/api/auth/session') {
            payload = { authenticated: true, user: { id: 98420, name: 'Feedback QA Owner', role: 'Owner', tenantId: 98420, tenantType: 'gym', permissions: [] } };
        } else if (url.pathname === '/api/branding') {
            payload = { branding: { identity: { brandName: 'QA Fitness Club' }, assets: {} } };
        } else if (url.pathname === '/api/saas/entitlements') {
            payload = {
                tenantStatus: 'active',
                subscription: { status: 'active', plan: { code: 'business', name: plan.name } },
                entitlements: { tenantType: 'gym', features: planCatalog.featureFlagsForPlan('business'), featureCatalog: featureCatalog.getFeatureCatalog({ tenantType: 'gym' }), limits: {} }
            };
        } else if (url.pathname === '/api/branches/bootstrap' || url.pathname === '/api/bootstrap') {
            const branch = { id: 98420, name: 'QA Main Branch', status: 'active', isMain: true };
            payload = { branch, branches: [branch], activeBranches: [branch], defaultBranch: branch, sections: [], branchLimit: 1, hasMultipleActiveBranches: false, canUseAllBranches: false };
        } else if (url.pathname === '/api/member-feedback') {
            feedbackReads.push(`${method} ${url.search}`);
            if (feedbackState === 'error') return route.fulfill({ status: 503, contentType: 'application/json; charset=utf-8', body: JSON.stringify({ error: 'Synthetic fixture error.' }) });
            const requestedPage = Number(url.searchParams.get('page') || 1);
            const sampleFeedback = [
                { memberId: 731, memberName: 'سارة محمد — Sarah Mohamed', phone: '+201001234567', phoneCountry: 'EG', rating: 5, noteType: 'suggestion', message: 'واجهة التدريب ممتازة، وأقترح إضافة متابعة أسبوعية للتقدم ومواعيد الحصص.', submittedAt: '2026-10-12T09:35:00.000Z' },
                { memberId: 732, memberName: 'Long Arabic Member Name — الاسم العربي الطويل لاختبار الالتفاف', phone: '+201009876543', phoneCountry: 'EG', rating: 2, noteType: 'problem', message: 'هناك ملاحظة طويلة لاختبار التفاف النص وارتفاع الصف داخل الجدول من دون قص أو خروج عن حدود الشاشة.', submittedAt: '2026-10-11T14:10:00.000Z' },
                { memberId: 733, memberName: 'Member Three', phone: '+971501234567', phoneCountry: 'AE', rating: 4, noteType: 'feature_request', message: 'Please keep Arabic and English mixed content readable. This text is intentionally longer to check wrapping and table overflow.', submittedAt: '2026-10-10T18:20:00.000Z' }
            ];
            const feedback = feedbackState === 'empty' ? [] : Array.from({ length: 10 }, (_, index) => {
                const sample = sampleFeedback[index % sampleFeedback.length];
                return { ...sample, memberId: index < sampleFeedback.length ? sample.memberId : 740 + index, submittedAt: new Date(Date.parse(sample.submittedAt) - (index * 60 * 60 * 1000)).toISOString() };
            });
            payload = {
                feedback,
                pagination: { page: requestedPage, pageSize: 10, total: feedbackState === 'empty' ? 0 : 23, totalPages: feedbackState === 'empty' ? 1 : 3, hasPrevious: requestedPage > 1, hasNext: feedbackState !== 'empty' && requestedPage < 3 }
            };
        }
        return route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(payload) });
    });

    return {
        writes, externalRequests, feedbackReads,
        setState(value) { feedbackState = value; }
    };
}

test('Gym Feedback central i18n read-only matrix', async ({ page }, testInfo) => {
    test.setTimeout(300_000);
    test.skip(testInfo.project.name !== 'desktop', 'The test owns its complete internal locale/theme/viewport matrix.');
    await fs.mkdir(ARTIFACT_ROOT, { recursive: true });
    await page.addInitScript(() => {
        localStorage.setItem('logicfit-ui-locale', 'ar');
        localStorage.setItem('topgym-theme', 'light');
    });
    const fixture = await installReadOnlyFixture(page);
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto('/index.html#feedback', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toHaveAttribute('data-top-gym-authenticated', 'true');
    const languageToggle = page.locator('.topbar-language-toggle [data-locale-choice="en"]');
    await expect(languageToggle).toBeVisible();
    expect(await languageToggle.evaluate((button) => Boolean(button.closest('.topbar-mobile-actions'))), 'authenticated locale control must be hosted by the visible application Navbar').toBe(true);
    await languageToggle.click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await page.locator('.topbar-language-toggle [data-locale-choice="ar"]').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.locator('#feedbackSection')).toBeVisible();
    await expect(page.locator('#memberFeedbackList .member-feedback-table tbody tr')).toHaveCount(10);
    await expect(page.locator('#memberFeedbackPagination')).toBeVisible();

    await page.locator('#memberFeedbackRatingFilter').selectOption('5');
    await page.locator('#memberFeedbackTypeFilter').selectOption('suggestion');
    await page.locator('#memberFeedbackFromFilter').fill('2026-10-01');
    await page.locator('#memberFeedbackToFilter').fill('2026-10-31');
    await page.locator('#memberFeedbackSearch').evaluate((input) => { input.value = 'سارة'; });
    await page.locator('#memberFeedbackFilters').evaluate((form) => form.requestSubmit());
    await expect.poll(() => fixture.feedbackReads.length).toBeGreaterThan(1);
    await expect(page.locator('.member-feedback-pagination strong')).toContainText('صفحة ١ من ٣');
    const readsBeforeNextPage = fixture.feedbackReads.length;
    await page.locator('[data-feedback-page="next"]').click();
    await expect.poll(() => fixture.feedbackReads.length).toBe(readsBeforeNextPage + 1);
    expect(fixture.feedbackReads.at(-1)).toContain('page=2');
    await expect(page.locator('.member-feedback-pagination strong')).toContainText('صفحة ٢ من ٣');

    const preservedValues = {
        rating: await page.locator('#memberFeedbackRatingFilter').inputValue(),
        type: await page.locator('#memberFeedbackTypeFilter').inputValue(),
        from: await page.locator('#memberFeedbackFromFilter').inputValue(),
        to: await page.locator('#memberFeedbackToFilter').inputValue(),
        search: await page.locator('#memberFeedbackSearch').inputValue(),
        feedbackType: await page.locator('.feedback-type').first().getAttribute('class'),
        memberAction: await page.locator('[data-feedback-action="details"][data-member-id="731"]').count()
    };
    const screenshots = [];
    for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: width <= 390 ? 844 : 1000 });
        for (const theme of THEMES) {
            await page.evaluate((mode) => {
                document.documentElement.dataset.theme = mode;
                document.body.dataset.theme = mode;
                localStorage.setItem('topgym-theme', mode);
            }, theme);
            for (const targetLocale of LOCALES) {
                const currentLocale = await page.evaluate(() => window.TopGymI18n?.get());
                const readsBeforeLocaleChange = fixture.feedbackReads.length;
                if (currentLocale !== targetLocale) await page.evaluate((locale) => window.TopGymI18n.set(locale), targetLocale);
                await expect(page.locator('html')).toHaveAttribute('lang', targetLocale);
                await expect(page.locator('html')).toHaveAttribute('dir', targetLocale === 'ar' ? 'rtl' : 'ltr');
                await expect(page.locator('#memberFeedbackTitle')).toHaveText(targetLocale === 'en' ? 'Member feedback' : 'تقييمات المشتركين');
                await expect(page.locator('#memberFeedbackRatingFilter option').nth(1)).toHaveText(targetLocale === 'en' ? '5 stars' : '5 نجوم');
                await expect(page.locator('#memberFeedbackTypeFilter option').nth(5)).toHaveText(targetLocale === 'en' ? 'Feature request for QA Fitness Club' : 'إضافة يحتاجها QA Fitness Club');
                await expect(page.locator('.member-feedback-table thead')).toContainText(targetLocale === 'en' ? 'Submitted' : 'تاريخ الإرسال');
                await expect(page.locator('.feedback-details-button').first()).toHaveText(targetLocale === 'en' ? 'Member details' : 'تفاصيل العضو');
                await expect(page.locator('.feedback-message-cell').first()).toContainText('واجهة التدريب ممتازة');
                await expect(page.locator('.feedback-member-cell').first()).toContainText('سارة محمد');
                expect(await page.locator('.feedback-type').first().getAttribute('class')).toBe(preservedValues.feedbackType);
                await expect(page.locator('[data-feedback-action="details"][data-member-id="731"]')).toHaveCount(preservedValues.memberAction);
                expect(await page.locator('#memberFeedbackRatingFilter').inputValue()).toBe(preservedValues.rating);
                expect(await page.locator('#memberFeedbackTypeFilter').inputValue()).toBe(preservedValues.type);
                expect(await page.locator('#memberFeedbackFromFilter').inputValue()).toBe(preservedValues.from);
                expect(await page.locator('#memberFeedbackToFilter').inputValue()).toBe(preservedValues.to);
                expect(await page.locator('#memberFeedbackSearch').inputValue()).toBe(preservedValues.search);
                await expect(page.locator('.member-feedback-pagination strong')).toContainText(targetLocale === 'en' ? 'Page 2 of 3' : 'صفحة ٢ من ٣');
                expect(fixture.feedbackReads.length, 'locale switching must render cached feedback without an API refetch').toBe(readsBeforeLocaleChange);

                const geometry = await page.evaluate(() => ({
                    width: document.documentElement.clientWidth,
                    scrollWidth: document.documentElement.scrollWidth,
                    direction: getComputedStyle(document.querySelector('#feedbackSection')).direction,
                    rowDisplay: getComputedStyle(document.querySelector('.member-feedback-table tbody tr')).display,
                    responsiveCards: document.querySelector('.member-feedback-table')?.dataset.responsiveCards,
                    recordCount: document.querySelectorAll('.member-feedback-table tbody tr').length
                }));
                expect(geometry.scrollWidth).toBeLessThanOrEqual(width + 1);
                expect(geometry.direction).toBe(targetLocale === 'ar' ? 'rtl' : 'ltr');
                expect(geometry.recordCount).toBe(10);
                await expect(page.locator('.member-feedback-pagination > span')).toHaveText(targetLocale === 'en' ? 'Showing 11–20 of 23 reviews' : 'عرض ١١–٢٠ من ٢٣ تقييم');
                if (width <= 768) {
                    expect(geometry.responsiveCards).toBe('true');
                    expect(geometry.rowDisplay).toBe('grid');
                }
                await page.evaluate(() => document.fonts.ready);
                const filename = `feedback-${width}-${theme}-${targetLocale}.png`;
                const artifact = path.join(ARTIFACT_ROOT, filename);
                await page.locator('#feedbackSection').screenshot({ path: artifact, animations: 'disabled' });
                screenshots.push({ artifact, width, theme, locale: targetLocale, geometry, reads: fixture.feedbackReads.length });
            }
        }
    }

    const stateArtifacts = [];
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => {
        document.documentElement.dataset.theme = 'light';
        document.body.dataset.theme = 'light';
        localStorage.setItem('topgym-theme', 'light');
    });
    for (const view of ['empty', 'error']) {
        fixture.setState(view);
        await page.locator('#memberFeedbackRefresh').click();
        if (view === 'empty') await expect(page.locator('.member-feedback-empty')).toBeVisible();
        else await expect(page.locator('.member-feedback-error')).toBeVisible();
        for (const targetLocale of LOCALES) {
            const currentLocale = await page.evaluate(() => window.TopGymI18n?.get());
            const readsBeforeLocaleChange = fixture.feedbackReads.length;
            if (currentLocale !== targetLocale) await page.evaluate((locale) => window.TopGymI18n.set(locale), targetLocale);
            await expect(page.locator('html')).toHaveAttribute('lang', targetLocale);
            const stateRoot = page.locator(view === 'empty' ? '.member-feedback-empty' : '.member-feedback-error');
            await expect(stateRoot).toContainText(view === 'empty'
                ? (targetLocale === 'en' ? 'No matching feedback' : 'لا توجد تقييمات مطابقة')
                : (targetLocale === 'en' ? 'Could not load feedback' : 'تعذر تحميل التقييمات'));
            expect(fixture.feedbackReads.length).toBe(readsBeforeLocaleChange);
            const artifact = path.join(ARTIFACT_ROOT, `feedback-${view}-390-light-${targetLocale}.png`);
            await page.locator('#feedbackSection').screenshot({ path: artifact, animations: 'disabled' });
            stateArtifacts.push({ view, locale: targetLocale, artifact });
        }
    }

    expect(fixture.writes).toEqual([]);
    expect(fixture.externalRequests.every((entry) => entry.startsWith('GET https://cdn.jsdelivr.net'))).toBe(true);
    expect(pageErrors).toEqual([]);
    expect(fixture.feedbackReads.length).toBeGreaterThan(1);
    await fs.writeFile(path.join(ARTIFACT_ROOT, 'matrix.json'), JSON.stringify({ screenshots, states: stateArtifacts, reads: fixture.feedbackReads, writes: fixture.writes, externalRequests: fixture.externalRequests, pageErrors, preservedValues }, null, 2));
});
