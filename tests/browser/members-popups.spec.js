const { test, expect } = require('@playwright/test');

async function installOwnerApi(page) {
    await page.route('**/api/**', async (route) => {
        const pathname = new URL(route.request().url()).pathname;
        let payload = {};
        if (pathname === '/api/auth/session') {
            payload = { authenticated: true, user: { role: 'Owner', tenantType: 'gym', permissions: [] } };
        } else if (pathname === '/api/branding') {
            payload = { identity: { brandName: 'Logic Fit' } };
        } else if (pathname === '/api/members') {
            payload = { members: [], pagination: { page: 1, pageSize: 5, totalItems: 0, totalPages: 0 } };
        } else if (pathname.includes('/pricing')) {
            payload = { plans: {}, types: {}, prices: {} };
        }
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
    });
}

async function openSyntheticDetails(page, subscription = {}) {
    await page.evaluate(async (currentSubscription) => {
        window.topGymAuth = { isOwner: () => true, hasPermission: () => true };
        window.topGymApi = { get: async () => ({ purchases: [] }) };
        await window.topGymEnsureTab?.('member-details');
        const dialog = document.getElementById('detailsDialog');
        if (!dialog.open) dialog.showModal();
        const member = { id: 4242, fullName: 'QA Member', phone: '01012345678', registrationDate: '2026-01-01' };
        const details = {
            member,
            memberships: [{
                status: 'active',
                plan: 'gym_only',
                type: 'monthly',
                effectiveEndDate: '2026-12-31',
                daysRemaining: 100,
                freezeCount: 0,
                freezeLimit: 3,
                amountDue: 300,
                amountRemaining: 50,
                amountPaid: 250,
                ...currentSubscription
            }]
        };
        window.dispatchEvent(new CustomEvent('topgym:member-details-opened', { detail: { member, details } }));
    }, subscription);
}

test.beforeEach(async ({ page }) => {
    await installOwnerApi(page);
    await page.goto('/?members-popup-contract#members', { waitUntil: 'networkidle' });
});

test('member details menu is visible, semantic and viewport-safe', async ({ page }, testInfo) => {
    await openSyntheticDetails(page);
    const menuToggle = page.locator('[data-member-detail-action="more"]');
    await expect(menuToggle).toBeVisible();
    await menuToggle.click();

    const menu = page.locator('#memberDetailsMoreMenu');
    await expect(menu).toBeVisible();
    const result = await page.evaluate(() => {
        const element = document.getElementById('memberDetailsMoreMenu');
        const rect = element.getBoundingClientRect();
        return {
            role: element.getAttribute('role'),
            floating: element.classList.contains('is-floating'),
            placement: element.dataset.placement,
            visibleItems: [...element.querySelectorAll('[role="menuitem"]')]
                .filter((item) => getComputedStyle(item).display !== 'none').length,
            withinViewport: rect.left >= 0 && rect.top >= 0
                && rect.right <= window.innerWidth + 1
                && rect.bottom <= window.innerHeight + 1,
            horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth
        };
    });
    expect(result.role).toBe('menu');
    expect(result.floating).toBe(true);
    expect(['top', 'bottom']).toContain(result.placement);
    expect(result.visibleItems).toBe(4);
    expect(result.withinViewport).toBe(true);
    expect(result.horizontalOverflow).toBe(false);
    await page.screenshot({ path: `qa/artifacts/members-popup-contract-${testInfo.project.name}.png` });

    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(menuToggle).toHaveAttribute('aria-expanded', 'false');
});

test('member action popups keep hidden edit controls, fields and footer inside the viewport', async ({ page }) => {
    await page.evaluate(async () => {
        document.getElementById('memberDialog').showModal();
    });
    await expect(page.locator('#memberDialog')).toBeVisible();
    await expect(page.locator('#cancelEditButton')).toBeHidden();
    const memberDialog = await page.locator('#memberDialog').boundingBox();
    const viewport = page.viewportSize();
    expect(memberDialog.x).toBeGreaterThanOrEqual(0);
    expect(memberDialog.y).toBeGreaterThanOrEqual(0);
    expect(memberDialog.right ?? memberDialog.x + memberDialog.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(memberDialog.y + memberDialog.height).toBeLessThanOrEqual(viewport.height + 1);
    await page.locator('#memberDialog > .dialog-close-button').click();

    await page.evaluate(() => {
        const dialog = document.getElementById('actionDialog');
        document.getElementById('dialogFields').innerHTML = '<div class="field"><label for="qaPaymentInput">قيمة الدفعة</label><input id="qaPaymentInput" type="number" value="100"><small class="field-hint">يظهر هذا النص داخل مساحة الحقل ولا يختفي خلف الأزرار.</small></div>';
        dialog.showModal();
    });
    const payment = await page.evaluate(() => {
        const dialog = document.getElementById('actionDialog');
        const field = document.getElementById('qaPaymentInput').closest('.field');
        const helper = field.querySelector('.field-hint').getBoundingClientRect();
        const footer = dialog.querySelector('.dialog-actions').getBoundingClientRect();
        const body = dialog.querySelector('.dialog-body').getBoundingClientRect();
        return { helperBottom: helper.bottom, footerTop: footer.top, bodyBottom: body.bottom, viewportHeight: innerHeight };
    });
    expect(payment.helperBottom).toBeLessThanOrEqual(payment.footerTop + 1);
    expect(payment.footerTop).toBeLessThanOrEqual(payment.viewportHeight + 1);
    await page.locator('#dialogCancel').click();

    await page.evaluate(() => document.getElementById('coachingBuilderDialog').showModal());
    const builder = await page.locator('#coachingBuilderDialog').boundingBox();
    expect(builder.x).toBeGreaterThanOrEqual(0);
    expect(builder.y).toBeGreaterThanOrEqual(0);
    expect(builder.x + builder.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(builder.y + builder.height).toBeLessThanOrEqual(viewport.height + 1);
    await page.keyboard.press('Escape');
});

test('freeze action is rendered only for an eligible subscription', async ({ page }) => {
    await openSyntheticDetails(page, { status: 'active', freezeCount: 0, freezeLimit: 3 });
    await expect(page.locator('[data-member-detail-action="freeze"]')).toBeVisible();

    await page.evaluate(() => {
        const member = { id: 4242, fullName: 'QA Member', phone: '01012345678', registrationDate: '2026-01-01' };
        const details = { member, memberships: [{ status: 'expired', freezeCount: 0, freezeLimit: 3, plan: 'gym_only', type: 'monthly', effectiveEndDate: '2025-01-01', daysRemaining: -100 }] };
        window.dispatchEvent(new CustomEvent('topgym:member-details-opened', { detail: { member, details } }));
    });
    await expect(page.locator('[data-member-detail-action="freeze"]')).toHaveCount(0);
    await expect(page.locator('[data-member-detail-action="resume"]')).toHaveCount(0);
});

test('members table keeps responsive overflow inside its scroll container', async ({ page }) => {
    await page.locator('#membersSection').waitFor({ state: 'visible' });
    await page.locator('#membersList').evaluate((list) => {
        list.innerHTML = `<div class="table-scroll"><table class="members-table"><thead><tr><th>Member</th><th>Plan</th><th>Status</th><th>End</th><th>Freeze</th><th>Balance</th><th>Actions</th></tr></thead><tbody><tr><td>QA Member</td><td>Gym</td><td>Active</td><td>2030-01-01</td><td>0/3</td><td>0</td><td><div class="table-actions"><button class="btn btn-primary">Renew</button><button class="btn">View</button><button class="btn">Edit</button><button class="btn">More</button></div></td></tr></tbody></table></div>`;
    });
    const metrics = await page.evaluate(() => {
        const wrapper = document.querySelector('#membersList .table-scroll');
        const table = document.querySelector('#membersList .members-table');
        const actions = document.querySelector('#membersList .table-actions');
        return {
            viewport: innerWidth,
            pageOverflow: document.documentElement.scrollWidth > innerWidth,
            tableMinWidth: getComputedStyle(table).minWidth,
            responsiveCards: table.classList.contains('table-card-layout'),
            wrapperScrolls: wrapper.scrollWidth > wrapper.clientWidth,
            actionWrap: getComputedStyle(actions).flexWrap
        };
    });
    expect(metrics.pageOverflow).toBe(false);
    expect(metrics.responsiveCards).toBe(true);
    if (metrics.viewport < 768) {
        expect(metrics.tableMinWidth).toBe('0px');
        expect(metrics.wrapperScrolls).toBe(false);
        expect(metrics.actionWrap).toBe('wrap');
    } else {
        expect(metrics.tableMinWidth).toBe('1120px');
    }
});
