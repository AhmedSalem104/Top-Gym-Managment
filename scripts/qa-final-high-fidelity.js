'use strict';

// Local-only final visual verification. This is QA infrastructure, not app
// behavior. It intentionally refuses non-local API/database targets.
require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { prepareFixtures } = require('./qa-prepare-local-fixtures');

const BASE_URL = String(process.env.QA_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const ZOOM = 1.25;
const VIEWPORTS = [
    { name: '320', width: 320, height: 568 },
    { name: '390', width: 390, height: 844 },
    { name: '768', width: 768, height: 1024 },
    { name: '1024', width: 1024, height: 768 },
    { name: '1440', width: 1440, height: 900 }
];

const artifactsDir = path.join(process.cwd(), 'qa', 'artifacts', 'final-high-fidelity-125');
fs.mkdirSync(artifactsDir, { recursive: true });

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function safeTarget() {
    const url = new URL(BASE_URL);
    const connection = String(process.env.MSSQL_CONNECTION_STRING || '');
    const server = connection.match(/(?:Server|Data Source)=([^;]+)/i)?.[1] || '';
    const database = connection.match(/(?:Database|Initial Catalog)=([^;]+)/i)?.[1] || '';
    const environment = String(process.env.NODE_ENV || 'local').trim().toLowerCase();
    const production = environment === 'production' || String(process.env.PRODUCTION || '').trim().toLowerCase() === 'true';
    assert(['localhost', '127.0.0.1', '::1'].includes(url.hostname.toLowerCase()), 'Final QA requires a localhost/127.0.0.1 application target.');
    assert(/^(?:localhost|127\.0\.0\.1|\[?::1\]?)(?:,|\\|$)/i.test(server), 'Final QA requires a local SQL target.');
    assert(/^LogicFit_/i.test(database), 'Final QA requires a LogicFit_ local QA database.');
    assert(!production, 'Final QA refuses production-like environment targets.');
    return { host: url.hostname, database, environment, production: false };
}

function effectiveMetrics(base) {
    return {
        width: Math.max(1, Math.round(base.width / ZOOM)),
        height: Math.max(1, Math.round(base.height / ZOOM))
    };
}

async function waitReady(page, selector, timeout = 20_000) {
    await page.locator(selector).waitFor({ state: 'visible', timeout });
}

function attachDiagnostics(page, diagnostics) {
    page.on('pageerror', () => { diagnostics.consoleErrors += 1; });
    page.on('console', (message) => {
        if (message.type() === 'error') diagnostics.consoleErrors += 1;
    });
    page.on('requestfailed', () => { diagnostics.requestErrors += 1; });
    page.on('response', (response) => {
        if (response.status() >= 500) diagnostics.requestErrors += 1;
    });
}

async function geometry(page) {
    return page.evaluate(() => {
        const root = document.documentElement;
        const body = document.body;
        const viewport = root.clientWidth;
        const offcanvasReason = (element) => {
            const appShell = document.querySelector('.app-shell');
            const elementStyle = getComputedStyle(element);
            const elementBox = element.getBoundingClientRect();
            const outsideViewport = elementBox.left < -1 || elementBox.right > viewport + 1;
            if (outsideViewport && (elementStyle.opacity === '0' || elementStyle.pointerEvents === 'none')) return 'non-interactive-offscreen';
            const pageTabs = element.closest?.('#pageTabs');
            if (pageTabs && !appShell?.classList.contains('mobile-nav-open')) return 'closed-app-drawer';

            const platformSidebar = element.closest?.('.platform-sidebar');
            if (platformSidebar && !platformSidebar.classList.contains('open')) return 'closed-platform-drawer';

            const trainerSidebar = element.closest?.('.trainer-studio-sidebar');
            if (trainerSidebar && !document.body.classList.contains('trainer-sidebar-open')
                && !document.documentElement.classList.contains('trainer-sidebar-open')) return 'closed-trainer-drawer';

            let current = element;
            while (current && current !== body) {
                const style = getComputedStyle(current);
                if (style.visibility === 'hidden' || current.hasAttribute('inert') || current.getAttribute('aria-hidden') === 'true') {
                    return 'hidden-state';
                }
                if (current !== element && outsideViewport && ['auto', 'scroll', 'clip'].includes(style.overflowX)) {
                    return 'contained-horizontal-scroll';
                }
                current = current.parentElement;
            }
            return null;
        };

        const candidates = [...document.querySelectorAll('body *')]
            .map((element) => ({ element, reason: offcanvasReason(element) }))
            .filter(({ element, reason }) => {
                const style = getComputedStyle(element);
                const box = element.getBoundingClientRect();
                return !reason && style.display !== 'none' && style.visibility !== 'hidden'
                    && box.width > 0 && box.height > 0
                    && (box.left < -1 || box.right > viewport + 1);
            })
            .map(({ element }) => element)
            .sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right)
            .slice(0, 8)
            .map((element) => {
                const box = element.getBoundingClientRect();
                return { selector: element.id ? `#${element.id}` : element.className || element.tagName, left: Math.round(box.left), right: Math.round(box.right), width: Math.round(box.width) };
            });
        const rawOverflow = root.scrollWidth > viewport + 1 || (body?.scrollWidth || 0) > viewport + 1;
        return {
            clientWidth: viewport,
            scrollWidth: root.scrollWidth,
            bodyScrollWidth: body?.scrollWidth || 0,
            rawOverflow,
            overflow: candidates.length > 0,
            offcanvasOnlyRawOverflow: rawOverflow && candidates.length === 0,
            candidates
        };
    });
}

async function capture(page, name) {
    await page.screenshot({ path: path.join(artifactsDir, `${name}.png`), fullPage: true });
}

async function loginGym(page, email, password, kind = 'gym') {
    await page.goto(`${BASE_URL}/?final-qa=1`, { waitUntil: 'domcontentloaded' });
    const gateway = page.locator('#saasEntryContinue');
    if (await gateway.isVisible().catch(() => false)) await gateway.click();
    await waitReady(page, '#loginEmail');
    await page.locator('#loginEmail').fill(email);
    await page.locator('#loginPassword').fill(password);
    await page.locator('#loginSubmit').click();
    if (kind === 'trainer') {
        await page.waitForURL(/\/trainer-workspace(?:\/|$)/, { timeout: 20_000 });
    } else {
        try {
            await waitReady(page, '.page-tab[data-page-tab="dashboard"]:visible');
        } catch (error) {
            const state = await page.evaluate(() => ({
                url: location.href,
                loginMessage: document.querySelector('#loginMessage')?.textContent?.trim() || '',
                authScreen: document.querySelector('#authScreen')?.hidden === false,
                visibleDashboardTabs: [...document.querySelectorAll('.page-tab[data-page-tab="dashboard"]')].filter((node) => getComputedStyle(node).display !== 'none' && node.getBoundingClientRect().width > 0).length
            }));
            throw new Error(`Gym authentication did not reach the dashboard contract (${JSON.stringify(state)}). ${error.message}`);
        }
    }
}

async function authenticatedState(browser, email, password, kind) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ar-EG', colorScheme: 'light' });
    const page = await context.newPage();
    const diagnostics = { consoleErrors: 0, requestErrors: 0 };
    attachDiagnostics(page, diagnostics);
    if (kind === 'gym' || kind === 'trainer') {
        await loginGym(page, email, password, kind);
    } else {
        await page.goto(`${BASE_URL}/platform-admin`, { waitUntil: 'domcontentloaded' });
        const login = page.locator('#platformAdminLoginScreen');
        if (await login.isVisible().catch(() => false)) {
            await page.locator('#platformAdminEmail').fill(email);
            await page.locator('#platformAdminPassword').fill(password);
            await page.locator('#platformAdminLoginButton').click();
        }
        await waitReady(page, '#platformAdminApp');
    }
    const state = await context.storageState();
    await context.close();
    return { state, diagnostics };
}

async function newZoomContext(browser, state, base) {
    const metrics = effectiveMetrics(base);
    return browser.newContext({
        baseURL: BASE_URL,
        viewport: metrics,
        deviceScaleFactor: ZOOM,
        locale: 'ar-EG',
        colorScheme: 'light',
        storageState: state
    });
}

async function verifyGym(browser, state, diagnostics) {
    const tabs = ['dashboard', 'members', 'subscriptions', 'attendance', 'reports', 'expenses', 'library', 'store'];
    const results = [];
    for (const viewport of VIEWPORTS) {
        const context = await newZoomContext(browser, state, viewport);
        const page = await context.newPage();
        attachDiagnostics(page, diagnostics);
        await page.goto(`${BASE_URL}/index.html#dashboard`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(900);
        const dashboardTrigger = page.locator('.page-tab[data-page-tab="dashboard"]:visible');
        if (!(await dashboardTrigger.count())) {
            const mobileToggle = page.locator('#mobileNavToggle');
            if (await mobileToggle.isVisible().catch(() => false)) {
                await mobileToggle.click({ force: true });
                await page.waitForFunction(() => document.querySelector('.app-shell')?.classList.contains('mobile-nav-open') === true, null, { timeout: 3_000 }).catch(async () => {
                    await page.evaluate(() => document.getElementById('mobileNavToggle')?.click());
                });
            }
            await page.waitForTimeout(300);
        }
        try {
            await waitReady(page, '.page-tab[data-page-tab="dashboard"]:visible');
        } catch (error) {
            const state = await page.evaluate(() => ({
                url: location.href,
                innerWidth,
                authScreen: document.querySelector('#authScreen')?.hidden === false,
                mobileToggle: Boolean(document.querySelector('#mobileNavToggle')),
                mobileToggleDisplay: document.querySelector('#mobileNavToggle') ? getComputedStyle(document.querySelector('#mobileNavToggle')).display : '',
                mobileNavOpen: document.querySelector('.app-shell')?.classList.contains('mobile-nav-open') || false,
                tabCount: document.querySelectorAll('.page-tab[data-page-tab="dashboard"]').length,
                tabState: [...document.querySelectorAll('.page-tab[data-page-tab="dashboard"]')].map((node) => ({ hidden: node.hidden, display: getComputedStyle(node).display, rect: node.getBoundingClientRect().toJSON() }))
            }));
            throw new Error(`Gym 125% shell did not expose navigation (${JSON.stringify(state)}). ${error.message}`);
        }
        for (const tab of tabs) {
            const isPhoneLayout = effectiveMetrics(viewport).width < 768;
            const drawerOpen = await page.locator('.app-shell').evaluate((node) => node.classList.contains('mobile-nav-open')).catch(() => false);
            if (isPhoneLayout && !drawerOpen) {
                const toggle = page.locator('#mobileNavToggle');
                if (await toggle.isVisible().catch(() => false)) {
                    await toggle.click({ force: true });
                    await page.waitForFunction(() => document.querySelector('.app-shell')?.classList.contains('mobile-nav-open') === true, null, { timeout: 3_000 });
                }
            }
            const visibleTrigger = page.locator(`.page-tab[data-page-tab="${tab}"]:visible`);
            if (await visibleTrigger.count()) {
                await visibleTrigger.first().click();
                await page.waitForTimeout(180);
                const metrics = await geometry(page);
                results.push({ viewport: viewport.name, surface: tab, ...metrics });
            }
        }
        await capture(page, `gym-${viewport.name}`);
        await context.close();
    }
    return results;
}

async function verifyTrainer(browser, state, diagnostics) {
    const routes = ['dashboard', 'clients', 'calendar', 'sessions', 'training', 'nutrition', 'measurements', 'goals', 'notifications', 'tasks', 'templates', 'reports', 'settings'];
    const results = [];
    for (const viewport of VIEWPORTS) {
        for (const theme of ['light', 'dark']) {
            const context = await newZoomContext(browser, state, viewport);
            const page = await context.newPage();
            attachDiagnostics(page, diagnostics);
            for (const [index, route] of routes.entries()) {
                await page.goto(`${BASE_URL}/trainer-workspace/${route}`, { waitUntil: 'domcontentloaded' });
                await page.waitForTimeout(600);
                await waitReady(page, '.trainer-workspace-shell');
                if (theme === 'dark' && index === 0) {
                    const toggle = page.locator('[data-theme-toggle]:visible').first();
                    if (await toggle.count()) {
                        await toggle.click();
                        await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
                    }
                }
                if (theme === 'dark') await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
                const metrics = await geometry(page);
                results.push({ viewport: viewport.name, theme, surface: route, ...metrics });
            }
            await capture(page, `trainer-${theme}-${viewport.name}`);
            await context.close();
        }
    }
    return results;
}

async function verifyPlatform(browser, state, diagnostics) {
    const results = [];
    for (const viewport of VIEWPORTS) {
        const context = await newZoomContext(browser, state, viewport);
        const page = await context.newPage();
        attachDiagnostics(page, diagnostics);
        await page.goto(`${BASE_URL}/platform-admin`, { waitUntil: 'domcontentloaded' });
        await waitReady(page, '#platformAdminApp');
        await page.waitForTimeout(700);
        results.push({ viewport: viewport.name, surface: 'platform-shell', ...(await geometry(page)) });
        await capture(page, `platform-${viewport.name}`);
        await context.close();
    }
    return results;
}

async function verifyMemberPortal(browser, membershipCode, diagnostics) {
    const results = [];
    for (const viewport of VIEWPORTS) {
        const context = await newZoomContext(browser, null, viewport);
        const page = await context.newPage();
        attachDiagnostics(page, diagnostics);
        await page.goto(`${BASE_URL}/member-portal`, { waitUntil: 'domcontentloaded' });
        await waitReady(page, '#membershipCodeInput');
        await page.locator('#membershipCodeInput').fill(membershipCode);
        await page.locator('#portalSubmitButton').click();
        await waitReady(page, '#portalResult');
        await page.waitForTimeout(500);
        results.push({ viewport: viewport.name, surface: 'member-portal', ...(await geometry(page)) });
        await capture(page, `member-portal-${viewport.name}`);
        await context.close();
    }
    return results;
}

async function verifyLogin(browser, diagnostics) {
    const results = [];
    for (const viewport of VIEWPORTS) {
        const context = await newZoomContext(browser, null, viewport);
        const page = await context.newPage();
        attachDiagnostics(page, diagnostics);
        await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
        await waitReady(page, '#loginEmail');
        results.push({ viewport: viewport.name, surface: 'login', ...(await geometry(page)) });
        await capture(page, `login-${viewport.name}`);
        await context.close();
    }
    return results;
}

async function main() {
    const safety = safeTarget();
    const ownerEmail = String(process.env.QA_OWNER_EMAIL || process.env.AUTH_OWNER_EMAIL || '').trim();
    const ownerPassword = String(process.env.QA_OWNER_PASSWORD || process.env.AUTH_OWNER_PASSWORD || '');
    const adminEmail = String(process.env.QA_PLATFORM_ADMIN_EMAIL || process.env.QA_ADMIN_EMAIL || 'qa-platform-admin@local.test').trim();
    const adminPassword = String(process.env.QA_PLATFORM_ADMIN_PASSWORD || '');
    const trainerEmail = String(process.env.QA_TRAINER_EMAIL || 'qa-trainer@local.test').trim();
    const trainerPassword = String(process.env.QA_TRAINER_PASSWORD || '');
    assert(ownerEmail && ownerPassword && adminEmail && adminPassword && trainerEmail && trainerPassword, 'Local QA credentials are incomplete; no credential values are printed.');
    const fixtures = await prepareFixtures();
    const browser = await chromium.launch({ headless: true });
    const diagnostics = { consoleErrors: 0, requestErrors: 0 };
    try {
        const gym = await authenticatedState(browser, ownerEmail, ownerPassword, 'gym');
        const trainer = await authenticatedState(browser, trainerEmail, trainerPassword, 'trainer');
        const platform = await authenticatedState(browser, adminEmail, adminPassword, 'platform');
        const results = {
            strategy: 'Chromium device metrics emulation: CSS layout viewport is physicalViewport/1.25 with deviceScaleFactor=1.25; no CSS zoom, transform, screenshot scaling, or application changes.',
            limitation: 'This verifies browser-level layout metrics and pixel density; it does not change the Chrome UI zoom preference.',
            safety,
            fixture: { trainer: true, memberPortal: true, plan: fixtures.trainer.tenant?.subscription?.plan?.code || 'verified-by-bootstrap' },
            login: await verifyLogin(browser, diagnostics),
            gym: await verifyGym(browser, gym.state, diagnostics),
            trainer: await verifyTrainer(browser, trainer.state, diagnostics),
            platform: await verifyPlatform(browser, platform.state, diagnostics),
            memberPortal: await verifyMemberPortal(browser, fixtures.member.membershipCode, diagnostics),
            diagnostics
        };
        const all = [...results.login, ...results.gym, ...results.trainer, ...results.platform, ...results.memberPortal];
        const overflow = all.filter((item) => item.overflow);
        const rawOverflow = all.filter((item) => item.rawOverflow);
        const summarize = (items) => ({
            checks: items.length,
            visibleOverflow: items.filter((item) => item.overflow).length,
            rawDocumentOverflow: items.filter((item) => item.rawOverflow).length,
            offcanvasOnlyRawOverflow: items.filter((item) => item.offcanvasOnlyRawOverflow).length
        });
        results.summary = {
            checks: all.length,
            visibleOverflowCount: overflow.length,
            rawDocumentOverflowCount: rawOverflow.length,
            offcanvasOnlyRawOverflowCount: all.filter((item) => item.offcanvasOnlyRawOverflow).length,
            groups: {
                login: summarize(results.login),
                gym: summarize(results.gym),
                trainer: summarize(results.trainer),
                platform: summarize(results.platform),
                memberPortal: summarize(results.memberPortal)
            },
            visibleOverflow: overflow.slice(0, 20),
            consoleErrors: diagnostics.consoleErrors,
            requestErrors: diagnostics.requestErrors,
            status: overflow.length || diagnostics.consoleErrors || diagnostics.requestErrors ? 'FAIL' : 'PASS'
        };
        console.log(JSON.stringify({ strategy: results.strategy, limitation: results.limitation, safety: results.safety, fixture: results.fixture, summary: results.summary }, null, 2));
        if (results.summary.status !== 'PASS') process.exitCode = 1;
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
