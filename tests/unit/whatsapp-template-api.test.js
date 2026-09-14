'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const test = require('node:test');
const { registerWhatsappTemplateRoutes } = require('../../src/routes/whatsapp-template.routes');
const { ROLES } = require('../../src/permissions/roles');

const DEFAULT_BODY = 'SYSTEM DEFAULT {{member_name}}';
const TENANT_ACTIVATED_BODY = 'PLATFORM DEFAULT {{gym_name}}';

function createApiHarness() {
    const overrides = new Map();
    const app = express();
    app.use(express.json());
    app.use((request, _response, next) => {
        const user = String(request.get('x-test-user') || 'owner-a');
        request.auth = user === 'assistant'
            ? { id: 3, role: ROLES.ASSISTANT }
            : user === 'platform'
                ? { id: 9, role: ROLES.PLATFORM_ADMIN }
                : { id: user === 'owner-b' ? 2 : 1, role: ROLES.OWNER };
        request.tenant = { id: user === 'owner-b' ? 202 : 101 };
        next();
    });
    const service = {
        listTenantTemplates: async (tenantId) => [{ id: 'PAYMENT_OUTSTANDING', body: overrides.get(Number(tenantId)) || DEFAULT_BODY, isCustomized: overrides.has(Number(tenantId)) }],
        getEffectiveTemplate: async (templateId, { tenantId = null, platform = false } = {}) => ({
            id: templateId,
            body: platform ? TENANT_ACTIVATED_BODY : (overrides.get(Number(tenantId)) || DEFAULT_BODY),
            isCustomized: !platform && overrides.has(Number(tenantId))
        }),
        saveTenantOverride: async (templateId, body, { tenantId }) => {
            if (templateId === 'TENANT_ACTIVATED') {
                const error = new Error('platform template');
                error.statusCode = 403;
                error.code = 'PLATFORM_TEMPLATE';
                throw error;
            }
            overrides.set(Number(tenantId), String(body));
            return { id: templateId, body: String(body), isCustomized: true };
        },
        restoreTenantDefault: async (templateId, { tenantId }) => {
            if (templateId === 'TENANT_ACTIVATED') {
                const error = new Error('platform template');
                error.statusCode = 403;
                error.code = 'PLATFORM_TEMPLATE';
                throw error;
            }
            overrides.delete(Number(tenantId));
            return { id: templateId, body: DEFAULT_BODY, isCustomized: false };
        },
        listSystemTemplates: async () => [{ id: 'TENANT_ACTIVATED', body: TENANT_ACTIVATED_BODY }],
        saveSystemDefault: async () => ({ id: 'TENANT_ACTIVATED', body: 'UPDATED SYSTEM' }),
        restoreSystemDefault: async () => ({ id: 'TENANT_ACTIVATED', body: TENANT_ACTIVATED_BODY })
    };
    const asyncRoute = (handler) => (request, response, next) => Promise.resolve(handler(request, response, next)).catch(next);
    registerWhatsappTemplateRoutes(app, { whatsappTemplateService: service, asyncRoute });
    app.use((error, _request, response, _next) => response.status(error.statusCode || 500).json({ code: error.code || 'ERROR' }));
    return { app, overrides };
}

function start(app) {
    return new Promise((resolve) => {
        const server = app.listen(0, '127.0.0.1', () => resolve(server));
    });
}

function call(server, pathname, { method = 'GET', user = 'owner-a', body } = {}) {
    return new Promise((resolve, reject) => {
        const request = http.request({
            host: '127.0.0.1',
            port: server.address().port,
            path: pathname,
            method,
            headers: { 'x-test-user': user, ...(body ? { 'content-type': 'application/json' } : {}) }
        }, (response) => {
            let text = '';
            response.setEncoding('utf8');
            response.on('data', (chunk) => { text += chunk; });
            response.on('end', () => {
                let body = null;
                try { body = text ? JSON.parse(text) : null; } catch (_) { body = null; }
                resolve({ status: response.statusCode, body });
            });
        });
        request.on('error', reject);
        if (body) request.write(JSON.stringify(body));
        request.end();
    });
}

test('direct API enforces tenant context, platform scope, and restore fallback', async (t) => {
    const { app } = createApiHarness();
    const server = await start(app);
    t.after(() => server.close());

    assert.equal((await call(server, '/api/whatsapp-templates/PAYMENT_OUTSTANDING', { method: 'PUT', user: 'owner-a', body: { body: 'TENANT_A {{member_name}}' } })).status, 200);
    assert.equal((await call(server, '/api/whatsapp-templates/PAYMENT_OUTSTANDING?tenantId=202', { user: 'owner-a' })).body.template.body, 'TENANT_A {{member_name}}');
    assert.equal((await call(server, '/api/whatsapp-templates/PAYMENT_OUTSTANDING', { method: 'PUT', user: 'owner-a', body: { tenantId: 202, body: 'TENANT_A_UPDATED {{member_name}}' } })).status, 200);
    assert.equal((await call(server, '/api/whatsapp-templates/PAYMENT_OUTSTANDING', { user: 'owner-b' })).body.template.body, DEFAULT_BODY);
    assert.equal((await call(server, '/api/whatsapp-templates/PAYMENT_OUTSTANDING', { user: 'owner-b' })).body.template.body, DEFAULT_BODY);

    const restore = await call(server, '/api/whatsapp-templates/PAYMENT_OUTSTANDING/restore-default', { method: 'POST', user: 'owner-a' });
    assert.equal(restore.status, 200);
    assert.equal(restore.body.template.isCustomized, false);
    assert.equal((await call(server, '/api/whatsapp-templates/PAYMENT_OUTSTANDING', { user: 'owner-b' })).body.template.body, DEFAULT_BODY);
    assert.equal((await call(server, '/api/whatsapp-templates/PAYMENT_OUTSTANDING', { method: 'DELETE', user: 'owner-a' })).status, 404);
});

test('direct API keeps system defaults platform-only even when a Gym request is tampered', async (t) => {
    const { app } = createApiHarness();
    const server = await start(app);
    t.after(() => server.close());

    const ownerSystemWrite = await call(server, '/api/platform/whatsapp-templates/TENANT_ACTIVATED', { method: 'PUT', user: 'owner-a', body: { body: 'tampered' } });
    assert.equal(ownerSystemWrite.status, 403);
    assert.equal(ownerSystemWrite.body.code, 'PLATFORM_ADMIN_REQUIRED');

    const ownerTenantWrite = await call(server, '/api/whatsapp-templates/TENANT_ACTIVATED', { method: 'PUT', user: 'owner-a', body: { body: 'tampered' } });
    assert.equal(ownerTenantWrite.status, 403);
    assert.equal(ownerTenantWrite.body.code, 'PLATFORM_TEMPLATE');

    const assistantWrite = await call(server, '/api/whatsapp-templates/PAYMENT_OUTSTANDING', { method: 'PUT', user: 'assistant', body: { body: 'tampered' } });
    assert.equal(assistantWrite.status, 403);
    assert.equal(assistantWrite.body.code, 'OWNER_REQUIRED');
    assert.equal((await call(server, '/api/platform/whatsapp-templates', { user: 'owner-a' })).status, 403);
    assert.equal((await call(server, '/api/platform/whatsapp-templates', { user: 'platform' })).status, 200);
});
