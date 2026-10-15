const { test, expect } = require('@playwright/test');
const featureCatalog = require('../../src/services/feature-catalog');
const planCatalog = require('../../src/services/saas-plan-catalog');

const ORIGIN = 'http://127.0.0.1:4173';
const WIDTHS = [320, 390, 768, 1440];
const THEMES = ['light', 'dark'];
const LOCALES = ['ar', 'en'];
const REQUIRED_KEYS = [
    'header.kicker', 'header.title', 'header.description',
    'summary.label', 'summary.active', 'summary.limit',
    'actions.addBranch', 'actions.refresh', 'actions.close', 'actions.cancel', 'actions.submitAddBranch',
    'actions.archive', 'actions.archiveNamed', 'actions.enableBar', 'actions.disableBar',
    'list.kicker', 'list.title', 'list.description', 'loading', 'empty',
    'dialog.kicker', 'dialog.title', 'dialog.description',
    'fields.code', 'fields.name', 'fields.namePlaceholder', 'fields.address', 'fields.phone', 'fields.enableStore', 'fields.enableBarAndPos',
    'section.type.men', 'section.type.women', 'section.type.mixed', 'section.type.unknown',
    'context.section', 'context.branch', 'context.currentSection', 'context.currentBranch', 'context.sectionTitle', 'context.branchTitle',
    'context.sectionCurrent', 'context.branchCurrent', 'context.allBranches', 'context.allSections', 'context.allBranchesView',
    'status.active', 'status.inactive', 'status.archived', 'status.enabled', 'status.disabled',
    'branch.noAddress', 'branch.main', 'branch.operational',
    'commerce.settings', 'commerce.store', 'commerce.bar',
    'errors.updateBar', 'errors.load', 'errors.create', 'errors.archive', 'messages.created', 'confirm.archive'
].map((key) => `branchesScreen.${key}`);

function fulfill(route, payload, status = 200) {
    return route.fulfill({ status, contentType: 'application/json; charset=utf-8', body: JSON.stringify(payload) });
}

function branchFixture() {
    const branches = [
        { id: 58101, name: 'فرع مدينة نصر الرئيسي', code: 'nasr-main', address: 'شارع طويل للاختبار — مدينة نصر', status: 'active', isMain: true, storeEnabled: true, barEnabled: false },
        { id: 58102, name: 'فرع التجمع للتدريب واللياقة', code: 'new-cairo-training', address: 'محور طويل للاختبار — القاهرة الجديدة', status: 'active', isMain: false, storeEnabled: false, barEnabled: true },
        { id: 58103, name: 'فرع الاختبار التجاري', code: 'commerce-qa', address: 'شارع التحرير', status: 'inactive', isMain: false, storeEnabled: true, barEnabled: true }
    ];
    return { branches, activeBranches: branches, defaultBranch: branches[0], sections: [], branchLimit: 5, hasMultipleActiveBranches: true, canUseAllBranches: true };
}

async function isolateRuntime(page) {
    const writes = [];
    const reads = [];
    const fixture = branchFixture();
    const plan = planCatalog.PLAN_CONFIGURATIONS.find((entry) => entry.code === 'business');

    await page.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== ORIGIN) {
            if (url.href === 'https://cdn.jsdelivr.net/npm/sweetalert2@11') {
                return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
            }
            return route.abort('blockedbyclient');
        }
        return route.continue();
    });
    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;
        if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method().toUpperCase())) {
            writes.push({ pathname, method: request.method() });
            return fulfill(route, { error: 'Read-only browser fixture.' }, 405);
        }
        reads.push(pathname);
        if (pathname === '/api/auth/session') {
            return fulfill(route, { authenticated: true, user: { id: 58101, name: 'Branches i18n QA', role: 'Owner', tenantType: 'gym', permissions: [] } });
        }
        if (pathname === '/api/branding') return fulfill(route, { identity: { brandName: 'Branches i18n QA Gym' } });
        if (pathname === '/api/saas/entitlements') {
            return fulfill(route, {
                tenantStatus: 'active',
                subscription: { status: 'active', plan: { code: 'business', name: plan.name } },
                entitlements: { tenantType: 'gym', features: planCatalog.featureFlagsForPlan('business'), featureCatalog: featureCatalog.getFeatureCatalog({ tenantType: 'gym' }) }
            });
        }
        if (pathname === '/api/branches/bootstrap') return fulfill(route, fixture);
        if (pathname === '/api/bootstrap') return fulfill(route, { branches: fixture.activeBranches, sections: [], defaultBranch: fixture.defaultBranch });
        if (pathname === '/api/dashboard') return fulfill(route, { stats: {}, alerts: [] });
        return fulfill(route, {});
    });
    return { writes, reads };
}

async function openBranches(page) {
    await page.goto('/index.html#branches', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#branchesSection')).toHaveCount(1);
    await expect(page.locator('#branchesList .branch-list-item')).toHaveCount(3);
    if (await page.locator('#mobileNavToggle').isVisible().catch(() => false)) {
        const shell = page.locator('.app-shell');
        if (!(await shell.evaluate((node) => node.classList.contains('mobile-nav-open')))) await page.locator('#mobileNavToggle').click();
    }
    const tab = page.locator('[data-page-tab="branches"]');
    await expect(tab).toBeVisible();
    if (await tab.getAttribute('aria-selected') !== 'true') await tab.click();
    await expect(page.locator('#branchesSection')).toBeVisible();
    if (await page.locator('.app-shell').evaluate((node) => node.classList.contains('mobile-nav-open'))) await page.keyboard.press('Escape');
    await expect(page.locator('#languageToggleButton')).toBeVisible();
}

test.describe('Branches central i18n presentation (read-only fixtures)', () => {
    test('preserves branch state and layout across locale, theme, and viewport changes', async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== 'desktop', 'The test owns its complete internal locale/theme/viewport matrix.');
        const runtime = await isolateRuntime(page);
        await page.addInitScript(() => localStorage.setItem('logic-fit-ui-locale', 'ar'));
        await openBranches(page);

        const select = page.locator('#branchContextSelect');
        await select.selectOption('58102');
        await page.locator('#branchCreateOpen').click();
        await page.locator('#branchNameInput').fill('Draft branch — do not save');
        await page.keyboard.press('Escape');
        const selectedBefore = await page.evaluate(() => ({
            branch: document.getElementById('branchContextSelect').value,
            storedBranch: sessionStorage.getItem('logicfit.branchId'),
            storedSection: sessionStorage.getItem('logicfit.sectionId'),
            names: [...document.querySelectorAll('#branchesList .branch-list-copy strong')].map((node) => node.textContent.trim()),
            codes: [...document.querySelectorAll('#branchesList .branch-list-copy > span')].map((node) => node.textContent.trim())
        }));
        const bootstrapReadsBeforeLocale = runtime.reads.filter((path) => path === '/api/branches/bootstrap').length;

        const missingEnglishKeys = new Set();
        for (const locale of LOCALES) {
            for (const theme of THEMES) {
                for (const width of WIDTHS) {
                    await page.setViewportSize({ width, height: width <= 390 ? 820 : 960 });
                    const currentLocale = await page.evaluate(() => window.TopGymI18n.get());
                    if (currentLocale !== locale) await page.locator('#languageToggleButton').click();
                    await page.evaluate(({ nextLocale, nextTheme }) => {
                        document.documentElement.dataset.theme = nextTheme;
                        document.body.dataset.theme = nextTheme;
                        if (window.TopGymI18n.get() !== nextLocale) window.TopGymI18n.set(nextLocale);
                    }, { nextLocale: locale, nextTheme: theme });
                    await expect(page.locator('#branchesSection')).toBeVisible();
                    await expect(page.locator('#branchesList .branch-list-item')).toHaveCount(3);
                    const state = await page.evaluate((requiredKeys) => ({
                        dir: document.documentElement.dir,
                        branch: document.getElementById('branchContextSelect').value,
                        storedBranch: sessionStorage.getItem('logicfit.branchId'),
                        storedSection: sessionStorage.getItem('logicfit.sectionId'),
                        names: [...document.querySelectorAll('#branchesList .branch-list-copy strong')].map((node) => node.textContent.trim()),
                        codes: [...document.querySelectorAll('#branchesList .branch-list-copy > span')].map((node) => node.textContent.trim()),
                        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
                        dialogHooks: ['branchCreateDialog', 'branchCreateForm', 'branchNameInput'].every((id) => Boolean(document.getElementById(id))),
                        dialogOpen: document.getElementById('branchCreateDialog').open,
                        draftName: document.getElementById('branchNameInput').value,
                        untranslatedKeys: requiredKeys.filter((key) => window.TopGymI18n.t(key) === key)
                    }), REQUIRED_KEYS);
                    expect(state.dir).toBe(locale === 'ar' ? 'rtl' : 'ltr');
                    expect(state.branch).toBe(selectedBefore.branch);
                    expect(state.storedBranch).toBe(selectedBefore.storedBranch);
                    expect(state.storedSection).toBe(selectedBefore.storedSection);
                    expect(state.names).toEqual(selectedBefore.names);
                    expect(state.codes).toEqual(selectedBefore.codes);
                    expect(state.overflow).toBe(false);
                    expect(state.dialogHooks).toBe(true);
                    expect(state.dialogOpen).toBe(false);
                    expect(state.draftName).toBe('Draft branch — do not save');
                    if (locale === 'en') state.untranslatedKeys.forEach((key) => missingEnglishKeys.add(key));
                }
            }
        }

        expect(runtime.writes).toEqual([]);
        expect(runtime.reads.filter((path) => path === '/api/branches/bootstrap')).toHaveLength(bootstrapReadsBeforeLocale);
        expect([...missingEnglishKeys]).toEqual([]);
    });
});
