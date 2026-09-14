'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const test = require('node:test');
const { registerWhatsappTemplateRoutes } = require('../../src/routes/whatsapp-template.routes');
const { ROLES } = require('../../src/permissions/roles');

const ids = [
    'MEMBERSHIP_WELCOME', 'MEMBERSHIP_FROZEN', 'MEMBERSHIP_EXPIRED',
    'MEMBERSHIP_EXPIRING', 'PAYMENT_OUTSTANDING', 'MEMBER_ABSENCE',
    'DAY_PASS_THANK_YOU', 'TENANT_ACTIVATED', 'PORTAL_ACCESS'
];

function createApiHarness() {
    const systemTemplates = ids.map((id) => ({ id, body: 'SYSTEM ' + id + ' {{member_name}}', scope: 'platform', isCustomized: false }));
    const app = express();
    app.use(express.json());
    app.use((request, _response, next) => {
        const user = String(request.get('x-test-user') || 'owner');
        request.auth = user === 'assistant'
            ? { id: 3, role: ROLES.ASSISTANT }
            : user === 'trainer'
                ? { id: 4, role: ROLES.OWNER }
                : user === 'platform'
                    ? { id: 9, role: ROLES.PLATFORM_ADMIN }
                    : { id: 1, role: ROLES.OWNER };
        request.tenant = { id: 101, type: user === 'trainer' ? 'independent_trainer' : 'gym' };
        next();
    });
    const service = {
        listTenantTemplates: async () => systemTemplates,
        listSystemTemplates: async () => systemTemplates,
        saveSystemDefault: async (templateId, body) => ({ id: templateId, body: String(body), scope: 'platform' }),
        restoreSystemDefault: async (templateId) => ({ id: templateId, body: 'SYSTEM ' + templateId, scope: 'platform' }),
        saveTenantOverride: async () => { throw new Error('tenant writes must be disabled'); },
        restoreTenantDefault: async () => { throw new Error('tenant writes must be disabled'); }
    };
    const asyncRoute = (handler) => (request, response, next) => Promise.resolve(handler(request, response, next)).catch(next);
    registerWhatsappTemplateRoutes(app, { whatsappTemplateService: service, asyncRoute });
    app.use((error, _request, response, _next) => response.status(error.statusCode || 500).json({ code: error.code || 'ERROR' }));
    return app;
}

function start(app) {
    return new Promise((resolve) => {
        const server = app.listen(0, '127.0.0.1', () => resolve(server));
    });
}

function call(server, pathname, { method = 'GET', user = 'owner', body } = {}) {
    return new Promise((resolve, reject) => {
        const request = http.request({
            host: '127.0.0.1', port: server.address().port, path: pathname, method,
            headers: { 'x-test-user': user, ...(body ? { 'content-type': 'application/json' } : {}) }
        }, (response) => {
            let text = '';
            response.setEncoding('utf8');
            response.on('data', (chunk) => { text += chunk; });
            response.on('end', () => {
                let parsed = null;
                try { parsed = text ? JSON.parse(text) : null; } catch (_) { parsed = null; }
                resolve({ status: response.statusCode, body: parsed });
            });
        });
        request.on('error', reject);
        if (body) request.write(JSON.stringify(body));
        request.end();
    });
}

test('runtime reads centralized system templates while tenant management is denied', async (t) => {
    const server = await start(createApiHarness());
    t.after(() => server.close());

    const runtime = await call(server, '/api/whatsapp-templates/runtime', { user: 'owner' });
    assert.equal(runtime.status, 200);
    assert.equal(runtime.body.templates.length, 9);
    assert.ok(runtime.body.templates.every((template) => template.scope === 'platform'));

    const tenantRead = await call(server, '/api/whatsapp-templates/PAYMENT_OUTSTANDING', { user: 'owner' });
    assert.equal(tenantRead.status, 403);
    assert.equal(tenantRead.body.code, 'PLATFORM_TEMPLATES_ONLY');

    const tenantWrite = await call(server, '/api/whatsapp-templates/PAYMENT_OUTSTANDING', { method: 'PUT', user: 'owner', body: { body: 'tampered' } });
    assert.equal(tenantWrite.status, 403);
    assert.equal(tenantWrite.body.code, 'PLATFORM_TEMPLATES_ONLY');
});

test('central template API is PlatformAdmin-only and supports every approved template', async (t) => {
    const server = await start(createApiHarness());
    t.after(() => server.close());

    for (const user of ['owner', 'assistant', 'trainer']) {
        assert.equal((await call(server, '/api/platform/whatsapp-templates', { user })).status, 403);
        assert.equal((await call(server, '/api/platform/whatsapp-templates/PAYMENT_OUTSTANDING', { method: 'PUT', user, body: { body: 'tampered' } })).status, 403);
    }

    const list = await call(server, '/api/platform/whatsapp-templates', { user: 'platform' });
    assert.equal(list.status, 200);
    assert.equal(list.body.templates.length, 9);

    const save = await call(server, '/api/platform/whatsapp-templates/PAYMENT_OUTSTANDING', { method: 'PUT', user: 'platform', body: { body: 'UPDATED {{member_name}}' } });
    assert.equal(save.status, 200);
    assert.equal(save.body.template.body, 'UPDATED {{member_name}}');

    const restore = await call(server, '/api/platform/whatsapp-templates/PAYMENT_OUTSTANDING/restore-default', { method: 'POST', user: 'platform' });
    assert.equal(restore.status, 200);
    assert.equal(restore.body.template.id, 'PAYMENT_OUTSTANDING');
});
