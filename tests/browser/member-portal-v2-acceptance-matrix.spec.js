'use strict';

const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const esbuild = require('esbuild');

const projectRoot = path.resolve(__dirname, '../..');
const cssRoot = path.join(projectRoot, 'public/css');
const widths = [320, 375, 390, 768, 1024, 1440, 1920];
const modes = [
    { theme: 'light', direction: 'rtl' },
    { theme: 'dark', direction: 'rtl' },
    { theme: 'light', direction: 'ltr' },
    { theme: 'dark', direction: 'ltr' }
];
const importPattern = /@import\s+(?:url\()?['"]([^'"]+)['"]\)?\s*;/g;

function expandCss(file, chain = []) {
    const absolute = path.resolve(file);
    if (chain.includes(absolute)) throw new Error(`Circular CSS import: ${absolute}`);
    const source = fs.readFileSync(absolute, 'utf8');
    return source.replace(importPattern, (_, importPath) => {
        if (/^(?:https?:|data:)/i.test(importPath)) return `@import url("${importPath}");`;
        const target = path.resolve(path.dirname(absolute), importPath);
        if (!target.startsWith(`${cssRoot}${path.sep}`)) throw new Error(`CSS import escaped source root: ${importPath}`);
        return expandCss(target, [...chain, absolute]);
    });
}

// Serve canonical source CSS in memory. The test does not edit generated bundles.
const fixtureCss = esbuild.transformSync(
    expandCss(path.join(cssRoot, 'main.source.css')),
    { loader: 'css', minify: true, legalComments: 'none' }
).code;

test('Member Portal V2 acceptance matrix: six roots, five tools, themes, directions and seven widths', async ({ page }, testInfo) => {
    test.setTimeout(600_000);
    test.skip(testInfo.project.name !== 'desktop', 'This test owns its complete seven-width, theme, direction, root and tool matrix.');
    const apiCalls = [];
    const pageErrors = [];
    const unexpectedHttpErrors = [];
    const lookupModes = { current: 'error' };
    const artifacts = path.join(projectRoot, 'qa/artifacts/member-portal-v2-acceptance-matrix');
    await fsp.mkdir(artifacts, { recursive: true });
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('console', message => {
        if (message.type() === 'error' && !message.text().includes('Failed to load resource')) pageErrors.push(message.text());
    });
    page.on('response', response => {
        if (response.status() < 400) return;
        const url = new URL(response.url());
        const expectedLookupFailure = url.pathname === '/api/member-portal/lookup' && response.status() === 404;
        const expectedLibraryFailure = url.pathname.startsWith('/api/member-portal/library/') && response.status() === 503;
        if (!expectedLookupFailure && !expectedLibraryFailure) {
            unexpectedHttpErrors.push(`${response.status()} ${url.pathname}`);
        }
    });

    const fixture = {
        tenant: { name: 'نادي اختبار بوابة العضوية', slug: 'qa-member-portal' },
        member: {
            fullName: 'عضو تجريبي باسم طويل لاختبار التخطيط في الاتجاهين',
            phone: '+201001234567', phoneCountry: 'EG', email: 'portal-member@example.test',
            registrationDate: '2024-04-12T00:00:00.000Z'
        },
        currentMembership: {
            id: 63001, status: 'active', plan: 'gym_only', type: 'monthly',
            startDate: '2026-09-01T00:00:00.000Z', endDate: '2026-10-31T00:00:00.000Z', daysRemaining: 20
        },
        memberships: [{
            plan: 'gym_only', type: 'monthly', startDate: '2026-09-01T00:00:00.000Z',
            endDate: '2026-10-31T00:00:00.000Z', status: 'active', amountDue: 1200, amountPaid: 1200, amountRemaining: 0
        }],
        payments: [{
            receiptNumber: 'QA-PORTAL-RECEIPT-000063', transactionDate: '2026-09-01T10:30:00.000Z',
            transactionType: 'subscription', amountPaid: 1200, amountRemaining: 0, paymentMethod: 'cash'
        }],
        attendance: [{
            attendanceDate: '2026-10-10', checkInAt: '2026-10-10T17:15:00.000Z',
            checkOutAt: '2026-10-10T18:35:00.000Z', durationMinutes: 80
        }],
        freezes: [{ startDate: '2026-08-01', endDate: '2026-08-08', resumedDate: '2026-08-08', days: 7 }],
        attendanceSummary: { totalVisits: 12 },
        financialSummary: { totalDue: 1200, totalPaid: 1200, totalRemaining: 0 },
        firstJoinDate: '2024-04-12T00:00:00.000Z', reportNumber: 'QA-PORTAL-V2-ACCEPTANCE',
        issuedAt: '2026-10-11T09:00:00.000Z'
    };

    let releaseLookup;
    let lookupGate = null;
    let libraryMode = 'empty';
    let releaseLibrary;
    let libraryGate = null;
    let failExerciseOnce = false;

    await page.route('**/css/main.css*', route => route.fulfill({
        status: 200, contentType: 'text/css; charset=utf-8', body: fixtureCss
    }));
    await page.route('**/api/**', async route => {
        const request = route.request();
        const url = new URL(request.url());
        apiCalls.push({ method: request.method(), pathname: url.pathname });

        if (request.method() !== 'GET' && ![
            '/api/member-portal/lookup', '/api/member-portal/occupancy'
        ].includes(url.pathname)) {
            return route.abort('blockedbyclient');
        }
        if (url.pathname === '/api/branding') {
            return route.fulfill({ json: { branding: { identity: { brandName: fixture.tenant.name } }, version: 1 } });
        }
        if (url.pathname === '/api/member-portal/lookup' && request.method() === 'POST') {
            const payload = request.postDataJSON();
            expect(payload.membershipCode).toBe('QA-PORTAL-MATRIX');
            if (lookupModes.current === 'loading') {
                await lookupGate;
                return route.fulfill({ json: fixture });
            }
            if (lookupModes.current === 'error') {
                return route.fulfill({ status: 404, json: { error: 'Synthetic lookup error' } });
            }
            return route.fulfill({ json: fixture });
        }
        if (url.pathname === '/api/member-portal/occupancy' && request.method() === 'POST') {
            return route.fulfill({ json: { presentCount: 4, level: 'quiet', observedAt: '2026-10-11T09:00:00.000Z' } });
        }
        if (url.pathname === '/api/member-portal/library/options') {
            if (libraryMode === 'error') return route.fulfill({ status: 503, json: { error: 'Synthetic library error' } });
            return route.fulfill({ json: { filters: { categories: [], difficulties: [], equipment: [] } } });
        }
        if (/^\/api\/member-portal\/library\/(exercises|foods)$/.test(url.pathname)) {
            if (url.pathname.endsWith('/exercises') && libraryMode === 'loading') {
                await libraryGate;
            }
            if (url.pathname.endsWith('/exercises') && failExerciseOnce) {
                failExerciseOnce = false;
                return route.fulfill({ status: 503, json: { error: 'Synthetic collection error' } });
            }
            return route.fulfill({ json: { items: [], pagination: { page: 1, pageSize: 18, totalItems: 0, totalPages: 0 } } });
        }
        if (url.pathname === '/api/member-portal/membership-catalog') {
            return route.fulfill({ json: {
                plans: [{ code: 'gym_only', label: 'جيم فقط' }],
                types: [{ code: 'monthly', label: 'شهرية', durationDays: 30 }],
                prices: { gym_only: { monthly: 1200 } }, currency: 'EGP'
            } });
        }
        if (url.pathname === '/api/member-portal/payment-methods') {
            return route.fulfill({ json: { paymentMethods: [] } });
        }
        if (url.pathname === '/api/member-portal/subscription-requests') {
            return route.fulfill({ json: { requests: [] } });
        }
        return route.fulfill({ json: {} });
    });

    await page.addInitScript(() => localStorage.setItem('topgym-theme', 'light'));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/member-portal', { waitUntil: 'networkidle' });
    await expect(page.locator('#portalLoginPanel')).toBeVisible();

    // Explicitly exercise the real login error and busy states before successful fixture lookup.
    await page.locator('#membershipCodeInput').fill('QA-PORTAL-MATRIX');
    await page.locator('#portalLookupForm button[type="submit"]').click();
    await expect(page.locator('#portalError')).toBeVisible();
    await page.screenshot({ path: path.join(artifacts, 'login-error-390-light-rtl.png'), fullPage: true });

    for (const width of widths) {
        await page.setViewportSize({ width, height: width <= 390 ? 844 : 1000 });
        for (const mode of modes) {
            await applyMode(mode);
            await assertRoot('login', '#portalLoginPanel', '#membershipCodeInput', width, mode);
            if ([320, 390, 1440].includes(width)) await capture('login', '#portalLoginPanel', width, mode);
        }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await applyMode(modes[0]);

    lookupModes.current = 'loading';
    lookupGate = new Promise(resolve => { releaseLookup = resolve; });
    await page.locator('#portalLookupForm button[type="submit"]').click();
    const submit = page.locator('#portalLookupForm button[type="submit"]');
    await expect(submit).toHaveAttribute('aria-busy', 'true');
    await page.screenshot({ path: path.join(artifacts, 'login-loading-390-light-rtl.png'), fullPage: true });
    lookupModes.current = 'success';
    releaseLookup();
    await expect(page.locator('#portalResult')).toBeVisible();
    await expect(page.locator('.portal-tool-card')).toHaveCount(5);

    const tools = [
        { id: 'print', name: 'print', selector: '#portalReportContent', focus: '#portalPrintButton' },
        { id: 'feedback', name: 'feedback', selector: '#portalFeedbackSection', focus: '#portalFeedbackStars button' },
        { id: 'exercises', name: 'exercises', selector: '#portalLibrarySection', focus: '#portalLibrarySearch' },
        { id: 'foods', name: 'foods', selector: '#portalLibrarySection', focus: '#portalLibrarySearch' },
        { id: 'subscription', name: 'subscription', selector: '#portalSubscriptionSection', focus: '#portalSubscriptionPlan' }
    ];
    const evidence = [];

    for (const width of widths) {
        await page.setViewportSize({ width, height: width <= 390 ? 844 : 1000 });
        await applyMode(modes[0]);
        await assertRoot('result', '#portalResult', '#portalResetButton', width, modes[0]);
        await assertRoot('home', '#portalHomeView', '[data-portal-tool="print"]', width, modes[0]);

        for (const mode of modes) {
            await applyMode(mode);
            await assertRoot('result', '#portalResult', '#portalResetButton', width, mode);
            await assertRoot('home', '#portalHomeView', '[data-portal-tool="print"]', width, mode);
            if ([320, 390, 1440].includes(width)) {
                await capture('result', '#portalResult', width, mode);
                await capture('home', '#portalHomeView', width, mode);
            }
        }

        for (const tool of tools) {
            await applyMode(modes[0]);
            await page.locator(`[data-portal-tool="${tool.id}"]`).click();
            await expect(page.locator(tool.selector)).toBeVisible();
            await expect(page.locator(tool.focus).first()).toBeVisible();
            for (const mode of modes) {
                await applyMode(mode);
                await assertRoot(tool.name, tool.selector, tool.focus, width, mode);
                if ([320, 390, 1440].includes(width)) await capture(tool.name, tool.selector, width, mode);
            }
            await page.locator(tool.id === 'exercises' || tool.id === 'foods'
                ? '#portalLibraryMount [data-library-close]'
                : '[data-portal-back]').click();
            await expect(page.locator('#portalHomeView')).toBeVisible();
        }

        evidence.push({ width, modes: modes.map(({ theme, direction }) => `${theme}-${direction}`), viewCases: 7, tools: tools.map(tool => tool.id) });
    }

    // Verify library loading, recoverable error, and empty data states with synthetic responses.
    await page.setViewportSize({ width: 390, height: 844 });
    await applyMode(modes[0]);
    libraryMode = 'loading';
    libraryGate = new Promise(resolve => { releaseLibrary = resolve; });
    await page.locator('[data-portal-tool="exercises"]').click();
    await expect(page.locator('#portalLibraryContent.is-loading')).toBeVisible();
    await page.screenshot({ path: path.join(artifacts, 'library-loading-390-light-rtl.png'), fullPage: true });
    libraryMode = 'empty';
    releaseLibrary();
    await expect(page.locator('.portal-library-state-wide')).toBeVisible();
    await page.locator('#portalLibraryMount [data-library-close]').click();

    libraryMode = 'error';
    failExerciseOnce = true;
    await page.locator('[data-portal-tool="exercises"]').click();
    await expect(page.locator('.portal-library-error')).toBeVisible();
    await page.screenshot({ path: path.join(artifacts, 'library-error-390-light-rtl.png'), fullPage: true });
    await page.locator('[data-library-retry]').click();
    await expect(page.locator('.portal-library-state-wide')).toBeVisible();
    await page.locator('#portalLibraryMount [data-library-close]').click();

    expect(apiCalls.filter(({ method, pathname }) => method !== 'GET'
        && !['/api/member-portal/lookup', '/api/member-portal/occupancy'].includes(pathname))).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(unexpectedHttpErrors).toEqual([]);

    await fsp.writeFile(path.join(artifacts, 'acceptance-matrix.json'), JSON.stringify({
        widths,
        themes: ['light', 'dark'],
        directions: ['rtl', 'ltr'],
        roots: ['login', 'result', 'home', 'feedback', 'library', 'subscription'],
        tools: tools.map(({ id }) => id),
        states: ['lookup error', 'lookup loading', 'lookup success', 'library loading', 'library error with retry', 'library empty'],
        perWidth: evidence,
        screenshots: 'all viewports asserted; representative 320/390/1440 captures for every root/tool and all four theme-direction combinations; error/loading captures at 390 light RTL',
        api: 'every /api request intercepted; only lookup and occupancy POSTs were permitted, all mutations stayed in browser fixtures',
        pageErrors,
        unexpectedHttpErrors
    }, null, 2), 'utf8');

    async function applyMode({ theme, direction }) {
        const currentTheme = await page.evaluate(() => document.documentElement.dataset.theme);
        if (currentTheme !== theme) {
            await page.locator('[data-theme-toggle]').click();
            await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe(theme);
        }
        await page.evaluate(value => { document.documentElement.dir = value; }, direction);
        await expect.poll(() => page.evaluate(() => document.documentElement.dir)).toBe(direction);
    }

    async function assertRoot(name, selector, focusSelector, width, mode) {
        const root = page.locator(selector);
        await expect(root, `${name} root visible`).toBeVisible();
        if (focusSelector) {
            const focusTarget = page.locator(focusSelector).first();
            await expect(focusTarget, `${name} focus target visible`).toBeVisible();
            await focusTarget.focus({ focusVisible: true });
            const focusStyle = await focusTarget.evaluate(element => {
                const style = getComputedStyle(element);
                return { outlineWidth: parseFloat(style.outlineWidth), boxShadow: style.boxShadow };
            });
            expect(focusStyle.outlineWidth > 0 || focusStyle.boxShadow !== 'none', `${name} keyboard focus visible`).toBe(true);
        }
        const bounds = await page.evaluate(selectorValue => {
            const element = document.querySelector(selectorValue);
            const rect = element.getBoundingClientRect();
            return {
                viewport: document.documentElement.clientWidth,
                document: document.documentElement.scrollWidth,
                left: rect.left,
                right: rect.right,
                width: rect.width,
                direction: document.documentElement.dir,
                theme: document.documentElement.dataset.theme
            };
        }, selector);
        expect(bounds.direction).toBe(mode.direction);
        expect(bounds.theme).toBe(mode.theme);
        expect(bounds.document, `${name} at ${width}px has no page overflow`).toBeLessThanOrEqual(bounds.viewport + 1);
        expect(bounds.left, `${name} stays within inline start`).toBeGreaterThanOrEqual(-1);
        expect(bounds.right, `${name} stays within inline end`).toBeLessThanOrEqual(bounds.viewport + 1);
    }

    async function capture(name, selector, width, mode) {
        const suffix = `${width}-${mode.theme}-${mode.direction}`;
        await page.screenshot({ path: path.join(artifacts, `${name}-${suffix}.png`), fullPage: true });
        await fsp.appendFile(path.join(artifacts, `${name}-${suffix}.json`), JSON.stringify(await page.evaluate(selectorValue => {
            const rect = document.querySelector(selectorValue).getBoundingClientRect();
            return { width: document.documentElement.clientWidth, pageWidth: document.documentElement.scrollWidth, root: { left: rect.left, right: rect.right, width: rect.width } };
        }, selector)) + '\n', 'utf8');
    }
});
