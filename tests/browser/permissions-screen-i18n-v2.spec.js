const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const featureCatalog = require('../../src/services/feature-catalog');
const planCatalog = require('../../src/services/saas-plan-catalog');

const ORIGIN = 'http://127.0.0.1:4173';
const WIDTHS = [320, 390, 768, 1024, 1440];
const THEMES = ['light', 'dark'];
const LOCALES = ['ar', 'en'];
const CATALOG = [
    { code: 'dashboard.read', group: 'dashboard', label: 'لوحة التحكم', description: 'عرض لوحة التحكم والتحليلات.', granted: true },
    { code: 'members.read', group: 'members', label: 'المشتركون', description: 'عرض بيانات المشتركين.', granted: true },
    { code: 'members.create', group: 'members', label: 'إضافة مشترك', description: 'إنشاء ملف مشترك.', granted: false },
    { code: 'memberships.read', group: 'memberships', label: 'عرض العضويات', description: 'عرض سجل العضويات.', granted: true },
    { code: 'memberships.create', group: 'memberships', label: 'إنشاء عضوية', description: 'إنشاء عضوية للمشترك.', granted: false },
    { code: 'attendance.read', group: 'attendance', label: 'الحضور والانصراف', description: 'عرض سجل الحضور.', granted: true },
    { code: 'attendance.check_in', group: 'attendance', label: 'تسجيل حضور', description: 'تسجيل حضور العضو.', granted: false },
    { code: 'permissions.manage', group: 'permissions', label: 'إدارة الصلاحيات', description: 'إدارة صلاحيات حسابات Assistant.', granted: true }
].map((item) => ({ ...item, ownerOnly: false }));

function fulfill(route, payload, status = 200) {
    return route.fulfill({ status, contentType: 'application/json; charset=utf-8', body: JSON.stringify(payload) });
}

async function installReadOnlyFixture(page) {
    const reads = [];
    const writes = [];
    const businessPlan = planCatalog.PLAN_CONFIGURATIONS.find((entry) => entry.code === 'business');
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
            return fulfill(route, { error: 'Read-only permissions UI fixture.' }, 405);
        }
        reads.push(pathname);
        if (pathname === '/api/auth/session') return fulfill(route, {
            authenticated: true,
            user: { id: 88100, name: 'Permissions UI QA Owner', role: 'Owner', tenantType: 'gym', permissions: [] }
        });
        if (pathname === '/api/branding') return fulfill(route, { identity: { brandName: 'Permissions UI QA Gym' } });
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
        if (pathname === '/api/auth/permissions/catalog') return fulfill(route, { permissions: CATALOG });
        if (pathname === '/api/auth/users') return fulfill(route, {
            users: [
                { id: 88111, name: 'Assistant Sample Active', email: 'assistant.active@example.test', role: 'Assistant', status: 'Active' },
                { id: 88112, name: 'Assistant Sample Disabled', email: 'assistant.disabled@example.test', role: 'Assistant', status: 'Disabled' }
            ]
        });
        if (pathname === '/api/auth/users/88111/permissions') return fulfill(route, {
            permissions: CATALOG,
            lastModified: { at: '2026-10-10T12:30:00.000Z', by: { name: 'QA Reviewer' } }
        });
        if (pathname.startsWith('/api/')) return fulfill(route, {});
        return fulfill(route, {});
    });
    return { reads, writes };
}

async function openPermissions(page) {
    await page.addInitScript(() => localStorage.setItem('logic-fit-ui-locale', 'ar'));
    await page.goto('/index.html#permissions', { waitUntil: 'domcontentloaded' });
    const tab = page.locator('[data-page-tab="permissions"]');
    const mobileNav = page.locator('#mobileNavToggle');
    if (await mobileNav.isVisible().catch(() => false)) {
        const shell = page.locator('.app-shell');
        if (!(await shell.evaluate((element) => element.classList.contains('mobile-nav-open')))) await mobileNav.click();
    }
    await expect(tab).toBeVisible();
    if (await tab.getAttribute('aria-selected') !== 'true') await tab.click();
    if (await mobileNav.isVisible().catch(() => false)) {
        const shell = page.locator('.app-shell');
        if (await shell.evaluate((element) => element.classList.contains('mobile-nav-open'))) await mobileNav.click();
    }
    await expect(page.locator('#permissionsSection')).toBeVisible();
    await expect(page.locator('#permissionsUserList [data-permission-user]')).toHaveCount(2);
    await expect(page.locator('#permissionsGrid [data-permission-code]')).toHaveCount(CATALOG.length);
}

test.describe('Gym permissions central i18n V2 — read-only fixture', () => {
        test('keeps Assistant selection and unsaved editor state across 20 locale/theme/viewport cases', async ({ page }, testInfo) => {
        test.setTimeout(180_000);
            test.skip(testInfo.project.name !== 'desktop', 'The test owns its complete internal locale/theme/viewport matrix.');
        const outputDir = path.join(process.cwd(), 'qa', 'artifacts', 'permissions-screen-i18n-v2');
        fs.mkdirSync(outputDir, { recursive: true });
        const runtime = await installReadOnlyFixture(page);
        await openPermissions(page);

        const selectedAssistant = page.locator('[data-permission-user="88111"]');
        await expect(selectedAssistant).toHaveClass(/active/u);
        await page.locator('[data-permission-group="members"] summary').click();
        await page.locator('[data-permission-group="members"] .permission-readonly-toggle').click();
        await page.locator('[data-permission-code="members.create"]').locator('xpath=..').click();
        await page.locator('#permissionsReason').fill('Draft only — do not submit');
        await page.locator('[data-permission-group="attendance"] summary').click();
        const before = await page.evaluate(() => ({
            selectedId: document.querySelector('[data-permission-user].active')?.dataset.permissionUser,
            checked: [...document.querySelectorAll('[data-permission-code]:checked')].map((input) => input.dataset.permissionCode).sort(),
            readOnly: [...document.querySelectorAll('[data-readonly-group]:checked')].map((input) => input.dataset.readonlyGroup).sort(),
            reason: document.getElementById('permissionsReason').value,
            opened: [...document.querySelectorAll('[data-permission-group][open]')].map((node) => node.dataset.permissionGroup).sort()
        }));
        expect(before.checked).toContain('members.create');
        expect(before.selectedId).toBe('88111');
        const protectedReads = runtime.reads.filter((url) => ['/api/auth/users', '/api/auth/permissions/catalog', '/api/auth/users/88111/permissions'].includes(url)).length;

        // Exercise the central locale event directly; persistence and network state are not part of this visual fixture.
        await page.evaluate(() => window.TopGymI18n.set('en', { persist: false }));
        await expect(page.locator('#permissionsTitle')).toContainText('Assistant account permissions');
        await page.evaluate(() => window.TopGymI18n.set('ar', { persist: false }));

        const untranslated = [];
        for (const locale of LOCALES) {
            for (const theme of THEMES) {
                for (const width of WIDTHS) {
                    await page.setViewportSize({ width, height: width <= 390 ? 820 : 960 });
                    await page.evaluate(({ nextLocale, nextTheme }) => {
                        document.documentElement.dataset.theme = nextTheme;
                        document.body.dataset.theme = nextTheme;
                        window.TopGymI18n.set(nextLocale, { persist: false });
                    }, { nextLocale: locale, nextTheme: theme });
                    await expect(page.locator('#permissionsSection')).toBeVisible();
                    await expect(page.locator('#permissionsTitle')).toHaveText(await page.evaluate(() => window.TopGymI18n.t('permissionsScreen.title')));
                    const state = await page.evaluate(() => ({
                        locale: window.TopGymI18n.get(),
                        dir: document.documentElement.dir,
                        selectedId: document.querySelector('[data-permission-user].active')?.dataset.permissionUser,
                        checked: [...document.querySelectorAll('[data-permission-code]:checked')].map((input) => input.dataset.permissionCode).sort(),
                        readOnly: [...document.querySelectorAll('[data-readonly-group]:checked')].map((input) => input.dataset.readonlyGroup).sort(),
                        reason: document.getElementById('permissionsReason').value,
                        opened: [...document.querySelectorAll('[data-permission-group][open]')].map((node) => node.dataset.permissionGroup).sort(),
                        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
                        selectedCodes: [...document.querySelectorAll('[data-permission-code]')].map((input) => input.dataset.permissionCode).sort(),
                        userNames: [...document.querySelectorAll('#permissionsUserList .permissions-user-copy strong')].map((node) => node.textContent.trim()),
                        untranslated: ['tab', 'ownerOnly', 'title', 'description', 'ownerNotice', 'accountsTitle', 'accountsDescription', 'accessMatrix', 'readOnlyMode', 'customizable', 'reason', 'reset', 'save', 'group.members', 'group.attendance', 'permissionCount'].map((key) => `permissionsScreen.${key}`).filter((key) => window.TopGymI18n.t(key) === key),
                        visibleArabicInEnglish: document.querySelector('#permissionsGrid')?.innerText.match(/[\u0600-\u06FF]/u)?.[0] || ''
                    }));
                    expect(state.locale).toBe(locale);
                    expect(state.dir).toBe(locale === 'ar' ? 'rtl' : 'ltr');
                    expect(state.selectedId).toBe(before.selectedId);
                    expect(state.checked).toEqual(before.checked);
                    expect(state.readOnly).toEqual(before.readOnly);
                    expect(state.reason).toBe(before.reason);
                    expect(state.opened).toEqual(before.opened);
                    expect(state.selectedCodes).toEqual(CATALOG.map((item) => item.code).sort());
                    expect(state.userNames).toEqual(['Assistant Sample Active', 'Assistant Sample Disabled']);
                    expect(state.overflow).toBe(false);
                    expect(state.untranslated).toEqual([]);
                    if (locale === 'en') expect(state.visibleArabicInEnglish).toBe('');
                    if (locale === 'en') state.untranslated.forEach((key) => untranslated.push(key));

                    const canvas = await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--bg-app').trim().toLowerCase());
                    expect(canvas).toBe(theme === 'dark' ? '#09090b' : '#f5f7fb');
                    await page.evaluate(() => document.fonts.ready);
                    const label = await page.evaluate(() => `${window.TopGymI18n.get()}-${document.body.dataset.theme}-${innerWidth}`);
                    if ([320, 390, 768, 1440].includes(width)) {
                        await page.evaluate(() => {
                            window.scrollTo(0, 0);
                            document.querySelectorAll('*').forEach((element) => {
                                if (element.scrollTop) element.scrollTop = 0;
                            });
                        });
                        await page.waitForTimeout(50);
                        await page.screenshot({ path: path.join(outputDir, `permissions-viewport-${label}.png`), fullPage: false });
                    }
                    await page.screenshot({ path: path.join(outputDir, `permissions-${label}.png`), fullPage: true });
                }
            }
        }

        // Verify the permission editor's native keyboard path and visible focus
        // without submitting the draft or issuing any write request.
        await page.setViewportSize({ width: 390, height: 844 });
        await page.evaluate(() => {
            document.documentElement.dataset.theme = 'light';
            document.body.dataset.theme = 'light';
            window.TopGymI18n.set('en', { persist: false });
        });
        const dashboardGroup = page.locator('[data-permission-group="dashboard"]');
        const dashboardSummary = dashboardGroup.locator('summary');
        const openBeforeKeyboard = (await dashboardGroup.getAttribute('open')) !== null;
        await page.locator('[data-permission-user="88111"]').focus();
        await page.keyboard.press('Tab');
        await page.keyboard.press('Tab');
        await expect(dashboardSummary).toBeFocused();
        const focusVisible = await dashboardSummary.evaluate((element) => ({
            matches: element.matches(':focus-visible'),
            outlineStyle: getComputedStyle(element).outlineStyle,
            outlineWidth: getComputedStyle(element).outlineWidth
        }));
        expect(focusVisible.matches).toBe(true);
        expect(focusVisible.outlineStyle).not.toBe('none');
        expect(parseFloat(focusVisible.outlineWidth)).toBeGreaterThan(0);
        await page.keyboard.press('Enter');
        expect((await dashboardGroup.getAttribute('open')) !== null).toBe(!openBeforeKeyboard);

        const keyboardCheckbox = page.locator('[data-permission-code="members.create"]');
        const checkedBeforeKeyboard = await keyboardCheckbox.isChecked();
        await keyboardCheckbox.focus();
        await expect(keyboardCheckbox).toBeFocused();
        await page.keyboard.press('Space');
        await expect(keyboardCheckbox).toBeChecked({ checked: !checkedBeforeKeyboard });
        await page.keyboard.press('Space');
        await expect(keyboardCheckbox).toBeChecked({ checked: checkedBeforeKeyboard });
        await page.screenshot({
            path: path.join(outputDir, 'permissions-keyboard-focus-390-en-light.png'),
            fullPage: false
        });

        expect(untranslated).toEqual([]);
        expect(runtime.writes).toEqual([]);
        expect(runtime.reads.filter((url) => ['/api/auth/users', '/api/auth/permissions/catalog', '/api/auth/users/88111/permissions'].includes(url))).toHaveLength(protectedReads);
    });
});
