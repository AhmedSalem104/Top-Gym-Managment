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
        if (!target.startsWith(`${cssRoot}${path.sep}`)) throw new Error(`CSS import escaped the source root: ${importPath}`);
        return expandCss(target, [...chain, absolute]);
    });
}

// Serve the exact current CSS source tree as an in-memory minified delivery
// bundle. This verifies canonical styles without writing generated bundles.
const fixtureCss = esbuild.transformSync(
    expandCss(path.join(cssRoot, 'main.source.css')),
    { loader: 'css', minify: true, legalComments: 'none' }
).code;

test('Member Portal V2 covers all six roots and five tools across themes and responsive viewports', async ({ page }, testInfo) => {
    const apiRequests = [];
    const coveredRoots = new Set();
    const fixture = {
        tenant: { name: 'نادي اختبار بوابة العضوية', slug: 'qa-member-club' },
        member: {
            fullName: 'عضو تجريبي لاختبار بوابة العضوية',
            phone: '+201001234567',
            phoneCountry: 'EG',
            email: 'portal-member@example.test',
            registrationDate: '2024-04-12T00:00:00.000Z'
        },
        currentMembership: {
            id: 55101,
            status: 'active',
            plan: 'gym_only',
            type: 'monthly',
            startDate: '2026-09-01T00:00:00.000Z',
            endDate: '2026-10-31T00:00:00.000Z',
            daysRemaining: 20
        },
        memberships: [],
        payments: [],
        attendance: [],
        freezes: [],
        attendanceSummary: { totalVisits: 12 },
        financialSummary: { totalDue: 1200, totalPaid: 1200, totalRemaining: 0 },
        firstJoinDate: '2024-04-12T00:00:00.000Z',
        reportNumber: 'QA-PORTAL-V2',
        issuedAt: '2026-10-11T09:00:00.000Z'
    };

    // All endpoints are intercepted; this test cannot write to a tenant DB or Production.
    await page.route('**/css/main.css*', (route) => route.fulfill({
        status: 200,
        contentType: 'text/css; charset=utf-8',
        body: fixtureCss
    }));
    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        apiRequests.push({ method: request.method(), pathname: url.pathname });

        if (url.pathname === '/api/branding') {
            return route.fulfill({ json: { branding: { identity: { brandName: 'نادي اختبار بوابة العضوية' } }, version: 1 } });
        }
        if (url.pathname === '/api/member-portal/lookup' && request.method() === 'POST') {
            expect(request.postDataJSON().membershipCode).toBe('QA-MEMBER-V2');
            return route.fulfill({ json: fixture });
        }
        if (url.pathname === '/api/member-portal/occupancy' && request.method() === 'POST') {
            return route.fulfill({ json: { presentCount: 4, level: 'quiet', observedAt: '2026-10-11T09:00:00.000Z' } });
        }
        if (url.pathname === '/api/member-portal/library/options') {
            return route.fulfill({ json: { filters: { categories: [], difficulties: [], equipment: [] } } });
        }
        if (/^\/api\/member-portal\/library\/(exercises|foods)$/.test(url.pathname)) {
            return route.fulfill({ json: { items: [], pagination: { page: 1, pageSize: 18, totalItems: 0, totalPages: 0 } } });
        }
        if (url.pathname === '/api/member-portal/membership-catalog') {
            return route.fulfill({ json: { plans: [{ code: 'gym_only', label: 'جيم فقط' }], types: [{ code: 'monthly', label: 'شهرية', durationDays: 30 }] } });
        }
        if (url.pathname === '/api/member-portal/payment-methods') {
            return route.fulfill({ json: { paymentMethods: [] } });
        }
        if (url.pathname === '/api/member-portal/subscription-requests') {
            return route.fulfill({ json: { requests: [] } });
        }
        return route.fulfill({ json: {} });
    });

    await page.addInitScript(() => window.localStorage.setItem('topGym-theme', 'light'));
    await page.goto('/member-portal', { waitUntil: 'networkidle' });
    await expect(page.locator('#portalLoginPanel')).toBeVisible();
    coveredRoots.add('portalLoginPanel');
    await expect(page.locator('#membershipCodeInput')).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.dir)).toBe('rtl');
    await captureLayout('login-light');

    await toggleTheme('dark');
    await captureLayout('login-dark');
    await toggleTheme('light');

    await page.locator('#membershipCodeInput').fill('QA-MEMBER-V2');
    await page.locator('#portalLookupForm button[type="submit"]').click();
    const result = page.locator('#portalResult');
    await expect(result).toBeVisible();
    coveredRoots.add('portalResult');
    coveredRoots.add('portalHomeView');
    await expect(result.locator('.portal-tool-card')).toHaveCount(5);
    await expect(result.locator('[data-portal-tool="print"]')).toBeVisible();
    await expect(result.locator('[data-portal-tool="feedback"]')).toBeVisible();
    await expect(result.locator('[data-portal-tool="exercises"]')).toBeVisible();
    await expect(result.locator('[data-portal-tool="foods"]')).toBeVisible();
    await expect(result.locator('[data-portal-tool="subscription"]')).toBeVisible();
    await expect(page.locator('#portalHomeView')).toBeVisible();
    await captureLayout('member-hub-light');

    await verifyAllTools('light');
    await toggleTheme('dark');
    await expect(result).toBeVisible();
    await captureLayout('member-hub-dark');
    await verifyAllTools('dark');

    expect(apiRequests.filter((request) => request.pathname === '/api/member-portal/lookup')).toHaveLength(1);
    expect([...coveredRoots].sort()).toEqual([
        'portalFeedbackSection', 'portalHomeView', 'portalLibrarySection',
        'portalLoginPanel', 'portalResult', 'portalSubscriptionSection'
    ]);
    expect(apiRequests.some((request) => request.method !== 'GET'
        && !['/api/member-portal/lookup', '/api/member-portal/occupancy'].includes(request.pathname))).toBe(false);

    async function toggleTheme(theme) {
        const current = await page.evaluate(() => document.documentElement.dataset.theme);
        if (current !== theme) await page.locator('[data-theme-toggle]').click();
        await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe(theme);
    }

    async function verifyAllTools(theme) {
        const tools = [
            { id: 'print', root: '#portalReportContent', viewTitle: 'بياناتي وطباعتها', state: 'report' },
            { id: 'feedback', root: '#portalFeedbackSection', rootId: 'portalFeedbackSection', viewTitle: 'قيّم تجربتي', state: 'feedback' },
            { id: 'exercises', root: '#portalLibrarySection', rootId: 'portalLibrarySection', viewTitle: 'دليل التمارين', state: 'exercises' },
            { id: 'foods', root: '#portalLibrarySection', rootId: 'portalLibrarySection', viewTitle: 'دليل التغذية', state: 'foods' },
            { id: 'subscription', root: '#portalSubscriptionSection', rootId: 'portalSubscriptionSection', viewTitle: 'اشترك أو جدد عضويتك', state: 'subscription' }
        ];
        for (const tool of tools) {
            const trigger = page.locator(`[data-portal-tool="${tool.id}"]`);
            await trigger.focus();
            await expect(trigger).toBeFocused();
            await page.keyboard.press('Enter');
            await expect(page.locator(tool.root)).toBeVisible();
            await expect(page.locator('#portalViewTitle')).toHaveText(tool.viewTitle);
            if (tool.rootId) coveredRoots.add(tool.rootId);
            if (tool.id === 'exercises' || tool.id === 'foods') {
                await expect(page.locator('#portalLibraryTitle')).toBeVisible();
                await expect(page.locator('#portalLibraryContent .portal-library-state')).toBeVisible();
            }
            if (tool.id === 'subscription') {
                await expect(page.locator('#portalSubscriptionPlan')).toHaveValue('gym_only');
                await expect(page.locator('#portalSubscriptionHistory')).toBeVisible();
            }
            await captureLayout(`${tool.state}-${theme}`);
            await page.locator(tool.id === 'exercises' || tool.id === 'foods'
                ? '#portalLibraryMount [data-library-close]'
                : '[data-portal-back]').click();
            await expect(page.locator('#portalHomeView')).toBeVisible();
        }
    }

    async function captureLayout(state) {
        const metrics = await page.evaluate(() => {
            const boundsOf = (selector) => {
                const element = document.querySelector(selector);
                if (!element || element.hidden) return null;
                const bounds = element.getBoundingClientRect();
                return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, right: bounds.right, bottom: bounds.bottom };
            };
            const grid = document.querySelector('.portal-tool-grid');
            const gridColumns = grid && getComputedStyle(grid).display === 'grid'
                ? getComputedStyle(grid).gridTemplateColumns.split(' ').length
                : 0;
            const occupancyStatus = boundsOf('.portal-occupancy-status');
            const occupancyMeta = boundsOf('.portal-occupancy-meta');
            return {
                viewportWidth: document.documentElement.clientWidth,
                documentWidth: document.documentElement.scrollWidth,
                direction: document.documentElement.dir,
                theme: document.documentElement.dataset.theme,
                activeRoots: ['portalLoginPanel', 'portalResult', 'portalHomeView', 'portalFeedbackSection', 'portalLibrarySection', 'portalSubscriptionSection']
                    .filter((id) => { const element = document.getElementById(id); return element && !element.hidden; }),
                toolGridColumns: gridColumns,
                occupancyStatus,
                occupancyMeta,
                result: boundsOf('#portalResult'),
                shell: boundsOf('.portal-shell'),
                libraryModalVisible: Boolean(document.querySelector('#portalLibraryModal:not([hidden])'))
            };
        });
        expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
        expect(metrics.direction).toBe('rtl');
        expect(metrics.result?.right ?? metrics.shell.right).toBeLessThanOrEqual(metrics.viewportWidth + 1);
        if (state.startsWith('member-hub')) {
            const expectedColumns = metrics.viewportWidth >= 1041 ? 3 : metrics.viewportWidth > 640 ? 2 : 1;
            expect(metrics.toolGridColumns).toBe(expectedColumns);
            if (metrics.viewportWidth >= 1041) {
                const statusCenter = metrics.occupancyStatus.y + metrics.occupancyStatus.height / 2;
                const metaCenter = metrics.occupancyMeta.y + metrics.occupancyMeta.height / 2;
                expect(Math.abs(statusCenter - metaCenter)).toBeLessThan(2);
            }
        }

        const artifactStem = `member-portal-v2-${testInfo.project.name}-${metrics.theme}-${state}`;
        const evidenceDirectory = path.join(projectRoot, 'qa/artifacts/member-portal-v2-qa');
        await fsp.mkdir(evidenceDirectory, { recursive: true });
        await page.screenshot({ path: path.join(evidenceDirectory, `${artifactStem}.png`), fullPage: true });
        await fsp.writeFile(path.join(evidenceDirectory, `${artifactStem}.json`), JSON.stringify(metrics, null, 2), 'utf8');
    }
});
