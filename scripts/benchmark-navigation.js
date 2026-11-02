'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { chromium } = require('@playwright/test');
const featureCatalog = require('../src/services/feature-catalog');

const REPEATS = Math.max(30, Number.parseInt(process.env.PERF_REPEATS || '30', 10));
const VIEWPORTS = [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'mobile-emulated', width: 390, height: 844 }
];
const repo = path.resolve(__dirname, '..');
const baseline = process.argv[2] ? path.resolve(process.argv[2]) : repo;
const current = process.argv[3] ? path.resolve(process.argv[3]) : repo;
const targets = { baseline, current };
const servers = new Map();
const ports = { baseline: 4174, current: 4175 };

function summarize(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const quantile = (p) => {
        if (!sorted.length) return null;
        const index = (sorted.length - 1) * p;
        const low = Math.floor(index);
        const high = Math.ceil(index);
        return sorted[low] + (sorted[high] - sorted[low]) * (index - low);
    };
    const mean = values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
    const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / Math.max(values.length, 1);
    return {
        n: values.length,
        medianMs: Number(quantile(0.5)?.toFixed(2) ?? 0),
        p75Ms: Number(quantile(0.75)?.toFixed(2) ?? 0),
        p95Ms: Number(quantile(0.95)?.toFixed(2) ?? 0),
        meanMs: Number(mean.toFixed(2)),
        coefficientOfVariationPercent: Number(((Math.sqrt(variance) / Math.max(mean, 0.001)) * 100).toFixed(2))
    };
}

function fixtures() {
    return {
        '/api/auth/session': { authenticated: true, user: { id: 94001, name: 'Performance QA Owner', role: 'Owner', tenantId: 94001, tenantType: 'gym', mustChangePassword: false, permissions: ['dashboard.read', 'members.read', 'pricing.read'] } },
        '/api/branding': { branding: { identity: { brandName: 'Performance QA Gym' }, assets: {} } },
        '/api/saas/entitlements': { tenantStatus: 'active', subscription: { status: 'active', plan: { code: 'starter' } }, entitlements: { tenantType: 'gym', features: { dashboard: true, members: true, attendance: true, reports: true }, featureCatalog: featureCatalog.getFeatureCatalog({ tenantType: 'gym' }), limits: {} } },
        '/api/branches/bootstrap': { branch: { id: 94001, name: 'QA Branch', status: 'active' }, branches: [{ id: 94001, name: 'QA Branch', status: 'active' }], activeBranches: [{ id: 94001, name: 'QA Branch', status: 'active' }], hasMultipleActiveBranches: false, branchLimit: 1 },
        '/api/dashboard': { stats: { total: 0, active: 0, expiringSoon: 0, expired: 0, frozen: 0 }, alerts: [] },
        '/api/members': { members: [], pagination: { page: 1, pageSize: 10, total: 0, pages: 0 } },
        '/api/pricing': { plans: {}, types: {} },
        '/api/saas/subscription': { subscription: { status: 'active', plan: { code: 'starter' } } }
    };
}

async function installApiFixture(page, tracker) {
    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const entry = { method: request.method(), path: url.pathname, at: Date.now() };
        tracker.requests.push(entry);
        if (!['GET', 'HEAD'].includes(request.method())) {
            tracker.writes.push(entry);
            return route.fulfill({ status: 405, contentType: 'application/json', body: JSON.stringify({ error: 'Read-only performance fixture' }) });
        }
        if (url.pathname === '/api/notifications/stream') {
            return route.fulfill({ status: 200, contentType: 'text/event-stream', headers: { 'cache-control': 'no-cache' }, body: 'retry: 60000\n: qa-ready\n\n' });
        }
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixtures()[url.pathname] || {}) });
    });
}

async function waitForServer(name, root, port) {
    const child = spawn(process.execPath, [path.join(root, 'scripts', 'serve-browser-qa.js')], {
        cwd: root,
        env: { ...process.env, CI: '1', PORT: String(port) },
        stdio: 'ignore'
    });
    servers.set(name, child);
    const endpoint = `http://127.0.0.1:${port}/api/health`;
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
        if (child.exitCode !== null) throw new Error(`${name} QA server exited with ${child.exitCode}`);
        try {
            const response = await fetch(endpoint);
            if (response.ok) return `http://127.0.0.1:${port}`;
        } catch (_) { /* server is still starting */ }
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`${name} QA server did not become ready`);
}

async function openDashboard(browser, baseUrl, viewport) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, locale: 'ar-EG', colorScheme: 'dark', reducedMotion: 'no-preference' });
    const page = await context.newPage();
    const tracker = { requests: [], writes: [], errors: [] };
    page.on('pageerror', (error) => tracker.errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') tracker.errors.push(message.text()); });
    await installApiFixture(page, tracker);
    const response = await page.goto(`${baseUrl}/index.html?welcome=1#dashboard`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    if (!response?.ok()) throw new Error(`Dashboard returned HTTP ${response?.status()}`);
    await page.evaluate(() => window.topGymAppUsable);
    await page.waitForFunction(() => {
        const dashboard = document.getElementById('dashboardSection');
        return Boolean(window.topGymAuth?.isReady?.() && dashboard && !dashboard.hidden);
    }, null, { timeout: 30_000 });
    return { context, page, tracker };
}

async function routeTransition(page, target, viewport) {
    if (viewport.width < 768) {
        const shell = page.locator('.app-shell');
        if (!(await shell.evaluate((element) => element.classList.contains('mobile-nav-open')))) {
            await page.locator('#mobileNavToggle').click();
            await page.waitForFunction(() => document.querySelector('.app-shell')?.classList.contains('mobile-nav-open'));
        }
    }
    return page.evaluate((name) => new Promise((resolve, reject) => {
        const trigger = document.querySelector(`[data-page-tab="${name}"]`);
        if (!trigger) return reject(new Error(`Missing navigation trigger: ${name}`));
        const started = performance.now();
        let frames = 0;
        trigger.click();
        const check = () => {
            if (document.documentElement.dataset.topGymActiveTab === name) return resolve(performance.now() - started);
            frames += 1;
            if (frames > 180) return reject(new Error(`Navigation to ${name} did not commit`));
            requestAnimationFrame(check);
        };
        check();
    }), target);
}

async function measureColdSample(browser, baseUrl, viewport) {
    const { context, page, tracker } = await openDashboard(browser, baseUrl, viewport);
    const timings = await page.evaluate(() => {
        const navigation = performance.getEntriesByType('navigation')[0];
        return {
            readyMs: performance.now(),
            dclMs: navigation?.domContentLoadedEventEnd ?? null,
            transferBytes: performance.getEntriesByType('resource').reduce((sum, resource) => sum + (resource.transferSize || 0), 0)
        };
    });
    const result = { ...timings, requests: tracker.requests.map(({ path: endpoint }) => endpoint), writes: tracker.writes, errors: tracker.errors };
    await context.close();
    return result;
}

async function measureWarmBuild(browser, name, baseUrl, viewport) {
    const warmNavigation = [];
    const warmApi = new Map();
    const { context, page, tracker } = await openDashboard(browser, baseUrl, viewport);
    await routeTransition(page, 'members', viewport);
    await routeTransition(page, 'dashboard', viewport);
    await routeTransition(page, 'members', viewport);
    await routeTransition(page, 'dashboard', viewport);
    await page.waitForTimeout(300);
    tracker.requests.length = 0;
    let nextRoute = 'members';
    for (let index = 0; index < REPEATS; index += 1) {
        const before = tracker.requests.length;
        warmNavigation.push(await routeTransition(page, nextRoute, viewport));
        await page.waitForTimeout(100);
        tracker.requests.slice(before).forEach(({ path: endpoint }) => warmApi.set(endpoint, (warmApi.get(endpoint) || 0) + 1));
        nextRoute = nextRoute === 'members' ? 'dashboard' : 'members';
    }
    const result = {
        build: name,
        viewport: viewport.name,
        repeatCount: REPEATS,
        warmRouteCommit: summarize(warmNavigation),
        warmApiRequestsPerBuild: Object.fromEntries(warmApi),
        browserErrors: tracker.errors,
        apiWrites: tracker.writes
    };
    await context.close();
    return result;
}

async function profileWarmNavigation(browser, name, baseUrl, viewport) {
    const { context, page } = await openDashboard(browser, baseUrl, viewport);
    await routeTransition(page, 'members', viewport);
    await routeTransition(page, 'dashboard', viewport);
    const session = await context.newCDPSession(page);
    await session.send('Profiler.enable');
    await session.send('Profiler.setSamplingInterval', { interval: 1000 });
    await session.send('Profiler.start');
    for (const target of ['members', 'dashboard', 'members', 'dashboard']) await routeTransition(page, target, viewport);
    const { profile } = await session.send('Profiler.stop');
    const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
    const selfTime = new Map();
    profile.samples.forEach((id, index) => {
        const frame = nodes.get(id)?.callFrame;
        const key = `${frame?.functionName || '(anonymous)'} ${frame?.url || ''}`.trim();
        selfTime.set(key, (selfTime.get(key) || 0) + (profile.timeDeltas[index] || 0));
    });
    const topFrames = [...selfTime].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([frame, micros]) => ({ frame, selfTimeMs: Number((micros / 1000).toFixed(2)) }));
    await session.detach();
    await context.close();
    return { build: name, viewport: viewport.name, profileScope: 'four warmed route transitions; profiler enabled only for this sample', topFrames };
}

async function main() {
    if (!Number.isInteger(REPEATS) || REPEATS < 30) throw new Error('PERF_REPEATS must be an integer >= 30');
    const baseUrls = {};
    for (const name of Object.keys(targets)) baseUrls[name] = await waitForServer(name, targets[name], ports[name]);
    const executablePath = process.env.PLAYWRIGHT_CHROME_PATH || [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    ].find((candidate) => fs.existsSync(candidate));
    const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
    try {
        const measurements = [];
        for (const viewport of VIEWPORTS) {
            const coldResults = { baseline: [], current: [] };
            for (let index = 0; index < REPEATS; index += 1) {
                const order = index % 2 ? ['current', 'baseline'] : ['baseline', 'current'];
                for (const name of order) coldResults[name].push(await measureColdSample(browser, baseUrls[name], viewport));
            }
            for (const name of ['baseline', 'current']) {
                const samples = coldResults[name];
                const coldApi = new Map();
                samples.flatMap((sample) => sample.requests).forEach((endpoint) => coldApi.set(endpoint, (coldApi.get(endpoint) || 0) + 1));
                measurements.push({
                    build: name,
                    viewport: viewport.name,
                    repeatCount: REPEATS,
                    coldRouteReady: summarize(samples.map((sample) => sample.readyMs)),
                    domContentLoaded: summarize(samples.map((sample) => sample.dclMs).filter(Number.isFinite)),
                    initialTransferBytes: summarize(samples.map((sample) => sample.transferBytes)),
                    coldApiRequestsPerBuild: Object.fromEntries(coldApi),
                    browserErrors: samples.flatMap((sample) => sample.errors),
                    apiWrites: samples.flatMap((sample) => sample.writes)
                });
                measurements.push(await measureWarmBuild(browser, name, baseUrls[name], viewport));
            }
        }
        const warmProfiles = [];
        for (const viewport of VIEWPORTS) {
            for (const name of ['baseline', 'current']) warmProfiles.push(await profileWarmNavigation(browser, name, baseUrls[name], viewport));
        }
        const report = {
            generatedAt: new Date().toISOString(),
            environment: { node: process.version, browser: browser.version(), qaFixture: true, productionBuilds: true, cachePolicy: 'fresh isolated browser context for each cold sample; same origin server policy', cpuThrottling: 'none', mobile: '390x844 emulated viewport; not a physical device' },
            measurements,
            warmProfiles
        };
        const reportPath = path.join(repo, 'qa', 'reports', 'performance-stabilization.json');
        fs.mkdirSync(path.dirname(reportPath), { recursive: true });
        fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
        process.stdout.write(`NAVIGATION_BENCHMARK_REPORT ${reportPath}\n`);
        process.stdout.write(`NAVIGATION_BENCHMARK ${JSON.stringify({ environment: report.environment, measurements: measurements.map(({ build, viewport, repeatCount, coldRouteReady, domContentLoaded, initialTransferBytes, warmRouteCommit, coldApiRequestsPerBuild, warmApiRequestsPerBuild, browserErrors, apiWrites }) => ({ build, viewport, repeatCount, coldRouteReady, domContentLoaded, initialTransferBytes, warmRouteCommit, coldApiRequestsPerBuild, warmApiRequestsPerBuild, browserErrors: browserErrors.length, apiWrites: apiWrites.length })), warmProfiles })}\n`);
    } finally {
        await browser.close();
        for (const child of servers.values()) child.kill();
    }
}

main().catch((error) => {
    process.stderr.write(`${error.stack || error}\n`);
    for (const child of servers.values()) child.kill();
    process.exitCode = 1;
});
