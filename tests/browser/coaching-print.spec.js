'use strict';

const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const workoutId = 7701;
const dietId = 7702;
const clientId = 7703;
const memberName = 'عميل اختبار الطباعة';

const workout = {
    id: workoutId,
    name: 'برنامج القوة التجريبي',
    nameEn: 'Sample Strength Program',
    memberName,
    memberNameEn: 'Print QA Client',
    memberPhone: '01012345678',
    memberPhoneCountry: 'EG',
    status: 'active',
    goal: 'strength',
    level: 'intermediate',
    durationWeeks: 8,
    daysPerWeek: 3,
    startDate: '2026-10-01',
    endDate: '2026-11-26',
    routines: [{
        name: 'اليوم الأول - الجزء السفلي',
        nameEn: 'Day One - Lower Body',
        notes: 'ملاحظة طويلة لاختبار ظهور تعليمات المدرب في الصفحة المطبوعة.',
        notesEn: 'A long note used to verify coach instructions in the printed document.',
        exercises: [{ exerciseId: 17701, sets: 3, repsMin: 8, repsMax: 12, weightKg: 40, restSeconds: 90, rpe: 8, notes: 'حافظ على مدى حركة كامل.', notesEn: 'Use a full range of motion.' }]
    }]
};

const diet = {
    id: dietId,
    name: 'خطة التغذية التجريبية',
    nameEn: 'Sample Nutrition Plan',
    memberName,
    memberNameEn: 'Print QA Client',
    memberPhone: '01012345678',
    memberPhoneCountry: 'EG',
    status: 'active',
    targetCalories: 2200,
    targetProtein: 145,
    targetCarbs: 250,
    targetFats: 70,
    startDate: '2026-10-01',
    endDate: '2026-10-31',
    meals: [{
        name: 'الإفطار',
        nameEn: 'Breakfast',
        mealTime: '08:00',
        notesEn: 'Pre-workout meal.',
        items: [{ foodId: 37701, nameAr: 'شوفان بالحليب', nameEn: 'Oats with milk', assignedQuantity: 80, servingUnit: 'جرام', calories: 310, protein: 13, carbs: 52, fats: 6, notes: 'وجبة قبل التمرين.', notesEn: 'A meal before training.' }]
    }]
};

const overview = {
    member: { id: clientId, fullName: memberName, fullNameEn: 'Print QA Client', phone: '01012345678', phoneCountry: 'EG', email: 'print.qa@example.test', registrationDate: '2026-09-01', notes: 'ملاحظة ملف طويلة للاختبار.', notesEn: 'Long profile note for print verification.' },
    progress: {},
    workoutPrograms: [{ id: workoutId, name: workout.name, nameEn: workout.nameEn, goal: 'strength', level: 'intermediate', startDate: '2026-10-01', endDate: '2026-11-26', status: 'active', exerciseCount: 1 }],
    dietPlans: [{ id: dietId, name: diet.name, nameEn: diet.nameEn, targetCalories: 2200, startDate: '2026-10-01', endDate: '2026-10-31', status: 'active', mealsPerDay: 1 }],
    measurements: [{ measuredAt: '2026-10-02', weightKg: 82.5, heightCm: 178, bodyFatPercent: 18.2 }],
    workoutSessions: [{ programName: workout.name, programNameEn: workout.nameEn, routineName: 'اليوم الأول', routineNameEn: 'Day One', status: 'completed', startedAt: '2026-10-03 08:30' }],
    mealLogs: [{ foodName: 'شوفان بالحليب', foodNameEn: 'Oats with milk', mealName: 'الإفطار', mealNameEn: 'Breakfast', calories: 310, consumedAt: '2026-10-03 07:45' }]
};

const dietDraftCatalog = {
    foods: [{ id: 37701, nameAr: 'شوفان بالحليب', nameEn: 'Oats with milk', servingSize: 100, servingUnit: 'جرام', calories: 387.5, protein: 16.25, carbs: 65, fat: 7.5 }]
};

async function makePdfFromPrintPopup(page, popup, testInfo, fileBase, expectedLocale = 'ar') {
    await expect(popup.locator('main.print-sheet')).toBeVisible();
    await expect(popup.locator('link[data-top-gym-print-styles]')).toHaveAttribute('href', /\/css\/print\.css\?v=[^&]+$/);
    await popup.addStyleTag({ content: fs.readFileSync(path.join(__dirname, '../../public/css/print.css'), 'utf8') });
    const layout = await popup.locator('main.print-sheet').evaluate((sheet) => ({
        direction: getComputedStyle(sheet).direction,
        language: document.documentElement.lang,
        width: Math.round(sheet.getBoundingClientRect().width),
        scrollWidth: sheet.scrollWidth,
        sectionCount: sheet.querySelectorAll('.print-section').length,
        overviewGridAlignment: sheet.querySelector('.print-system-overview-grid')
            ? getComputedStyle(sheet.querySelector('.print-system-overview-grid')).alignItems
            : null,
        overviewCardHeights: [...sheet.querySelectorAll('.print-system-overview-grid > div')]
            .map((card) => Math.round(card.getBoundingClientRect().height)),
        tables: [...sheet.querySelectorAll('table')].map((table) => ({
            headers: table.querySelectorAll('thead th').length,
            rows: table.querySelectorAll('tbody tr').length
        }))
    }));
    expect(layout.direction).toBe(expectedLocale === 'ar' ? 'rtl' : 'ltr');
    expect(layout.language).toBe(expectedLocale);
    expect(layout.width).toBeGreaterThan(500);
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width + 1);
    expect(layout.sectionCount).toBeGreaterThan(1);
    if (layout.overviewGridAlignment !== null) expect(layout.overviewGridAlignment).toBe('start');

    const printable = await page.context().newPage();
    const markup = await popup.evaluate(() => `<!doctype html><html lang="${document.documentElement.lang}" dir="${document.documentElement.dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>${document.querySelector('main.print-sheet').outerHTML}</body></html>`);
    await printable.setContent(markup, { waitUntil: 'domcontentloaded' });
    await printable.addStyleTag({ content: fs.readFileSync(path.join(__dirname, '../../public/css/print.css'), 'utf8') });
    await printable.emulateMedia({ media: 'print' });
    await printable.evaluate(() => document.fonts?.ready);
    const pdfPath = testInfo.outputPath(`${fileBase}.pdf`);
    const screenshotPath = testInfo.outputPath(`${fileBase}.png`);
    const pdf = await printable.pdf({ path: pdfPath, printBackground: true, preferCSSPageSize: true });
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.byteLength).toBeGreaterThan(5000);
    const pageCount = (pdf.toString('latin1').match(/\/Type\s*\/Page\b/gu) || []).length;
    expect(pageCount).toBeGreaterThanOrEqual(1);
    await printable.screenshot({ path: screenshotPath, fullPage: true });
    const evidenceDir = process.env.COACHING_PRINT_EVIDENCE_DIR
        ? path.resolve(process.env.COACHING_PRINT_EVIDENCE_DIR)
        : path.join(__dirname, '../../qa/reports/logicfit-v2-print-coaching');
    await fs.promises.mkdir(evidenceDir, { recursive: true });
    await Promise.all([
        fs.promises.copyFile(pdfPath, path.join(evidenceDir, `${fileBase}.pdf`)),
        fs.promises.copyFile(screenshotPath, path.join(evidenceDir, `${fileBase}.png`))
    ]);
    await printable.close();
    await popup.close();
    return { layout, pdfBytes: pdf.byteLength, pageCount, pdfPath, screenshotPath };
}

async function capturePdfDownload(page, fileBase, triggerDownload) {
    const downloadPromise = page.waitForEvent('download');
    await triggerDownload();
    const download = await downloadPromise;
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const bytes = Buffer.concat(chunks);
    expect(bytes.subarray(0, 4).toString()).toBe('%PDF');
    expect(bytes.length).toBeGreaterThan(20_000);

    const evidenceDir = process.env.COACHING_PRINT_EVIDENCE_DIR
        ? path.resolve(process.env.COACHING_PRINT_EVIDENCE_DIR)
        : path.join(__dirname, '../../qa/reports/logicfit-v2-print-coaching');
    await fs.promises.mkdir(evidenceDir, { recursive: true });
    const pdfPath = path.join(evidenceDir, `${fileBase}.pdf`);
    await download.saveAs(pdfPath);
    return { filename: download.suggestedFilename(), bytes: bytes.length, path: pdfPath };
}

test('coaching workout, nutrition plan, client overview, and unsaved drafts print in the selected locale', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Paper-size PDF rendering is verified once in the Chromium desktop project.');

    const apiRequests = [];
    await page.context().addInitScript(() => { window.print = () => { window.__topGymPrintCalled = true; }; });
    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;
        apiRequests.push({ method: request.method(), pathname });
        let payload = {};
        if (pathname === '/api/auth/session') payload = { authenticated: true, user: { id: 77, name: 'QA Coach', role: 'Owner', tenantType: 'gym', mustChangePassword: false, permissions: [] } };
        else if (pathname === '/api/saas/entitlements') payload = { tenantStatus: 'active', subscription: { status: 'active', plan: { code: 'qa', name: 'QA' } }, entitlements: { tenantType: 'gym', features: { coaching: true }, featureCatalog: [{ key: 'coaching', tenantTypes: ['gym'] }] } };
        else if (pathname === '/api/branding') payload = { branding: { identity: { brandName: 'Logic Fit QA' }, assets: {} }, version: 1 };
        else if (pathname === `/api/workoutprograms/${workoutId}`) payload = { program: workout };
        else if (pathname === `/api/library/exercises/17701`) payload = { item: { id: 17701, nameAr: 'سكوات بالبار', nameEn: 'Barbell Squat', name: 'Barbell Squat', targetMuscleNameAr: 'عضلات الفخذ', targetMuscleNameEn: 'Quadriceps', equipment: 'Barbell', difficulty: 'Intermediate', descriptionAr: 'تمرين مركب للقوة.', instructionsAr: ['حافظ على وضع الظهر.'], instructionsEn: ['Keep a neutral back.'] } };
        else if (pathname === `/api/dietplans/${dietId}`) payload = { plan: diet };
        else if (pathname === `/api/clients/${clientId}/training-overview`) payload = overview;
        await route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(payload) });
    });

    await page.goto('/index.html#coaching', { waitUntil: 'networkidle' });
    if (!await page.evaluate(() => Boolean(window.topGymPrint?.printCoachingSystem))) {
        await page.addScriptTag({ url: '/js/integrations/print-enhancements.js' });
    }
    await expect.poll(() => page.evaluate(() => Boolean(window.topGymPrint?.printCoachingSystem))).toBe(true);
    const outputs = {};
    const library = { exercises: [{ id: 17701, nameAr: 'سكوات بالبار', name: 'Barbell Squat', targetMuscleNameAr: 'عضلات الفخذ', targetMuscleNameEn: 'Quadriceps', equipment: 'Barbell', difficulty: 'Intermediate' }] };
    const drafts = {
        workout: { ...workout, id: undefined, name: 'مسودة اختبار برنامج القوة', nameEn: 'Strength Program Draft' },
        diet: { ...diet, id: undefined, name: 'مسودة اختبار التغذية', nameEn: 'Nutrition Plan Draft' }
    };

    for (const locale of ['ar', 'en']) {
        if ((await page.locator('html').getAttribute('lang')) !== locale) {
            await page.locator('#languageToggleButton').click();
            await expect(page.locator('html')).toHaveAttribute('lang', locale);
            await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
        }
        const suffix = locale === 'ar' ? 'ar' : 'en';
        const assertDocumentLocale = async (popup, expectedHeading) => {
            await expect(popup.locator('html')).toHaveAttribute('lang', locale);
            await expect(popup.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
            await expect(popup.locator('.print-sheet')).toContainText(expectedHeading);
            await expect(popup.locator('.print-brand-title')).toHaveText('Logic Fit QA');
        };
        const openPrint = async (invoke) => {
            const popupPromise = page.waitForEvent('popup');
            await invoke();
            const popup = await popupPromise;
            await popup.waitForFunction(() => Boolean(document.querySelector('.print-system-document, .print-error')));
            await expect(popup.locator('.print-system-document')).toBeVisible();
            return popup;
        };

        const workoutPopup = await openPrint(() => page.evaluate((id) => window.topGymPrint.printCoachingSystem(id, 'workout'), workoutId));
        await assertDocumentLocale(workoutPopup, locale === 'ar' ? 'برنامج تدريب رياضي' : 'Workout program');
        await expect(workoutPopup.locator('.print-system-routine tbody tr')).toContainText(locale === 'ar' ? 'سكوات بالبار' : 'Barbell Squat');
        await expect(workoutPopup.locator('.print-system-routine tbody tr')).toContainText(locale === 'ar' ? 'حافظ على مدى حركة كامل' : 'Use a full range of motion.');
        await expect(workoutPopup.locator('.print-system-document')).toContainText(locale === 'ar' ? 'الحمل التدريبي' : 'Training load');
        outputs[`workout_${suffix}`] = await makePdfFromPrintPopup(page, workoutPopup, testInfo, `coaching-workout-print-${suffix}`, locale);

        const workoutDraftPopup = await openPrint(() => page.evaluate(({ draft, client, catalog }) => window.topGymPrint.printCoachingDraft(draft, 'workout', catalog, client), { draft: drafts.workout, client: memberName, catalog: library }));
        await assertDocumentLocale(workoutDraftPopup, locale === 'ar' ? 'مسودة اختبار برنامج القوة' : 'Strength Program Draft');
        await expect(workoutDraftPopup.locator('.print-system-routine tbody tr')).toContainText(locale === 'ar' ? 'سكوات بالبار' : 'Barbell Squat');
        outputs[`workoutDraft_${suffix}`] = await makePdfFromPrintPopup(page, workoutDraftPopup, testInfo, `coaching-workout-draft-print-${suffix}`, locale);

        const dietPopup = await openPrint(() => page.evaluate((id) => window.topGymPrint.printCoachingSystem(id, 'diet'), dietId));
        await assertDocumentLocale(dietPopup, locale === 'ar' ? 'خطة تغذية رياضية' : 'Nutrition plan');
        await expect(dietPopup.locator('.print-system-routine tbody tr')).toContainText(locale === 'ar' ? 'شوفان بالحليب' : 'Oats with milk');
        await expect(dietPopup.locator('.print-system-routine thead')).toContainText(locale === 'ar' ? 'السعرات' : 'Calories');
        outputs[`diet_${suffix}`] = await makePdfFromPrintPopup(page, dietPopup, testInfo, `coaching-diet-print-${suffix}`, locale);

        const dietDraftPopup = await openPrint(() => page.evaluate(({ draft, client, catalog }) => window.topGymPrint.printCoachingDraft(draft, 'diet', catalog, client), { draft: drafts.diet, client: memberName, catalog: dietDraftCatalog }));
        await assertDocumentLocale(dietDraftPopup, locale === 'ar' ? 'مسودة اختبار التغذية' : 'Nutrition Plan Draft');
        await expect(dietDraftPopup.locator('.print-system-routine tbody tr')).toContainText(locale === 'ar' ? 'شوفان بالحليب' : 'Oats with milk');
        outputs[`dietDraft_${suffix}`] = await makePdfFromPrintPopup(page, dietDraftPopup, testInfo, `coaching-diet-draft-print-${suffix}`, locale);

        const overviewPopup = await openPrint(() => page.evaluate((id) => window.topGymPrint.printCoachingOverview(id), clientId));
        await assertDocumentLocale(overviewPopup, locale === 'ar' ? 'ملف التدريب والتغذية الكامل' : 'Complete training and nutrition profile');
        await expect(overviewPopup.locator('.print-sheet')).toContainText(locale === 'ar' ? memberName : 'Print QA Client');
        await expect(overviewPopup.locator('.print-sheet')).toContainText(locale === 'ar' ? workout.name : workout.nameEn);
        await expect(overviewPopup.locator('.print-sheet')).toContainText(locale === 'ar' ? 'جلسات التدريب' : 'Training sessions');
        await expect(overviewPopup.locator('.print-sheet')).toContainText(locale === 'ar' ? '\u0634\u0648\u0641\u0627\u0646 \u0628\u0627\u0644\u062D\u0644\u064A\u0628' : 'Oats with milk');
        outputs[`overview_${suffix}`] = await makePdfFromPrintPopup(page, overviewPopup, testInfo, `coaching-client-overview-print-${suffix}`, locale);

        const workoutDraftDownload = await capturePdfDownload(page, `coaching-workout-draft-download-${suffix}`, () => page.evaluate(({ draft, client, catalog }) => window.topGymPrint.downloadCoachingDraftPdf(draft, 'workout', catalog, client), { draft: drafts.workout, client: memberName, catalog: library }));
        expect(workoutDraftDownload.filename).toMatch(/Workout-.*draft\.pdf$/iu);
        const dietDraftDownload = await capturePdfDownload(page, `coaching-diet-draft-download-${suffix}`, () => page.evaluate(({ draft, client, catalog }) => window.topGymPrint.downloadCoachingDraftPdf(draft, 'diet', catalog, client), { draft: drafts.diet, client: memberName, catalog: dietDraftCatalog }));
        expect(dietDraftDownload.filename).toMatch(/Nutrition-.*draft\.pdf$/iu);
        const overviewDownload = await capturePdfDownload(page, `coaching-client-overview-download-${suffix}`, () => page.evaluate((id) => window.topGymPrint.downloadCoachingOverviewPdf(id), clientId));
        expect(overviewDownload.filename).toMatch(/Coaching-Profile-7703\.pdf$/u);
        outputs[`downloads_${suffix}`] = { workoutDraftDownload, dietDraftDownload, overviewDownload };
    }

    expect(apiRequests.filter((request) => request.pathname === `/api/workoutprograms/${workoutId}`)).toHaveLength(2);
    expect(apiRequests.filter((request) => request.pathname === `/api/dietplans/${dietId}`)).toHaveLength(2);
    expect(apiRequests.filter((request) => request.pathname === `/api/clients/${clientId}/training-overview`)).toHaveLength(4);
    await fs.promises.writeFile(testInfo.outputPath('coaching-print-summary.json'), JSON.stringify({ outputs, apiRequests }, null, 2), 'utf8');
});

test('workout and nutrition system PDFs follow the selected Arabic/English locale without dropping data', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Actual paper-size PDF output is verified in the Chromium desktop project.');

    const apiRequests = [];
    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;
        apiRequests.push({ method: request.method(), pathname });
        let payload = {};
        if (pathname === '/api/auth/session') payload = { authenticated: true, user: { id: 77, name: 'QA Coach', role: 'Owner', tenantType: 'gym', mustChangePassword: false, permissions: [] } };
        else if (pathname === '/api/saas/entitlements') payload = { tenantStatus: 'active', subscription: { status: 'active', plan: { code: 'qa', name: 'QA' } }, entitlements: { tenantType: 'gym', features: { coaching: true }, featureCatalog: [{ key: 'coaching', tenantTypes: ['gym'] }] } };
        else if (pathname === '/api/branding') payload = { branding: { identity: { brandName: 'Logic Fit QA' }, assets: {} }, version: 1 };
        else if (pathname === `/api/workoutprograms/${workoutId}`) payload = { program: workout };
        else if (pathname === '/api/library/exercises/17701') payload = { item: { id: 17701, nameAr: 'سكوات بالبار', nameEn: 'Barbell Squat', targetMuscleNameAr: 'عضلات الفخذ', targetMuscleNameEn: 'Quadriceps', equipment: 'Barbell', difficulty: 'Intermediate', instructionsAr: ['حافظ على وضع الظهر.'], instructionsEn: ['Keep a neutral back.'] } };
        else if (pathname === `/api/dietplans/${dietId}`) payload = { plan: diet };
        await route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(payload) });
    });

    await page.goto('/index.html#coaching', { waitUntil: 'networkidle' });
    if (!await page.evaluate(() => Boolean(window.topGymPrint?.printCoachingSystem))) {
        await page.addScriptTag({ url: '/js/integrations/print-enhancements.js' });
    }
    await expect.poll(() => page.evaluate(() => Boolean(window.topGymPrint?.printCoachingSystem))).toBe(true);

    for (const locale of ['ar', 'en']) {
        await page.evaluate((selectedLocale) => window.TopGymI18n.set(selectedLocale, { persist: false }), locale);
        for (const type of ['workout', 'diet']) {
            const id = type === 'workout' ? workoutId : dietId;
            const popupPromise = page.waitForEvent('popup');
            await page.evaluate(({ systemId, systemType }) => window.topGymPrint.printCoachingSystem(systemId, systemType), { systemId: id, systemType: type });
            const popup = await popupPromise;
            await expect(popup.locator('.print-system-document')).toBeVisible();
            const expectedDirection = locale === 'ar' ? 'rtl' : 'ltr';
            await expect(popup.locator('html')).toHaveAttribute('lang', locale);
            await expect(popup.locator('html')).toHaveAttribute('dir', expectedDirection);
            const text = await popup.locator('.print-system-document').innerText();
            expect(text).not.toMatch(/print\.coaching\.[\w.]+|\{\{\s*[\w.-]+\s*\}\}/u);
            if (type === 'workout') {
                expect(text).toContain(locale === 'en' ? 'Workout program' : 'برنامج تدريب رياضي');
                expect(text).toContain(locale === 'en' ? 'Training load and muscle distribution' : 'الحمل التدريبي وتوزيع العضلات');
                expect(text).toContain(locale === 'en' ? 'Barbell Squat' : 'سكوات بالبار');
                expect(text).toContain(locale === 'en' ? 'Day One - Lower Body' : 'اليوم الأول - الجزء السفلي');
                expect(text).toContain(locale === 'en' ? 'Build strength' : 'زيادة القوة');
                expect(text).toContain(locale === 'en' ? 'Intermediate' : 'متوسط');
                expect(text).toContain(locale === 'en' ? '8–12' : '٨–١٢');
                expect(text).toContain(locale === 'en' ? '40.0 kg' : '٤٠٫٠ كجم');
                expect(text).toContain(locale === 'en' ? '90 sec' : '٩٠ ث');
                expect(text).toContain(locale === 'en' ? 'RPE 8' : 'RPE ٨');
                expect(text).toContain(locale === 'en' ? '3 sets' : '٣ مجموعات');
                expect(text).toContain(locale === 'en' ? 'October' : 'أكتوبر');
                expect(text).toContain(locale === 'en' ? 'October 1, 2026' : '١ أكتوبر ٢٠٢٦');
                expect(text).toContain(locale === 'en' ? 'November 26, 2026' : '٢٦ نوفمبر ٢٠٢٦');
                expect(text).not.toContain(locale === 'en' ? 'التمرين' : 'Exercise');
            } else {
                expect(text).toContain(locale === 'en' ? 'Nutrition plan' : 'خطة تغذية رياضية');
                expect(text).toContain(locale === 'en' ? 'Target calories' : 'السعرات المستهدفة');
                expect(text).toContain(locale === 'en' ? 'Oats with milk' : 'شوفان بالحليب');
                expect(text).toContain(locale === 'en' ? 'Breakfast' : 'الإفطار');
                expect(text).toContain(locale === 'en' ? '2,200 kcal' : '٢٬٢٠٠ سعر');
                expect(text).toContain(locale === 'en' ? '80.0 g' : '٨٠٫٠ جرام');
                expect(text).toContain(locale === 'en' ? '145.0 g' : '١٤٥٫٠ ج');
                expect(text).toContain(locale === 'en' ? '250.0 g' : '٢٥٠٫٠ ج');
                expect(text).toContain(locale === 'en' ? '70.0 g' : '٧٠٫٠ ج');
                expect(text).toContain(locale === 'en' ? '13.0 g' : '١٣٫٠ ج');
                expect(text).toContain(locale === 'en' ? '52.0 g' : '٥٢٫٠ ج');
                expect(text).toContain(locale === 'en' ? '6.0 g' : '٦٫٠ ج');
                expect(text).toContain(locale === 'en' ? 'October 1, 2026' : '١ أكتوبر ٢٠٢٦');
                expect(text).toContain(locale === 'en' ? 'October 31, 2026' : '٣١ أكتوبر ٢٠٢٦');
                expect(text).toContain(locale === 'en' ? 'October' : 'أكتوبر');
                expect(text).not.toContain(locale === 'en' ? 'السعرات المستهدفة' : 'Target calories');
            }
            expect(text).toContain(locale === 'en' ? 'Print QA Client' : memberName);
            const output = await makePdfFromPrintPopup(page, popup, testInfo, `coaching-${type}-${locale}`, locale);
            expect(output.pdfBytes).toBeGreaterThan(5_000);

        }
    }

    expect(apiRequests.length).toBeGreaterThan(0);
    expect(apiRequests.every((request) => request.method === 'GET')).toBe(true);
    expect(apiRequests.filter((request) => request.pathname === `/api/workoutprograms/${workoutId}`)).toHaveLength(2);
    expect(apiRequests.filter((request) => request.pathname === `/api/dietplans/${dietId}`)).toHaveLength(2);
});
