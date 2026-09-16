'use strict';

const { chromium } = require('playwright');

const BASE_URL = process.env.QA_BASE_URL || 'http://127.0.0.1:4173';
const API_DELAYS = {
    '/api/auth/session': 60,
    '/api/branding': 180,
    '/api/saas/entitlements': 120,
    '/api/bootstrap': 80,
    '/api/dashboard': 150
};

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function responseFor(pathname) {
    if (pathname === '/api/auth/session') {
        return {
            authenticated: true,
            user: {
                id: 1,
                role: 'Owner',
                tenantId: 1,
                tenantType: 'gym',
                name: 'QA Owner',
                permissions: ['members.read', 'dashboard.read']
            }
        };
    }
    if (pathname === '/api/branding') return { branding: { gymName: 'QA Gym', logoUrl: '' } };
    if (pathname === '/api/saas/entitlements') {
        return {
            tenantStatus: 'active',
            subscription: { status: 'active', plan: { code: 'starter' } },
            entitlements: { tenantType: 'gym', features: { dashboard: true, members: true, attendance: true, reports: true }, limits: {} }
        };
    }
    if (pathname === '/api/bootstrap' || pathname === '/api/branches/bootstrap') {
        return {
            branch: { id: 1, name: 'Main', status: 'active' },
            branches: [{ id: 1, name: 'Main', status: 'active' }],
            activeBranches: [{ id: 1, name: 'Main', status: 'active' }],
            hasMultipleActiveBranches: false,
            branchLimit: 1
        };
    }
    if (pathname === '/api/dashboard') return { stats: { total: 10, active: 8, expiringSoon: 1, expired: 1, frozen: 0 }, alerts: [] };
    if (pathname === '/api/saas/subscription') return { subscription: { status: 'active', plan: { code: 'starter' } } };
    return {};
}

async function run() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
    const startedAt = Date.now();
    const requests = [];
    await page.route('**/api/**', async (route) => {
        const pathname = new URL(route.request().url()).pathname;
        await wait(API_DELAYS[pathname] || 10);
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(responseFor(pathname)) });
    });
    page.on('request', (request) => {
        const url = request.url();
        if (url.includes('/api/') || url.includes('/app.js')) requests.push({ url, at: Date.now() - startedAt });
    });
    const navigationStarted = Date.now();
    await page.goto(`${BASE_URL}/?welcome=1`, { waitUntil: 'domcontentloaded' });
    const domContentLoaded = Date.now() - navigationStarted;
    await page.waitForFunction(() => !document.body.classList.contains('auth-pending'), null, { timeout: 10000 });
    const appShellVisible = Date.now() - navigationStarted;
    const welcomeAtShell = await page.locator('.tenant-welcome-card').boundingBox().catch(() => null);
    await page.evaluate(() => window.topGymAppReady || Promise.resolve());
    const appScriptReady = Date.now() - navigationStarted;
    let appUsable = null;
    try {
        await page.waitForFunction(() => Boolean(window.topGymAppUsable), null, { timeout: 10000 });
        await page.evaluate(() => Promise.race([
            window.topGymAppUsable,
            new Promise((_, reject) => setTimeout(() => reject(new Error('app usable timeout')), 10000))
        ]));
        appUsable = Date.now() - navigationStarted;
    } catch {
        // The trace remains useful when a mocked route does not satisfy a
        // page-specific API; the timeout is reported by the measured value.
    }
    const dashboardUsable = Date.now() - navigationStarted;
    await page.waitForTimeout(300);
    const resources = await page.evaluate(() => performance.getEntriesByType('resource')
        .map((entry) => ({
            name: new URL(entry.name).pathname,
            start: Math.round(entry.startTime),
            duration: Math.round(entry.duration),
            transfer: entry.transferSize || 0,
            decoded: entry.decodedBodySize || 0
        }))
        .filter((entry) => entry.name.endsWith('.css') || entry.name.endsWith('.js') || entry.name.endsWith('.html')));
    const welcome = await page.locator('.tenant-welcome-card').boundingBox().catch(() => null);
    const welcomeHiddenAfterReady = await page.locator('#tenantWelcomeLayer').getAttribute('hidden').then((value) => value !== null).catch(() => false);
    console.log(JSON.stringify({
        domContentLoaded,
        appShellVisible,
        appScriptReady,
        appUsable,
        dashboardUsable,
        welcomeAtShell,
        welcome,
        welcomeHiddenAfterReady,
        requests,
        resources,
        total: Date.now() - navigationStarted
    }, null, 2));
    await browser.close();
    process.exit(0);
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
