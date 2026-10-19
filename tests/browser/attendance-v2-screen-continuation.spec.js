const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');

const WIDTHS = [320, 375, 390, 768, 1024, 1440, 1920];
const LOCALES = ['ar', 'en'];
const THEMES = ['light', 'dark'];
const EVIDENCE_DIR = path.resolve(process.cwd(), process.env.ATTENDANCE_EVIDENCE_DIR || 'qa/artifacts/attendance-visual-gate-2026-10-13');

const MEMBERS = [
    {
        memberId: 99121,
        memberName: 'محمد عبد الرحمن عضو تجريبي للاسم الطويل',
        phone: '+201015819700',
        phoneCountry: 'EG',
        checkInAt: '2026-10-13T08:35:00.000Z',
        checkOutAt: null,
        durationMinutes: null,
        checkOutSource: null
    },
    {
        memberId: 99122,
        memberName: 'QA Member With a Deliberately Long English Name',
        phone: '+201011112222',
        phoneCountry: 'EG',
        checkInAt: '2026-10-13T06:00:00.000Z',
        checkOutAt: '2026-10-13T07:15:00.000Z',
        durationMinutes: 75,
        checkOutSource: 'auto'
    }
];

const MEMBER_PREVIEW = {
    id: 99121,
    fullName: MEMBERS[0].memberName,
    phone: MEMBERS[0].phone,
    phoneCountry: 'EG',
    membership: {
        status: 'active', plan: 'gym_cardio', type: 'monthly',
        startDate: '2026-10-01', endDate: '2026-10-31', effectiveEndDate: '2026-10-31', amountRemaining: 0
    },
    attendance: { checkInAt: null, checkOutAt: null }
};

function attendancePayload(records = MEMBERS) {
    return {
        date: '2026-10-13',
        summary: { present: records.length, checkedIn: records.filter((record) => !record.checkOutAt).length, checkedOut: records.filter((record) => Boolean(record.checkOutAt)).length },
        records
    };
}

async function installReadOnlyAttendanceFixture(page) {
    const writes = [];
    const externalRequests = [];
    const requests = [];
    let attendanceMode = 'empty';
    let authProfile = 'owner';
    let pendingAttendanceReleases = [];

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
        const pathname = url.pathname;
        const method = request.method().toUpperCase();
        requests.push({ method, pathname });
        if (pathname.endsWith('/stream')) {
            return route.fulfill({ status: 200, contentType: 'text/event-stream; charset=utf-8', body: ': read-only visual fixture\n\n' });
        }
        if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
            writes.push(`${method} ${pathname}`);
            return route.fulfill({
                status: 405,
                contentType: 'application/json; charset=utf-8',
                body: JSON.stringify({ error: 'Read-only attendance visual fixture.' })
            });
        }

        let payload = {};
        let status = 200;
        if (pathname === '/api/auth/session') {
            const isAssistant = authProfile === 'assistant-read-only';
            payload = {
                authenticated: true,
                user: {
                    id: isAssistant ? 99130 : 99120,
                    name: isAssistant ? 'Attendance Read-only QA' : 'Attendance V2 QA',
                    role: isAssistant ? 'Assistant' : 'Owner',
                    tenantId: 99120,
                    tenantType: 'gym',
                    permissions: isAssistant
                        ? ['attendance.read', 'members.read', 'memberships.read']
                        : ['attendance.read', 'attendance.check_in', 'attendance.check_out', 'members.read', 'memberships.read']
                }
            };
        } else if (pathname === '/api/saas/entitlements') {
            payload = {
                tenantStatus: 'active',
                subscription: { status: 'active', plan: { code: 'qa', name: 'QA' } },
                entitlements: {
                    tenantType: 'gym',
                    features: { dashboard: true, members: true, attendance: true, reports: true },
                    featureCatalog: ['dashboard', 'members', 'attendance', 'reports'].map((key) => ({ key, tenantTypes: ['gym'] }))
                }
            };
        } else if (pathname === '/api/branding') {
            payload = { branding: { identity: { brandName: 'Attendance V2 QA Gym' }, assets: {} } };
        } else if (pathname === '/api/dashboard') {
            payload = { stats: { total: 0, active: 0, expiringSoon: 0, expired: 0, frozen: 0 }, alerts: [] };
        } else if (pathname === '/api/branches/bootstrap' || pathname === '/api/bootstrap') {
            const qaBranch = { id: 99140, name: 'QA Main Branch', code: 'QA-MAIN', status: 'active', isMain: true };
            payload = {
                branches: [qaBranch], activeBranches: [qaBranch],
                sections: [{ id: 99141, branchId: 99140, name: 'General Fitness', active: true }],
                defaultBranch: qaBranch, hasMultipleActiveBranches: false
            };
        } else if (pathname === '/api/attendance') {
            if (attendanceMode === 'loading') {
                await new Promise((resolve) => pendingAttendanceReleases.push(resolve));
                payload = attendancePayload();
            } else if (attendanceMode === 'error') {
                status = 503;
                payload = { error: 'تعذر تحميل سجل الحضور مؤقتًا.' };
            } else if (attendanceMode === 'records') {
                payload = attendancePayload();
            } else {
                payload = attendancePayload([]);
            }
        } else if (pathname === '/api/members') {
            payload = { members: [MEMBER_PREVIEW] };
        } else if (pathname === '/api/phone/countries') {
            payload = {
                fallbackCountry: 'EG',
                countries: [{ country: 'Egypt', isoCode: 'EG', dialCode: '+20', exampleNational: '01015819700', exampleInternational: '+201015819700', validLengths: [8, 9, 10], mobileRules: { supported: true, validLengths: [10], nationalPattern: '1[0-25]\\d{8}', localPrefix: '0' } }]
            };
        } else if (pathname === '/api/phone/country') {
            payload = { countryCode: 'EG' };
        }

        return route.fulfill({ status, contentType: 'application/json; charset=utf-8', body: JSON.stringify(payload) });
    });

    return {
        writes,
        externalRequests,
        requests,
        setAttendanceMode(mode) { attendanceMode = mode; },
        setAuthProfile(profile) { authProfile = profile; },
        releaseAttendanceLoads() {
            const releases = pendingAttendanceReleases;
            pendingAttendanceReleases = [];
            releases.forEach((release) => release());
            return releases.length;
        }
    };
}

async function selectLocale(page, locale) {
    if (await page.evaluate(() => window.TopGymI18n?.get?.()) !== locale) {
        await page.evaluate((nextLocale) => window.TopGymI18n.set(nextLocale), locale);
        await expect(page.locator('html')).toHaveAttribute('lang', locale);
    }
    await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
}

async function selectTheme(page, theme) {
    if (await page.locator('html').getAttribute('data-theme') !== theme) {
        await page.locator('#themeToggleButton').click();
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    }
}

async function refreshAttendance(page) {
    await page.locator('#attendanceRefreshButton').click();
}

async function collectScreenGeometry(page) {
    return page.evaluate(() => {
        const section = document.querySelector('#attendanceSection');
        const rect = (element) => {
            const box = element.getBoundingClientRect();
            return {
                left: Math.round(box.left), right: Math.round(box.right), top: Math.round(box.top), bottom: Math.round(box.bottom),
                width: Math.round(box.width), height: Math.round(box.height)
            };
        };
        const wrapper = section.querySelector('#attendanceTableWrap');
        const table = wrapper.querySelector('.attendance-table');
        const row = table?.querySelector('tbody tr');
        const completionStatus = table?.querySelector('.attendance-action-done.auto');
        const statusBadge = table?.querySelector('.attendance-status.complete');
        return {
            viewport: document.documentElement.clientWidth,
            documentWidth: document.documentElement.scrollWidth,
            bodyWidth: document.body.scrollWidth,
            direction: getComputedStyle(section).direction,
            theme: document.documentElement.dataset.theme,
            locale: document.documentElement.lang,
            section: rect(section),
            branchContext: {
                shell: rect(document.querySelector('#branchContextShell')),
                hidden: document.querySelector('#branchContextShell')?.hidden ?? true,
                branch: document.querySelector('#branchContextSelect')?.selectedOptions[0]?.textContent?.trim() || '',
                section: document.querySelector('#sectionContextSelect')?.selectedOptions[0]?.textContent?.trim() || '',
                branchValue: rect(document.querySelector('[data-context-field="branch"] .branch-context-trigger')),
            sectionValue: rect(document.querySelector('[data-context-field="section"] .branch-context-trigger')),
            branchLabel: document.querySelector('[data-context-field="branch"] .branch-context-field-copy small')?.textContent.trim() || '',
            sectionLabel: document.querySelector('[data-context-field="section"] .branch-context-field-copy small')?.textContent.trim() || ''
            },
            header: rect(section.querySelector('.attendance-header')),
            entryWorkspace: rect(section.querySelector('.attendance-entry-workspace')),
            entrySurface: rect(section.querySelector('.attendance-entry-card')),
            phoneMode: rect(section.querySelector('#attendancePhoneModeButton')),
            qrMode: rect(section.querySelector('#attendanceScanButton')),
            qrSelected: section.querySelector('#attendanceScanButton')?.getAttribute('aria-selected') === 'true',
            memberSurface: rect(section.querySelector('.attendance-member-context')),
            metrics: [...section.querySelectorAll('.attendance-summary-card')].map((card) => ({ ...rect(card), label: rect(card.querySelector('span:last-child')) })),
            listHeader: rect(section.querySelector('.attendance-list-head')),
            tableWrapper: rect(wrapper),
            table: table ? rect(table) : null,
            row: row ? rect(row) : null,
            memberName: row?.querySelector('.attendance-member-name') ? rect(row.querySelector('.attendance-member-name')) : null,
            cells: row ? [...row.cells].map(rect) : [],
            action: row?.querySelector('.attendance-checkout-button') ? rect(row.querySelector('.attendance-checkout-button')) : null,
            completionStatus: completionStatus ? rect(completionStatus) : null,
            completionStatusCell: completionStatus?.parentElement ? rect(completionStatus.parentElement) : null,
            statusBadge: statusBadge ? rect(statusBadge) : null,
            statusBadgeCell: statusBadge?.parentElement ? rect(statusBadge.parentElement) : null,
            listMeta: {
                text: section.querySelector('#attendanceListMeta')?.textContent.trim() || '',
                loadingKey: section.querySelector('#attendanceListMeta')?.dataset.i18n === 'attendance.log.loading'
            },
            phoneHelperCount: section.querySelectorAll('.phone-input-help').length,
            mobileTableMode: table ? getComputedStyle(table).display === 'block' : false,
            focusRing: (() => {
                const element = section.querySelector('#attendanceStatusFilter');
                const style = getComputedStyle(element);
                return element.matches(':focus-visible') && (style.outlineStyle !== 'none' || style.boxShadow !== 'none');
            })(),
            visibleCopy: {
                title: section.querySelector('#attendanceTitle').textContent.trim(),
                modeLabel: section.querySelector('#attendancePhoneModeButton').textContent.trim(),
                summary: [...section.querySelectorAll('.attendance-summary-card > span:last-child')].map((element) => element.textContent.trim()),
                tableHeaders: [...section.querySelectorAll('.attendance-table thead th')].map((element) => element.textContent.trim())
            }
        };
    });
}

test.describe('Attendance V2 whole-screen visual gate (synthetic read-only fixtures)', () => {
    test('QR dialog copy follows Arabic and English while open without starting a real camera', async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== 'desktop', 'The desktop project owns the focused QR locale check.');
        test.setTimeout(60000);
        const evidenceDir = path.resolve(process.cwd(), 'qa/artifacts/attendance-qr-dialog-i18n-2026-10-14');
        await fs.mkdir(evidenceDir, { recursive: true });
        await page.addInitScript(() => {
            localStorage.setItem('logic-fit-ui-locale', 'ar');
            localStorage.setItem('topgym-theme', 'light');
        });
        const runtime = await installReadOnlyAttendanceFixture(page);
        const pageErrors = [];
        page.on('pageerror', (error) => pageErrors.push(error.stack || error.message));

        await page.goto('/index.html?attendance-qr-i18n#dashboard', { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => Boolean(window.TopGymI18n));
        await page.locator('[data-page-tab="attendance"]').click();
        await expect(page.locator('#attendanceSection')).toBeVisible();
        await page.waitForFunction(() => Boolean(window.topGymAttendance));
        await page.evaluate(() => window.topGymAttendance.loadAttendance({ force: true }));
        await expect(page.locator('#attendanceTableWrap .attendance-empty')).toBeVisible();
        await page.evaluate(() => {
            window.topGymLoadExternalAsset = async () => {};
            window.Html5Qrcode = class ReadOnlyVisualScanner {
                async start() { return undefined; }
                async stop() { return undefined; }
                clear() {}
            };
        });

        const expectedCopy = {
            en: {
                title: 'Scan QR Code',
                description: 'Point your phone camera at the member’s code.',
                close: 'Close',
                note: 'If the camera does not work, close this dialog and record attendance by phone number.'
            },
            ar: {
                title: 'مسح QR Code',
                description: 'وجّه كاميرا الهاتف إلى رمز العضو.',
                close: 'إغلاق',
                note: 'إذا لم تعمل الكاميرا، أغلق النافذة وسجّل الحضور برقم الهاتف.'
            }
        };
        for (const view of [
            { width: 390, locale: 'en', theme: 'light' },
            { width: 1440, locale: 'ar', theme: 'dark' }
        ]) {
            await page.setViewportSize({ width: view.width, height: view.width < 500 ? 844 : 1000 });
            await selectLocale(page, view.locale);
            await selectTheme(page, view.theme);
            await page.locator('#attendanceScanButton').click();
            const dialog = page.locator('#qrReaderDialog');
            await expect(dialog).toBeVisible();
            const assertCopy = async (locale) => {
                const expected = expectedCopy[locale];
                await expect(dialog.locator('h3')).toHaveText(expected.title);
                await expect(dialog.locator('.details-dialog-head p')).toHaveText(expected.description);
                await expect(dialog.locator('#qrReaderClose')).toHaveText(expected.close);
                await expect(dialog.locator('.qr-reader-note')).toHaveText(expected.note);
                const visibleText = await dialog.innerText();
                if (locale === 'en') expect(visibleText).not.toMatch(/\p{Script=Arabic}/u);
                else expect(visibleText).toMatch(/\p{Script=Arabic}/u);
            };
            await assertCopy(view.locale);
            await page.screenshot({ path: path.join(evidenceDir, `attendance-${view.width}-${view.locale}-${view.theme}-qr-dialog.png`), fullPage: true });

            const otherLocale = view.locale === 'en' ? 'ar' : 'en';
            await selectLocale(page, otherLocale);
            await assertCopy(otherLocale);
            await selectLocale(page, view.locale);
            await assertCopy(view.locale);
            await dialog.locator('[data-dialog-close-generated]').click();
            await expect(dialog).toBeHidden();
        }
        expect(runtime.writes, 'QR dialog localization must not write attendance data.').toEqual([]);
        expect(
            runtime.externalRequests.every((origin) => ['https://cdn.jsdelivr.net', 'https://unpkg.com', 'https://flagcdn.com'].includes(origin)),
            `QR fixture must not load an unapproved external resource: ${runtime.externalRequests.join(', ')}`
        ).toBe(true);
        expect(pageErrors).toEqual([]);
        await fs.writeFile(path.join(evidenceDir, 'summary.json'), JSON.stringify({
            screen: 'Attendance QR reader dialog',
            evidenceType: 'synthetic, API-intercepted, read-only browser presentation QA',
            cases: [
                { width: 390, locale: 'en', theme: 'light' },
                { width: 1440, locale: 'ar', theme: 'dark' }
            ],
            localeSwitchWhileOpen: true,
            realCameraOrExternalScanner: false,
            apiWrites: runtime.writes,
            externalRequests: runtime.externalRequests,
            pageErrors
        }, null, 2));
    });

    test('covers complete screen at all required viewports, locales and themes plus real UI states', async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== 'desktop', 'The desktop project owns the explicit seven-width, two-locale and two-theme matrix.');
        test.setTimeout(180_000);

        const runtime = await installReadOnlyAttendanceFixture(page);
        const pageErrors = [];
        const consoleErrors = [];
        page.on('pageerror', (error) => pageErrors.push(error.message));
        page.on('console', (message) => {
            if (message.type() === 'error' && !message.text().includes('ERR_BLOCKED_BY_CLIENT')) consoleErrors.push(message.text());
        });
        await page.addInitScript(() => {
            localStorage.setItem('logic-fit-ui-locale', 'ar');
            localStorage.setItem('topgym-theme', 'light');
        });

        await fs.mkdir(EVIDENCE_DIR, { recursive: true });
        await page.goto('/index.html?attendance-v2-visual#dashboard', { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => Boolean(window.TopGymI18n?.set));
        await expect(page.locator('#themeToggleButton')).toBeVisible();
        await page.locator('[data-page-tab="attendance"]').click();
        await expect(page.locator('#attendanceSection')).toBeVisible();
        await expect(page.locator('#branchContextShell')).toBeVisible();
        await page.waitForFunction(() => [...document.styleSheets].some((sheet) => sheet.href?.includes('/css/pages/attendance.css')));
        await expect(page.locator('#attendanceTitle')).toBeVisible();
        await expect(page.locator('#attendanceTableWrap .attendance-empty')).toBeVisible({ timeout: 15000 });
        await page.evaluate(() => document.fonts.ready);

        runtime.setAttendanceMode('records');
        await refreshAttendance(page);
        await expect(page.locator('#attendanceTableWrap .attendance-table tbody tr')).toHaveCount(2);
        await expect(page.locator('#attendanceCheckInButton')).toBeHidden();

        const matrix = [];
        const observedData = [];
        const visualGaps = [];
        const qrModalStates = [];
        const screenshotAll = testInfo.project.name === 'desktop';
        for (const width of WIDTHS) {
            await page.setViewportSize({ width, height: width <= 390 ? 844 : 1000 });
            for (const locale of LOCALES) {
                await selectLocale(page, locale);
                for (const theme of THEMES) {
                    await selectTheme(page, theme);
                    await page.evaluate(() => document.fonts.ready);
                    await expect(page.locator('#attendanceTitle')).toHaveText(locale === 'ar' ? 'الحضور والانصراف' : 'Attendance');
                    await expect(page.locator('#attendanceTableWrap tbody tr')).toHaveCount(2);
                    await expect(page.locator('.attendance-mode-actions')).toHaveCSS('display', 'flex');

                    const geometry = await collectScreenGeometry(page);
                    if (/loading today|جارٍ تحميل سجل الحضور/i.test(geometry.listMeta.text)) {
                        visualGaps.push({
                            width,
                            locale,
                            theme,
                            issue: 'attendance-list-meta-reverts-to-loading-copy-after-locale-switch',
                            observedText: geometry.listMeta.text,
                            staleI18nKey: geometry.listMeta.loadingKey
                        });
                    }
                    const nameTexts = await page.locator('#attendanceTableWrap .attendance-member-name').allTextContents();
                    observedData.push({ width, locale, theme, names: nameTexts, countText: await page.locator('#attendancePresentCount').textContent() });
                    expect(geometry.documentWidth, `${width}/${locale}/${theme}: document overflow`).toBeLessThanOrEqual(width + 1);
                    expect(geometry.bodyWidth, `${width}/${locale}/${theme}: body overflow`).toBeLessThanOrEqual(width + 1);
                    expect(geometry.direction).toBe(locale === 'ar' ? 'rtl' : 'ltr');
                    expect(geometry.locale).toBe(locale);
                    expect(geometry.theme).toBe(theme);
                    expect(geometry.phoneHelperCount, `${width}/${locale}/${theme}: the shared phone field must not render a helper row`).toBe(0);
                    expect(geometry.section.width).toBeGreaterThan(0);
                    expect(geometry.branchContext.hidden, `${width}/${locale}/${theme}: branch context should be represented for the authorized synthetic tenant`).toBe(false);
                    expect(geometry.branchContext.branch).toBe('QA Main Branch');
                    expect(geometry.branchContext.section).toBe(locale === 'ar' ? 'كل الأقسام' : 'All sections');
                    if (locale === 'en' && /\p{Script=Arabic}/u.test(`${geometry.branchContext.branchLabel} ${geometry.branchContext.sectionLabel}`)) {
                        visualGaps.push({ width, locale, theme, issue: 'branch-context-labels-remain-arabic-in-english-locale', observedText: `${geometry.branchContext.branchLabel} / ${geometry.branchContext.sectionLabel}` });
                    }
                    expect(geometry.branchContext.branchValue.width).toBeGreaterThan(0);
                    expect(geometry.branchContext.sectionValue.width).toBeGreaterThan(0);
                    expect(geometry.branchContext.shell.left).toBeGreaterThanOrEqual(-1);
                    expect(geometry.branchContext.shell.right).toBeLessThanOrEqual(width + 1);
                    expect(geometry.header.width).toBeGreaterThan(0);
                    expect(geometry.entrySurface.width).toBeGreaterThan(0);
                    expect(geometry.phoneMode.width).toBeGreaterThan(0);
                    expect(geometry.qrMode.width).toBeGreaterThan(0);
                    expect(geometry.phoneMode.right <= geometry.qrMode.left || geometry.qrMode.right <= geometry.phoneMode.left,
                        `${width}/${locale}/${theme}: phone and QR mode controls overlap`).toBeTruthy();
                    expect(geometry.qrSelected, `${width}/${locale}/${theme}: visual-only QA must not start the QR scanner or alter its current mode`).toBe(false);
                    expect(geometry.memberSurface.width).toBeGreaterThan(0);
                    expect(geometry.listHeader.width).toBeGreaterThan(0);
                    expect(geometry.metrics).toHaveLength(3);
                    expect(geometry.metrics.every(({ left, right, width: cardWidth, height, label }) => cardWidth > 0 && height >= 80 && left >= -1 && right <= width + 1 && label.width > 0 && label.height > 0), `${width}/${locale}/${theme}: metric layout ${JSON.stringify(geometry.metrics)}`).toBeTruthy();
                    expect(nameTexts).toEqual([MEMBERS[0].memberName, MEMBERS[1].memberName]);
                    expect(geometry.visibleCopy.tableHeaders).toEqual(locale === 'ar'
                        ? ['العضو', 'الهاتف', 'وقت الدخول', 'وقت الخروج', 'المدة', 'الحالة', 'الإجراء']
                        : ['Member', 'Phone', 'Check-in time', 'Check-out time', 'Duration', 'Status', 'Action']);

                    if (width <= 390) {
                        expect(geometry.mobileTableMode, `${width}/${locale}/${theme}: expected mobile card table presentation`).toBeTruthy();
                        expect(geometry.tableWrapper.left).toBeGreaterThanOrEqual(-1);
                        expect(geometry.tableWrapper.right).toBeLessThanOrEqual(width + 1);
                        expect(geometry.row.left).toBeGreaterThanOrEqual(geometry.tableWrapper.left - 1);
                        expect(geometry.row.right).toBeLessThanOrEqual(geometry.tableWrapper.right + 1);
                        expect(geometry.cells).toHaveLength(7);
                        expect(geometry.action.height, `${width}/${locale}/${theme}: row action touch target`).toBeGreaterThanOrEqual(44);
                        const phoneLayout = await page.locator('.attendance-section .phone-input-control[data-phone-control]').evaluate((control) => {
                            const wrapper = control.getBoundingClientRect();
                            const phone = control.querySelector('.phone-number-control')?.getBoundingClientRect();
                            return { wrapperHeight: wrapper.height, phoneHeight: phone?.height || 0, helperCount: control.querySelectorAll('.phone-input-help').length };
                        });
                        expect(phoneLayout.helperCount, `${width}/${locale}/${theme}: removed helper text must not be recreated`).toBe(0);
                        expect(Math.abs(phoneLayout.wrapperHeight - phoneLayout.phoneHeight), `${width}/${locale}/${theme}: an idle phone control must occupy only the input height`).toBeLessThanOrEqual(1);
                        const touchTargets = await page.locator([
                            '#attendancePhoneModeButton', '#attendanceScanButton', '#attendancePhone',
                            '.attendance-member-search-button', '#attendanceSearch', '#attendanceStatusFilter',
                            '#attendanceRefreshButton', '#attendanceKioskButton', '.attendance-checkout-button'
                        ].join(',')).evaluateAll((elements) => elements.filter((element) => !element.hidden && element.getClientRects().length).map((element) => {
                            const box = element.getBoundingClientRect();
                            return { id: element.id || element.className, width: box.width, height: box.height };
                        }));
                        expect(touchTargets.every((target) => target.width >= 44 && target.height >= 44), `${width}/${locale}/${theme}: undersized touch controls ${JSON.stringify(touchTargets.filter((target) => target.width < 44 || target.height < 44))}`).toBeTruthy();
                        if (geometry.completionStatus && (geometry.completionStatus.left < geometry.completionStatusCell.left - 1 || geometry.completionStatus.right > geometry.completionStatusCell.right + 1)) {
                            visualGaps.push({ width, locale, theme, issue: 'auto-checkout-status-overflows-mobile-action-cell', status: geometry.completionStatus, cell: geometry.completionStatusCell });
                        }
                        if (geometry.statusBadge && (geometry.statusBadge.left < geometry.statusBadgeCell.left - 1 || geometry.statusBadge.right > geometry.statusBadgeCell.right + 1)) {
                            visualGaps.push({ width, locale, theme, issue: 'attendance-status-badge-overflows-mobile-status-cell', status: geometry.statusBadge, cell: geometry.statusBadgeCell });
                        }
                    }
                    if (width > 390 && width < 1200) {
                        const wrapperOverflow = await page.locator('#attendanceTableWrap').evaluate((element) => getComputedStyle(element).overflowX);
                        expect(['auto', 'scroll']).toContain(wrapperOverflow);
                        expect(geometry.tableWrapper.left).toBeGreaterThanOrEqual(geometry.section.left - 1);
                        expect(geometry.tableWrapper.right).toBeLessThanOrEqual(geometry.section.right + 1);
                    }

                    if (width === 320 && locale === 'en' && theme === 'dark') {
                        await page.locator('#attendanceSearch').focus();
                        await page.keyboard.press('Tab');
                        await expect(page.locator('#attendanceStatusFilter')).toBeFocused();
                        const focusGeometry = await collectScreenGeometry(page);
                        expect(focusGeometry.focusRing, 'The attendance status filter must show a keyboard focus indicator.').toBeTruthy();
                    }

                    matrix.push({ width, locale, theme, state: 'records', ...geometry });
                    if (screenshotAll || [320, 375, 390, 768, 1024, 1440, 1920].includes(width)) {
                        await page.evaluate(() => window.scrollTo(0, 0));
                        await page.screenshot({ path: path.join(EVIDENCE_DIR, `attendance-${width}-${locale}-${theme}-records.png`), fullPage: true });
                    }
                }
            }
        }

        // Open only the scanner dialog using an in-memory no-camera stub. No QR
        // is decoded and no check-in/check-out path or mutating API is invoked.
        for (const qrView of [
            { width: 390, locale: 'en', theme: 'light' },
            { width: 1440, locale: 'ar', theme: 'dark' }
        ]) {
            await page.setViewportSize({ width: qrView.width, height: qrView.width < 500 ? 844 : 1000 });
            await selectLocale(page, qrView.locale);
            await selectTheme(page, qrView.theme);
            await page.evaluate(() => {
                window.topGymLoadExternalAsset = async () => {};
                window.Html5Qrcode = class ReadOnlyVisualScanner {
                    async start() { return undefined; }
                    async stop() { return undefined; }
                    clear() {}
                };
            });
            await page.locator('#attendanceScanButton').click();
            await expect(page.locator('#qrReaderDialog')).toBeVisible();
            const qrDialog = await page.locator('#qrReaderDialog').evaluate((dialog) => {
                const box = dialog.getBoundingClientRect();
                return {
                    left: Math.round(box.left), right: Math.round(box.right), top: Math.round(box.top), bottom: Math.round(box.bottom),
                    width: Math.round(box.width), height: Math.round(box.height), text: dialog.innerText.trim(),
                    qrSelected: document.querySelector('#attendanceScanButton')?.getAttribute('aria-selected') === 'true',
                    closeControl: (() => {
                        const close = dialog.querySelector(':scope > .dialog-close-button[data-dialog-close-generated]');
                        const closeBox = close?.getBoundingClientRect();
                        return {
                            ariaLabel: close?.getAttribute('aria-label') || '', tabIndex: close?.tabIndex,
                            width: Math.round(closeBox?.width || 0), height: Math.round(closeBox?.height || 0),
                            visibility: close ? getComputedStyle(close).visibility : 'missing'
                        };
                    })()
                };
            });
            const expectedQrCopy = qrView.locale === 'en'
                ? {
                    title: 'Scan QR Code',
                    description: 'Point your phone camera at the member’s code.',
                    close: 'Close',
                    note: 'If the camera does not work, close this dialog and record attendance by phone number.',
                    generatedCloseAria: 'Close dialog'
                }
                : {
                    title: 'مسح QR Code',
                    description: 'وجّه كاميرا الهاتف إلى رمز العضو.',
                    close: 'إغلاق',
                    note: 'إذا لم تعمل الكاميرا، أغلق النافذة وسجّل الحضور برقم الهاتف.',
                    generatedCloseAria: 'إغلاق النافذة'
                };
            await expect(page.locator('#qrReaderDialog h3')).toHaveText(expectedQrCopy.title);
            await expect(page.locator('#qrReaderDialog .details-dialog-head p')).toHaveText(expectedQrCopy.description);
            await expect(page.locator('#qrReaderClose')).toHaveText(expectedQrCopy.close);
            await expect(page.locator('#qrReaderClose')).toHaveAttribute('aria-label', expectedQrCopy.close);
            await expect(page.locator('#qrReaderClose')).toHaveAttribute('title', expectedQrCopy.close);
            await expect(page.locator('#qrReaderDialog .qr-reader-note')).toHaveText(expectedQrCopy.note);
            expect(qrDialog.closeControl.ariaLabel).toBe(expectedQrCopy.generatedCloseAria);
            const alternateQrCopy = qrView.locale === 'en'
                ? {
                    title: 'مسح QR Code',
                    description: 'وجّه كاميرا الهاتف إلى رمز العضو.',
                    close: 'إغلاق',
                    note: 'إذا لم تعمل الكاميرا، أغلق النافذة وسجّل الحضور برقم الهاتف.'
                }
                : {
                    title: 'Scan QR Code',
                    description: 'Point your phone camera at the member’s code.',
                    close: 'Close',
                    note: 'If the camera does not work, close this dialog and record attendance by phone number.'
                };
            const alternateLocale = qrView.locale === 'en' ? 'ar' : 'en';
            await selectLocale(page, alternateLocale);
            await expect(page.locator('#qrReaderDialog h3')).toHaveText(alternateQrCopy.title);
            await expect(page.locator('#qrReaderDialog .details-dialog-head p')).toHaveText(alternateQrCopy.description);
            await expect(page.locator('#qrReaderClose')).toHaveText(alternateQrCopy.close);
            await expect(page.locator('#qrReaderDialog .qr-reader-note')).toHaveText(alternateQrCopy.note);
            await selectLocale(page, qrView.locale);
            await expect(page.locator('#qrReaderDialog h3')).toHaveText(expectedQrCopy.title);
            await expect(page.locator('#qrReaderDialog .details-dialog-head p')).toHaveText(expectedQrCopy.description);
            await expect(page.locator('#qrReaderDialog .qr-reader-note')).toHaveText(expectedQrCopy.note);
            expect(qrDialog.qrSelected).toBe(true);
            expect(qrDialog.left).toBeGreaterThanOrEqual(-1);
            expect(qrDialog.right).toBeLessThanOrEqual(qrView.width + 1);
            if (qrView.locale === 'en') expect(qrDialog.text).not.toMatch(/\p{Script=Arabic}/u);
            expect(qrDialog.closeControl.width).toBeGreaterThanOrEqual(44);
            expect(qrDialog.closeControl.height).toBeGreaterThanOrEqual(44);
            if (qrView.locale === 'en') expect(qrDialog.closeControl.ariaLabel).not.toMatch(/\p{Script=Arabic}/u);
            qrModalStates.push({ ...qrView, ...qrDialog });
            await page.screenshot({ path: path.join(EVIDENCE_DIR, `attendance-${qrView.width}-${qrView.locale}-${qrView.theme}-qr-dialog.png`), fullPage: true });
            await page.locator('#qrReaderDialog > .dialog-close-button[data-dialog-close-generated]').click();
            await expect(page.locator('#qrReaderDialog')).toBeHidden();
            expect(runtime.writes, 'Opening/closing QR scanner UI must not submit attendance.').toEqual([]);
        }

        // Empty state is rendered by the real attendance response path.
        await page.setViewportSize({ width: 320, height: 844 });
        await selectLocale(page, 'ar');
        await selectTheme(page, 'light');
        runtime.setAttendanceMode('empty');
        await refreshAttendance(page);
        await expect(page.locator('#attendanceTableWrap .attendance-empty')).toContainText('لا توجد سجلات حضور اليوم حتى الآن');
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: path.join(EVIDENCE_DIR, 'attendance-320-ar-light-empty.png'), fullPage: true });

        // A held GET exposes the actual loading state without sleeping or writing data.
        await page.setViewportSize({ width: 390, height: 844 });
        await selectLocale(page, 'en');
        await selectTheme(page, 'dark');
        runtime.setAttendanceMode('loading');
        await refreshAttendance(page);
        await expect(page.locator('#attendanceTableWrap .loading')).toBeVisible();
        await expect.poll(() => runtime.requests.filter((request) => request.pathname === '/api/attendance').length).toBeGreaterThan(2);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: path.join(EVIDENCE_DIR, 'attendance-390-en-dark-loading.png'), fullPage: true });
        expect(runtime.releaseAttendanceLoads()).toBeGreaterThan(0);
        await expect(page.locator('#attendanceTableWrap .attendance-table tbody tr')).toHaveCount(2);
        // Let the resolved loadAttendance promise run its finally() cleanup
        // before changing the fixture and issuing the next read; otherwise the
        // refresh may intentionally deduplicate against the just-settled request.
        await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)));

        // The current error contract is presented by the real catch/render path.
        await page.setViewportSize({ width: 768, height: 1000 });
        await selectLocale(page, 'ar');
        await selectTheme(page, 'light');
        runtime.setAttendanceMode('error');
        await refreshAttendance(page);
        await expect(page.locator('#attendanceTableWrap .attendance-empty')).toContainText('تعذر تحميل سجل الحضور مؤقتًا.');
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: path.join(EVIDENCE_DIR, 'attendance-768-ar-light-error.png'), fullPage: true });

        // Restricted synthetic assistant fixture verifies the visible denial state only;
        // it does not stand in for authenticated permission acceptance.
        runtime.setAuthProfile('assistant-read-only');
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.locator('[data-page-tab="attendance"]').click();
        await expect(page.locator('#attendanceSection')).toBeVisible();
        await expect(page.locator('#attendanceTableWrap .attendance-table tbody tr')).toHaveCount(0);
        await page.locator('#attendancePhone').fill('01015819700');
        await expect(page.locator('#attendanceMemberPreview .attendance-preview-action')).toContainText('لا توجد صلاحية لتسجيل حضور', { timeout: 10000 });
        await expect(page.locator('#attendanceCheckInButton')).toBeHidden();
        await selectLocale(page, 'en');
        await expect(page.locator('#attendanceMemberPreview .attendance-preview-action')).toContainText('permission to check in');
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: path.join(EVIDENCE_DIR, 'attendance-390-en-dark-permission-denial.png'), fullPage: true });

        expect(new Set(observedData.map((item) => item.names.join('|'))).size).toBe(1);
        expect(runtime.writes, 'The visual gate must not issue mutating API requests.').toEqual([]);
        expect(runtime.externalRequests.every((origin) => ['https://cdn.jsdelivr.net', 'https://unpkg.com', 'https://flagcdn.com'].includes(origin)), `Unexpected external request: ${runtime.externalRequests.join(', ')}`).toBe(true);
        expect(pageErrors, 'Unexpected uncaught browser errors.').toEqual([]);
        const unexpectedConsoleErrors = consoleErrors.filter((message) => !message.includes('responded with a status of 503 (Service Unavailable)'));
        expect(unexpectedConsoleErrors, 'Only the deliberate 503 response used to verify the attendance error presentation may appear in the browser console.').toEqual([]);

        const summary = {
            screen: 'Attendance #attendance',
            evidenceType: 'synthetic, API-intercepted, read-only browser presentation QA; not authenticated role acceptance',
            viewports: WIDTHS,
            locales: LOCALES,
            themes: THEMES,
            recordMatrixCases: matrix.length,
            screenshots: (await fs.readdir(EVIDENCE_DIR)).filter((name) => name.endsWith('.png')).sort(),
            apiRequests: runtime.requests.length,
            apiWrites: runtime.writes,
            pageErrors,
            expectedErrorStateConsoleResponses: consoleErrors,
            unexpectedConsoleErrors,
            externalRequests: runtime.externalRequests,
            visualGaps,
            qrModalStates
        };
        await fs.writeFile(path.join(EVIDENCE_DIR, 'matrix.json'), JSON.stringify(matrix, null, 2));
        await fs.writeFile(path.join(EVIDENCE_DIR, 'summary.json'), JSON.stringify(summary, null, 2));
        await testInfo.attach('attendance-visual-gate-summary.json', {
            body: Buffer.from(JSON.stringify(summary, null, 2)),
            contentType: 'application/json'
        });
        expect(matrix).toHaveLength(WIDTHS.length * LOCALES.length * THEMES.length);
    });
});
