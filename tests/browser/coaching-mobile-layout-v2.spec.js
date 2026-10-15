'use strict';

const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');

const ORIGIN = 'http://127.0.0.1:4173';
const OUTPUT = path.resolve(process.cwd(), 'qa/artifacts/coaching-mobile-layout-v2');
const WIDTHS = [320, 390, 768, 1440];
const THEMES = ['light', 'dark'];
const LOCALES = ['en', 'ar'];

test('External trainees reflow cleanly without losing data or actions', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The desktop browser records the full responsive, theme and locale matrix.');
    test.setTimeout(180_000);

    const writes = [];
    const externalRequests = [];
    const pageErrors = [];
    const traineeReads = [];
    const trainees = [
        {
            id: 99301,
            fullName: 'Alexander Maximilian Montgomery-Fitzgerald With an Intentionally Long Name',
            phone: '+201001234567', phoneCountry: 'EG',
            email: 'alexandria.montgomery-fitzgerald.coaching.qa@example.test',
            workoutCount: 1, dietCount: 1, measurementCount: 2,
            lastActivity: '2026-10-12T10:00:00.000Z',
            workoutPlans: [{ id: 99311, name: 'Strength and Conditioning — Long-Form Progressive Overload Plan', status: 'active', exerciseCount: 12, durationWeeks: 12, daysPerWeek: 4 }],
            dietPlans: [{ id: 99312, name: 'Performance Nutrition Plan with Long-Form Meal Guidance', status: 'draft', targetCalories: 2450, meals: 5, itemCount: 18 }]
        },
        {
            id: 99302,
            fullName: 'عبد الرحمن محمد عبد اللطيف صاحب اسم عربي طويل لاختبار التفاف النص داخل بطاقة المتدرب',
            phone: '+966501234567', phoneCountry: 'SA',
            email: 'abdulrahman.long-profile@example.test',
            workoutCount: 1, dietCount: 0, measurementCount: 0,
            lastActivity: '2026-10-10T08:30:00.000Z',
            workoutPlans: [{ id: 99313, name: 'برنامج إعداد بدني متدرج وطويل المدى لاختبار عرض تفاصيل النظام', status: 'active', exerciseCount: 8, durationWeeks: 8, daysPerWeek: 3 }],
            dietPlans: []
        }
    ];

    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.route('**/*', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const method = request.method().toUpperCase();
        if (url.origin !== ORIGIN) {
            externalRequests.push({ request: `${method} ${url.origin}${url.pathname}`, blocked: true });
            return route.abort('blockedbyclient');
        }
        if (!url.pathname.startsWith('/api/')) return route.continue();
        if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
            writes.push(`${method} ${url.pathname}`);
            return route.fulfill({ status: 405, contentType: 'application/json', body: '{"error":"read-only Coaching QA"}' });
        }
        if (url.pathname === '/api/external-trainees') traineeReads.push(method);

        let body = {};
        if (url.pathname === '/api/auth/session') {
            body = { authenticated: true, user: { id: 99300, name: 'Read-only Coaching QA Owner', role: 'Owner', tenantType: 'gym', permissions: [] } };
        } else if (url.pathname === '/api/branding') {
            body = { identity: { brandName: 'Read-only Coaching QA Gym' }, assets: {} };
        } else if (url.pathname === '/api/saas/entitlements') {
            body = { tenantStatus: 'active', subscription: { status: 'active', plan: { code: 'business', name: 'Business' } }, entitlements: { tenantType: 'gym', features: { coaching: true }, featureCatalog: [{ key: 'coaching', tenantTypes: ['gym'] }] } };
        } else if (url.pathname === '/api/branches/bootstrap' || url.pathname === '/api/bootstrap') {
            body = { branches: [], activeBranches: [], sections: [], defaultBranch: null, canUseAllBranches: true };
        } else if (url.pathname === '/api/external-trainees') {
            body = { trainees, pagination: { page: 1, pageSize: 20, total: trainees.length, totalPages: 1, hasPrevious: false, hasNext: false } };
        }
        return route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(body) });
    });

    await page.addInitScript(() => {
        localStorage.setItem('logic-fit-ui-locale', 'en');
        localStorage.setItem('topgym-theme', 'light');
    });
    await fs.mkdir(OUTPUT, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto('/index.html#trainees', { waitUntil: 'domcontentloaded' });
    await expect.poll(() => page.locator('html').getAttribute('data-top-gym-active-tab')).toBe('trainees');

    const section = page.locator('#traineesSection');
    const list = section.locator('#externalTraineesList');
    const table = list.locator('.external-trainees-table');
    const wrapper = list.locator('.external-trainees-table-wrap');
    await expect(section).toBeVisible();
    await expect(table.locator('tbody tr')).toHaveCount(2);
    for (const trainee of trainees) await expect(list).toContainText(trainee.fullName);
    await expect(list).toContainText(trainees[0].email);
    await expect(list).toContainText(trainees[0].workoutPlans[0].name);
    await expect(list).toContainText(trainees[0].dietPlans[0].name);

    const captures = [];
    for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: width <= 390 ? 900 : 960 });
        for (const theme of THEMES) {
            for (const locale of LOCALES) {
                await page.evaluate(({ mode, language }) => {
                    document.documentElement.dataset.theme = mode;
                    document.body.dataset.theme = mode;
                    window.TopGymI18n.set(language, { persist: false });
                }, { mode: theme, language: locale });

                await expect(page.locator('html')).toHaveAttribute('lang', locale);
                await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
                await expect(section.locator('#addExternalTraineeButton')).toBeVisible();
                await expect(section.locator('#externalTraineeSearch')).toBeVisible();
                await expect(section.locator('#externalTraineeRefreshButton')).toBeVisible();
                for (const trainee of trainees) await expect(list).toContainText(trainee.fullName);

                const actionSelectors = ['workout', 'profile', 'diet'];
                for (const action of actionSelectors) {
                    const buttons = list.locator(`[data-coaching-action="${action}"]`);
                    await expect(buttons).toHaveCount(2);
                    for (const button of await buttons.all()) {
                        await expect(button).toBeVisible();
                        const accessibleName = await button.getAttribute('aria-label') || await button.getAttribute('title');
                        expect(accessibleName?.trim(), `${action} action must have an accessible name`).toBeTruthy();
                    }
                }

                if (width <= 1199) {
                    await expect(table).toHaveCSS('display', 'block');
                    await expect(table.locator('tbody tr').first()).toHaveCSS('display', 'grid');
                    const scroll = await wrapper.evaluate((element) => ({ client: element.clientWidth, content: element.scrollWidth }));
                    expect(scroll.content, `Responsive records must not pan horizontally at ${width}/${theme}/${locale}`).toBeLessThanOrEqual(scroll.client + 1);
                    for (const [index, expected] of ['Trainee', 'Type', 'Systems', 'Measurements', 'Last activity', 'Actions'].entries()) {
                        const cell = table.locator(`tbody tr:first-child td:nth-child(${index + 1})`);
                        await expect(cell).toHaveAttribute('data-label', locale === 'ar'
                            ? ['المتدرب', 'النوع', 'الأنظمة', 'القياسات', 'آخر نشاط', 'الإجراءات'][index]
                            : expected);
                        expect(await cell.evaluate((element) => getComputedStyle(element, '::before').content), `V2 responsive label should follow the centralized locale at ${width}/${theme}/${locale}`).toContain(locale === 'ar'
                            ? ['المتدرب', 'النوع', 'الأنظمة', 'القياسات', 'آخر نشاط', 'الإجراءات'][index]
                            : expected);
                    }
                    if (width <= 767) {
                        const searchHeight = await section.locator('.coaching-search').evaluate((element) => element.getBoundingClientRect().height);
                        expect(searchHeight, `Search control must not reserve empty vertical space at ${width}/${theme}/${locale}`).toBeLessThanOrEqual(56);
                    }
                    const headerRect = await table.locator('thead th').first().boundingBox();
                    expect(headerRect && (headerRect.x < -1000 || headerRect.x > width + 1000 || headerRect.y < -1000), 'column headings stay visually hidden while retained in the accessibility tree').toBe(true);
                    for (const button of await list.locator('.trainee-actions > button').all()) {
                        const box = await button.boundingBox();
                        if (width <= 767) expect(box?.height, 'mobile action touch target').toBeGreaterThanOrEqual(44);
                        expect(await button.getAttribute('tabindex')).not.toBe('-1');
                    }
                    for (const button of await list.locator('.external-trainee-system-actions > button').all()) {
                        await expect(button).toBeVisible();
                        expect((await button.textContent())?.trim(), 'system action must retain its visible name').toBeTruthy();
                        const box = await button.boundingBox();
                        expect(box?.height, 'system action touch target').toBeGreaterThanOrEqual(44);
                    }
                    const actionBoxes = await list.locator('.trainee-actions > button').evaluateAll((buttons) => buttons.map((button) => {
                        const box = button.getBoundingClientRect();
                        return { x: box.x, y: box.y, right: box.right, bottom: box.bottom };
                    }));
                    for (let first = 0; first < actionBoxes.length; first += 1) {
                        for (let second = first + 1; second < actionBoxes.length; second += 1) {
                            const a = actionBoxes[first];
                            const b = actionBoxes[second];
                            const overlaps = a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y;
                            expect(overlaps, `Coaching action buttons must not overlap at ${width}/${theme}/${locale}`).toBe(false);
                        }
                    }
                } else {
                    await expect(table).toHaveCSS('display', 'table');
                    if (width === 768) {
                        await wrapper.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
                        await expect(list.locator('.trainee-actions [data-coaching-action="diet"]').first()).toBeInViewport();
                        await wrapper.evaluate((element) => { element.scrollLeft = 0; });
                    }
                }

                const geometry = await page.evaluate(() => {
                    const area = document.getElementById('traineesSection');
                    const listElement = document.getElementById('externalTraineesList');
                    const rect = (selector) => {
                        const element = area.querySelector(selector);
                        if (!element) return null;
                        const box = element.getBoundingClientRect();
                        const style = getComputedStyle(element);
                        return { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height), display: style.display, flex: style.flex, position: style.position };
                    };
                    return {
                        viewport: innerWidth,
                        document: document.documentElement.scrollWidth,
                        body: document.body.scrollWidth,
                        section: area.scrollWidth,
                        list: listElement.scrollWidth,
                        locale: document.documentElement.lang,
                        direction: document.documentElement.dir,
                        theme: document.documentElement.dataset.theme,
                        toolbar: rect('.coaching-toolbar'),
                        search: rect('.coaching-search'),
                        searchInput: rect('#externalTraineeSearch'),
                        searchIcon: rect('.coaching-search svg'),
                        toolbarActions: rect('.coaching-toolbar-actions'),
                        refreshButton: rect('#externalTraineeRefreshButton'),
                        traineeList: rect('#externalTraineesList')
                    };
                });
                expect(geometry.document, `document overflow ${width}/${theme}/${locale}`).toBeLessThanOrEqual(width);
                expect(geometry.body, `body overflow ${width}/${theme}/${locale}`).toBeLessThanOrEqual(width);
                expect(geometry.section, `section overflow ${width}/${theme}/${locale}`).toBeLessThanOrEqual(width);
                if (width <= 767) expect(geometry.list, `list overflow ${width}/${theme}/${locale}`).toBeLessThanOrEqual(width);

                const filename = `coaching-mobile-v2-${width}-${theme}-${locale}.png`;
                await section.screenshot({ path: path.join(OUTPUT, filename), animations: 'disabled' });
                captures.push({ ...geometry, filename });
            }
        }
    }

    expect(traineeReads, 'layout, theme and locale changes must not re-fetch trainee data').toEqual(['GET']);
    expect(writes, 'fixture must block all writes').toEqual([]);
    expect(externalRequests.every((entry) => entry.blocked), 'every external request must have been blocked').toBe(true);
    expect(pageErrors, 'page must remain free of uncaught runtime errors').toEqual([]);
    await fs.writeFile(path.join(OUTPUT, 'matrix.json'), JSON.stringify({ captures, writes, externalRequestsBlocked: externalRequests, pageErrors, traineeReads }, null, 2));
    expect(captures).toHaveLength(16);
});
