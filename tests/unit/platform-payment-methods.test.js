'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..', '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('platform payment methods have a PlatformAdmin-only API backed by the existing service', () => {
    const routes = read('src/routes/platform-admin.routes.js');
    const controller = read('src/controllers/platform-admin.controller.js');
    const index = read('src/routes/index.js');

    assert.match(routes, /app\.get\('\/api\/platform-admin\/payment-methods', platformOnly, asyncRoute\(controller\.paymentMethods\)\)/);
    assert.match(routes, /app\.post\('\/api\/platform-admin\/payment-methods', platformOnly, asyncRoute\(controller\.createPaymentMethod\)\)/);
    assert.match(routes, /app\.patch\('\/api\/platform-admin\/payment-methods\/:methodId', platformOnly, asyncRoute\(controller\.updatePaymentMethod\)\)/);
    assert.match(index, /registerPlatformAdminRoutes\(app, \{[\s\S]*commercialService,/);
    assert.match(controller, /listPlatformPaymentMethods\(\{ readOnly: request\.readOnlyRequest \}\)/);
    assert.match(controller, /savePlatformPaymentMethod\(request\.body \|\| \{\}, request\.auth\?\.id/);
    assert.match(controller, /platform_payment_method_created/);
    assert.match(controller, /platform_payment_method_updated/);
    assert.match(controller, /paymentMethodAuditSnapshot/);
});

test('platform payment method audit snapshots do not persist account details', async () => {
    const { createPlatformAdminController } = require('../../src/controllers/platform-admin.controller');
    const audits = [];
    const controller = createPlatformAdminController({
        platformAdminService: { requestMeta: () => ({ ipAddress: '127.0.0.1', userAgent: 'unit-test' }) },
        saasService: { recordAudit: async (entry) => audits.push(entry) },
        authService: null,
        backupRecoveryService: null,
        commercialService: {
            savePlatformPaymentMethod: async (_body, actorUserId) => ({
                id: 21,
                methodCode: 'instapay',
                displayName: 'InstaPay',
                accountReference: 'sensitive-account-reference',
                recipientName: 'Platform',
                instructions: 'private instructions',
                isActive: true,
                sortOrder: 2
            })
        }
    });
    const response = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; }
    };

    await controller.createPaymentMethod({
        body: { methodCode: 'instapay', displayName: 'InstaPay', accountReference: 'sensitive-account-reference' },
        auth: { id: 7 },
        ip: '127.0.0.1',
        get: () => 'unit-test'
    }, response);

    assert.equal(response.statusCode, 201);
    assert.equal(response.body.paymentMethod.id, 21);
    assert.equal(audits.length, 1);
    assert.deepEqual(audits[0].after, {
        methodCode: 'instapay',
        displayName: 'InstaPay',
        isActive: true,
        sortOrder: 2
    });
    assert.equal(JSON.stringify(audits[0]).includes('sensitive-account-reference'), false);
    assert.equal(JSON.stringify(audits[0]).includes('private instructions'), false);
});

test('Platform Admin UI manages platform methods and keeps tenant payment settings separate', () => {
    const html = read('public/platform-admin.html');
    const client = read('public/js/platform-admin.js');
    const branding = read('public/index.html');
    const registerPage = read('public/js/register-gym.js');
    const portal = read('public/js/member-portal-subscription.js');

    assert.match(html, /data-platform-view="payment-methods"/);
    assert.match(html, /data-platform-panel="payment-methods"/);
    assert.match(html, /id="platformPaymentMethodsTableBody"/);
    assert.match(html, /data-platform-action="new-platform-payment-method"/);
    assert.match(client, /\/api\/platform-admin\/payment-methods/);
    assert.match(client, /platform-payment-method-create/);
    assert.match(client, /platform-payment-method-edit/);
    assert.match(client, /data-platform-payment-method-edit/);
    assert.match(branding, /id="brandingPaymentMethods"/);
    assert.match(registerPage, /Platform Admin تهيئة وسيلة دفع/);
    assert.match(portal, /يجب على Owner إضافة وسيلة دفع من إعدادات هوية الجيم ثم نشر الهوية/);
    assert.doesNotMatch(registerPage, /01015819700|01005376843/);
    assert.doesNotMatch(portal, /01015819700|01005376843/);
});

test('registration reads only active platform methods while member portal reads published tenant identity methods', () => {
    const commercial = read('src/services/commercial-service.js');
    const registration = read('src/services/gym-registration-service.js');
    const branding = read('src/services/branding-service.js');

    assert.match(commercial, /async function listPlatformPaymentMethods\(\{ activeOnly = false, readOnly = false \}/);
    assert.match(commercial, /WHERE @activeOnly=0 OR is_active=1/);
    assert.match(registration, /listPlatformPaymentMethods\(\{\s*activeOnly:\s*true,\s*readOnly:\s*true\s*\}\)/);
    assert.match(branding, /const published = applyTenantIdentity\(parseStoredConfig\(row\?\.published_config\)/);
    assert.match(branding, /published\.identity\.paymentMethods/);
});
