const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');

const populatedDashboard = {
    metrics: {
        gyms: { total: 128, active: 94, trial: 12, suspended: 7, expired: 9, archived: 6 },
        newGyms: 8,
        members: 28450,
        users: 312,
        aiGenerations: 1420,
        storageBytes: 782341129,
        pendingRequests: 5,
        expiringSubscriptions: 11
    },
    recentGyms: [{
        id: 501,
        name: 'نادي القوة الرياضي – فرع القاهرة الجديدة',
        tenantType: 'gym',
        slug: 'power-gym-cairo',
        status: 'active',
        owner: { name: 'أحمد محمد' }
    }],
    recentActivity: [{
        action: 'تحديث إعدادات الاشتراك',
        actorName: 'مدير المنصة',
        details: 'مراجعة بيانات النادي وتحديث الباقة السنوية',
        createdAt: '2026-10-11T10:30:00.000Z'
    }]
};

const emptyDashboard = {
    metrics: { gyms: {}, newGyms: 0, members: 0, users: 0, aiGenerations: 0, storageBytes: 0, pendingRequests: 0, expiringSubscriptions: 0 },
    recentGyms: [],
    recentActivity: []
};

test('Platform Admin dashboard V2 KPI hierarchy and RTL layout remain readable across themes and viewports', async ({ page }) => {
    let dashboardPayload = populatedDashboard;
    const nonReadRequests = [];

    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;
        if (request.method() !== 'GET') nonReadRequests.push(`${request.method()} ${pathname}`);

        let payload = {};
        if (pathname === '/api/auth/session') {
            payload = { authenticated: true, user: { id: 9001, role: 'PlatformAdmin', name: 'مدير اختبار المنصة' } };
        } else if (pathname === '/api/platform-admin/dashboard') {
            payload = dashboardPayload;
        } else if (pathname === '/api/platform-admin/plans') {
            payload = { plans: [] };
        }

        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
    });

    await page.goto('/platform-admin.html#dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#platformAdminApp')).toBeVisible();
    await expect(page.locator('#platformKpis .platform-kpi')).toHaveCount(10);
    await expect(page.locator('#platformStatusGrid .status-tile')).toHaveCount(5);
    await expect(page.locator('#recentTenants .mini-tenant')).toHaveCount(1);
    await expect(page.locator('#recentActivity .mini-activity')).toHaveCount(1);
    const recentTenant = page.locator('#recentTenants .mini-tenant');
    await recentTenant.focus();
    const actionStyle = await recentTenant.evaluate((element) => ({
        background: getComputedStyle(element).backgroundColor,
        borderTop: getComputedStyle(element).borderTopWidth,
        outline: getComputedStyle(element).outlineStyle
    }));
    expect(actionStyle.background).toBe('rgba(0, 0, 0, 0)');
    expect(actionStyle.borderTop).toBe('0px');
    expect(actionStyle.outline).toBe('solid');
    await recentTenant.evaluate((element) => element.blur());
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(250);

    const evidenceDirectory = path.resolve(process.cwd(), 'qa/artifacts/platform-admin-dashboard-v2');
    await fs.mkdir(evidenceDirectory, { recursive: true });

    for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: width < 600 ? 780 : 900 });
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(250);
        for (const theme of ['light', 'dark']) {
            await page.locator('html').evaluate((element, value) => { element.dataset.theme = value; }, theme);
            const layout = await page.evaluate(() => {
                const kpis = document.querySelector('#platformKpis');
                const label = kpis.querySelector('.platform-kpi-label');
                const value = kpis.querySelector('.platform-kpi-value');
                const status = document.querySelector('#platformStatusGrid');
                return {
                    width: innerWidth,
                    documentWidth: document.documentElement.scrollWidth,
                    direction: getComputedStyle(document.querySelector('.platform-content')).direction,
                    kpiColumns: getComputedStyle(kpis).gridTemplateColumns.split(' ').length,
                    statusColumns: getComputedStyle(status).gridTemplateColumns.split(' ').length,
                    labelFontSize: getComputedStyle(label).fontSize,
                    labelWeight: getComputedStyle(label).fontWeight,
                    valueWeight: getComputedStyle(value).fontWeight,
                    labelBox: label.getBoundingClientRect().width,
                    valueText: value.textContent.trim()
                };
            });

            expect(layout.documentWidth, `${theme} ${width}px page overflow`).toBeLessThanOrEqual(width);
            expect(layout.direction).toBe('rtl');
            expect(layout.kpiColumns).toBe(width < 681 ? 2 : width <= 1280 ? 4 : 5);
            expect(layout.statusColumns).toBe(width < 681 ? 2 : width <= 1280 ? 3 : 5);
            expect(layout.labelFontSize).toBe('13px');
            expect(layout.labelWeight).toBe('500');
            expect(layout.valueWeight).toBe('600');
            expect(layout.labelBox).toBeGreaterThan(0);
            expect(layout.valueText).not.toBe('');

            await page.mouse.move(0, 0);
            await page.screenshot({
                path: path.join(evidenceDirectory, `dashboard-${width}-${theme}.png`),
                fullPage: true
            });
        }
    }

    dashboardPayload = emptyDashboard;
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('html').evaluate((element) => { element.dataset.theme = 'light'; });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(250);
    await page.locator('[data-platform-action="refresh-dashboard"]').click();
    await expect(page.locator('#recentTenants')).toContainText('لا توجد جيمات مضافة بعد');
    await expect(page.locator('#recentActivity')).toContainText('لا توجد عمليات مسجلة');
    await expect(page.locator('#platformKpis .platform-kpi-value')).toHaveCount(10);
    expect(nonReadRequests).toEqual([]);

    await page.mouse.move(0, 0);
    await page.screenshot({
        path: path.join(evidenceDirectory, 'dashboard-empty-390-light.png'),
        fullPage: true
    });
});
