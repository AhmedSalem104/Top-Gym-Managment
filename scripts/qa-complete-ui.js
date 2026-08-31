'use strict';

/*
 * Complete UI smoke/visual audit for the Vanilla Logic Fit surfaces.
 *
 * This is deliberately a browser-level layout check, not a replacement for
 * authenticated E2E or accessibility tooling. It discovers the actual DOM
 * roots from the shipped pages, exercises every application panel and records
 * the viewport/theme evidence separately.
 */

const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
// This audit must run against the application server, not a static file server.
// Keep the default aligned with the local Express entry point so an omitted
// variable cannot silently produce misleading missing-script failures.
const baseUrl = process.env.QA_BASE_URL || 'http://127.0.0.1:3000';
const reports = path.join(root, 'qa', 'reports');
const artifacts = path.join(root, 'qa', 'artifacts');
const viewports = [
    { name: '320', width: 320, height: 760 },
    { name: '360', width: 360, height: 800 },
    { name: '390', width: 390, height: 844 },
    { name: '430', width: 430, height: 900 },
    { name: '600', width: 600, height: 900 },
    { name: '768', width: 768, height: 900 },
    { name: '820', width: 820, height: 900 },
    { name: '1024', width: 1024, height: 900 },
    { name: '1280', width: 1280, height: 900 },
    { name: '1366', width: 1366, height: 900 },
    { name: '1440', width: 1440, height: 900 },
    { name: '1536', width: 1536, height: 960 },
    { name: '1920', width: 1920, height: 1080 }
];
const darkEvidenceWidths = new Set(['390', '820', '1440']);
const appSections = [
    ['dashboardSection', 'dashboard'],
    ['membersSection', 'members'],
    ['traineesSection', 'trainees'],
    ['managementSection', 'management'],
    ['backupHistorySection', 'backup-history'],
    ['attendanceSection', 'attendance'],
    ['expensesSection', 'expenses'],
    ['librarySection', 'library'],
    ['reportsSection', 'reports'],
    ['brandingSection', 'branding'],
    ['memberPaymentMethodsSection', 'member-payment-methods'],
    ['permissionsSection', 'permissions'],
    ['saasBillingSection', 'saas-billing'],
    ['intelligenceSection', 'intelligence'],
    ['feedbackSection', 'feedback'],
    ['storeSection', 'store'],
    ['memberSubscriptionRequestsSection', 'member-subscription-requests'],
    ['portalAnalyticsSection', 'portal-analytics']
];
const platformPanels = ['dashboard', 'gyms', 'requests', 'gym-registrations', 'payment-methods', 'backups', 'plans', 'audit', 'settings'];
const registrationSteps = [1, 2, 3, 4, 5, 6];
const portalRoots = ['portalLoginPanel', 'portalResult', 'portalHomeView', 'portalFeedbackSection', 'portalSubscriptionSection', 'portalLibrarySection'];
const storeViews = ['pos', 'products', 'inventory', 'purchases', 'sales', 'suppliers', 'expenses', 'reports'];
const portalTools = [
    ['print', 'portalReportContent'],
    ['feedback', 'portalFeedbackSection'],
    ['exercises', 'portalLibrarySection'],
    ['foods', 'portalLibrarySection'],
    ['subscription', 'portalSubscriptionSection']
];
const dialogIds = ['actionDialog', 'pricingDialog', 'membershipTypesDialog', 'membershipPlanDialog', 'membershipTypeDialog', 'detailsDialog', 'qrReaderDialog', 'memberQrDialog', 'libraryFormDialog', 'libraryDetailsDialog', 'externalTraineeDialog', 'coachingProfileDialog', 'coachingBuilderDialog', 'authUserDialog', 'backupRestoreDialog', 'expenseDialog', 'memberDialog', 'dayPassDialog', 'platformActionDialog', 'platformRegistrationCredentialsDialog'];

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function listen(page) {
    const diagnostics = { pageErrors: [], consoleErrors: [], failedResponses: [], expectedUnauthorizedResponses: [] };
    page.on('pageerror', (error) => diagnostics.pageErrors.push(error.message));
    page.on('console', (message) => {
        if (message.type() !== 'error' || message.text().includes('net::ERR_NAME_NOT_RESOLVED')) return;
        // Forced logged-out states legitimately request protected data in
        // order to exercise their empty/error surfaces. Keep 401/403 visible
        // in the report as expected auth-boundary evidence, not as app faults.
        if (/status of (401|403)/i.test(message.text())) return;
        diagnostics.consoleErrors.push(message.text());
    });
    page.on('response', (response) => {
        if (response.status() < 400) return;
        try {
            if (new URL(response.url()).origin !== new URL(baseUrl).origin) return;
            const item = `${response.status()} ${response.url()}`;
            if ([401, 403].includes(response.status())) diagnostics.expectedUnauthorizedResponses.push(item);
            else diagnostics.failedResponses.push(item);
        } catch (_) {
            diagnostics.failedResponses.push(`${response.status()} ${response.url()}`);
        }
    });
    return diagnostics;
}

async function inspect(page, evidence, diagnostics, options = {}) {
    const result = await page.evaluate((expected) => {
        const visible = (element) => Boolean(element && !element.hidden && getComputedStyle(element).display !== 'none' && getComputedStyle(element).visibility !== 'hidden');
        const getAccessibleName = (element) => {
            const explicit = element.getAttribute('aria-label') || element.getAttribute('title');
            if (explicit?.trim()) return explicit.trim();
            if (element.labels?.length) return [...element.labels].map((label) => label.textContent || '').join(' ').trim();
            const parentLabel = element.closest('label');
            if (parentLabel) return (parentLabel.textContent || '').trim();
            if (element.matches('button, a')) return (element.textContent || '').trim();
            return '';
        };
        const interactive = [...document.querySelectorAll('button, a, input, select, textarea')]
            .filter(visible)
            .filter((element) => !element.disabled && !element.getAttribute('aria-hidden'))
            .filter((element) => !(element.tagName === 'INPUT' && ['hidden', 'radio', 'checkbox'].includes(element.type)))
            .filter((element) => !getAccessibleName(element));
        const root = expected?.rootSelector
            ? document.querySelector(expected.rootSelector)
            : expected?.rootId
                ? document.getElementById(expected.rootId)
                : null;
        return {
            rootExists: !(expected?.rootId || expected?.rootSelector) || Boolean(root),
            rootVisible: !(expected?.rootId || expected?.rootSelector) || visible(root),
            overflow: document.documentElement.scrollWidth > window.innerWidth,
            scrollWidth: document.documentElement.scrollWidth,
            viewport: window.innerWidth,
            theme: document.documentElement.dataset.theme || 'light',
            direction: document.documentElement.dir || getComputedStyle(document.documentElement).direction,
            mainCssCount: document.querySelectorAll('link[rel="stylesheet"][href*="/css/main.css"]').length,
            unnamedInteractive: interactive.length
        };
    }, options);
    const prefix = `${evidence.surface}/${evidence.target}/${evidence.theme}/${evidence.viewport}`;
    assert(result.rootExists, `${prefix}: root is missing`);
    if (options.rootId || options.rootSelector) assert(result.rootVisible, `${prefix}: root is not visible`);
    assert(!result.overflow, `${prefix}: horizontal overflow ${result.scrollWidth}/${result.viewport}`);
    assert(result.mainCssCount === 1, `${prefix}: main.css count is ${result.mainCssCount}`);
    assert(result.direction === 'rtl', `${prefix}: document direction is ${result.direction}`);
    assert(diagnostics.pageErrors.length === 0, `${prefix}: page error ${diagnostics.pageErrors.join(' | ')}`);
    assert(diagnostics.consoleErrors.length === 0, `${prefix}: console error ${diagnostics.consoleErrors.join(' | ')}`);
    assert(diagnostics.failedResponses.length === 0, `${prefix}: failed response ${diagnostics.failedResponses.join(' | ')}`);
    return { ...evidence, ...result, diagnostics: { ...diagnostics } };
}

async function prepareApp(page, id) {
    await page.evaluate((targetId) => {
        document.body.classList.remove('auth-pending', 'auth-locked', 'top-gym-navigation-pending');
        document.getElementById('authScreen')?.setAttribute('hidden', '');
        document.querySelector('.app-shell')?.style.removeProperty('display');
        const shell = document.getElementById('dashboardSection');
        const target = document.getElementById(targetId);
        if (!shell || !target) return;
        [...shell.children].forEach((child) => { child.hidden = child !== target && !child.contains(target); });
        let current = target;
        while (current && current !== document.body) {
            current.hidden = false;
            current = current.parentElement;
        }
    }, id);
}

async function preparePlatform(page, panel) {
    await page.evaluate((target) => {
        document.getElementById('platformAdminLoginScreen')?.setAttribute('hidden', '');
        const app = document.getElementById('platformAdminApp');
        if (app) app.hidden = false;
        document.querySelectorAll('[data-platform-panel]').forEach((element) => {
            const active = element.dataset.platformPanel === target;
            element.hidden = !active;
            element.classList.toggle('active', active);
        });
        document.querySelectorAll('[data-platform-view]').forEach((element) => element.classList.toggle('active', element.dataset.platformView === target));
    }, panel);
}

async function preparePortalAuthenticated(page, target) {
    await page.evaluate((rootId) => {
        document.getElementById('portalLoginPanel')?.setAttribute('hidden', '');
        const result = document.getElementById('portalResult');
        if (result) result.hidden = false;
        document.querySelectorAll('#portalResult > *, #portalResult [id$="Section"], #portalResult [id$="View"], #portalResult [id="portalViewToolbar"], #portalResult [id="portalReportContent"]')
            .forEach((element) => { if (element.id) element.hidden = element.id !== rootId && !element.closest(`#${rootId}`); });
        const targetElement = document.getElementById(rootId);
        if (targetElement) {
            targetElement.hidden = false;
            let parent = targetElement.parentElement;
            while (parent && parent.id !== 'portalResult') { parent.hidden = false; parent = parent.parentElement; }
        }
    }, target);
}

async function prepareRegistrationStep(page, step) {
    await page.evaluate((value) => {
        document.querySelectorAll('[data-registration-step]').forEach((element) => { element.hidden = Number(element.dataset.registrationStep) !== value; });
    }, step);
}

async function prepareStoreView(page, view) {
    await page.evaluate((activeView) => {
        const root = document.getElementById('storeSection');
        if (root) root.hidden = false;
        document.querySelectorAll('[data-store-view-panel]').forEach((panel) => {
            panel.hidden = panel.dataset.storeViewPanel !== activeView;
        });
        document.querySelectorAll('[data-store-view]').forEach((button) => {
            const active = button.dataset.storeView === activeView;
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-selected', String(active));
        });
    }, view);
}

async function preparePortalTool(page, tool) {
    await preparePortalAuthenticated(page, 'portalHomeView');
    await page.evaluate((toolName) => {
        const tool = document.querySelector(`[data-portal-tool="${toolName}"]`);
        if (tool) tool.click();
    }, tool);
    await page.waitForTimeout(50);
}

async function ensureApplicationFeature(page, target) {
    if (target !== 'expenses') return;
    await page.evaluate(async () => { await window.topGymEnsureTab?.('finance'); });
}

async function assertDesktopNavigation(page) {
    const readLayout = () => page.evaluate(() => {
        const shell = document.querySelector('.app-shell');
        const sidebar = document.getElementById('pageTabs');
        const topbar = document.querySelector('.app-shell > .topbar');
        const sidebarRect = sidebar?.getBoundingClientRect();
        const topbarRect = topbar?.getBoundingClientRect();
        const shellStyle = shell ? getComputedStyle(shell) : null;
        return {
            topbarVisible: Boolean(topbar && getComputedStyle(topbar).display !== 'none'),
            sidebarVisible: Boolean(sidebar && getComputedStyle(sidebar).display !== 'none'),
            sidebarWidth: sidebarRect ? Math.round(sidebarRect.width) : 0,
            sidebarRect: sidebarRect ? { left: sidebarRect.left, right: sidebarRect.right, top: sidebarRect.top } : null,
            topbarRect: topbarRect ? { left: topbarRect.left, right: topbarRect.right, top: topbarRect.top } : null,
            gridColumns: shellStyle?.gridTemplateColumns || ''
        };
    });
    const closed = await readLayout();
    assert(closed.topbarVisible, 'desktop navbar is hidden');
    assert(closed.sidebarVisible, 'desktop sidebar is hidden');
    assert(closed.sidebarWidth >= 64 && closed.sidebarWidth <= 120, `desktop sidebar is not compact before hover (${closed.sidebarWidth}px)`);
    assert(closed.sidebarRect && closed.topbarRect && (closed.sidebarRect.right <= closed.topbarRect.left + 1 || closed.topbarRect.right <= closed.sidebarRect.left + 1), 'desktop sidebar intersects navbar before hover');

    await page.locator('#pageTabs').hover();
    await page.waitForTimeout(320);
    const expanded = await readLayout();
    assert(expanded.sidebarWidth >= closed.sidebarWidth + 80, `desktop sidebar did not expand on hover (${closed.sidebarWidth}px -> ${expanded.sidebarWidth}px)`);
    assert(expanded.sidebarRect && expanded.topbarRect && (expanded.sidebarRect.right <= expanded.topbarRect.left + 1 || expanded.topbarRect.right <= expanded.sidebarRect.left + 1), 'desktop sidebar intersects navbar after hover');
    assert(expanded.gridColumns !== closed.gridColumns, 'desktop grid did not allocate a separate expanded sidebar track');
}

async function run() {
    fs.mkdirSync(reports, { recursive: true });
    fs.mkdirSync(artifacts, { recursive: true });
    const browser = await chromium.launch({ headless: true });
    const evidence = [];
    const failures = [];
    let desktopNavigationChecks = 0;
    const runCase = async (page, item, options = {}) => {
        try { evidence.push(await inspect(page, item, options.diagnostics, options)); }
        catch (error) { failures.push(error.message); }
    };

    try {
        if (/:(4174|4173)(?:\/|$)/.test(baseUrl)) {
            throw new Error(`Complete UI QA requires the Express application server; received static server URL ${baseUrl}. Set QA_BASE_URL to the running app.`);
        }
        for (const viewport of viewports) {
            const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
            const diagnostics = listen(page);
            await page.goto(`${baseUrl}/#dashboard`, { waitUntil: 'networkidle' });
            for (const [id, target] of appSections) {
                await ensureApplicationFeature(page, target);
                await prepareApp(page, id);
                await runCase(page, { surface: 'Gym Application', target: `#${target}`, theme: 'light', viewport: viewport.name }, { rootId: id, diagnostics });
            }
            if (viewport.name === '1440') {
                try {
                    await assertDesktopNavigation(page);
                    desktopNavigationChecks += 1;
                } catch (error) {
                    failures.push(`Gym Application/navigation/1440: ${error.message}`);
                }
            }
            await page.close();
        }

        for (const theme of ['light', 'dark']) {
            for (const viewport of viewports.filter((item) => darkEvidenceWidths.has(item.name))) {
                const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
                await page.addInitScript((savedTheme) => { window.localStorage.setItem('topgym-theme', savedTheme); }, theme);
                const diagnostics = listen(page);
                await page.goto(`${baseUrl}/#dashboard`, { waitUntil: 'networkidle' });
                for (const [id, target] of appSections) {
                    await ensureApplicationFeature(page, target);
                    await prepareApp(page, id);
                    await runCase(page, { surface: 'Gym Application', target: `#${target}`, theme, viewport: viewport.name }, { rootId: id, diagnostics });
                }
                await page.close();
            }
        }

        // Store contains a second navigation layer. Check every actual panel
        // at representative mobile/tablet/desktop widths and both themes.
        for (const theme of ['light', 'dark']) {
            for (const viewport of viewports.filter((item) => darkEvidenceWidths.has(item.name))) {
                const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
                await page.addInitScript((savedTheme) => { window.localStorage.setItem('topgym-theme', savedTheme); }, theme);
                const diagnostics = listen(page);
                await page.goto(`${baseUrl}/#store`, { waitUntil: 'networkidle' });
                await ensureApplicationFeature(page, 'store');
                await prepareApp(page, 'storeSection');
                for (const view of storeViews) {
                    await prepareStoreView(page, view);
                    await runCase(page, { surface: 'Store nested views', target: view, theme, viewport: viewport.name }, { rootSelector: `[data-store-view-panel="${view}"]`, diagnostics });
                }
                await page.close();
            }
        }

        for (const viewport of viewports) {
            for (const route of ['/member-portal', '/register-gym', '/platform-admin', '/platform-admin-forbidden']) {
                const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
                const diagnostics = listen(page);
                await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle' });
                const surface = route === '/member-portal' ? 'Member Portal' : route === '/register-gym' ? 'Register Gym' : route === '/platform-admin' ? 'Platform Admin' : 'Forbidden State';
                await runCase(page, { surface, target: 'entry', theme: 'light', viewport: viewport.name }, { diagnostics });
                if (route === '/member-portal') {
                    await runCase(page, { surface, target: 'portal-login', theme: 'light', viewport: viewport.name }, { rootId: 'portalLoginPanel', diagnostics });
                    for (const rootId of portalRoots.slice(1)) {
                        await preparePortalAuthenticated(page, rootId);
                        await runCase(page, { surface, target: `#${rootId}`, theme: 'light', viewport: viewport.name }, { rootId, diagnostics });
                    }
                } else if (route === '/register-gym') {
                    for (const step of registrationSteps) {
                        await prepareRegistrationStep(page, step);
                        await runCase(page, { surface, target: `step-${step}`, theme: 'light', viewport: viewport.name }, { rootSelector: `[data-registration-step="${step}"]`, diagnostics });
                    }
                } else if (route === '/platform-admin') {
                    for (const panel of platformPanels) {
                        await preparePlatform(page, panel);
                        await runCase(page, { surface, target: panel, theme: 'light', viewport: viewport.name }, { diagnostics });
                    }
                }
                if (viewport.name === '390') await page.screenshot({ path: path.join(artifacts, `${surface.toLowerCase().replaceAll(' ', '-')}-390.png`), fullPage: true });
                await page.close();
            }
        }

        for (const theme of ['light', 'dark']) {
            for (const route of ['/member-portal', '/register-gym', '/platform-admin']) {
                const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
                await page.addInitScript((savedTheme) => { window.localStorage.setItem('topgym-theme', savedTheme); }, theme);
                const diagnostics = listen(page);
                await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle' });
                const surface = route === '/member-portal' ? 'Member Portal' : route === '/register-gym' ? 'Register Gym' : 'Platform Admin';
                await runCase(page, { surface, target: 'entry', theme, viewport: '1440' }, { diagnostics });
                if (route === '/member-portal') {
                    for (const rootId of portalRoots.slice(1)) {
                        await preparePortalAuthenticated(page, rootId);
                        await runCase(page, { surface, target: `#${rootId}`, theme, viewport: '1440' }, { rootId, diagnostics });
                    }
                } else if (route === '/register-gym') {
                    for (const step of registrationSteps) {
                        await prepareRegistrationStep(page, step);
                        await runCase(page, { surface, target: `step-${step}`, theme, viewport: '1440' }, { rootSelector: `[data-registration-step="${step}"]`, diagnostics });
                    }
                } else {
                    for (const panel of platformPanels) {
                        await preparePlatform(page, panel);
                        await runCase(page, { surface, target: panel, theme, viewport: '1440' }, { diagnostics });
                    }
                }
                await page.close();
            }
        }

        // Portal service cards are real state transitions, not decorative
        // markup. Trigger each one in a synthetic logged-in layout so its
        // target surface is checked without needing a real member credential.
        for (const theme of ['light', 'dark']) {
            for (const viewport of viewports.filter((item) => darkEvidenceWidths.has(item.name))) {
                const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
                await page.addInitScript((savedTheme) => { window.localStorage.setItem('topgym-theme', savedTheme); }, theme);
                const diagnostics = listen(page);
                await page.goto(`${baseUrl}/member-portal`, { waitUntil: 'networkidle' });
                for (const [tool, targetId] of portalTools) {
                    await preparePortalTool(page, tool);
                    await runCase(page, { surface: 'Member Portal tools', target: tool, theme, viewport: viewport.name }, { rootId: targetId, diagnostics });
                }
                await page.close();
            }
        }

        const dialogCases = [
            { route: '/#dashboard', ids: dialogIds.filter((id) => !id.startsWith('platform')), surface: 'Gym Dialogs' },
            { route: '/platform-admin', ids: dialogIds.filter((id) => id.startsWith('platform')), surface: 'Platform Dialogs' }
        ];
        for (const dialogCase of dialogCases) {
            const dialogPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
            const diagnostics = listen(dialogPage);
            await dialogPage.goto(`${baseUrl}${dialogCase.route}`, { waitUntil: 'networkidle' });
            if (dialogCase.surface === 'Gym Dialogs') await prepareApp(dialogPage, 'dashboardSection');
            for (const id of dialogCase.ids) {
            const result = await dialogPage.evaluate((dialogId) => {
                const dialog = document.getElementById(dialogId);
                if (!dialog) return { exists: false };
                try { dialog.showModal(); } catch (error) { return { exists: true, error: error.message }; }
                const rect = dialog.getBoundingClientRect();
                const within = rect.left >= 0 && rect.top >= 0 && rect.right <= window.innerWidth + 1 && rect.bottom <= window.innerHeight + 1;
                dialog.close();
                return { exists: true, within, width: Math.round(rect.width), height: Math.round(rect.height) };
            }, id);
                if (!result.exists || result.error || !result.within) failures.push(`Dialog/${id}/390: ${result.error || 'outside viewport'}`);
                else evidence.push({ surface: dialogCase.surface, target: id, theme: 'light', viewport: '390', dialog: result, diagnostics: { ...diagnostics } });
            }
            await dialogPage.close();
        }
    } finally {
        await browser.close();
    }

    const report = {
        generatedAt: new Date().toISOString(),
        baseUrl,
        viewportMatrix: viewports,
        appScreenCount: appSections.length,
        platformPanelCount: platformPanels.length,
        registrationStepCount: registrationSteps.length,
        portalSurfaceCount: portalRoots.length,
        storeViewCount: storeViews.length,
        portalToolCount: portalTools.length,
        dialogCount: dialogIds.length,
        desktopNavigationChecks,
        evidenceCount: evidence.length,
        failures,
        accessibility: {
            note: 'The runner records unnamed interactive controls as a review signal; it does not claim WCAG conformance.',
            unnamedInteractiveObservations: evidence.reduce((sum, item) => sum + Number(item.unnamedInteractive || 0), 0)
        },
        diagnostics: {
            pageErrors: evidence.reduce((sum, item) => sum + (item.diagnostics?.pageErrors?.length || 0), 0),
            consoleErrors: evidence.reduce((sum, item) => sum + (item.diagnostics?.consoleErrors?.length || 0), 0),
            failedResponses: evidence.reduce((sum, item) => sum + (item.diagnostics?.failedResponses?.length || 0), 0),
            expectedUnauthorizedResponses: evidence.reduce((sum, item) => sum + (item.diagnostics?.expectedUnauthorizedResponses?.length || 0), 0)
        },
        status: failures.length ? 'FAIL' : 'PASS'
    };
    fs.writeFileSync(path.join(reports, 'complete-ui-qa.json'), `${JSON.stringify({ report, evidence }, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify(report, null, 2));
    if (failures.length) {
        console.error('COMPLETE_UI_QA_FAILED');
        process.exitCode = 1;
    } else {
        console.log('COMPLETE_UI_QA_PASSED');
    }
}

run().catch((error) => {
    console.error(`COMPLETE_UI_QA_FAILED: ${error.message}`);
    process.exitCode = 1;
});
