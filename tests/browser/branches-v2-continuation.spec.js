const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const featureCatalog = require('../../src/services/feature-catalog');
const planCatalog = require('../../src/services/saas-plan-catalog');

const BASE_ORIGIN = 'http://127.0.0.1:4173';
const WIDTHS = [320, 390, 768, 1440];
const THEMES = ['light', 'dark'];
const screenshotDirectory = path.resolve(__dirname, '../../qa/artifacts/branches-v2-continuation');
const branchesCss = fs.readFileSync(path.resolve(__dirname, '../../public/css/pages/branches.css'), 'utf8');

function fulfillJson(route, payload, status = 200) {
    return route.fulfill({
        status,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify(payload)
    });
}

function fixtures() {
    const branches = [
        { id: 8101, name: 'فرع مدينة نصر الرئيسي', code: 'nasr-main', address: 'شارع طويل لاختبار العنوان في الشاشات الصغيرة — مدينة نصر، القاهرة', status: 'active', isMain: true, storeEnabled: true, barEnabled: false },
        { id: 8102, name: 'فرع التجمع الخامس للتدريب واللياقة البدنية', code: 'new-cairo-training', address: 'محور طويل لاختبار اسم وعنوان الفرع العربي عند 320 بكسل — القاهرة الجديدة', status: 'active', isMain: false, storeEnabled: false, barEnabled: true },
        { id: 8103, name: 'فرع الاختبار التجاري', code: 'commerce-qa', address: 'شارع التحرير، الدقي', status: 'inactive', isMain: false, storeEnabled: true, barEnabled: true }
    ];
    return {
        branches,
        activeBranches: branches,
        defaultBranch: branches[0],
        sections: [],
        branchLimit: 5,
        hasMultipleActiveBranches: true,
        canUseAllBranches: true
    };
}

async function installReadOnlyRuntime(page) {
    const fixture = fixtures();
    const plan = planCatalog.PLAN_CONFIGURATIONS.find((item) => item.code === 'business');
    const writes = [];
    const thirdParty = [];

    await page.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== BASE_ORIGIN) {
            if (url.href === 'https://cdn.jsdelivr.net/npm/sweetalert2@11') {
                return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
            }
            thirdParty.push(url.href);
            return route.abort('blockedbyclient');
        }
        return route.continue();
    });

    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;
        if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method().toUpperCase())) {
            writes.push({ pathname, method: request.method() });
            return fulfillJson(route, { error: 'Writes are disabled in the branches V2 visual test.' }, 405);
        }
        if (pathname === '/api/auth/session') {
            return fulfillJson(route, { authenticated: true, user: { id: 98101, name: 'Branches V2 QA', role: 'Owner', tenantType: 'gym', permissions: [] } });
        }
        if (pathname === '/api/branding') return fulfillJson(route, { identity: { brandName: 'Branches V2 QA Gym' } });
        if (pathname === '/api/saas/entitlements') {
            return fulfillJson(route, {
                tenantStatus: 'active',
                subscription: { status: 'active', plan: { code: 'business', name: plan.name } },
                entitlements: { tenantType: 'gym', features: planCatalog.featureFlagsForPlan('business'), featureCatalog: featureCatalog.getFeatureCatalog({ tenantType: 'gym' }) }
            });
        }
        if (pathname === '/api/branches/bootstrap') return fulfillJson(route, fixture);
        if (pathname === '/api/bootstrap') return fulfillJson(route, { branches: fixture.activeBranches, sections: [], defaultBranch: fixture.defaultBranch });
        if (pathname === '/api/dashboard') return fulfillJson(route, { stats: {}, alerts: [] });
        return fulfillJson(route, {});
    });

    return { writes, thirdParty };
}

async function openBranches(page) {
    await page.goto('/index.html#branches', { waitUntil: 'domcontentloaded' });
    await expect.poll(() => page.locator('#branchesSection').count()).toBe(1);
    const mobileNav = page.locator('#mobileNavToggle');
    if (await mobileNav.isVisible().catch(() => false)) {
        const shell = page.locator('.app-shell');
        if (!(await shell.evaluate((element) => element.classList.contains('mobile-nav-open')))) await mobileNav.click();
    }
    const tab = page.locator('[data-page-tab="branches"]');
    await expect(tab).toBeVisible();
    if (await tab.getAttribute('aria-selected') !== 'true') await tab.click();
    await expect(page.locator('#branchesSection')).toBeVisible();
    if (await mobileNav.isVisible().catch(() => false)) {
        const shell = page.locator('.app-shell');
        if (await shell.evaluate((element) => element.classList.contains('mobile-nav-open'))) await mobileNav.click();
        await expect(shell).not.toHaveClass(/mobile-nav-open/u);
    }
    await expect(page.locator('#branchesList .branch-list-item')).toHaveCount(3);
    // This route renders operational branch records as list cards; there is no
    // table/section CRUD surface in the current branch manager to migrate.
    await expect(page.locator('#branchesSection table')).toHaveCount(0);
    await page.addStyleTag({ content: branchesCss });
}

async function applyViewportTheme(page, width, theme) {
    await page.setViewportSize({ width, height: width <= 390 ? 820 : 960 });
    await page.evaluate((mode) => {
        document.documentElement.dataset.theme = mode;
        document.body.dataset.theme = mode;
        document.documentElement.dir = 'rtl';
        document.body.dir = 'rtl';
    }, theme);
    await page.evaluate(() => document.fonts.ready);
}

test.describe('Branches and sections V2 continuation (read-only)', () => {
        test('real branch list layout stays within viewport for the responsive theme matrix', async ({ page }, testInfo) => {
            test.skip(testInfo.project.name !== 'desktop', 'The test owns its complete internal viewport and theme matrix.');
        const runtime = await installReadOnlyRuntime(page);
        await openBranches(page);
        fs.mkdirSync(screenshotDirectory, { recursive: true });

        for (const theme of THEMES) {
            for (const width of WIDTHS) {
                await applyViewportTheme(page, width, theme);
                const metrics = await page.evaluate(() => {
                    const root = document.querySelector('#branchesSection');
                    const list = document.querySelector('#branchesList');
                    const rows = [...document.querySelectorAll('#branchesList .branch-list-item')];
                    const row = rows[0];
                    const copy = row.querySelector('.branch-list-copy').getBoundingClientRect();
                    const actions = row.querySelector('.branch-list-actions').getBoundingClientRect();
                    const rootStyle = getComputedStyle(root);
                    return {
                        width: innerWidth,
                        documentWidth: document.documentElement.scrollWidth,
                        bodyWidth: document.body.scrollWidth,
                        listWidth: list.getBoundingClientRect().width,
                        rows: rows.length,
                        rowWidth: row.getBoundingClientRect().width,
                        rootBorder: rootStyle.borderTopWidth,
                        rootBackground: rootStyle.backgroundColor,
                        rootOverflow: rootStyle.overflow,
                        actionsStart: actions.top,
                        copyEnd: copy.bottom
                    };
                });
                expect(metrics.documentWidth, `${width}px ${theme}: page horizontal overflow`).toBeLessThanOrEqual(width);
                expect(metrics.bodyWidth, `${width}px ${theme}: body horizontal overflow`).toBeLessThanOrEqual(width);
                expect(metrics.rows).toBe(3);
                expect(metrics.rowWidth).toBeGreaterThan(0);
                expect(metrics.listWidth).toBeGreaterThan(0);
                expect(metrics.rootBorder).toBe('0px');
                expect(metrics.rootBackground).toBe('rgba(0, 0, 0, 0)');
                expect(metrics.rootOverflow).toBe('visible');
                if (width <= 900) expect(metrics.actionsStart).toBeGreaterThanOrEqual(metrics.copyEnd - 1);

                await page.screenshot({
                    path: path.join(screenshotDirectory, `branches-${width}-${theme}.png`),
                    fullPage: true
                });
            }
        }

        expect(runtime.writes, 'No branch, section, or other API mutation is allowed in visual QA.').toEqual([]);
        expect(runtime.thirdParty).toEqual([]);
    });

        test('create dialog remains accessible, responsive, and safely dismissible without submitting', async ({ page }, testInfo) => {
            test.skip(testInfo.project.name !== 'desktop', 'The test owns its complete internal responsive dialog matrix.');
        const runtime = await installReadOnlyRuntime(page);
        await openBranches(page);
        fs.mkdirSync(screenshotDirectory, { recursive: true });

        for (const theme of THEMES) {
            for (const width of WIDTHS) {
                await applyViewportTheme(page, width, theme);
                await page.locator('#branchCreateOpen').click();
                const dialog = page.locator('#branchCreateDialog');
                await expect(dialog).toBeVisible();
                await expect(dialog.locator('#branchCreateForm')).toBeVisible();
                await expect(dialog.locator('#branchCodeInput')).toHaveAttribute('required', '');
                await expect(dialog.locator('#branchNameInput')).toHaveAttribute('required', '');
                await expect(dialog.locator('#branchAddressInput')).toBeVisible();
                await expect(dialog.locator('#branchPhoneInput')).toBeVisible();
                await expect(dialog.locator('#branchFormStatus')).toHaveAttribute('aria-live', 'polite');

                const geometry = await dialog.evaluate((element) => {
                    const rect = element.getBoundingClientRect();
                    return { left: rect.left, right: rect.right, width: rect.width, viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth };
                });
                expect(geometry.left).toBeGreaterThanOrEqual(0);
                expect(geometry.right).toBeLessThanOrEqual(width);
                expect(geometry.width).toBeLessThanOrEqual(width);
                expect(geometry.scrollWidth).toBeLessThanOrEqual(width);
                await page.screenshot({ path: path.join(screenshotDirectory, `branch-dialog-${width}-${theme}.png`), fullPage: false });

                await page.keyboard.press('Escape');
                await expect(dialog).not.toBeVisible();
                await expect(page.locator('#branchCreateOpen')).toBeFocused();
            }
        }

        expect(runtime.writes).toEqual([]);
        expect(runtime.thirdParty).toEqual([]);
    });
});
