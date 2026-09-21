const { test, expect } = require('@playwright/test');

const viewports = [
    { width: 320, height: 568, name: 'mobile-320' },
    { width: 390, height: 844, name: 'mobile-390' },
    { width: 768, height: 1024, name: 'tablet-768' },
    { width: 1024, height: 768, name: 'tablet-1024' },
    { width: 1440, height: 900, name: 'desktop-1440' },
    { width: 1920, height: 1080, name: 'desktop-1920' }
];

async function prepareDashboard(page) {
    await page.evaluate(() => {
        document.documentElement.lang = 'ar';
        document.documentElement.dir = 'rtl';
        document.body.classList.remove('auth-pending', 'auth-locked', 'top-gym-navigation-pending');
        document.getElementById('authScreen')?.setAttribute('hidden', '');
        document.querySelector('.app-shell')?.style.removeProperty('display');
    });
}

function assertLayoutContract(snapshot, viewport) {
    expect(snapshot.scrollWidth, `rtl/${viewport.name} horizontal overflow`).toBeLessThanOrEqual(viewport.width);
    expect(snapshot.main.left, `rtl/${viewport.name} main starts outside viewport`).toBeGreaterThanOrEqual(-1);
    expect(snapshot.main.right, `rtl/${viewport.name} main ends outside viewport`).toBeLessThanOrEqual(viewport.width + 1);

    if (snapshot.sidebar.visible) {
        expect(snapshot.sidebar.left).toBeGreaterThanOrEqual(-1);
        expect(snapshot.sidebar.right).toBeLessThanOrEqual(viewport.width + 1);
        expect(snapshot.sidebarMainOverlap, `rtl/${viewport.name} sidebar/main overlap`).toBeLessThanOrEqual(1);
        for (const item of snapshot.navItems) {
            expect(item.left, `rtl/${viewport.name} nav item starts outside sidebar`).toBeGreaterThanOrEqual(snapshot.sidebar.left - 1);
            expect(item.right, `rtl/${viewport.name} nav item ends outside sidebar`).toBeLessThanOrEqual(snapshot.sidebar.right + 1);
        }
    }

    for (const card of snapshot.cards) {
        expect(card.left, `rtl/${viewport.name} card starts outside main`).toBeGreaterThanOrEqual(snapshot.main.left - 1);
        expect(card.right, `rtl/${viewport.name} card ends outside main`).toBeLessThanOrEqual(snapshot.main.right + 1);
        expect(card.left, `rtl/${viewport.name} card starts outside viewport`).toBeGreaterThanOrEqual(-1);
        expect(card.right, `rtl/${viewport.name} card ends outside viewport`).toBeLessThanOrEqual(viewport.width + 1);
    }
}

test('Tailwind shared shell keeps RTL sidebar and dashboard geometry isolated', async ({ page }) => {
    for (const viewport of viewports) {
            await page.setViewportSize({ width: viewport.width, height: viewport.height });
            await page.goto('/#dashboard', { waitUntil: 'networkidle' });
            await prepareDashboard(page);
            const snapshot = await page.evaluate(() => {
                const rect = (selector) => {
                    const element = document.querySelector(selector);
                    if (!element || getComputedStyle(element).display === 'none' || getComputedStyle(element).visibility === 'hidden' || element.hidden) return null;
                    const box = element.getBoundingClientRect();
                    return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height };
                };
                const sidebar = rect('#pageTabs');
                const main = rect('.app-shell > main.page');
                const sidebarMainOverlap = sidebar && main
                    ? Math.max(0, Math.min(sidebar.right, main.right) - Math.max(sidebar.left, main.left))
                    : 0;
                const cardSelectors = [
                    '.dashboard-hero',
                    '.stats-grid',
                    '.alerts-panel',
                    '.monthly-finance-card:not([hidden])',
                    '.monthly-finance-snapshot',
                    '.dashboard-day-pass-card',
                    '.dashboard-analytics:not([hidden])'
                ];
                return {
                    scrollWidth: document.documentElement.scrollWidth,
                    sidebar: { ...(sidebar || { left: 0, right: 0 }), visible: Boolean(sidebar) },
                    main: main || { left: 0, right: 0 },
                    sidebarMainOverlap,
                    navItems: [...document.querySelectorAll('#pageTabs .page-tab')]
                        .filter((item) => getComputedStyle(item).display !== 'none' && !item.hidden)
                        .map((item) => { const box = item.getBoundingClientRect(); return { left: box.left, right: box.right }; }),
                    cards: cardSelectors.map(rect).filter(Boolean),
                    oversizedIcons: [
                        ...document.querySelectorAll('svg.ui-icon, svg.icon, svg.nav-icon, svg.action-icon, svg.alert-status-icon, svg.status-badge-icon, svg.notification-center-icon-svg, svg.notification-center-action-icon, svg.coaching-inline-icon, svg.permission-group-chevron-icon, .notification-center-icon-button > svg, .notification-center-read-all > svg, .member-dialog-heading-icon > svg, .member-form-section-icon > svg, .registration-type-option-icon > svg, .trainer-studio-sidebar-nav svg, .trainer-studio-nav-icon svg, .trainer-quick-action svg')
                    ].filter((icon) => {
                        const style = getComputedStyle(icon);
                        return style.display !== 'none' && style.visibility !== 'hidden' && !icon.closest('[hidden]') && !icon.classList.contains('analytics-trend-svg');
                    }).map((icon) => {
                        const box = icon.getBoundingClientRect();
                        return { className: icon.getAttribute('class') || '', width: box.width, height: box.height };
                    }).filter((icon) => Math.max(icon.width, icon.height) > 64)
                };
            });
            assertLayoutContract(snapshot, viewport);
            expect(snapshot.oversizedIcons, `rtl/${viewport.name} oversized shared icons`).toEqual([]);

            if (viewport.width <= 767) {
                const toggle = page.locator('#mobileNavToggle');
                if (await toggle.isVisible()) {
                    await toggle.click();
                    await expect(page.locator('body')).toHaveClass(/mobile-nav-open/);
                    await page.locator('#mobileNavClose').click();
                    await expect(page.locator('body')).not.toHaveClass(/mobile-nav-open/);
                    const closed = await page.locator('#pageTabs').evaluate((element) => {
                        const box = element.getBoundingClientRect();
                        const style = getComputedStyle(element);
                        return { display: style.display, left: box.left, right: box.right };
                    });
                    expect(
                        closed.display === 'none'
                        || closed.right <= 1
                        || closed.left >= viewport.width - 1,
                        `rtl/${viewport.name} closed mobile drawer still covers content`
                    ).toBeTruthy();
                }
            } else if (viewport.width <= 1023) {
                expect(snapshot.sidebar.visible, `rtl/${viewport.name} tablet sidebar should own its reserved track`).toBeTruthy();
            }
    }
});
