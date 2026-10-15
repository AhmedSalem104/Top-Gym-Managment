'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const featureCatalog = require('../../src/services/feature-catalog');
const planCatalog = require('../../src/services/saas-plan-catalog');

const BASE_ORIGIN = 'http://127.0.0.1:4173';
const WIDTHS = [320, 390, 768, 1024, 1440];
const LOCALES = ['ar', 'en'];
const THEMES = ['light', 'dark'];
const artifactDirectory = path.resolve(__dirname, '../../qa/artifacts/branches-mobile-acceptance-v2');
const branchesCss = fs.readFileSync(path.resolve(__dirname, '../../public/css/pages/branches.css'), 'utf8');

function fulfillJson(route, payload, status = 200) {
    return route.fulfill({
        status,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify(payload)
    });
}

function branchFixture() {
    const branches = [
        {
            id: 81901,
            name: 'فرع مدينة نصر الرئيسي — مركز التدريب واللياقة البدنية',
            code: 'nasr-main-qa',
            address: 'شارع طويل لاختبار التفاف العنوان في الشاشات الصغيرة — مدينة نصر، القاهرة',
            status: 'active',
            isMain: true,
            storeEnabled: true,
            barEnabled: false
        },
        {
            id: 81902,
            name: 'فرع التجمع الخامس للتدريب واللياقة البدنية',
            code: 'new-cairo-training-qa',
            address: 'محور طويل لاختبار اسم وعنوان الفرع العربي عند 320 بكسل — القاهرة الجديدة',
            status: 'active',
            isMain: false,
            storeEnabled: false,
            barEnabled: true
        },
        {
            id: 81903,
            name: 'QA Commerce Branch',
            code: 'commerce-qa',
            address: 'Long address for verifying Latin content wrapping without horizontal overflow',
            status: 'inactive',
            isMain: false,
            storeEnabled: true,
            barEnabled: true
        }
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
    const writes = [];
    const externalAttempts = [];
    const fixture = branchFixture();
    const plan = planCatalog.PLAN_CONFIGURATIONS.find((item) => item.code === 'business');

    await page.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== BASE_ORIGIN) {
            if (url.href === 'https://cdn.jsdelivr.net/npm/sweetalert2@11') {
                return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
            }
            externalAttempts.push(url.href);
            return route.abort('blockedbyclient');
        }
        return route.continue();
    });

    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;
        if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method().toUpperCase())) {
            writes.push({ pathname, method: request.method() });
            return fulfillJson(route, { error: 'Read-only branch visual QA.' }, 405);
        }
        if (pathname === '/api/auth/session') {
            return fulfillJson(route, {
                authenticated: true,
                user: { id: 98101, name: 'Branches QA', role: 'Owner', tenantType: 'gym', permissions: [] }
            });
        }
        if (pathname === '/api/branding') return fulfillJson(route, { identity: { brandName: 'Branches QA Gym' } });
        if (pathname === '/api/saas/entitlements') {
            return fulfillJson(route, {
                tenantStatus: 'active',
                subscription: { status: 'active', plan: { code: 'business', name: plan.name } },
                entitlements: {
                    tenantType: 'gym',
                    features: planCatalog.featureFlagsForPlan('business'),
                    featureCatalog: featureCatalog.getFeatureCatalog({ tenantType: 'gym' })
                }
            });
        }
        if (pathname === '/api/branches/bootstrap') return fulfillJson(route, fixture);
        if (pathname === '/api/bootstrap') {
            return fulfillJson(route, { branches: fixture.activeBranches, sections: [], defaultBranch: fixture.defaultBranch });
        }
        if (pathname === '/api/dashboard') return fulfillJson(route, { stats: {}, alerts: [] });
        return fulfillJson(route, {});
    });

    return { writes, externalAttempts };
}

async function openBranches(page) {
    await page.goto('/index.html#branches', { waitUntil: 'domcontentloaded' });
    await expect.poll(() => page.locator('#branchesSection').count()).toBe(1);
    await expect(page.locator('#branchesList .branch-list-item')).toHaveCount(3);
    const tab = page.locator('[data-page-tab="branches"]');
    if (await tab.getAttribute('aria-selected') !== 'true') await tab.click();
    await expect(page.locator('#branchesSection')).toBeVisible();
    const shell = page.locator('.app-shell');
    if (await shell.evaluate((element) => element.classList.contains('mobile-nav-open'))) {
        await page.keyboard.press('Escape');
        await expect(page.locator('#pageTabs')).toBeHidden();
    }

    // The page composition is a canonical source file imported by app-shell;
    // load that source directly so QA exercises the current unbuilt source,
    // not a stale generated bundle.
    await page.addStyleTag({ content: branchesCss });
}

async function setPresentation(page, { width, locale, theme }) {
    await page.setViewportSize({ width, height: width <= 390 ? 844 : 960 });
    await page.evaluate(({ locale: nextLocale, theme: nextTheme }) => {
        document.documentElement.dataset.theme = nextTheme;
        document.body.dataset.theme = nextTheme;
        window.TopGymI18n?.set(nextLocale, { persist: false });
        if (!window.TopGymI18n) {
            document.documentElement.lang = nextLocale === 'ar' ? 'ar' : 'en';
            document.documentElement.dir = nextLocale === 'ar' ? 'rtl' : 'ltr';
        }
    }, { locale, theme });
    await page.evaluate(() => document.fonts.ready);
}

async function inspectScreen(page, width) {
    return page.evaluate(() => {
        const root = document.querySelector('#branchesSection');
        const header = root?.querySelector('.branches-page-header');
        const list = root?.querySelector('#branchesList');
        const rows = [...(root?.querySelectorAll('.branch-list-item') || [])];
        const rect = (node) => {
            if (!node) return null;
            const { x, y, width: boxWidth, height, right, bottom } = node.getBoundingClientRect();
            return { x, y, width: boxWidth, height, right, bottom };
        };
        const visible = (node) => Boolean(node && node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden');
        return {
            viewport: innerWidth,
            direction: getComputedStyle(root).direction,
            documentWidth: document.documentElement.scrollWidth,
            bodyWidth: document.body.scrollWidth,
            root: rect(root),
            header: rect(header),
            list: rect(list),
            rowCount: rows.length,
            rows: rows.map((row) => ({
                card: rect(row),
                marker: rect(row.querySelector('.branch-list-marker')),
                copy: rect(row.querySelector('.branch-list-copy')),
                actions: rect(row.querySelector('.branch-list-actions')),
                buttons: [...row.querySelectorAll('button')].filter(visible).map((button) => ({
                    label: button.getAttribute('aria-label') || button.textContent.trim(),
                    rect: rect(button),
                    width: button.getBoundingClientRect().width,
                    height: button.getBoundingClientRect().height
                })),
                status: visible(row.querySelector('.branch-status'))
            })),
            addButton: rect(root?.querySelector('#branchCreateOpen')),
            refreshButton: rect(root?.querySelector('#branchesRefresh'))
        };
    });
}

test.describe('Gym Branches V2 — isolated visual/responsive acceptance evidence', () => {
    test('mounted branches screen and create dialog fit all target viewports, locales, and themes', async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== 'desktop', 'The test owns its complete internal viewport, locale and theme matrix.');
        const runtime = await installReadOnlyRuntime(page);
        const evidence = [];
        fs.mkdirSync(artifactDirectory, { recursive: true });
        await openBranches(page);

        for (const locale of LOCALES) {
            for (const theme of THEMES) {
                for (const width of WIDTHS) {
                    await setPresentation(page, { width, locale, theme });
                    const screen = await inspectScreen(page, width);
                    expect(screen.documentWidth, `${width}/${locale}/${theme}: document overflow`).toBeLessThanOrEqual(width);
                    expect(screen.bodyWidth, `${width}/${locale}/${theme}: body overflow`).toBeLessThanOrEqual(width);
                    expect(screen.rowCount).toBe(3);
                    expect(screen.root?.width).toBeGreaterThan(0);
                    expect(screen.list?.width).toBeGreaterThan(0);
                    expect(screen.addButton?.width).toBeGreaterThan(0);
                    expect(screen.refreshButton?.width).toBeGreaterThan(0);

                    for (const row of screen.rows) {
                        expect(row.status, `${width}/${locale}/${theme}: status hidden`).toBeTruthy();
                        expect(row.copy?.width, 'branch details must remain available').toBeGreaterThan(0);
                        expect(row.actions?.width, 'branch actions must remain available').toBeGreaterThan(0);
                        for (const button of row.buttons) {
                            expect(button.rect.x).toBeGreaterThanOrEqual(-1);
                            expect(button.rect.right).toBeLessThanOrEqual(width + 1);
                            expect(button.width, `${button.label} remains operable`).toBeGreaterThan(0);
                            expect(button.height, `${button.label} control height`).toBeGreaterThanOrEqual(width <= 640 ? 43 : 31);
                        }
                        if (width <= 900) {
                            expect(row.actions.y, 'mobile/tablet actions should follow branch text').toBeGreaterThanOrEqual(row.copy.bottom - 1);
                        } else if (screen.direction === 'rtl') {
                            expect(row.actions.right, 'RTL desktop actions should sit before details without overlap').toBeLessThanOrEqual(row.copy.x + 1);
                        } else {
                            expect(row.actions.x, 'LTR desktop actions should sit after details without overlap').toBeGreaterThanOrEqual(row.copy.right - 1);
                        }
                    }

                    const caseId = `${width}-${locale}-${theme}`;
                    await page.screenshot({
                        path: path.join(artifactDirectory, `branches-${caseId}.png`),
                        fullPage: true
                    });

                    await page.locator('#branchCreateOpen').click();
                    const dialog = page.locator('#branchCreateDialog');
                    await expect(dialog).toBeVisible();
                    await expect(dialog.locator('#branchCodeInput')).toBeVisible();
                    await expect(dialog.locator('#branchNameInput')).toBeVisible();
                    await expect(dialog.locator('#branchAddressInput')).toBeVisible();
                    await expect(dialog.locator('#branchPhoneInput')).toBeVisible();
                    const dialogMetrics = await dialog.evaluate((element) => {
                        const box = element.getBoundingClientRect();
                        const controls = [...element.querySelectorAll('button,input')].filter((node) => node.getClientRects().length);
                        const close = element.querySelector(':scope > .dialog-close-button')?.getBoundingClientRect();
                        const textRects = (selector) => {
                            const target = element.querySelector(selector);
                            if (!target) return [];
                            const range = document.createRange();
                            range.selectNodeContents(target);
                            return [...range.getClientRects()].map((rect) => ({ x: rect.x, right: rect.right, y: rect.y, bottom: rect.bottom }));
                        };
                        return {
                            x: box.x,
                            right: box.right,
                            width: box.width,
                            height: box.height,
                            viewportWidth: innerWidth,
                            viewportHeight: innerHeight,
                            scrollWidth: element.scrollWidth,
                            clientWidth: element.clientWidth,
                            close: close ? { x: close.x, right: close.right, y: close.y, bottom: close.bottom } : null,
                            title: textRects('.details-dialog-head h3'),
                            kicker: textRects('.details-dialog-head .branches-card-kicker'),
                            controls: controls.map((node) => {
                                const rect = node.getBoundingClientRect();
                                return { x: rect.x, right: rect.right, y: rect.y, bottom: rect.bottom, width: rect.width, height: rect.height };
                            })
                        };
                    });
                    expect(dialogMetrics.x).toBeGreaterThanOrEqual(-1);
                    expect(dialogMetrics.right).toBeLessThanOrEqual(width + 1);
                    expect(dialogMetrics.scrollWidth).toBeLessThanOrEqual(dialogMetrics.clientWidth + 1);
                    expect(dialogMetrics.close).not.toBeNull();
                    for (const textLines of [dialogMetrics.title, dialogMetrics.kicker]) {
                        const overlaps = textLines.some((text) => dialogMetrics.close.x < text.right
                            && dialogMetrics.close.right > text.x
                            && dialogMetrics.close.y < text.bottom
                            && dialogMetrics.close.bottom > text.y);
                        expect(overlaps, `${width}/${locale}/${theme}: dialog close control overlaps heading: ${JSON.stringify({ close: dialogMetrics.close, textLines })}`).toBe(false);
                    }
                    for (const control of dialogMetrics.controls) {
                        expect(control.x).toBeGreaterThanOrEqual(dialogMetrics.x - 1);
                        expect(control.right).toBeLessThanOrEqual(dialogMetrics.right + 1);
                    }
                    await page.screenshot({ path: path.join(artifactDirectory, `dialog-${caseId}.png`) });
                    await page.keyboard.press('Escape');
                    await expect(dialog).not.toBeVisible();
                    evidence.push({ ...screen, locale, theme, dialog: dialogMetrics });
                }
            }
        }

        expect(runtime.writes, 'No API mutation is allowed by this read-only visual task.').toEqual([]);
        expect(runtime.externalAttempts, 'External network requests must remain blocked.').toEqual([]);
        fs.writeFileSync(path.join(artifactDirectory, 'matrix.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
    });
});
