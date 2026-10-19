const { test, expect } = require('@playwright/test');
const featureCatalog = require('../../src/services/feature-catalog');

test.use({ video: 'on' });

test('shared motion and cold/warm shell performance remain responsive', async ({ page }, testInfo) => {
    const requests = [];
    const writes = [];
    const consoleErrors = [];
    const pageErrors = [];
    const assetFailures = [];
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', (error) => pageErrors.push({ message: error.message, stack: error.stack }));
    page.on('response', (response) => {
        if (response.status() >= 400 && /\.(?:js|css|woff2?|svg|png|webp)(?:\?|$)/i.test(response.url())) assetFailures.push({ status: response.status(), url: response.url().split('?')[0] });
    });
    await page.addInitScript(() => {
        window.__logicFitLongTasks = [];
        window.__logicFitPaints = {};
        window.__logicFitMotionCalls = [];
        const originalAnimate = Element.prototype.animate;
        Element.prototype.animate = function (...args) {
            window.__logicFitMotionCalls.push({ target: this.id || this.className?.baseVal || this.className || this.tagName, frames: args[0], options: args[1] });
            return originalAnimate.apply(this, args);
        };
        if ('PerformanceObserver' in window) {
            try {
                new PerformanceObserver((list) => {
                    list.getEntries().forEach((entry) => { window.__logicFitPaints[entry.name] = Math.round(entry.startTime * 100) / 100; });
                }).observe({ type: 'paint', buffered: true });
            } catch (_) { /* Paint Timing may be unavailable in some engines. */ }
            try {
                new PerformanceObserver((list) => {
                    window.__logicFitLongTasks.push(...list.getEntries().map((entry) => Math.round(entry.duration * 100) / 100));
                }).observe({ type: 'longtask', buffered: true });
            } catch (_) { /* Long Tasks API is optional in some browsers. */ }
        }
    });
    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        requests.push({ method: request.method(), path: url.pathname });
        if (request.method() !== 'GET' && request.method() !== 'HEAD') {
            writes.push({ method: request.method(), path: url.pathname });
            await route.fulfill({ status: 405, contentType: 'application/json', body: JSON.stringify({ error: 'Read-only visual QA fixture' }) });
            return;
        }
        if (url.pathname === '/api/notifications/stream') {
            await route.fulfill({ status: 200, contentType: 'text/event-stream', headers: { 'cache-control': 'no-cache' }, body: 'retry: 60000\n: qa-ready\n\n' });
            return;
        }
        const fixtures = {
            '/api/auth/session': { authenticated: true, user: { id: 94001, name: 'Motion QA Owner', role: 'Owner', tenantId: 94001, tenantType: 'gym', mustChangePassword: false, permissions: ['dashboard.read', 'members.read', 'members.create', 'pricing.read'] } },
            '/api/branding': { branding: { identity: { brandName: 'Motion QA Gym' }, assets: {} } },
            '/api/saas/entitlements': { tenantStatus: 'active', subscription: { status: 'active', plan: { code: 'starter' } }, entitlements: { tenantType: 'gym', features: { dashboard: true, members: true, attendance: true, reports: true }, featureCatalog: featureCatalog.getFeatureCatalog({ tenantType: 'gym' }), limits: {} } },
            '/api/branches/bootstrap': { branch: { id: 94001, name: 'QA Branch', status: 'active' }, branches: [{ id: 94001, name: 'QA Branch', status: 'active' }], activeBranches: [{ id: 94001, name: 'QA Branch', status: 'active' }], hasMultipleActiveBranches: false, branchLimit: 1 },
            '/api/dashboard': { stats: { total: 0, active: 0, expiringSoon: 0, expired: 0, frozen: 0 }, alerts: [] },
            '/api/pricing': {
                plans: { gym_only: { label: 'Gym only', monthlyPrice: 305, active: true, sortOrder: 1 }, gym_cardio: { label: 'Gym + cardio', monthlyPrice: 400, active: true, sortOrder: 2 } },
                types: { monthly: { label: 'Monthly', mode: 'months', durationValue: 1, priceMultiplier: 1, active: true, sortOrder: 1 }, half_month: { label: 'Half month', mode: 'days', durationValue: 15, priceMultiplier: 0.5, active: true, sortOrder: 2 }, quarterly: { label: 'Quarterly', mode: 'months', durationValue: 3, priceMultiplier: 3, active: true, sortOrder: 3 }, semiannual: { label: 'Semiannual', mode: 'months', durationValue: 6, priceMultiplier: 6, active: true, sortOrder: 4 }, annual: { label: 'Annual', mode: 'months', durationValue: 12, priceMultiplier: 12, active: true, sortOrder: 5 } },
                durations: { monthly: 1, quarterly: 3, semiannual: 6, annual: 12 }
            },
            '/api/saas/subscription': { subscription: { status: 'active', plan: { code: 'starter' } } }
        };
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixtures[url.pathname] || {}) });
    });

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    let cpuProfile = null;
    let profiler = null;
    if (page.viewportSize().width >= 1400) {
        try {
            profiler = await page.context().newCDPSession(page);
            await profiler.send('Profiler.enable');
            await profiler.send('Profiler.setSamplingInterval', { interval: 1000 });
            await profiler.send('Profiler.start');
        } catch (_) { profiler = null; }
    }
    await page.goto('/index.html?welcome=1#dashboard', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => window.topGymAppUsable);
    await expect(page.locator('#dashboardSection')).toBeVisible();
    const cold = await page.evaluate(() => {
        const navigation = performance.getEntriesByType('navigation')[0];
        const resources = performance.getEntriesByType('resource');
        const paint = (name) => performance.getEntriesByName(name)[0]?.startTime ?? null;
        return {
            domContentLoadedMs: Math.round(navigation.domContentLoadedEventEnd * 100) / 100,
            loadEventMs: Math.round(navigation.loadEventEnd * 100) / 100,
            firstPaintMs: window.__logicFitPaints['first-paint'] ?? null,
            fcpMs: window.__logicFitPaints['first-contentful-paint'] ?? null,
            resourceCount: resources.length,
            transferredBytes: resources.reduce((sum, entry) => sum + (entry.transferSize || 0), 0),
            jsCount: resources.filter((entry) => /\.js(?:\?|$)/.test(entry.name)).length,
            cssCount: resources.filter((entry) => /\.css(?:\?|$)/.test(entry.name)).length
        };
    });
    if (profiler) {
        try {
            const { profile } = await profiler.send('Profiler.stop');
            const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
            cpuProfile = profile.samples.reduce((counts, nodeId, index) => {
                const node = nodes.get(nodeId);
                const frame = node?.callFrame;
                const key = `${frame?.functionName || '(anonymous)'} ${frame?.url || ''}`.trim();
                counts[key] = (counts[key] || 0) + (profile.timeDeltas[index] || 0);
                return counts;
            }, {});
            cpuProfile = Object.entries(cpuProfile).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([frame, microseconds]) => ({ frame, selfTimeMs: Math.round(microseconds / 100) / 10 }));
            await testInfo.attach('desktop-initial-load-cpu-profile-top-frames.json', { body: Buffer.from(JSON.stringify(cpuProfile, null, 2)), contentType: 'application/json' });
        } catch (_) { cpuProfile = null; }
        await profiler.detach().catch(() => {});
    }

    const routeTimings = [];
    let routeMotionObserved = false;
    const routeMotionSnapshots = [];
    for (const name of ['members', 'dashboard', 'members', 'dashboard']) {
        const started = await page.evaluate(() => performance.now());
        const tab = page.locator(`[data-page-tab="${name}"]`);
        if (!(await tab.isVisible()) && page.viewportSize().width < 768) {
            await page.locator('#mobileNavToggle').click();
            await expect(page.locator('.app-shell')).toHaveClass(/mobile-nav-open/);
            await expect(tab).toBeVisible();
        }
        await tab.click();
        await expect.poll(() => page.evaluate(() => document.documentElement.dataset.topGymActiveTab)).toBe(name);
        const motionSnapshot = await page.evaluate((activeName) => {
            const ids = { dashboard: 'dashboardSection', members: 'membersSection' };
            const surface = document.getElementById(ids[activeName] || `${activeName}Section`) || document.getElementById('dashboardSection');
            return {
                surface: surface?.id || null,
                hidden: surface?.hidden ?? null,
                display: surface ? getComputedStyle(surface).display : null,
                supported: typeof surface?.animate === 'function',
                reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
                animations: surface?.getAnimations().map((animation) => ({ id: animation.id, state: animation.playState })) || [],
                observedCallCount: window.__logicFitMotionCalls.length,
                lastMotionCall: window.__logicFitMotionCalls.at(-1) || null
            };
        }, name);
        routeMotionSnapshots.push(motionSnapshot);
        routeMotionObserved ||= motionSnapshot.animations.some((animation) => animation.id === 'logicfit-page-transition');
        if (page.viewportSize().width < 768) await expect(page.locator('.app-shell')).not.toHaveClass(/mobile-nav-open/);
        routeTimings.push(Math.round((await page.evaluate(() => performance.now())) - started));
    }
    if (page.viewportSize().width >= 768) expect(routeMotionObserved, JSON.stringify(routeMotionSnapshots)).toBeTruthy();
    const opener = page.viewportSize().width < 768
        ? page.locator('#mobileNavToggle')
        : page.locator('[data-page-tab="members"]');
    await opener.focus();
    const dialog = page.locator('#actionDialog');
    let openMotion = null;
    for (let cycle = 0; cycle < 2; cycle += 1) {
        await page.evaluate(() => document.getElementById('actionDialog')?.showModal());
        await expect(dialog).toHaveJSProperty('open', true);
        openMotion = await dialog.evaluate((dialogElement) => ({
            opacity: getComputedStyle(dialogElement).opacity,
            animations: dialogElement.getAnimations().length
        }));
        await page.keyboard.press('Escape');
        await expect(dialog).toHaveJSProperty('open', false);
        await expect(opener).toBeFocused();
    }

    const moreSummary = page.locator('#topbarMoreMenu > summary');
    if (await moreSummary.isVisible()) {
        await moreSummary.click();
        await expect(page.locator('#topbarMoreMenu')).toHaveAttribute('open', '');
        const menuAnimation = await page.locator('#topbarMoreMenu .topbar-more-items').evaluate((element) => getComputedStyle(element).animationName);
        await page.keyboard.press('Escape');
        expect(menuAnimation).toBe('logicfit-popover-enter');
    }
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.topGymActiveTab)).toBe('dashboard');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const reducedMotionDurationMs = await page.evaluate(() => {
        const token = getComputedStyle(document.documentElement).getPropertyValue('--motion-duration-page').trim();
        const value = Number.parseFloat(token);
        return value * (token.endsWith('ms') ? 1 : token.endsWith('s') ? 1000 : 1);
    });
    expect(reducedMotionDurationMs).toBeLessThanOrEqual(1);
    const callsBeforeReducedRoute = await page.evaluate(() => window.__logicFitMotionCalls.length);
    const reducedMotionTab = page.locator('[data-page-tab="members"]');
    if (!(await reducedMotionTab.isVisible()) && page.viewportSize().width < 768) {
        await page.locator('#mobileNavToggle').click();
        await expect(page.locator('.app-shell')).toHaveClass(/mobile-nav-open/);
        await expect(reducedMotionTab).toBeVisible();
    }
    await reducedMotionTab.click();
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.topGymActiveTab)).toBe('members');
    if (page.viewportSize().width < 768) await expect(page.locator('.app-shell')).not.toHaveClass(/mobile-nav-open/);
    expect(await page.evaluate(() => window.__logicFitMotionCalls.length)).toBe(callsBeforeReducedRoute);
    const warm = await page.evaluate(() => ({
        resources: performance.getEntriesByType('resource').length,
        longTasksMs: window.__logicFitLongTasks,
        routeAnimationActive: document.getElementById('dashboardSection')?.getAnimations().some((animation) => animation.id === 'logicfit-page-transition') || false
    }));
    expect(writes).toEqual([]);
    expect(requests.some(({ path }) => path === '/api/auth/session')).toBeTruthy();
    expect(routeTimings).toHaveLength(4);
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(assetFailures).toEqual([]);

    const report = { fixture: 'synthetic authenticated Owner; API writes rejected and none observed', viewport: page.viewportSize(), cold, routeTimingsMs: routeTimings, routeMotionObserved, routeMotionSnapshots, dialogOpen: openMotion, reducedMotionDurationMs, warm, cpuProfileTopFrames: cpuProfile, requestCount: requests.length, writes, consoleErrors, pageErrors, assetFailures };
    console.log(`MOTION_LAB_METRICS ${JSON.stringify(report)}`);
    await testInfo.attach(`motion-performance-${testInfo.project.name}.json`, { body: Buffer.from(JSON.stringify(report, null, 2)), contentType: 'application/json' });
    await page.screenshot({ path: testInfo.outputPath(`motion-final-${testInfo.project.name}.png`), fullPage: true });
});
