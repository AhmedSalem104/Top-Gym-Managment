const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');

const panels = [
    'dashboard', 'gyms', 'requests', 'gym-registrations', 'payment-methods',
    'plans', 'backups', 'audit', 'settings'
];
const widths = [320, 375, 390, 768, 1024, 1440, 1920];
const themes = ['light', 'dark'];
const directions = ['rtl', 'ltr'];
const stamp = '2026-10-12T10:30:00.000Z';
const populatedMarkers = {
    dashboard: 'QA Read Only Gym', gyms: 'QA Read Only Gym', requests: 'QA Read Only Gym',
    'gym-registrations': 'QA Registration Gym', 'payment-methods': 'QA Transfer',
    plans: 'QA Plan', backups: 'qa-read-only', audit: 'Read-only review'
};
const emptyTableBodies = {
    gyms: '#tenantsTableBody', requests: '#requestsTableBody',
    'gym-registrations': '#gymRegistrationTableBody',
    'payment-methods': '#platformPaymentMethodsTableBody',
    backups: '#platformBackupsTableBody', audit: '#auditTableBody'
};

function responseFor(pathname, mode) {
    const empty = mode === 'empty';
    const rows = (items) => empty ? [] : items;
    if (pathname === '/api/auth/session') {
        return { authenticated: true, user: { id: 92001, role: 'PlatformAdmin', name: 'QA Platform Admin' } };
    }
    if (pathname === '/api/platform-admin/dashboard') {
        return {
            metrics: { gyms: { total: empty ? 0 : 18, active: empty ? 0 : 12, trial: empty ? 0 : 3, suspended: 0, expired: 0, archived: 0 }, pendingRequests: empty ? 0 : 2, pendingGymRegistrations: empty ? 0 : 1, expiringSoon: 0, activeUsers: empty ? 0 : 44, totalMembers: empty ? 0 : 3270, storageBytes: empty ? 0 : 7340032 },
            recentGyms: rows([{ id: 9201, name: 'QA Read Only Gym', tenantType: 'gym', slug: 'qa-read-only', status: 'active', owner: { name: 'QA Owner' } }]),
            recentActivity: rows([{ action: 'QA read-only activity', actorName: 'QA Admin', details: 'Synthetic fixture only', createdAt: stamp }])
        };
    }
    if (pathname === '/api/platform-admin/tenants') {
        return { tenants: rows([{ id: 9201, name: 'QA Read Only Gym', slug: 'qa-read-only', tenantType: 'gym', owner: { name: 'QA Owner', email: 'qa@example.test' }, subscription: { plan: { name: 'QA Plan' }, status: 'active', expiresAt: stamp, daysRemaining: 30 }, status: 'active', usage: { members: 20, users: 3 }, lastActivityAt: stamp }]), pagination: { total: empty ? 0 : 1, page: 1, pages: 1 } };
    }
    if (pathname === '/api/platform-admin/subscription-requests') {
        return { requests: rows([{ id: 9202, tenantName: 'QA Read Only Gym', tenantSlug: 'qa-read-only', tenantType: 'gym', plan: { name: 'QA Plan' }, amount: 1200, currency: 'EGP', durationMonths: 1, proof: null, status: 'pending', createdAt: stamp }]), pagination: { total: empty ? 0 : 1, page: 1, pages: 1 } };
    }
    if (pathname === '/api/platform-admin/gym-registration-requests') {
        return { requests: rows([{ id: 9203, gymName: 'QA Registration Gym', city: 'Cairo', ownerName: 'QA Owner', whatsapp: '+201000000001', email: 'qa@example.test', plan: { name: 'QA Plan' }, term: { durationMonths: 1 }, pricing: { amountDue: 600, currency: 'EGP' }, paymentMethod: { name: 'QA Transfer' }, proof: null, status: 'pending', createdAt: stamp }]), pagination: { total: empty ? 0 : 1, page: 1, pages: 1 }, pendingCount: empty ? 0 : 1 };
    }
    if (pathname === '/api/platform-admin/payment-methods') {
        return { paymentMethods: rows([{ id: 'qa-method', displayName: 'QA Transfer', methodCode: 'QA-TRANSFER', accountReference: 'QA-0000', recipientName: 'QA Recipient', instructions: 'Read-only fixture', isActive: true, sortOrder: 1, updatedAt: stamp }]) };
    }
    if (pathname === '/api/platform-admin/plans') {
        return { plans: rows([{ id: 'qa-plan', code: 'QA-PLAN', name: 'QA Plan', description: 'Read-only fixture', price: 1200, currency: 'EGP', billingPeriod: 'monthly', status: 'active', isActive: true, availableForNewSubscriptions: true, terms: [{ code: 'monthly', price: 1200, currency: 'EGP' }], maxMembers: 500, maxClients: 100, maxBranches: 4, maxUsers: 12, maxAiGenerations: 40, maxStorageMb: 1024, features: { store: true, reports: true }, compatibleTenantTypes: ['gym'] }]), activeCount: empty ? 0 : 1 };
    }
    if (pathname === '/api/platform-admin/feature-catalog') {
        return { featureCatalog: rows([{ key: 'store', description: 'QA feature', tenantTypes: ['gym'] }]) };
    }
    if (pathname.startsWith('/api/platform-admin/backups/health')) {
        return { providerStatus: 'local_development', offsiteStatus: 'not_configured', summary: { eligibleTenants: empty ? 0 : 1, verifiedToday: empty ? 0 : 1, failedToday: 0, missingToday: 0, backupDay: stamp }, scheduledPolicy: { weekly: true, monthly: true }, registryCoverage: { status: 'covered', uncoveredTenantTables: [], unregisteredPhysicalTenantTables: [], missingPhysicalTables: [] }, platformFailures: [], tenantDaily: rows([{ tenantId: 9201, slug: 'qa-read-only', status: 'VERIFIED', backupDay: stamp, sizeBytes: 65536, verifiedAt: stamp, id: 'qa-tenant-backup' }]) };
    }
    if (pathname.startsWith('/api/platform-admin/backups')) {
        return { backups: rows([{ id: 'qa-platform-backup', backupType: 'platform_daily', status: 'VERIFIED', backupDay: stamp, sizeBytes: 131072, verifiedAt: stamp }]), audit: rows([{ createdAt: stamp, eventType: 'verification', backupId: 'qa-platform-backup', result: 'success', reason: 'Synthetic fixture only' }]) };
    }
    if (pathname.startsWith('/api/platform-admin/audit')) {
        return { audit: rows([{ createdAt: stamp, actorName: 'QA Admin', action: 'Read-only review', tenantId: 'QA', reason: 'Fixture', details: 'Synthetic data only' }]) };
    }
    return {};
}

async function installReadOnlyApi(page, getMode, mutationRequests, apiPaths, options = {}) {
    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;
        apiPaths.add(`${request.method()} ${pathname}`);
        if (!['GET', 'HEAD'].includes(request.method())) {
            mutationRequests.push(`${request.method()} ${pathname}`);
            await route.abort('blockedbyclient');
            return;
        }
        if (options.delayDashboard && pathname === '/api/platform-admin/dashboard') {
            await new Promise((resolve) => setTimeout(resolve, 700));
        }
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(responseFor(pathname, getMode())) });
    });
}

async function activate(page, panel) {
    const navItem = page.locator(`#platformNav [data-platform-view="${panel}"]`);
    await expect(navItem).toBeAttached();
    // Use the actual application click handler without activating any data action.
    await navItem.evaluate((button) => button.click());
    const active = page.locator(`.platform-view[data-platform-panel="${panel}"]`);
    await expect(active).toHaveClass(/\bactive\b/);
    await expect(active).toBeVisible();
    return active;
}

test('Platform Admin V2 acceptance matrix: nine panels, seven widths, both themes and directions', async ({ page }) => {
    test.setTimeout(8 * 60 * 1000);
    const evidence = path.resolve(process.cwd(), 'qa/artifacts/platform-admin-v2-acceptance-matrix');
    await fs.mkdir(evidence, { recursive: true });
    const mutations = [];
    const apiPaths = new Set();
    let mode = 'populated';
    await installReadOnlyApi(page, () => mode, mutations, apiPaths);
    const pageErrors = [];
    const accessibilityIssues = new Set();
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto('/platform-admin.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#platformAdminApp')).toBeVisible();
    await expect(page.locator('#platformThemeToggle')).toHaveAttribute('aria-label', /\S/);
    await expect(page.locator('#platformMobileMenu')).toHaveAttribute('aria-label', /\S/);
    const coverage = [];

    for (const width of widths) {
        await page.setViewportSize({ width, height: width < 768 ? 900 : 1000 });
        for (const theme of themes) {
            for (const direction of directions) {
                await page.locator('html').evaluate((root, state) => {
                    root.dataset.theme = state.theme;
                    root.dir = state.direction;
                }, { theme, direction });
                for (const panel of panels) {
                    const active = await activate(page, panel);
                    if (width === 320 && theme === 'light' && direction === 'rtl' && populatedMarkers[panel]) {
                        await expect(active, `${panel} populated read-only fixture`).toContainText(populatedMarkers[panel]);
                    }
                    const state = await page.evaluate((markers) => {
                        const activePanel = document.querySelector('.platform-view.active');
                        const controls = [...(activePanel?.querySelectorAll('button, a[href], input, select, textarea, [role="button"]') || [])]
                            .filter((element) => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden');
                        const labelFor = (element) => {
                            const labelledBy = (element.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean)
                                .map((id) => document.getElementById(id)?.textContent?.trim() || '').join(' ');
                            const aria = element.getAttribute('aria-label') || labelledBy || element.getAttribute('title');
                            const id = element.id && document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
                            const wrapping = element.closest('label');
                            const text = element.matches('button, a[href], [role="button"]') ? element.innerText : '';
                            return Boolean((aria || '').trim() || id?.innerText?.trim() || wrapping?.innerText?.trim() || (text || '').trim());
                        };
                        return {
                            panel: activePanel?.dataset.platformPanel,
                            documentWidth: document.documentElement.scrollWidth,
                            bodyWidth: document.body.scrollWidth,
                            visibleControls: controls.length,
                            unnamedControls: controls.filter((element) => !labelFor(element)).map((element) => `${element.tagName.toLowerCase()}#${element.id || ''}.${String(element.className || '').split(' ')[0]}`),
                            navNames: [...document.querySelectorAll('#platformNav [data-platform-view]')].every((element) => Boolean(element.innerText.trim())),
                            visibleMarker: Boolean(markers[activePanel?.dataset.platformPanel]
                                && activePanel?.innerText.includes(markers[activePanel.dataset.platformPanel]))
                        };
                    }, populatedMarkers);
                    expect(state.panel).toBe(panel);
                    expect(state.documentWidth, `${panel} ${width}px ${theme}/${direction} document overflow`).toBeLessThanOrEqual(width);
                    expect(state.bodyWidth, `${panel} ${width}px ${theme}/${direction} body overflow`).toBeLessThanOrEqual(width);
                    if (panel === 'audit') {
                        // Audit history is intentionally read-only and has no
                        // per-row actions; populated records are its operation.
                        expect(state.visibleMarker, 'Audit panel must expose read-only records').toBe(true);
                    } else {
                        expect(state.visibleControls, `${panel} should expose operable controls`).toBeGreaterThan(0);
                    }
                    expect(state.navNames, 'Every panel navigation control must have a visible name').toBe(true);
                    state.unnamedControls.forEach((control) => accessibilityIssues.add(`${panel}: ${control}`));
                    coverage.push({ panel, width, theme, direction, visibleControls: state.visibleControls, populatedFixtureVisible: state.visibleMarker });

                    if ([320, 1440].includes(width)) {
                        await page.screenshot({
                            path: path.join(evidence, `${panel}-${width}-${theme}-${direction}.png`),
                            fullPage: true,
                            animations: 'disabled'
                        });
                    }

                    // Ensure a keyboard-originated focus ring is present on the
                    // real panel navigation control without invoking its action.
                    if (width === 320 && theme === 'light' && direction === 'rtl') {
                        const nav = page.locator(`#platformNav [data-platform-view="${panel}"]`);
                        await nav.evaluate((element) => element.focus({ preventScroll: true }));
                        await page.keyboard.press('Tab');
                        const focus = await page.evaluate(() => {
                            const activeElement = document.activeElement;
                            const style = activeElement ? getComputedStyle(activeElement) : null;
                            return {
                                visible: Boolean(activeElement?.matches(':focus-visible')),
                                outline: style?.outlineStyle !== 'none' && style?.outlineWidth !== '0px',
                                shadow: style?.boxShadow !== 'none'
                            };
                        });
                        expect(focus.visible, `${panel} keyboard focus-visible state`).toBe(true);
                        expect(focus.outline || focus.shadow, `${panel} visible keyboard focus treatment`).toBe(true);
                    }
                }
            }
        }
    }

    // The gym directory's four existing filters must remain legible rather than
    // being compressed into one row on narrow screens.
    await page.setViewportSize({ width: 320, height: 900 });
    await page.locator('html').evaluate((root) => { root.dataset.theme = 'light'; root.dir = 'rtl'; });
    await activate(page, 'gyms');
    const filterLayout = await page.locator('.platform-view[data-platform-panel="gyms"] .directory-toolbar select').evaluateAll((selects) => {
        const rects = selects.map((select) => select.getBoundingClientRect());
        return { count: rects.length, widths: rects.map((rect) => rect.width), rows: new Set(rects.map((rect) => Math.round(rect.top))).size };
    });
    expect(filterLayout.count).toBe(4);
    expect(filterLayout.widths.every((width) => width >= 100), '320px directory filters must not collapse to icon-sized controls').toBe(true);
    expect(filterLayout.rows).toBeGreaterThanOrEqual(2);

    // Test the real rendered empty-table composition, not only the HTTP fixture.
    mode = 'empty';
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('#platformAdminApp')).toBeVisible();
    for (const [panel, selector] of Object.entries(emptyTableBodies)) {
        await activate(page, panel);
        const emptyCell = page.locator(`${selector} tr td[colspan]`);
        await expect(emptyCell, `${panel} empty fixture state`).toBeVisible();
        await expect(emptyCell).not.toContainText('QA ');
    }

    await fs.writeFile(path.join(evidence, 'matrix.json'), JSON.stringify({
        status: 'visual-and-interaction-acceptance-evidence', panels, widths, themes, directions,
        combinations: coverage.length, coverage, apiPaths: [...apiPaths].sort(), mutationRequests: mutations,
        pageErrors, accessibilityIssues: [...accessibilityIssues]
    }, null, 2));
    expect(mutations, 'The acceptance matrix must remain read-only').toEqual([]);
    expect(pageErrors, 'No client runtime exceptions during matrix').toEqual([]);
    expect([...accessibilityIssues], 'Visible controls need accessible names; hand off markup-owned issues rather than masking them with CSS').toEqual([]);
    expect(coverage).toHaveLength(panels.length * widths.length * themes.length * directions.length);
});

test('Platform Admin loading and empty states remain readable with read-only GET fixtures', async ({ page }) => {
    test.setTimeout(90_000);
    let mode = 'empty';
    const mutations = [];
    const apiPaths = new Set();
    await installReadOnlyApi(page, () => mode, mutations, apiPaths, { delayDashboard: true });
    await page.goto('/platform-admin.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#platformAdminApp')).toBeVisible();
    await expect(page.locator('#platformKpis[aria-busy="true"] .skeleton-cards')).toBeVisible();
    await expect(page.locator('#platformKpis[aria-busy="true"]')).toBeHidden();

    for (const panel of panels) {
        await activate(page, panel);
        const metrics = await page.evaluate(() => ({
            width: document.documentElement.scrollWidth,
            viewport: innerWidth,
            panel: document.querySelector('.platform-view.active')?.dataset.platformPanel,
            loadingCount: document.querySelectorAll('.platform-view.active .loading').length
        }));
        expect(metrics.panel).toBe(panel);
        expect(metrics.width).toBeLessThanOrEqual(metrics.viewport);
        expect(metrics.loadingCount, `${panel} must settle into an empty/data state`).toBe(0);
    }
    expect(mutations).toEqual([]);
});
