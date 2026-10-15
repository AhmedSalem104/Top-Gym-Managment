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
    memberName,
    memberPhone: '01012345678',
    memberPhoneCountry: 'EG',
    status: 'active',
    durationWeeks: 8,
    daysPerWeek: 3,
    routines: [{
        name: 'اليوم الأول - الجزء السفلي',
        notes: 'ملاحظة طويلة لاختبار ظهور تعليمات المدرب في الصفحة المطبوعة.',
        exercises: [{ exerciseId: 17701, sets: 3, repsMin: 8, repsMax: 12, weightKg: 40, restSeconds: 90, rpe: 8, notes: 'حافظ على مدى حركة كامل.' }]
    }]
};

const diet = {
    id: dietId,
    name: 'خطة التغذية التجريبية',
    memberName,
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
        mealTime: '08:00',
        items: [{ nameAr: 'شوفان بالحليب', assignedQuantity: 80, servingUnit: 'جرام', calories: 310, protein: 13, carbs: 52, fats: 6, notes: 'وجبة قبل التمرين.' }]
    }]
};

const overview = {
    member: { id: clientId, fullName: memberName, phone: '01012345678', phoneCountry: 'EG', email: 'print.qa@example.test', registrationDate: '2026-09-01' },
    progress: {},
    workoutPrograms: [{ id: workoutId, name: workout.name, goal: 'قوة', level: 'متوسط', startDate: '2026-10-01', endDate: '2026-11-26', status: 'active', exerciseCount: 1 }],
    dietPlans: [{ id: dietId, name: diet.name, targetCalories: 2200, startDate: '2026-10-01', endDate: '2026-10-31', status: 'active', mealsPerDay: 1 }],
    measurements: [{ measuredAt: '2026-10-02', weightKg: 82.5, heightCm: 178, bodyFatPercent: 18.2 }],
    workoutSessions: [{ programName: workout.name, routineName: 'اليوم الأول', status: 'completed', startedAt: '2026-10-03 08:30' }],
    mealLogs: [{ foodName: 'شوفان بالحليب', mealName: 'الإفطار', calories: 310, consumedAt: '2026-10-03 07:45' }]
};

async function makePdfFromPrintPopup(page, popup, testInfo, fileBase) {
    await expect(popup.locator('main.print-sheet')).toBeVisible();
    await expect(popup.locator('link[data-top-gym-print-styles]')).toHaveAttribute('href', /\/css\/print\.css\?v=5$/);
    await popup.addStyleTag({ content: fs.readFileSync(path.join(__dirname, '../../public/css/print.css'), 'utf8') });
    const layout = await popup.locator('main.print-sheet').evaluate((sheet) => ({
        direction: getComputedStyle(sheet).direction,
        width: Math.round(sheet.getBoundingClientRect().width),
        scrollWidth: sheet.scrollWidth,
        sectionCount: sheet.querySelectorAll('.print-section').length,
        tables: [...sheet.querySelectorAll('table')].map((table) => ({
            headers: table.querySelectorAll('thead th').length,
            rows: table.querySelectorAll('tbody tr').length
        }))
    }));
    expect(layout.direction).toBe('rtl');
    expect(layout.width).toBeGreaterThan(500);
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width + 1);
    expect(layout.sectionCount).toBeGreaterThan(1);

    const printable = await page.context().newPage();
    const markup = await popup.evaluate(() => `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>${document.querySelector('main.print-sheet').outerHTML}</body></html>`);
    await printable.setContent(markup, { waitUntil: 'domcontentloaded' });
    await printable.addStyleTag({ content: fs.readFileSync(path.join(__dirname, '../../public/css/print.css'), 'utf8') });
    await printable.emulateMedia({ media: 'print' });
    await printable.evaluate(() => document.fonts?.ready);
    const pdfPath = testInfo.outputPath(`${fileBase}.pdf`);
    const screenshotPath = testInfo.outputPath(`${fileBase}.png`);
    const pdf = await printable.pdf({ path: pdfPath, printBackground: true, preferCSSPageSize: true });
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.byteLength).toBeGreaterThan(5000);
    await printable.screenshot({ path: screenshotPath, fullPage: true });
    const evidenceDir = path.join(__dirname, '../../qa/reports/logicfit-v2-print-coaching');
    await fs.promises.mkdir(evidenceDir, { recursive: true });
    await Promise.all([
        fs.promises.copyFile(pdfPath, path.join(evidenceDir, `${fileBase}.pdf`)),
        fs.promises.copyFile(screenshotPath, path.join(evidenceDir, `${fileBase}.png`))
    ]);
    await printable.close();
    await popup.close();
    return { layout, pdfBytes: pdf.byteLength };
}

test('coaching workout, nutrition plan, and client overview render tenant-facing Arabic print PDFs', async ({ page }, testInfo) => {
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
        else if (pathname === `/api/library/exercises/17701`) payload = { item: { id: 17701, nameAr: 'سكوات بالبار', name: 'Barbell Squat', targetMuscleNameAr: 'عضلات الفخذ', equipment: 'Barbell', difficulty: 'Intermediate', descriptionAr: 'تمرين مركب للقوة.' } };
        else if (pathname === `/api/dietplans/${dietId}`) payload = { plan: diet };
        else if (pathname === `/api/clients/${clientId}/training-overview`) payload = overview;
        await route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(payload) });
    });

    await page.goto('/index.html#coaching', { waitUntil: 'networkidle' });
    if (!await page.evaluate(() => Boolean(window.topGymPrint?.printCoachingSystem))) {
        await page.addScriptTag({ url: '/js/integrations/print-enhancements.js' });
    }
    await expect.poll(() => page.evaluate(() => Boolean(window.topGymPrint?.printCoachingSystem))).toBe(true);

    const workoutPopupPromise = page.waitForEvent('popup');
    await page.evaluate((id) => window.topGymPrint.printCoachingSystem(id, 'workout'), workoutId);
    const workoutPopup = await workoutPopupPromise;
    await workoutPopup.waitForFunction(() => Boolean(document.querySelector('.print-system-document, .print-error')));
    const workoutPopupText = await workoutPopup.locator('body').innerText();
    expect(await workoutPopup.locator('.print-system-document').count(), `Workout print did not render: ${workoutPopupText}; requests=${JSON.stringify(apiRequests)}`).toBeGreaterThan(0);
    await expect(workoutPopup.locator('.print-system-document')).toBeVisible();
    await expect(workoutPopup.locator('.print-brand-title')).toHaveText('Logic Fit QA');
    await expect.poll(() => workoutPopup.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--print-brand-primary').trim())).toBe('#0070F3');
    await expect(workoutPopup.locator('.print-system-hero')).toContainText(workout.name);
    await expect(workoutPopup.locator('.print-system-routine tbody tr')).toContainText('سكوات بالبار');
    await expect(workoutPopup.locator('.print-system-routine tbody tr')).toContainText('حافظ على مدى حركة كامل');
    const workoutOutput = await makePdfFromPrintPopup(page, workoutPopup, testInfo, 'coaching-workout-print');

    const draftPopupPromise = page.waitForEvent('popup');
    await page.evaluate(({ draft, client }) => window.topGymPrint.printCoachingDraft(draft, 'workout', {
        exercises: [{ id: 17701, nameAr: 'سكوات بالبار', targetMuscleNameAr: 'عضلات الفخذ', equipment: 'Barbell', difficulty: 'Intermediate' }]
    }, client), { draft: { ...workout, id: undefined, name: 'مسودة اختبار برنامج القوة' }, client: memberName });
    const draftPopup = await draftPopupPromise;
    await expect(draftPopup.locator('.print-system-document')).toBeVisible();
    await expect(draftPopup.locator('.print-system-hero')).toContainText('مسودة اختبار برنامج القوة');
    await expect(draftPopup.locator('.print-system-routine tbody tr')).toContainText('سكوات بالبار');
    const draftOutput = await makePdfFromPrintPopup(page, draftPopup, testInfo, 'coaching-workout-draft-print');

    const dietPopupPromise = page.waitForEvent('popup');
    await page.evaluate((id) => window.topGymPrint.printCoachingSystem(id, 'diet'), dietId);
    const dietPopup = await dietPopupPromise;
    await expect(dietPopup.locator('.print-system-document')).toBeVisible();
    await expect(dietPopup.locator('.print-system-hero')).toContainText(diet.name);
    await expect(dietPopup.locator('.print-system-routine tbody tr')).toContainText('شوفان بالحليب');
    const dietRowText = await dietPopup.locator('.print-system-routine tbody tr').innerText();
    const normalizedDietRow = dietRowText.replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
    expect(normalizedDietRow).toContain('310');
    const dietOutput = await makePdfFromPrintPopup(page, dietPopup, testInfo, 'coaching-diet-print');

    const overviewPopupPromise = page.waitForEvent('popup');
    await page.evaluate((id) => window.topGymPrint.printCoachingOverview(id), clientId);
    const overviewPopup = await overviewPopupPromise;
    await expect(overviewPopup.locator('.print-sheet')).toContainText(memberName);
    await expect(overviewPopup.locator('.print-sheet')).toContainText(workout.name);
    await expect(overviewPopup.locator('.print-sheet')).toContainText('شوفان بالحليب');
    const overviewOutput = await makePdfFromPrintPopup(page, overviewPopup, testInfo, 'coaching-client-overview-print');

    expect(apiRequests.filter((request) => request.pathname === `/api/workoutprograms/${workoutId}`)).toHaveLength(1);
    expect(apiRequests.filter((request) => request.pathname === `/api/dietplans/${dietId}`)).toHaveLength(1);
    expect(apiRequests.filter((request) => request.pathname === `/api/clients/${clientId}/training-overview`)).toHaveLength(1);
    await fs.promises.writeFile(testInfo.outputPath('coaching-print-summary.json'), JSON.stringify({ workout: workoutOutput, workoutDraft: draftOutput, diet: dietOutput, clientOverview: overviewOutput, apiRequests }, null, 2), 'utf8');
});
