'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const featureCatalog = require('../../src/services/feature-catalog');
const planCatalog = require('../../src/services/saas-plan-catalog');

const ORIGIN = 'http://127.0.0.1:4173';
const WIDTHS = [320, 375, 390, 768, 1024, 1440, 1920];
const LOCALES = ['ar', 'en'];
const THEMES = ['light', 'dark'];
const ARTIFACTS = path.resolve(__dirname, '../../qa/artifacts/branches-v2-screen-continuation');
const branchesCss = fs.readFileSync(path.resolve(__dirname, '../../public/css/pages/branches.css'), 'utf8');

function json(route, payload, status = 200) {
    return route.fulfill({ status, contentType: 'application/json; charset=utf-8', body: JSON.stringify(payload) });
}

function fixture(mode = 'ready') {
    const branches = mode === 'empty' ? [] : [
        { id: 92101, name: 'فرع مدينة نصر الرئيسي — مركز التدريب واللياقة البدنية', code: 'nasr-main-qa', address: 'شارع طويل لاختبار التفاف العنوان عند الشاشات الصغيرة — مدينة نصر، القاهرة', status: 'active', isMain: true, storeEnabled: true, barEnabled: false },
        { id: 92102, name: 'فرع التجمع الخامس للتدريب واللياقة البدنية', code: 'new-cairo-training-qa', address: 'محور طويل لاختبار اسم وعنوان الفرع العربي عند 320 بكسل — القاهرة الجديدة', status: 'active', isMain: false, storeEnabled: false, barEnabled: true },
        { id: 92103, name: 'QA Commerce Branch', code: 'commerce-qa', address: 'Long address for checking Latin wrapping without horizontal overflow', status: 'inactive', isMain: false, storeEnabled: true, barEnabled: true }
    ];
    return {
        branches,
        activeBranches: branches,
        defaultBranch: branches[0] || null,
        sections: [],
        branchLimit: 5,
        hasMultipleActiveBranches: branches.length > 1,
        canUseAllBranches: true
    };
}

async function installReadOnlyRuntime(page, mode = 'ready') {
    const writes = [];
    const externalRequests = [];
    const readRequests = [];
    const data = fixture(mode === 'empty' ? 'empty' : 'ready');
    const plan = planCatalog.PLAN_CONFIGURATIONS.find((item) => item.code === 'business');
    let bootstrapCalls = 0;
    let releaseBootstrap;
    const bootstrapGate = new Promise((resolve) => { releaseBootstrap = resolve; });

    await page.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== ORIGIN) {
            if (url.href === 'https://cdn.jsdelivr.net/npm/sweetalert2@11') {
                return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
            }
            externalRequests.push(url.href);
            return route.abort('blockedbyclient');
        }
        return route.continue();
    });

    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;
        const method = request.method().toUpperCase();
        if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
            writes.push({ pathname, method });
            return json(route, { error: 'Write operations are disabled in this visual fixture.' }, 405);
        }
        readRequests.push({ pathname, method });
        if (pathname === '/api/auth/session') {
            return json(route, { authenticated: true, user: { id: 92100, name: 'Branches QA', role: 'Owner', tenantType: 'gym', permissions: [] } });
        }
        if (pathname === '/api/branding') return json(route, { identity: { brandName: 'Branches QA Gym' } });
        if (pathname === '/api/saas/entitlements') {
            return json(route, {
                tenantStatus: 'active',
                subscription: { status: 'active', plan: { code: 'business', name: plan.name } },
                entitlements: { tenantType: 'gym', features: planCatalog.featureFlagsForPlan('business'), featureCatalog: featureCatalog.getFeatureCatalog({ tenantType: 'gym' }) }
            });
        }
        if (pathname === '/api/branches/bootstrap') {
            bootstrapCalls += 1;
            if (mode === 'loading' && bootstrapCalls === 1) await bootstrapGate;
            if (mode === 'error' && bootstrapCalls === 1) return json(route, { error: 'Synthetic branch loading failure for visual QA.' }, 503);
            return json(route, data);
        }
        if (pathname === '/api/bootstrap') return json(route, { branches: data.activeBranches, sections: [], defaultBranch: data.defaultBranch });
        if (pathname === '/api/dashboard') return json(route, { stats: {}, alerts: [] });
        return json(route, {});
    });

    return { writes, externalRequests, readRequests, releaseBootstrap };
}

async function openBranches(page, { waitForRows = true, expectedList = 'branches' } = {}) {
    await page.goto('/index.html#branches', { waitUntil: 'domcontentloaded' });
    await expect.poll(() => page.locator('#branchesSection').count()).toBe(1);
    const shell = page.locator('.app-shell');
    const mobileNav = page.locator('#mobileNavToggle');
    if (await mobileNav.isVisible().catch(() => false)
        && !(await shell.evaluate((element) => element.classList.contains('mobile-nav-open')))) {
        await mobileNav.click();
    }
    const tab = page.locator('[data-page-tab="branches"]');
    await expect(tab).toBeVisible();
    if (await tab.getAttribute('aria-selected') !== 'true') await tab.click();
    await expect(page.locator('#branchesSection')).toBeVisible();
    if (waitForRows && expectedList === 'empty') await expect(page.locator('#branchesList .empty')).toBeVisible();
    else if (waitForRows) await expect(page.locator('#branchesList .branch-list-item')).toHaveCount(3);
    if (await shell.evaluate((element) => element.classList.contains('mobile-nav-open'))) {
        await page.keyboard.press('Escape');
    }
    // Exercise the canonical page source even if the generated bundle predates
    // this worktree's uncommitted feature stylesheet.
    await page.addStyleTag({ content: branchesCss });
}

async function setPresentation(page, width, locale, theme) {
    await page.setViewportSize({ width, height: width <= 390 ? 820 : 960 });
    await page.evaluate(({ selectedLocale, selectedTheme }) => {
        document.documentElement.dataset.theme = selectedTheme;
        document.body.dataset.theme = selectedTheme;
        window.TopGymI18n?.set(selectedLocale, { persist: false });
        if (!window.TopGymI18n) {
            document.documentElement.lang = selectedLocale === 'ar' ? 'ar' : 'en';
            document.documentElement.dir = selectedLocale === 'ar' ? 'rtl' : 'ltr';
            document.body.dir = document.documentElement.dir;
        }
    }, { selectedLocale: locale, selectedTheme: theme });
    await page.evaluate(() => document.fonts.ready);
}

async function inspectScreen(page) {
    return page.evaluate(() => {
        const root = document.querySelector('#branchesSection');
        const list = root?.querySelector('#branchesList');
        const box = (element) => {
            if (!element) return null;
            const rect = element.getBoundingClientRect();
            return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom };
        };
        const visible = (element) => Boolean(element?.getClientRects().length && getComputedStyle(element).visibility !== 'hidden');
        const rows = [...(list?.querySelectorAll('.branch-list-item') || [])];
        const textWalker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
                const element = node.parentElement;
                if (!element || !element.getClientRects().length || element.closest('.branch-list-copy')) return NodeFilter.FILTER_REJECT;
                return node.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
            }
        });
        const englishArabicText = [];
        while (textWalker.nextNode()) {
            const node = textWalker.currentNode;
            if (/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(node.textContent)) englishArabicText.push({ selector: node.parentElement.tagName.toLowerCase() + (node.parentElement.id ? `#${node.parentElement.id}` : ''), text: node.textContent.trim() });
        }
        return {
            viewport: innerWidth,
            documentWidth: document.documentElement.scrollWidth,
            bodyWidth: document.body.scrollWidth,
            direction: getComputedStyle(root).direction,
            language: document.documentElement.lang,
            theme: document.documentElement.dataset.theme,
            root: box(root),
            header: box(root?.querySelector('.branches-page-header')),
            list: box(list),
            rowCount: rows.length,
            emptyVisible: visible(list?.querySelector('.empty')),
            loadingVisible: visible(list?.querySelector('.loading')),
            add: box(root?.querySelector('#branchCreateOpen')),
            refresh: box(root?.querySelector('#branchesRefresh')),
            rows: rows.map((row) => {
                const copy = row.querySelector('.branch-list-copy');
                const actions = row.querySelector('.branch-list-actions');
                return {
                    card: box(row), copy: box(copy), actions: box(actions),
                    statusVisible: visible(row.querySelector('.branch-status')),
                    actionsButtons: [...actions.querySelectorAll('button')].filter(visible).map((button) => ({ label: button.getAttribute('aria-label') || button.textContent.trim(), ...box(button) }))
                };
            }),
            englishArabicText
        };
    });
}

function assertNoOverflow(metrics, width, context) {
    expect(metrics.documentWidth, `${context}: document overflow`).toBeLessThanOrEqual(width);
    expect(metrics.bodyWidth, `${context}: body overflow`).toBeLessThanOrEqual(width);
    expect(metrics.root?.width, `${context}: mounted screen`).toBeGreaterThan(0);
    expect(metrics.list?.width, `${context}: list container`).toBeGreaterThan(0);
}

async function saveJson(file, content) {
    fs.mkdirSync(ARTIFACTS, { recursive: true });
    fs.writeFileSync(path.join(ARTIFACTS, file), `${JSON.stringify(content, null, 2)}\n`, 'utf8');
}

test.describe('Branches screen V2 — complete read-only visual continuation', () => {
    test('page and create dialog: 7 widths × 2 locales × 2 themes', async ({ page }, testInfo) => {
        testInfo.setTimeout(240_000);
        test.skip(testInfo.project.name !== 'desktop', 'The test owns its complete seven-width, locale and theme matrix.');
        const runtime = await installReadOnlyRuntime(page);
        const matrix = [];
        await openBranches(page);

        for (const locale of LOCALES) {
            for (const theme of THEMES) {
                for (const width of WIDTHS) {
                    const context = `${width}/${locale}/${theme}`;
                    await setPresentation(page, width, locale, theme);
                    const screen = await inspectScreen(page);
                    assertNoOverflow(screen, width, context);
                    expect(screen.language.startsWith(locale), `${context}: document language`).toBe(true);
                    expect(screen.direction, `${context}: locale direction`).toBe(locale === 'ar' ? 'rtl' : 'ltr');
                    expect(screen.theme).toBe(theme);
                    expect(screen.rowCount).toBe(3);
                    expect(screen.add?.height, `${context}: add branch control size`).toBeGreaterThanOrEqual(width <= 640 ? 44 : 40);
                    expect(screen.refresh?.height, `${context}: refresh target`).toBeGreaterThanOrEqual(width <= 640 ? 44 : 32);
                    for (const row of screen.rows) {
                        expect(row.statusVisible, `${context}: status badge remains visible`).toBe(true);
                        expect(row.copy?.width, `${context}: branch data remains visible`).toBeGreaterThan(0);
                        expect(row.actions?.width, `${context}: branch actions remain visible`).toBeGreaterThan(0);
                        for (const action of row.actionsButtons) {
                            expect(action.x, `${context}: ${action.label} left bound`).toBeGreaterThanOrEqual(-1);
                            expect(action.right, `${context}: ${action.label} right bound`).toBeLessThanOrEqual(width + 1);
                            expect(action.height, `${context}: ${action.label} touch target`).toBeGreaterThanOrEqual(width <= 640 ? 44 : 32);
                        }
                        if (width <= 900) {
                            expect(row.actions.y, `${context}: actions follow branch details`).toBeGreaterThanOrEqual(row.copy.bottom - 1);
                        } else if (locale === 'ar') {
                            expect(row.actions.right, `${context}: RTL actions do not overlap branch details`).toBeLessThanOrEqual(row.copy.x + 1);
                        } else {
                            expect(row.actions.x, `${context}: LTR actions do not overlap branch details`).toBeGreaterThanOrEqual(row.copy.right - 1);
                        }
                    }

                    const id = `${width}-${locale}-${theme}`;
                    const pageShot = `branches-page-${id}.png`;
                    await page.screenshot({ path: path.join(ARTIFACTS, pageShot), fullPage: true, animations: 'disabled' });
                    const caseEvidence = { kind: 'page', width, locale, theme, ...screen, screenshot: pageShot };

                    await page.locator('#branchCreateOpen').click();
                    const dialog = page.locator('#branchCreateDialog');
                    await expect(dialog).toBeVisible();
                    await expect(dialog.getByRole('heading')).toBeVisible();
                    await expect(page.locator('#branchCodeInput')).toBeVisible();
                    await expect(page.locator('#branchNameInput')).toBeVisible();
                    await expect(page.locator('#branchAddressInput')).toBeVisible();
                    await expect(page.locator('#branchPhoneInput')).toBeVisible();
                    await expect(page.locator('#branchFormStatus')).toHaveAttribute('aria-live', 'polite');
                    const dialogMetrics = await dialog.evaluate((element) => {
                        const rect = (node) => {
                            if (!node) return null;
                            const box = node.getBoundingClientRect();
                            return { x: box.x, y: box.y, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
                        };
                        const bounds = rect(element);
                        const title = element.querySelector('.details-dialog-head h3');
                        const close = element.querySelector(':scope > .dialog-close-button');
                        const range = document.createRange();
                        if (title) range.selectNodeContents(title);
                        const titleRects = title ? [...range.getClientRects()].map((line) => ({ x: line.x, y: line.y, right: line.right, bottom: line.bottom })) : [];
                        const titleRect = rect(title);
                        const closeRect = rect(close);
                        const overlaps = Boolean(closeRect && titleRects.some((line) => line.x < closeRect.right && line.right > closeRect.x && line.y < closeRect.bottom && line.bottom > closeRect.y));
                        const controls = [...element.querySelectorAll('input, button, .branches-check-field')].filter((node) => node.getClientRects().length).map((node) => ({
                            tag: node.tagName.toLowerCase(),
                            className: typeof node.className === 'string' ? node.className : '',
                            id: node.id || null,
                            label: node.labels?.[0]?.textContent.trim() || node.getAttribute('aria-label') || node.textContent.trim(),
                            ...rect(node)
                        }));
                        return {
                            bounds,
                            scrollWidth: element.scrollWidth,
                            clientWidth: element.clientWidth,
                            close: closeRect,
                            title: titleRect,
                            titleTextLines: titleRects,
                            closeOverlapsTitle: overlaps,
                            visibleInputs: controls.filter((node) => node.tag === 'input'),
                            controls
                        };
                    });
                    expect(dialogMetrics.bounds.x, `${context}: dialog left edge`).toBeGreaterThanOrEqual(-1);
                    expect(dialogMetrics.bounds.right, `${context}: dialog right edge`).toBeLessThanOrEqual(width + 1);
                    expect(dialogMetrics.bounds.height, `${context}: dialog fits viewport vertically`).toBeLessThanOrEqual((width <= 390 ? 820 : 960) + 1);
                    expect(dialogMetrics.scrollWidth, `${context}: dialog horizontal overflow`).toBeLessThanOrEqual(dialogMetrics.clientWidth + 1);
                    expect(dialogMetrics.closeOverlapsTitle, `${context}: close button overlaps heading`).toBe(false);
                    for (const control of dialogMetrics.controls) {
                        expect(control.x, `${context}: ${control.label} dialog left bound`).toBeGreaterThanOrEqual(dialogMetrics.bounds.x - 1);
                        expect(control.right, `${context}: ${control.label} dialog right bound`).toBeLessThanOrEqual(dialogMetrics.bounds.right + 1);
                    }
                    if (width <= 640) {
                        for (const control of dialogMetrics.controls.filter((item) => item.tag === 'button' || item.className.includes('branches-check-field'))) {
                            expect(control.height, `${context}: dialog touch target ${control.label}`).toBeGreaterThanOrEqual(44);
                        }
                    }

                    await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('branchCodeInput');
                    await page.keyboard.press('Tab');
                    await expect(page.locator('#branchNameInput')).toBeFocused();
                    await page.keyboard.press('Shift+Tab');
                    await expect(page.locator('#branchCodeInput')).toBeFocused();
                    const focusStyle = await page.locator('#branchCodeInput').evaluate((node) => ({
                        outlineStyle: getComputedStyle(node).outlineStyle,
                        outlineWidth: getComputedStyle(node).outlineWidth,
                        boxShadow: getComputedStyle(node).boxShadow
                    }));
                    const dialogShot = `branches-dialog-${id}.png`;
                    await page.screenshot({ path: path.join(ARTIFACTS, dialogShot), animations: 'disabled' });
                    await page.keyboard.press('Escape');
                    await expect(dialog).not.toBeVisible();
                    await expect(page.locator('#branchCreateOpen')).toBeFocused();

                    const translationGaps = locale === 'en' ? screen.englishArabicText : [];
                    matrix.push({ ...caseEvidence, dialog: dialogMetrics, focusStyle, translationGaps, dialogScreenshot: dialogShot });
                }
            }
        }

        expect(runtime.writes, 'Fixture must block and observe every write.').toEqual([]);
        expect(runtime.externalRequests).toEqual([]);
        await saveJson('matrix.json', matrix);
    });

    test('empty state is useful and localized; initial loading is observable; bootstrap failure is surfaced read-only', async ({ page }, testInfo) => {
        testInfo.setTimeout(90_000);
        fs.mkdirSync(ARTIFACTS, { recursive: true });
        const evidence = {};

        const emptyRuntime = await installReadOnlyRuntime(page, 'empty');
        await openBranches(page, { expectedList: 'empty' });
        await setPresentation(page, 390, 'en', 'light');
        const empty = page.locator('#branchesList .empty');
        await expect(empty).toBeVisible();
        evidence.empty = { text: await empty.innerText(), screenshot: 'state-empty-390-en-light.png' };
        await page.screenshot({ path: path.join(ARTIFACTS, evidence.empty.screenshot), fullPage: true });
        expect(emptyRuntime.writes).toEqual([]);
        const browser = page.context().browser();
        const freshContext = await browser.newContext({ viewport: { width: 390, height: 820 }, locale: 'ar-EG', colorScheme: 'dark' });
        const loading = await freshContext.newPage();
        const loadingRuntime = await installReadOnlyRuntime(loading, 'loading');
        await openBranches(loading, { waitForRows: false });
        await expect(loading.locator('#branchesList .loading')).toBeVisible();
        evidence.loading = { text: await loading.locator('#branchesList .loading').innerText(), screenshot: 'state-loading-390-ar-dark.png' };
        await loading.screenshot({ path: path.join(ARTIFACTS, evidence.loading.screenshot), fullPage: true });
        loadingRuntime.releaseBootstrap();
        await expect(loading.locator('#branchesList .branch-list-item')).toHaveCount(3);
        expect(loadingRuntime.writes).toEqual([]);
        await freshContext.close();

        const errorContext = await browser.newContext({ viewport: { width: 390, height: 820 }, locale: 'en-US', colorScheme: 'dark' });
        const errorPage = await errorContext.newPage();
        const errorRuntime = await installReadOnlyRuntime(errorPage, 'error');
        await openBranches(errorPage, { waitForRows: false });
        await expect(errorPage.locator('#toast .toast-item.error')).toBeVisible();
        await expect(errorPage.locator('#branchesSection')).toBeVisible();
        const staleLoading = await errorPage.locator('#branchesList .loading').isVisible().catch(() => false);
        evidence.error = {
            toast: await errorPage.locator('#toast .toast-item.error .toast-message').innerText(),
            managerStillShowsInitialLoader: staleLoading,
            screenshot: 'state-error-390-en-dark.png'
        };
        await errorPage.screenshot({ path: path.join(ARTIFACTS, evidence.error.screenshot), fullPage: true });
        expect(errorRuntime.writes).toEqual([]);
        evidence.apiWrites = [...emptyRuntime.writes, ...loadingRuntime.writes, ...errorRuntime.writes];
        evidence.externalRequests = [...emptyRuntime.externalRequests, ...loadingRuntime.externalRequests, ...errorRuntime.externalRequests];
        expect(evidence.apiWrites).toEqual([]);
        expect(evidence.externalRequests).toEqual([]);
        await saveJson('states.json', evidence);
        await errorContext.close();
    });
});
