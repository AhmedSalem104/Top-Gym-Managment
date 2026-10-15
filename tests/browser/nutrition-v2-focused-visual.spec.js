const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');

const trainerHtml = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'trainer-workspace.html'), 'utf8');
const widths = [320, 390, 768, 1440];
const themes = ['light', 'dark'];
const directions = ['rtl', 'ltr'];
const plans = [
    { id: 8401, name: 'خطة تغذية متوازنة للاختبار', clientName: 'عميل اختبار التغذية', goal: 'تحسين العادات الغذائية', status: 'active' },
    { id: 8402, name: 'خطة طويلة لاختبار احتواء النصوص العربية داخل صفوف الشاشة', clientName: 'اسم عميل اختباري طويل', goal: 'زيادة الكتلة العضلية', status: 'archived' }
];

async function installReadOnlyFixture(page) {
    const writes = [];
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.route('**/trainer-workspace**', async (route) => {
        if (route.request().resourceType() === 'document') {
            return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: trainerHtml });
        }
        return route.continue();
    });
    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;
        if (request.method() !== 'GET') {
            writes.push({ method: request.method(), pathname });
            return route.fulfill({ status: 405, contentType: 'application/json', body: JSON.stringify({ error: 'Read-only nutrition visual test' }) });
        }

        const payload = pathname === '/api/auth/session'
            ? { user: { id: 981, name: 'مدرب الاختبار', role: 'Owner', tenantType: 'independent_trainer', mustChangePassword: false } }
            : pathname === '/api/saas/entitlements'
                ? { tenantStatus: 'active', subscription: { status: 'active', plan: { code: 'basic', name: 'Basic' } }, entitlements: { tenantType: 'independent_trainer', features: { nutrition: true, coaching: true }, featureCatalog: [{ key: 'nutrition', tenantTypes: ['independent_trainer'] }, { key: 'coaching', tenantTypes: ['independent_trainer'] }] } }
                : pathname === '/api/saas/subscription'
                    ? { tenant: { name: 'بيئة اختبار المدرب' }, subscription: { status: 'active', plan: { name: 'Basic' } } }
                    : pathname === '/api/trainer/workspace'
                        ? { metrics: { activeClients: 2, sessionsToday: 0, upcomingSessions: 0, packagesExpiring: 0, outstandingPayments: 0, clientsNeedingFollowUp: 0, recentMeasurements: 0, recentCheckins: 0 } }
                            : pathname === '/api/trainer/clients'
                                ? { clients: [{ id: 772, fullName: 'عميل اختبار التغذية' }] }
                        : pathname === '/api/trainer/nutrition-plans'
                            ? { plans }
                                : pathname === '/api/trainer/library/catalog'
                                    ? { foods: [{ id: 773, nameAr: 'طعام اختباري' }], exercises: [], muscles: [] }
                            : {};
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
    });
    return { writes, pageErrors };
}

async function setTheme(page, theme) {
    if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('[data-theme-toggle]').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

async function setDirection(page, direction) {
    await page.evaluate((value) => {
        document.documentElement.dir = value;
        document.body.dir = value;
    }, direction);
    await expect(page.locator('html')).toHaveAttribute('dir', direction);
}

async function openNutritionRoute(page, width) {
    if (width <= 860 && !(await page.locator('body').evaluate((element) => element.classList.contains('trainer-sidebar-open')))) {
        await page.locator('#trainerStudioMenuButton').click();
    }
    await page.locator('[data-studio-route="nutrition"]').evaluate((element) => element.click());
    await expect(page.locator('body')).toHaveAttribute('data-trainer-route', 'nutrition');
    await expect(page.locator('#trainerStudioDynamicView .trainer-studio-data-panel')).toBeVisible();
    await expect(page.locator('[data-studio-plan-id="8401"]')).toBeVisible();
    await expect(page.locator('[data-studio-plan-id="8402"]')).toBeVisible();
}

test('Trainer nutrition V2 stays usable across viewport, theme and direction matrix without writes', async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const { writes, pageErrors } = await installReadOnlyFixture(page);
    const evidenceDirectory = path.resolve(process.cwd(), 'qa/artifacts/nutrition-v2-focused-visual');
    fs.mkdirSync(evidenceDirectory, { recursive: true });
    const matrix = [];

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/trainer-workspace/dashboard', { waitUntil: 'networkidle' });
    await expect(page.locator('#trainerStudioSidebar')).toBeAttached();

    for (const width of widths) {
        for (const theme of themes) {
            for (const direction of directions) {
                await page.setViewportSize({ width, height: width <= 390 ? 844 : 900 });
                await setTheme(page, theme);
                await setDirection(page, direction);
                await openNutritionRoute(page, width);

                await expect(page.locator('[data-studio-open-editor]')).toBeVisible();
                await expect(page.locator('button[data-studio-plan-id="8401"]')).toBeVisible();
                await expect(page.locator('button[data-studio-plan-id="8402"]')).toBeVisible();
                await expect(page.locator('button[data-studio-plan-id="8401"]').locator('..').locator('.trainer-studio-row-main strong')).toContainText(plans[0].name);
                await expect(page.locator('button[data-studio-plan-id="8402"]').locator('..').locator('.trainer-studio-row-main strong')).toContainText(plans[1].name);

                const geometry = await page.evaluate(() => {
                    const panel = document.querySelector('#trainerStudioDynamicView .trainer-studio-data-panel');
                    const rows = [...document.querySelectorAll('#trainerStudioDynamicView button[data-studio-plan-id]')].map((button) => button.closest('.trainer-studio-data-row'));
                    return {
                        viewport: document.documentElement.clientWidth,
                        document: document.documentElement.scrollWidth,
                        body: document.body.scrollWidth,
                        panel: panel?.getBoundingClientRect().width || 0,
                        rows: rows.map((row) => {
                            const rect = row.getBoundingClientRect();
                            const action = row.querySelector('.trainer-studio-row-action')?.getBoundingClientRect();
                            const text = [...row.querySelectorAll('.trainer-studio-row-main strong, .trainer-studio-row-main span')].map((element) => ({
                                clientWidth: element.clientWidth,
                                scrollWidth: element.scrollWidth,
                                clientHeight: element.clientHeight,
                                scrollHeight: element.scrollHeight
                            }));
                            return { left: rect.left, right: rect.right, width: rect.width, actionLeft: action?.left, actionRight: action?.right, text };
                        })
                    };
                });
                expect(geometry.document, JSON.stringify({ width, theme, direction, geometry })).toBeLessThanOrEqual(width + 1);
                expect(geometry.body, JSON.stringify({ width, theme, direction, geometry })).toBeLessThanOrEqual(width + 1);
                expect(geometry.panel, JSON.stringify({ width, theme, direction, geometry })).toBeGreaterThan(0);
                for (const row of geometry.rows) {
                    expect(row.width, JSON.stringify({ width, theme, direction, row })).toBeGreaterThan(0);
                    expect(row.actionLeft, JSON.stringify({ width, theme, direction, row })).toBeGreaterThanOrEqual(0);
                    expect(row.actionRight, JSON.stringify({ width, theme, direction, row })).toBeLessThanOrEqual(width + 1);
                    for (const text of row.text) {
                        expect(text.scrollWidth, JSON.stringify({ width, theme, direction, text })).toBeLessThanOrEqual(text.clientWidth + 1);
                        expect(text.scrollHeight, JSON.stringify({ width, theme, direction, text })).toBeLessThanOrEqual(text.clientHeight + 1);
                    }
                }

                const file = `nutrition-${width}-${theme}-${direction}.png`;
                await page.screenshot({ path: path.join(evidenceDirectory, file), fullPage: true });
                matrix.push({ width, theme, direction, file, geometry });

                if (width === 320 && theme === 'light' && direction === 'rtl') {
                    await page.locator('[data-studio-open-editor]').click();
                    const form = page.locator('#trainerStudioPlanForm');
                    await expect(form).toBeVisible();
                    for (const field of ['clientId', 'name', 'startDate', 'duration', 'mealName', 'foodId', 'quantity', 'unit', 'targetCalories', 'targetProtein']) {
                        await expect(form.locator(`[name="${field}"]`), `Nutrition editor field ${field} remains available`).toBeVisible();
                    }
                    await expect(form.locator('[data-studio-save-plan]')).toBeVisible();
                    await page.screenshot({ path: path.join(evidenceDirectory, 'nutrition-editor-320-light-rtl.png'), fullPage: true });
                    await page.locator('[data-studio-close-editor]').click();
                    await expect(page.locator('[data-studio-open-editor]')).toBeVisible();
                }
            }
        }
    }

    fs.writeFileSync(path.join(evidenceDirectory, 'matrix.json'), JSON.stringify({ cases: matrix, writes, pageErrors }, null, 2));
    expect(writes).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(matrix).toHaveLength(16);
});
