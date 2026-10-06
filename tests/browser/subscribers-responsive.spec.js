const { test, expect } = require('@playwright/test');
const featureCatalog = require('../../src/services/feature-catalog');

const member = {
    id: 731,
    fullName: 'أحمد منير الشاذلي',
    phone: '+201014978491',
    phoneCountry: 'EG',
    registrationDate: '2026-09-01',
    membership: {
        plan: 'gym',
        type: 'monthly',
        status: 'active',
        effectiveEndDate: '2026-10-28',
        daysRemaining: 23,
        freezeLimit: 3,
        freezeCount: 1,
        amountPaid: 200,
        amountDue: 350,
        amountRemaining: 150
    },
    attendance: {}
};

async function installSubscribersRuntime(page) {
    const runtime = { total: 33, member };
    const memberQueries = [];
    await page.route('**/api/**', async (route) => {
        const pathname = new URL(route.request().url()).pathname;
        const payloads = {
            '/api/auth/session': { authenticated: true, user: { id: 901, name: 'Subscribers QA', role: 'Owner', tenantType: 'gym', permissions: [] } },
            '/api/branding': { identity: { brandName: 'Subscribers QA' } },
            '/api/saas/entitlements': {
                tenantStatus: 'active',
                subscription: { status: 'active', plan: { code: 'business', name: 'Business' } },
                entitlements: { tenantType: 'gym', featureCatalog: featureCatalog.getFeatureCatalog({ tenantType: 'gym' }), features: Object.fromEntries(['dashboard', 'members', 'attendance', 'reports', 'branches', 'trainees', 'library', 'store', 'management', 'permissions'].map((key) => [key, true])) }
            },
            '/api/branches/bootstrap': {
                branches: [{ id: 1, name: 'Main Branch', code: 'main', status: 'active', isMain: true }],
                activeBranches: [{ id: 1, name: 'Main Branch', code: 'main', status: 'active', isMain: true }],
                defaultBranch: { id: 1, name: 'Main Branch', code: 'main', status: 'active', isMain: true },
                sections: [], branchLimit: null, hasMultipleActiveBranches: false, canUseAllBranches: true
            },
            '/api/dashboard': { stats: { total: 33, active: 24, expiringSoon: 5, expired: 4 }, alerts: [] },
            '/api/pricing': {
                plans: { gym_only: { label: 'جيم فقط', monthlyPrice: 350, active: true }, gym_cardio: { label: 'جيم وكارديو', monthlyPrice: 450, active: true } },
                types: { monthly: { label: 'شهرية', mode: 'months', durationValue: 1, priceMultiplier: 1, active: true } },
                durations: { monthly: 1 }
            }
        };
        if (pathname === '/api/members') {
            const url = new URL(route.request().url());
            const page = Number(url.searchParams.get('page') || 1);
            const pageSize = Number(url.searchParams.get('pageSize') || 5);
            const totalPages = runtime.total ? Math.ceil(runtime.total / pageSize) : 0;
            memberQueries.push({ search: url.searchParams.get('search'), status: url.searchParams.get('status'), sort: url.searchParams.get('sort'), page, pageSize });
            return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ members: runtime.total ? [runtime.member] : [], pagination: { total: runtime.total, page, pageSize, totalPages, hasPrevious: page > 1, hasNext: page < totalPages } }) });
        }
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payloads[pathname] || {}) });
    });
    return { runtime, memberQueries };
}

test('subscribers use the table on desktop and a single responsive card list on phones', async ({ page }) => {
    const { runtime, memberQueries } = await installSubscribersRuntime(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/index.html#members', { waitUntil: 'networkidle' });
    await expect(page.locator('#membersSection')).toBeVisible();
    await expect(page.locator('.members-table')).toBeVisible();
    await expect(page.locator('.members-summary-item')).toHaveCount(4);
    await expect(page.locator('#membersCount')).toContainText('مشترك');

    await page.setViewportSize({ width: 320, height: 800 });
    await expect(page.locator('.members-mobile-card')).toHaveCount(1);
    await expect(page.locator('.members-table')).toHaveCount(0);
    await expect(page.locator('#membersSummary')).toBeHidden();
    await expect(page.locator('.members-mobile-name')).toContainText('أحمد منير الشاذلي');
    runtime.member = { ...member, fullName: 'اسم عربي طويل جدًا لاختبار التفاف النص دون كسر تخطيط بطاقة المشترك على الهاتف', phone: '' };
    await page.locator('#searchInput').fill('missing-phone');
    await expect(page.locator('.members-mobile-name')).toContainText('اسم عربي طويل جدًا');
    await expect(page.locator('.members-mobile-card-head .table-member-phone.is-missing')).toBeVisible();
    await expect(page.locator('.members-mobile-card-head a.table-member-phone')).toHaveCount(0);
    runtime.member = member;
    await page.locator('#searchInput').fill('');
    await expect(page.locator('.members-mobile-name')).toContainText('أحمد منير الشاذلي');
    await expect(page.locator('.members-mobile-actions [data-action="details"]')).toBeVisible();
    await expect(page.locator('.members-mobile-actions [data-action="renew"]')).toBeVisible();
    await expect(page.locator('.members-mobile-actions [data-action="qr"]')).toHaveCount(1);
    await expect(page.locator('.members-mobile-actions [data-action="refund"]')).toHaveCount(1);
    await expect(page.locator('.members-mobile-actions .action-menu-panel [data-member-coaching-action="workout"]')).toBeHidden();
    await expect(page.locator('.members-mobile-card .member-quick-actions [data-attendance-action="checkin"]')).toBeVisible();
    await page.locator('.members-mobile-actions [data-menu-toggle]').click();
    await expect(page.locator('.members-mobile-actions .action-menu-panel [data-action="payment"]')).toBeVisible();
    await expect(page.locator('.members-mobile-actions .action-menu-panel [data-action="delete"]')).toBeVisible();
    await expect(page.locator('.members-mobile-actions .action-menu-panel [data-action="qr"]')).toBeVisible();
    await expect(page.locator('.members-mobile-actions .action-menu-panel [data-action="refund"]')).toBeVisible();
    await expect(page.locator('.members-mobile-actions .action-menu-panel [data-member-coaching-action="workout"]')).toBeVisible();
    await page.locator('.members-filter-disclosure > summary').click();
    await expect(page.locator('#statusFilter')).toBeVisible();
    await page.locator('#statusFilter').selectOption('active');
    await expect(page.locator('.members-filter-disclosure')).toHaveClass(/has-active-filters/);
    await expect(page.locator('.members-mobile-pagination > span')).toHaveText('1 / 7');
    await page.locator('.members-mobile-pagination [aria-label="التالي"]').click();
    await expect(page.locator('.members-mobile-pagination > span')).toHaveText('2 / 7');
    await page.locator('.members-mobile-pagination [aria-label="السابق"]').click();
    await expect(page.locator('.members-mobile-pagination > span')).toHaveText('1 / 7');
    await expect(page.locator('.members-clear-filters')).toBeVisible();
    await page.locator('.members-clear-filters').click();
    await expect(page.locator('#statusFilter')).toHaveValue('');
    await expect(page.locator('#sortFilter')).toHaveValue('expiry');
    await expect(page.locator('.members-clear-filters')).toBeHidden();
    await expect(page.locator('.members-filter-disclosure')).not.toHaveAttribute('open', '');
    await expect(page.locator('.members-pagination-info')).toContainText('1–5 من 33');
    expect(memberQueries.at(-1)).toMatchObject({ search: '', status: '', sort: 'expiry', page: 1 });

    for (const width of [320, 360, 390, 430]) {
        await page.setViewportSize({ width, height: 800 });
        const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
        expect(dimensions.document, JSON.stringify(dimensions)).toBeLessThanOrEqual(width + 1);
        expect(dimensions.body, JSON.stringify(dimensions)).toBeLessThanOrEqual(width + 1);
        const actionRects = await page.locator('.members-mobile-actions .table-actions > *').evaluateAll((items) => items.map((item) => {
            const { x, y, width: itemWidth, height } = item.getBoundingClientRect();
            return { x, y, right: x + itemWidth, bottom: y + height };
        }));
        for (let index = 0; index < actionRects.length; index += 1) {
            for (let other = index + 1; other < actionRects.length; other += 1) {
                const a = actionRects[index];
                const b = actionRects[other];
                expect(a.right <= b.x || b.right <= a.x || a.bottom <= b.y || b.bottom <= a.y, `actions overlap at ${width}px: ${JSON.stringify(actionRects)}`).toBe(true);
            }
        }
        await page.screenshot({ path: test.info().outputPath(`subscribers-mobile-${width}.png`), fullPage: true });
    }
    await page.setViewportSize({ width: 320, height: 800 });
    await page.locator('#themeToggleButton').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const darkDimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
    expect(darkDimensions.document).toBeLessThanOrEqual(321);
    expect(darkDimensions.body).toBeLessThanOrEqual(321);
    await page.screenshot({ path: test.info().outputPath('subscribers-mobile-320-dark.png'), fullPage: true });
    await page.locator('#themeToggleButton').click();

    for (const width of [768, 1024]) {
        await page.setViewportSize({ width, height: 900 });
        await expect(page.locator('.members-table')).toBeVisible();
        const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
        expect(dimensions.document, JSON.stringify(dimensions)).toBeLessThanOrEqual(width + 1);
        expect(dimensions.body, JSON.stringify(dimensions)).toBeLessThanOrEqual(width + 1);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await expect(page.locator('.members-table')).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('subscribers-desktop.png'), fullPage: true });
    await page.locator('#themeToggleButton').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const darkDesktopDimensions = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
    expect(darkDesktopDimensions.document).toBeLessThanOrEqual(1441);
    expect(darkDesktopDimensions.body).toBeLessThanOrEqual(1441);
    await page.screenshot({ path: test.info().outputPath('subscribers-desktop-dark.png'), fullPage: true });
    await page.locator('.members-pagination-actions [data-members-page-size]').selectOption('20');
    await expect(page.locator('.members-pagination-info')).toContainText('1–20 من 33');
    await page.locator('.members-pagination-actions [data-members-page="2"]').last().click();
    await expect(page.locator('.members-pagination-info')).toContainText('21–33 من 33');
    runtime.total = 1;
    await page.locator('#searchInput').fill('one-page');
    await expect(page.locator('.members-pagination-info')).toContainText('1–1 من 1');
    await expect(page.locator('.members-pagination-actions [data-members-page="0"]').first()).toBeDisabled();
    await expect(page.locator('.members-pagination-actions [data-members-page="2"]').first()).toBeDisabled();
    runtime.total = 0;
    await page.locator('#searchInput').fill('no-results');
    await expect(page.locator('#membersList .empty')).toBeVisible();
    await expect(page.locator('#membersPagination')).toBeHidden();
});
