'use strict';

const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const planCatalog = require('../../src/services/saas-plan-catalog');
const featureCatalog = require('../../src/services/feature-catalog');

const ORIGIN = 'http://127.0.0.1:4173';
const OUTPUT = path.resolve(process.cwd(), 'qa/artifacts/membership-management-i18n-v2');
const WIDTHS = (process.env.MANAGEMENT_I18N_WIDTHS || '320,390,768,1024,1440').split(',').map(Number).filter((width) => [320, 390, 768, 1024, 1440].includes(width));
const THEMES = (process.env.MANAGEMENT_I18N_THEMES || 'light,dark').split(',').filter((theme) => ['light', 'dark'].includes(theme));
const LOCALES = (process.env.MANAGEMENT_I18N_LOCALES || 'ar,en').split(',').filter((locale) => ['ar', 'en'].includes(locale));
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function json(route, body) {
    return route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(body) });
}

test('membership management tabs use central Arabic/English copy without changing drafts or issuing writes', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'One session captures the entire viewport/theme/locale matrix.');
    test.setTimeout(240_000);

    const writes = [];
    const reads = [];
    const pageErrors = [];
    const plan = planCatalog.PLAN_CONFIGURATIONS.find((item) => item.code === 'business');
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.route('**/*', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const method = request.method().toUpperCase();
        if (url.origin !== ORIGIN) return route.abort('blockedbyclient');
        if (!url.pathname.startsWith('/api/')) return route.continue();
        if (!SAFE_METHODS.has(method)) {
            writes.push({ method, path: url.pathname });
            return json(route, { error: 'Read-only membership-management QA' });
        }
        reads.push({ method, path: url.pathname });
        let body = {};
        if (url.pathname === '/api/auth/session') {
            body = { authenticated: true, user: { id: 99701, name: 'Membership QA Owner', role: 'Owner', tenantType: 'gym', permissions: [] } };
        } else if (url.pathname === '/api/branding') {
            body = { identity: { brandName: 'Membership QA Gym' }, assets: {} };
        } else if (url.pathname === '/api/saas/entitlements') {
            body = { tenantStatus: 'active', subscription: { status: 'active', plan: { code: plan.code, name: plan.name } }, entitlements: { tenantType: 'gym', features: planCatalog.featureFlagsForPlan(plan.code), featureCatalog: featureCatalog.getFeatureCatalog({ tenantType: 'gym' }) } };
        } else if (url.pathname === '/api/branches/bootstrap' || url.pathname === '/api/bootstrap') {
            body = { branches: [], activeBranches: [], sections: [], defaultBranch: null, canUseAllBranches: true };
        } else if (url.pathname === '/api/pricing') {
            body = {
                plans: {
                    gym_only: { label: 'باقة تجريبية عربية', monthlyPrice: 350, active: true, sortOrder: 1 },
                    gym_cardio: { label: 'Gym + Cardio QA', monthlyPrice: 575, active: false, sortOrder: 2 }
                },
                types: {
                    monthly: { label: 'شهري تجريبي', mode: 'months', durationValue: 1, priceMultiplier: 1, active: true, sortOrder: 1 },
                    short_days: { label: 'Seven Day QA', mode: 'days', durationValue: 7, priceMultiplier: 0.4, active: false, sortOrder: 2 }
                },
                prices: { gym_only: { monthly: 350 }, gym_cardio: { monthly: 575 } }
            };
        } else if (url.pathname === '/api/day-passes/pricing') {
            body = { types: [{ code: 'day_pass_qa', label: 'دخول يومي تجريبي', price: 75, active: true, sortOrder: 1 }] };
        } else if (url.pathname === '/api/members') {
            body = { members: [], pagination: { page: 1, pageSize: 5, totalItems: 0, totalPages: 0 } };
        }
        return json(route, body);
    });

    await page.addInitScript(() => {
        localStorage.setItem('logic-fit-ui-locale', 'ar');
        localStorage.setItem('topgym-theme', 'light');
    });
    await fs.mkdir(OUTPUT, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto('/index.html#management', { waitUntil: 'networkidle' });

    const section = page.locator('#managementSection');
    await expect.poll(() => page.locator('html').getAttribute('data-top-gym-active-tab')).toBe('management');
    await expect(section).toBeVisible();
    await expect(page.locator('#dayPassPricingContainer .loading')).toBeHidden();
    await expect(page.locator('#dayPassPricingContainer .day-pass-pricing-card-grid, #dayPassPricingContainer .pricing-cards-empty')).toBeVisible();

    const matrix = [];
    for (const width of WIDTHS) {
        for (const theme of THEMES) {
            for (const locale of LOCALES) {
                await page.setViewportSize({ width, height: width <= 390 ? 844 : 960 });
                await page.evaluate(({ mode, language }) => {
                    window.TopGymTheme?.set?.(mode);
                    window.TopGymI18n.set(language, { persist: false });
                }, { mode: theme, language: locale });

                const english = locale === 'en';
                const expected = english
                    ? { title: 'Pricing and memberships', pricing: 'Plan pricing', types: 'Membership types' }
                    : { title: 'الأسعار والعضويات', pricing: 'أسعار الباقات', types: 'أنواع العضويات' };
                await expect(section.locator('.panel-header h3')).toHaveText(expected.title);
                await expect(section.locator('#managementPricingTab')).toContainText(expected.pricing);
                await expect(section.locator('#managementTypesTab')).toContainText(expected.types);
                await expect(page.locator('html')).toHaveAttribute('dir', english ? 'ltr' : 'rtl');
                const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth);
                expect(pageWidth, `page overflow at ${width}/${theme}/${locale}`).toBeLessThanOrEqual(width);
                const screenFile = `management-${width}-${theme}-${locale}.png`;
                await section.screenshot({ path: path.join(OUTPUT, screenFile), animations: 'disabled' });

                const readsBeforePricing = reads.filter((entry) => entry.path === '/api/pricing').length;
                await section.locator('#managementPricingTab').click();
                const pricingDialog = page.locator('#pricingDialog');
                await expect(pricingDialog).toBeVisible();
                await expect(pricingDialog).toHaveAttribute('role', 'tabpanel');
                await expect(pricingDialog.locator('#pricingDialogTitle')).toHaveText(expected.pricing);
                await expect(pricingDialog.locator('.pricing-table thead')).toContainText(english ? 'Monthly price' : 'السعر الشهري');
                await expect(pricingDialog.locator('.pricing-table thead')).toContainText(english ? 'Custom price' : 'سعر مستقل');
                const gymOnlyCard = pricingDialog.locator('#pricingTableContainer .pricing-plan-card[data-plan="gym_only"]');
                const gymCardioCard = pricingDialog.locator('#pricingTableContainer .pricing-plan-card[data-plan="gym_cardio"]');
                const retainedDraft = matrix.length > 0;
                await expect(gymOnlyCard.locator('[data-field="planName"]')).toHaveValue(retainedDraft ? 'Draft Gym Name' : 'باقة تجريبية عربية');
                await expect(gymCardioCard.locator('[data-field="planName"]')).toHaveValue('Gym + Cardio QA');
                const planName = gymOnlyCard.locator('[data-field="planName"]');
                const monthlyPrice = gymOnlyCard.locator('[data-field="monthlyPrice"]');
                const durationPrice = gymOnlyCard.locator('[data-field="typePrice"]').first();
                await expect(monthlyPrice).toHaveValue(retainedDraft ? '731.25' : '350.00');
                await planName.fill('Draft Gym Name');
                await monthlyPrice.fill('731.25');
                await durationPrice.fill('612.50');
                const pricingReadCount = reads.filter((entry) => entry.path === '/api/pricing').length;
                await page.evaluate((language) => window.TopGymI18n.set(language, { persist: false }), english ? 'ar' : 'en');
                await expect(pricingDialog.locator('#pricingDialogTitle')).toHaveText(english ? 'أسعار الباقات' : 'Plan pricing');
                await expect(planName).toHaveValue('Draft Gym Name');
                await expect(monthlyPrice).toHaveValue('731.25');
                await expect(durationPrice).toHaveValue('612.50');
                expect(reads.filter((entry) => entry.path === '/api/pricing').length, 'locale change must not reload pricing').toBe(pricingReadCount);
                await page.evaluate((language) => window.TopGymI18n.set(language, { persist: false }), locale);
                const pricingFile = `pricing-${width}-${theme}-${locale}.png`;
                await pricingDialog.screenshot({ path: path.join(OUTPUT, pricingFile), animations: 'disabled' });
                expect(pricingReadCount).toBeLessThanOrEqual(readsBeforePricing + 1);
                // Selecting another inline workspace hides this panel but keeps
                // its controls and draft mounted for the return trip.
                await section.locator('#managementTypesTab').click();
                await expect(pricingDialog).toBeHidden();

                await section.locator('#managementTypesTab').click();
                const typesDialog = page.locator('#membershipTypesDialog');
                await expect(typesDialog).toBeVisible();
                await expect(typesDialog.locator('#membershipTypesDialogTitle')).toHaveText(expected.types);
                await expect(typesDialog.locator('table thead')).toContainText(english ? 'Duration' : 'المدة');
                await expect(typesDialog.locator('tbody')).toContainText('شهري تجريبي');
                await expect(typesDialog.locator('tbody')).toContainText('Seven Day QA');
                await expect(typesDialog.locator('tbody')).toContainText(english ? 'Hidden' : 'غير ظاهر');
                const editButton = typesDialog.locator('[data-type-action="edit"]').first();
                await expect(editButton).toHaveAttribute('aria-label', english ? 'Edit membership type شهري تجريبي' : 'تعديل نوع العضوية شهري تجريبي');
                const typesFile = `types-${width}-${theme}-${locale}.png`;
                await typesDialog.screenshot({ path: path.join(OUTPUT, typesFile), animations: 'disabled' });

                await typesDialog.locator('#addMembershipTypeButton').click();
                const typeDialog = page.locator('#membershipTypeDialog');
                await expect(typeDialog).toBeVisible();
                await typeDialog.locator('#membershipTypeName').fill('نوع مسودة ثابت');
                await typeDialog.locator('#membershipTypeMode').selectOption('days');
                await typeDialog.locator('#membershipTypeDuration').fill('7.5');
                await typeDialog.locator('#membershipTypeMultiplier').fill('0.75');
                await typeDialog.locator('#membershipTypeSortOrder').fill('91');
                await typeDialog.locator('#membershipTypeActive').uncheck();
                await page.evaluate((language) => window.TopGymI18n.set(language, { persist: false }), english ? 'ar' : 'en');
                await expect(typeDialog.locator('#membershipTypeDialogTitle')).toHaveText(english ? 'إضافة نوع عضوية جديد' : 'Add membership type');
                await expect(typeDialog.locator('#membershipTypeName')).toHaveValue('نوع مسودة ثابت');
                await expect(typeDialog.locator('#membershipTypeMode')).toHaveValue('days');
                await expect(typeDialog.locator('#membershipTypeDuration')).toHaveValue('7.5');
                await expect(typeDialog.locator('#membershipTypeMultiplier')).toHaveValue('0.75');
                await expect(typeDialog.locator('#membershipTypeSortOrder')).toHaveValue('91');
                await expect(typeDialog.locator('#membershipTypeActive')).not.toBeChecked();
                // The locale has just been switched to the opposite of the
                // matrix locale above, so its preview number follows that state.
                await expect(typeDialog.locator('#membershipTypePreview')).toContainText(locale === 'ar' ? '7.5' : '٧٫٥');
                await page.evaluate((language) => window.TopGymI18n.set(language, { persist: false }), locale);
                const typeFile = `type-form-${width}-${theme}-${locale}.png`;
                await typeDialog.screenshot({ path: path.join(OUTPUT, typeFile), animations: 'disabled' });
                await typeDialog.locator('#membershipTypeCancel').click();
                await expect(typesDialog).toBeVisible();

                await section.locator('#managementPricingTab').click();
                await expect(pricingDialog).toBeVisible();
                await expect(gymOnlyCard.locator('[data-field="planName"]')).toHaveValue('Draft Gym Name');
                await expect(gymOnlyCard.locator('[data-field="monthlyPrice"]')).toHaveValue('731.25');
                await pricingDialog.locator('#addMembershipPlanButton').click();
                const planDialog = page.locator('#membershipPlanDialog');
                await expect(planDialog).toBeVisible();
                await planDialog.locator('#membershipPlanName').fill('Draft plan name');
                await planDialog.locator('#membershipPlanPrice').fill('812.25');
                await planDialog.locator('#membershipPlanSortOrder').fill('17');
                await planDialog.locator('#membershipPlanActive').uncheck();
                await page.evaluate((language) => window.TopGymI18n.set(language, { persist: false }), english ? 'ar' : 'en');
                await expect(planDialog.locator('#membershipPlanDialogTitle')).toHaveText(english ? 'إضافة باقة جديدة' : 'Add plan');
                await expect(planDialog.locator('#membershipPlanName')).toHaveValue('Draft plan name');
                await expect(planDialog.locator('#membershipPlanPrice')).toHaveValue('812.25');
                await expect(planDialog.locator('#membershipPlanSortOrder')).toHaveValue('17');
                await expect(planDialog.locator('#membershipPlanActive')).not.toBeChecked();
                await page.evaluate((language) => window.TopGymI18n.set(language, { persist: false }), locale);
                const planFile = `plan-form-${width}-${theme}-${locale}.png`;
                await planDialog.screenshot({ path: path.join(OUTPUT, planFile), animations: 'disabled' });
                await planDialog.locator('#membershipPlanCancel').click();
                await expect(pricingDialog).toBeVisible();

                const bounds = await page.evaluate(() => ({
                    viewport: innerWidth,
                    pageWidth: document.documentElement.scrollWidth,
                    bodyWidth: document.body.scrollWidth,
                    direction: getComputedStyle(document.getElementById('managementSection')).direction,
                    pricingPanelWidth: document.getElementById('pricingDialog').getBoundingClientRect().width,
                    typeDialogWidth: document.getElementById('membershipTypeDialog').getBoundingClientRect().width,
                    planDialogWidth: document.getElementById('membershipPlanDialog').getBoundingClientRect().width
                }));
                expect(bounds.pageWidth).toBeLessThanOrEqual(width);
                expect(bounds.bodyWidth).toBeLessThanOrEqual(width);
                expect(bounds.direction).toBe(english ? 'ltr' : 'rtl');
                expect(bounds.pricingPanelWidth).toBeLessThanOrEqual(width + 1);
                matrix.push({ width, theme, locale, ...bounds, screenshots: [screenFile, pricingFile, typesFile, typeFile, planFile] });
            }
        }
    }

    expect(reads.filter((entry) => entry.path === '/api/pricing').length).toBe(1);
    expect(writes, 'the QA flow must never submit or mutate data').toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(matrix).toHaveLength(WIDTHS.length * THEMES.length * LOCALES.length);
    await fs.writeFile(path.join(OUTPUT, 'matrix.json'), JSON.stringify({ cases: matrix.length, matrix, reads, writes, pageErrors }, null, 2));
});
