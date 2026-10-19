const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const featureCatalog = require('../../src/services/feature-catalog');
const planCatalog = require('../../src/services/saas-plan-catalog');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const OUTPUT_DIR = 'qa/artifacts/intelligence-v2-bounded/after';

async function installReadOnlyFixtures(page) {
    const writes = [];
    const errors = [];
    const reads = {};
    const plan = planCatalog.PLAN_CONFIGURATIONS.find((entry) => entry.code === 'business');
    let scenario = 'populated';
    let holdOverview = false;
    let releaseOverview;
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    page.on('pageerror', (error) => errors.push(error.message));

    await page.route('**/*', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const method = request.method().toUpperCase();

        if (url.origin !== 'http://127.0.0.1:4173') return route.abort('blockedbyclient');
        if (!SAFE_METHODS.has(method)) {
            writes.push({ method, path: url.pathname });
            return route.fulfill({ status: 405, contentType: 'application/json', body: '{"error":"Read-only visual fixture"}' });
        }
        reads[url.pathname] = (reads[url.pathname] || 0) + 1;
        if (!url.pathname.startsWith('/api/')) return route.continue();
        if (url.pathname === '/api/intelligence/overview' && holdOverview) {
            await new Promise((resolve) => { releaseOverview = resolve; });
        }
        if (url.pathname === '/api/intelligence/overview' && scenario === 'error') {
            return route.fulfill({ status: 503, contentType: 'application/json; charset=utf-8', body: '{"error":"Synthetic read-only QA error"}' });
        }

        const fixtures = {
            '/api/auth/session': { authenticated: true, user: { id: 99001, name: 'Intelligence visual QA', role: 'Owner', tenantType: 'gym', permissions: ['intelligence.read', 'intelligence.generate', 'members.read', 'memberships.read', 'coaching.create'] } },
            '/api/branding': { branding: { identity: { brandName: 'Logic Fit QA' }, assets: {} }, identity: { brandName: 'Logic Fit QA' }, version: 1 },
            '/api/saas/entitlements': { tenantStatus: 'active', subscription: { status: 'active', plan: { code: 'business', name: plan.name } }, entitlements: { tenantType: 'gym', features: planCatalog.featureFlagsForPlan('business'), featureCatalog: featureCatalog.getFeatureCatalog({ tenantType: 'gym' }) } },
            '/api/branches/bootstrap': { branches: [{ id: 1, name: 'فرع الاختبار', code: 'qa', status: 'active', isMain: true }], activeBranches: [{ id: 1, name: 'فرع الاختبار', code: 'qa', status: 'active', isMain: true }], defaultBranch: { id: 1, name: 'فرع الاختبار', code: 'qa', status: 'active', isMain: true }, sections: [], branchLimit: 5, hasMultipleActiveBranches: false, canUseAllBranches: true },
            '/api/bootstrap': { branches: [{ id: 1, name: 'فرع الاختبار', code: 'qa', status: 'active', isMain: true }], activeBranches: [{ id: 1, name: 'فرع الاختبار', code: 'qa', status: 'active', isMain: true }], defaultBranch: { id: 1, name: 'فرع الاختبار', code: 'qa', status: 'active', isMain: true }, sections: [], branchLimit: 5, hasMultipleActiveBranches: false, canUseAllBranches: true },
            '/api/intelligence/overview': {
                mode: 'hybrid-rules',
                stats: scenario === 'empty' ? { highRiskMembers: 0, expiringMemberships: 0, activeMemberships: 0, activeWorkoutPrograms: 0, activeDietPlans: 0, totalMembers: 0 } : { highRiskMembers: 2, expiringMemberships: 4, activeMemberships: 119, activeWorkoutPrograms: 8, activeDietPlans: 5, totalMembers: 137 },
                priorities: scenario === 'empty' ? [] : [{ tone: 'warning', title: 'مراجعة انتهاء الاشتراك', action: 'بيانات اختبار مرئية فقط' }],
                churn: scenario === 'empty' ? [] : [{ id: 99002, fullName: 'اسم عضو طويل للتحقق من تخطيط خلايا الجدول', phone: '+201001234567', level: 'high', score: 82, daysSinceLastVisit: 12, daysToExpiry: 3, reasons: ['سبب اصطناعي لاختبار العرض'] }],
                prompts: scenario === 'empty' ? [] : ['ملخص العضويات']
            },
            '/api/coaching/clients': { clients: [{ id: 99002, fullName: 'عميل اختبار', phone: '+201001234567' }] },
            '/api/coaching/catalog': { exercises: [], foods: [] }
        };
        return route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(fixtures[url.pathname] || {}) });
    });

    return {
        writes,
        errors,
        reads,
        setScenario(value) { scenario = value; },
        holdInitialOverview() { holdOverview = true; },
        releaseInitialOverview() { holdOverview = false; releaseOverview?.(); releaseOverview = null; }
    };
}

test('intelligence central Arabic/English presentation preserves data and state across themes and viewports', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'A single desktop project records all requested viewports.');
    test.setTimeout(180_000);

    const runtime = await installReadOnlyFixtures(page);
    await page.goto('/index.html#intelligence', { waitUntil: 'domcontentloaded' });
    const section = page.locator('#intelligenceSection');
    await expect(section).toBeVisible({ timeout: 20_000 });
    await expect(section.locator('.intelligence-table tbody tr')).toHaveCount(1, { timeout: 20_000 });

    const records = [];
    const overviewTab = page.locator('[data-intelligence-content-tab="overview"]');
    const assistantTab = page.locator('[data-intelligence-content-tab="assistant"]');
    const plansTab = page.locator('[data-intelligence-content-tab="plans"]');
    await expect(overviewTab).toHaveAttribute('aria-selected', 'true');
    await overviewTab.focus();
    await page.keyboard.press('End');
    await expect(plansTab).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Home');
    await expect(overviewTab).toHaveAttribute('aria-selected', 'true');
    await plansTab.click();
    await page.locator('#intelligenceDays').fill('5');
    await page.locator('#intelligenceLimitations').fill('قيد عربي محفوظ');
    await page.locator('#intelligenceMemberId').selectOption('99002');
    await page.locator('#intelligenceGoal').selectOption('fat_loss');
    await assistantTab.click();
    await page.locator('#intelligenceQuery').fill('سؤال محفوظ لا يجب تغييره');
    await overviewTab.click();
    const widths = [320, 375, 390, 768, 1024, 1440, 1920];
    for (const width of widths) {
        for (const theme of ['light', 'dark']) {
            for (const language of ['ar', 'en']) {
                const direction = language === 'ar' ? 'rtl' : 'ltr';
                await page.setViewportSize({ width, height: width < 600 ? 900 : 1000 });
                await page.evaluate(({ lang, mode }) => {
                    document.documentElement.dataset.theme = mode;
                    document.body.dataset.theme = mode;
                    window.TopGymI18n.set(lang, { persist: false });
                }, { lang: language, mode: theme });
                await page.evaluate(() => document.fonts.ready);

                await expect(page.locator('#intelligenceTitle')).toHaveText(language === 'en' ? 'Intelligence decision center' : 'مركز القرار الذكي');
                await expect(page.locator('#intelligenceRefreshButton')).toHaveText(language === 'en' ? 'Refresh analysis' : 'تحديث التحليل');
                await expect(overviewTab).toHaveText(language === 'en' ? 'Overview' : 'نظرة عامة');
                await expect(assistantTab).toHaveText(language === 'en' ? 'AI assistant' : 'المساعد الذكي');
                await expect(plansTab).toHaveText(language === 'en' ? 'Plan builder' : 'إنشاء الخطط');
                await assistantTab.click();
                await expect(page.locator('#intelligenceQueryForm button[type="submit"]')).toHaveText(language === 'en' ? 'Analyze question' : 'تحليل السؤال');
                await expect(page.locator('#intelligencePromptList')).toContainText('ملخص العضويات');
                await expect(page.locator('#intelligenceQuery')).toHaveValue('سؤال محفوظ لا يجب تغييره');
                await plansTab.click();
                await expect(page.locator('#intelligencePlanForm button[type="submit"]')).toHaveText(language === 'en' ? 'Generate smart suggestion' : 'إنشاء اقتراح ذكي');
                await expect(page.locator('#intelligenceMemberId option:checked')).toContainText('عميل اختبار');
                await expect(page.locator('#intelligenceDays')).toHaveValue('5');
                await expect(page.locator('#intelligenceLimitations')).toHaveValue('قيد عربي محفوظ');
                await expect(page.locator('#intelligenceMemberId')).toHaveValue('99002');
                await expect(page.locator('#intelligenceGoal')).toHaveValue('fat_loss');
                await overviewTab.click();
                await expect(page.locator('#intelligenceChurnTable th').first()).toHaveText(language === 'en' ? 'Member' : 'المشترك');
                await expect(page.locator('#intelligenceChurnTable')).toContainText('اسم عضو طويل للتحقق من تخطيط خلايا الجدول');
                await expect(page.locator('#intelligenceChurnTable')).toContainText('سبب اصطناعي لاختبار العرض');
                await expect(page.locator('#intelligencePriorities')).toContainText('مراجعة انتهاء الاشتراك');

                const metrics = await section.evaluate((root) => {
                    const wrapper = root.querySelector('.intelligence-churn-table-wrap');
                    if (wrapper) wrapper.scrollLeft = 0;
                    const table = wrapper?.querySelector('table');
                    const name = wrapper?.querySelector('.intelligence-member-cell strong');
                    const nameRect = name?.getBoundingClientRect();
                    const tableRect = table?.getBoundingClientRect();
                    return {
                        documentWidth: document.documentElement.scrollWidth,
                        wrapperWidth: wrapper?.clientWidth || 0,
                        wrapperScrollWidth: wrapper?.scrollWidth || 0,
                        tableWidth: tableRect?.width || 0,
                        tableMinWidth: table ? getComputedStyle(table).minWidth : 'missing',
                        tableDisplay: table ? getComputedStyle(table).display : 'missing',
                        tableLayout: table ? getComputedStyle(table).tableLayout : 'missing',
                        responsiveCardsOptOut: table?.dataset.responsiveCards || 'missing',
                        hasResponsiveCardClass: table?.classList.contains('table-card-layout') || false,
                        tableHeadDisplay: table?.tHead ? getComputedStyle(table.tHead).display : 'missing',
                        bodyRowDisplay: table?.tBodies[0]?.rows[0] ? getComputedStyle(table.tBodies[0].rows[0]).display : 'missing',
                        bodyCellDisplay: table?.tBodies[0]?.rows[0]?.cells[0] ? getComputedStyle(table.tBodies[0].rows[0].cells[0]).display : 'missing',
                        cardLabelContent: table?.tBodies[0]?.rows[0]?.cells[0] ? getComputedStyle(table.tBodies[0].rows[0].cells[0], '::before').content : 'missing',
                        memberNameWidth: nameRect?.width || 0,
                        memberNameScrollWidth: name?.scrollWidth || 0,
                        memberNameClientHeight: name?.clientHeight || 0,
                        direction: getComputedStyle(root).direction,
                        theme: document.documentElement.dataset.theme
                    };
                });

                expect(metrics.documentWidth, `${width}px ${theme}/${direction}: no page-level overflow`).toBeLessThanOrEqual(width);
                expect(metrics.wrapperWidth, `${width}px ${theme}/${direction}: table wrapper has width`).toBeGreaterThan(0);
                expect(metrics.tableDisplay, `${width}px: comparison stays a table`).toBe('table');
                expect(Number.parseFloat(metrics.tableMinWidth), `${width}px: table retains comparison width`).toBeGreaterThanOrEqual(760);
                expect(metrics.responsiveCardsOptOut, `${width}px: analytical comparison opts out of record-card conversion`).toBe('false');
                expect(metrics.hasResponsiveCardClass, `${width}px: table-card enhancer leaves comparison semantics intact`).toBe(false);
                expect(metrics.tableHeadDisplay, `${width}px: table headers remain visible`).toBe('table-header-group');
                expect(metrics.memberNameWidth, `${width}px: member identity keeps readable width`).toBeGreaterThanOrEqual(120);
                expect(metrics.memberNameClientHeight, `${width}px: member name does not break per-character`).toBeLessThanOrEqual(48);
                if (width < 768) {
                    expect(metrics.bodyRowDisplay, `${width}px: churn data remains in table rows`).toBe('table-row');
                    expect(metrics.bodyCellDisplay, `${width}px: churn fields remain table cells`).toBe('table-cell');
                    expect(metrics.cardLabelContent, `${width}px: no duplicate card labels`).toBe('none');
                    expect(metrics.wrapperScrollWidth, `${width}px: swipe is contained in comparison wrapper`).toBeGreaterThan(metrics.wrapperWidth);
                }
                expect(metrics.direction).toBe(direction);
                expect(metrics.theme).toBe(theme);

                const screenshotPath = path.resolve(OUTPUT_DIR, `${width}-${theme}-${language}.png`);
                await section.screenshot({ path: screenshotPath, animations: 'disabled' });
                records.push({ width, theme, direction, ...metrics, screenshot: screenshotPath });

                if (width === 390 || width === 1440) {
                    for (const [tabName, tab] of [['overview', overviewTab], ['assistant', assistantTab], ['plans', plansTab]]) {
                        await tab.click();
                        const tabScreenshot = path.resolve(OUTPUT_DIR, `${width}-${theme}-${language}-${tabName}.png`);
                        await section.screenshot({ path: tabScreenshot, animations: 'disabled' });
                    }
                    await overviewTab.click();
                }

                if (width < 768 && theme === 'light' && language === 'ar') {
                    const scrolledMember = await section.evaluate((root) => {
                        const wrapper = root.querySelector('.intelligence-churn-table-wrap');
                        wrapper.scrollLeft = wrapper.scrollWidth;
                        const wrapperRect = wrapper.getBoundingClientRect();
                        const memberRect = wrapper.querySelector('.intelligence-member-cell').getBoundingClientRect();
                        return {
                            scrollLeft: wrapper.scrollLeft,
                            scrollWidth: wrapper.scrollWidth,
                            clientWidth: wrapper.clientWidth,
                            memberColumnRevealed: memberRect.right > wrapperRect.left && memberRect.left < wrapperRect.right
                        };
                    });
                    expect(scrolledMember.scrollLeft).not.toBe(0);
                    expect(scrolledMember.memberColumnRevealed, `${width}px: horizontal scroll reveals member identity`).toBe(true);
                    const scrolledScreenshot = path.resolve(OUTPUT_DIR, `${width}-${theme}-${language}-table-end.png`);
                    await section.screenshot({ path: scrolledScreenshot, animations: 'disabled' });
                    records.push({ width, theme, direction, tableEndScroll: scrolledMember, screenshot: scrolledScreenshot });
                }
            }
        }
    }

    expect(runtime.writes).toEqual([]);
    expect(runtime.errors).toEqual([]);
    expect(runtime.reads['/api/intelligence/overview']).toBe(1);
    expect(runtime.reads['/api/coaching/clients']).toBe(1);
    expect(runtime.reads['/api/coaching/catalog']).toBe(1);
    expect(records.filter((record) => !record.tableEndScroll)).toHaveLength(widths.length * 4);
    expect(records.filter((record) => record.tableEndScroll)).toHaveLength(widths.filter((width) => width < 768).length);
    fs.writeFileSync(path.resolve(OUTPUT_DIR, 'matrix.json'), JSON.stringify({ records, writes: runtime.writes, errors: runtime.errors, reads: runtime.reads }, null, 2));
    await testInfo.attach('intelligence-i18n-matrix.json', { body: JSON.stringify({ records, writes: runtime.writes, errors: runtime.errors, reads: runtime.reads }, null, 2), contentType: 'application/json' });
});

test('intelligence loading, empty and error states remain readable in both themes and locales', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'A single desktop project captures the state matrix at mobile and desktop widths.');
    test.setTimeout(180_000);
    const runtime = await installReadOnlyFixtures(page);
    const output = path.resolve(process.cwd(), 'qa/artifacts/intelligence-v2-state-closure');
    fs.mkdirSync(output, { recursive: true });
    const dismissToasts = async () => {
        const closeButtons = page.locator('#toast .toast-close');
        while (await closeButtons.count()) {
            await closeButtons.first().click();
            await expect(page.locator('#toast .toast-item')).toHaveCount(0);
        }
    };
    runtime.holdInitialOverview();
    await page.goto('/index.html#intelligence', { waitUntil: 'domcontentloaded' });
    const section = page.locator('#intelligenceSection');
    await expect(section).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => runtime.reads['/api/intelligence/overview'] || 0).toBeGreaterThan(0);
    const evidence = [];
    try {
        for (const width of [320, 1440]) {
            await page.setViewportSize({ width, height: width < 600 ? 900 : 1000 });
            for (const theme of ['light', 'dark']) {
                for (const language of ['ar', 'en']) {
                    await page.evaluate(({ lang, mode }) => {
                        document.documentElement.dataset.theme = mode;
                        document.body.dataset.theme = mode;
                        window.TopGymI18n.set(lang, { persist: false });
                    }, { lang: language, mode: theme });
                    const expected = language === 'en'
                        ? ['Preparing analysis…', 'Analyzing…', 'Loading cases…', 'Loading clients…']
                        : ['جارٍ تجهيز التحليل…', 'جارٍ التحليل…', 'جارٍ تحميل الحالات…', 'جارٍ تحميل العملاء…'];
                    const loadingNodes = [
                        { locator: section.locator('#intelligenceStats .loading'), attribute: 'aria-label' },
                        { locator: section.locator('#intelligencePriorities .loading'), attribute: 'aria-label' },
                        { locator: section.locator('#intelligenceChurnTable .loading'), attribute: 'aria-label' },
                        { locator: section.locator('#intelligenceMemberId option').first(), attribute: null }
                    ];
                    for (let index = 0; index < loadingNodes.length; index += 1) {
                        const check = loadingNodes[index].attribute ? 'toHaveAttribute' : 'toHaveText';
                        if (check === 'toHaveAttribute') await expect(loadingNodes[index].locator).toHaveAttribute(loadingNodes[index].attribute, expected[index]);
                        else await expect(loadingNodes[index].locator).toHaveText(expected[index]);
                    }
                    const screenshot = `loading-${width}-${theme}-${language}.png`;
                    await section.screenshot({ path: path.join(output, screenshot), animations: 'disabled' });
                    evidence.push({ state: 'loading', width, theme, language, screenshot });
                }
            }
        }
    } finally {
        runtime.releaseInitialOverview();
    }
    await expect(section.locator('.intelligence-stat-card')).toHaveCount(6);

    for (const width of [320, 1440]) {
        await page.setViewportSize({ width, height: width < 600 ? 900 : 1000 });
        for (const theme of ['light', 'dark']) {
            for (const language of ['ar', 'en']) {
                await page.evaluate(({ lang, mode }) => {
                    document.documentElement.dataset.theme = mode;
                    document.body.dataset.theme = mode;
                    window.TopGymI18n.set(lang, { persist: false });
                }, { lang: language, mode: theme });
                runtime.setScenario('empty');
                await section.locator('#intelligenceRefreshButton').click();
                await expect(section.locator('#intelligencePriorities .intelligence-empty-line')).toHaveText(language === 'en' ? 'No signals need action right now.' : 'لا توجد إشارات تحتاج تدخلاً الآن.');
                await expect(section.locator('#intelligenceChurnTable .intelligence-empty-line')).toHaveText(language === 'en' ? 'No active memberships are in the analysis scope.' : 'لا توجد عضويات نشطة في نطاق التحليل.');
                await dismissToasts();
                const emptyScreenshot = `empty-${width}-${theme}-${language}.png`;
                await section.screenshot({ path: path.join(output, emptyScreenshot), animations: 'disabled' });
                evidence.push({ state: 'empty', width, theme, language, screenshot: emptyScreenshot });

                runtime.setScenario('error');
                await section.locator('#intelligenceRefreshButton').click();
                await expect(section.locator('#intelligenceMessage.error')).toBeVisible();
                await dismissToasts();
                const errorScreenshot = `error-${width}-${theme}-${language}.png`;
                await section.screenshot({ path: path.join(output, errorScreenshot), animations: 'disabled' });
                evidence.push({ state: 'error', width, theme, language, screenshot: errorScreenshot });
            }
        }
    }
    expect(runtime.writes).toEqual([]);
    expect(runtime.errors).toEqual([]);
    fs.writeFileSync(path.join(output, 'matrix.json'), JSON.stringify({ widths: [320, 1440], themes: ['light', 'dark'], languages: ['ar', 'en'], evidence, writes: runtime.writes, errors: runtime.errors, reads: runtime.reads }, null, 2));
    await testInfo.attach('intelligence-state-matrix.json', { body: JSON.stringify({ evidence, writes: runtime.writes, errors: runtime.errors, reads: runtime.reads }, null, 2), contentType: 'application/json' });
    expect(evidence).toHaveLength(24);
});
