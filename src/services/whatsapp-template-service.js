'use strict';

const { getPool, sql } = require('../database');
const { withTransaction } = require('../database/transaction');

const MAX_TEMPLATE_LENGTH = 8000;
const TEMPLATE_SCOPE = Object.freeze({ TENANT: 'tenant', PLATFORM: 'platform' });

const TEMPLATE_DEFINITIONS = Object.freeze([
    Object.freeze({ id: 'MEMBERSHIP_WELCOME', name: 'ترحيب الاشتراك', description: 'تُستخدم بعد تسجيل العضو ونجاح إنشاء اشتراكه.', category: 'الاشتراكات', scope: TEMPLATE_SCOPE.TENANT, variables: ['member_name', 'gym_name', 'plan_name', 'membership_type', 'start_date', 'expiry_date', 'list_price', 'discount_amount', 'amount_due', 'amount_paid', 'remaining_amount', 'payment_method'] }),
    Object.freeze({ id: 'MEMBERSHIP_FROZEN', name: 'الاشتراك المجمد', description: 'تُستخدم لإبلاغ العضو بتجميد اشتراكه.', category: 'الاشتراكات', scope: TEMPLATE_SCOPE.TENANT, variables: ['member_name', 'gym_name', 'freeze_until'] }),
    Object.freeze({ id: 'MEMBERSHIP_EXPIRED', name: 'انتهاء الاشتراك', description: 'تُستخدم عند انتهاء العضوية الحالية.', category: 'الاشتراكات', scope: TEMPLATE_SCOPE.TENANT, variables: ['member_name', 'gym_name', 'expiry_date'] }),
    Object.freeze({ id: 'MEMBERSHIP_EXPIRING', name: 'قرب انتهاء الاشتراك', description: 'تُستخدم لتذكير العضو قبل انتهاء الاشتراك.', category: 'الاشتراكات', scope: TEMPLATE_SCOPE.TENANT, variables: ['member_name', 'gym_name', 'expiry_date', 'days_remaining'] }),
    Object.freeze({ id: 'PAYMENT_OUTSTANDING', name: 'المبلغ المتبقي', description: 'تُستخدم لتذكير العضو بالمبلغ المستحق.', category: 'المدفوعات', scope: TEMPLATE_SCOPE.TENANT, variables: ['member_name', 'gym_name', 'remaining_amount', 'expiry_date'] }),
    Object.freeze({ id: 'MEMBER_ABSENCE', name: 'الغياب الطويل', description: 'تُستخدم للتواصل مع العضو الغائب لفترة طويلة.', category: 'التواصل', scope: TEMPLATE_SCOPE.TENANT, variables: ['member_name', 'gym_name', 'days_since_last_visit', 'expiry_date'] }),
    Object.freeze({ id: 'DAY_PASS_THANK_YOU', name: 'شكر الحصة اليومية', description: 'تُستخدم بعد تسجيل الحصة اليومية.', category: 'الحصص اليومية', scope: TEMPLATE_SCOPE.TENANT, variables: ['visitor_name', 'gym_name', 'visit_reference', 'pass_type'] }),
    Object.freeze({ id: 'TENANT_ACTIVATED', name: 'تفعيل الحساب', description: 'تُستخدم من إدارة المنصة عند تفعيل Gym أو Independent Trainer.', category: 'المنصة', scope: TEMPLATE_SCOPE.PLATFORM, variables: ['tenant_type', 'gym_name', 'plan_name', 'start_date', 'expiry_date', 'login_url', 'username', 'temporary_password'] }),
    Object.freeze({ id: 'PORTAL_ACCESS', name: 'بيانات بوابة المشترك', description: 'تُستخدم لإرسال أو إعادة إرسال كود ورابط بوابة المشترك.', category: 'بوابة المشترك', scope: TEMPLATE_SCOPE.TENANT, variables: ['member_name', 'gym_name', 'membership_code', 'portal_url'] })
]);

const DEFAULT_BODIES = Object.freeze({
    MEMBERSHIP_WELCOME: 'السلام عليكم يا {{member_name}} 👋\n\nأهلًا بك في {{gym_name}}، تم تسجيل اشتراكك بنجاح.\n\nالباقة: {{plan_name}}\nنوع الاشتراك: {{membership_type}}\nتاريخ البداية: {{start_date}}\nتاريخ الانتهاء: {{expiry_date}}\n\n{{#if amount_due}}المستحق: {{amount_due}}\n{{/if}}{{#if amount_paid}}المدفوع: {{amount_paid}}\n{{/if}}{{#if remaining_amount}}المتبقي: {{remaining_amount}}\n{{/if}}نتمنى لك تجربة تدريب موفقة 💪',
    MEMBERSHIP_FROZEN: 'السلام عليكم يا {{member_name}} 👋\n\nتم تجميد اشتراكك في {{gym_name}} حتى تاريخ:\n{{freeze_until}}\n\nيسعدنا عودتك قريبًا 💙',
    MEMBERSHIP_EXPIRED: 'السلام عليكم يا {{member_name}} 👋\n\nنحيطك علمًا بأن اشتراكك في {{gym_name}} انتهى بتاريخ:\n{{expiry_date}}\n\nيسعدنا تجديد اشتراكك واستقبالك من جديد 💪',
    MEMBERSHIP_EXPIRING: 'السلام عليكم يا {{member_name}} 👋\n\nاشتراكك في {{gym_name}} يقترب من الانتهاء بتاريخ {{expiry_date}}.\n{{#if days_remaining}}متبقي {{days_remaining}} يومًا.\n{{/if}}يسعدنا مساعدتك في التجديد 💙',
    PAYMENT_OUTSTANDING: 'السلام عليكم يا {{member_name}} 👋\n\nيوجد مبلغ متبقٍ على اشتراكك في {{gym_name}} بقيمة: {{remaining_amount}}\n{{#if expiry_date}}الاشتراك مستمر حتى: {{expiry_date}}\n{{/if}}نرجو مراجعة الإدارة لاستكمال السداد.\nشكرًا لك 💙',
    MEMBER_ABSENCE: 'السلام عليكم يا {{member_name}} 👋\n\nافتقدناك في {{gym_name}}.\n{{#if days_since_last_visit}}مرّ {{days_since_last_visit}} يومًا منذ آخر زيارة.\n{{/if}}نتمنى رؤيتك قريبًا ونكمل تمرينك معًا 💪',
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

function mapTemplateRow(row, definition, body, isCustomized = false) {
    return {
        id: definition.id,
        name: definition.name,
        description: definition.description,
        category: definition.category,
        scope: definition.scope,
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
    const pool = await getPool();
    const result = await pool.request().input('tenantId', sql.Int, normalizedTenantId).query(`
        SELECT d.template_id, d.default_body, d.is_active AS default_active, d.updated_at AS default_updated_at,
               o.body AS override_body, o.is_active AS override_active, o.updated_at AS override_updated_at
        FROM dbo.whatsapp_message_templates AS d
        LEFT JOIN dbo.gym_whatsapp_template_overrides AS o
          ON o.template_id = d.template_id AND o.tenant_id = @tenantId
        WHERE d.is_active = 1
        ORDER BY d.template_id;
    `);
    return TEMPLATE_DEFINITIONS.map((definition) => {
        const row = result.recordset.find((item) => String(item.template_id) === definition.id);
        const isTenantTemplate = definition.scope === TEMPLATE_SCOPE.TENANT;
        const systemBody = requireSystemDefaultRow(definition, row && {
            template_id: row.template_id,
            default_body: row.default_body,
            is_active: row.default_active
        });
        return mapTemplateRow(row, definition, isTenantTemplate && row?.override_active ? row.override_body : systemBody, Boolean(isTenantTemplate && row?.override_active));
    });
}

async function listSystemTemplates() {
    const pool = await getPool();
    const result = await pool.request().query(`
        SELECT template_id, default_body, is_active, updated_at
        FROM dbo.whatsapp_message_templates
        WHERE is_active = 1
        ORDER BY template_id;
    `);
    return TEMPLATE_DEFINITIONS.filter((definition) => definition.scope === TEMPLATE_SCOPE.PLATFORM).map((definition) => {
        const row = result.recordset.find((item) => String(item.template_id) === definition.id);
        return mapTemplateRow(row, definition, requireSystemDefaultRow(definition, row), false);
    });
}

async function getEffectiveTemplate(templateId, { tenantId = null, platform = false } = {}) {
    const definition = getTemplateDefinition(templateId);
    if (platform && definition.scope !== TEMPLATE_SCOPE.PLATFORM) {
        throw templateError('هذا القالب خاص بالجيم ولا يتم الوصول إليه من نطاق المنصة.', 403, 'TENANT_TEMPLATE');
    }
    if (definition.scope === TEMPLATE_SCOPE.PLATFORM) {
        const pool = await getPool();
        const result = await pool.request().input('templateId', sql.VarChar(64), definition.id).query(`
            SELECT TOP (1) template_id, default_body, is_active, updated_at
            FROM dbo.whatsapp_message_templates
            WHERE template_id = @templateId AND is_active = 1;
        `);
        const row = result.recordset[0];
        return mapTemplateRow(row, definition, requireSystemDefaultRow(definition, row), false);
    }
    const normalizedTenantId = Number(tenantId);
    if (!Number.isInteger(normalizedTenantId) || normalizedTenantId < 1) throw templateError('Tenant context is required.', 403, 'TENANT_CONTEXT_REQUIRED');
    const pool = await getPool();
    const result = await pool.request()
        .input('tenantId', sql.Int, normalizedTenantId)
        .input('templateId', sql.VarChar(64), definition.id)
        .query(`
            SELECT TOP (1) d.template_id, d.default_body, d.is_active AS default_active, d.updated_at AS default_updated_at,
                   o.body AS override_body, o.is_active AS override_active, o.updated_at AS override_updated_at
            FROM dbo.whatsapp_message_templates AS d
            LEFT JOIN dbo.gym_whatsapp_template_overrides AS o
              ON o.template_id = d.template_id AND o.tenant_id = @tenantId
            WHERE d.template_id = @templateId AND d.is_active = 1;
    `);
    const row = result.recordset[0];
    const systemBody = requireSystemDefaultRow(definition, row && {
        template_id: row.template_id,
        default_body: row.default_body,
        is_active: row.default_active
    });
    return mapTemplateRow(row, definition, row?.override_active ? row.override_body : systemBody, Boolean(row?.override_active));
}

async function saveTenantOverride(templateId, body, { tenantId, userId = null } = {}) {
    const definition = getTemplateDefinition(templateId);
    if (definition.scope !== TEMPLATE_SCOPE.TENANT) throw templateError('هذا القالب تتم إدارته من منصة Logic Fit فقط.', 403, 'PLATFORM_TEMPLATE');
    const normalizedTenantId = Number(tenantId);
    const normalizedBody = validateTemplateBody(definition.id, body);
    if (!Number.isInteger(normalizedTenantId) || normalizedTenantId < 1) throw templateError('Tenant context is required.', 403, 'TENANT_CONTEXT_REQUIRED');
    await withTransaction(async (transaction) => {
        await transaction.request()
            .input('tenantId', sql.Int, normalizedTenantId)
            .input('templateId', sql.VarChar(64), definition.id)
            .input('body', sql.NVarChar(sql.MAX), normalizedBody)
            .input('userId', sql.Int, Number.isInteger(Number(userId)) ? Number(userId) : null)
            .query(`
                MERGE dbo.gym_whatsapp_template_overrides WITH (HOLDLOCK) AS target
                USING (SELECT @tenantId AS tenant_id, @templateId AS template_id) AS source
                  ON target.tenant_id = source.tenant_id AND target.template_id = source.template_id
                WHEN MATCHED THEN UPDATE SET body=@body, is_active=1, updated_by_user_id=@userId, updated_at=SYSUTCDATETIME()
                WHEN NOT MATCHED THEN INSERT (tenant_id, template_id, body, is_active, updated_by_user_id)
                    VALUES (@tenantId, @templateId, @body, 1, @userId);
            `);
    });
    return getEffectiveTemplate(definition.id, { tenantId: normalizedTenantId });
}

async function restoreTenantDefault(templateId, { tenantId } = {}) {
    const definition = getTemplateDefinition(templateId);
    if (definition.scope !== TEMPLATE_SCOPE.TENANT) throw templateError('هذا القالب تتم إدارته من منصة Logic Fit فقط.', 403, 'PLATFORM_TEMPLATE');
    const normalizedTenantId = Number(tenantId);
    if (!Number.isInteger(normalizedTenantId) || normalizedTenantId < 1) throw templateError('Tenant context is required.', 403, 'TENANT_CONTEXT_REQUIRED');
    const pool = await getPool();
    await pool.request().input('tenantId', sql.Int, normalizedTenantId).input('templateId', sql.VarChar(64), definition.id).query(`
        UPDATE dbo.gym_whatsapp_template_overrides
        SET is_active=0, updated_at=SYSUTCDATETIME()
        WHERE tenant_id=@tenantId AND template_id=@templateId;
    `);
    return getEffectiveTemplate(definition.id, { tenantId: normalizedTenantId });
}

async function saveSystemDefault(templateId, body, { userId = null } = {}) {
    const definition = getTemplateDefinition(templateId);
    if (definition.scope !== TEMPLATE_SCOPE.PLATFORM) throw templateError('هذا القالب خاص بالجيم ولا يتم تعديله من هنا.', 403, 'TENANT_TEMPLATE');
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
    if (definition.scope !== TEMPLATE_SCOPE.PLATFORM) throw templateError('هذا القالب خاص بالجيم ولا يتم تعديله من هنا.', 403, 'TENANT_TEMPLATE');
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
