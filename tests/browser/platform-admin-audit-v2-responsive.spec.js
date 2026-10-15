const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');

test('Platform Admin audit details wrap without causing page overflow across themes and viewports', async ({ page }, testInfo) => {
    const longDetails = Array.from({ length: 34 }, (_, index) => `تفاصيل مراجعة ${index + 1} توضح سبب التغيير الإداري والسياق المرتبط به`).join(' · ');
    await page.route('**/api/**', async (route) => {
        const pathname = new URL(route.request().url()).pathname;
        let payload = {};
        if (pathname === '/api/auth/session') {
            payload = { authenticated: true, user: { id: 9001, role: 'PlatformAdmin', name: 'QA Platform Admin' } };
        } else if (pathname === '/api/platform-admin/audit') {
            payload = { audit: [{ createdAt: '2026-10-11T10:30:00.000Z', actorName: 'QA Platform Admin', action: 'تعديل إعداد المنصة', tenantId: 'Power Gym', reason: 'مراجعة QA', details: longDetails }] };
        }
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
    });

    await page.goto('/platform-admin.html#audit', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#platformAdminApp')).toBeVisible();
    const auditPanel = page.locator('[data-platform-panel="audit"]');
    await expect(auditPanel).toBeVisible();
    await expect(page.locator('#auditTableBody tr')).toHaveCount(1);

    await expect(page.locator('link[rel="stylesheet"][href*="/css/main.css"]')).toHaveCount(1);

    const viewports = testInfo.project.name === 'desktop'
        ? [{ width: 1440, height: 900 }, { width: 1024, height: 900 }, { width: 768, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 780 }]
        : [{ width: page.viewportSize().width, height: page.viewportSize().height }];
    const measurements = [];
    const evidenceDirectory = path.resolve(process.cwd(), 'qa/artifacts/platform-admin-audit-v2');
    await fs.mkdir(evidenceDirectory, { recursive: true });

    for (const viewport of viewports) {
        await page.setViewportSize(viewport);
        for (const theme of ['light', 'dark']) {
            await page.locator('html').evaluate((element, value) => { element.dataset.theme = value; }, theme);
            const detailsCell = page.locator('#auditTableBody tr:first-child td:last-child');
            const data = await page.evaluate(() => {
                const panel = document.querySelector('[data-platform-panel="audit"]');
                const wrapper = panel.querySelector('.table-scroll');
                const table = wrapper.querySelector('table');
                const details = table.querySelector('tbody tr:first-child td:last-child');
                return {
                    width: innerWidth,
                    documentWidth: document.documentElement.scrollWidth,
                    wrapperWidth: Math.round(wrapper.clientWidth),
                    tableWidth: Math.round(table.getBoundingClientRect().width),
                    detailsWidth: Math.round(details.getBoundingClientRect().width),
                    detailsScrollWidth: details.scrollWidth,
                    detailsWhiteSpace: getComputedStyle(details).whiteSpace,
                    detailsOverflowWrap: getComputedStyle(details).overflowWrap
                };
            });
            measurements.push({ theme, ...data });
            await page.screenshot({
                path: path.join(evidenceDirectory, `audit-${viewport.width}-${theme}.png`),
                fullPage: false
            });
            await expect(detailsCell).toBeVisible();
        }
    }

    console.log(`AUDIT_LAYOUT_MEASUREMENTS=${JSON.stringify(measurements)}`);
    expect(measurements.every((item) => item.documentWidth <= item.width), 'audit content must not widen the page').toBe(true);
    expect(measurements.every((item) => item.detailsWhiteSpace === 'normal'), 'free-form audit details must wrap instead of forcing a single-line table').toBe(true);
    expect(measurements.every((item) => item.detailsScrollWidth <= item.detailsWidth + 1), 'audit details must not overflow their cell').toBe(true);
});
