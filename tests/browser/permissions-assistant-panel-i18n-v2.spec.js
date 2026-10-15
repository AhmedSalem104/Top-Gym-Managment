const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const featureCatalog = require('../../src/services/feature-catalog');
const planCatalog = require('../../src/services/saas-plan-catalog');

const ORIGIN = 'http://127.0.0.1:4173';
const WIDTHS = [320, 390, 768, 1024, 1440];
const THEMES = ['light', 'dark'];
const LOCALES = ['ar', 'en'];
const CATALOG_GAPS = {
    'permissionsScreen.authUsers.table.role': { ar: 'الدور', en: 'Role' },
    'permissionsScreen.authUsers.table.lastLogin': { ar: 'آخر دخول', en: 'Last sign-in' },
    'permissionsScreen.authUsers.role.owner': { ar: 'مالك النظام', en: 'Owner' },
    'permissionsScreen.authUsers.role.assistant': { ar: 'مساعد', en: 'Assistant' },
    'permissionsScreen.authUsers.lastLogin.never': { ar: 'لم يسجل دخولًا', en: 'Never signed in' },
    'permissionsScreen.authUsers.action.disable': { ar: 'تعطيل', en: 'Disable' },
    'permissionsScreen.authUsers.action.activate': { ar: 'تفعيل', en: 'Activate' },
    'permissionsScreen.authUsers.primaryAccount': { ar: 'الحساب الرئيسي', en: 'Primary account' },
    'permissionsScreen.authUsers.dialog.addTitle': { ar: 'إضافة مساعد', en: 'Add assistant' },
    'permissionsScreen.authUsers.dialog.addDescription': { ar: 'أنشئ حسابًا مساعدًا بصلاحيات تشغيلية محدودة.', en: 'Create an assistant account with limited operational permissions.' },
    'permissionsScreen.authUsers.dialog.editTitle': { ar: 'تعديل حساب مساعد', en: 'Edit assistant account' },
    'permissionsScreen.authUsers.dialog.editDescription': { ar: 'عدّل الاسم أو البريد، ويمكنك إدخال كلمة مرور جديدة لإعادة التعيين.', en: 'Edit the name or email, or enter a new password to reset it.' },
    'permissionsScreen.authUsers.dialog.name': { ar: 'الاسم', en: 'Name' },
    'permissionsScreen.authUsers.dialog.email': { ar: 'البريد الإلكتروني', en: 'Email address' },
    'permissionsScreen.authUsers.dialog.password': { ar: 'كلمة المرور', en: 'Password' },
    'permissionsScreen.authUsers.dialog.passwordHintAdd': { ar: 'يجب أن تكون 8 أحرف على الأقل. لا يتم عرضها أو إرسالها مرة أخرى بعد الحفظ.', en: 'Use at least 8 characters. The password is not shown or sent again after saving.' },
    'permissionsScreen.authUsers.dialog.passwordHintEdit': { ar: 'اترك الحقل فارغًا للحفاظ على كلمة المرور الحالية، أو أدخل كلمة مرور جديدة لإعادة التعيين.', en: 'Leave this blank to keep the current password, or enter a new password to reset it.' },
    'permissionsScreen.authUsers.dialog.close': { ar: 'إغلاق', en: 'Close' },
    'permissionsScreen.authUsers.dialog.cancel': { ar: 'إلغاء', en: 'Cancel' },
    'permissionsScreen.authUsers.dialog.save': { ar: 'حفظ الحساب', en: 'Save account' }
};

const PERMISSIONS = [
    { code: 'members.read', group: 'members', label: 'المشتركون', description: 'عرض بيانات المشتركين.', granted: true, ownerOnly: false }
];

function fulfill(route, payload, status = 200) {
    return route.fulfill({ status, contentType: 'application/json; charset=utf-8', body: JSON.stringify(payload) });
}

async function installFixture(page) {
    const reads = [];
    const writes = [];
    const businessPlan = planCatalog.PLAN_CONFIGURATIONS.find((entry) => entry.code === 'business');
    const corePath = path.join(process.cwd(), 'public', 'js', 'core', 'i18n.js');
    const core = fs.readFileSync(corePath, 'utf8');
    const missingInRepository = Object.keys(CATALOG_GAPS).filter((key) => !core.includes(`'${key}':`));

    await page.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== ORIGIN) return route.abort('blockedbyclient');
        return route.continue();
    });
    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;
        if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method().toUpperCase())) {
            writes.push({ method: request.method(), pathname });
            return fulfill(route, { error: 'Read-only Assistant panel fixture.' }, 405);
        }
        reads.push(pathname);
        if (pathname === '/api/auth/session') return fulfill(route, {
            authenticated: true,
            user: { id: 88200, name: 'QA Owner', role: 'Owner', tenantType: 'gym', permissions: [] }
        });
        if (pathname === '/api/branding') return fulfill(route, { identity: { brandName: 'Assistant Panel QA Gym' } });
        if (pathname === '/api/saas/entitlements') return fulfill(route, {
            tenantStatus: 'active',
            subscription: { status: 'active', plan: { code: 'business', name: businessPlan.name } },
            entitlements: {
                tenantType: 'gym',
                features: planCatalog.featureFlagsForPlan('business'),
                featureCatalog: featureCatalog.getFeatureCatalog({ tenantType: 'gym' })
            }
        });
        if (pathname === '/api/bootstrap') return fulfill(route, { branches: [], sections: [] });
        if (pathname === '/api/dashboard') return fulfill(route, { stats: {}, alerts: [] });
        if (pathname === '/api/auth/permissions/catalog') return fulfill(route, { permissions: PERMISSIONS });
        if (pathname === '/api/auth/users') return fulfill(route, {
            users: [
                { id: 88211, name: 'Assistant QA Active', email: 'active@example.test', role: 'Assistant', status: 'Active', lastLoginAt: '2026-10-12T09:00:00.000Z' },
                { id: 88212, name: 'Assistant QA Disabled', email: 'disabled@example.test', role: 'Assistant', status: 'Disabled', lastLoginAt: null },
                { id: 88200, name: 'QA Owner', email: 'owner@example.test', role: 'Owner', status: 'Active', lastLoginAt: '2026-10-13T10:30:00.000Z' }
            ]
        });
        if (pathname === '/api/auth/users/88211/permissions') return fulfill(route, { permissions: PERMISSIONS, lastModified: null });
        return fulfill(route, {});
    });
    return { reads, writes, missingInRepository };
}

test.describe('Assistant account panel central i18n — read-only intercepted fixture', () => {
        test('localizes dynamic rows across 20 viewport/theme/locale cases without writing', async ({ page }, testInfo) => {
        test.setTimeout(180_000);
            test.skip(testInfo.project.name !== 'desktop', 'The test owns its complete internal viewport/theme/locale matrix.');
        const outputDir = path.join(process.cwd(), 'qa', 'artifacts', 'permissions-assistant-panel-i18n-v2');
        fs.mkdirSync(outputDir, { recursive: true });
        const runtime = await installFixture(page);
        await page.addInitScript(() => localStorage.setItem('logic-fit-ui-locale', 'ar'));
        await page.goto('/index.html#permissions', { waitUntil: 'domcontentloaded' });
        const permissionsTab = page.locator('[data-page-tab="permissions"]');
        const mobileNav = page.locator('#mobileNavToggle');
        if (await mobileNav.isVisible().catch(() => false)) {
            const shell = page.locator('.app-shell');
            if (!(await shell.evaluate((element) => element.classList.contains('mobile-nav-open')))) await mobileNav.click();
        }
        await expect(permissionsTab).toBeVisible();
        if (await permissionsTab.getAttribute('aria-selected') !== 'true') await permissionsTab.click();
        if (await mobileNav.isVisible().catch(() => false)) {
            const shell = page.locator('.app-shell');
            if (await shell.evaluate((element) => element.classList.contains('mobile-nav-open'))) await mobileNav.click();
        }
        await expect(page.locator('#authUsersPanel')).toBeVisible();
        await expect(page.locator('#authUsersList tbody tr')).toHaveCount(3);

        const expected = {
            ar: { role: 'الدور', login: 'آخر دخول', owner: 'مالك النظام', assistant: 'مساعد', active: 'نشط', disabled: 'معطل', disable: 'تعطيل', activate: 'تفعيل', primary: 'الحساب الرئيسي' },
            en: { role: 'Role', login: 'Last sign-in', owner: 'Owner', assistant: 'Assistant', active: 'Active', disabled: 'Disabled', disable: 'Disable', activate: 'Activate', primary: 'Primary account' }
        };
        const cases = [];
        const dialogGeometry = [];

        for (const locale of LOCALES) {
            for (const theme of THEMES) {
                for (const width of WIDTHS) {
                    await page.setViewportSize({ width, height: width <= 390 ? 820 : 960 });
                    await page.evaluate(({ nextLocale, nextTheme }) => {
                        document.documentElement.dataset.theme = nextTheme;
                        document.body.dataset.theme = nextTheme;
                        window.TopGymI18n.set(nextLocale, { persist: false });
                    }, { nextLocale: locale, nextTheme: theme });

                    const panel = page.locator('#authUsersList');
                    await expect(panel.locator('thead')).toContainText(expected[locale].role);
                    await expect(panel.locator('thead')).toContainText(expected[locale].login);
                    const rows = panel.locator('tbody tr');
                    await expect(rows.nth(0)).toContainText(expected[locale].assistant);
                    await expect(rows.nth(0)).toContainText(expected[locale].active);
                    await expect(rows.nth(0)).toContainText(expected[locale].disable);
                    await expect(rows.nth(1)).toContainText(expected[locale].disabled);
                    await expect(rows.nth(1)).toContainText(expected[locale].activate);
                    await expect(rows.nth(1)).toContainText(locale === 'en' ? 'Never signed in' : 'لم يسجل دخولًا');
                    await expect(rows.nth(2)).toContainText(expected[locale].owner);
                    await expect(rows.nth(2)).toContainText(expected[locale].primary);

                    await page.locator('#authAddAssistantButton').click();
                    const userDialog = page.locator('#authUserDialog');
                    await expect(userDialog).toBeVisible();
                    await expect(userDialog).toHaveAttribute('dir', locale === 'en' ? 'ltr' : 'rtl');
                    await expect(page.locator('#authUserName')).toBeFocused();
                    const dialogBounds = await userDialog.evaluate((dialog) => {
                        const rect = dialog.getBoundingClientRect();
                        return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, viewportWidth: innerWidth, viewportHeight: innerHeight, documentWidth: document.documentElement.scrollWidth };
                    });
                    expect(dialogBounds.left, JSON.stringify(dialogBounds)).toBeGreaterThanOrEqual(-1);
                    expect(dialogBounds.top, JSON.stringify(dialogBounds)).toBeGreaterThanOrEqual(-1);
                    expect(dialogBounds.right, JSON.stringify(dialogBounds)).toBeLessThanOrEqual(dialogBounds.viewportWidth + 1);
                    expect(dialogBounds.bottom, JSON.stringify(dialogBounds)).toBeLessThanOrEqual(dialogBounds.viewportHeight + 1);
                    expect(dialogBounds.documentWidth).toBeLessThanOrEqual(dialogBounds.viewportWidth + 1);
                    await expect(page.locator('#authUserDialogTitle')).toHaveText(locale === 'en' ? 'Add assistant' : 'إضافة مساعد');
                    const headerControlsSeparate = await page.evaluate(() => {
                        const title = document.getElementById('authUserDialogTitle').getBoundingClientRect();
                        const close = document.getElementById('authUserDialogClose').getBoundingClientRect();
                        return title.right <= close.left + 1 || close.right <= title.left + 1;
                    });
                    expect(headerControlsSeparate).toBe(true);
                    await expect(page.locator('#authUserDialogDescription')).toHaveText(locale === 'en' ? 'Create an assistant account with limited operational permissions.' : 'أنشئ حسابًا مساعدًا بصلاحيات تشغيلية محدودة.');
                    await expect(userDialog.locator('label[for="authUserName"]')).toContainText(locale === 'en' ? 'Name' : 'الاسم');
                    await expect(userDialog.locator('label[for="authUserEmail"]')).toContainText(locale === 'en' ? 'Email address' : 'البريد الإلكتروني');
                    await expect(userDialog.locator('label[for="authUserPassword"]')).toContainText(locale === 'en' ? 'Password' : 'كلمة المرور');
                    await expect(page.locator('#authUserPasswordHint')).toHaveText(CATALOG_GAPS['permissionsScreen.authUsers.dialog.passwordHintAdd'][locale]);
                    await expect(page.locator('#authUserDialogClose')).toHaveText(locale === 'en' ? 'Close' : 'إغلاق');
                    await expect(page.locator('#authUserDialogCancel')).toHaveText(locale === 'en' ? 'Cancel' : 'إلغاء');
                    await expect(page.locator('#authUserSave')).toHaveText(locale === 'en' ? 'Save account' : 'حفظ الحساب');
                    if (width === 320 && locale === 'en' && theme === 'dark') {
                        dialogGeometry.push(await page.evaluate(() => {
                            const dialog = document.getElementById('authUserDialog');
                            const header = dialog.querySelector('.details-dialog-head');
                            const title = document.getElementById('authUserDialogTitle');
                            const close = document.getElementById('authUserDialogClose');
                            const range = document.createRange();
                            range.selectNodeContents(title);
                            const rect = (element) => {
                                const box = element.getBoundingClientRect();
                                return { x: box.x, y: box.y, width: box.width, height: box.height, right: box.right };
                            };
                            return {
                                dialogDir: dialog.dir,
                                dialogDirection: getComputedStyle(dialog).direction,
                                headerDirection: getComputedStyle(header).direction,
                                headerDisplay: getComputedStyle(header).display,
                                titleText: title.textContent,
                                titleTextAlign: getComputedStyle(title).textAlign,
                                titleRects: [...range.getClientRects()].map((box) => ({ x: box.x, y: box.y, width: box.width, right: box.right })),
                                title: rect(title),
                                close: rect(close),
                                header: rect(header)
                            };
                        }));
                        await page.screenshot({ path: path.join(outputDir, 'assistant-account-add-en-dark-320-dialog.png') });
                    }
                    if ([320, 390, 768, 1440].includes(width)) {
                        await page.screenshot({
                            path: path.join(outputDir, `assistant-account-add-${locale}-${theme}-${width}-dialog.png`),
                            fullPage: false
                        });
                    }
                    const alternateLocale = locale === 'en' ? 'ar' : 'en';
                    await page.evaluate((value) => window.TopGymI18n.set(value, { persist: false }), alternateLocale);
                    await expect(page.locator('#authUserDialogTitle')).toHaveText(alternateLocale === 'en' ? 'Add assistant' : 'إضافة مساعد');
                    await page.evaluate((value) => window.TopGymI18n.set(value, { persist: false }), locale);
                    const escapeAddDialog = width === 320 && locale === 'en' && theme === 'dark';
                    if (escapeAddDialog) await page.keyboard.press('Escape');
                    else await page.locator('#authUserDialogCancel').click();
                    await expect(userDialog).toBeHidden();
                    if (escapeAddDialog) await expect(page.locator('#authAddAssistantButton')).toBeFocused();

                    const state = await page.evaluate(() => ({
                        locale: window.TopGymI18n.get(),
                        direction: document.documentElement.dir,
                        rows: [...document.querySelectorAll('#authUsersList tbody tr')].map((row) => ({ id: row.querySelector('[data-id]')?.dataset.id || row.querySelector('strong')?.textContent, text: row.innerText })),
                        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
                        tableLayout: (() => {
                            const wrap = document.querySelector('.auth-users-table-wrap');
                            const table = document.querySelector('.auth-users-table');
                            const body = table?.querySelector('tbody');
                            const row = body?.querySelector('tr');
                            return {
                                wrapperClientWidth: wrap?.clientWidth,
                                wrapperScrollWidth: wrap?.scrollWidth,
                                wrapperOverflowX: wrap && getComputedStyle(wrap).overflowX,
                                tableDisplay: table && getComputedStyle(table).display,
                                tableWidth: table?.getBoundingClientRect().width,
                                tableMinWidth: table && getComputedStyle(table).minWidth,
                                bodyDisplay: body && getComputedStyle(body).display,
                                rowDisplay: row && getComputedStyle(row).display
                            };
                        })(),
                        internalTableOverflow: window.innerWidth < 768 && [...document.querySelectorAll('.auth-users-table-wrap')].some((node) => node.scrollWidth > node.clientWidth + 1),
                        mobileRecordLayout: window.innerWidth < 768 ? getComputedStyle(document.querySelector('.auth-users-table')).display === 'block' : null,
                        untranslated: [...document.querySelectorAll('#authUsersList th, #authUsersList td, #authUsersList button')].filter((node) => /^permissionsScreen\./u.test(node.textContent.trim()) || /^permissionsScreen\./u.test(node.getAttribute('aria-label') || '')).map((node) => node.textContent.trim())
                    }));
                    expect(state.locale).toBe(locale);
                    expect(state.direction).toBe(locale === 'ar' ? 'rtl' : 'ltr');
                    expect(state.overflow).toBe(false);
                    expect(state.internalTableOverflow, JSON.stringify(state.tableLayout)).toBe(false);
                    if (width < 768) expect(state.mobileRecordLayout).toBe(true);
                    expect(state.untranslated).toEqual([]);
                    await page.evaluate(() => document.fonts.ready);
                    const label = `${locale}-${theme}-${width}`;
                    await page.screenshot({ path: path.join(outputDir, `assistant-accounts-${label}.png`), fullPage: true });
                    cases.push({ locale, theme, width, direction: state.direction, rowCount: state.rows.length, documentOverflow: state.overflow, untranslated: state.untranslated });
                }
            }
        }

        await page.locator('[data-auth-user-action="edit"][data-id="88211"]').click();
        await expect(page.locator('#authUserDialogTitle')).toHaveText('Edit assistant account');
        await expect(page.locator('#authUserDialogDescription')).toHaveText(CATALOG_GAPS['permissionsScreen.authUsers.dialog.editDescription'].en);
        await expect(page.locator('#authUserPasswordHint')).toHaveText(CATALOG_GAPS['permissionsScreen.authUsers.dialog.passwordHintEdit'].en);
        await page.evaluate(() => window.TopGymI18n.set('ar', { persist: false }));
        await expect(page.locator('#authUserDialogTitle')).toHaveText('تعديل حساب مساعد');
        await expect(page.locator('#authUserPasswordHint')).toHaveText(CATALOG_GAPS['permissionsScreen.authUsers.dialog.passwordHintEdit'].ar);
        await page.locator('#authUserDialogCancel').click();

        const editDialog = page.locator('#authUserDialog');
        for (const locale of LOCALES) {
            for (const theme of THEMES) {
                for (const width of [320, 390, 768, 1440]) {
                    await page.setViewportSize({ width, height: width <= 390 ? 820 : 960 });
                    await page.evaluate(({ nextLocale, nextTheme }) => {
                        document.documentElement.dataset.theme = nextTheme;
                        document.body.dataset.theme = nextTheme;
                        window.TopGymI18n.set(nextLocale, { persist: false });
                    }, { nextLocale: locale, nextTheme: theme });
                    const editAction = page.locator('[data-auth-user-action="edit"][data-id="88211"]');
                    await editAction.click();
                    await expect(editDialog).toBeVisible();
                    await expect(editDialog).toHaveAttribute('dir', locale === 'en' ? 'ltr' : 'rtl');
                    await expect(page.locator('#authUserName')).toBeFocused();
                    await expect(page.locator('#authUserDialogTitle')).toHaveText(locale === 'en' ? 'Edit assistant account' : CATALOG_GAPS['permissionsScreen.authUsers.dialog.editTitle'].ar);
                    await expect(page.locator('#authUserDialogDescription')).toHaveText(CATALOG_GAPS['permissionsScreen.authUsers.dialog.editDescription'][locale]);
                    await expect(page.locator('#authUserPasswordHint')).toHaveText(CATALOG_GAPS['permissionsScreen.authUsers.dialog.passwordHintEdit'][locale]);
                    const bounds = await editDialog.evaluate((dialog) => {
                        const rect = dialog.getBoundingClientRect();
                        return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, viewportWidth: innerWidth, viewportHeight: innerHeight, documentWidth: document.documentElement.scrollWidth };
                    });
                    expect(bounds.left, JSON.stringify(bounds)).toBeGreaterThanOrEqual(-1);
                    expect(bounds.top, JSON.stringify(bounds)).toBeGreaterThanOrEqual(-1);
                    expect(bounds.right, JSON.stringify(bounds)).toBeLessThanOrEqual(bounds.viewportWidth + 1);
                    expect(bounds.bottom, JSON.stringify(bounds)).toBeLessThanOrEqual(bounds.viewportHeight + 1);
                    expect(bounds.documentWidth).toBeLessThanOrEqual(bounds.viewportWidth + 1);
                    await page.screenshot({
                        path: path.join(outputDir, `assistant-account-edit-${locale}-${theme}-${width}-dialog.png`),
                        fullPage: false
                    });
                    const escapeEditDialog = width === 320 && locale === 'ar' && theme === 'light';
                    if (escapeEditDialog) await page.keyboard.press('Escape');
                    else await page.locator('#authUserDialogCancel').click();
                    await expect(editDialog).toBeHidden();
                    if (escapeEditDialog) await expect(editAction).toBeFocused();
                }
            }
        }

        expect(runtime.missingInRepository).toEqual([]);
        expect(runtime.writes).toEqual([]);
        const protectedReads = runtime.reads.filter((url) => ['/api/auth/users', '/api/auth/permissions/catalog'].includes(url));
        expect(protectedReads.length).toBeGreaterThan(0);
        fs.writeFileSync(path.join(outputDir, 'matrix.json'), JSON.stringify({
            cases,
            writes: runtime.writes,
            apiReads: runtime.reads,
            catalogGapsInCurrentSource: runtime.missingInRepository,
            dialogGeometry,
            canonicalCentralCatalogVerified: runtime.missingInRepository.length === 0
        }, null, 2));
    });
});
