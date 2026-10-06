const { test, expect } = require('@playwright/test');
const featureCatalog = require('../../src/services/feature-catalog');

const member = {
    id: 731,
    fullName: 'أحمد منير الشاذلي',
    phone: '+201014978491',
    phoneCountry: 'EG',
    membershipCode: { maskedCode: 'TG-NV27-********' },
    registrationDate: '2026-09-01',
    membership: {
        plan: 'gym',
        type: 'monthly',
        status: 'active',
        id: 50,
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

async function installSubscribersRuntime(page, authUser = { id: 901, name: 'Subscribers QA', role: 'Owner', tenantType: 'gym', permissions: [] }) {
    const runtime = {
        total: 165,
        member,
        desktopMembers: [
            member,
            { ...member, id: 732, fullName: 'حسن مصطفى', phone: '+201022835164', membership: { ...member.membership, status: 'expiring_soon', effectiveEndDate: '2026-10-15', daysRemaining: 10, amountDue: 400, amountPaid: 300, amountRemaining: 100 } },
            { ...member, id: 733, fullName: 'عبدالله محمد سالم', phone: '+201127463958', membership: { ...member.membership, status: 'expired', effectiveEndDate: '2026-08-20', daysRemaining: -47, amountDue: 180, amountPaid: 180, amountRemaining: 0 } },
            { ...member, id: 734, fullName: 'إسلام أحمد عبدالمقصود', phone: '+201029065288', membership: { ...member.membership, status: 'frozen', effectiveEndDate: '2026-11-25', daysRemaining: 50, freezeCount: 0, amountDue: 350, amountPaid: 350, amountRemaining: 0 } }
        ]
    };
    const memberQueries = [];
    await page.route('**/api/**', async (route) => {
        const pathname = new URL(route.request().url()).pathname;
        const payloads = {
            '/api/auth/session': { authenticated: true, user: authUser },
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
            '/api/dashboard': { stats: { total: 165, active: 120, expiringSoon: 18, expired: 12 }, alerts: [] },
            '/api/pricing': {
                plans: { gym_only: { label: 'جيم فقط', monthlyPrice: 350, active: true }, gym_cardio: { label: 'جيم وكارديو', monthlyPrice: 450, active: true } },
                types: { monthly: { label: 'شهرية', mode: 'months', durationValue: 1, priceMultiplier: 1, active: true } },
                durations: { monthly: 1 }
            }
        };
        if (pathname === '/api/members') {
            const url = new URL(route.request().url());
            const currentPage = Number(url.searchParams.get('page') || 1);
            const pageSize = Number(url.searchParams.get('pageSize') || 5);
            const totalPages = runtime.total ? Math.ceil(runtime.total / pageSize) : 0;
            memberQueries.push({ search: url.searchParams.get('search'), status: url.searchParams.get('status'), sort: url.searchParams.get('sort'), page: currentPage, pageSize });
            const sampleMembers = page.viewportSize().width <= 767 ? [runtime.member] : runtime.desktopMembers.slice(0, Math.min(4, pageSize));
            return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ members: runtime.total ? sampleMembers : [], pagination: { total: runtime.total, page: currentPage, pageSize, totalPages, hasPrevious: currentPage > 1, hasNext: currentPage < totalPages } }) });
        }
        if (pathname === '/api/members/731/details') {
            return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
                member: runtime.member,
                memberships: [{ id: 50, plan: 'gym', type: 'monthly', status: 'active', startDate: '2026-09-28', effectiveEndDate: '2026-10-28', amountDue: 350, amountPaid: 200, amountRemaining: 150, freezes: [{ id: 1 }] }],
                freezes: [{ startDate: '2026-09-15', endDate: '2026-09-18', days: 3, reason: 'طلب العضو' }],
                events: [],
                payments: [],
                financialSummary: { totalDue: 350, totalPaid: 200, totalRemaining: 150, paidTransactionCount: 1 }
            }) });
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
    await expect(page.locator('.members-table tbody > tr')).toHaveCount(4);
    await expect(page.locator('.members-summary-item')).toHaveCount(4);
    await expect(page.locator('#membersCount')).toContainText('مشترك');
    await expect(page.locator('#membersSection .members-toolbar-copy')).toBeHidden();
    const desktopPanelStyle = await page.locator('#membersSection').evaluate((element) => {
        const style = getComputedStyle(element);
        return { borderWidth: style.borderTopWidth, padding: style.padding, background: style.backgroundColor };
    });
    expect(desktopPanelStyle.borderWidth).toBe('0px');
    expect(desktopPanelStyle.padding).toBe('0px');
    const desktopActionIconSizes = await page.locator('.members-table .actions-cell .table-actions > .table-action-visible .action-icon, .members-table .actions-cell .table-actions > .action-menu .action-menu-toggle .action-menu-icon').evaluateAll((icons) => icons.map((icon) => ({ width: getComputedStyle(icon).width, height: getComputedStyle(icon).height })));
    expect(desktopActionIconSizes.length).toBeGreaterThan(1);
    expect(new Set(desktopActionIconSizes.map(({ width, height }) => `${width}x${height}`)).size).toBe(1);
    const desktopActionOrder = await page.locator('.members-table .table-actions > [data-action]').evaluateAll((buttons) => buttons.map((button) => button.dataset.action));
    expect(desktopActionOrder.slice(0, 2)).toEqual(['renew', 'details']);

    await page.setViewportSize({ width: 320, height: 800 });
    await expect(page.locator('.members-mobile-card')).toHaveCount(4);
    const addButton = page.locator('#addMemberButton');
    await expect(addButton).toBeVisible();
    await expect(addButton).toContainText('إضافة مشترك');
    await addButton.hover();
    await expect(addButton).toBeVisible();
    const addButtonAfterHover = await addButton.boundingBox();
    expect(await addButton.evaluate((button) => getComputedStyle(button).transform)).toBe('none');
    expect(addButtonAfterHover.width).toBeGreaterThan(120);
    expect(addButtonAfterHover.height).toBe(52);
    await page.evaluate(() => window.scrollTo(0, 420));
    await expect(addButton).toBeVisible();
    const addButtonAfterScroll = await addButton.boundingBox();
    expect(Math.abs(addButtonAfterScroll.x - addButtonAfterHover.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(addButtonAfterScroll.y - addButtonAfterHover.y)).toBeLessThanOrEqual(1);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.locator('.members-mobile-card').first().locator('.members-mobile-details > div')).toHaveCount(3);
    await expect(page.locator('.members-mobile-card').first().locator('.members-mobile-balance')).toContainText('١٥٠');
    await expect(page.locator('.members-mobile-results-count')).toContainText('مشترك');
    await expect(page.locator('.members-table')).toHaveCount(0);
    await expect(page.locator('#membersSummary')).toBeHidden();
    await expect(page.locator('.members-mobile-name').first()).toContainText('أحمد منير الشاذلي');
    await page.locator('#mobileNavToggle').click();
    await expect(page.locator('.app-shell')).toHaveClass(/mobile-nav-open/);
    await expect(page.locator('#mobileNavClose')).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('subscribers-mobile-navigation-drawer.png'), fullPage: true });
    await page.locator('#mobileNavClose').click();
    await expect(page.locator('.app-shell')).not.toHaveClass(/mobile-nav-open/);
    const mobileActionIconSizes = await page.locator('.members-mobile-actions .table-action-visible .action-icon, .members-mobile-actions .action-menu-toggle .action-menu-icon').evaluateAll((icons) => icons.map((icon) => ({ width: getComputedStyle(icon).width, height: getComputedStyle(icon).height })));
    expect(mobileActionIconSizes.length).toBeGreaterThan(1);
    expect(new Set(mobileActionIconSizes.map(({ width, height }) => `${width}x${height}`)).size).toBe(1);
    const captureMobileActionGeometry = () => page.locator('.members-mobile-actions .table-actions > .table-action-visible, .members-mobile-actions .table-actions > .action-menu > .action-menu-toggle').evaluateAll((items) => items.map((item) => {
        const rect = item.getBoundingClientRect();
        const style = getComputedStyle(item);
        return { width: Math.round(rect.width), height: Math.round(rect.height), radius: style.borderRadius };
    }));
    const captureAddGeometry = () => addButton.evaluate((button) => {
        const rect = button.getBoundingClientRect();
        const style = getComputedStyle(button);
        return { width: Math.round(rect.width), height: Math.round(rect.height), radius: style.borderRadius };
    });
    const lightMobileActionGeometry = await captureMobileActionGeometry();
    const lightAddButtonGeometry = await captureAddGeometry();
    await page.evaluate(() => window.TopGymTheme.toggle());
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await captureMobileActionGeometry()).toEqual(lightMobileActionGeometry);
    expect(await captureAddGeometry()).toEqual(lightAddButtonGeometry);
    await page.screenshot({ path: test.info().outputPath('subscribers-mobile-320-populated-dark.png'), fullPage: true });
    await page.evaluate(() => window.TopGymTheme.toggle());
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    runtime.member = { ...member, fullName: 'اسم عربي طويل جدًا لاختبار التفاف النص دون كسر تخطيط بطاقة المشترك على الهاتف', phone: '' };
    await page.locator('#searchInput').fill('missing-phone');
    await expect(page.locator('.members-mobile-card')).toHaveCount(1);
    await expect(page.locator('.members-mobile-name')).toContainText('اسم عربي طويل جدًا');
    await expect(page.locator('.members-mobile-card-head .table-member-phone.is-missing')).toBeVisible();
    await expect(page.locator('.members-mobile-card-head a.table-member-phone')).toHaveCount(0);
    runtime.member = member;
    await page.locator('#searchInput').fill('');
    await expect(page.locator('.members-mobile-name')).toContainText('أحمد منير الشاذلي');
    await expect(page.locator('.members-mobile-actions [data-action="details"]')).toBeVisible();
    await expect(page.locator('.members-mobile-actions [data-action="renew"]')).toBeVisible();
    await expect(page.locator('.members-mobile-actions [data-action="details"] .table-action-label')).toHaveText('عرض');
    await expect(page.locator('.members-mobile-actions [data-action="renew"] .table-action-label')).toHaveText('تجديد');
    await expect(page.locator('.members-mobile-actions [data-action="qr"]')).toHaveCount(1);
    await expect(page.locator('.members-mobile-actions [data-action="refund"]')).toHaveCount(1);
    await page.locator('.members-mobile-actions [data-action="details"]').click();
    await expect(page.locator('#detailsDialog')).toBeVisible();
    expect(await page.locator('#detailsDialog .member-details-head').evaluate((head) => getComputedStyle(head, '::before').content)).toContain('تفاصيل المشترك');
    await expect(page.locator('#detailsDialog #detailsMemberBadge')).toHaveText('نشط');
    await expect(page.locator('#detailsDialog .member-profile-code')).toHaveText('TG-NV27-********');
    await expect(page.locator('#detailsDialog [data-member-details-tabs] [role="tab"]')).toHaveText(['نظرة عامة', 'الاشتراكات', 'الحضور', 'الحساب']);
    await expect(page.locator('#detailsDialog [data-member-details-tab="overview"]')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#detailsDialog [data-member-details-footer]')).toBeVisible();
    await expect(page.locator('#detailsDialog [data-member-details-panel="overview"] .member-details-overview-financial')).toContainText('إجمالي المدفوع');
    await expect(page.locator('#detailsDialog [data-member-details-panel="overview"] .member-details-overview-financial')).toContainText('إجمالي المتبقي');
    await expect(page.locator('#detailsDialog [data-member-details-footer] [data-member-detail-action="renew"]')).toBeVisible();
    await expect(page.locator('#detailsDialog [data-member-details-footer] [data-member-detail-action="view"]')).toBeVisible();
    await page.locator('#detailsDialog [data-member-details-tab="subscriptions"]').click();
    await expect(page.locator('#detailsDialog [data-member-details-panel="subscriptions"]')).toBeVisible();
    await expect(page.locator('#detailsDialog [data-member-details-panel="overview"]')).toBeHidden();
    await expect(page.locator('#detailsDialog [data-member-details-panel="subscriptions"]')).toContainText('سجل الاشتراكات والتجديدات');
    await page.locator('#detailsDialog [data-member-details-tab="attendance"]').click();
    await expect(page.locator('#detailsDialog [data-member-details-panel="attendance"]')).toContainText('لا يوجد حضور مسجل اليوم');
    await page.locator('#detailsDialog [data-member-details-tab="account"]').click();
    await expect(page.locator('#detailsDialog [data-member-details-panel="account"]')).toContainText('السجل المالي والإيصالات');
    await page.locator('#detailsDialog [data-member-details-tab="overview"]').click();
    const detailHeaderAlignment = await page.locator('#detailsDialog').evaluate((dialog) => {
        const headElement = dialog.querySelector('.member-details-head');
        const head = headElement.getBoundingClientRect();
        const style = getComputedStyle(headElement);
        const close = dialog.querySelector('#detailsClose').getBoundingClientRect();
        return { contentTop: head.top + parseFloat(style.paddingTop), closeTop: close.top, closeLeft: close.left, headLeft: head.left };
    });
    expect(Math.abs(detailHeaderAlignment.closeTop - detailHeaderAlignment.contentTop)).toBeLessThanOrEqual(3);
    expect(detailHeaderAlignment.closeLeft).toBeGreaterThanOrEqual(detailHeaderAlignment.headLeft - 1);
    const statsColumns = await page.locator('#detailsDialog .member-details-stats').evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length);
    expect(statsColumns).toBe(1);
    await expect(page.locator('#detailsContent .current-membership-facts')).toContainText('المستحق');
    await expect(page.locator('#detailsContent .payment-history-section')).toContainText('متبقي');
    await expect(page.locator('#detailsContent')).toContainText('سجل التجميد');
    await page.screenshot({ path: test.info().outputPath('subscribers-member-details-mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('#detailsDialog [data-member-details-tabs]')).toBeVisible();
    await expect(page.locator('#detailsDialog [data-member-details-footer]')).toBeVisible();
    await expect(page.locator('#detailsDialog [data-member-training-panel]')).toBeAttached();
    const phoneStatsColumns = await page.locator('#detailsDialog .member-details-stats').evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length);
    expect(phoneStatsColumns).toBe(1);
    const financialColumns = await page.locator('#detailsDialog .member-details-overview-financial-grid').evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length);
    expect(financialColumns).toBe(3);
    const detailViewportWidth = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
    expect(detailViewportWidth.document).toBeLessThanOrEqual(detailViewportWidth.viewport + 1);
    const detailsFooterBounds = await page.locator('#detailsDialog [data-member-details-footer]').evaluate((footer) => {
        const rect = footer.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom, viewportHeight: innerHeight };
    });
    expect(detailsFooterBounds.bottom).toBeLessThanOrEqual(detailsFooterBounds.viewportHeight + 1);
    expect(detailsFooterBounds.top).toBeGreaterThan(0);
    await page.screenshot({ path: test.info().outputPath('subscribers-member-details-390.png'), fullPage: true });
    await page.evaluate(() => window.TopGymTheme.toggle());
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('body')).toHaveAttribute('data-theme', 'dark');
    const darkDetailsColors = await page.locator('#detailsDialog').evaluate((dialog) => ({
        dialog: getComputedStyle(dialog).backgroundColor,
        membership: getComputedStyle(dialog.querySelector('.current-membership-section')).backgroundColor,
        text: getComputedStyle(dialog.querySelector('.current-membership-head h4')).color
    }));
    expect(darkDetailsColors.dialog).toBe('rgb(7, 13, 22)');
    expect(darkDetailsColors.membership).toBe('rgb(17, 28, 43)');
    expect(darkDetailsColors.text).toBe('rgb(248, 250, 252)');
    await page.screenshot({ path: test.info().outputPath('subscribers-member-details-390-dark.png'), fullPage: true });
    await page.evaluate(() => window.TopGymTheme.toggle());
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.locator('body')).toHaveAttribute('data-theme', 'light');
    await page.setViewportSize({ width: 320, height: 800 });
    await expect(page.locator('#detailsClose')).toBeVisible();
    await page.locator('#detailsClose').click();
    await expect(page.locator('.members-mobile-actions .action-menu-panel [data-member-coaching-action="workout"]')).toBeHidden();
    await page.locator('.members-mobile-actions [data-menu-toggle]').click();
    await expect(page.locator('.members-mobile-actions .action-menu-panel [data-action="payment"]')).toBeVisible();
    await expect(page.locator('.members-mobile-actions .action-menu-panel [data-action="delete"]')).toBeVisible();
    await expect(page.locator('.members-mobile-actions .action-menu-panel [data-action="qr"]')).toBeVisible();
    await expect(page.locator('.members-mobile-actions .action-menu-panel [data-action="refund"]')).toBeVisible();
    await expect(page.locator('.members-mobile-actions .action-menu-panel [data-attendance-action="checkin"]')).toBeVisible();
    await expect(page.locator('.members-mobile-actions .action-menu-panel [data-member-coaching-action="workout"]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.members-mobile-actions .action-menu-panel')).toBeHidden();
    await page.locator('.members-filter-disclosure > summary').click();
    const filterDialogBounds = await page.locator('#membersFiltersDialog').evaluate((dialog) => {
        const rect = dialog.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, viewportWidth: innerWidth, viewportHeight: innerHeight };
    });
    expect(filterDialogBounds.left).toBeGreaterThanOrEqual(0);
    expect(filterDialogBounds.right).toBeLessThanOrEqual(filterDialogBounds.viewportWidth + 1);
    expect(filterDialogBounds.top).toBeGreaterThanOrEqual(0);
    expect(filterDialogBounds.bottom).toBeLessThanOrEqual(filterDialogBounds.viewportHeight + 1);
    expect(filterDialogBounds.left).toBeLessThanOrEqual(1);
    expect(filterDialogBounds.top).toBeLessThanOrEqual(1);
    await page.screenshot({ path: test.info().outputPath('subscribers-filters-mobile.png'), fullPage: true });
    await expect(page.locator('#statusFilter')).toBeVisible();
    await page.locator('#statusFilter').selectOption('active');
    await expect(page.locator('.members-filter-disclosure')).toHaveClass(/has-active-filters/);
    await page.locator('#membersFiltersApply').click();
    await expect(page.locator('.members-mobile-pagination > span')).toHaveText('1 / 33');
    await page.locator('.members-mobile-pagination [aria-label="التالي"]').click();
    await expect(page.locator('.members-mobile-pagination > span')).toHaveText('2 / 33');
    await page.locator('.members-mobile-pagination [aria-label="السابق"]').click();
    await expect(page.locator('.members-mobile-pagination > span')).toHaveText('1 / 33');
    await page.locator('.members-filter-disclosure > summary').click();
    await expect(page.locator('#membersFiltersClear')).toBeVisible();
    await page.locator('#membersFiltersClear').click();
    await expect(page.locator('#statusFilter')).toHaveValue('');
    await expect(page.locator('#sortFilter')).toHaveValue('expiry');
    await expect(page.locator('.members-clear-filters')).toBeHidden();
    await expect(page.locator('.members-filter-disclosure')).not.toHaveAttribute('open', '');
    await expect(page.locator('.members-pagination-info')).toContainText('1–5 من 165');
    expect(memberQueries.at(-1)).toMatchObject({ search: '', status: '', sort: 'expiry', page: 1 });

    for (const width of [320, 360, 390, 430]) {
        await page.setViewportSize({ width, height: 800 });
        const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
        expect(dimensions.document, JSON.stringify(dimensions)).toBeLessThanOrEqual(width + 1);
        expect(dimensions.body, JSON.stringify(dimensions)).toBeLessThanOrEqual(width + 1);
        const actionRects = await page.locator('.members-mobile-actions .table-actions > *').evaluateAll((items) => items.map((item) => {
            const { x, y, width: itemWidth, height } = item.getBoundingClientRect();
            return { x, y, right: x + itemWidth, bottom: y + height, scrollWidth: item.scrollWidth, clientWidth: item.clientWidth };
        }));
        for (const action of actionRects) expect(action.scrollWidth).toBeLessThanOrEqual(action.clientWidth + 1);
        const addButtonRect = await page.locator('#addMemberButton').evaluate((button) => {
            const { x, y, width: itemWidth, height } = button.getBoundingClientRect();
            return { x, y, right: x + itemWidth, bottom: y + height };
        });
        const paginationRect = await page.locator('.members-mobile-pagination').evaluate((pagination) => {
            const { x, y, width: itemWidth, height } = pagination.getBoundingClientRect();
            return { x, y, right: x + itemWidth, bottom: y + height };
        });
        expect(addButtonRect.right <= paginationRect.x || paginationRect.right <= addButtonRect.x || addButtonRect.bottom <= paginationRect.y || paginationRect.bottom <= addButtonRect.y, 'FAB overlaps pagination at ' + width + 'px: ' + JSON.stringify({ fab: addButtonRect, pagination: paginationRect })).toBe(true);
        for (let index = 0; index < actionRects.length; index += 1) {
            const action = actionRects[index];
            expect(addButtonRect.right <= action.x || action.right <= addButtonRect.x || addButtonRect.bottom <= action.y || action.bottom <= addButtonRect.y, 'FAB overlap at ' + width + 'px: ' + JSON.stringify({ fab: addButtonRect, action })).toBe(true);
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
        await page.locator('#searchInput').fill('desktop-layout');
        await expect(page.locator('.members-table tbody > tr')).toHaveCount(4);
        await page.locator('#searchInput').fill('');
        await expect(page.locator('.members-table tbody > tr')).toHaveCount(4);
        await expect(page.locator('.members-table')).toBeVisible();
        const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
        expect(dimensions.document, JSON.stringify(dimensions)).toBeLessThanOrEqual(width + 1);
        expect(dimensions.body, JSON.stringify(dimensions)).toBeLessThanOrEqual(width + 1);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator('#searchInput').fill('desktop-layout');
    await expect(page.locator('.members-table tbody > tr')).toHaveCount(4);
    await page.locator('#searchInput').fill('');
    await expect(page.locator('.members-table tbody > tr')).toHaveCount(4);
    await expect(page.locator('.members-table')).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('subscribers-desktop.png'), fullPage: true });
    await page.locator('#themeToggleButton').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const darkDesktopDimensions = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
    expect(darkDesktopDimensions.document).toBeLessThanOrEqual(1441);
    expect(darkDesktopDimensions.body).toBeLessThanOrEqual(1441);
    await page.screenshot({ path: test.info().outputPath('subscribers-desktop-dark.png'), fullPage: true });
    await expect(page.locator('.members-pagination-actions [data-members-page-size]')).toBeVisible();
    await page.locator('.members-pagination-actions [data-members-page-size]').selectOption('20');
    await expect(page.locator('.members-pagination-info')).toContainText('1–20 من 165');
    await page.locator('.members-pagination-actions [data-members-page="2"]').last().click();
    await expect(page.locator('.members-pagination-info')).toContainText('21–40 من 165');
    runtime.total = 1;
    await page.locator('#searchInput').fill('one-page');
    await expect(page.locator('.members-pagination-info')).toContainText('1–1 من 1');
    await expect(page.locator('.members-pagination-actions [data-members-page="0"]').first()).toBeDisabled();
    await expect(page.locator('.members-pagination-actions [data-members-page="2"]').first()).toBeDisabled();
    runtime.total = 0;
    await page.setViewportSize({ width: 390, height: 800 });
    await page.locator('#searchInput').fill('no-results');
    await expect(page.locator('#membersList .members-empty-state')).toBeVisible();
    await expect(page.locator('#membersList [data-members-clear-filters]')).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('subscribers-empty-mobile.png'), fullPage: true });
    await expect(page.locator('#membersPagination')).toBeHidden();
});

test('mobile add-member floating action respects permission-driven hidden state', async ({ page }) => {
    await installSubscribersRuntime(page, {
        id: 902,
        name: 'Subscribers Assistant QA',
        role: 'Assistant',
        tenantType: 'gym',
        permissions: ['members.read', 'memberships.read']
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/index.html#members', { waitUntil: 'networkidle' });
    await expect(page.locator('#membersSection')).toBeVisible();
    await expect(page.locator('#addMemberButton')).toBeHidden();
});
