const { test, expect } = require('@playwright/test');

const QA_ENTITLEMENTS = {
    tenantType: 'gym',
    features: {
        dashboard: true, members: true, attendance: true, pricing: true,
        payments: true, reports: true, portal: true, notifications: true,
        coaching: true, nutrition: true, library: true, branding: true, team: true
    },
    featureCatalog: [
        'dashboard', 'members', 'attendance', 'pricing', 'payments', 'reports',
        'portal', 'notifications', 'coaching', 'nutrition', 'library', 'branding', 'team'
    ].map((key) => ({ key, tenantTypes: ['gym'] }))
};

async function installOwnerApi(page) {
    await page.route('**/api/**', async (route) => {
        const pathname = new URL(route.request().url()).pathname;
        let payload = {};
        if (pathname === '/api/auth/session') {
            payload = { authenticated: true, user: { role: 'Owner', tenantType: 'gym', permissions: [] } };
        } else if (pathname === '/api/saas/entitlements') {
            payload = {
                tenantStatus: 'active',
                subscription: { status: 'active', plan: { code: 'qa', name: 'QA Plan' } },
                entitlements: QA_ENTITLEMENTS,
                recovery: false
            };
        } else if (pathname === '/api/branding') {
            payload = { identity: { brandName: 'Logic Fit' } };
        } else if (pathname === '/api/members') {
            payload = { members: [], pagination: { page: 1, pageSize: 5, totalItems: 0, totalPages: 0 } };
        } else if (pathname === '/api/phone/countries') {
            // Keep the popup contract fixture deterministic while exercising
            // the same catalog-driven Phone Control used by production.
            payload = {
                fallbackCountry: 'EG',
                countries: [{
                    isoCode: 'EG',
                    country: '\u0645\u0635\u0631',
                    dialCode: '+20',
                    exampleNational: '01015819700',
                    exampleInternational: '+201015819700',
                    validLengths: [8, 9, 10],
                    mobileRules: { validLengths: [10], localPrefix: '0', nationalPattern: '1[0-25]\\d{8}' }
                }]
            };
        } else if (pathname.includes('/pricing')) {
            payload = { plans: {}, types: {}, prices: {} };
        }
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
    });
}

async function openSyntheticDetails(page, subscription = {}) {
    await page.evaluate(async (currentSubscription) => {
        window.topGymAuth = { isOwner: () => true, hasPermission: () => true };
        window.topGymApi = {
            get: async () => ({ purchases: [] }),
            request: async (url, options = {}) => {
                const response = await fetch(url, options);
                const data = await response.json().catch(() => ({}));
                if (!response.ok) throw Object.assign(new Error(data.error || 'Request failed'), data);
                return data;
            }
        };
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
        return {
            role: element.getAttribute('role'),
            floating: element.classList.contains('is-floating'),
            placement: element.dataset.placement,
            visibleItems: [...element.querySelectorAll('[role="menuitem"]')]
                .filter((item) => getComputedStyle(item).display !== 'none').length
        };
    });
    expect(result.role).toBe('menu');
    expect(result.floating).toBe(true);
    expect(['top', 'bottom']).toContain(result.placement);
    expect(result.visibleItems).toBe(4);
    await page.screenshot({ path: `qa/artifacts/members-popup-contract-${testInfo.project.name}.png` });

    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(menuToggle).toHaveAttribute('aria-expanded', 'false');
});

test('member action popups preserve hidden edit controls and close actions', async ({ page }) => {
    await page.evaluate(async () => {
        document.getElementById('memberDialog').showModal();
    });
    await expect(page.locator('#memberDialog')).toBeVisible();
    await expect(page.locator('#cancelEditButton')).toBeHidden();
    await page.locator('#memberDialog > .dialog-close-button').click();

    await page.evaluate(() => {
        const dialog = document.getElementById('actionDialog');
        document.getElementById('dialogFields').innerHTML = '<div class="field"><label for="qaPaymentInput">قيمة الدفعة</label><input id="qaPaymentInput" type="number" value="100"><small class="field-hint">يظهر هذا النص داخل مساحة الحقل ولا يختفي خلف الأزرار.</small></div>';
        dialog.showModal();
    });
    await expect(page.locator('#qaPaymentInput')).toBeVisible();
    await page.locator('#dialogCancel').click();

    await page.evaluate(async () => {
        await window.topGymDialogLoader.load('/dialogs/coaching.html?v=e2e', ['externalTraineeDialog', 'coachingBuilderDialog', 'coachingProfileDialog']);
        document.getElementById('coachingBuilderDialog').showModal();
    });
    await expect(page.locator('#coachingBuilderDialog')).toBeVisible();
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
        return { value: input?.value || '', placeholder: input?.getAttribute('placeholder') || '', country: window.LogicFitPhoneInputs?.countryCodeForInput(input) || '' };
    });
    expect(initial.value).toBe('');
    expect(initial.country).toBe('EG');
    await expect(page.locator('#phone').locator('xpath=ancestor::*[@data-phone-control][1]').locator('.phone-country-control')).toBeHidden();
    expect(initial.placeholder).toBe('مثال: 01015819700');

    await page.locator('#phone').fill('966501234567');
    await page.locator('#phone').blur();
    const invalidPhoneState = await page.evaluate(() => {
        const input = document.getElementById('phone');
        const error = document.getElementById('phoneValidationError');
        return {
            visible: Boolean(error && !error.hidden),
            text: error?.textContent || '',
            value: input?.value || ''
        };
    });
    expect(invalidPhoneState.visible).toBe(true);
    expect(invalidPhoneState.text).not.toBe('');
    await page.locator('#phone').fill('01012345678');
    const repairedCountry = await page.evaluate(() => {
        const input = document.getElementById('phone');
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
    await expect(dialog).toBeVisible();
    await page.screenshot({ path: `qa/artifacts/member-form-${testInfo.project.name}.png`, fullPage: false });
    await page.keyboard.press('Escape');
});

test('coaching builders use the shared workspace layout at desktop and mobile widths', async ({ page }, testInfo) => {
    await page.route('**/api/clients/4242/training-overview', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ workoutPrograms: [], dietPlans: [], measurements: [], progress: { completedSessions: 0 }, mealLogs: [] })
        });
    });
    await openSyntheticDetails(page);
    await expect(page.locator('#detailsDialog')).toBeVisible();
    await expect(page.locator('.member-training-panel')).toBeVisible();
    await expect(page.locator('.member-training-head')).toBeVisible();
    const coachingActions = page.locator('[data-member-coaching-action]');
    await expect(coachingActions.first()).toBeVisible();
    const actionNames = await coachingActions.evaluateAll((buttons) => buttons.map((button) => button.dataset.memberCoachingAction));
    expect(actionNames).toContain('new-workout');
    expect(actionNames).toContain('new-diet');

    await page.locator('[data-member-coaching-action="new-workout"]').first().click();
    await expect(page.locator('#coachingBuilderDialog')).toBeVisible();
    expect(await page.locator('#coachingBuilderDialog').count()).toBe(1);
    expect(await page.locator('#coachingBuilderStepper').count()).toBe(1);
    await expect(page.locator('#coachingBuilderStepper .builder-step')).toHaveCount(3);
    await expect(page.locator('#coachingBuilderProgress')).toBeHidden();
    await page.screenshot({ path: testInfo.outputPath('training-builder-desktop.png'), fullPage: false });
    await page.locator('#coachingBuilderCancel').click();

    await page.locator('[data-member-coaching-action="new-diet"]').first().click();
    await expect(page.locator('#coachingBuilderDialog')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('nutrition-builder-desktop.png'), fullPage: false });
    await page.locator('#coachingBuilderCancel').click();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('[data-member-coaching-action="new-workout"]').first().click();
    await expect(page.locator('#coachingBuilderDialog')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('training-builder-mobile390.png'), fullPage: false });
    await page.locator('#coachingBuilderCancel').click();

    await page.locator('[data-member-coaching-action="new-diet"]').first().click();
    await expect(page.locator('#coachingBuilderDialog')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('nutrition-builder-mobile390.png'), fullPage: false });
    const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
    expect(dimensions.document, JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.viewport + 1);
    expect(dimensions.body, JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.viewport + 1);
});

test('member form remains mounted in portrait tablet layout', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Portrait tablet is covered by the desktop browser project.');
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.locator('#addMemberButton').click();
    await expect(page.locator('#memberDialog')).toBeVisible();
    await expect(page.locator('#fullName')).toBeVisible();
    await expect(page.locator('#phone')).toBeVisible();
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
            freezeLimit: 3,
            daysRemaining: 100
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
            body: JSON.stringify({ member, currentMembership: member.membership, memberships, freezes: [], events: [], payments: [], financialSummary: {} })
        });
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('tr[data-member-id="4151"] button[data-action="details"]').click();
    await expect(page.locator('#detailsDialog')).toBeVisible();
    await expect(page.locator('#currentMembershipTitle')).toHaveText('العضوية الحالية');
    await expect(page.locator('#detailsExpiryBanner')).toBeHidden();

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
            currentCardOrder: currentCard?.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING
        };
    });
    expect(view.ids).toEqual(['4045', '4027', '4026', '4021', '4022', '3802']);
    expect(view.currentRowId).toBe('4045');
    expect(view.currentMarker).toBe('العضوية الحالية');
    expect(view.currentStatus).toContain('active');
    expect(view.currentCardOrder).toBeTruthy();
    await page.screenshot({ path: `qa/artifacts/member-details-current-history-${testInfo.project.name}.png`, fullPage: false });
    await page.locator('#detailsContent .current-membership-section').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `qa/artifacts/member-details-current-membership-${testInfo.project.name}.png`, fullPage: false });
});

test('members table preserves its functional data and action hooks after reset', async ({ page }) => {
    await page.locator('#membersSection').waitFor({ state: 'visible' });
    await page.locator('#membersList').evaluate((list) => {
        list.innerHTML = `<div class="table-scroll"><table class="members-table"><thead><tr><th>Member</th><th>Plan</th><th>Status</th><th>End</th><th>Freeze</th><th>Balance</th><th>Actions</th></tr></thead><tbody><tr><td>QA Member</td><td>Gym</td><td>Active</td><td>2030-01-01</td><td>0/3</td><td>0</td><td><div class="table-actions"><button class="btn btn-primary">Renew</button><button class="btn">View</button><button class="btn">Edit</button><button class="btn">More</button></div></td></tr></tbody></table></div>`;
    });
    const metrics = await page.evaluate(() => {
        const wrapper = document.querySelector('#membersList .table-scroll');
        const table = document.querySelector('#membersList .members-table');
        const actions = document.querySelector('#membersList .table-actions');
        return {
            responsiveCards: table.classList.contains('table-card-layout'),
            wrapperExists: Boolean(wrapper),
            actionCount: actions.querySelectorAll('button').length
        };
    });
    expect(metrics.wrapperExists).toBe(true);
    expect(metrics.actionCount).toBe(4);
});

test('members table pagination renders from the API contract', async ({ page }) => {
    const requestedPages = [];
    await page.route('**/api/members*', async (route) => {
        if (route.request().method() !== 'GET') {
            await route.fallback();
            return;
        }
        const url = new URL(route.request().url());
        const currentPage = Number(url.searchParams.get('page') || 1);
        requestedPages.push(currentPage);
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                members: [],
                pagination: {
                    page: currentPage,
                    pageSize: 5,
                    total: 11,
                    totalPages: 3,
                    hasNext: currentPage < 3,
                    hasPrevious: currentPage > 1
                }
            })
        });
    });

    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator('#membersPagination')).toBeVisible();
    await expect.poll(() => requestedPages.length).toBeGreaterThan(0);

    const tableContract = await page.evaluate(() => {
        document.getElementById('membersList').insertAdjacentHTML('beforeend', `
            <div class="table-scroll"><table class="members-table"><thead><tr><th>العضو</th><th>الإجراءات</th></tr></thead><tbody><tr><td>QA</td><td>—</td></tr></tbody></table></div>
        `);
        const table = document.querySelector('#membersList .members-table');
        return {
            tableExists: Boolean(table),
            sharedState: Boolean(window.topGymMembersState)
        };
    });

    expect(tableContract.tableExists).toBe(true);
    expect(tableContract.sharedState).toBe(true);
    await expect(page.locator('#membersPagination')).toContainText('11');

    await page.locator('[data-members-page="2"]').click();
    await expect.poll(() => requestedPages.at(-1)).toBe(2);
    await expect(page.locator('[data-members-page="2"].active')).toBeVisible();
});
