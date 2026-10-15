'use strict';

const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const planCatalog = require('../../src/services/saas-plan-catalog');
const featureCatalog = require('../../src/services/feature-catalog');

const BASE_URL = process.env.BRANDING_QA_BASE_URL || 'http://127.0.0.1:4173';
const OUTPUT = path.resolve(process.cwd(), 'qa/artifacts/branding-v2-screen-continuation');
const WIDTHS = [320, 375, 390, 768, 1024, 1440, 1920];
const THEMES = ['light', 'dark'];
const LOCALES = ['ar', 'en'];
const EDITOR_SECTIONS = ['identity', 'assets', 'light', 'dark', 'typography', 'login', 'interface', 'documents'];
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const TENANT_NAME = 'نادي اختبار الهوية';
const PAYMENT_NAME = 'بيانات دفع الجيم';
const BRANDING_FIXTURE = Object.freeze({
    draft: {
        identity: {
            brandName: TENANT_NAME,
            englishBrandName: 'Brand QA Gym',
            shortName: 'BQ',
            companyName: 'Brand QA Fitness LLC',
            description: 'بيانات تجريبية آمنة لمراجعة شاشة إعدادات الهوية فقط.',
            paymentMethods: [{
                id: 'fixture-method',
                name: PAYMENT_NAME,
                accountReference: '01000000000',
                recipientName: 'مشترك الاختبار',
                instructions: 'قيمة يكتبها مالك الجيم',
                isActive: true,
                sortOrder: 0
            }]
        },
        assets: {},
        themes: { light: {}, dark: {} }
    },
    published: {},
    version: 7,
    metadata: null,
    audit: []
});

test('Branding V2 geometry, locale and theme matrix across all editor panels (read only)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'One serial desktop browser captures the full Branding matrix.');
    test.setTimeout(360_000);

    const runtime = await bootBranding(page);
    const branding = page.locator('#brandingSection');
    const matrix = [];
    const gapMap = new Map();
    const touchGapMap = new Map();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await fs.mkdir(OUTPUT, { recursive: true });
    await openBranding(page);
    await page.addStyleTag({ path: path.resolve(process.cwd(), 'public/css/pages/branding.css') });

    for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: width <= 390 ? 844 : 960 });
        for (const theme of THEMES) {
            await page.evaluate((mode) => window.TopGymTheme?.set?.(mode), theme);
            for (const locale of LOCALES) {
                await page.evaluate((value) => window.TopGymI18n?.set?.(value), locale);
                await expect(branding).toBeVisible();
                await expect(page.locator('#brandingBrandName')).toHaveValue(TENANT_NAME);
                await expect(page.locator('#brandingEnglishName')).toHaveValue('Brand QA Gym');
                await expect(page.locator('[data-branding-payment-field="name"]')).toHaveValue(PAYMENT_NAME);

                const base = await measure(branding);
                expect(base.documentWidth, `${width}px ${locale}/${theme}: document overflow`).toBeLessThanOrEqual(width);
                expect(base.bodyWidth, `${width}px ${locale}/${theme}: body overflow`).toBeLessThanOrEqual(width);
                expect(base.direction).toBe(locale === 'ar' ? 'rtl' : 'ltr');
                expect(base.theme).toBe(theme);
                expect(base.locale).toBe(locale);
                expect(base.editorTabs).toBe(EDITOR_SECTIONS.length);
                expect(base.smallestTabHeight).toBeGreaterThanOrEqual(44);
                expect(base.previewScrollWidth).toBeLessThanOrEqual(base.previewClientWidth + 1);

                const targets = await touchTargetAudit(branding);
                if (width <= 1024) recordTouchGaps(touchGapMap, targets.undersized, { width, theme, locale, section: 'identity' });

                const pageGaps = locale === 'en' ? await collectArabicCopy(branding) : [];
                recordGaps(gapMap, pageGaps, { width, theme, locale, section: 'identity' });
                matrix.push({ ...base, state: 'identity', touchTargets: targets, untranslatedArabic: pageGaps });
                await branding.screenshot({
                    path: path.join(OUTPUT, `branding-${width}-${locale}-${theme}.png`),
                    animations: 'disabled'
                });

                for (const editorSection of EDITOR_SECTIONS) {
                    const tab = branding.locator(`[data-branding-section="${editorSection}"]`);
                    await expect(tab).toBeVisible();
                    await tab.click();
                    const panel = branding.locator(`[data-branding-panel="${editorSection}"]`);
                    await expect(panel).toBeVisible();
                    const layout = await measurePanel(panel);
                    expect(layout.clientWidth, `${editorSection} at ${width}px ${locale}/${theme}: panel width should exist`).toBeGreaterThan(0);
                    expect(layout.scrollWidth, `${editorSection} at ${width}px ${locale}/${theme}: panel overflow; ${JSON.stringify(layout.overflowChildren)}`).toBeLessThanOrEqual(layout.clientWidth + 1);
                    expect(layout.controlsOutside, `${editorSection} controls escape the panel at ${width}px ${locale}/${theme}`).toBe(0);

                    const panelGaps = locale === 'en' ? await collectArabicCopy(panel) : [];
                    if (width <= 1024) recordTouchGaps(touchGapMap, (await touchTargetAudit(panel)).undersized, { width, theme, locale, section: editorSection });
                    recordGaps(gapMap, panelGaps, { width, theme, locale, section: editorSection });
                    matrix.push({ width, locale, theme, state: editorSection, ...layout, untranslatedArabic: panelGaps });

                    if (width === 390) {
                        await panel.screenshot({
                            path: path.join(OUTPUT, `${editorSection}-390-${locale}-${theme}.png`),
                            animations: 'disabled'
                        });
                    }
                }

                await branding.locator('[data-branding-section="identity"]').click();
                if (width === 390) {
                    for (const previewTheme of ['light', 'dark']) {
                        await branding.locator(`[data-branding-preview-theme="${previewTheme}"]`).click();
                        const selectedTheme = await page.locator('#brandingPreviewFrame').getAttribute('data-preview-theme');
                        expect(selectedTheme).toBe(previewTheme);
                        for (const previewSize of ['desktop', 'mobile']) {
                            await branding.locator(`[data-branding-preview-size="${previewSize}"]`).click();
                            await expect(page.locator('#brandingPreviewFrame')).toHaveClass(new RegExp(previewSize === 'mobile' ? 'is-mobile' : '(?!.*is-mobile)'));
                            await page.locator('.branding-preview-card').screenshot({
                                path: path.join(OUTPUT, `preview-390-${locale}-${theme}-${previewTheme}-${previewSize}.png`),
                                animations: 'disabled'
                            });
                        }
                    }
                }
            }
        }
    }

    await page.setViewportSize({ width: 390, height: 844 });
    for (const theme of THEMES) {
        await page.evaluate((mode) => window.TopGymTheme?.set?.(mode), theme);
        await page.locator('.branding-editor-nav button').first().focus();
        await page.keyboard.press('Tab');
        const focus = await page.locator('.branding-editor-nav button').nth(1).evaluate((element) => ({
            visible: element.matches(':focus-visible'),
            outlineStyle: getComputedStyle(element).outlineStyle,
            outlineWidth: parseFloat(getComputedStyle(element).outlineWidth)
        }));
        expect(focus.visible, `${theme}: keyboard focus reaches the next Branding editor section`).toBe(true);
        expect(focus.outlineStyle).not.toBe('none');
        expect(focus.outlineWidth).toBeGreaterThanOrEqual(2);
    }

    const untranslatedArabic = [...gapMap.values()];
    const undersizedTouchTargets = [...touchGapMap.values()];
    const writes = runtime.requests.filter(({ method }) => !READ_METHODS.has(method));
    expect(writes, 'All branding writes and uploads must be blocked at the API boundary').toEqual([]);
    expect(runtime.requests.some(({ pathname, method }) => pathname === '/api/branding/settings' && method === 'GET')).toBe(true);
    expect(pageErrors, 'No uncaught browser errors during the matrix').toEqual([]);

    const result = {
        generatedAt: new Date().toISOString(),
        viewports: WIDTHS,
        locales: LOCALES,
        themes: THEMES,
        editorSections: EDITOR_SECTIONS,
        combinations: matrix.length,
        expectedCombinations: WIDTHS.length * LOCALES.length * THEMES.length * (EDITOR_SECTIONS.length + 1),
        screenshots: (await fs.readdir(OUTPUT)).filter((name) => name.endsWith('.png')),
        readOnly: true,
        mutationRequests: writes.length,
        tenantBrandingFixturePreserved: true,
        geometryStatus: 'PASS',
        focusStatus: 'PASS',
        touchTargetStatus: undersizedTouchTargets.length ? 'BLOCKED' : 'PASS',
        undersizedTouchTargets,
        untranslatedArabicStatus: untranslatedArabic.length ? 'BLOCKED' : 'PASS',
        untranslatedArabic,
        matrix
    };
    await fs.writeFile(path.join(OUTPUT, 'matrix.json'), JSON.stringify(result, null, 2), 'utf8');
    await fs.writeFile(path.join(OUTPUT, 'untranslated-copy.json'), JSON.stringify(untranslatedArabic, null, 2), 'utf8');

    test.info().annotations.push({
        type: 'branding-localization-audit',
        description: untranslatedArabic.length ? `${untranslatedArabic.length} distinct Arabic UI strings remain visible in English; exact selector/text pairs are in qa/artifacts/branding-v2-screen-continuation/untranslated-copy.json.` : 'No Arabic UI strings remain in English mode.'
    });
    expect(undersizedTouchTargets, 'Touch controls at widths through 1024px must meet 44×44px. See matrix.json for exact selectors.').toEqual([]);
    // Localization is a visual acceptance gate. Fail it explicitly after the
    // complete evidence has been written; this scope cannot edit the shared i18n owner.
    expect(untranslatedArabic, 'English Branding view must not expose untranslated Arabic. See untranslated-copy.json for exact selectors and text.').toEqual([]);
});

test('Branding preview, asset placeholder, loading and GET error states remain safe and readable', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'One desktop worker captures Branding component states.');
    test.setTimeout(120_000);
    await fs.mkdir(OUTPUT, { recursive: true });

    let holdSettings = true;
    let failSettings = false;
    let releaseSettings;
    let signalSettingsStarted;
    const settingsStarted = new Promise((resolve) => { signalSettingsStarted = resolve; });
    const settingsGate = new Promise((resolve) => { releaseSettings = resolve; });
    const runtime = await bootBranding(page, {
        beforeSettingsResponse: async (route) => {
            if (holdSettings) {
                signalSettingsStarted();
                await settingsGate;
            }
            if (failSettings) {
                return route.fulfill({ status: 503, contentType: 'application/json; charset=utf-8', body: JSON.stringify({ error: 'Read-only fixture service unavailable.' }) });
            }
            return route.fulfill(json(BRANDING_FIXTURE));
        }
    });

    await page.goto(`${BASE_URL}/index.html#branding`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.topGymAuth?.isReady?.() === true, null, { timeout: 25_000 });
    await page.locator('[data-page-tab="branding"]').click();
    await page.locator('#brandingSection').waitFor({ state: 'visible' });
    await settingsStarted;
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.TopGymI18n?.set?.('ar'));
    await page.evaluate(() => window.TopGymTheme?.set?.('light'));
    await page.locator('#brandingSection').screenshot({ path: path.join(OUTPUT, 'state-loading-390-ar-light.png'), animations: 'disabled' });
    holdSettings = false;
    releaseSettings();
    await expect(page.locator('#brandingBrandName')).toHaveValue(TENANT_NAME);

    const branding = page.locator('#brandingSection');
    const actionBar = branding.locator('.branding-action-bar');
    await actionBar.scrollIntoViewIfNeeded();
    const actionBarViewport = await page.evaluate(() => {
        const bar = document.querySelector('#brandingSection .branding-action-bar');
        const barRect = bar.getBoundingClientRect();
        const intersects = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        const overlaps = [...document.querySelectorAll('#brandingSection input:not([type="file"]), #brandingSection select, #brandingSection textarea, #brandingSection button, #brandingSection [role="button"]')]
            .filter((control) => !bar.contains(control) && !control.closest('.branding-preview-frame'))
            .map((control) => ({ control, rect: control.getBoundingClientRect() }))
            .filter(({ rect }) => rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight && intersects(rect, barRect))
            .map(({ control }) => control.id ? `#${control.id}` : `${control.tagName.toLowerCase()}.${String(control.className || '').trim().replace(/\s+/g, '.')}`);
        return { viewport: { width: innerWidth, height: innerHeight }, bar: { top: Math.round(barRect.top), bottom: Math.round(barRect.bottom) }, overlaps };
    });
    expect(actionBarViewport.overlaps, `Sticky Branding action bar overlaps visible controls: ${JSON.stringify(actionBarViewport)}`).toEqual([]);
    await page.screenshot({ path: path.join(OUTPUT, 'viewport-action-bar-390-ar-light.png'), animations: 'disabled' });

    await branding.locator('[data-branding-section="assets"]').click();
    await expect(page.locator('#brandingAssetGrid .branding-asset-card')).toHaveCount(12);
    const assetState = await page.locator('#brandingAssetGrid').evaluate((element) => ({
        cards: element.querySelectorAll('.branding-asset-card').length,
        defaultAssetMarkers: element.querySelectorAll('.branding-asset-card em').length,
        uploadControls: element.querySelectorAll('[data-branding-file-trigger]').length,
        fileInputs: [...element.querySelectorAll('input[type="file"]')].map((input) => ({ id: input.id, accept: input.accept }))
    }));
    expect(assetState.cards).toBe(12);
    expect(assetState.defaultAssetMarkers).toBe(12);
    expect(assetState.uploadControls).toBe(12);
    expect(assetState.fileInputs).toHaveLength(12);
    await branding.screenshot({ path: path.join(OUTPUT, 'state-assets-default-390-ar-light.png'), animations: 'disabled' });

    await branding.locator('[data-branding-section="identity"]').click();
    await branding.locator('[data-branding-preview-theme="dark"]').click();
    await branding.locator('[data-branding-preview-size="mobile"]').click();
    await expect(page.locator('#brandingPreviewFrame')).toHaveAttribute('data-preview-theme', 'dark');
    await expect(page.locator('#brandingPreviewFrame')).toHaveClass(/is-mobile/);
    await page.locator('.branding-preview-card').screenshot({ path: path.join(OUTPUT, 'state-preview-mobile-dark.png'), animations: 'disabled' });

    failSettings = true;
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.topGymAuth?.isReady?.() === true, null, { timeout: 25_000 });
    await page.locator('[data-page-tab="branding"]').click();
    await expect(page.locator('#brandingSection')).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('#brandingStatusCopy')).toContainText('تعذر تحميل إعدادات الهوية');
    await page.locator('#brandingSection').screenshot({ path: path.join(OUTPUT, 'state-settings-error-390-ar-light.png'), animations: 'disabled' });

    const writes = runtime.requests.filter(({ method }) => !READ_METHODS.has(method));
    expect(writes, 'State QA must issue no save, publish, delete or upload request').toEqual([]);
    expect(runtime.requests.filter(({ pathname, method }) => pathname === '/api/branding/settings' && method === 'GET').length).toBeGreaterThanOrEqual(2);
    await fs.writeFile(path.join(OUTPUT, 'states.json'), JSON.stringify({
        generatedAt: new Date().toISOString(),
        viewport: 390,
        readOnly: true,
        mutationRequests: writes.length,
        tenantBrandingFixturePreserved: true,
        actionBarViewport,
        assetState,
        states: ['loading', 'assets-default-placeholder', 'preview-mobile-dark', 'settings-get-error'],
        requestCount: runtime.requests.length
    }, null, 2), 'utf8');
});

async function bootBranding(page, { beforeSettingsResponse } = {}) {
    const requests = [];
    const plan = planCatalog.PLAN_CONFIGURATIONS.find((item) => item.code === 'business');
    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const method = request.method().toUpperCase();
        requests.push({ method, pathname: url.pathname });
        if (!READ_METHODS.has(method)) {
            return route.fulfill({ status: 405, contentType: 'application/json; charset=utf-8', body: JSON.stringify({ error: 'Read-only Branding QA: write blocked.' }) });
        }

        if (url.pathname === '/api/branding/settings' && beforeSettingsResponse) return beforeSettingsResponse(route);
        let payload = {};
        if (url.pathname === '/api/auth/session') {
            payload = { authenticated: true, user: { id: 98140, name: 'Brand QA Owner', role: 'Owner', tenantType: 'gym', permissions: [] } };
        } else if (url.pathname === '/api/saas/entitlements') {
            payload = { tenantStatus: 'active', subscription: { status: 'active', plan: { code: plan.code, name: plan.name } }, entitlements: { tenantType: 'gym', features: planCatalog.featureFlagsForPlan(plan.code), featureCatalog: featureCatalog.getFeatureCatalog({ tenantType: 'gym' }) } };
        } else if (url.pathname === '/api/branding/settings') {
            payload = BRANDING_FIXTURE;
        } else if (url.pathname === '/api/branding') {
            payload = { branding: { identity: { brandName: TENANT_NAME }, assets: {} }, version: BRANDING_FIXTURE.version };
        } else if (url.pathname === '/api/bootstrap' || url.pathname === '/api/branches/bootstrap') {
            const branch = { id: 1, name: 'QA Main Branch', code: 'qa-main', status: 'active', isMain: true };
            payload = { branches: [branch], activeBranches: [branch], defaultBranch: branch, sections: [] };
        }
        return route.fulfill(json(payload));
    });
    return { requests };
}

async function openBranding(page) {
    await page.goto(`${BASE_URL}/index.html#branding`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.topGymAuth?.isReady?.() === true, null, { timeout: 25_000 });
    const tab = page.locator('[data-page-tab="branding"]');
    await expect(tab).toBeVisible({ timeout: 25_000 });
    await tab.click();
    await expect(page.locator('#brandingSection')).toBeVisible({ timeout: 25_000 });
    await expect(page.locator('#brandingBrandName')).toHaveValue(TENANT_NAME, { timeout: 25_000 });
}

function json(payload) {
    return { status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(payload) };
}

async function measure(section) {
    return section.evaluate((element) => {
        const tabs = [...element.querySelectorAll('.branding-editor-nav button')];
        const preview = element.querySelector('.branding-preview-frame');
        return {
            viewportWidth: innerWidth,
            documentWidth: document.documentElement.scrollWidth,
            bodyWidth: document.body.scrollWidth,
            direction: getComputedStyle(element).direction,
            theme: document.documentElement.dataset.theme,
            locale: window.TopGymI18n?.get?.(),
            editorTabs: tabs.length,
            smallestTabHeight: Math.min(...tabs.map((tab) => tab.getBoundingClientRect().height)),
            previewScrollWidth: preview?.scrollWidth || 0,
            previewClientWidth: preview?.clientWidth || 0,
            activeSection: element.querySelector('[data-branding-section].active')?.dataset.brandingSection || null
        };
    });
}

async function measurePanel(panel) {
    return panel.evaluate((element) => {
        const parent = element.getBoundingClientRect();
        const overflowChildren = [...element.querySelectorAll('*')].filter((child) => {
            const rect = child.getBoundingClientRect();
            return rect.width > 0 && (rect.left < parent.left - 1 || rect.right > parent.right + 1);
        }).slice(0, 8).map((child) => ({
            selector: child.id ? `#${child.id}` : `${child.tagName.toLowerCase()}${typeof child.className === 'string' && child.className.trim() ? `.${child.className.trim().replace(/\s+/g, '.')}` : ''}`,
            left: Math.round(child.getBoundingClientRect().left),
            right: Math.round(child.getBoundingClientRect().right)
        }));
        const controlsOutside = [...element.querySelectorAll('input:not([type="file"]), select, textarea, button, label[for^="branding-file-"]')]
            .filter((control) => {
                if (control.closest('[hidden]')) return false;
                const rect = control.getBoundingClientRect();
                return rect.width > 0 && (rect.left < parent.left - 1 || rect.right > parent.right + 1);
            }).length;
        return { scrollWidth: element.scrollWidth, clientWidth: element.clientWidth, overflowChildren, controlsOutside };
    });
}

async function touchTargetAudit(section) {
    return section.evaluate((root) => {
        const controls = [...root.querySelectorAll('button, input:not([type="file"]):not([type="checkbox"]), select, textarea, label[for^="branding-file-"]')]
            .filter((element) => !element.closest('.branding-preview-frame'))
            .filter((element) => {
                const style = getComputedStyle(element);
                const rect = element.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
            });
        return {
            count: controls.length,
            undersized: controls.map((element) => {
                const rect = element.getBoundingClientRect();
                const selector = element.id ? `#${element.id}` : `${element.tagName.toLowerCase()}${typeof element.className === 'string' && element.className.trim() ? `.${element.className.trim().replace(/\s+/g, '.')}` : ''}`;
                return { selector, width: Math.round(rect.width), height: Math.round(rect.height) };
            }).filter((entry) => entry.width < 44 || entry.height < 44)
        };
    });
}

async function collectArabicCopy(root) {
    return root.evaluate((element) => {
        const isHidden = (node) => {
            for (let current = node.parentElement; current; current = current.parentElement) {
                if (current.hidden || current.getAttribute('aria-hidden') === 'true') return true;
                const style = getComputedStyle(current);
                if (style.display === 'none' || style.visibility === 'hidden') return true;
            }
            return false;
        };
        const selectorFor = (node) => {
            const parts = [];
            for (let current = node.parentElement; current && current !== element; current = current.parentElement) {
                if (current.id) { parts.unshift(`#${current.id}`); break; }
                const className = typeof current.className === 'string' ? current.className.trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.') : '';
                parts.unshift(`${current.tagName.toLowerCase()}${className ? `.${className}` : ''}`);
            }
            return parts.join(' > ') || (element.id ? `#${element.id}` : element.tagName.toLowerCase());
        };
        const tenantName = 'نادي اختبار الهوية';
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        const gaps = [];
        let node;
        while ((node = walker.nextNode())) {
            if (isHidden(node)) continue;
            const raw = node.nodeValue.replace(/\s+/g, ' ').trim();
            if (!raw || !/[\u0600-\u06ff]/u.test(raw)) continue;
            const staticCopy = raw.replaceAll(tenantName, '').replace(/\s+/g, ' ').trim();
            if (!staticCopy || !/[\u0600-\u06ff]/u.test(staticCopy)) continue;
            gaps.push({ selector: selectorFor(node), text: raw, staticCopy });
        }
        return gaps;
    });
}

function recordGaps(gapMap, gaps, context) {
    for (const gap of gaps) {
        const key = `${gap.selector}\u0000${gap.text}`;
        if (!gapMap.has(key)) gapMap.set(key, { ...gap, occurrences: [] });
        gapMap.get(key).occurrences.push(context);
    }
}

function recordTouchGaps(gapMap, gaps, context) {
    for (const gap of gaps) {
        const key = `${gap.selector}\u0000${gap.width}\u0000${gap.height}`;
        if (!gapMap.has(key)) gapMap.set(key, { ...gap, occurrences: [] });
        gapMap.get(key).occurrences.push(context);
    }
}
