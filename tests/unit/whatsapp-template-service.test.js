'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const service = require('../../src/services/whatsapp-template-service');

const expectedIds = [
    'MEMBERSHIP_WELCOME',
    'MEMBERSHIP_FROZEN',
    'MEMBERSHIP_EXPIRED',
    'MEMBERSHIP_EXPIRING',
    'PAYMENT_OUTSTANDING',
    'MEMBER_ABSENCE',
    'DAY_PASS_THANK_YOU',
    'TENANT_ACTIVATED',
    'PORTAL_ACCESS'
];

test('the central catalog contains exactly the nine approved WhatsApp templates', () => {
    assert.deepEqual(service.TEMPLATE_DEFINITIONS.map((item) => item.id), expectedIds);
    for (const definition of service.TEMPLATE_DEFINITIONS) {
        assert.ok(service.DEFAULT_BODIES[definition.id], `${definition.id} has a default body`);
        assert.doesNotThrow(() => service.validateTemplateBody(definition.id, service.DEFAULT_BODIES[definition.id]));
    }
});

test('portal access is independent from membership welcome', () => {
    assert.match(service.DEFAULT_BODIES.MEMBERSHIP_WELCOME, /تم تسجيل اشتراكك/);
    assert.doesNotMatch(service.DEFAULT_BODIES.PORTAL_ACCESS, /تم تسجيل اشتراكك/);
    assert.deepEqual(service.getTemplateDefinition('PORTAL_ACCESS').variables, ['member_name', 'gym_name', 'membership_code', 'portal_url']);
});

test('conditional blocks omit empty optional values without leaving labels behind', () => {
    const welcome = service.renderTemplateText('MEMBERSHIP_WELCOME', service.DEFAULT_BODIES.MEMBERSHIP_WELCOME, {
        member_name: 'أحمد', gym_name: 'Top Gym', plan_name: 'شهري', membership_type: 'شهري',
        start_date: '01/09/2026', expiry_date: '30/09/2026', amount_due: '250', amount_paid: '250', remaining_amount: '', payment_method: 'نقدي'
    });
    assert.doesNotMatch(welcome, /المتبقي:/);

    const dayPass = service.renderTemplateText('DAY_PASS_THANK_YOU', service.DEFAULT_BODIES.DAY_PASS_THANK_YOU, { visitor_name: 'زائر', gym_name: 'Top Gym', visit_reference: '', pass_type: 'يومية' });
    assert.doesNotMatch(dayPass, /رقم الزيارة:/);
    assert.match(dayPass, /نوع الحصة: يومية/);
});

test('template validation is plain text and allowlisted', () => {
    assert.throws(() => service.validateTemplateBody('PORTAL_ACCESS', '{{unknown_key}}'), (error) => error.code === 'WHATSAPP_TEMPLATE_VARIABLE_NOT_ALLOWED');
    assert.throws(() => service.validateTemplateBody('PORTAL_ACCESS', '<script>alert(1)</script>'), (error) => error.code === 'WHATSAPP_TEMPLATE_PLAIN_TEXT_ONLY');
    assert.throws(() => service.validateTemplateBody('PORTAL_ACCESS', '{{#if membership_code}}missing close'), (error) => error.code === 'WHATSAPP_TEMPLATE_SYNTAX_INVALID');
    assert.throws(() => service.validateTemplateBody('PORTAL_ACCESS', '{{#if unknown_key}}x{{/if}}'), (error) => error.code === 'WHATSAPP_TEMPLATE_VARIABLE_NOT_ALLOWED');
});

test('TENANT_ACTIVATED is platform scoped while operational messages are tenant scoped', () => {
    assert.equal(service.getTemplateDefinition('TENANT_ACTIVATED').scope, service.TEMPLATE_SCOPE.PLATFORM);
    for (const id of expectedIds.filter((value) => value !== 'TENANT_ACTIVATED')) {
        assert.equal(service.getTemplateDefinition(id).scope, service.TEMPLATE_SCOPE.TENANT, id);
    }
});

test('missing or inactive system defaults fail closed instead of using a legacy hard-coded fallback', () => {
    const definition = service.getTemplateDefinition('TENANT_ACTIVATED');
    for (const row of [null, {}, { template_id: definition.id, is_active: 0, default_body: 'old' }, { template_id: definition.id, is_active: 1, default_body: '' }]) {
        assert.throws(
            () => service.requireSystemDefaultRow(definition, row),
            (error) => error.code === 'WHATSAPP_TEMPLATE_DEFAULT_MISSING' && error.statusCode === 503
        );
    }
    assert.equal(
        service.requireSystemDefaultRow(definition, { template_id: definition.id, is_active: 1, default_body: 'configured' }),
        'configured'
    );
});

test('platform lookup cannot be used to widen a tenant template into the platform scope', async () => {
    await assert.rejects(
        service.getEffectiveTemplate('PAYMENT_OUTSTANDING', { platform: true }),
        (error) => error.code === 'TENANT_TEMPLATE' && error.statusCode === 403
    );
});
