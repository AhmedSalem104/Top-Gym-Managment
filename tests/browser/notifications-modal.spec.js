const { test, expect } = require('@playwright/test');
const featureCatalog = require('../../src/services/feature-catalog');

function json(route, payload, status = 200) {
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) });
}

async function installNotificationFixture(page, mode = 'items') {
    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const { pathname } = url;
        if (pathname === '/api/auth/session') {
            return json(route, { authenticated: true, user: { id: 901, name: 'Notification QA', role: 'Owner', tenantType: 'gym', permissions: [] } });
        }
        if (pathname === '/api/branding') return json(route, { identity: { brandName: 'Notification QA Gym' } });
        if (pathname === '/api/saas/entitlements') {
            return json(route, {
                tenantStatus: 'active',
                subscription: { status: 'active', plan: { code: 'business', name: 'Business' } },
                entitlements: { tenantType: 'gym', featureCatalog: featureCatalog.getFeatureCatalog({ tenantType: 'gym' }), features: { dashboard: true, notifications: true } }
            });
        }
        if (pathname === '/api/branches/bootstrap') {
            return json(route, { branches: [{ id: 1, name: 'Main Branch', status: 'active', isMain: true }], activeBranches: [{ id: 1, name: 'Main Branch', status: 'active', isMain: true }], defaultBranch: { id: 1, name: 'Main Branch', status: 'active', isMain: true }, sections: [{ id: 11, name: 'Mixed', type: 'mixed', branchId: 1, active: true }], branchLimit: null, hasMultipleActiveBranches: false, canUseAllBranches: true });
        }
        if (pathname === '/api/dashboard') return json(route, { stats: {}, alerts: [], financialSummary: {} });
        if (pathname === '/api/notifications/unread-count') return json(route, { unread: mode === 'items' ? 1 : 0 });
        if (pathname === '/api/notifications' && request.method() === 'GET') {
            if (mode === 'error') return json(route, { error: 'fixture error' }, 500);
            const notifications = mode === 'empty' ? [] : Array.from({ length: 18 }, (_, index) => ({
                id: index + 1,
                type: index === 0 ? 'attendance_checked_in' : index === 1 ? 'membership_created' : index === 2 ? 'member_created' : 'future_unknown_event',
                category: index < 3 ? (index === 0 ? 'attendance' : 'membership') : 'system',
                severity: 'info',
                title: index === 0 ? 'تم تسجيل الحضور' : index === 1 ? 'تم إنشاء الاشتراك' : index === 2 ? 'عضو جديد' : 'إشعار جديد',
                message: index < 3 ? `Notification emitted for ${index === 0 ? 'attendance_checked_in' : index === 1 ? 'membership_created' : 'member_created'}.: أحمد عبد الحميد` : `تحديث تجريبي طويل لاختبار التفاف النص في نافذة الإشعارات على قياس ${index + 1}`,
                actionUrl: '/attendance',
                createdAt: '2026-10-07T10:30:00.000Z',
                read: index > 0
            }));
            return json(route, { notifications, pagination: { page: Number(url.searchParams.get('page') || 1), pageSize: 8, total: notifications.length, hasNext: Number(url.searchParams.get('page') || 1) === 1 } });
        }
        return json(route, {});
    });
}

test('mobile notification dialog layers above the shell, stays contained, and restores focus', async ({ page }, testInfo) => {
    await installNotificationFixture(page);
    await page.goto('/index.html#dashboard', { waitUntil: 'networkidle' });
    await expect(page.locator('.notification-center-trigger')).toBeVisible();

    for (const width of [320, 360, 390, 430]) {
        await page.setViewportSize({ width, height: 844 });
        for (const theme of ['light', 'dark']) {
            await page.evaluate((value) => window.TopGymTheme.set(value), theme);
            const trigger = page.locator('.notification-center-trigger');
            await trigger.click();
            const panel = page.locator('#notificationCenterPanel');
            const layer = page.locator('[data-notification-modal-layer]');
            await expect(panel).toBeVisible();
            await expect(panel).toHaveAttribute('aria-modal', 'true');
            await expect(page.getByText('Notification emitted for', { exact: false })).toHaveCount(0);
            await expect(panel.locator('.notification-center-item-title').first()).toHaveText('تم تسجيل حضور أحمد عبد الحميد');
            await expect(panel.locator('.notification-center-item-message').first()).toBeHidden();
            const metrics = await page.evaluate(() => {
                const dialog = document.querySelector('#notificationCenterPanel').getBoundingClientRect();
                const backdrop = document.querySelector('[data-notification-modal-layer]').getBoundingClientRect();
                return { dialog: { x: dialog.x, right: dialog.right, height: dialog.height }, backdrop: { x: backdrop.x, right: backdrop.right, height: backdrop.height }, viewport: innerWidth, document: document.documentElement.scrollWidth, body: getComputedStyle(document.body).overflow, panelParent: document.querySelector('#notificationCenterPanel').parentElement.matches('[data-notification-modal-layer]') };
            });
            expect(metrics.dialog.x).toBeGreaterThanOrEqual(11);
            expect(metrics.dialog.right).toBeLessThanOrEqual(width - 11);
            expect(metrics.dialog.height).toBeLessThanOrEqual(844);
            expect(metrics.document).toBeLessThanOrEqual(width + 1);
            expect(metrics.panelParent).toBe(true);
            expect(metrics.body).toBe('hidden');
            expect(metrics.backdrop.x).toBe(0);
            expect(metrics.backdrop.right).toBe(width);
            expect(await panel.locator('.notification-center-list').evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
            await page.screenshot({ path: testInfo.outputPath(`notifications-${width}-${theme}.png`), fullPage: false });
            await page.keyboard.press('Escape');
            await expect(panel).toBeHidden();
            await expect(trigger).toBeFocused();
            await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
        }
    }
});

test('notification close control, read-all state, and mobile focus containment work', async ({ page }) => {
    await installNotificationFixture(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/index.html#dashboard', { waitUntil: 'networkidle' });
    const trigger = page.locator('.notification-center-trigger');
    await trigger.click();
    const panel = page.locator('#notificationCenterPanel');
    const close = page.locator('[data-notification-close]');
    await expect(close).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(panel.locator('[data-notification-read-all]')).toBeFocused();
    const readAll = panel.locator('[data-notification-read-all]');
    await expect(readAll).toBeEnabled();
    await readAll.click();
    await expect(readAll).toBeDisabled();
    await close.click();
    await expect(trigger).toBeFocused();
});

test('notification panel retains desktop popover behavior and is not a mobile modal', async ({ page }) => {
    await installNotificationFixture(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/index.html#dashboard', { waitUntil: 'networkidle' });
    const trigger = page.locator('.notification-center-trigger');
    await trigger.click();
    const panel = page.locator('#notificationCenterPanel');
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute('aria-modal', 'false');
    await expect(page.locator('[data-notification-modal-layer]')).toHaveCount(0);
    await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
    const panelBounds = await panel.boundingBox();
    expect(panelBounds).not.toBeNull();
    expect(panelBounds.width).toBeGreaterThan(300);
    expect(panelBounds.x).toBeGreaterThanOrEqual(0);
    expect(panelBounds.x + panelBounds.width).toBeLessThanOrEqual(1440);
    await page.screenshot({ path: 'qa/artifacts/playwright/notifications-desktop-1440.png', fullPage: false });
    await page.locator('[data-notification-close]').click();
    await expect(trigger).toBeFocused();
});

test('notification empty and error states are rendered in the list region', async ({ page }) => {
    await installNotificationFixture(page, 'empty');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/index.html#dashboard', { waitUntil: 'networkidle' });
    await page.locator('.notification-center-trigger').click();
    await expect(page.locator('.notification-center-empty')).toHaveText('لا توجد إشعارات جديدة.');
    await page.locator('[data-notification-close]').click();
    await installNotificationFixture(page, 'error');
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('.notification-center-trigger').click();
    await expect(page.locator('.notification-center-error')).toHaveText('تعذر تحميل الإشعارات. حاول مرة أخرى.');
});
