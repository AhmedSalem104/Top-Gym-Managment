const { test, expect } = require('@playwright/test');
const path = require('node:path');
const os = require('node:os');

const TEMPLATE_IDS = [
    'MEMBERSHIP_WELCOME', 'MEMBERSHIP_FROZEN', 'MEMBERSHIP_EXPIRED',
    'MEMBERSHIP_EXPIRING', 'PAYMENT_OUTSTANDING', 'MEMBER_ABSENCE',
    'DAY_PASS_THANK_YOU', 'TENANT_ACTIVATED', 'PORTAL_ACCESS'
];

const QA_ENTITLEMENTS = {
    tenantType: 'gym',
    features: {
        dashboard: true,
        members: true,
        attendance: true,
        pricing: true,
        payments: true,
        reports: true,
        portal: true,
        notifications: true,
        coaching: true,
        nutrition: true,
        library: true,
        branding: true,
        team: true
    },
    featureCatalog: [
        'dashboard', 'members', 'attendance', 'pricing', 'payments', 'reports',
        'portal', 'notifications', 'coaching', 'nutrition', 'library',
        'branding', 'team'
    ].map((key) => ({ key, tenantTypes: ['gym'] }))
};

function jsonResponse(route, payload, status = 200) {
    return route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(payload)
    });
}

function createMember() {
    return {
        id: 4242,
        fullName: 'QA Freeze Member',
        phone: '+201012345678',
        phoneCountry: 'EG',
        phoneNational: '1012345678',
        registrationDate: '2026-09-12',
        membership: {
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
        }
    };
}

async function installApi(page, { freezeFails = false, welcomeTemplate = null } = {}) {
    const state = { member: createMember(), freezeCalls: 0, templateCalls: 0, createCalls: 0, freezeFails, welcomeTemplate };
    await page.addInitScript(() => {
        window.__topGymOpenCalls = [];
        window.open = (url = '') => {
            const record = { url: String(url), closed: false };
            const opened = {
                opener: null,
                get closed() { return record.closed; },
                close() { record.closed = true; }
            };
            Object.defineProperty(opened, 'location', {
                value: {
                    get href() { return record.url; },
                    set href(value) { record.url = String(value); }
                }
            });
            window.__topGymOpenCalls.push(record);
            return opened;
        };
        document.addEventListener('click', (event) => {
            const link = event.target.closest?.('a');
            if (link?.href?.startsWith('whatsapp://')) window.__topGymOpenCalls.push({ url: link.href, closed: false });
        }, true);
    });
    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const pathname = url.pathname;

        if (pathname === '/api/auth/session') {
            return jsonResponse(route, { authenticated: true, user: { id: 7, role: 'Owner', tenantType: 'gym', permissions: [] } });
        }
        if (pathname === '/api/branding') return jsonResponse(route, { identity: { brandName: 'Logic Fit' } });
        if (pathname === '/api/phone/countries') {
            return jsonResponse(route, {
                fallbackCountry: 'EG',
                countries: [{ isoCode: 'EG', country: 'مصر', dialCode: '+20', exampleNational: '01012345678', exampleInternational: '+201012345678', validLengths: [10] }]
            });
        }
        if (pathname === '/api/pricing') {
            return jsonResponse(route, {
                plans: { gym_only: { label: 'Gym فقط', monthlyPrice: 305, active: true, sortOrder: 1 } },
                types: { monthly: { label: 'شهرية', mode: 'months', durationValue: 1, priceMultiplier: 1, active: true, sortOrder: 1 } },
                prices: { gym_only: { monthly: 305 } }
            });
        }
        if (pathname === '/api/bootstrap') return jsonResponse(route, { branches: [], sections: [], defaultBranch: null });
        if (pathname === '/api/dashboard') return jsonResponse(route, { stats: { total: 1, active: 1, expired: 0, expiringSoon: 0, frozen: 0 }, alerts: [] });
        if (pathname === '/api/saas/entitlements') {
            return jsonResponse(route, {
                tenantStatus: 'active',
                subscription: { status: 'active', plan: { code: 'qa', name: 'QA Plan' } },
                entitlements: QA_ENTITLEMENTS,
                recovery: false
            });
        }
        if (pathname === '/api/saas/subscription') return jsonResponse(route, {});
        if (pathname === '/api/whatsapp-templates/runtime') {
            state.templateCalls += 1;
            return jsonResponse(route, {
                templates: TEMPLATE_IDS.map((id) => ({ id, body: id === 'MEMBERSHIP_WELCOME' && state.welcomeTemplate ? state.welcomeTemplate : `CENTRAL-${id} {{member_name}} | {{gym_name}} | {{freeze_until}}` }))
            });
        }
        if (pathname === '/api/members' && request.method() === 'GET') {
            return jsonResponse(route, { members: [state.member], pagination: { page: 1, pageSize: 5, totalItems: 1, totalPages: 1 } });
        }
        if (pathname === '/api/members/4242/freeze' && request.method() === 'POST') {
            state.freezeCalls += 1;
            if (state.freezeFails) return jsonResponse(route, { error: 'QA freeze failure', code: 'QA_FREEZE_FAILURE' }, 409);
            state.member = {
                ...state.member,
                membership: {
                    ...state.member.membership,
                    status: 'frozen',
                    freezeCount: 1,
                    freezeEnd: '2026-09-18'
                }
            };
            return jsonResponse(route, { member: state.member });
        }
        if (pathname === '/api/members' && request.method() === 'POST') {
            state.createCalls += 1;
            const body = request.postDataJSON() || {};
            state.member = {
                ...state.member,
                id: 4243,
                fullName: body.fullName || state.member.fullName,
                phone: body.phone || state.member.phone,
                phoneCountry: body.phoneCountry || state.member.phoneCountry,
                phoneNational: body.phoneNational || state.member.phoneNational,
                membershipCode: 'TG-QA-WELCOME-CODE',
                membershipCodePortalUrl: 'https://qa.logicfit.test/member-portal?tenant=qa',
                membership: {
                    ...state.member.membership,
                    plan: 'gym_only',
                    type: 'monthly',
                    startDate: '2026-09-14',
                    endDate: '2026-10-13',
                    effectiveEndDate: '2026-10-13',
                    listPrice: 350,
                    discountAmount: 0,
                    amountDue: 350,
                    amountPaid: 350,
                    amountRemaining: 0,
                    paymentMethod: 'cash'
                }
            };
            return jsonResponse(route, { member: state.member });
        }
        return jsonResponse(route, {});
    });
    return state;
}

async function openFreezeDialog(page) {
    await page.goto('/?members-popup-contract#members', { waitUntil: 'networkidle' });
    await page.evaluate(() => window.LogicFitPhoneInputs?.loadCatalog?.());
    const row = page.locator('tr[data-member-id="4242"]');
    await row.locator('[data-menu-toggle]').click();
    await row.locator('.action-menu-panel [data-action="freeze"]').evaluate((button) => button.click());
    const checkboxBlock = page.locator('#dialogFreezeWhatsappOption');
    await expect(checkboxBlock).toBeVisible();
    await expect(checkboxBlock).toContainText('إرسال إشعار للعضو عبر WhatsApp بعد التجميد');
    await expect(page.locator('#dialogFreezeSendWhatsApp')).toBeVisible();
    await expect(page.locator('#dialogFreezeSendWhatsApp')).toBeChecked();
    const checkboxLayout = await checkboxBlock.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return { hidden: element.hidden, display: style.display, width: rect.width, height: rect.height };
    });
    expect(checkboxLayout.hidden).toBe(false);
    expect(checkboxLayout.display).not.toBe('none');
    expect(checkboxLayout.width).toBeGreaterThan(0);
    expect(checkboxLayout.height).toBeGreaterThan(0);
    if (test.info().project.name === 'desktop') {
        await page.screenshot({ path: path.join(os.tmpdir(), 'logicfit-freeze-popup-actual.png'), fullPage: false });
    }
}

test('Add Member sends exactly the saved Platform central welcome template', async ({ page }) => {
    const state = await installApi(page, { welcomeTemplate: 'TEST-123 {{member_name}} | {{gym_name}}' });
    await page.route('**/api/phone/countries', (route) => jsonResponse(route, {
        fallbackCountry: 'EG',
        countries: [{
            isoCode: 'EG', dialCode: '+20', exampleNational: '01012345678', exampleInternational: '+201012345678',
            validLengths: [10], mobileRules: { localPrefix: '0', validLengths: [10], nationalPattern: '1[0-25]\\d{8}' }
        }]
    }));
    await page.goto('/?members-popup-contract#members', { waitUntil: 'networkidle' });
    await page.evaluate(() => window.LogicFitPhoneInputs?.loadCatalog?.());
    await page.locator('#addMemberButton').click();
    await page.locator('#fullName').fill('QA Welcome Member');
    await page.locator('#phone').fill('1012345678');
    await page.locator('#saveButton').click();

    await expect.poll(() => page.evaluate(() => window.__topGymOpenCalls.some((item) => item.url.startsWith('https://wa.me/') || item.url.startsWith('whatsapp://'))), { timeout: 10000 }).toBe(true);
    expect(state.createCalls).toBe(1);
    expect(state.templateCalls).toBe(1);
    const message = await page.evaluate(() => {
        const record = window.__topGymOpenCalls.find((item) => item.url.startsWith('https://wa.me/') || item.url.startsWith('whatsapp://'));
        return new URL(record.url).searchParams.get('text');
    });
    expect(message).toBe('TEST-123 QA Welcome Member | Logic Fit');
});

test('actual Add Member flow renders the complete central welcome data context', async ({ page }) => {
    const richTemplate = 'WELCOME|{{member_name}}|{{gym_name}}|{{plan_name}}|{{membership_type}}|{{start_date}}|{{expiry_date}}|{{base_price}}|{{discount_amount}}|{{amount_due}}|{{amount_paid}}|{{remaining_amount}}|{{payment_method}}|{{portal_code}}|{{portal_url}}|✅';
    await installApi(page, { welcomeTemplate: richTemplate });
    await page.route('**/api/phone/countries', (route) => jsonResponse(route, {
        fallbackCountry: 'EG',
        countries: [{
            isoCode: 'EG', dialCode: '+20', exampleNational: '01012345678', exampleInternational: '+201012345678',
            validLengths: [10], mobileRules: { localPrefix: '0', validLengths: [10], nationalPattern: '1[0-25]\\d{8}' }
        }]
    }));
    await page.goto('/?members-popup-contract#members', { waitUntil: 'networkidle' });
    await page.evaluate(() => window.LogicFitPhoneInputs?.loadCatalog?.());
    await page.locator('#addMemberButton').click();
    await page.locator('#fullName').fill('QA Rich Member');
    await page.locator('#phone').fill('1012345678');
    await page.locator('#membershipPlan').selectOption('gym_only');
    await page.locator('#membershipType').selectOption('monthly');
    await page.locator('#startDate').fill('2026-09-14');
    await page.locator('#endDate').fill('2026-10-13');
    await page.locator('#discountAmount').fill('0');
    await page.locator('#amountPaid').fill('350');
    await page.locator('#paymentMethod').selectOption('cash');
    await page.locator('#saveButton').click();

    await expect.poll(() => page.evaluate(() => window.__topGymOpenCalls.some((item) => item.url.startsWith('https://wa.me/') || item.url.startsWith('whatsapp://'))), { timeout: 10000 }).toBe(true);
    const message = await page.evaluate(() => {
        const record = window.__topGymOpenCalls.find((item) => item.url.startsWith('https://wa.me/') || item.url.startsWith('whatsapp://'));
        return new URL(record.url).searchParams.get('text');
    });
    const expected = await page.evaluate(() => {
        const formatDate = (value) => new Intl.DateTimeFormat('ar-EG-u-ca-gregory', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(`${value}T00:00:00`));
        const money = (value) => `${Number(value).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
        return `WELCOME|QA Rich Member|Logic Fit|Gym فقط|شهرية|${formatDate('2026-09-14')}|${formatDate('2026-10-13')}|${money(350)}|${money(0)}|${money(350)}|${money(350)}||نقدي|TG-QA-WELCOME-CODE|https://qa.logicfit.test/member-portal?tenant=qa|✅`;
    });
    expect(message).toBe(expected);
    expect(message).not.toContain('�');
    expect(message).not.toMatch(/[╭│├╰╯]/u);
});

test('Add Member preserves UTF-8 template text through WhatsApp URL encoding', async ({ page }) => {
    test.skip(test.info().project.name !== 'desktop', 'Unicode transport is covered once; the central flow is exercised across the responsive matrix above.');
    await installApi(page, { welcomeTemplate: 'UTF8-✅ {{member_name}} | {{gym_name}}' });
    await page.route('**/api/phone/countries', (route) => jsonResponse(route, {
        fallbackCountry: 'EG',
        countries: [{
            isoCode: 'EG', dialCode: '+20', exampleNational: '01012345678', exampleInternational: '+201012345678',
            validLengths: [10], mobileRules: { localPrefix: '0', validLengths: [10], nationalPattern: '1[0-25]\\d{8}' }
        }]
    }));
    await page.goto('/?members-popup-contract#members', { waitUntil: 'networkidle' });
    await page.evaluate(() => window.LogicFitPhoneInputs?.loadCatalog?.());
    await page.locator('#addMemberButton').click();
    await page.locator('#fullName').fill('QA Unicode Member');
    await page.locator('#phone').fill('1012345678');
    await page.locator('#saveButton').click();
    await expect.poll(() => page.evaluate(() => window.__topGymOpenCalls.some((item) => item.url.startsWith('https://wa.me/') || item.url.startsWith('whatsapp://'))), { timeout: 10000 }).toBe(true);

    const message = await page.evaluate(() => {
        const record = window.__topGymOpenCalls.find((item) => item.url.startsWith('https://wa.me/') || item.url.startsWith('whatsapp://'));
        return new URL(record.url).searchParams.get('text');
    });
    expect(message).toBe('UTF8-✅ QA Unicode Member | Logic Fit');
});

test('freeze with WhatsApp checked uses the central frozen template once after success', async ({ page }) => {
    const state = await installApi(page);
    await openFreezeDialog(page);

    await expect(page.locator('#dialogFreezeSendWhatsApp')).toBeChecked();
    await page.evaluate(() => {
        const form = document.getElementById('actionForm');
        form.requestSubmit();
        form.requestSubmit();
    });
    await expect.poll(() => page.evaluate(() => window.__topGymOpenCalls.some((item) => item.url.startsWith('https://wa.me/') || item.url.startsWith('whatsapp://'))), { timeout: 10000 }).toBe(true);

    expect(state.freezeCalls).toBe(1);
    expect(state.templateCalls).toBe(1);
    expect(await page.evaluate(() => window.__topGymOpenCalls.filter((item) => item.url.startsWith('https://wa.me/') || item.url.startsWith('whatsapp://')).length)).toBe(1);
    const message = await page.evaluate(() => {
        const record = window.__topGymOpenCalls.find((item) => item.url.startsWith('https://wa.me/') || item.url.startsWith('whatsapp://'));
        return new URL(record.url).searchParams.get('text');
    });
    expect(message).toBe('CENTRAL-MEMBERSHIP_FROZEN QA Freeze Member | Logic Fit | 2026-09-18');
});

test('freeze with WhatsApp unchecked does not open WhatsApp', async ({ page }) => {
    const state = await installApi(page);
    await openFreezeDialog(page);
    await page.locator('#dialogFreezeSendWhatsApp').uncheck();
    await page.locator('#dialogSubmit').click();
    await page.waitForFunction(() => !document.getElementById('actionDialog')?.open);

    expect(state.freezeCalls).toBe(1);
    expect(await page.evaluate(() => window.__topGymOpenCalls)).toEqual([]);
});

test('freeze failure never navigates a WhatsApp window', async ({ page }) => {
    const state = await installApi(page, { freezeFails: true });
    await openFreezeDialog(page);
    await page.locator('#dialogSubmit').click();
    await page.waitForFunction(() => {
        const button = document.getElementById('dialogSubmit');
        return Boolean(button && !button.disabled);
    });

    expect(state.freezeCalls).toBe(1);
    expect(await page.evaluate(() => window.__topGymOpenCalls.some((item) => item.url.startsWith('https://wa.me/') || item.url.startsWith('whatsapp://')))).toBe(false);
    expect(await page.evaluate(() => window.__topGymOpenCalls.every((item) => item.closed))).toBe(true);
});

test('all nine runtime messages are rendered from the central template payload', async ({ page }) => {
    await installApi(page);
    await page.goto('/?members-popup-contract#members', { waitUntil: 'networkidle' });
    const rendered = await page.evaluate(async (ids) => {
        await window.topGymEnsureTab('whatsapp-runtime');
        const output = {};
        for (const id of ids) output[id] = await window.LogicFitWhatsAppTemplates.render(id, { member_name: 'QA', gym_name: 'Logic Fit', freeze_until: '2026-09-18' });
        return output;
    }, TEMPLATE_IDS);
    for (const id of TEMPLATE_IDS) expect(rendered[id]).toBe(`CENTRAL-${id} QA | Logic Fit | 2026-09-18`);
});
