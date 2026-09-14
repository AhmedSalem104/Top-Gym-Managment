const { test, expect } = require('@playwright/test');

const ids = [
    'MEMBERSHIP_WELCOME', 'MEMBERSHIP_FROZEN', 'MEMBERSHIP_EXPIRED',
    'MEMBERSHIP_EXPIRING', 'PAYMENT_OUTSTANDING', 'MEMBER_ABSENCE',
    'DAY_PASS_THANK_YOU', 'TENANT_ACTIVATED', 'PORTAL_ACCESS'
];

const defaults = new Map(ids.map((id) => [id, 'DEFAULT ' + id + ' {{member_name}}']));
const template = (id) => ({
    id,
    name: id,
    description: 'QA ' + id,
    category: 'System',
    scope: 'platform',
    variables: id === 'PAYMENT_OUTSTANDING'
        ? ['member_name', 'gym_name', 'remaining_amount', 'expiry_date']
        : ['member_name', 'gym_name'],
    body: defaults.get(id),
    isCustomized: false,
    isActive: true
});

async function installPlatformApi(page, store = new Map(defaults)) {
    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;
        const respond = (payload, status = 200) => route.fulfill({
            status, contentType: 'application/json', body: JSON.stringify(payload)
        });

        if (pathname === '/api/auth/session') {
            return respond({ authenticated: true, user: { id: 9, role: 'PlatformAdmin', name: 'QA Platform Admin' } });
        }
        if (pathname === '/api/platform/whatsapp-templates' && request.method() === 'GET') {
            return respond({ templates: ids.map((id) => ({ ...template(id), body: store.get(id) })) });
        }
        if (pathname.startsWith('/api/platform/whatsapp-templates/') && request.method() === 'PUT') {
            const id = pathname.split('/').filter(Boolean).pop();
            const body = JSON.parse(request.postData() || '{}');
            store.set(id, body.body);
            return respond({ template: { ...template(id), body: body.body } });
        }
        if (pathname.endsWith('/restore-default') && pathname.includes('/api/platform/whatsapp-templates/')) {
            const id = pathname.split('/').filter(Boolean).slice(-2, -1)[0];
            store.set(id, defaults.get(id));
            return respond({ template: { ...template(id), body: defaults.get(id) } });
        }
        return respond({});
    });
}

test('Platform Admin opens central templates, edits, reloads and restores', async ({ page }) => {
    const store = new Map(defaults);
    await installPlatformApi(page, store);
    await page.goto('/platform-admin.html#settings/whatsapp', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('#platformAdminApp')).toBeVisible();
    await expect(page).toHaveURL(/platform-admin\.html#settings\/whatsapp$/);
    await expect(page.locator('#platformSettingsShell')).toBeVisible();
    await expect(page.locator('#platformWhatsappTemplatesMount')).toBeVisible();
    await expect(page.locator('[data-template-id]')).toHaveCount(9);
    await expect(page.locator('[data-template-id="PAYMENT_OUTSTANDING"]')).toBeVisible();

    await page.locator('[data-template-id="PAYMENT_OUTSTANDING"]').click();
    const editor = page.locator('[data-whatsapp-template-body]');
    await expect(editor).toHaveValue(defaults.get('PAYMENT_OUTSTANDING'));
    await page.locator('[data-variable="member_name"]').click();
    await expect(editor).toHaveValue(/\{\{member_name\}\}/);
    await expect(page.locator('[data-whatsapp-template-preview]')).toContainText('أحمد محمد');

    await editor.fill('CUSTOM {{member_name}}');
    await page.locator('[data-whatsapp-action="save"]').click();
    await expect(editor).toHaveValue('CUSTOM {{member_name}}');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/#settings\/whatsapp$/);
    await expect(page.locator('[data-template-id]')).toHaveCount(9);
    await page.locator('[data-template-id="PAYMENT_OUTSTANDING"]').click();
    await expect(page.locator('[data-whatsapp-template-body]')).toHaveValue('CUSTOM {{member_name}}');

    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('[data-whatsapp-action="restore"]').click();
    await expect(page.locator('[data-whatsapp-template-body]')).toHaveValue(defaults.get('PAYMENT_OUTSTANDING'));
});

test('Platform settings overview keeps WhatsApp as a section, not the default content', async ({ page }) => {
    await installPlatformApi(page);
    await page.goto('/platform-admin.html#settings', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('#platformSettingsOverview')).toBeVisible();
    await expect(page.locator('#platformWhatsappTemplatesMount')).toBeHidden();
    await expect(page.locator('[data-settings-section="whatsapp"]')).toHaveCount(1);
    await expect(page.locator('[data-template-id]')).toHaveCount(0);

    await page.locator('[data-settings-section="whatsapp"]').click();
    await expect(page).toHaveURL(/#settings\/whatsapp$/);
    await expect(page.locator('[data-template-id]')).toHaveCount(9);
});

test('Gym route has no WhatsApp management UI or management feature', async ({ page }) => {
    await page.route('**/api/**', async (route) => {
        const pathname = new URL(route.request().url()).pathname;
        const response = pathname === '/api/auth/session'
            ? { authenticated: true, user: { id: 1, tenantId: 101, tenantType: 'gym', role: 'Owner', permissions: [] } }
            : {};
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) });
    });
    await page.goto('/#settings/whatsapp', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('#platformSettingsShell')).toHaveCount(0);
    await expect(page.locator('#whatsappTemplatesSection')).toHaveCount(0);
    await expect(page.locator('[data-page-tab="whatsapp-templates"]')).toHaveCount(0);
});
