'use strict';

const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');

const ORIGIN = 'http://127.0.0.1:4173';
const OUTPUT = path.resolve(process.cwd(), 'qa/artifacts/coaching-central-i18n');
const WIDTHS = [320, 390, 768, 1440];
const THEMES = ['light', 'dark'];
const LOCALES = ['ar', 'en'];

test('Coaching central i18n preserves screen state and makes no locale-triggered requests or writes', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'One real application session records the complete responsive/theme/locale matrix.');
    test.setTimeout(180_000);

    const reads = [];
    const writes = [];
    const externalRequests = [];
    const pageErrors = [];
    const trainee = {
        id: 99201,
        fullName: 'Coaching QA Trainee',
        phone: '+201001234567',
        phoneCountry: 'EG',
        email: 'coaching.qa@example.test',
        workoutCount: 1,
        dietCount: 1,
        measurementCount: 2,
        lastActivity: '2026-10-12T10:00:00.000Z',
        workoutPlans: [{ id: 99211, name: 'Provider Workout Plan — unchanged', status: 'active', exerciseCount: 3, durationWeeks: 4, daysPerWeek: 3 }],
        dietPlans: [{ id: 99212, name: 'Provider Nutrition Plan — unchanged', status: 'draft', targetCalories: 2100, meals: 4, itemCount: 8 }]
    };

    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.route('**/*', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const method = request.method().toUpperCase();
        if (url.origin !== ORIGIN) {
            externalRequests.push(`${method} ${url.origin}${url.pathname}`);
            return route.abort('blockedbyclient');
        }
        if (!url.pathname.startsWith('/api/')) return route.continue();
        if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
            writes.push(`${method} ${url.pathname}`);
            return route.fulfill({ status: 405, contentType: 'application/json', body: '{"error":"read-only Coaching QA"}' });
        }
        // The static QA fixture closes the mocked EventSource response, so
        // browsers may reconnect to this read-only background stream while
        // the locale matrix is running. Reconnects are not locale-triggered
        // domain-data requests and must not make this assertion timing-based.
        if (url.pathname !== '/api/notifications/stream') {
            reads.push({ method, path: url.pathname, search: url.search });
        }
        let body = {};
        if (url.pathname === '/api/auth/session') {
            body = { authenticated: true, user: { id: 99200, name: 'Read-only Coaching QA Owner', role: 'Owner', tenantType: 'gym', permissions: [] } };
        } else if (url.pathname === '/api/branding') {
            body = { identity: { brandName: 'Read-only Coaching QA Gym' }, assets: {} };
        } else if (url.pathname === '/api/saas/entitlements') {
            body = { tenantStatus: 'active', subscription: { status: 'active', plan: { code: 'business', name: 'Business' } }, entitlements: { tenantType: 'gym', features: { coaching: true }, featureCatalog: [{ key: 'coaching', tenantTypes: ['gym'] }] } };
        } else if (url.pathname === '/api/branches/bootstrap' || url.pathname === '/api/bootstrap') {
            body = { branches: [], activeBranches: [], sections: [], defaultBranch: null, canUseAllBranches: true };
        } else if (url.pathname === '/api/external-trainees') {
            body = { trainees: [trainee], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1, hasPrevious: false, hasNext: false } };
        } else if (url.pathname === '/api/coaching/catalog') {
            body = {
                exercises: [{ id: 88201, nameAr: 'ضغط الصدر بالبار', nameEn: 'Barbell chest press', targetMuscleNameAr: 'الصدر', targetMuscleName: 'Chest', instructionsAr: ['ادفع الوزن بتحكم.'], tipsAr: ['حافظ على ثبات الكتفين.'], commonMistakesAr: ['لا تقفل المرفقين.'] }],
                foods: [{ id: 88301, nameAr: 'الشوفان', nameEn: 'Oats', servingSize: 100, servingUnit: 'g', calories: 380, protein: 13, carbs: 68, fat: 7 }]
            };
        } else if (url.pathname === '/api/coaching/clients') {
            body = { clients: [{ id: trainee.id, fullName: trainee.fullName }] };
        }
        return route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(body) });
    });

    await page.addInitScript(() => {
        localStorage.setItem('logic-fit-ui-locale', 'ar');
        localStorage.setItem('topgym-theme', 'light');
    });
    await fs.mkdir(OUTPUT, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto('/index.html#trainees', { waitUntil: 'domcontentloaded' });
    await expect.poll(() => page.locator('html').getAttribute('data-top-gym-active-tab')).toBe('trainees');

    const section = page.locator('#traineesSection');
    await expect(section).toBeVisible();
    await expect(section.locator('#externalTraineesList')).toContainText(trainee.fullName);
    await expect(section.locator('#traineesTitle')).toHaveText('المتدربون غير المشتركين');
    await expect(section.locator('.coaching-summary-card')).toHaveCount(4);
    await expect(section.locator('.external-trainees-table')).toContainText('المتدرب');
    const externalReads = () => reads.filter((entry) => entry.path === '/api/external-trainees');
    await expect.poll(() => externalReads().length).toBe(1);

    const search = section.locator('#externalTraineeSearch');
    await search.evaluate((input) => { input.value = 'search state remains'; });
    const screenshots = [];
    for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: width <= 390 ? 850 : 960 });
        for (const theme of THEMES) {
            for (const locale of LOCALES) {
                await page.evaluate(({ mode, language }) => {
                    document.documentElement.dataset.theme = mode;
                    document.body.dataset.theme = mode;
                    window.TopGymI18n.set(language, { persist: false });
                }, { mode: theme, language: locale });
                await expect(page.locator('html')).toHaveAttribute('lang', locale);
                await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
                await expect(section.locator('#traineesTitle')).toHaveText(locale === 'ar' ? 'المتدربون غير المشتركين' : 'External trainees');
                await expect(section.locator('.coaching-kicker')).toHaveText(locale === 'ar' ? 'إدارة التدريب والتغذية' : 'Training & nutrition management');
                await expect(section.locator('#addExternalTraineeButton')).toContainText(locale === 'ar' ? 'إضافة متدرب خارجي' : 'Add external trainee');
                await expect(section.locator('#externalTraineeRefreshButton')).toContainText(locale === 'ar' ? 'تحديث القائمة' : 'Refresh list');
                await expect(section.locator('.external-trainees-table thead')).toContainText(locale === 'ar' ? 'المتدرب' : 'Trainee');
                await expect(section.locator('#externalTraineesList')).toContainText(trainee.fullName);
                await expect(section.locator('#externalTraineesList')).toContainText('Provider Workout Plan — unchanged');
                await expect(search).toHaveValue('search state remains');

                const geometry = await page.evaluate(() => ({
                    viewport: innerWidth,
                    document: document.documentElement.scrollWidth,
                    body: document.body.scrollWidth,
                    section: document.getElementById('traineesSection').scrollWidth,
                    locale: document.documentElement.lang,
                    direction: document.documentElement.dir,
                    theme: document.documentElement.dataset.theme
                }));
                expect(geometry.document, `document overflow at ${width}/${theme}/${locale}`).toBeLessThanOrEqual(width);
                expect(geometry.body, `body overflow at ${width}/${theme}/${locale}`).toBeLessThanOrEqual(width);
                expect(geometry.section, `Coaching overflow at ${width}/${theme}/${locale}`).toBeLessThanOrEqual(width);
                expect(geometry.locale).toBe(locale);
                expect(geometry.direction).toBe(locale === 'ar' ? 'rtl' : 'ltr');
                expect(geometry.theme).toBe(theme);

                const filename = `coaching-${width}-${theme}-${locale}.png`;
                await section.screenshot({ path: path.join(OUTPUT, filename) });
                screenshots.push({ ...geometry, filename });
            }
        }
    }
    expect(externalReads(), 'locale and theme changes must not refetch trainees').toHaveLength(1);

    await page.evaluate(() => window.TopGymI18n.set('ar', { persist: false }));
    await section.locator('#addExternalTraineeButton').click();
    const dialog = page.locator('#externalTraineeDialog');
    await expect(dialog).toBeVisible();
    await page.locator('#externalFullName').fill('Input must survive locale change');
    await page.locator('#externalNotes').fill('No submit during this test');
    const requestCountBeforeDialogLocaleChanges = reads.length;
    await page.evaluate(() => window.TopGymI18n.set('en', { persist: false }));
    await expect(dialog.locator('#externalTraineeTitle')).toHaveText('Add external trainee');
    await expect(page.locator('#externalFullName')).toHaveValue('Input must survive locale change');
    await expect(page.locator('#externalNotes')).toHaveValue('No submit during this test');
    await page.evaluate(() => window.TopGymI18n.set('ar', { persist: false }));
    await expect(dialog.locator('#externalTraineeTitle')).toHaveText('إضافة متدرب خارجي');
    expect(reads).toHaveLength(requestCountBeforeDialogLocaleChanges);

    await dialog.evaluate((element) => element.close());
    await section.locator(`#externalTraineesList [data-coaching-action="workout"][data-id="${trainee.id}"]`).click();
    const builder = page.locator('#coachingBuilderDialog');
    await expect(builder).toBeVisible();
    const builderScreenshots = [];
    for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: width <= 390 ? 850 : 960 });
        for (const theme of THEMES) {
            for (const locale of LOCALES) {
                await page.evaluate(({ activeTheme, language }) => {
                    document.documentElement.dataset.theme = activeTheme;
                    document.body.dataset.theme = activeTheme;
                    window.TopGymI18n.set(language, { persist: false });
                }, { activeTheme: theme, language: locale });
                await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
                await expect(builder.locator('#coachingBuilderStepper')).toContainText(locale === 'ar' ? 'البيانات الأساسية' : 'Basic information');
                await expect(builder.locator('#coachingBuilderStepper')).toContainText(locale === 'ar' ? 'بناء الأيام والتمارين' : 'Build days & exercises');
                await expect(builder.locator('#coachingBuilderProgress')).toContainText(locale === 'ar' ? 'مراجعة قبل الحفظ' : 'Review before saving');
                await expect(builder.locator('#coachingBuilderProgress')).toContainText(locale === 'ar' ? 'الأيام: ١ · التمارين: ١' : 'Days: 1 · Exercises: 1');
                await expect(builder.locator('.builder-dialog-actions')).toHaveAttribute('data-builder-action-hint', locale === 'ar' ? '١/٣ — بيانات البرنامج والهدف' : '1/3 — Program details and goal');
                await expect(builder.locator('#coachingBuilderTitle')).toHaveText(locale === 'ar' ? 'إنشاء برنامج تدريب' : 'Create training program');
                await expect(builder.locator('#coachingBuilderSubtitle')).toContainText(locale === 'ar' ? 'العميل:' : 'Client:');
                await expect(builder.locator('#coachingBuilderContent')).toContainText(locale === 'ar' ? 'اسم البرنامج *' : 'Program name *');
                await expect(builder.locator('#coachingBuilderContent')).toContainText(locale === 'ar' ? 'تاريخ البداية *' : 'Start date *');
                await expect(builder.locator('#coachingBuilderContent')).toContainText(locale === 'ar' ? 'الهدف' : 'Goal');
                const goalOption = builder.locator('[data-builder-field="goal"] option').first();
                await expect(goalOption).toHaveText(locale === 'ar' ? 'بناء العضلات' : 'Build muscle');
                await expect(goalOption).toHaveAttribute('value', 'بناء العضلات');
                const bounds = await builder.evaluate((dialog) => {
                    const rect = dialog.getBoundingClientRect();
                    return { left: rect.left, right: rect.right, pageWidth: document.documentElement.scrollWidth };
                });
                expect(bounds.left, `builder left edge at ${width}/${theme}/${locale}`).toBeGreaterThanOrEqual(-1);
                expect(bounds.right, `builder right edge at ${width}/${theme}/${locale}`).toBeLessThanOrEqual(width + 1);
                expect(bounds.pageWidth, `page overflow at ${width}/${theme}/${locale}`).toBeLessThanOrEqual(width);
                const filename = `builder-${width}-${theme}-${locale}.png`;
                await builder.screenshot({ path: path.join(OUTPUT, filename) });
                builderScreenshots.push(filename);
            }
        }
    }
    await page.evaluate(() => window.TopGymI18n.set('en', { persist: false }));
    await builder.locator('[data-builder-field="name"]').fill('QA Strength Program');
    await builder.locator('[data-builder-field="durationWeeks"]').fill('4');
    await builder.locator('[data-builder-field="daysPerWeek"]').fill('3');
    await builder.locator('#coachingBuilderNext').click();
    await expect(builder.locator('[data-builder-step="2"]')).toBeVisible();
    await expect(builder.locator('#coachingBuilderContent')).toContainText('Step two');
    await expect(builder.locator('#coachingBuilderContent')).toContainText('Total exercises');
    await expect(builder.locator('#coachingBuilderContent')).toContainText('Muscle distribution');
    await expect(builder.locator('#coachingBuilderContent')).toContainText('Day 1');
    await expect(builder.locator('#coachingBuilderContent')).toContainText('Exercises: 1');
    await expect(builder.locator('#coachingBuilderContent')).toContainText('Day of week');
    await expect(builder.locator('#coachingBuilderContent')).toContainText('Add exercise');
    await expect(builder.locator('#coachingBuilderNext')).toHaveText('Next: review program');
    await expect(builder.locator('[data-routine-field="dayOfWeek"] option[value="1"]')).toHaveText('Day 1');
    await expect(builder.locator('[data-builder-action="remove-exercise"]')).toHaveText('Delete');
    await builder.screenshot({ path: path.join(OUTPUT, 'builder-step2-1440-dark-en.png') });
    await page.evaluate(() => window.TopGymI18n.set('ar', { persist: false }));
    await expect(builder.locator('#coachingBuilderContent')).toContainText('المرحلة الثانية');
    await expect(builder.locator('#coachingBuilderContent')).toContainText('إجمالي التمارين');
    await expect(builder.locator('#coachingBuilderContent')).toContainText('توزيع الحمل على العضلات');
    await expect(builder.locator('.builder-day-tab span')).toHaveText('اليوم ١');
    await expect(builder.locator('.builder-day-tab small')).toHaveText('التمارين: ١');
    await expect(builder.locator('#coachingBuilderNext')).toHaveText('التالي: مراجعة البرنامج');
    await expect(builder.locator('[data-routine-field="dayOfWeek"] option[value="1"]')).toHaveText('اليوم ١');
    await builder.screenshot({ path: path.join(OUTPUT, 'builder-step2-1440-dark-ar.png') });
    await page.evaluate(() => window.TopGymI18n.set('en', { persist: false }));
    await expect(builder.locator('.builder-day-tab span')).toHaveText('Day 1');
    await expect(builder.locator('.builder-day-tab small')).toHaveText('Exercises: 1');
    await expect(builder.locator('[data-routine-field="dayOfWeek"] option[value="1"]')).toHaveText('Day 1');
    await builder.locator('#coachingBuilderBack').click();
    await expect(builder.locator('[data-builder-field="name"]')).toHaveValue('QA Strength Program');
    await builder.locator('#coachingBuilderNext').click();
    const exercisePicker = builder.locator('.builder-search-select[data-search-kind="exercise"]');
    await exercisePicker.locator('.builder-search-trigger').click();
    await exercisePicker.locator('.builder-search-option').nth(1).click();
    await builder.locator('#coachingBuilderNext').click();
    await expect(builder.locator('[data-builder-step="3"]')).toBeVisible();
    await expect(builder.locator('#coachingBuilderContent')).toContainText('Step three');
    await expect(builder.locator('#coachingBuilderContent')).toContainText('Review training program before saving');
    await expect(builder.locator('#coachingBuilderContent')).toContainText('Ready for review');
    await expect(builder.locator('#coachingBuilderContent')).toContainText('Training days per week:');
    await expect(builder.locator('#coachingBuilderContent')).toContainText('4 weeks');
    await expect(builder.locator('#coachingBuilderContent')).toContainText('Exercises: 1 · Sets: 3');
    await expect(builder.locator('.review-summary-grid > div:nth-child(6) strong')).toHaveText('0 kg');
    await expect(builder.locator('#coachingBuilderAiTools')).toContainText('Keep manual editing available');
    await expect(builder.locator('#coachingBuilderAiInstruction')).toHaveAttribute('placeholder', 'Example: add 4 sets of bench press or swap rice for potatoes');
    await builder.screenshot({ path: path.join(OUTPUT, 'builder-step3-1440-dark-en.png') });
    await page.evaluate(() => window.TopGymI18n.set('ar', { persist: false }));
    await expect(builder.locator('#coachingBuilderContent')).toContainText('المرحلة الثالثة');
    await expect(builder.locator('#coachingBuilderContent')).toContainText('مراجعة برنامج التدريب قبل الحفظ');
    await expect(builder.locator('#coachingBuilderContent')).toContainText('جاهز للمراجعة');
    await expect(builder.locator('#coachingBuilderContent')).toContainText('٤ أسبوع');
    await expect(builder.locator('#coachingBuilderContent')).toContainText('التمارين: ١ · المجموعات: ٣');
    await expect(builder.locator('#coachingBuilderAiTools')).toContainText('اترك الإنشاء اليدوي متاحًا');
    await expect(builder.locator('#coachingBuilderAiInstruction')).toHaveAttribute('placeholder', 'مثال: أضف تمرين ضغط صدر 4 مجموعات أو بدّل الأرز بالبطاطس');
    await builder.screenshot({ path: path.join(OUTPUT, 'builder-step3-1440-dark-ar.png') });
    await builder.evaluate((element) => element.close());

    await page.evaluate(() => window.TopGymI18n.set('en', { persist: false }));
    await section.locator(`#externalTraineesList [data-coaching-action="diet"][data-id="${trainee.id}"]`).click();
    await expect(builder).toBeVisible();
    await builder.locator('[data-builder-field="name"]').fill('QA Balanced Nutrition Plan');
    await builder.locator('[data-builder-field="targetCalories"]').fill('2100');
    const dietContent = builder.locator('#coachingBuilderContent');
    for (const label of ['Plan basics and calorie calculation', 'Plan name *', 'Meals per day', 'BMR / TDEE calculator', 'Client daily energy needs', 'Weight (kg)', 'Height (cm)', 'Activity level', 'Calorie deficit / surplus', 'Apply to plan', 'Plan targets', 'Target calories', 'Protein (g)', 'Carbohydrates (g)', 'Fat (g)', 'Plan description']) {
        await expect(dietContent).toContainText(label);
    }
    await expect(dietContent.locator('.builder-client-field small [data-i18n="coaching.builder.diet.currentProfile"]')).toHaveText('Current profile:');
    await expect(dietContent.locator('label:has([data-builder-field="status"])')).toContainText('Status');
    await expect(dietContent.locator('[data-builder-field="mealsPerDay"] option').first()).toHaveText('3 meals');
    await expect(dietContent.locator('[data-builder-field="status"] option[value="active"]')).toHaveText('Active');
    await builder.locator('.dialog-body').evaluate((body) => { body.scrollTop = 0; });
    await builder.screenshot({ path: path.join(OUTPUT, 'diet-step1-1440-dark-en.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await builder.screenshot({ path: path.join(OUTPUT, 'diet-step1-390-dark-en.png') });
    await page.evaluate(() => window.TopGymI18n.set('ar', { persist: false }));
    for (const label of ['المعلومات الأساسية وحساب السعرات', 'اسم الخطة *', 'عدد الوجبات اليومية', 'الوزن كجم', 'الطول سم', 'مستوى النشاط', 'تطبيق على الخطة', 'السعرات المستهدفة']) {
        await expect(dietContent).toContainText(label);
    }
    await expect(dietContent.locator('.builder-client-field small [data-i18n="coaching.builder.diet.currentProfile"]')).toHaveText('الملف الحالي:');
    await expect(dietContent.locator('label:has([data-builder-field="status"])')).toContainText('الحالة');
    await expect(dietContent.locator('[data-builder-field="name"]')).toHaveValue('QA Balanced Nutrition Plan');
    await expect(dietContent.locator('[data-builder-field="targetCalories"]')).toHaveValue('2100');
    await expect(dietContent.locator('[data-builder-field="mealsPerDay"] option').first()).toHaveText('3 وجبات');
    await expect(dietContent.locator('[data-builder-field="status"] option[value="active"]')).toHaveText('نشط');
    await expect(dietContent.locator('[data-builder-field="mealsPerDay"]').locator('xpath=..').locator('.builder-search-trigger span').first()).toHaveText('4 وجبات');
    const dietViewports = [
        { width: 320, height: 740, theme: 'light', locale: 'ar' },
        { width: 390, height: 844, theme: 'dark', locale: 'ar' },
        { width: 768, height: 900, theme: 'light', locale: 'en' },
        { width: 1440, height: 960, theme: 'dark', locale: 'en' }
    ];
    for (const viewport of dietViewports) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.evaluate(({ theme, locale }) => {
            document.documentElement.dataset.theme = theme;
            document.body.dataset.theme = theme;
            window.TopGymI18n.set(locale, { persist: false });
        }, viewport);
        await expect(page.locator('html')).toHaveAttribute('dir', viewport.locale === 'ar' ? 'rtl' : 'ltr');
        const dimensions = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
        expect(dimensions.scrollWidth, `diet form page overflow at ${viewport.width}px`).toBeLessThanOrEqual(dimensions.width);
        await builder.locator('.dialog-body').evaluate((body) => { body.scrollTop = 0; });
        await builder.screenshot({ path: path.join(OUTPUT, `diet-step1-${viewport.width}-${viewport.theme}-${viewport.locale}.png`) });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => {
        document.documentElement.dataset.theme = 'dark';
        document.body.dataset.theme = 'dark';
        window.TopGymI18n.set('ar', { persist: false });
    });
    await dietContent.locator('[data-builder-field="notes"]').scrollIntoViewIfNeeded();
    await expect(dietContent.locator('[data-builder-field="notes"]')).toBeInViewport();
    await builder.screenshot({ path: path.join(OUTPUT, 'diet-step1-390-dark-ar-bottom.png') });
    await page.evaluate(() => window.TopGymI18n.set('en', { persist: false }));
    await builder.locator('.dialog-body').evaluate((body) => { body.scrollTop = 0; });
    await builder.locator('#coachingBuilderNext').click();
    await expect(builder.locator('[data-builder-step="2"]')).toBeVisible();
    const dietStepTwo = builder.locator('#coachingBuilderContent');
    for (const label of ['Build meals', 'Values update immediately when the quantity or food changes.', 'Live nutrition totals', 'Quantity', 'Unit', 'Calories', 'Protein', 'Carbs', 'Fat', 'Remove meal', 'Add food', 'Meal notes']) {
        await expect(dietStepTwo).toContainText(label);
    }
    await expect(dietStepTwo.locator('#dietLiveSummary')).toContainText('meals');
    await expect(dietStepTwo.locator('#dietLiveSummary')).toContainText('foods');
    await page.setViewportSize({ width: 1440, height: 960 });
    await builder.locator('.dialog-body').evaluate((body) => { body.scrollTop = 0; });
    await builder.screenshot({ path: path.join(OUTPUT, 'diet-step2-1440-dark-en.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.TopGymI18n.set('ar', { persist: false }));
    for (const label of ['بناء الوجبات', 'تتغير القيم فورًا', 'إجمالي التغذية الحالي', 'الكمية', 'الوحدة', 'حذف الوجبة', 'إضافة طعام', 'ملاحظات الوجبة']) {
        await expect(dietStepTwo).toContainText(label);
    }
    await expect(dietStepTwo.locator('#dietLiveSummary')).toContainText('وجبات');
    await expect(dietStepTwo.locator('#dietLiveSummary')).toContainText('أطعمة');
    const dietTwoGeometry = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
    expect(dietTwoGeometry.document, 'diet step two page overflow at mobile width').toBeLessThanOrEqual(dietTwoGeometry.viewport);
    await builder.locator('.dialog-body').evaluate((body) => { body.scrollTop = 0; });
    await builder.screenshot({ path: path.join(OUTPUT, 'diet-step2-390-dark-ar.png') });
    await page.evaluate(() => window.TopGymI18n.set('en', { persist: false }));
    await builder.locator('#coachingBuilderNext').click();
    await expect(builder.locator('[data-builder-step="3"]')).toBeVisible();
    const dietReview = builder.locator('#coachingBuilderContent');
    for (const label of ['Review nutrition plan before saving', 'Review client details, targets, and actual values for each meal.', 'Ready for review', 'Target calories', 'Current values', 'Plan:']) {
        await expect(dietReview).toContainText(label);
    }
    await expect(dietReview.locator('.review-summary-grid')).toContainText('4 meals / 4 foods');
    await page.setViewportSize({ width: 1440, height: 960 });
    await builder.locator('.dialog-body').evaluate((body) => { body.scrollTop = 0; });
    await builder.screenshot({ path: path.join(OUTPUT, 'diet-step3-1440-dark-en.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.TopGymI18n.set('ar', { persist: false }));
    for (const label of ['مراجعة خطة التغذية قبل الحفظ', 'راجع بيانات العميل', 'جاهز للمراجعة', 'السعرات المستهدفة', 'القيم الحالية', 'الخطة:']) {
        await expect(dietReview).toContainText(label);
    }
    await expect(dietReview.locator('.review-summary-grid')).toContainText('وجبات /');
    const dietReviewGeometry = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
    expect(dietReviewGeometry.document, 'diet review page overflow at mobile width').toBeLessThanOrEqual(dietReviewGeometry.viewport);
    await builder.locator('.dialog-body').evaluate((body) => { body.scrollTop = 0; });
    await builder.screenshot({ path: path.join(OUTPUT, 'diet-step3-390-dark-ar.png') });
    await builder.evaluate((element) => element.close());

    expect(writes, 'the test must not submit any write request').toEqual([]);
    expect(externalRequests.every((request) => request === 'GET https://cdn.jsdelivr.net/npm/sweetalert2@11'), `Unexpected external request: ${externalRequests.join(', ')}`).toBe(true);
    expect(pageErrors, 'the actual Coaching route must remain free of uncaught errors').toEqual([]);
    await fs.writeFile(path.join(OUTPUT, 'matrix.json'), JSON.stringify({ cases: screenshots.length, screenshots, builderScreenshots, externalTraineeReads: externalReads(), writes, externalRequests, pageErrors }, null, 2));
    expect(screenshots).toHaveLength(16);
});
