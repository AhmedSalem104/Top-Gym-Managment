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

test('welcome default preserves the rich legacy data contract without the decorative frame', () => {
    const definition = service.getTemplateDefinition('MEMBERSHIP_WELCOME');
    for (const key of ['base_price', 'discount_amount', 'amount_due', 'amount_paid', 'remaining_amount', 'payment_method', 'portal_code', 'portal_url']) {
        assert.ok(definition.variables.includes(key), `${key} is allowlisted for welcome`);
        assert.match(service.DEFAULT_BODIES.MEMBERSHIP_WELCOME, new RegExp(`\\{\\{${key}\\}\\}`));
    }
    assert.match(service.DEFAULT_BODIES.MEMBERSHIP_WELCOME, /تفاصيل اشتراكك/);
    assert.match(service.DEFAULT_BODIES.MEMBERSHIP_WELCOME, /ملخص الحساب/);
    assert.match(service.DEFAULT_BODIES.MEMBERSHIP_WELCOME, /✅/u);
    assert.doesNotMatch(service.DEFAULT_BODIES.MEMBERSHIP_WELCOME, /[╭│├╰╯]/u);
});

test('rich welcome rendering keeps zero discount and hides only an empty remaining balance', () => {
    const body = service.DEFAULT_BODIES.MEMBERSHIP_WELCOME;
    const rendered = service.renderTemplateText('MEMBERSHIP_WELCOME', body, {
        member_name: 'أحمد', gym_name: 'Top Gym', plan_name: 'جيم', membership_type: 'شهرية',
        start_date: '١٤/٠٩/٢٠٢٦', expiry_date: '١٣/١٠/٢٠٢٦', base_price: '٣٥٠٫٠٠ ج.م',
        discount_amount: '٠٫٠٠ ج.م', amount_due: '٣٥٠٫٠٠ ج.م', amount_paid: '٣٥٠٫٠٠ ج.م',
        remaining_amount: '', payment_method: 'نقدي', portal_code: 'TG-QA-CODE', portal_url: 'https://example.test/member-portal'
    });
    assert.match(rendered, /السعر الأساسي: \*٣٥٠٫٠٠ ج\.م\*/u);
    assert.match(rendered, /الخصم: \*٠٫٠٠ ج\.م\*/u);
    assert.match(rendered, /المدفوع: \*٣٥٠٫٠٠ ج\.م\*/u);
    assert.doesNotMatch(rendered, /المتبقي:/u);
    assert.match(rendered, /TG-QA-CODE/u);
    assert.match(rendered, /https:\/\/example\.test\/member-portal/u);
    assert.match(rendered, /✅/u);
});

test('operational legacy content is preserved in central defaults without ASCII frames', () => {
    const expectedSections = {
        MEMBERSHIP_FROZEN: ['اشتراكك متجمّد', 'مستنيينك ترجع'],
        MEMBERSHIP_EXPIRED: ['انتهى بتاريخ', 'مكانك معانا موجود'],
        MEMBERSHIP_EXPIRING: ['هينتهي يوم', 'استمرار تمرينك'],
        PAYMENT_OUTSTANDING: ['مبلغ متبقي', 'استكمال السداد'],
        MEMBER_ABSENCE: ['مشوفناكش في الجيم', 'ناقصه حماس'],
        DAY_PASS_THANK_YOU: ['شكرًا لحضورك اليوم', 'رقم الزيارة'],
        TENANT_ACTIVATED: ['تم تفعيل حساب', 'رابط تسجيل الدخول'],
        PORTAL_ACCESS: ['بيانات الدخول الخاصة ببوابة المشترك', 'رابط البوابة']
    };
    for (const [templateId, sections] of Object.entries(expectedSections)) {
        const body = service.DEFAULT_BODIES[templateId];
        assert.ok(body, `${templateId} has a system default`);
        assert.doesNotMatch(body, /[╭│├╰╯]/u, `${templateId} has no decorative frame`);
        for (const section of sections) assert.match(body, new RegExp(section), `${templateId} keeps ${section}`);
    }
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

test('all templates are centrally managed system templates', () => {
    for (const id of expectedIds) assert.equal(service.getTemplateDefinition(id).scope, service.TEMPLATE_SCOPE.PLATFORM, id);
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

test('tenant overrides are an explicit disabled compatibility boundary', async () => {
    await assert.rejects(service.saveTenantOverride('PAYMENT_OUTSTANDING', 'x', { tenantId: 101 }), (error) => error.code === 'PLATFORM_TEMPLATES_ONLY');
    await assert.rejects(service.restoreTenantDefault('PAYMENT_OUTSTANDING', { tenantId: 101 }), (error) => error.code === 'PLATFORM_TEMPLATES_ONLY');
});
