const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');

const panels = [
    'dashboard', 'gyms', 'requests', 'gym-registrations', 'payment-methods',
    'plans', 'backups', 'audit', 'settings'
];
const widths = [320, 390, 768, 1024, 1440, 1920];
const themes = ['light', 'dark'];
const stamp = '2026-10-12T10:30:00.000Z';

function fixture(pathname) {
    if (pathname === '/api/auth/session') {
        return { authenticated: true, user: { id: 91001, role: 'PlatformAdmin', name: 'QA Platform Admin' } };
    }
    if (pathname === '/api/platform-admin/dashboard') {
        return {
            metrics: {
                gyms: { total: 18, active: 12, trial: 3, suspended: 1, expired: 1, archived: 1 },
                pendingRequests: 2, pendingGymRegistrations: 1, expiringSoon: 2,
                activeUsers: 44, totalMembers: 3270, storageBytes: 734003200
            },
            recentGyms: [{ id: 7001, name: 'نادي الاختبار', tenantType: 'gym', slug: 'qa-gym', status: 'active', owner: { name: 'مالك تجريبي' } }],
            recentActivity: [{ action: 'تحديث خطة', actorName: 'مسؤول تجريبي', details: 'بيئة العرض فقط', createdAt: stamp }]
        };
    }
    if (pathname === '/api/platform-admin/tenants') {
        return {
            tenants: [{
                id: 7001, name: 'نادي الاختبار', slug: 'qa-gym', tenantType: 'gym',
                owner: { name: 'مالك تجريبي', email: 'owner@example.test' },
                subscription: { plan: { name: 'احترافي' }, status: 'active', expiresAt: stamp, daysRemaining: 30 },
                status: 'active', usage: { members: 138, users: 5 }, lastActivityAt: stamp
            }], pagination: { total: 1, page: 1, pages: 1 }
        };
    }
    if (pathname === '/api/platform-admin/subscription-requests') {
        return { requests: [{
            id: 801, tenantName: 'نادي الاختبار', tenantSlug: 'qa-gym', tenantType: 'gym',
            plan: { name: 'احترافي' }, amount: 1200, currency: 'EGP', durationMonths: 1,
            proof: null, status: 'pending', createdAt: stamp
        }], pagination: { total: 1, page: 1, pages: 1 } };
    }
    if (pathname === '/api/platform-admin/gym-registration-requests') {
        return { requests: [{
            id: 802, gymName: 'نادي التسجيل التجريبي', city: 'القاهرة', ownerName: 'مالك تجريبي',
            whatsapp: '+201000000001', email: 'gym@example.test', plan: { name: 'أساسي' },
            term: { durationMonths: 1 }, pricing: { amountDue: 600, currency: 'EGP' },
            paymentMethod: { name: 'تحويل تجريبي' }, proof: null, status: 'pending', createdAt: stamp
        }], pagination: { total: 1, page: 1, pages: 1 }, pendingCount: 1 };
    }
    if (pathname === '/api/platform-admin/payment-methods') {
        return { paymentMethods: [{
            id: 'qa-method-1', displayName: 'تحويل تجريبي', methodCode: 'QA-TRANSFER',
            accountReference: 'QA-0000-0000', recipientName: 'Logic Fit QA',
            instructions: 'بيانات تجريبية للعرض فقط', isActive: true, sortOrder: 1, updatedAt: stamp
        }] };
    }
    if (pathname === '/api/platform-admin/plans') {
        return { plans: [{
            id: 'qa-plan-1', code: 'QA-PRO', name: 'احترافي تجريبي', description: 'خطة اختبار مرئية دون حفظ أي تغييرات.',
            price: 1200, currency: 'EGP', billingPeriod: 'monthly', status: 'active', isActive: true,
            availableForNewSubscriptions: true, terms: [{ code: 'monthly', price: 1200, currency: 'EGP' }],
            maxMembers: 500, maxClients: 100, maxBranches: 4, maxUsers: 12,
            maxAiGenerations: 40, maxStorageMb: 1024, features: { store: true, reports: true },
            compatibleTenantTypes: ['gym']
        }], activeCount: 1 };
    }
    if (pathname === '/api/platform-admin/feature-catalog') {
        return { featureCatalog: [
            { key: 'store', description: 'متجر تجريبي', tenantTypes: ['gym'] },
            { key: 'reports', description: 'تقارير تجريبية', tenantTypes: ['gym'] }
        ] };
    }
    if (pathname === '/api/platform-admin/backups/health') {
        return {
            providerStatus: 'local_development', offsiteStatus: 'not_configured',
            summary: { eligibleTenants: 8, verifiedToday: 7, failedToday: 1, missingToday: 0, backupDay: 'اليوم' },
            scheduledPolicy: { weekly: true, monthly: true },
            registryCoverage: { status: 'covered', uncoveredTenantTables: [], unregisteredPhysicalTenantTables: [], missingPhysicalTables: [] },
            platformFailures: [], tenantDaily: [{ tenantId: 7001, slug: 'qa-gym', status: 'VERIFIED', backupDay: stamp, sizeBytes: 65536, verifiedAt: stamp, id: 'qa-backup-tenant' }]
        };
    }
    if (pathname === '/api/platform-admin/backups') {
        return {
            backups: [{ id: 'qa-backup-platform', backupType: 'platform_daily', status: 'VERIFIED', backupDay: stamp, sizeBytes: 131072, verifiedAt: stamp }],
            audit: [{ createdAt: stamp, eventType: 'verification', backupId: 'qa-backup-platform', result: 'success', reason: 'Fixture only' }]
        };
    }
    if (pathname === '/api/platform-admin/audit') {
        return { audit: [{
            createdAt: stamp, actorName: 'مسؤول تجريبي', action: 'عرض سجل الاختبار',
            tenantId: 'QA', reason: 'لقطة عرض فقط', details: 'سجل اصطناعي، لا يمثل عملية فعلية.'
        }] };
    }
    return {};
}

test('Platform Admin nine-panel V2 continuation: six widths, two themes, read-only fixtures', async ({ page }) => {
    test.setTimeout(5 * 60 * 1000);
    const artifactDirectory = path.resolve(process.cwd(), 'qa/artifacts/platform-admin-v2-screen-continuation');
    await fs.mkdir(artifactDirectory, { recursive: true });
    const browserErrors = [];
    const mutationRequests = [];
    const requestedPaths = new Set();
    page.on('pageerror', (error) => browserErrors.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
        if (message.type() === 'error') browserErrors.push(`console: ${message.text()}`);
    });
    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;
        if (!['GET', 'HEAD'].includes(request.method())) mutationRequests.push(`${request.method()} ${pathname}`);
        requestedPaths.add(pathname);
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(fixture(pathname))
        });
    });

    await page.goto('/platform-admin.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#platformAdminApp')).toBeVisible();
    const captures = new Map();
    const measurements = [];

    for (const width of widths) {
        await page.setViewportSize({ width, height: width <= 390 ? 844 : 960 });
        for (const theme of themes) {
            await page.locator('html').evaluate((element, value) => { element.dataset.theme = value; }, theme);
            for (const panel of panels) {
                const navItem = page.locator(`#platformNav [data-platform-view="${panel}"]`);
                await expect(navItem).toBeAttached();
                // Invoke the real navigation handler; setView closes the mobile drawer.
                await navItem.evaluate((button) => button.click());
                const activePanel = page.locator(`.platform-view[data-platform-panel="${panel}"]`);
                await expect(activePanel).toHaveClass(/\bactive\b/);
                await expect(page.locator('.platform-sidebar')).not.toHaveClass(/\bopen\b/);
                await page.waitForTimeout(40);
                await page.keyboard.press('Tab');

                const measurement = await page.evaluate(() => {
                    const root = document.querySelector('.platform-admin-page');
                    const panel = document.querySelector('.platform-view.active');
                    const focusable = panel?.querySelector('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])')
                        || document.querySelector('#platformNav button.active');
                    focusable?.focus({ preventScroll: true });
                    const focused = focusable ? getComputedStyle(focusable) : null;
                    const panelRect = panel?.getBoundingClientRect();
                    return {
                        viewport: innerWidth,
                        documentWidth: document.documentElement.scrollWidth,
                        bodyWidth: document.body.scrollWidth,
                        rootWidth: root?.scrollWidth,
                        panelWidth: panel?.clientWidth,
                        panelScrollWidth: panel?.scrollWidth,
                        panel: panel?.dataset.platformPanel,
                        visiblePanelWidth: panelRect?.width,
                        focusTarget: focusable?.className || focusable?.tagName || null,
                        focusVisible: focusable?.matches(':focus-visible') || false,
                        focusOutline: focused?.outlineStyle,
                        focusOutlineWidth: focused?.outlineWidth,
                        focusShadow: focused?.boxShadow,
                        theme: document.documentElement.dataset.theme
                    };
                });
                expect(measurement.documentWidth, `${panel}/${width}/${theme} document overflow`).toBeLessThanOrEqual(width);
                expect(measurement.bodyWidth, `${panel}/${width}/${theme} body overflow`).toBeLessThanOrEqual(width);
                expect(measurement.panelScrollWidth, `${panel}/${width}/${theme} panel overflow`).toBeLessThanOrEqual(measurement.panelWidth);
                expect(measurement.panel).toBe(panel);
                expect(measurement.focusTarget, `${panel}/${width}/${theme} must expose a focus target`).toBeTruthy();
                expect(measurement.focusVisible, `${panel}/${width}/${theme} keyboard focus must be visible`).toBe(true);
                measurements.push(measurement);

                const screenshot = await page.screenshot({ fullPage: true, animations: 'disabled' });
                const name = `${panel}-${width}-${theme}.png`;
                await fs.writeFile(path.join(artifactDirectory, name), screenshot);
                captures.set(name, screenshot.toString('base64'));
            }
        }
    }

    // Contact sheets preserve an at-a-glance comparison across all six widths and themes.
    for (const panel of panels) {
        const tiles = [];
        for (const theme of themes) {
            for (const width of widths) {
                const name = `${panel}-${width}-${theme}.png`;
                tiles.push(`<figure><figcaption>${width}px · ${theme}</figcaption><img alt="${name}" src="data:image/png;base64,${captures.get(name)}"></figure>`);
            }
        }
        await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
            *{box-sizing:border-box}body{margin:0;padding:16px;background:#e9eef5;color:#172033;font:14px/1.4 sans-serif}
            h1{margin:0 0 12px;font-size:20px}.sheet{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px}
            figure{margin:0;min-width:0;padding:5px;border:1px solid #cbd7e6;border-radius:8px;background:white}
            figcaption{padding:2px 4px;font-size:12px;font-weight:600}img{display:block;width:100%;height:360px;object-fit:contain;object-position:top center;background:#f5f7fb}
            @media(max-width:900px){.sheet{grid-template-columns:repeat(3,minmax(0,1fr))}}
        </style></head><body><h1>Platform Admin · ${panel}</h1><div class="sheet">${tiles.join('')}</div></body></html>`);
        await page.screenshot({ path: path.join(artifactDirectory, `${panel}-contact-sheet.png`), fullPage: true });
    }

    await fs.writeFile(path.join(artifactDirectory, 'matrix.json'), JSON.stringify({
        status: 'synthetic-read-only-visual-layout-evidence', panels, widths, themes,
        combinations: measurements.length, measurements, mutationRequests,
        apiPaths: [...requestedPaths].sort(), browserErrors
    }, null, 2));
    expect(mutationRequests, 'The visual fixture run must not issue API mutations').toEqual([]);
    expect(browserErrors, 'No browser console or page errors during panel matrix').toEqual([]);
    expect(measurements).toHaveLength(108);
    console.log(`PLATFORM_ADMIN_V2_CONTINUATION=${panels.length} PANELS=${panels.length} WIDTHS=${widths.length} THEMES=${themes.length} COMBINATIONS=${measurements.length} FIXTURE=READ_ONLY`);
});
