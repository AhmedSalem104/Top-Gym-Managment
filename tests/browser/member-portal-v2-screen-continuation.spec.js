'use strict';

const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const esbuild = require('esbuild');

const projectRoot = path.resolve(__dirname, '../..');
const cssRoot = path.join(projectRoot, 'public/css');
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

const fixtureCss = esbuild.transformSync(
    expandCss(path.join(cssRoot, 'main.source.css')),
    { loader: 'css', minify: true, legalComments: 'none' }
).code;

const viewports = [320, 390, 768, 1024, 1440, 1920];
const toolViews = [
    { id: 'print', name: 'print', root: '#portalReportContent' },
    { id: 'feedback', name: 'feedback', root: '#portalFeedbackSection' },
    { id: 'exercises', name: 'exercises', root: '#portalLibrarySection' },
    { id: 'foods', name: 'foods', root: '#portalLibrarySection' },
    { id: 'subscription', name: 'subscription', root: '#portalSubscriptionSection' }
];

test('Member Portal six roots and five tools: 6 widths × Light/Dark, RTL, focus and overflow', async ({ page }) => {
    test.setTimeout(300_000);
    const apiRequests = [];
    const consoleErrors = [];
    page.on('pageerror', error => consoleErrors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });

    const fixture = {
        tenant: { name: 'نادي اختبار بوابة العضوية', slug: 'qa-member-club' },
        member: {
            fullName: 'عضو تجريبي طويل لاختبار واجهة بوابة العضوية',
            phone: '+201001234567', phoneCountry: 'EG',
            email: 'portal-member@example.test', registrationDate: '2024-04-12T00:00:00.000Z'
        },
        currentMembership: {
            id: 55101, status: 'active', plan: 'gym_only', type: 'monthly',
            startDate: '2026-09-01T00:00:00.000Z', endDate: '2026-10-31T00:00:00.000Z', daysRemaining: 20
        },
        memberships: [{
            plan: 'gym_only', type: 'monthly', startDate: '2026-09-01T00:00:00.000Z',
            endDate: '2026-10-31T00:00:00.000Z', status: 'active',
            amountDue: 1200, amountPaid: 1200, amountRemaining: 0
        }],
        payments: [{
            receiptNumber: 'QA-RECEIPT-2026-000041', transactionDate: '2026-09-01T10:30:00.000Z',
            transactionType: 'subscription', amountPaid: 1200, amountRemaining: 0, paymentMethod: 'cash'
        }],
        attendance: [{
            attendanceDate: '2026-10-10', checkInAt: '2026-10-10T17:15:00.000Z',
            checkOutAt: '2026-10-10T18:35:00.000Z', durationMinutes: 80
        }],
        freezes: [{ startDate: '2026-08-01', endDate: '2026-08-08', resumedDate: '2026-08-08', days: 7 }],
        attendanceSummary: { totalVisits: 12 },
        financialSummary: { totalDue: 1200, totalPaid: 1200, totalRemaining: 0 },
        firstJoinDate: '2024-04-12T00:00:00.000Z', reportNumber: 'QA-PORTAL-V2',
        issuedAt: '2026-10-11T09:00:00.000Z'
    };

    await page.route('**/css/main.css*', route => route.fulfill({
        status: 200, contentType: 'text/css; charset=utf-8', body: fixtureCss
    }));
    await page.route('**/api/**', async route => {
        const request = route.request();
        const url = new URL(request.url());
        apiRequests.push({ method: request.method(), pathname: url.pathname });

        if (url.pathname === '/api/branding') {
            return route.fulfill({ json: { branding: { identity: { brandName: fixture.tenant.name } }, version: 1 } });
        }
        if (url.pathname === '/api/member-portal/lookup' && request.method() === 'POST') {
            expect(request.postDataJSON().membershipCode).toBe('QA-MEMBER-V2');
            return route.fulfill({ json: fixture });
        }
        if (url.pathname === '/api/member-portal/occupancy') {
            return route.fulfill({ json: { presentCount: 4, level: 'quiet', observedAt: '2026-10-11T09:00:00.000Z' } });
        }
        if (url.pathname === '/api/member-portal/library/options') {
            return route.fulfill({ json: { filters: { categories: [], difficulties: [], equipment: [] } } });
        }
        if (/^\/api\/member-portal\/library\/(exercises|foods)$/.test(url.pathname)) {
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
            return route.fulfill({ json: { paymentMethods: [{
                id: 4401, name: 'تحويل تجريبي', recipientName: 'نادي اختبار بوابة العضوية',
                instructions: 'بيانات آمنة للاختبار البصري فقط', accountReference: '**** 1234'
            }] } });
        }
        if (url.pathname === '/api/member-portal/subscription-requests') {
            return route.fulfill({ json: { requests: [{
                id: 88001, requestType: 'renewal', status: 'pending',
                membership: { type: 'monthly', startDate: '2026-11-01T00:00:00.000Z' },
                pricing: { amountDue: 1200, currency: 'EGP' }, proof: { verified: false }
            }] } });
        }
        return route.fulfill({ json: {} });
    });

    const evidenceDirectory = path.join(projectRoot, 'qa/artifacts/member-portal-v2-screen-continuation');
    await fsp.mkdir(evidenceDirectory, { recursive: true });

    for (const width of viewports) {
        await page.setViewportSize({ width, height: width <= 390 ? 844 : 960 });
        await page.addInitScript(() => localStorage.setItem('topgym-theme', 'light'));
        await page.goto('/member-portal', { waitUntil: 'networkidle' });
        await assertView('login', '#portalLoginPanel', 'light', width);
        await capture('login', 'light', width);

        await page.locator('[data-theme-toggle]').focus();
        await assertFocused('[data-theme-toggle]');
        await page.keyboard.press('Enter');
        await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
        await assertView('login', '#portalLoginPanel', 'dark', width);
        await capture('login', 'dark', width);
        await page.locator('[data-theme-toggle]').focus();
        await assertFocused('[data-theme-toggle]');
        await page.keyboard.press('Enter');
        await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');

        await page.locator('#membershipCodeInput').fill('QA-MEMBER-V2');
        await page.locator('#portalLookupForm button[type="submit"]').focus();
        await page.keyboard.press('Enter');
        await expect(page.locator('#portalResult')).toBeVisible();
        await expect(page.locator('.portal-tool-card')).toHaveCount(5);
        await assertView('result', '#portalResult', 'light', width);
        await capture('result', 'light', width);
        await assertView('home', '#portalHomeView', 'light', width);
        await capture('home', 'light', width);

        for (const tool of toolViews) {
            await openAndCaptureTool(tool, 'light', width);
        }

        await page.locator('[data-theme-toggle]').focus();
        await assertFocused('[data-theme-toggle]');
        await page.keyboard.press('Enter');
        await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
        await assertView('result', '#portalResult', 'dark', width);
        await capture('result', 'dark', width);
        await assertView('home', '#portalHomeView', 'dark', width);
        await capture('home', 'dark', width);
        for (const tool of toolViews) {
            await openAndCaptureTool(tool, 'dark', width);
        }
    }

    expect(apiRequests.length).toBeGreaterThan(0);
    expect(apiRequests.filter(request => request.method !== 'GET'
        && !['/api/member-portal/lookup', '/api/member-portal/occupancy'].includes(request.pathname))).toEqual([]);
    expect(consoleErrors).toEqual([]);
    const captured = (await fsp.readdir(evidenceDirectory)).filter(name => name.endsWith('.png'));
    expect(captured).toHaveLength(96);
    await fsp.writeFile(path.join(evidenceDirectory, 'matrix.json'), JSON.stringify({
        viewportWidths: viewports,
        themes: ['light', 'dark'],
        direction: 'rtl',
        roots: ['login', 'result', 'home', 'feedback', 'library', 'subscription'],
        tools: toolViews.map(tool => tool.name),
        screenshots: captured.length,
        apiMode: 'all API routes intercepted; only lookup/occupancy mocked POSTs; no write action submitted'
    }, null, 2), 'utf8');

    async function openAndCaptureTool(tool, theme, width) {
        const trigger = page.locator(`[data-portal-tool="${tool.id}"]`);
        await trigger.focus();
        await expect(trigger).toBeFocused();
        await assertFocused(`[data-portal-tool="${tool.id}"]`);
        await page.keyboard.press('Enter');
        await expect(page.locator(tool.root)).toBeVisible();
        const stateControl = tool.id === 'feedback'
            ? page.locator('#portalFeedbackStars button').first()
            : tool.id === 'subscription'
                ? page.locator('#portalSubscriptionPlan')
                : tool.id === 'exercises' || tool.id === 'foods'
                    ? page.locator('#portalLibrarySection input, #portalLibrarySection select').first()
                    : null;
        if (stateControl && await stateControl.count()) {
            await stateControl.focus();
            await expect(stateControl).toBeFocused();
            await assertFocused(stateControl);
        }
        await assertView(tool.name, tool.root, theme, width);
        await capture(tool.name, theme, width);
        const closeSelector = tool.id === 'exercises' || tool.id === 'foods'
            ? '#portalLibraryMount [data-library-close]'
            : '[data-portal-back]';
        await page.locator(closeSelector).focus();
        await expect(page.locator(closeSelector)).toBeFocused();
        await assertFocused(closeSelector);
        await page.keyboard.press('Enter');
        await expect(page.locator('#portalHomeView')).toBeVisible();
    }

    async function assertFocused(selector) {
        const target = typeof selector === 'string' ? page.locator(selector).first() : selector;
        const focus = await target.evaluate(element => {
            const style = getComputedStyle(element);
            return {
                visible: element.getBoundingClientRect().width > 0,
                outlineStyle: style.outlineStyle,
                outlineWidth: Number.parseFloat(style.outlineWidth),
                boxShadow: style.boxShadow
            };
        });
        expect(focus.visible).toBe(true);
        expect(focus.outlineWidth > 0 || focus.boxShadow !== 'none').toBe(true);
    }

    async function assertView(name, selector, theme, width) {
        const metrics = await page.evaluate(({ selector }) => {
            const root = document.querySelector(selector);
            const rect = root?.getBoundingClientRect();
            const active = document.activeElement;
            const activeStyle = active ? getComputedStyle(active) : null;
            return {
                viewport: document.documentElement.clientWidth,
                document: document.documentElement.scrollWidth,
                direction: document.documentElement.dir,
                theme: document.documentElement.dataset.theme,
                rootVisible: Boolean(root && !root.hidden && rect?.width),
                rootLeft: rect?.left ?? null,
                rootRight: rect?.right ?? null,
                focusVisible: Boolean(activeStyle && (activeStyle.outlineStyle !== 'none' || activeStyle.boxShadow !== 'none'))
            };
        }, { selector });

        expect(metrics.rootVisible, `${name} root should be visible`).toBe(true);
        expect(metrics.direction).toBe('rtl');
        expect(metrics.theme).toBe(theme);
        expect(metrics.document, `${name} ${width}px page overflow`).toBeLessThanOrEqual(metrics.viewport + 1);
        expect(metrics.rootLeft, `${name} extends left of viewport`).toBeGreaterThanOrEqual(-1);
        expect(metrics.rootRight, `${name} extends right of viewport`).toBeLessThanOrEqual(metrics.viewport + 1);
    }

    async function capture(name, theme, width) {
        const stem = `member-portal-${name}-${width}-${theme}-rtl`;
        await page.screenshot({ path: path.join(evidenceDirectory, `${stem}.png`), fullPage: true });
        const metrics = await page.evaluate(() => ({
            width: document.documentElement.clientWidth,
            documentWidth: document.documentElement.scrollWidth,
            direction: document.documentElement.dir,
            theme: document.documentElement.dataset.theme
        }));
        await fsp.writeFile(path.join(evidenceDirectory, `${stem}.json`), JSON.stringify(metrics, null, 2), 'utf8');
    }
});
