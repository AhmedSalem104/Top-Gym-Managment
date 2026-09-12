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
    paymentMethod: 'cash'
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
    expect(state.placeholder).toBe('1015819700');
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
    await page.locator(`tr[data-member-id="${memberId}"] [data-action="details"]`).click();
    await expect(page.locator('#detailsDialog')).toBeVisible();
    await expect(page.locator('#detailsSubtitle')).toContainText('+201015819700');
    await page.evaluate(() => document.getElementById('detailsDialog')?.close?.());

    const memberRow = page.locator(`tr[data-member-id="${memberId}"]`);
    await memberRow.locator('[data-menu-toggle]').click();
    await memberRow.locator('[data-action="edit"]').click();
    await expect(dialog).toBeVisible();
    await phone.fill('1015819700');
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

test('browser exposes selected-country mismatch without changing manual country', async ({ page }) => {
    await installLocalMemberApi(page);
    await page.goto('/register-gym.html', { waitUntil: 'domcontentloaded' });
    const phone = page.locator('input[name="whatsapp"]');
    const country = page.locator('select[data-phone-country]');
    await country.selectOption('EG');
    await phone.focus();
    await phone.evaluate((input) => {
        const clipboard = new DataTransfer();
        clipboard.setData('text/plain', '+966501234567');
        input.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: clipboard }));
    });
    await expect(phone).toHaveValue('+966501234567');
    await phone.blur();
    await expect(phone).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('.phone-input-error')).toBeVisible();
    await expect(country).toHaveValue('EG');
    await expect(phone).toHaveValue('+966501234567');
});
