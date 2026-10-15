const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const featureCatalog = require('../../src/services/feature-catalog');
const planCatalog = require('../../src/services/saas-plan-catalog');

const WIDTHS = [320, 375, 390, 768, 1024, 1440, 1920];
const THEMES = ['light', 'dark'];
const LOCALES = ['ar', 'en'];
const ARTIFACT_ROOT = path.resolve(process.cwd(), 'qa/artifacts/feedback-v2-acceptance');
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

async function installReadOnlyFixture(page) {
    const writes = [];
    const externalRequests = [];
    const feedbackReads = [];
    let feedbackError = false;
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
            return route.fulfill({ status: 405, contentType: 'application/json', body: JSON.stringify({ error: 'Read-only visual QA fixture.' }) });
        }
        if (!url.pathname.startsWith('/api/')) return route.continue();

        let payload = {};
        if (url.pathname === '/api/auth/session') {
            payload = { authenticated: true, user: { id: 98420, name: 'Feedback QA Owner', role: 'Owner', tenantId: 98420, tenantType: 'gym', permissions: [] } };
        } else if (url.pathname === '/api/branding') {
            payload = { branding: { identity: { brandName: 'Feedback QA Gym' }, assets: {} } };
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
            if (feedbackError) {
                return route.fulfill({ status: 503, contentType: 'application/json; charset=utf-8', body: JSON.stringify({ error: 'Read-only visual fixture error.' }) });
            }
            payload = {
                feedback: [
                    { memberId: 731, memberName: 'سارة محمد — Sarah Mohamed', phone: '+201001234567', phoneCountry: 'EG', rating: 5, noteType: 'suggestion', message: 'واجهة التدريب ممتازة، وأقترح إضافة متابعة أسبوعية للتقدم ومواعيد الحصص.', submittedAt: '2026-10-12T09:35:00.000Z' },
                    { memberId: 732, memberName: 'Long Arabic Member Name — الاسم العربي الطويل لاختبار الالتفاف', phone: '+201009876543', phoneCountry: 'EG', rating: 2, noteType: 'problem', message: 'هناك ملاحظة طويلة لاختبار التفاف النص وارتفاع الصف داخل الجدول من دون قص أو خروج عن حدود الشاشة.', submittedAt: '2026-10-11T14:10:00.000Z' },
                    { memberId: 733, memberName: 'Member Three', phone: '+971501234567', phoneCountry: 'AE', rating: 4, noteType: 'feature_request', message: 'Please keep Arabic and English mixed content readable. This text is intentionally longer to check wrapping and table overflow.', submittedAt: '2026-10-10T18:20:00.000Z' }
                ],
                pagination: { page: 1, pageSize: 10, total: 23, totalPages: 3, hasPrevious: false, hasNext: true }
            };
        }
        return route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(payload) });
    });

    return { writes, externalRequests, feedbackReads, setFeedbackError: (value) => { feedbackError = Boolean(value); } };
}

test('Gym Feedback #feedback V2 read-only visual matrix', async ({ page }, testInfo) => {
    test.setTimeout(150_000);
    test.skip(testInfo.project.name !== 'desktop', 'The test owns its complete internal viewport, locale and theme matrix.');
    await fs.mkdir(ARTIFACT_ROOT, { recursive: true });
    await page.addInitScript(() => {
        localStorage.setItem('logicfit-ui-locale', 'ar');
        localStorage.setItem('topgym-theme', 'light');
    });
    const runtime = await installReadOnlyFixture(page);
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push({ message: error.message, stack: error.stack }));

    await page.goto('/index.html#feedback', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toHaveAttribute('data-top-gym-authenticated', 'true');
    await expect(page.locator('#languageToggleButton')).toBeVisible();
    await expect(page.locator('#feedbackSection')).toBeVisible();
    await expect(page.locator('[data-page-tab="feedback"]')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#memberFeedbackList .member-feedback-table tbody tr')).toHaveCount(3);
    await expect(page.locator('#memberFeedbackPagination')).toBeVisible();

    // Preserve the existing view's live DOM and action hooks without invoking
    // detail navigation, mutations, or any write-dependent workflow.
    await expect(page.locator('#memberFeedbackFilters')).toBeVisible();
    for (const id of ['memberFeedbackRatingFilter', 'memberFeedbackTypeFilter', 'memberFeedbackFromFilter', 'memberFeedbackToFilter', 'memberFeedbackSearch', 'memberFeedbackRefresh', 'memberFeedbackReset', 'memberFeedbackList', 'memberFeedbackPagination']) {
        await expect(page.locator(`#${id}`)).toHaveCount(1);
    }
    await expect(page.locator('[data-feedback-action="details"][data-member-id="731"]')).toHaveCount(1);
    await expect(page.locator('[data-feedback-page="next"]')).toHaveCount(1);

    const screenshots = [];
    for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: width <= 390 ? 844 : 1000 });
        for (const theme of THEMES) {
            await page.evaluate((mode) => {
                document.documentElement.dataset.theme = mode;
                document.body.dataset.theme = mode;
                localStorage.setItem('topgym-theme', mode);
            }, theme);
            for (const locale of LOCALES) {
                const currentLocale = await page.evaluate(() => window.TopGymI18n?.get?.() || document.documentElement.lang || 'ar');
                if (currentLocale !== locale) await page.locator('#languageToggleButton').click();
                await expect(page.locator('html')).toHaveAttribute('lang', locale);
                await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
                await expect(page.locator('#feedbackSection')).toBeVisible();

                const geometry = await page.evaluate(() => {
                    const section = document.querySelector('#feedbackSection');
                    const scroller = section.querySelector('.member-feedback-table-scroll');
                    const table = section.querySelector('.member-feedback-table');
                    const controls = [...section.querySelectorAll('button, input, select')].filter((element) => !element.disabled && element.getClientRects().length);
                    return {
                        viewportWidth: document.documentElement.clientWidth,
                        documentWidth: document.documentElement.scrollWidth,
                        sectionWidth: section.getBoundingClientRect().width,
                        sectionDirection: getComputedStyle(section).direction,
                        scrollerWidth: scroller?.clientWidth ?? null,
                        scrollerScrollWidth: scroller?.scrollWidth ?? null,
                        tableDirection: table ? getComputedStyle(table).direction : null,
                        tableClass: table?.className ?? null,
                        responsiveCards: table?.dataset.responsiveCards ?? null,
                        rowDisplay: table?.tBodies[0]?.rows[0] ? getComputedStyle(table.tBodies[0].rows[0]).display : null,
                        columns: table?.querySelectorAll('thead th').length ?? 0,
                        firstRecord: table?.tBodies[0]?.rows[0] ? (() => {
                            const row = table.tBodies[0].rows[0];
                            const cells = [...row.cells];
                            const type = cells[2].querySelector('.feedback-type');
                            const message = cells[3].querySelector('.feedback-message-cell');
                            const action = cells[5].querySelector('.feedback-details-button');
                            const actionStyle = action ? getComputedStyle(action) : null;
                            return {
                                rowColumns: getComputedStyle(row).gridTemplateColumns,
                                cellWidths: cells.map((cell) => Math.round(cell.getBoundingClientRect().width)),
                                firstCellLabel: getComputedStyle(cells[0], '::before').content,
                                typeOverflow: type ? type.scrollWidth - type.clientWidth : 0,
                                messageOverflow: message ? message.scrollWidth - message.clientWidth : 0,
                                messageScrolls: message ? getComputedStyle(message).overflowY : null,
                                actionHeight: action ? Math.round(action.getBoundingClientRect().height) : 0,
                                actionMinHeight: actionStyle?.minHeight ?? null,
                                actionMinBlockSize: actionStyle?.minBlockSize ?? null,
                                touchToken: actionStyle?.getPropertyValue('--ui-touch-target') ?? null,
                                actionClassName: action?.className ?? null
                            };
                        })() : null,
                        visibleControls: controls.length,
                        undersizedTouchControls: controls.map((element) => {
                            const rect = element.getBoundingClientRect();
                            return { id: element.id || element.dataset.feedbackAction || element.dataset.feedbackPage || element.tagName.toLowerCase(), width: Math.round(rect.width), height: Math.round(rect.height) };
                        }).filter((item) => item.width < 40 || item.height < 40)
                    };
                });
                expect(geometry.documentWidth, `document overflow at ${width}px/${theme}/${locale}`).toBeLessThanOrEqual(width + 1);
                expect(geometry.sectionWidth).toBeGreaterThan(0);
                expect(geometry.columns).toBe(6);
                expect(geometry.tableClass.split(/\s+/)).toContain('table-card-layout');
                expect(geometry.responsiveCards).toBe('true');
                expect(geometry.scrollerWidth).toBeLessThanOrEqual(geometry.sectionWidth);
                expect(geometry.sectionDirection).toBe(locale === 'ar' ? 'rtl' : 'ltr');
                expect(geometry.tableDirection).toBe(locale === 'ar' ? 'rtl' : 'ltr');
                if (width < 1440) expect(geometry.scrollerScrollWidth).toBeGreaterThanOrEqual(geometry.scrollerWidth);
                if (width <= 900) {
                    expect(geometry.rowDisplay).toBe('grid');
                    expect(geometry.firstRecord.firstCellLabel).not.toBe('none');
                    expect(geometry.firstRecord.firstCellLabel).not.toBe('normal');
                    expect(geometry.firstRecord.cellWidths.every((cellWidth) => cellWidth >= geometry.scrollerWidth - 60)).toBe(true);
                    expect(geometry.scrollerScrollWidth).toBeLessThanOrEqual(geometry.scrollerWidth + 1);
                }
                if (width <= 390) {
                    expect(geometry.firstRecord.cellWidths.every((cellWidth) => cellWidth >= 100)).toBe(true);
                    expect(geometry.firstRecord.typeOverflow).toBeLessThanOrEqual(1);
                    expect(geometry.firstRecord.messageOverflow).toBeLessThanOrEqual(1);
                    expect(geometry.firstRecord.messageScrolls).toBe('visible');
                    expect(geometry.firstRecord.actionHeight, JSON.stringify(geometry.firstRecord)).toBeGreaterThanOrEqual(44);
                }

                const focusTarget = page.locator('#memberFeedbackSearch');
                await focusTarget.focus();
                const focusStyle = await focusTarget.evaluate((element) => ({
                    visible: element === document.activeElement,
                    outlineStyle: getComputedStyle(element).outlineStyle,
                    outlineWidth: getComputedStyle(element).outlineWidth,
                    boxShadow: getComputedStyle(element).boxShadow,
                    width: Math.round(element.getBoundingClientRect().width),
                    height: Math.round(element.getBoundingClientRect().height)
                }));
                expect(focusStyle.visible).toBe(true);
                expect(focusStyle.width).toBeGreaterThan(0);
                expect(focusStyle.height).toBeGreaterThan(0);
                expect(focusStyle.outlineStyle !== 'none' || focusStyle.boxShadow !== 'none').toBe(true);

                await page.evaluate(() => document.fonts.ready);
                const filename = `feedback-${width}-${theme}-${locale}.png`;
                const artifact = path.join(ARTIFACT_ROOT, filename);
                await page.locator('#feedbackSection').screenshot({ path: artifact, animations: 'disabled' });
                screenshots.push({ artifact, width, theme, locale, geometry, focusStyle });
            }
        }
    }

    // Exercise the existing error presentation through a mocked GET failure.
    // No retry is clicked, and no write request can pass this fixture.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => {
        document.documentElement.dataset.theme = 'light';
        document.body.dataset.theme = 'light';
        localStorage.setItem('topgym-theme', 'light');
    });
    if ((await page.evaluate(() => window.TopGymI18n?.get?.() || document.documentElement.lang)) !== 'ar') {
        await page.locator('#languageToggleButton').click();
    }
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    runtime.setFeedbackError(true);
    await page.locator('#memberFeedbackRefresh').click();
    await expect(page.locator('#memberFeedbackList .member-feedback-error')).toBeVisible();
    const errorState = await page.locator('#memberFeedbackList .member-feedback-error').evaluate((element) => {
        const style = getComputedStyle(element);
        return { display: style.display, paddingBlockStart: Number.parseFloat(style.paddingBlockStart), paddingInlineStart: Number.parseFloat(style.paddingInlineStart), direction: style.direction };
    });
    expect(errorState.display).toBe('grid');
    expect(errorState.paddingBlockStart).toBeGreaterThan(0);
    expect(errorState.paddingInlineStart).toBeGreaterThan(0);
    const errorArtifact = path.join(ARTIFACT_ROOT, 'feedback-390-light-ar-error.png');
    await page.locator('#feedbackSection').screenshot({ path: errorArtifact, animations: 'disabled' });

    expect(runtime.writes).toEqual([]);
    expect(runtime.externalRequests.filter((entry) => !SAFE_METHODS.has(entry.split(' ')[0]))).toEqual([]);
    expect(runtime.feedbackReads.length).toBeGreaterThan(0);
    await fs.writeFile(path.join(ARTIFACT_ROOT, 'matrix.json'), JSON.stringify({ screenshots, errorState: { artifact: errorArtifact, ...errorState }, feedbackReads: runtime.feedbackReads, writes: runtime.writes, externalRequests: runtime.externalRequests, pageErrors }, null, 2));
});
