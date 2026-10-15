'use strict';

const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');

const ORIGIN = 'http://127.0.0.1:4173';
const OUTPUT = path.resolve(process.cwd(), 'qa/artifacts/external-trainees-overlap-20261014');
const WIDTHS = [320, 375, 390, 768, 1024, 1440, 1920];
const THEMES = ['light', 'dark'];
const LOCALES = ['ar', 'en'];
const EXTERNAL_FORM_KEYS = [
    'coaching.dialog.externalTrainee.description', 'coaching.externalForm.fullName',
    'coaching.externalForm.fullNamePlaceholder', 'coaching.externalForm.phone',
    'coaching.externalForm.email', 'coaching.externalForm.optional',
    'coaching.externalForm.registrationDate', 'coaching.externalForm.notes',
    'coaching.externalForm.save'
];

test('External trainees central Arabic/English matrix preserves state without locale-triggered network activity', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'One intercepted app session exercises the complete viewport/theme/locale matrix.');
    test.setTimeout(420_000);

    const apiRequests = [];
    const writes = [];
    const outsideRequests = [];
    const pageErrors = [];
    let fixtureMode = 'success';
    const trainee = {
        id: 99301,
        fullName: 'Fixture Trainee — unchanged domain value',
        phone: '+201001234567',
        phoneCountry: 'EG',
        email: 'external.qa@example.test',
        workoutCount: 1,
        dietCount: 1,
        measurementCount: 2,
        lastActivity: '2026-10-12T10:00:00.000Z',
        workoutPlans: [{ id: 99311, name: 'Provider Workout — unchanged', status: 'active', exerciseCount: 3, durationWeeks: 4, daysPerWeek: 3 }],
        dietPlans: [{ id: 99312, name: 'Provider Nutrition — unchanged', status: 'draft', targetCalories: 2100, meals: 4, itemCount: 8 }]
    };

    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.route('**/*', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const method = request.method().toUpperCase();
        if (url.origin !== ORIGIN) {
            outsideRequests.push(`${method} ${url.origin}${url.pathname}`);
            return route.abort('blockedbyclient');
        }
        if (!url.pathname.startsWith('/api/')) return route.continue();
        if (url.pathname === '/api/notifications/stream') return route.fulfill({ status: 204 });
        if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
            writes.push(`${method} ${url.pathname}`);
            return route.fulfill({ status: 405, contentType: 'application/json', body: '{"error":"read-only external trainee fixture"}' });
        }
        apiRequests.push({ method, path: url.pathname, search: url.search });
        let body = {};
        if (url.pathname === '/api/auth/session') {
            body = { authenticated: true, user: { id: 99300, name: 'Read-only i18n QA Owner', role: 'Owner', tenantType: 'gym', permissions: [] } };
        } else if (url.pathname === '/api/branding') {
            body = { identity: { brandName: 'Read-only QA Gym' }, assets: {} };
        } else if (url.pathname === '/api/saas/entitlements') {
            body = { tenantStatus: 'active', subscription: { status: 'active', plan: { code: 'business', name: 'Business' } }, entitlements: { tenantType: 'gym', features: { coaching: true }, featureCatalog: [{ key: 'coaching', tenantTypes: ['gym'] }] } };
        } else if (url.pathname === '/api/branches/bootstrap' || url.pathname === '/api/bootstrap') {
            body = { branches: [], activeBranches: [], sections: [], defaultBranch: null, canUseAllBranches: true };
        } else if (url.pathname === '/api/external-trainees') {
            if (fixtureMode === 'loading') await new Promise((resolve) => setTimeout(resolve, 700));
            if (fixtureMode === 'error') {
                return route.fulfill({ status: 503, contentType: 'application/json; charset=utf-8', body: JSON.stringify({ error: 'Temporary QA service error' }) });
            }
            body = ['empty', 'no-results'].includes(fixtureMode)
                ? { trainees: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0, hasPrevious: false, hasNext: false } }
                : { trainees: [trainee], pagination: { page: 1, pageSize: 20, total: 21, totalPages: 2, hasPrevious: false, hasNext: true } };
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
    const list = section.locator('#externalTraineesList');
    const search = section.locator('#externalTraineeSearch');
    await expect(section).toBeVisible();
    await expect(list).toContainText(trainee.fullName);
    await expect(section.locator('#traineesTitle')).toHaveText('المتدربون غير المشتركين');
    await expect(section.locator('.external-trainees-table thead')).toContainText('المتدرب');
    await expect.poll(() => apiRequests.filter((entry) => entry.path === '/api/external-trainees').length).toBe(1);
    await page.waitForLoadState('networkidle');
    const settledApiRequests = apiRequests.map((request) => `${request.method} ${request.path}${request.search}`);
    await search.evaluate((input) => { input.value = 'draft search survives'; });
    await page.evaluate(() => {
        document.documentElement.dataset.theme = 'dark';
        document.body.dataset.theme = 'dark';
        window.TopGymI18n.set('en', { persist: false });
    });
    await expect(search).toHaveValue('draft search survives');
    await page.evaluate(() => {
        document.documentElement.dataset.theme = 'light';
        document.body.dataset.theme = 'light';
        window.TopGymI18n.set('ar', { persist: false });
    });
    await expect(search).toHaveValue('draft search survives');
    await search.evaluate((input) => { input.value = ''; });

    const screenshots = [];
    const specialEvidence = [];
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
                await expect(section.locator('.coaching-summary-card').nth(0)).toContainText(locale === 'ar' ? 'المتدربون الخارجيون' : 'External trainees');
                await expect(section.locator('.coaching-summary-card').nth(1)).toContainText(locale === 'ar' ? 'برامج التدريب' : 'Training programs');
                await expect(list).toContainText(trainee.fullName);
                await expect(list).toContainText('Provider Workout — unchanged');
                const workoutLabel = list.locator('.trainee-systems-cell .system-type.workout');
                await expect(workoutLabel, `coaching.type.workout locale=${locale}; central=${await page.evaluate(() => window.TopGymI18n.t('coaching.type.workout'))}`).toHaveText(locale === 'ar' ? 'تدريب' : 'Training');
                if (width <= 1199) {
                    const responsiveLabels = locale === 'ar'
                        ? ['المتدرب', 'النوع', 'الأنظمة', 'القياسات', 'آخر نشاط', 'الإجراءات']
                        : ['Trainee', 'Type', 'Systems', 'Measurements', 'Last activity', 'Actions'];
                    for (const [index, label] of responsiveLabels.entries()) {
                        const cell = list.locator(`.external-trainees-table tbody tr:first-child td:nth-child(${index + 1})`);
                        await expect(cell).toHaveAttribute('data-label', label);
                        expect(await cell.evaluate((element) => getComputedStyle(element, '::before').content))
                            .toContain(label);
                    }
                }
                const systemDetails = list.locator('.external-trainee-system-copy small').first();
                await expect(systemDetails).toContainText(locale === 'ar' ? '٣ تمرين' : '3 exercises');
                await expect(systemDetails).toContainText(locale === 'ar' ? '٤ أسبوع' : '4 weeks');
                await expect(list.locator('.trainee-measurements-cell small')).toHaveText(locale === 'ar' ? 'قياس محفوظ' : 'Saved measurement');
                const lastActivity = list.locator('.external-trainee-last-activity');
                if (locale === 'en') await expect(lastActivity).toContainText(/[0-9]/);
                else await expect(lastActivity).toContainText(/[٠-٩]/);
                await expect(list.locator('[data-coaching-action="workout"]'))
                    .toHaveAttribute('aria-label', locale === 'ar' ? 'إضافة تدريب' : 'Add training');
                await expect(list.locator('[data-member-coaching-action="edit-workout"]')).toHaveText(locale === 'ar' ? 'تعديل النظام' : 'Edit system');
                await expect(list.locator('[data-member-coaching-action="print-workout"]')).toHaveText(locale === 'ar' ? 'طباعة النظام' : 'Print system');
                await expect(list.locator('[data-member-coaching-action="delete-workout"]')).toHaveText(locale === 'ar' ? 'حذف النظام' : 'Delete system');
                await expect(search).toHaveValue('');
                await expect(section.locator('#externalTraineesPagination')).toContainText(locale === 'ar' ? 'صفحة' : 'Page');
                await expect(list).toContainText(locale === 'ar' ? 'نشط' : 'Active');
                await expect(list).toContainText(locale === 'ar' ? 'مسودة' : 'Draft');

                await page.mouse.move(2, 2);
                await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
                if (width === 1024) {
                    const titleClearance = await page.evaluate(() => {
                        const title = document.querySelector('#traineesSection .coaching-heading h3');
                        const titleRect = title.getBoundingClientRect();
                        const overlappingFixedOrSticky = [...document.querySelectorAll('body *')].filter((element) => {
                            if (!element.getClientRects().length || element === title || title.contains(element)) return false;
                            if (!['fixed', 'sticky'].includes(getComputedStyle(element).position)) return false;
                            const rect = element.getBoundingClientRect();
                            return rect.width > 0 && rect.height > 0 && rect.left < titleRect.right && rect.right > titleRect.left && rect.top < titleRect.bottom && rect.bottom > titleRect.top;
                        }).map((element) => element.id ? `#${element.id}` : element.className?.toString?.() || element.tagName);
                        return { title: { top: titleRect.top, bottom: titleRect.bottom }, overlappingFixedOrSticky };
                    });
                    expect(titleClearance.overlappingFixedOrSticky, `fixed/sticky shell content must not cover the 1024px title: ${JSON.stringify(titleClearance)}`).toEqual([]);
                }
                const geometry = await page.evaluate(() => ({
                    viewport: innerWidth,
                    document: document.documentElement.scrollWidth,
                    body: document.body.scrollWidth,
                    section: document.getElementById('traineesSection').scrollWidth,
                    locale: document.documentElement.lang,
                    direction: document.documentElement.dir,
                    theme: document.documentElement.dataset.theme,
                    presentation: (() => {
                        const table = document.querySelector('#externalTraineesList .external-trainees-table');
                        const wrap = table?.closest('.external-trainees-table-wrap');
                        const row = table?.tBodies[0]?.rows[0];
                        return {
                            table: table ? getComputedStyle(table).display : 'missing',
                            tableWidth: table ? Math.round(table.getBoundingClientRect().width) : 0,
                            wrapWidth: wrap ? wrap.clientWidth : 0,
                            wrapScrollWidth: wrap ? wrap.scrollWidth : 0,
                            row: row ? getComputedStyle(row).display : 'missing',
                            rowWidth: row ? Math.round(row.getBoundingClientRect().width) : 0,
                            rowHovered: row ? row.matches(':hover') : false,
                            minWidth: table ? getComputedStyle(table).minWidth : 'missing',
                            gridColumns: row ? getComputedStyle(row).gridTemplateColumns : 'missing',
                            cells: [...(row?.cells || [])].map((cell) => {
                                const rect = cell.getBoundingClientRect();
                                const style = getComputedStyle(cell);
                                return { text: cell.innerText.trim().slice(0, 36), x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height), cssWidth: style.width, maxWidth: style.maxWidth, justifySelf: style.justifySelf, display: style.display, position: style.position, gridColumn: style.gridColumn };
                            }),
                            contentBounds: (() => {
                                if (!row) return {};
                                const bounds = (element) => {
                                    const rect = element.getBoundingClientRect();
                                    return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
                                };
                                return {
                                    systemsCell: bounds(row.cells[2]),
                                    systemsWrapper: bounds(row.cells[2].querySelector('.external-trainee-systems')),
                                    systemCounts: bounds(row.cells[2].querySelector('.external-trainee-counts')),
                                    systemList: bounds(row.cells[2].querySelector('.external-trainee-system-list')),
                                    systems: [...row.querySelectorAll('.external-trainee-system-item')].map(bounds),
                                    measurementsCell: bounds(row.cells[3]),
                                    measurements: bounds(row.cells[3].querySelector('.external-trainee-compact-metric')),
                                    actionCell: bounds(row.cells[5]),
                                    actions: bounds(row.cells[5].querySelector('.trainee-actions')),
                                    cellStyles: [2, 3, 4, 5].map((index) => {
                                        const cell = row.cells[index];
                                        const style = getComputedStyle(cell);
                                        return { index, display: style.display, position: style.position, alignSelf: style.alignSelf, height: style.height, minHeight: style.minHeight, overflow: style.overflow, gridRow: style.gridRow, gridColumn: style.gridColumn };
                                    }),
                                    rowStyles: (() => { const style = getComputedStyle(row); return { height: style.height, minHeight: style.minHeight, gridTemplateRows: style.gridTemplateRows, alignItems: style.alignItems, overflow: style.overflow }; })()
                                };
                            })(),
                            actions: [...(row?.querySelectorAll('.trainee-actions > button') || [])].map((button) => {
                                const rect = button.getBoundingClientRect();
                                return { width: Math.round(rect.width), height: Math.round(rect.height) };
                            })
                        };
                    })()
                }));
                expect(geometry.document, `document overflow at ${width}/${theme}/${locale}`).toBeLessThanOrEqual(width);
                expect(geometry.body, `body overflow at ${width}/${theme}/${locale}`).toBeLessThanOrEqual(width);
                expect(geometry.section, `trainee section overflow at ${width}/${theme}/${locale}`).toBeLessThanOrEqual(width);
                expect(geometry.locale).toBe(locale);
                expect(geometry.direction).toBe(locale === 'ar' ? 'rtl' : 'ltr');
                expect(geometry.theme).toBe(theme);
                expect(geometry.presentation.rowHovered, `stable capture must not hover the record at ${width}/${theme}/${locale}`).toBe(false);
                if (width <= 1199) {
                    expect(geometry.presentation.table, `adaptive card table at ${width}`).toBe('block');
                    expect(geometry.presentation.row, `adaptive record card at ${width}`).toBe('grid');
                    expect(geometry.presentation.cells[0].width, `member identity should fill its card at ${width}: ${JSON.stringify(geometry.presentation)}`).toBeGreaterThan(geometry.presentation.rowWidth * 0.85);
                    const { contentBounds } = geometry.presentation;
                    const intersects = (a, b) => a && b && Math.min(a.right, b.right) - Math.max(a.x, b.x) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y) > 1;
                    for (const system of contentBounds.systems) {
                        expect(intersects(system, contentBounds.measurements), `system content intersects measurement content at ${width}/${theme}/${locale}: ${JSON.stringify(contentBounds)}`).toBe(false);
                        expect(intersects(system, contentBounds.actions), `system content intersects action content at ${width}/${theme}/${locale}: ${JSON.stringify(contentBounds)}`).toBe(false);
                    }
                    expect(contentBounds.systemsCell.bottom, `systems cell must end before measurement cell at ${width}/${theme}/${locale}`).toBeLessThanOrEqual(contentBounds.measurementsCell.y + 1);
                    expect(contentBounds.measurementsCell.bottom, `measurement cell must end before actions at ${width}/${theme}/${locale}`).toBeLessThanOrEqual(contentBounds.actionCell.y + 1);
                } else {
                    expect(geometry.presentation.table, `desktop table at ${width}`).toBe('table');
                }
                const currentApiRequests = apiRequests.map((request) => `${request.method} ${request.path}${request.search}`);
                expect(currentApiRequests, `changing only locale/theme must not trigger API requests; added: ${currentApiRequests.slice(settledApiRequests.length).join(', ')}`).toEqual(settledApiRequests);

                const filename = `external-trainees-${width}-${theme}-${locale}.png`;
                await page.screenshot({ path: path.join(OUTPUT, filename) });
                screenshots.push({ ...geometry, filename });

                if (width === 1024 && theme === 'light' && locale === 'en') {
                    await page.setViewportSize({ width: 1024, height: 1400 });
                    const row = list.locator('.external-trainees-table tbody tr').first();
                    await row.scrollIntoViewIfNeeded();
                    await page.mouse.move(2, 2);
                    const recordEvidence = await row.evaluate((element) => {
                        const rect = element.getBoundingClientRect();
                        return { top: rect.top, bottom: rect.bottom, height: rect.height, hovered: element.matches(':hover'), viewportHeight: innerHeight };
                    });
                    expect(recordEvidence.hovered, '1024 record evidence should not capture hover styling').toBe(false);
                    expect(recordEvidence.top, '1024 record should appear below the fixed shell').toBeGreaterThan(140);
                    expect(recordEvidence.bottom, 'the complete 1024 record should fit in the evidence viewport (allowing subpixel rounding)').toBeLessThanOrEqual(recordEvidence.viewportHeight + 1);
                    const recordFilename = 'external-trainees-1024-light-en-record.png';
                    await page.screenshot({ path: path.join(OUTPUT, recordFilename) });
                    specialEvidence.push({ filename: recordFilename, ...recordEvidence });
                    await page.setViewportSize({ width, height: 960 });
                    await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
                }

                await section.locator('#addExternalTraineeButton').click();
                const dialog = page.locator('#externalTraineeDialog');
                await expect(dialog).toBeVisible();
                await expect(dialog.locator('#externalTraineeTitle')).toHaveText(locale === 'ar' ? 'إضافة متدرب خارجي' : 'Add external trainee');
                await expect(dialog.locator('#externalFullName')).toBeVisible();
                await expect(dialog.locator('#externalPhone')).toBeVisible();
                const formCopy = locale === 'ar'
                    ? { fullName: 'الاسم الكامل *', phone: 'رقم الهاتف *', email: 'البريد الإلكتروني', registrationDate: 'تاريخ التسجيل', notes: 'ملاحظات', save: 'حفظ المتدرب', close: 'إغلاق', cancel: 'إلغاء' }
                    : { fullName: 'Full name *', phone: 'Phone number *', email: 'Email', registrationDate: 'Registration date', notes: 'Notes', save: 'Save trainee', close: 'Close', cancel: 'Cancel' };
                for (const [field, label] of Object.entries({ fullName: 'fullName', phone: 'phone', email: 'email', registrationDate: 'registrationDate', notes: 'notes' })) {
                    await expect(dialog.locator(`label[for="external${field[0].toUpperCase()}${field.slice(1)}"]`)).toHaveText(formCopy[label]);
                }
                await expect(dialog.locator('#externalTraineeClose')).toHaveText(formCopy.close);
                await expect(dialog.locator('#externalTraineeCancel')).toHaveText(formCopy.cancel);
                await expect(dialog.locator('button[type="submit"]')).toHaveText(formCopy.save);
                const dialogBounds = await dialog.boundingBox();
                expect(dialogBounds, `external trainee dialog should fit ${width}/${theme}/${locale}`).not.toBeNull();
                expect(dialogBounds.x, `dialog left edge ${width}/${theme}/${locale}`).toBeGreaterThanOrEqual(0);
                expect(dialogBounds.x + dialogBounds.width, `dialog right edge ${width}/${theme}/${locale}`).toBeLessThanOrEqual(width + 1);
                const dialogFilename = `external-trainee-dialog-${width}-${theme}-${locale}.png`;
                await page.screenshot({ path: path.join(OUTPUT, dialogFilename) });
                screenshots.push({ viewport: width, theme, locale, dialog: true, filename: dialogFilename });
                await dialog.locator('#externalTraineeCancel').click();
            }
        }
    }

    await page.evaluate(() => window.TopGymI18n.set('ar', { persist: false }));
    await section.locator('#addExternalTraineeButton').click();
    const dialog = page.locator('#externalTraineeDialog');
    await expect(dialog).toBeVisible();
    await page.locator('#externalFullName').fill('Draft trainee name remains');
    await page.locator('#externalNotes').fill('Unsubmitted notes remain unchanged');
    const requestsBeforeDialogLocaleChanges = apiRequests.length;
    await page.evaluate(() => window.TopGymI18n.set('en', { persist: false }));
    await expect(dialog.locator('#externalTraineeTitle')).toHaveText('Add external trainee');
    await expect(page.locator('#externalFullName')).toHaveValue('Draft trainee name remains');
    await expect(page.locator('#externalNotes')).toHaveValue('Unsubmitted notes remain unchanged');
    await page.evaluate(() => window.TopGymI18n.set('ar', { persist: false }));
    await expect(dialog.locator('#externalTraineeTitle')).toHaveText('إضافة متدرب خارجي');
    await expect(page.locator('#externalFullName')).toHaveValue('Draft trainee name remains');
    await expect(page.locator('#externalNotes')).toHaveValue('Unsubmitted notes remain unchanged');
    expect(apiRequests, 'changing locale with an open draft must not refetch or mutate data').toHaveLength(requestsBeforeDialogLocaleChanges);
    await dialog.locator('#externalTraineeCancel').click();

    const stateEvidence = [];
    for (const stateCase of [
        { mode: 'loading', width: 390, theme: 'light', locale: 'ar', title: 'جارٍ تحميل قائمة المتدربين…', filename: 'state-loading-390-light-ar.png' },
        { mode: 'empty', width: 320, theme: 'dark', locale: 'en', title: 'There are no external trainees yet', filename: 'state-empty-320-dark-en.png' },
        { mode: 'empty', width: 768, theme: 'light', locale: 'ar', title: 'لا يوجد متدربون خارجيون حاليًا', filename: 'state-empty-768-light-ar.png' },
        { mode: 'no-results', width: 390, theme: 'dark', locale: 'ar', title: 'لا يوجد متدربون مطابقون لبحثك', filename: 'state-no-results-390-dark-ar.png' },
        { mode: 'error', width: 1440, theme: 'dark', locale: 'en', title: 'Could not load the trainee list', filename: 'state-error-1440-dark-en.png' },
        { mode: 'error', width: 390, theme: 'light', locale: 'ar', title: 'تعذر تحميل قائمة المتدربين', filename: 'state-error-390-light-ar.png' }
    ]) {
        fixtureMode = stateCase.mode;
        await page.setViewportSize({ width: stateCase.width, height: stateCase.width <= 390 ? 850 : 960 });
        await page.evaluate(({ mode, language }) => {
            document.documentElement.dataset.theme = mode;
            document.body.dataset.theme = mode;
            window.TopGymI18n.set(language, { persist: false });
        }, { mode: stateCase.theme, language: stateCase.locale });
        if (stateCase.mode === 'no-results') {
            await search.fill('missing trainee');
            await expect(list).toContainText(stateCase.title);
        } else {
            await search.evaluate((input) => { input.value = ''; });
            await section.locator('#externalTraineeRefreshButton').click();
        }
        if (stateCase.mode === 'loading') {
            await expect(list.locator('.loading')).toBeVisible();
            await expect(list.locator('.loading')).toHaveAttribute('role', 'status');
            await expect(list.locator('.loading')).toHaveAttribute('aria-label', stateCase.title);
            await page.screenshot({ path: path.join(OUTPUT, stateCase.filename) });
            await expect(list).toContainText(trainee.fullName);
        } else {
            await expect(list).toContainText(stateCase.title);
            await page.screenshot({ path: path.join(OUTPUT, stateCase.filename) });
        }
        const viewportWidth = stateCase.width;
        const overflow = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
        expect(overflow.document, `${stateCase.mode} document overflow at ${viewportWidth}`).toBeLessThanOrEqual(viewportWidth);
        expect(overflow.body, `${stateCase.mode} body overflow at ${viewportWidth}`).toBeLessThanOrEqual(viewportWidth);
        stateEvidence.push({ ...stateCase, overflow });
    }

    const missingFormKeys = await page.evaluate((keys) => keys.filter((key) => window.TopGymI18n.t(key) === key), EXTERNAL_FORM_KEYS);
    expect(writes, 'the fixture must never submit changes').toEqual([]);
    expect(outsideRequests.every((request) => request === 'GET https://cdn.jsdelivr.net/npm/sweetalert2@11'), `Unexpected external request: ${outsideRequests.join(', ')}`).toBe(true);
    expect(pageErrors, 'the external trainees route must remain free of uncaught errors').toEqual([]);

    const result = {
        cases: screenshots.length, screenshots, specialEvidence, stateEvidence, apiRequests,
        externalTraineeReads: apiRequests.filter((entry) => entry.path === '/api/external-trainees'),
        writes, outsideRequests, pageErrors, missingFormKeys
    };
    await fs.writeFile(path.join(OUTPUT, 'matrix.json'), JSON.stringify(result, null, 2));
    expect(screenshots).toHaveLength(WIDTHS.length * THEMES.length * LOCALES.length * 2);
});
