'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { test, expect } = require('@playwright/test');

const ORIGIN = 'http://127.0.0.1:4173';
const OUTPUT = path.resolve(process.cwd(), 'qa/artifacts/trainer-studio-presentation-gaps');
const WIDTHS = [320, 390, 768, 1440];

test('Trainer plan editors and external trainee form localize without changing values or making writes', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'One browser session records the requested viewport and locale matrix.');
    test.setTimeout(180_000);
    const reads = [];
    const writes = [];
    const pageErrors = [];
    const readCount = () => reads.filter((request) => !request.endsWith('/api/notifications/stream')).length;
    let tenantType = 'independent_trainer';
    let servedCoachingSource = false;
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.route('**/*', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin !== ORIGIN) return route.abort('blockedbyclient');
        if (request.resourceType() === 'document') {
            tenantType = url.pathname === '/index.html' ? 'gym' : 'independent_trainer';
            return route.continue();
        }
        if (!url.pathname.startsWith('/api/')) return route.continue();
        const method = request.method().toUpperCase();
        if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
            writes.push(`${method} ${url.pathname}`);
            return route.fulfill({ status: 405, contentType: 'application/json', body: '{"error":"read-only presentation QA"}' });
        }
        reads.push(`${method} ${url.pathname}${url.search}`);
        let body = {};
        if (url.pathname === '/api/auth/session') body = { authenticated: true, user: { id: 99200, name: 'Presentation QA', role: 'Owner', tenantType, permissions: [] } };
        else if (url.pathname === '/api/branding') body = { identity: { brandName: 'Presentation QA' }, assets: {} };
        else if (url.pathname === '/api/saas/entitlements') {
            const features = ['clients', 'coaching', 'nutrition', 'library', 'assessments', 'progress', 'goals', 'sessions', 'packages', 'payments', 'reports', 'portal', 'notifications', 'tasks', 'templates'];
            body = { tenantStatus: 'active', subscription: { status: 'active', plan: { code: 'basic', name: 'Plan label sentinel' } }, entitlements: { tenantType, features: Object.fromEntries(features.map((key) => [key, true])), featureCatalog: features.map((key) => ({ key, tenantTypes: [tenantType] })) } };
        } else if (url.pathname === '/api/saas/subscription') body = { tenant: { name: 'Tenant sentinel' }, subscription: { status: 'active', plan: { name: 'Plan label sentinel' } } };
        else if (url.pathname === '/api/trainer/clients') body = { clients: [{ id: 99201, fullName: 'Provider client sentinel', phone: '01000000001' }], pagination: { page: 1, totalPages: 1, total: 1 } };
        else if (url.pathname === '/api/trainer/library/catalog') body = { exercises: [{ id: 81, nameAr: 'Provider exercise sentinel' }], foods: [{ id: 82, nameAr: 'Provider food sentinel' }], muscles: [], options: {} };
        else if (url.pathname === '/api/trainer/training-plans' || url.pathname === '/api/trainer/nutrition-plans') body = { plans: [] };
        else if (url.pathname === '/api/coaching/catalog') body = { exercises: [{ id: 81, nameAr: 'Provider exercise sentinel' }], foods: [{ id: 82, nameAr: 'Provider food sentinel', calories: 380, protein: 13, carbs: 68, fat: 7, servingSize: 100, servingUnit: 'g' }] };
        else if (url.pathname === '/api/dietplans/99312') body = { plan: { id: 99312, memberId: 99301, memberName: 'Provider trainee sentinel', name: 'Provider nutrition plan sentinel', startDate: '2026-10-12', endDate: '', mealsPerDay: 4, targetCalories: 2100, targetProtein: 150, targetCarbs: 240, targetFats: 70, calorieGoal: 'maintain', calorieAdjustment: 0, calculator: {}, status: 'draft', notes: '', meals: [{ name: 'Provider meal data sentinel', mealTime: '08:00', sortOrder: 0, notes: '', items: [{ foodId: 82, assignedQuantity: 100, servingUnit: 'g', notes: '' }] }] } };
        else if (url.pathname === '/api/branches/bootstrap' || url.pathname === '/api/bootstrap') body = { branches: [], activeBranches: [], sections: [], defaultBranch: null, canUseAllBranches: true };
        else if (url.pathname === '/api/external-trainees') body = { trainees: [{ id: 99301, fullName: 'Provider trainee sentinel', phone: '+201001234567', email: 'provider@example.test', status: 'active', lastActivity: '2026-10-12T10:00:00.000Z', workoutPlans: [{ id: 99311, name: 'Provider workout plan sentinel', status: 'active', exerciseCount: 3, durationWeeks: 4, daysPerWeek: 3 }], dietPlans: [{ id: 99312, name: 'Provider nutrition plan sentinel', status: 'draft', targetCalories: 2100, meals: 4, itemCount: 8 }] }], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } };
        return route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(body) });
    });
    await page.route('**/js/pages/coaching/coaching.js*', async (route) => route.fulfill({
        status: 200,
        contentType: 'application/javascript; charset=utf-8',
        body: await fs.readFile(path.resolve(process.cwd(), 'public/js/pages/coaching/coaching.js'), 'utf8').then((source) => { servedCoachingSource = true; return source; })
    }));

    await fs.mkdir(OUTPUT, { recursive: true });
    await page.addInitScript(() => localStorage.setItem('logic-fit-ui-locale', 'ar'));
    await page.goto('/trainer-workspace/training', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#trainerStudioRouteTitle')).toBeVisible();
    await page.locator('[data-studio-open-editor]').click();
    const planForm = page.locator('#trainerStudioPlanForm');
    await expect(planForm).toBeVisible();
    await planForm.locator('[name="clientId"]').selectOption('99201');
    await planForm.locator('[name="name"]').fill('Entered plan value sentinel');
    await planForm.locator('[name="startDate"]').fill('2026-10-13');
    const formValues = () => planForm.evaluate((form) => Object.fromEntries(new FormData(form).entries()));
    const preservedPlanValues = await formValues();

    for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: width <= 390 ? 844 : 900 });
        for (const locale of ['ar', 'en']) {
            const beforeReads = readCount();
            await page.evaluate((language) => window.TopGymI18n.set(language, { persist: false }), locale);
            await expect(page.locator('html')).toHaveAttribute('lang', locale);
            await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
            await expect(planForm.locator('label:has([name="startDate"])')).toContainText(locale === 'ar' ? 'تاريخ البداية' : 'Start date');
            await expect(planForm.locator('label:has([name="duration"])')).toContainText(locale === 'ar' ? 'بالأسابيع' : 'in weeks');
            await expect(planForm.locator('[name="clientId"]')).toContainText('Provider client sentinel');
            expect(await formValues()).toEqual(preservedPlanValues);
            expect(readCount(), 'locale changes must not refetch data').toBe(beforeReads);
            const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
            expect(dimensions.document).toBeLessThanOrEqual(width);
            expect(dimensions.body).toBeLessThanOrEqual(width);
            await page.screenshot({ path: path.join(OUTPUT, `plan-${width}-${locale}.png`), fullPage: true });
        }
    }

    await page.goto('/trainer-workspace/nutrition', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toHaveAttribute('data-trainer-route', 'nutrition');
    await page.locator('[data-studio-open-editor]').click();
    const nutritionForm = page.locator('#trainerStudioPlanForm');
    await expect(nutritionForm).toBeVisible();
    await nutritionForm.locator('[name="clientId"]').selectOption('99201');
    await nutritionForm.locator('[name="name"]').fill('Nutrition plan value sentinel');
    await nutritionForm.locator('[name="startDate"]').fill('2026-10-13');
    const nutritionValues = () => nutritionForm.evaluate((form) => Object.fromEntries(new FormData(form).entries()));
    const preservedNutritionValues = await nutritionValues();
    for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: width <= 390 ? 844 : 900 });
        for (const locale of ['ar', 'en']) {
            const beforeReads = readCount();
            await page.evaluate((language) => window.TopGymI18n.set(language, { persist: false }), locale);
            await expect(page.locator('html')).toHaveAttribute('lang', locale);
            await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
            await expect(page.locator('#trainerStudioRouteTitle'))
                .toHaveText(locale === 'ar' ? 'خطط التغذية' : 'Nutrition plans');
            await expect(page.locator('#trainerStudioRouteEyebrow'))
                .toHaveText(locale === 'ar' ? 'التغذية' : 'Nutrition');
            await expect(page.locator('[data-i18n="trainerStudioV2.description.nutrition"]'))
                .toHaveText(locale === 'ar' ? 'الخطط الغذائية المرتبطة بملفات العملاء.' : 'Nutrition plans linked to client profiles.');
            await expect(nutritionForm.locator('label:has([name="startDate"])')).toContainText(locale === 'ar' ? 'تاريخ البداية' : 'Start date');
            await expect(nutritionForm.locator('label:has([name="duration"])')).toContainText(locale === 'ar' ? 'بالأيام' : 'in days');
            await expect(nutritionForm.locator('label:has([name="unit"])')).toContainText(locale === 'ar' ? 'الوحدة' : 'Unit');
            await expect(nutritionForm.locator('label:has([name="targetCalories"])')).toContainText(locale === 'ar' ? 'السعرات المستهدفة' : 'Target calories');
            await expect(nutritionForm.locator('[name="foodId"]')).toContainText('Provider food sentinel');
            expect(await nutritionValues()).toEqual(preservedNutritionValues);
            expect(readCount(), 'locale changes must not refetch data').toBe(beforeReads);
            const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
            expect(dimensions.document).toBeLessThanOrEqual(width);
            expect(dimensions.body).toBeLessThanOrEqual(width);
            await page.screenshot({ path: path.join(OUTPUT, `nutrition-${width}-${locale}.png`), fullPage: true });
        }
    }

    tenantType = 'gym';
    await page.goto('/index.html#trainees', { waitUntil: 'domcontentloaded' });
    await page.locator('[data-page-tab="trainees"]').click();
    await expect.poll(() => servedCoachingSource).toBe(true);
    await expect.poll(() => reads.some((request) => request.startsWith('GET /api/external-trainees'))).toBe(true);
    await expect(page.locator('#traineesSection')).toBeVisible();
    await page.locator('#addExternalTraineeButton').click();
    const traineeDialog = page.locator('#externalTraineeDialog');
    await expect(traineeDialog).toBeVisible();
    await expect(traineeDialog.locator('#externalTraineeTitle')).toHaveAttribute('data-i18n', 'coaching.addTrainee');
    await expect(page.locator('#externalTraineesList')).toContainText('Provider workout plan sentinel');
    await expect(page.locator('#externalTraineesList')).toContainText('Provider nutrition plan sentinel');
    const activityDate = page.locator('#externalTraineesList [data-i18n-format="date"]');
    await expect(activityDate).toHaveAttribute('data-i18n-value', '2026-10-12T10:00:00.000Z');
    await page.locator('#externalFullName').fill('Trainee input sentinel');
    await page.locator('#externalEmail').fill('qa@example.test');
    await page.waitForLoadState('networkidle');
    const traineeValues = async () => Promise.all(['#externalFullName', '#externalPhone', '#externalEmail', '#externalRegistrationDate', '#externalNotes'].map((selector) => page.locator(selector).inputValue()));
    const preservedTraineeValues = await traineeValues();
    for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: width <= 390 ? 844 : 900 });
        for (const locale of ['ar', 'en']) {
            const beforeReads = readCount();
            await page.evaluate((language) => window.TopGymI18n.set(language, { persist: false }), locale);
            await expect(page.locator('html')).toHaveAttribute('lang', locale);
            await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
            expect(await page.evaluate(() => window.TopGymI18n.t('coaching.addTrainee'))).toBe(locale === 'ar' ? 'إضافة متدرب خارجي' : 'Add external trainee');
            expect(pageErrors).toEqual([]);
            await expect(traineeDialog.locator('#externalTraineeTitle')).toHaveText(locale === 'ar' ? 'إضافة متدرب خارجي' : 'Add external trainee');
            await expect(traineeDialog.locator('label[for="externalFullName"]')).toContainText(locale === 'ar' ? 'الاسم الكامل' : 'Full name');
            await expect(traineeDialog.locator('label[for="externalPhone"]')).toContainText(locale === 'ar' ? 'رقم الهاتف' : 'Phone number');
            await expect(traineeDialog.locator('label[for="externalEmail"]')).toContainText(locale === 'ar' ? 'البريد الإلكتروني' : 'Email');
            await expect(traineeDialog.locator('label[for="externalRegistrationDate"]')).toContainText(locale === 'ar' ? 'تاريخ التسجيل' : 'Registration date');
            await expect(traineeDialog.locator('label[for="externalNotes"]')).toContainText(locale === 'ar' ? 'ملاحظات' : 'Notes');
            await expect(activityDate).toHaveText(await page.evaluate(() => window.TopGymI18n.format('date', '2026-10-12T10:00:00.000Z')));
            expect(await traineeValues()).toEqual(preservedTraineeValues);
            expect(readCount(), `locale changes must not refetch data: ${locale}`).toBe(beforeReads);
            const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
            expect(dimensions.document).toBeLessThanOrEqual(width);
            expect(dimensions.body).toBeLessThanOrEqual(width);
            await page.screenshot({ path: path.join(OUTPUT, `external-trainee-${width}-${locale}.png`), fullPage: true });
        }
    }

    await page.keyboard.press('Escape');
    await expect(traineeDialog).toBeHidden();
    await page.locator('[data-member-coaching-action="edit-diet"][data-id="99312"]').click();
    const nutritionBuilder = page.locator('#coachingBuilderDialog');
    await expect(nutritionBuilder).toBeVisible();
    await expect(nutritionBuilder.locator('[data-builder-field="targetCalories"]')).toHaveValue('2100');
    await nutritionBuilder.locator('[data-builder-field="name"]').fill('Provider plan value sentinel');
    await nutritionBuilder.locator('[data-builder-field="startDate"]').fill('2026-10-12');
    const builderValues = () => nutritionBuilder.locator('[data-builder-field]').evaluateAll((controls) => controls.map((control) => [control.dataset.builderField, control.value]));
    const preservedBuilderValues = await builderValues();
    await nutritionBuilder.locator('#coachingBuilderNext').click();
    await expect(nutritionBuilder.locator('.nutrition-summary-head')).toBeVisible();
    for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: width <= 390 ? 844 : 900 });
        for (const locale of ['ar', 'en']) {
            const beforeReads = readCount();
            await page.evaluate((language) => window.TopGymI18n.set(language, { persist: false }), locale);
            await expect(page.locator('html')).toHaveAttribute('lang', locale);
            await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
            await expect(nutritionBuilder.locator('.nutrition-summary-head > div > span')).toHaveText(locale === 'ar' ? 'إجمالي التغذية الحالي' : 'Live nutrition totals');
            await expect(nutritionBuilder.locator('.nutrition-macro-grid')).toContainText(locale === 'ar' ? 'بروتين' : 'Protein');
            await expect(nutritionBuilder.locator('.nutrition-macro-grid')).toContainText(locale === 'ar' ? 'كربوهيدرات' : 'Carbohydrates');
            await nutritionBuilder.locator('[data-builder-step-target="1"]').click();
            expect(await builderValues()).toEqual(preservedBuilderValues);
            await expect(nutritionBuilder.locator('.builder-target-panel h4')).toHaveText(locale === 'ar' ? 'السعرات والماكروز المستهدفة' : 'Target calories and macros');
            await expect(nutritionBuilder.locator('.calculator-results > div:nth-child(1) span')).toHaveText(locale === 'ar' ? 'معدل الأيض الأساسي (BMR)' : 'Basal metabolic rate (BMR)');
            await expect(nutritionBuilder.locator('.calculator-results > div:nth-child(2) span')).toHaveText(locale === 'ar' ? 'الاحتياج اليومي مع النشاط (TDEE)' : 'Total daily energy expenditure (TDEE)');
            await expect(nutritionBuilder.locator('.target-grid')).toContainText(locale === 'ar' ? 'البروتين (جم)' : 'Protein (g)');
            await expect(nutritionBuilder.locator('.target-grid')).toContainText(locale === 'ar' ? 'الكربوهيدرات (جم)' : 'Carbohydrates (g)');
            await nutritionBuilder.locator('#coachingBuilderNext').click();
            await expect(nutritionBuilder.locator('.builder-meals-list')).toBeVisible();
            await expect(nutritionBuilder.locator('.builder-food-table')).toContainText(locale === 'ar' ? 'السعرات' : 'Calories');
            await expect(nutritionBuilder.locator('.builder-food-table')).toContainText(locale === 'ar' ? 'الطعام' : 'Food');
            expect(readCount(), 'locale changes must not refetch data').toBe(beforeReads);
            const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
            expect(dimensions.document).toBeLessThanOrEqual(width);
            expect(dimensions.body).toBeLessThanOrEqual(width);
            await page.screenshot({ path: path.join(OUTPUT, `nutrition-details-${width}-${locale}.png`), fullPage: true });
        }
    }

    expect(writes, 'the fixture blocks every write request').toEqual([]);
    expect(pageErrors).toEqual([]);
});
