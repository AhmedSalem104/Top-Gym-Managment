const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');

const WIDTHS = [320, 390, 768, 1024, 1440];
const LOCALES = ['ar', 'en'];
const THEMES = ['light', 'dark'];
const ROOT = path.resolve(process.cwd(), 'qa/artifacts/attendance-v2-surface-visual');

const MEMBERS = [
    {
        id: 98101,
        fullName: 'QA Attendance Member Long Name',
        phone: '+201015819700',
        phoneCountry: 'EG',
        membership: { status: 'active', plan: 'gym_cardio', type: 'monthly', startDate: '2026-10-01', endDate: '2026-10-31', effectiveEndDate: '2026-10-31', amountRemaining: 0 },
        attendance: { checkInAt: '2026-10-13T08:35:00.000Z', checkOutAt: null }
    }
];

async function installReadOnlyFixtures(page) {
    const writes = [];
    const externalRequests = [];

    await page.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== 'http://127.0.0.1:4173') {
            externalRequests.push(url.origin);
            return route.abort('blockedbyclient');
        }
        return route.continue();
    });

    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method().toUpperCase())) {
            writes.push(`${request.method()} ${url.pathname}`);
            return route.fulfill({ status: 405, contentType: 'application/json', body: JSON.stringify({ error: 'Read-only attendance visual fixture.' }) });
        }

        let payload = {};
        if (url.pathname === '/api/auth/session') {
            payload = { authenticated: true, user: { id: 98100, name: 'Attendance Visual QA', role: 'Owner', tenantId: 98100, tenantType: 'gym', permissions: ['attendance.read', 'attendance.check_in', 'attendance.check_out'] } };
        } else if (url.pathname === '/api/saas/entitlements') {
            payload = { tenantStatus: 'active', subscription: { status: 'active', plan: { code: 'qa', name: 'QA' } }, entitlements: { tenantType: 'gym', features: { dashboard: true, members: true, attendance: true, reports: true }, featureCatalog: ['dashboard', 'members', 'attendance', 'reports'].map((key) => ({ key, tenantTypes: ['gym'] })) } };
        } else if (url.pathname === '/api/branding') {
            payload = { branding: { identity: { brandName: 'Attendance Visual QA Gym' }, assets: {} } };
        } else if (url.pathname === '/api/branches/bootstrap' || url.pathname === '/api/bootstrap') {
            payload = { branches: [], activeBranches: [], sections: [], defaultBranch: null };
        } else if (url.pathname === '/api/dashboard') {
            payload = { stats: { total: 0, active: 0, expiringSoon: 0, expired: 0, frozen: 0 }, alerts: [] };
        } else if (url.pathname === '/api/attendance') {
            payload = { date: '2026-10-13', summary: { present: 24, checkedIn: 12, checkedOut: 12 }, records: [
                { memberId: MEMBERS[0].id, memberName: MEMBERS[0].fullName, phone: MEMBERS[0].phone, phoneCountry: 'EG', checkInAt: '2026-10-13T08:35:00.000Z', checkOutAt: null, durationMinutes: null, checkOutSource: null },
                { memberId: 98102, memberName: 'Closed QA Member', phone: '+201011112222', phoneCountry: 'EG', checkInAt: '2026-10-13T06:00:00.000Z', checkOutAt: '2026-10-13T07:15:00.000Z', durationMinutes: 75, checkOutSource: 'auto' }
            ] };
        } else if (url.pathname === '/api/members') {
            payload = { members: MEMBERS };
        } else if (url.pathname === '/api/phone/countries') {
            payload = { fallbackCountry: 'EG', countries: [{ country: 'Egypt', isoCode: 'EG', dialCode: '+20', exampleNational: '01015819700', exampleInternational: '+201015819700', validLengths: [10] }] };
        } else if (url.pathname === '/api/phone/country') {
            payload = { countryCode: 'EG' };
        }

        return route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(payload) });
    });

    return { writes, externalRequests };
}

test('Attendance compact metrics remain readable across V2 viewport, locale and theme matrix', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The desktop project owns the explicit five-width, two-locale and two-theme visual matrix.');
    test.setTimeout(120_000);

    const runtime = await installReadOnlyFixtures(page);
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto('/index.html?attendance-v2-surface-visual#dashboard', { waitUntil: 'domcontentloaded' });
    await page.locator('[data-page-tab="attendance"]').click();
    await expect(page.locator('#attendanceSection')).toBeVisible();
    await expect(page.locator('#attendanceTableWrap tbody tr')).toHaveCount(2);
    await page.addStyleTag({ path: path.join(process.cwd(), 'public/css/pages/attendance.css') });
    await page.evaluate(() => document.fonts.ready);
    await fs.mkdir(ROOT, { recursive: true });

    const matrix = [];
    for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: width <= 390 ? 844 : 1000 });
        for (const locale of LOCALES) {
            await page.evaluate((value) => window.TopGymI18n.set(value, { persist: false }), locale);
            await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
            for (const theme of THEMES) {
                await page.evaluate((mode) => {
                    document.documentElement.dataset.theme = mode;
                    document.body.dataset.theme = mode;
                }, theme);

                const geometry = await page.evaluate(() => {
                    const section = document.querySelector('#attendanceSection');
                    const cards = [...section.querySelectorAll('.attendance-summary-card')];
                    const rect = (element) => {
                        const box = element.getBoundingClientRect();
                        return { left: box.left, right: box.right, width: box.width, height: box.height };
                    };
                    return {
                        viewport: document.documentElement.clientWidth,
                        documentWidth: document.documentElement.scrollWidth,
                        bodyWidth: document.body.scrollWidth,
                        direction: getComputedStyle(section).direction,
                        cards: cards.map((card) => ({ card: rect(card), label: rect(card.querySelector(':scope > span:last-child')), text: card.querySelector(':scope > span:last-child')?.textContent.trim() })),
                        records: section.querySelectorAll('#attendanceTableWrap tbody tr').length
                    };
                });

                matrix.push({ width, locale, theme, ...geometry });
                await page.screenshot({ path: path.join(ROOT, `attendance-${width}-${locale}-${theme}.png`), fullPage: true });
            }
        }
    }

    await fs.writeFile(path.join(ROOT, 'matrix.json'), JSON.stringify(matrix, null, 2));
    await fs.writeFile(path.join(ROOT, 'summary.json'), JSON.stringify({
        project: testInfo.project.name,
        viewports: WIDTHS,
        locales: LOCALES,
        themes: THEMES,
        cases: matrix.length,
        fixture: 'synthetic read-only Owner session; all API writes rejected and none observed',
        externalRequests: runtime.externalRequests,
        browserErrors: pageErrors
    }, null, 2));
    expect(matrix).toHaveLength(WIDTHS.length * LOCALES.length * THEMES.length);
    expect(matrix.every((item) => item.documentWidth <= item.viewport && item.bodyWidth <= item.viewport), 'The page and document must not overflow horizontally.').toBeTruthy();
    expect(matrix.every((item) => item.direction === (item.locale === 'ar' ? 'rtl' : 'ltr'))).toBeTruthy();
    expect(matrix.every((item) => item.records === 2)).toBeTruthy();
    expect(runtime.writes, 'Visual QA fixtures must not perform API writes.').toEqual([]);
    expect(pageErrors).toEqual([]);
    const blockedExternalAllowlist = new Set(['https://cdn.jsdelivr.net', 'https://unpkg.com', 'https://flagcdn.com']);
    expect(runtime.externalRequests.every((origin) => blockedExternalAllowlist.has(origin)), `Unexpected external request: ${runtime.externalRequests.join(', ')}`).toBe(true);
    expect(matrix.every((item) => item.cards.every(({ card, label }) => label.left >= card.left - 1 && label.right <= card.right + 1)), 'Metric labels must wrap within their own cards.').toBeTruthy();
});
