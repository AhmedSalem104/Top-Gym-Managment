const { test, expect } = require('@playwright/test');

const defaults = {
    PAYMENT_OUTSTANDING: 'DEFAULT {{member_name}} {{remaining_amount}}',
    PORTAL_ACCESS: 'PORTAL {{member_name}} {{membership_code}} {{portal_url}}'
};

function template(id, scope = 'tenant') {
    return {
        id,
        name: id,
        description: `QA ${id}`,
        category: scope === 'platform' ? 'المنصة' : 'الاشتراكات',
        scope,
        variables: id === 'PAYMENT_OUTSTANDING' ? ['member_name', 'gym_name', 'remaining_amount', 'expiry_date'] : ['member_name', 'gym_name', 'membership_code', 'portal_url'],
        body: defaults[id] || `DEFAULT ${id} {{member_name}}`,
        isCustomized: false,
        isActive: true
    };
}

async function installOwnerApi(page, { tenantId = 1, stores = new Map() } = {}) {
    const key = String(tenantId);
    if (!stores.has(key)) {
        stores.set(key, [
            template('MEMBERSHIP_WELCOME'), template('MEMBERSHIP_FROZEN'), template('MEMBERSHIP_EXPIRED'),
            template('MEMBERSHIP_EXPIRING'), template('PAYMENT_OUTSTANDING'), template('MEMBER_ABSENCE'),
            template('DAY_PASS_THANK_YOU'), template('TENANT_ACTIVATED', 'platform'), template('PORTAL_ACCESS')
        ]);
    }
    const templates = stores.get(key);

    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;
        const respond = (payload, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) });
        if (pathname === '/api/auth/session') return respond({ authenticated: true, user: { id: 7, tenantId: Number(tenantId), tenantType: 'gym', role: 'Owner', permissions: [] } });
        if (pathname === '/api/branding') return respond({ identity: { brandName: 'Top Gym' } });
        if (pathname === '/api/members/4242') return respond({ member: { id: 4242, fullName: 'QA Member', phone: '+201012345678', phoneCountry: 'EG', membership: { status: 'active', amountRemaining: 75, effectiveEndDate: '2026-09-30' } } });
        if (pathname === '/api/whatsapp-templates' && request.method() === 'GET') return respond({ templates });
        if (pathname === '/api/whatsapp-templates/PAYMENT_OUTSTANDING' && request.method() === 'PUT') {
            const body = JSON.parse(request.postData() || '{}');
            const current = templates.find((item) => item.id === 'PAYMENT_OUTSTANDING');
            current.body = body.body;
            current.isCustomized = true;
            return respond({ template: current });
        }
        if (pathname === '/api/whatsapp-templates/PAYMENT_OUTSTANDING/restore-default' && request.method() === 'POST') {
            const current = templates.find((item) => item.id === 'PAYMENT_OUTSTANDING');
            current.body = defaults.PAYMENT_OUTSTANDING;
            current.isCustomized = false;
            return respond({ template: current });
        }
        if (pathname === '/api/members/4242/alert-communications') return respond({ contact: null });
        if (pathname === '/api/phone/countries') return respond({ fallbackCountry: 'EG', countries: [] });
        return respond({});
    });
}

async function openTemplates(page) {
    await page.goto('/?whatsapp-template-qa#whatsapp-templates', { waitUntil: 'domcontentloaded' });
    const tab = page.locator('[data-page-tab="whatsapp-templates"]');
    await expect(tab).toBeVisible();
    await tab.click();
    await expect(page.locator('[data-top-gym-loading-tab]')).toHaveCount(0, { timeout: 20_000 });
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#whatsappTemplatesSection')).toBeVisible();
    await expect(page.locator('#whatsappTemplateBody')).toBeVisible();
}

async function openActualMemberWhatsapp(page) {
    await page.evaluate(async () => {
        await window.topGymEnsureTab?.('members');
        document.getElementById('qa-real-member-alert')?.remove();
        const button = document.createElement('button');
        button.id = 'qa-real-member-alert';
        button.type = 'button';
        button.dataset.alertWhatsapp = 'debt';
        button.dataset.memberId = '4242';
        button.textContent = 'WhatsApp';
        document.body.append(button);
    });
    const popupPromise = page.waitForEvent('popup');
    await page.locator('#qa-real-member-alert').click();
    const popup = await popupPromise;
    await expect.poll(() => popup.url(), { timeout: 15_000 }).toMatch(/(?:wa\.me|whatsapp\.com)/);
    return popup;
}

test.beforeEach(async ({ page }) => {
    await installOwnerApi(page);
});

test('edit, save, reload, actual WhatsApp action, restore and actual default action', async ({ page }) => {
    await openTemplates(page);
    await page.locator('[data-template-id="PAYMENT_OUTSTANDING"]').click();
    const editor = page.locator('#whatsappTemplateBody');
    await editor.fill('CUSTOM {{member_name}} {{remaining_amount}}');
    await page.locator('#whatsappTemplateSave').click();
    await expect(editor).toHaveValue('CUSTOM {{member_name}} {{remaining_amount}}');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('[data-page-tab="whatsapp-templates"]').click();
    await page.locator('[data-template-id="PAYMENT_OUTSTANDING"]').click();
    await expect(editor).toHaveValue('CUSTOM {{member_name}} {{remaining_amount}}');

    const customPopup = await openActualMemberWhatsapp(page);
    await expect.poll(() => customPopup.url(), { timeout: 10_000 }).toContain('CUSTOM');
    await customPopup.close();

    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('#whatsappTemplateRestore').click();
    await expect(editor).toHaveValue(defaults.PAYMENT_OUTSTANDING);

    const defaultPopup = await openActualMemberWhatsapp(page);
    await expect.poll(() => defaultPopup.url(), { timeout: 10_000 }).toContain('DEFAULT');
    await expect.poll(() => defaultPopup.url(), { timeout: 10_000 }).not.toContain('CUSTOM');
    await defaultPopup.close();
});

test('platform template is visible to tenant UI but cannot be edited', async ({ page }) => {
    await openTemplates(page);
    await page.locator('[data-template-id="TENANT_ACTIVATED"]').click();
    await expect(page.locator('#whatsappTemplateBody')).toBeDisabled();
    await expect(page.locator('#whatsappTemplateSave')).toBeDisabled();
    await expect(page.locator('#whatsappTemplateRestore')).toBeDisabled();
});

test('tenant overrides remain isolated between Tenant A and Tenant B', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const tenantStores = new Map();
    const tenantA = await context.newPage();
    const tenantB = await context.newPage();
    await installOwnerApi(tenantA, { tenantId: 101, stores: tenantStores });
    await installOwnerApi(tenantB, { tenantId: 202, stores: tenantStores });

    await openTemplates(tenantA);
    await tenantA.locator('[data-template-id="PAYMENT_OUTSTANDING"]').click();
    await tenantA.locator('#whatsappTemplateBody').fill('TENANT_A {{member_name}}');
    await tenantA.locator('#whatsappTemplateSave').click();
    await expect(tenantA.locator('#whatsappTemplateBody')).toHaveValue('TENANT_A {{member_name}}');

    await openTemplates(tenantB);
    await tenantB.locator('[data-template-id="PAYMENT_OUTSTANDING"]').click();
    await expect(tenantB.locator('#whatsappTemplateBody')).toHaveValue(defaults.PAYMENT_OUTSTANDING);
    await expect(tenantB.locator('#whatsappTemplateBody')).not.toHaveValue('TENANT_A {{member_name}}');

    await context.close();
});
