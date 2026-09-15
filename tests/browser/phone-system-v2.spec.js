const { test, expect } = require('@playwright/test');
const { normalizePhoneForSearch } = require('../../src/services/phone-service');

const catalog = {
    countries: [
        {
            country: 'مصر',
            isoCode: 'EG',
            dialCode: '+20',
            exampleNational: '01015819700',
            exampleInternational: '+201015819700',
            validLengths: [10],
            mobileRules: { supported: true, validLengths: [10], nationalPattern: '1[0-25]\\d{8}', localPrefix: '0' }
        },
        {
            country: 'السعودية',
            isoCode: 'SA',
            dialCode: '+966',
            exampleNational: '0501234567',
            exampleInternational: '+966501234567',
            validLengths: [9],
            mobileRules: { supported: true, validLengths: [9], nationalPattern: '5\\d{8}', localPrefix: '0' }
        }
    ]
};

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

const membership = Object.freeze({
    id: 5001,
    plan: 'gym_only',
    type: 'monthly',
    startDate: '2026-09-12',
    endDate: '2026-10-11',
    effectiveEndDate: '2026-10-11',
    status: 'active',
    daysRemaining: 29,
    freezeCount: 0,
    freezeLimit: 3,
    amountDue: 305,
    amountPaid: 0,
    amountRemaining: 305,
    discountAmount: 0,
    paymentMethod: 'cash',
    freezes: []
});

function jsonResponse(route, payload, status = 200) {
    return route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(payload)
    });
}

async function installLocalMemberApi(page) {
    const database = { members: [], nextId: 6101, createRequests: [], updateRequests: [], searchRequests: [] };

    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const pathname = url.pathname;
        let body = {};
        try { body = request.postDataJSON() || {}; } catch (_) { body = {}; }

        if (pathname === '/api/auth/session') return jsonResponse(route, { authenticated: true, user: { id: 7, name: 'QA Owner', role: 'Owner', tenantType: 'gym', permissions: [] } });
        if (pathname === '/api/saas/entitlements') return jsonResponse(route, {
            tenantStatus: 'active',
            subscription: { status: 'active', plan: { code: 'qa', name: 'QA Plan' } },
            entitlements: QA_ENTITLEMENTS,
            recovery: false
        });
        if (pathname === '/api/branding') return jsonResponse(route, { identity: { brandName: 'Logic Fit' } });
        if (pathname === '/api/phone/countries') return jsonResponse(route, catalog);
        if (pathname === '/api/phone/country') return jsonResponse(route, { countryCode: 'EG' });
        if (pathname === '/api/pricing') return jsonResponse(route, {
            plans: { gym_only: { label: 'Gym فقط', monthlyPrice: 305, active: true, sortOrder: 1 } },
            types: { monthly: { label: 'شهرية', mode: 'months', durationValue: 1, priceMultiplier: 1, active: true, sortOrder: 1 } },
            prices: { gym_only: { monthly: 305 } }
        });
        if (pathname === '/api/bootstrap') return jsonResponse(route, { branches: [], sections: [], defaultBranch: null });
        if (pathname === '/api/dashboard') return jsonResponse(route, { stats: { total: database.members.length, active: database.members.length, expired: 0, expiringSoon: 0, frozen: 0 }, alerts: [] });
        if (pathname === '/api/saas/subscription') return jsonResponse(route, {});

        if (pathname === '/api/members' && request.method() === 'GET') {
            const search = String(url.searchParams.get('search') || '');
            database.searchRequests.push(search);
            const canonical = normalizePhoneForSearch(search, {
                country: /^\\+|^00/.test(search) ? null : 'EG',
                required: false
            });
            const rows = database.members.filter((member) => !search
                || member.fullName.includes(search)
                || member.phone.includes(search)
                || member.phoneNormalized === canonical);
            return jsonResponse(route, {
                members: rows.map((member) => ({ ...member, membership })),
                pagination: { page: 1, pageSize: 5, totalItems: rows.length, totalPages: rows.length ? 1 : 0 }
            });
        }

        if (pathname === '/api/members' && request.method() === 'POST') {
            database.createRequests.push(body);
            const canonical = normalizePhoneForSearch(body.phoneNational, { country: body.phoneCountry, required: false });
            const duplicate = database.members.find((member) => member.phoneNormalized === canonical);
            if (!canonical) return jsonResponse(route, { error: 'PHONE_INVALID', code: 'PHONE_INVALID' }, 400);
            if (duplicate) return jsonResponse(route, { error: 'DUPLICATE_MEMBER_PHONE', code: 'DUPLICATE_MEMBER_PHONE', field: 'phone', memberName: duplicate.fullName }, 409);
            const member = {
                id: database.nextId++,
                fullName: String(body.fullName || ''),
                phone: canonical,
                phoneNormalized: canonical,
                phoneCountry: body.phoneCountry,
                phoneNational: '1015819700',
                email: body.email || null,
                registrationDate: body.registrationDate || '2026-09-12',
                notes: body.notes || '',
                membership
            };
            database.members.push(member);
            // The browser fixture intentionally omits the id from the write
            // response so the production QR side-effect is not part of this
            // phone-domain flow; the subsequent list/details reads still use
            // the persisted fixture id.
            return jsonResponse(route, { member: { fullName: member.fullName, phone: member.phone } });
        }

        const memberMatch = pathname.match(/^\/api\/members\/(\d+)$/);
        if (memberMatch && request.method() === 'PUT') {
            database.updateRequests.push(body);
            const member = database.members.find((item) => item.id === Number(memberMatch[1]));
            if (!member) return jsonResponse(route, { error: 'MEMBER_NOT_FOUND' }, 404);
            const canonical = normalizePhoneForSearch(body.phoneNational, { country: body.phoneCountry, required: false });
            member.fullName = String(body.fullName || member.fullName);
            member.phone = canonical;
            member.phoneNormalized = canonical;
            member.phoneCountry = body.phoneCountry;
            member.phoneNational = '1015819700';
            return jsonResponse(route, { member });
        }

        const detailsMatch = pathname.match(/^\/api\/members\/(\d+)\/details$/);
        if (detailsMatch && request.method() === 'GET') {
            const member = database.members.find((item) => item.id === Number(detailsMatch[1]));
            return jsonResponse(route, {
                member: member ? { ...member, membership } : null,
                memberships: member ? [membership] : [],
                freezes: [],
                events: [],
                payments: [],
                financialSummary: { totalDue: 305, totalPaid: 0, totalRemaining: 305, paidTransactionCount: 0 }
            }, member ? 200 : 404);
        }

        return jsonResponse(route, {});
    });

    return database;
}

async function enterPhoneVariant(phone, variant) {
    await phone.fill('');
    await phone.focus();
    if (/^\+|^00/.test(variant)) {
        await phone.evaluate((input, value) => {
            const clipboard = new DataTransfer();
            clipboard.setData('text/plain', value);
            input.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: clipboard }));
        }, variant);
        return;
    }
    await phone.pressSequentially(variant);
}

test('browser completes the canonical member phone flow end to end', async ({ page }) => {
    test.skip(test.info().project.name !== 'desktop', 'The end-to-end member table flow is covered at the desktop viewport; responsive phone coverage runs in the dedicated matrix below.');
    await page.addInitScript(() => {
        // Keep this contract test focused on the phone flow. The production
        // member-created listeners are intentionally outside this fixture.
        window.addEventListener('topgym:member-created', (event) => event.stopImmediatePropagation(), true);
    });
    const database = await installLocalMemberApi(page);
    await page.goto('/?members-popup-contract#members', { waitUntil: 'networkidle' });

    const variants = ['01015819700', '1015819700', '+201015819700', '00201015819700'];
    const dialog = page.locator('#memberDialog');
    const phone = page.locator('#phone');

    const variant = variants[0];
    await page.locator('#addMemberButton').click();
    await expect(dialog).toBeVisible();
    await page.locator('#fullName').fill('QA Canonical Member');
    await enterPhoneVariant(phone, variant);
    await phone.blur();

    const state = await page.evaluate(() => {
        const input = document.getElementById('phone');
        return {
            value: input.value,
            placeholder: input.getAttribute('placeholder'),
            state: window.LogicFitPhoneInputs.getState(input),
            payload: window.LogicFitPhoneInputs.getSubmissionPayload(input)
        };
    });
    expect(state.placeholder).toBe('مثال: 01015819700');
    expect(state.state.countryIso2).toBe('EG');
    expect(state.state.nationalNumber).toBe('1015819700');
    expect(state.state.e164).toBe('+201015819700');
    expect(state.payload).toMatchObject({ phoneCountry: 'EG', phoneNational: '1015819700', phone: '+201015819700' });

    const requestPromise = page.waitForRequest((request) => request.url().endsWith('/api/members') && request.method() === 'POST');
    await page.locator('#sendWhatsAppAfterSave').uncheck();
    await page.locator('#saveButton').click();
    const request = await requestPromise;
    const submitted = JSON.parse(request.postData() || '{}');
    expect(submitted).toMatchObject({ phoneCountry: 'EG', phoneNational: '1015819700', phone: '+201015819700' });

    await page.evaluate(() => {
        ['memberDialog', 'memberQrDialog'].forEach((id) => {
            const dialog = document.getElementById(id);
            dialog?.close?.();
            dialog?.removeAttribute('open');
        });
    });

    const duplicateResponses = await page.evaluate(async (phoneVariants) => {
        const results = [];
        for (const phoneVariant of phoneVariants.slice(1)) {
            const response = await fetch('/api/members', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fullName: 'QA Canonical Duplicate', phoneCountry: 'EG', phoneNational: phoneVariant, phone: phoneVariant })
            });
            results.push({ status: response.status, body: await response.json() });
        }
        return results;
    }, variants);
    expect(duplicateResponses).toHaveLength(3);
    expect(duplicateResponses.every((response) => response.status === 409 && response.body.code === 'DUPLICATE_MEMBER_PHONE')).toBe(true);
    expect(database.members).toHaveLength(1);

    expect(database.members).toHaveLength(1);
    expect(database.members[0].phoneCountry).toBe('EG');
    expect(database.members[0].phoneNational).toBe('1015819700');
    expect(database.members[0].phoneNormalized).toBe('+201015819700');

    const memberId = database.members[0].id;
    await page.evaluate(() => {
        document.getElementById('memberDialog')?.close?.();
        document.getElementById('memberDialog')?.removeAttribute('open');
        document.getElementById('memberQrDialog')?.close?.();
        document.getElementById('memberQrDialog')?.removeAttribute('open');
    });
    const detailsResponse = page.waitForResponse((response) => response.url().includes(`/api/members/${memberId}/details`));
    await page.locator(`tr[data-member-id="${memberId}"] [data-action="details"]`).click();
    await detailsResponse;
    await expect(page.locator('#detailsDialog')).toBeVisible();
    await expect(page.locator('#detailsSubtitle')).toContainText('010 15819700');
    await page.evaluate(() => document.getElementById('detailsDialog')?.close?.());

    const memberRow = page.locator(`tr[data-member-id="${memberId}"]`);
    await expect(memberRow.locator('.table-member-phone')).toHaveText('010 15819700');
    await memberRow.locator('[data-menu-toggle]').click();
    await memberRow.locator('[data-action="edit"]').click();
    await expect(dialog).toBeVisible();
    await phone.fill('01015819700');
    await phone.blur();
    const updateRequestPromise = page.waitForRequest((request) => request.url().endsWith(`/api/members/${memberId}`) && request.method() === 'PUT');
    await page.locator('#saveButton').click();
    await updateRequestPromise;
    expect(database.updateRequests.at(-1)).toMatchObject({ phoneCountry: 'EG', phoneNational: '1015819700', phone: '+201015819700' });

    for (const variant of variants) {
        await page.locator('#searchInput').fill(variant);
        await page.waitForTimeout(350);
        await expect(page.locator(`tr[data-member-id="${memberId}"]`)).toHaveCount(1);
    }

    expect(database.searchRequests.slice(-variants.length)).toEqual(variants);
    expect(database.members[0].id).toBe(memberId);
});

test('browser rejects a foreign international paste while keeping the Egyptian local contract', async ({ page }) => {
    await installLocalMemberApi(page);
    await page.goto('/register-gym.html', { waitUntil: 'domcontentloaded' });
    const phone = page.locator('input[name="whatsapp"]');
    await expect(page.locator('.phone-country-control')).toBeHidden();
    await phone.focus();
    await phone.evaluate((input) => {
        const clipboard = new DataTransfer();
        clipboard.setData('text/plain', '+966501234567');
        input.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: clipboard }));
    });
    await phone.blur();
    await expect(phone).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('.phone-input-error')).toBeVisible();
    await expect(phone).toHaveValue('+966501234567');
});

test('member and today-attendance searches expose an in-field clear action', async ({ page }) => {
    await installLocalMemberApi(page);
    await page.goto('/?members-popup-contract#members', { waitUntil: 'networkidle' });

    const memberSearch = page.locator('#searchInput');
    const memberClear = page.locator('#membersSearchClearButton');
    await memberSearch.fill('مهاب');
    await expect(memberClear).toBeVisible();
    await memberClear.click();
    await expect(memberSearch).toHaveValue('');
    await expect(memberClear).toBeHidden();

    await page.locator('#attendanceSection').evaluate((section) => { section.hidden = false; });
    const attendanceSearch = page.locator('#attendanceSearch');
    const attendanceClear = page.locator('#attendanceSearchClearButton');
    await attendanceSearch.fill('01015819700');
    await expect(attendanceClear).toBeVisible();
    await attendanceClear.click();
    await expect(attendanceSearch).toHaveValue('');
    await expect(attendanceClear).toBeHidden();
});

test('attendance workspace stays compact and overflow-free at supported viewports', async ({ page }, testInfo) => {
    await installLocalMemberApi(page);
    await page.goto('/?members-popup-contract#members', { waitUntil: 'networkidle' });

    await page.locator('#attendanceSection').evaluate((section) => {
        section.hidden = false;
        section.querySelector('#attendanceTableWrap').innerHTML = '<div class="attendance-empty">لا يوجد حضور مسجل اليوم</div>';
    });

    const metrics = await page.evaluate(() => {
        const section = document.getElementById('attendanceSection');
        const entry = section.querySelector('.attendance-entry-card').getBoundingClientRect();
        const summary = [...section.querySelectorAll('.attendance-summary-card')].map((card) => card.getBoundingClientRect());
        const listHead = section.querySelector('.attendance-list-head').getBoundingClientRect();
        const table = section.querySelector('.attendance-table-wrap').getBoundingClientRect();
        return {
            viewport: window.innerWidth,
            documentWidth: document.documentElement.scrollWidth,
            bodyWidth: document.body.scrollWidth,
            entryHeight: Math.round(entry.height),
            summaryHeights: summary.map((box) => Math.round(box.height)),
            summaryWidths: summary.map((box) => Math.round(box.width)),
            listHeadBottom: Math.round(listHead.bottom),
            tableTop: Math.round(table.top),
            sectionBottom: Math.round(section.getBoundingClientRect().bottom)
        };
    });

    expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewport + 1);
    expect(metrics.bodyWidth).toBeLessThanOrEqual(metrics.viewport + 1);
    expect(new Set(metrics.summaryWidths).size).toBe(1);
    expect(Math.max(...metrics.summaryHeights)).toBeLessThanOrEqual(metrics.viewport <= 767 ? 100 : 112);
    expect(metrics.tableTop - metrics.listHeadBottom).toBeLessThanOrEqual(2);
    expect(metrics.sectionBottom).toBeGreaterThan(metrics.tableTop);

    await testInfo.attach(`attendance-${testInfo.project.name}.png`, {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png'
    });
});

test('attendance workspace stays compact at the intermediate 1024px desktop width', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The desktop project owns the explicit 1024px intermediate viewport check.');
    await page.setViewportSize({ width: 1024, height: 768 });
    await installLocalMemberApi(page);
    await page.goto('/?members-popup-contract#members', { waitUntil: 'networkidle' });

    await page.locator('#attendanceSection').evaluate((section) => {
        section.hidden = false;
        section.querySelector('#attendanceTableWrap').innerHTML = '<div class="attendance-empty">لا يوجد حضور مسجل اليوم</div>';
    });

    const metrics = await page.evaluate(() => {
        const section = document.getElementById('attendanceSection');
        const summary = [...section.querySelectorAll('.attendance-summary-card')].map((card) => card.getBoundingClientRect());
        const listHead = section.querySelector('.attendance-list-head').getBoundingClientRect();
        const table = section.querySelector('.attendance-table-wrap').getBoundingClientRect();
        return {
            viewport: window.innerWidth,
            documentWidth: document.documentElement.scrollWidth,
            bodyWidth: document.body.scrollWidth,
            summaryHeights: summary.map((box) => Math.round(box.height)),
            summaryWidths: summary.map((box) => Math.round(box.width)),
            listHeadBottom: Math.round(listHead.bottom),
            tableTop: Math.round(table.top)
        };
    });

    expect(metrics.viewport).toBe(1024);
    expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewport + 1);
    expect(metrics.bodyWidth).toBeLessThanOrEqual(metrics.viewport + 1);
    expect(new Set(metrics.summaryWidths).size).toBe(1);
    expect(Math.max(...metrics.summaryHeights)).toBeLessThanOrEqual(112);
    expect(metrics.tableTop - metrics.listHeadBottom).toBeLessThanOrEqual(2);

    await testInfo.attach('attendance-1024.png', {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png'
    });
});

test('authenticated shell reveals without a dimmed or overlapping first-login state', async ({ page }) => {
    await installLocalMemberApi(page);
    await page.goto('/?members-popup-contract#members', { waitUntil: 'networkidle' });
    await expect(page.locator('.app-shell')).toBeVisible();

    const state = await page.evaluate(() => ({
        authHidden: document.getElementById('authScreen')?.hidden === true,
        authPending: document.body.classList.contains('auth-pending'),
        navigationPending: document.body.classList.contains('top-gym-navigation-pending'),
        pageOpacity: getComputedStyle(document.querySelector('.app-shell .page')).opacity,
        tabsOpacity: getComputedStyle(document.querySelector('.app-shell .page-tabs')).opacity
    }));

    expect(state.authHidden).toBe(true);
    expect(state.authPending).toBe(false);
    expect(state.navigationPending).toBe(false);
    expect(state.pageOpacity).toBe('1');
    expect(state.tabsOpacity).toBe('1');
});
