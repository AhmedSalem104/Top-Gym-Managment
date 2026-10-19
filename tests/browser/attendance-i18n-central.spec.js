const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');

const EVIDENCE_DIR = path.resolve(process.cwd(), 'qa/artifacts/attendance-i18n-2026-10-12');
const QR_DIALOG_EVIDENCE_DIR = path.resolve(process.cwd(), 'qa/artifacts/attendance-qr-dialog-i18n-20261014');
const READ_ONLY_MEMBER = {
    id: 49101,
    fullName: 'أحمد QA Member',
    phone: '+201015819700',
    phoneCountry: 'EG',
    membership: {
        status: 'active', plan: 'gym_cardio', type: 'monthly',
        startDate: '2026-10-01', endDate: '2026-10-31', effectiveEndDate: '2026-10-31', amountRemaining: 125
    },
    attendance: { checkInAt: '2026-10-12T08:35:00.000Z', checkOutAt: null }
};

const READ_ONLY_ATTENDANCE = {
    date: '2026-10-12',
    summary: { present: 2, checkedIn: 1, checkedOut: 1 },
    records: [
        {
            memberId: 49101, memberName: 'أحمد QA Member', phone: '+201015819700', phoneCountry: 'EG',
            checkInAt: '2026-10-12T08:35:00.000Z', checkOutAt: null, durationMinutes: null, checkOutSource: null
        },
        {
            memberId: 49102, memberName: 'Member Closed Fixture', phone: '+201011112222', phoneCountry: 'EG',
            checkInAt: '2026-10-12T06:00:00.000Z', checkOutAt: '2026-10-12T07:15:00.000Z', durationMinutes: 75, checkOutSource: 'auto'
        }
    ]
};

async function installReadOnlyFixtures(page) {
    const requests = [];
    const writes = [];
    const external = [];

    await page.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== 'http://127.0.0.1:4173') {
            external.push(url.origin);
            return route.abort('blockedbyclient');
        }
        return route.continue();
    });

    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const method = request.method().toUpperCase();
        requests.push({ method, pathname: url.pathname });
        if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
            writes.push(`${method} ${url.pathname}`);
            return route.fulfill({ status: 405, contentType: 'application/json', body: JSON.stringify({ error: 'Read-only fixture.' }) });
        }

        let payload = {};
        if (url.pathname === '/api/auth/session') {
            payload = { authenticated: true, user: { id: 49100, name: 'Attendance i18n QA', role: 'Owner', tenantId: 49100, tenantType: 'gym', permissions: ['attendance.read', 'attendance.check_in', 'attendance.check_out', 'members.read', 'memberships.read'] } };
        } else if (url.pathname === '/api/saas/entitlements') {
            payload = { tenantStatus: 'active', subscription: { status: 'active', plan: { code: 'qa', name: 'QA' } }, entitlements: { tenantType: 'gym', features: { dashboard: true, members: true, attendance: true, reports: true }, featureCatalog: ['dashboard', 'members', 'attendance', 'reports'].map((key) => ({ key, tenantTypes: ['gym'] })), limits: {} } };
        } else if (url.pathname === '/api/branding') {
            payload = { branding: { identity: { brandName: 'Attendance i18n QA Gym' }, assets: {} } };
        } else if (url.pathname === '/api/dashboard') {
            payload = { stats: { total: 0, active: 0, expiringSoon: 0, expired: 0, frozen: 0 }, alerts: [] };
        } else if (url.pathname === '/api/branches/bootstrap' || url.pathname === '/api/bootstrap') {
            payload = { branches: [], activeBranches: [], sections: [], defaultBranch: null };
        } else if (url.pathname === '/api/phone/countries') {
            payload = { fallbackCountry: 'EG', countries: [{ country: 'Egypt', isoCode: 'EG', dialCode: '+20', exampleNational: '01015819700', exampleInternational: '+201015819700', validLengths: [8, 9, 10], mobileRules: { supported: true, validLengths: [10], nationalPattern: '1[0-25]\\d{8}', localPrefix: '0' } }] };
        } else if (url.pathname === '/api/phone/country') {
            payload = { countryCode: 'EG' };
        } else if (url.pathname === '/api/attendance') {
            payload = READ_ONLY_ATTENDANCE;
        } else if (url.pathname === '/api/members') {
            payload = { members: [READ_ONLY_MEMBER] };
        }

        return route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(payload) });
    });

    return { requests, writes, external };
}

test('Attendance central i18n switches live across RTL/LTR, themes and responsive widths without extra requests', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The desktop project owns the explicit responsive and theme/locale matrix.');
    test.setTimeout(90000);
    await fs.mkdir(EVIDENCE_DIR, { recursive: true });
    await page.addInitScript(() => {
        localStorage.setItem('logic-fit-ui-locale', 'ar');
        localStorage.setItem('topgym-theme', 'light');
    });
    const runtime = await installReadOnlyFixtures(page);
    // The authenticated shell owns a long-lived SSE connection; exclude its
    // independent reconnect from the locale-change data-fetch assertion.
    const dataRequestCount = () => runtime.requests.filter((request) => request.pathname !== '/api/notifications/stream').length;
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.stack || error.message));
    const selectLocale = async (locale) => {
        const button = page.locator(`.topbar-language-toggle [data-locale-choice="${locale}"]`);
        if (!(await button.isVisible())) {
            const menu = page.locator('.topbar-more-menu');
            if (!(await menu.getAttribute('open'))) await menu.locator('summary').click();
        }
        await button.click();
    };
    const toggleTheme = async () => {
        const button = page.locator('#themeToggleButton');
        if (!(await button.isVisible())) {
            const menu = page.locator('.topbar-more-menu');
            if (!(await menu.getAttribute('open'))) await menu.locator('summary').click();
        }
        await button.click();
    };

    await page.goto('/index.html?attendance-central-i18n#dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.TopGymI18n));
    await page.locator('[data-page-tab="attendance"]').click();
    await expect(page.locator('#attendanceSection')).toBeVisible();
    await expect(page.locator('#attendanceTableWrap .attendance-table tbody tr')).toHaveCount(2);
    await expect(page.locator('#attendanceTitle')).toHaveText('الحضور والانصراف');
    await expect(page.locator('#attendanceSection [data-phone-input-help]')).toHaveCount(0);
    await expect(page.locator('#attendancePresentCount')).toHaveText('٢');
    await expect(page.locator('#attendanceTableWrap')).toContainText('أحمد QA Member');
    await expect(page.locator('#attendanceTableWrap')).toContainText('تسجيل انصراف');
    await expect(page.locator('.topbar-language-toggle [data-locale-choice="en"]')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);

    // Resolve the member once using only a synthetic GET fixture, then ensure a
    // locale change re-renders the same member snapshot instead of querying again.
    await page.locator('#attendancePhone').fill('01015819700');
    await expect(page.locator('#attendanceMemberPreview')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#attendanceMemberPreview')).toContainText('أحمد QA Member');
    await expect(page.locator('#attendanceMemberPreview')).toContainText('نشطة');
    const phoneBefore = await page.locator('#attendancePhone').inputValue();
    const hashBefore = new URL(page.url()).hash;
    const mainFrameNavigations = [];
    page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) mainFrameNavigations.push(frame.url()); });

    const beforeToggle = dataRequestCount();
    await selectLocale('en');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.locator('#attendanceTitle')).toHaveText('Attendance');
    await expect(page.locator('#attendanceSection [data-phone-input-help]')).toHaveCount(0);
    await expect(page.locator('#attendanceTableWrap thead')).toContainText('Check-in time');
    await expect(page.locator('#attendanceTableWrap')).toContainText('Inside the gym');
    await expect(page.locator('#attendanceMemberPreview')).toContainText('Active');
    await expect(page.locator('#attendanceMemberPreview')).toContainText('أحمد QA Member');
    expect(await page.locator('#attendanceSection').evaluate((element) => getComputedStyle(element).direction)).toBe('ltr');
    expect(dataRequestCount()).toBe(beforeToggle);
    expect(await page.locator('#attendancePhone').inputValue()).toBe(phoneBefore);
    expect(new URL(page.url()).hash).toBe(hashBefore);
    expect(mainFrameNavigations).toEqual([]);

    // Presentation-only: open the existing native dialog without starting the
    // scanner, requesting camera permission, or invoking an attendance action.
    await fs.mkdir(QR_DIALOG_EVIDENCE_DIR, { recursive: true });
    await page.setViewportSize({ width: 390, height: 844 });
    const qrDialog = page.locator('#qrReaderDialog');
    await page.evaluate(() => document.querySelector('#qrReaderDialog').showModal());
    const qrReader = qrDialog.locator('#qrReader');
    const generatedQrClose = qrDialog.locator('[data-dialog-close]');
    await expect(qrDialog.locator('[data-i18n="attendance.qr.reader.title"]')).toHaveText('Scan QR Code');
    await expect(qrDialog.locator('[data-i18n="attendance.qr.reader.description"]')).toHaveText('Point your phone camera at the member’s code.');
    await expect(qrDialog.locator('[data-i18n="attendance.qr.reader.note"]')).toHaveText('If the camera does not work, close this dialog and record attendance by phone number.');
    await expect(qrDialog.locator('#qrReaderClose')).toHaveText('Close');
    await expect(generatedQrClose).toHaveAttribute('aria-label', 'Close dialog');
    await expect.poll(async () => (await qrReader.boundingBox())?.height || 0).toBeGreaterThan(200);
    expect((await qrDialog.boundingBox())?.height || 0, 'Light QR dialog must retain its actual scanner viewport').toBeGreaterThan(380);
    await page.screenshot({ path: path.join(QR_DIALOG_EVIDENCE_DIR, 'qr-dialog-390-en-light.png') });
    const qrDialogReadCount = dataRequestCount();
    // A native modal makes the background (including the header switcher)
    // inert. Exercise the same centralized locale event directly while the
    // dialog is open; the switcher itself is tested in the normal page flow.
    await page.evaluate(() => window.TopGymI18n.set('ar', { persist: false }));
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(qrDialog.locator('[data-i18n="attendance.qr.reader.title"]')).toHaveText('مسح QR Code');
    await expect(qrDialog.locator('[data-i18n="attendance.qr.reader.description"]')).toHaveText('وجّه كاميرا الهاتف إلى رمز العضو.');
    await expect(qrDialog.locator('[data-i18n="attendance.qr.reader.note"]')).toHaveText('إذا لم تعمل الكاميرا، أغلق النافذة وسجّل الحضور برقم الهاتف.');
    await expect(qrDialog.locator('#qrReaderClose')).toHaveText('إغلاق');
    await expect(generatedQrClose).toHaveAttribute('aria-label', 'إغلاق النافذة');
    expect(await qrDialog.evaluate((element) => getComputedStyle(element).direction)).toBe('rtl');
    expect(dataRequestCount()).toBe(qrDialogReadCount);
    await expect.poll(async () => (await qrReader.boundingBox())?.height || 0).toBeGreaterThan(200);
    expect((await qrDialog.boundingBox())?.height || 0, 'Light QR dialog must retain its actual scanner viewport after locale change').toBeGreaterThan(380);
    await page.screenshot({ path: path.join(QR_DIALOG_EVIDENCE_DIR, 'qr-dialog-390-ar-light.png') });
    await generatedQrClose.click();
    await expect(qrDialog).not.toBeVisible();

    // Verify the same localized dialog surface in Dark without interacting
    // with the inert header while it is modal.
    await toggleTheme();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.evaluate(() => document.querySelector('#qrReaderDialog').showModal());
    await expect(qrDialog.locator('[data-i18n="attendance.qr.reader.title"]')).toHaveText('مسح QR Code');
    await expect.poll(async () => (await qrReader.boundingBox())?.height || 0).toBeGreaterThan(200);
    await page.screenshot({ path: path.join(QR_DIALOG_EVIDENCE_DIR, 'qr-dialog-390-ar-dark.png') });
    await page.evaluate(() => window.TopGymI18n.set('en', { persist: false }));
    await expect(qrDialog.locator('[data-i18n="attendance.qr.reader.title"]')).toHaveText('Scan QR Code');
    await expect(generatedQrClose).toHaveAttribute('aria-label', 'Close dialog');
    await expect.poll(async () => (await qrReader.boundingBox())?.height || 0).toBeGreaterThan(200);
    await page.screenshot({ path: path.join(QR_DIALOG_EVIDENCE_DIR, 'qr-dialog-390-en-dark.png') });
    await generatedQrClose.click();
    await expect(qrDialog).not.toBeVisible();
    await toggleTheme();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    // The filter keeps its machine value while its option label changes.
    await page.locator('#attendanceStatusFilter').selectOption('checked_out');
    await expect(page.locator('#attendanceTableWrap tbody tr')).toHaveCount(1);
    await expect(page.locator('#attendanceTableWrap')).toContainText('Automatically checked out');
    const selectedFilter = await page.locator('#attendanceStatusFilter').inputValue();
    const requestCountBeforeLiveSwitch = dataRequestCount();
    await page.evaluate(() => window.TopGymI18n.set('ar'));
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.locator('#attendanceTableWrap')).toContainText('انصرف تلقائيًا');
    await expect(page.locator('#attendanceSection [data-phone-input-help]')).toHaveCount(0);
    expect(await page.locator('#attendanceStatusFilter').inputValue()).toBe(selectedFilter);
    expect(dataRequestCount()).toBe(requestCountBeforeLiveSwitch);
    expect(await page.locator('#attendancePhone').inputValue()).toBe(phoneBefore);
    await page.locator('#attendanceStatusFilter').selectOption('all');

    const viewportMatrix = [320, 390, 768, 1440];
    const screenshotWidths = new Set([390, 1440]);
    for (const width of viewportMatrix) {
        await page.setViewportSize({ width, height: width <= 390 ? 844 : 1000 });
        await page.waitForTimeout(150);
        for (const locale of ['ar', 'en']) {
            if (await page.evaluate(() => window.TopGymI18n.get()) !== locale) {
                const requestCount = dataRequestCount();
                await page.evaluate((value) => window.TopGymI18n.set(value), locale);
                await expect(page.locator('html')).toHaveAttribute('lang', locale);
                expect(dataRequestCount(), JSON.stringify(runtime.requests)).toBe(requestCount);
            }
            for (const theme of ['light', 'dark']) {
                if (await page.evaluate(() => document.documentElement.dataset.theme) !== theme) {
                    await toggleTheme();
                    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
                }
                const layout = await page.evaluate(() => ({
                    documentWidth: document.documentElement.scrollWidth,
                    bodyWidth: document.body.scrollWidth,
                    viewport: document.documentElement.clientWidth,
                    direction: getComputedStyle(document.querySelector('#attendanceSection')).direction,
                    title: document.querySelector('#attendanceTitle').textContent.trim(),
                    phonePlaceholder: document.querySelector('#attendancePhone').placeholder,
                    memberName: document.querySelector('#attendanceMemberPreview .attendance-preview-member strong')?.textContent.trim() || ''
                }));
                expect(layout.documentWidth, `${width}px ${locale}/${theme} document overflow`).toBeLessThanOrEqual(layout.viewport + 1);
                expect(layout.bodyWidth, `${width}px ${locale}/${theme} body overflow`).toBeLessThanOrEqual(layout.viewport + 1);
                expect(layout.direction).toBe(locale === 'ar' ? 'rtl' : 'ltr');
                expect(layout.title).toBe(locale === 'ar' ? 'الحضور والانصراف' : 'Attendance');
                expect(layout.memberName).toBe('أحمد QA Member');
                if (locale === 'en') expect(layout.phonePlaceholder).toBe('e.g. 01015819700');
                await page.evaluate(() => document.fonts.ready);
                if (screenshotWidths.has(width)) {
                    await page.screenshot({ path: path.join(EVIDENCE_DIR, `attendance-${width}-${locale}-${theme}.png`), fullPage: true });
                }
            }
        }
    }

    expect(runtime.writes, 'The focused attendance i18n test must not issue a mutating API request.').toEqual([]);
    expect(pageErrors, 'No uncaught browser errors are expected.').toEqual([]);
    expect(runtime.external.every((origin) => ['https://cdn.jsdelivr.net', 'https://unpkg.com', 'https://flagcdn.com'].includes(origin)), `Unexpected external request: ${runtime.external.join(', ')}`).toBe(true);
    await fs.writeFile(path.join(EVIDENCE_DIR, 'summary.json'), JSON.stringify({
        project: testInfo.project.name,
        viewports: viewportMatrix,
        locales: ['ar', 'en'],
        themes: ['light', 'dark'],
        screenshotCount: screenshotWidths.size * 4,
        apiRequestCount: runtime.requests.length,
        apiWrites: runtime.writes,
        frameNavigations: mainFrameNavigations,
        externalRequests: runtime.external
    }, null, 2));
});
