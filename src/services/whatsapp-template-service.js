'use strict';

const { getPool, sql } = require('../database');

const MAX_TEMPLATE_LENGTH = 8000;
const TEMPLATE_SCOPE = Object.freeze({ TENANT: 'tenant', PLATFORM: 'platform' });

const TEMPLATE_DEFINITIONS = Object.freeze([
    Object.freeze({ id: 'MEMBERSHIP_WELCOME', name: 'ترحيب الاشتراك', description: 'تُستخدم بعد تسجيل العضو ونجاح إنشاء اشتراكه.', category: 'الاشتراكات', scope: TEMPLATE_SCOPE.PLATFORM, variables: ['member_name', 'gym_name', 'plan_name', 'membership_type', 'start_date', 'expiry_date', 'base_price', 'list_price', 'discount_amount', 'amount_due', 'amount_paid', 'remaining_amount', 'payment_method', 'portal_code', 'membership_code', 'portal_url'] }),
    Object.freeze({ id: 'MEMBERSHIP_FROZEN', name: 'الاشتراك المجمد', description: 'تُستخدم لإبلاغ العضو بتجميد اشتراكه.', category: 'الاشتراكات', scope: TEMPLATE_SCOPE.PLATFORM, variables: ['member_name', 'gym_name', 'freeze_until'] }),
    Object.freeze({ id: 'MEMBERSHIP_EXPIRED', name: 'انتهاء الاشتراك', description: 'تُستخدم عند انتهاء العضوية الحالية.', category: 'الاشتراكات', scope: TEMPLATE_SCOPE.PLATFORM, variables: ['member_name', 'gym_name', 'expiry_date'] }),
    Object.freeze({ id: 'MEMBERSHIP_EXPIRING', name: 'قرب انتهاء الاشتراك', description: 'تُستخدم لتذكير العضو قبل انتهاء الاشتراك.', category: 'الاشتراكات', scope: TEMPLATE_SCOPE.PLATFORM, variables: ['member_name', 'gym_name', 'expiry_date', 'days_remaining'] }),
    Object.freeze({ id: 'PAYMENT_OUTSTANDING', name: 'المبلغ المتبقي', description: 'تُستخدم لتذكير العضو بالمبلغ المستحق.', category: 'المدفوعات', scope: TEMPLATE_SCOPE.PLATFORM, variables: ['member_name', 'gym_name', 'remaining_amount', 'expiry_date'] }),
    Object.freeze({ id: 'MEMBER_ABSENCE', name: 'الغياب الطويل', description: 'تُستخدم للتواصل مع العضو الغائب لفترة طويلة.', category: 'التواصل', scope: TEMPLATE_SCOPE.PLATFORM, variables: ['member_name', 'gym_name', 'days_since_last_visit', 'expiry_date'] }),
    Object.freeze({ id: 'DAY_PASS_THANK_YOU', name: 'شكر الحصة اليومية', description: 'تُستخدم بعد تسجيل الحصة اليومية.', category: 'الحصص اليومية', scope: TEMPLATE_SCOPE.PLATFORM, variables: ['visitor_name', 'gym_name', 'visit_reference', 'pass_type'] }),
    Object.freeze({ id: 'TENANT_ACTIVATED', name: 'تفعيل الحساب', description: 'تُستخدم من إدارة المنصة عند تفعيل Gym أو Independent Trainer.', category: 'المنصة', scope: TEMPLATE_SCOPE.PLATFORM, variables: ['tenant_type', 'gym_name', 'plan_name', 'start_date', 'expiry_date', 'login_url', 'username', 'temporary_password'] }),
    Object.freeze({ id: 'PORTAL_ACCESS', name: 'بيانات بوابة المشترك', description: 'تُستخدم لإرسال أو إعادة إرسال كود ورابط بوابة المشترك.', category: 'بوابة المشترك', scope: TEMPLATE_SCOPE.PLATFORM, variables: ['member_name', 'gym_name', 'membership_code', 'portal_url'] })
]);

const DEFAULT_BODIES = Object.freeze({
    MEMBERSHIP_WELCOME: 'السلام عليكم يا *{{member_name}}* 👋\n\nمبروك يا بطل 🎉\nتم تسجيل اشتراكك في *{{gym_name}}* بنجاح ✅\n\n*تفاصيل اشتراكك*\n• الباقة: *{{plan_name}}*\n• النوع: *{{membership_type}}*\n• البداية: *{{start_date}}*\n• الانتهاء: *{{expiry_date}}*\n\n*ملخص الحساب*\n• السعر الأساسي: *{{base_price}}*\n• الخصم: *{{discount_amount}}*\n• المستحق: *{{amount_due}}*\n• المدفوع: *{{amount_paid}}*\n{{#if remaining_amount}}• المتبقي: *{{remaining_amount}}*\n{{/if}}• طريقة الدفع: *{{payment_method}}*\n\n{{#if portal_code}}*كود العضوية الخاص بك لبوابة المشترك:*\n*{{portal_code}}*\n\n*رابط بوابة المشترك:*\n{{portal_url}}\n\nلا تشارك الكود مع أي شخص.\n\n{{/if}}مبسوطين إنك بقيت جزء من *{{gym_name}}* ❤️\nمستنيينك تبدأ بقوة،\nوإحنا معاك خطوة بخطوة\nلحد ما توصل لهدفك.',
    MEMBERSHIP_FROZEN: 'السلام عليكم يا *{{member_name}}* 👋\n\nاشتراكك متجمّد لحد:\n{{#if freeze_until}}*{{freeze_until}}*\n{{/if}}ياريت تراجع الإدارة لو محتاج أي تفاصيل.\n\nمستنيينك ترجع تكمل تمرينك معانا ❤️',
    MEMBERSHIP_EXPIRED: 'السلام عليكم يا *{{member_name}}* 👋\n\nحبيت أنبهك إن اشتراكك في\n*{{gym_name}}* انتهى بتاريخ:\n\n{{#if expiry_date}}*{{expiry_date}}*\n{{/if}}ياريت تمر علينا في الإدارة\nلتجديد الاشتراك والرجوع\nللتمرين من جديد.\n\nمكانك معانا موجود\nومستنيين نشوفك راجع بقوة\n\nوجودك في *{{gym_name}}* بيفرق معانا ❤️',
    MEMBERSHIP_EXPIRING: 'السلام عليكم يا *{{member_name}}* 👋\n\nحبيت أفكرك إن اشتراكك في\n*{{gym_name}}* هينتهي يوم:\n\n{{#if expiry_date}}*{{expiry_date}}*\n{{/if}}{{#if days_remaining}}متبقي {{days_remaining}} يومًا.\n{{/if}}ياريت تعدّي علينا في الإدارة\nلتجديد الاشتراك واستمرار تمرينك\nمن غير انقطاع.\n\nمستنيينك تكمل معانا يا بطل\nولسه قدامنا أهداف نحققها سوا\n\n*{{gym_name}}* ❤️',
    PAYMENT_OUTSTANDING: 'السلام عليكم يا *{{member_name}}* 👋\n\nبنحب نفكرك إن فيه مبلغ متبقي\nعلى اشتراكك بقيمة:\n\n*{{remaining_amount}}*\n\n{{#if expiry_date}}واشتراكك مستمر لحد:\n*{{expiry_date}}*\n\n{{/if}}ياريت تعدّي علينا في الإدارة\nلاستكمال السداد وتنظيم حسابك.\n\nمستنيينك في الجيم يا بطل\nوجودك وتمرينك معانا مهم،\nولسه عندنا أهداف نكملها سوا\n\nشكرًا إنك جزء من *{{gym_name}}* ❤️',
    MEMBER_ABSENCE: 'السلام عليكم يا *{{member_name}}* 👋\n\nبقالنا فترة مشوفناكش في الجيم\n\nاشتراكك لسه مستمر لحد:\n{{#if expiry_date}}*{{expiry_date}}*\n{{/if}}ومستنيين نشوفك راجع تتمرن\nمعانا قريب.\n\n{{#if days_since_last_visit}}مرّ {{days_since_last_visit}} يومًا منذ آخر زيارة.\n\n{{/if}}الجيم من غيرك ناقصه حماس\nيلا نرجع نكمل على هدفك سوا ❤️\n\n*{{gym_name}}*',
    DAY_PASS_THANK_YOU: 'أهلًا {{visitor_name}} 👋\n\nشكرًا لحضورك اليوم في {{gym_name}}، نورتنا جدًا 💙\n\n{{#if visit_reference}}رقم الزيارة: {{visit_reference}}\n{{/if}}{{#if pass_type}}نوع الحصة: {{pass_type}}\n{{/if}}نتمنى نشوفك دائمًا 💪',
    TENANT_ACTIVATED: 'مرحبًا بك في Logic Fit 👋\n\nتم تفعيل حساب {{tenant_type}} بنجاح.\n\nالاسم: {{gym_name}}\n{{#if plan_name}}الباقة: {{plan_name}}\n{{/if}}{{#if start_date}}تاريخ البداية: {{start_date}}\n{{/if}}{{#if expiry_date}}تاريخ الانتهاء: {{expiry_date}}\n{{/if}}\nرابط تسجيل الدخول: {{login_url}}\n\nاسم المستخدم: {{username}}\n{{#if temporary_password}}كلمة المرور المؤقتة: {{temporary_password}}\n\nيرجى تغيير كلمة المرور بعد أول تسجيل دخول.{{/if}}',
    PORTAL_ACCESS: 'السلام عليكم يا {{member_name}} 👋\n\nدي بيانات الدخول الخاصة ببوابة المشترك في {{gym_name}}:\n\nكود العضوية: {{membership_code}}\n\nرابط البوابة: {{portal_url}}\n\nاحتفظ بالكود لنفسك ولا تشاركه مع أي شخص.'
});

const DEFINITIONS_BY_ID = new Map(TEMPLATE_DEFINITIONS.map((definition) => [definition.id, definition]));

function templateError(message, statusCode = 400, code = 'INVALID_WHATSAPP_TEMPLATE') {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.expose = true;
    error.code = code;
    return error;
}

function requireSystemDefaultRow(definition, row) {
    const rowId = String(row?.template_id || '').trim().toUpperCase();
    if (rowId !== definition.id || row?.is_active === false || row?.is_active === 0 || !String(row?.default_body || '').trim()) {
        throw templateError(`System default is missing or inactive for ${definition.id}.`, 503, 'WHATSAPP_TEMPLATE_DEFAULT_MISSING');
    }
    return String(row.default_body);
}

function getTemplateDefinition(templateId) {
    const definition = DEFINITIONS_BY_ID.get(String(templateId || '').trim().toUpperCase());
    if (!definition) throw templateError('قالب الرسالة غير معروف.', 404, 'WHATSAPP_TEMPLATE_NOT_FOUND');
    return definition;
}

function validateTemplateBody(templateId, body) {
    const definition = getTemplateDefinition(templateId);
    const text = String(body ?? '');
    if (!text.trim()) throw templateError('نص الرسالة لا يمكن أن يكون فارغًا.', 400, 'WHATSAPP_TEMPLATE_BODY_REQUIRED');
    if (text.length > MAX_TEMPLATE_LENGTH) throw templateError(`الحد الأقصى لنص الرسالة ${MAX_TEMPLATE_LENGTH} حرف.`, 400, 'WHATSAPP_TEMPLATE_BODY_TOO_LONG');
    if (/<[^>]*>|javascript\s*:|data\s*:/iu.test(text)) throw templateError('نص الرسالة يجب أن يكون نصًا عاديًا بدون HTML أو روابط برمجية.', 400, 'WHATSAPP_TEMPLATE_PLAIN_TEXT_ONLY');

    const allowed = new Set(definition.variables);
    const conditionalPattern = /\{\{#if\s+([a-z][a-z0-9_]*)\s*\}\}([\s\S]*?)\{\{\/if\s*\}\}/gi;
    let conditionalCount = 0;
    const withoutConditionals = text.replace(conditionalPattern, (_match, key, content) => {
        conditionalCount += 1;
        if (!allowed.has(key)) throw templateError(`المتغير ${key} غير متاح لهذا القالب.`, 400, 'WHATSAPP_TEMPLATE_VARIABLE_NOT_ALLOWED');
        if (/\{\{#if\b|\{\{\/if\b/iu.test(content)) throw templateError('لا يمكن تداخل الشروط داخل القالب.', 400, 'WHATSAPP_TEMPLATE_NESTED_CONDITIONAL');
        return content;
    });
    if (conditionalCount === 0 && /\{\{#if\b|\{\{\/if\b/iu.test(text)) throw templateError('صيغة الشرط غير مكتملة.', 400, 'WHATSAPP_TEMPLATE_SYNTAX_INVALID');
    const tokens = withoutConditionals.match(/\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/gi) || [];
    for (const token of tokens) {
        const key = token.replace(/\{\{|\}\}/g, '').trim();
        if (!allowed.has(key)) throw templateError(`المتغير ${key} غير متاح لهذا القالب.`, 400, 'WHATSAPP_TEMPLATE_VARIABLE_NOT_ALLOWED');
    }
    if (/\{\{[^}]*$/u.test(withoutConditionals) || /\}\}/u.test(withoutConditionals.replace(/\{\{\s*[a-z][a-z0-9_]*\s*\}\}/gi, ''))) {
        throw templateError('صيغة المتغيرات غير صحيحة.', 400, 'WHATSAPP_TEMPLATE_SYNTAX_INVALID');
    }
    return text;
}

function renderTemplateText(templateId, body, context = {}) {
    const definition = getTemplateDefinition(templateId);
    const validatedBody = validateTemplateBody(definition.id, body);
    const safeContext = Object.fromEntries(definition.variables.map((key) => [key, String(context?.[key] ?? '').trim()]));
    const expanded = validatedBody.replace(/\{\{#if\s+([a-z][a-z0-9_]*)\s*\}\}([\s\S]*?)\{\{\/if\s*\}\}/gi, (_match, key, content) => safeContext[key] ? content : '');
    return expanded.replace(/\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/gi, (_match, key) => safeContext[key] ?? '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function mapTemplateRow(row, definition, body, isCustomized = false, scope = definition.scope) {
    return {
        id: definition.id,
        name: definition.name,
        description: definition.description,
        category: definition.category,
        scope,
        variables: [...definition.variables],
        body: String(body ?? ''),
        isCustomized: Boolean(isCustomized),
        isActive: row?.is_active === undefined ? true : Boolean(row.is_active),
        updatedAt: row?.updated_at || null
    };
}

async function listTenantTemplates(tenantId) {
    const normalizedTenantId = Number(tenantId);
    if (!Number.isInteger(normalizedTenantId) || normalizedTenantId < 1) throw templateError('Tenant context is required.', 403, 'TENANT_CONTEXT_REQUIRED');
    // Compatibility boundary for old operational callers. Tenant overrides
    // remain stored for historical/audit purposes, but are no longer a
    // source of truth for rendered WhatsApp messages.
    return (await listSystemTemplates()).map((template) => ({
        ...template,
        scope: DEFINITIONS_BY_ID.get(template.id)?.scope || TEMPLATE_SCOPE.TENANT,
        isCustomized: false
    }));
}

async function listSystemTemplates() {
    const pool = await getPool();
    const result = await pool.request().query(`
        SELECT template_id, default_body, is_active, updated_at
        FROM dbo.whatsapp_message_templates
        WHERE is_active = 1
        ORDER BY template_id;
    `);
    return TEMPLATE_DEFINITIONS.map((definition) => {
        const row = result.recordset.find((item) => String(item.template_id) === definition.id);
        return mapTemplateRow(row, definition, requireSystemDefaultRow(definition, row), false, TEMPLATE_SCOPE.PLATFORM);
    });
}

async function getEffectiveTemplate(templateId, { tenantId = null, platform = false } = {}) {
    const definition = getTemplateDefinition(templateId);
    const pool = await getPool();
    const result = await pool.request()
        .input('templateId', sql.VarChar(64), definition.id)
        .query(`
            SELECT TOP (1) template_id, default_body, is_active, updated_at
            FROM dbo.whatsapp_message_templates
            WHERE template_id = @templateId AND is_active = 1;
    `);
    const row = result.recordset[0];
    return mapTemplateRow(row, definition, requireSystemDefaultRow(definition, row), false, platform ? TEMPLATE_SCOPE.PLATFORM : definition.scope);
}

async function saveTenantOverride(templateId, body, { tenantId, userId = null } = {}) {
    void body; void tenantId; void userId;
    throw templateError('قوالب WhatsApp تدار مركزيًا من منصة Logic Fit فقط.', 403, 'PLATFORM_TEMPLATES_ONLY');
}

async function restoreTenantDefault(templateId, { tenantId } = {}) {
    void templateId; void tenantId;
    throw templateError('قوالب WhatsApp تدار مركزيًا من منصة Logic Fit فقط.', 403, 'PLATFORM_TEMPLATES_ONLY');
}

async function saveSystemDefault(templateId, body, { userId = null } = {}) {
    const definition = getTemplateDefinition(templateId);
    const normalizedBody = validateTemplateBody(definition.id, body);
    const pool = await getPool();
    await pool.request().input('templateId', sql.VarChar(64), definition.id).input('body', sql.NVarChar(sql.MAX), normalizedBody).input('userId', sql.Int, Number.isInteger(Number(userId)) ? Number(userId) : null).query(`
        UPDATE dbo.whatsapp_message_templates
        SET default_body=@body, updated_by_user_id=@userId, updated_at=SYSUTCDATETIME()
        WHERE template_id=@templateId AND is_active=1;
    `);
    return getEffectiveTemplate(definition.id, { platform: true });
}

async function restoreSystemDefault(templateId) {
    const definition = getTemplateDefinition(templateId);
    const pool = await getPool();
    await pool.request().input('templateId', sql.VarChar(64), definition.id).input('body', sql.NVarChar(sql.MAX), DEFAULT_BODIES[definition.id]).query(`
        UPDATE dbo.whatsapp_message_templates
        SET default_body=@body, updated_at=SYSUTCDATETIME()
        WHERE template_id=@templateId AND is_active=1;
    `);
    return getEffectiveTemplate(definition.id, { platform: true });
}

async function renderTemplate({ templateId, tenantId = null, platform = false, context = {} } = {}) {
    const template = await getEffectiveTemplate(templateId, { tenantId, platform });
    return renderTemplateText(template.id, template.body, context);
}

module.exports = {
    DEFAULT_BODIES,
    MAX_TEMPLATE_LENGTH,
    TEMPLATE_DEFINITIONS,
    TEMPLATE_SCOPE,
    getEffectiveTemplate,
    getTemplateDefinition,
    listSystemTemplates,
    listTenantTemplates,
    renderTemplate,
    renderTemplateText,
    restoreSystemDefault,
    restoreTenantDefault,
    saveSystemDefault,
    saveTenantOverride,
    requireSystemDefaultRow,
    validateTemplateBody
};
