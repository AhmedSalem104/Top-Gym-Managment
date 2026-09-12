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

test('member form keeps the selected country, valid phone payload and fixed footer', async ({ page }, testInfo) => {
    let submittedBody = null;
    await page.route('**/api/members', async (route) => {
        if (route.request().method() !== 'POST') {
            await route.fallback();
            return;
        }
        submittedBody = JSON.parse(route.request().postData() || '{}');
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            // Keep the browser fixture side-effect free; the production handler
            // may open the member QR dialog when a created member has an id.
            body: JSON.stringify({ member: { fullName: 'QA Member', phone: '+201012345678' } })
        });
    });

    await page.locator('#addMemberButton').click();
    const dialog = page.locator('#memberDialog');
    await expect(dialog).toBeVisible();
    await expect(page.locator('#resetButton')).toBeVisible();
    const initial = await page.evaluate(() => {
        const input = document.getElementById('phone');
        const country = document.querySelector('#phone')?.closest('[data-phone-control]')?.querySelector('select[data-phone-country]');
        return { value: input?.value || '', placeholder: input?.getAttribute('placeholder') || '', country: country?.value || '' };
    });
    expect(initial.value).toBe('');
    expect(initial.country).toMatch(/^[A-Z]{2}$/);
    expect(initial.placeholder).toMatch(/^\d+$/);

    const initialDialogHeight = await dialog.evaluate((element) => element.getBoundingClientRect().height);
    await page.locator('#phone').fill('966501234567');
    await page.locator('#phone').blur();
    const invalidPhoneState = await page.evaluate(() => {
        const input = document.getElementById('phone');
        const error = document.getElementById('phoneValidationError');
        const style = error ? getComputedStyle(error) : null;
        return {
            visible: Boolean(error && !error.hidden && style?.display !== 'none'),
            color: style?.color || '',
            text: error?.textContent || '',
            dialogHeight: document.getElementById('memberDialog')?.getBoundingClientRect().height || 0,
            value: input?.value || ''
        };
    });
    expect(invalidPhoneState.visible).toBe(true);
    expect(invalidPhoneState.text).not.toBe('');
    expect(invalidPhoneState.color).toMatch(/rgb\(/);
    expect(Math.abs(invalidPhoneState.dialogHeight - initialDialogHeight)).toBeLessThanOrEqual(1);
    await page.locator('#phone').fill('01012345678');
    const repairedCountry = await page.evaluate(() => {
        const input = document.getElementById('phone');
        const select = input.closest('[data-phone-control]')?.querySelector('select[data-phone-country]');
        select.value = '';
        return window.LogicFitPhoneInputs.countryCodeForInput(input);
    });
    expect(repairedCountry).toBe(initial.country);

    await page.locator('#fullName').fill('QA Member');
    await page.locator('#phone').fill('01012345678');
    await page.locator('#sendWhatsAppAfterSave').uncheck();
    await page.locator('#saveButton').click();
    await expect(dialog).toBeHidden();
    expect(submittedBody).toMatchObject({ fullName: 'QA Member', phoneCountry: initial.country, createMembership: true });
    expect(submittedBody.phone).toBe('+201012345678');
    await page.evaluate(() => document.getElementById('memberQrDialog')?.close?.());

    await page.locator('#addMemberButton').click();
    await expect(dialog).toBeVisible();
    await page.evaluate(() => {
        const scroll = document.querySelector('#memberDialog .member-dialog-scroll');
        if (scroll) scroll.scrollTop = 0;
    });
    await page.screenshot({ path: `qa/artifacts/member-form-top-${testInfo.project.name}.png`, fullPage: false });
    const geometry = await page.evaluate(() => {
        const popup = document.getElementById('memberDialog');
        const scroll = popup.querySelector('.member-dialog-scroll');
        const footer = popup.querySelector('.form-actions');
        const lastInput = popup.querySelector('#paymentMethod');
        scroll.scrollTop = scroll.scrollHeight;
        const popupRect = popup.getBoundingClientRect();
        const footerRect = footer.getBoundingClientRect();
        const inputRect = lastInput.getBoundingClientRect();
        const formRect = popup.querySelector('.member-dialog-form').getBoundingClientRect();
        const scrollRect = scroll.getBoundingClientRect();
        return {
            width: popupRect.width,
            height: popupRect.height,
            insideViewport: popupRect.left >= 0 && popupRect.top >= 0 && popupRect.right <= innerWidth + 1 && popupRect.bottom <= innerHeight + 1,
            bodyScrolls: scroll.scrollHeight >= scroll.clientHeight,
            footerVisible: footerRect.top >= 0 && footerRect.bottom <= innerHeight + 1,
            lastInputAboveFooter: inputRect.bottom <= footerRect.top + 1,
            form: { top: formRect.top, bottom: formRect.bottom, height: formRect.height },
            scroll: { top: scrollRect.top, bottom: scrollRect.bottom, height: scrollRect.height },
            footer: { top: footerRect.top, bottom: footerRect.bottom, height: footerRect.height },
            pageOverflow: document.documentElement.scrollWidth > innerWidth
        };
    });
    expect(geometry.insideViewport).toBe(true);
    expect(geometry.bodyScrolls).toBe(true);
    expect(geometry.footerVisible).toBe(true);
    expect(geometry.lastInputAboveFooter).toBe(true);
    expect(geometry.pageOverflow).toBe(false);
    await page.screenshot({ path: `qa/artifacts/member-form-${testInfo.project.name}.png`, fullPage: false });
    await page.keyboard.press('Escape');
});

test('member form remains usable in portrait tablet layout', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Portrait tablet is covered by the desktop browser project.');
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.locator('#addMemberButton').click();
    const result = await page.evaluate(() => {
        const dialog = document.getElementById('memberDialog');
        const scroll = dialog?.querySelector('.member-dialog-scroll');
        const footer = dialog?.querySelector('.form-actions');
        const rect = dialog?.getBoundingClientRect();
        const footerRect = footer?.getBoundingClientRect();
        return {
            withinViewport: Boolean(rect && rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1),
            twoColumns: getComputedStyle(dialog?.querySelector('.member-form-grid')).gridTemplateColumns.split(' ').length === 2,
            scrollable: Boolean(scroll && scroll.scrollHeight > scroll.clientHeight),
            footerVisible: Boolean(footerRect && footerRect.bottom <= innerHeight + 1),
            horizontalOverflow: document.documentElement.scrollWidth > innerWidth
        };
    });
    expect(result.withinViewport).toBe(true);
    expect(result.twoColumns).toBe(true);
    expect(result.scrollable).toBe(true);
    expect(result.footerVisible).toBe(true);
    expect(result.horizontalOverflow).toBe(false);
    await page.screenshot({ path: `qa/artifacts/member-form-tablet-portrait-${testInfo.project.name}.png`, fullPage: false });
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

test('member details selects the latest non-cancelled subscription from full history', async ({ page }) => {
    await page.evaluate(async () => {
        const member = { id: 4242, fullName: 'QA Member', phone: '01012345678', registrationDate: '2026-01-01' };
        const details = {
            member,
            memberships: [
                {
                    id: 1,
                    status: 'expired',
                    plan: 'gym_only',
                    type: 'monthly',
                    startDate: '2026-01-01',
                    endDate: '2026-01-31',
                    effectiveEndDate: '2026-01-31',
                    daysRemaining: -200,
                    freezeCount: 0,
                    freezeLimit: 3,
                    amountDue: 300,
                    amountRemaining: 0,
                    amountPaid: 300
                },
                {
                    id: 2,
                    status: 'active',
                    plan: 'gym_cardio',
                    type: 'monthly',
                    startDate: '2026-09-01',
                    endDate: '2026-12-31',
                    effectiveEndDate: '2026-12-31',
                    daysRemaining: 110,
                    freezeCount: 0,
                    freezeLimit: 3,
                    amountDue: 400,
                    amountRemaining: 0,
                    amountPaid: 400
                }
            ]
        };
        await window.topGymEnsureTab?.('member-details');
        const dialog = document.getElementById('detailsDialog');
        if (!dialog.open) dialog.showModal();
        window.dispatchEvent(new CustomEvent('topgym:member-details-opened', { detail: { member, details } }));
    });

    await expect(page.locator('#detailsExpiryBanner')).toBeHidden();
    const overview = await page.locator('#detailsContent').innerText();
    expect(overview).toContain('٣١');
    expect(overview).toContain('جيم وكارديو');
    expect(overview).not.toContain('الاشتراك منتهي');
    await expect(page.locator('[data-member-detail-action="freeze"]')).toBeVisible();
});

test('member details promotes the list membership and orders the history newest first', async ({ page }, testInfo) => {
    const member = {
        id: 4151,
        fullName: 'QA Member 4151',
        phone: '01000000000',
        registrationDate: '2026-08-06',
        membership: {
            id: 4045,
            status: 'active',
            plan: 'gym_only',
            type: 'monthly',
            startDate: '2026-12-07',
            effectiveEndDate: '2027-01-06',
            amountDue: 300,
            amountPaid: 300,
            amountRemaining: 0,
            freezeCount: 0,
            freezeLimit: 3
        }
    };
    const memberships = [
        { id: 3802, status: 'expired', plan: 'gym_only', type: 'monthly', startDate: '2026-08-06', effectiveEndDate: '2026-09-05', amountDue: 300, amountPaid: 300, amountRemaining: 0, freezes: [] },
        { id: 4022, status: 'active', plan: 'gym_only', type: 'monthly', startDate: '2026-09-06', effectiveEndDate: '2026-10-06', amountDue: 300, amountPaid: 300, amountRemaining: 0, freezes: [] },
        { id: 4021, status: 'active', plan: 'gym_only', type: 'monthly', startDate: '2026-09-07', effectiveEndDate: '2026-10-06', amountDue: 300, amountPaid: 300, amountRemaining: 0, freezes: [] },
        { id: 4026, status: 'active', plan: 'gym_only', type: 'monthly', startDate: '2026-10-07', effectiveEndDate: '2026-11-06', amountDue: 300, amountPaid: 300, amountRemaining: 0, freezes: [] },
        { id: 4027, status: 'active', plan: 'gym_only', type: 'monthly', startDate: '2026-11-07', effectiveEndDate: '2026-12-06', amountDue: 300, amountPaid: 300, amountRemaining: 0, freezes: [] },
        { id: 4045, status: 'active', plan: 'gym_only', type: 'monthly', startDate: '2026-12-07', effectiveEndDate: '2027-01-06', amountDue: 300, amountPaid: 300, amountRemaining: 0, freezes: [] }
    ];
    await page.route('**/api/members*', async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname !== '/api/members' || route.request().method() !== 'GET') {
            await route.fallback();
            return;
        }
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ members: [member], pagination: { page: 1, pageSize: 5, totalItems: 1, totalPages: 1 } })
        });
    });
    await page.route('**/api/members/4151/details', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ member, memberships, freezes: [], events: [], payments: [], financialSummary: {} })
        });
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('tr[data-member-id="4151"] button[data-action="details"]').click();
    await expect(page.locator('#detailsDialog')).toBeVisible();
    await expect(page.locator('#currentMembershipTitle')).toHaveText('العضوية الحالية');

    const view = await page.evaluate(() => {
        const table = document.querySelector('#detailsContent .details-section .history-table');
        const rows = [...(table?.tBodies[0]?.rows || [])];
        const ids = rows.map((row) => row.querySelector('td:first-child .table-sub')?.textContent.trim());
        const currentRow = rows.find((row) => row.classList.contains('membership-current-row'));
        const currentCard = document.querySelector('#detailsContent .current-membership-section');
        const dialog = document.getElementById('detailsDialog');
        return {
            ids,
            currentRowId: currentRow?.querySelector('td:first-child .table-sub')?.textContent.trim() || '',
            currentMarker: currentRow?.querySelector('.membership-current-marker')?.textContent.trim() || '',
            currentStatus: currentCard?.querySelector('.badge')?.className || '',
            currentCardOrder: currentCard?.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING,
            horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
            dialogBottom: dialog?.getBoundingClientRect().bottom || 0
        };
    });
    expect(view.ids).toEqual(['4045', '4027', '4026', '4021', '4022', '3802']);
    expect(view.currentRowId).toBe('4045');
    expect(view.currentMarker).toBe('العضوية الحالية');
    expect(view.currentStatus).toContain('active');
    expect(view.currentCardOrder).toBeTruthy();
    expect(view.horizontalOverflow).toBe(false);
    expect(view.dialogBottom).toBeLessThanOrEqual((page.viewportSize()?.height || 0) + 1);
    await page.screenshot({ path: `qa/artifacts/member-details-current-history-${testInfo.project.name}.png`, fullPage: false });
    await page.locator('#detailsContent .current-membership-section').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `qa/artifacts/member-details-current-membership-${testInfo.project.name}.png`, fullPage: false });
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
