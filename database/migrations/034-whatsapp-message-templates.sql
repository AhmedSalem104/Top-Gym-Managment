/*
  Central WhatsApp message templates.

  System defaults are platform-owned and tenant overrides are tenant-scoped.
  The current WhatsApp behavior remains click-to-open/manual-send; this
  migration only stores editable text and its metadata.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.whatsapp_message_templates', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.whatsapp_message_templates (
        template_id VARCHAR(64) NOT NULL CONSTRAINT PK_whatsapp_message_templates PRIMARY KEY,
        name NVARCHAR(160) NOT NULL,
        description NVARCHAR(500) NOT NULL,
        category NVARCHAR(80) NOT NULL,
        scope VARCHAR(20) NOT NULL CONSTRAINT DF_whatsapp_message_templates_scope DEFAULT ('tenant'),
        default_body NVARCHAR(MAX) NOT NULL,
        is_active BIT NOT NULL CONSTRAINT DF_whatsapp_message_templates_active DEFAULT (1),
        updated_by_user_id INT NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_whatsapp_message_templates_created DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_whatsapp_message_templates_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT CK_whatsapp_message_templates_scope CHECK (scope IN ('tenant', 'platform')),
        CONSTRAINT CK_whatsapp_message_templates_body_nonempty CHECK (LEN(LTRIM(RTRIM(default_body))) > 0)
    );
END;

IF OBJECT_ID(N'dbo.gym_whatsapp_template_overrides', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_whatsapp_template_overrides (
        tenant_id INT NOT NULL,
        template_id VARCHAR(64) NOT NULL,
        body NVARCHAR(MAX) NOT NULL,
        is_active BIT NOT NULL CONSTRAINT DF_gym_whatsapp_template_overrides_active DEFAULT (1),
        updated_by_user_id INT NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_whatsapp_template_overrides_created DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_whatsapp_template_overrides_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT PK_gym_whatsapp_template_overrides PRIMARY KEY (tenant_id, template_id),
        CONSTRAINT FK_gym_whatsapp_template_overrides_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.gym_tenants(id) ON DELETE NO ACTION,
        CONSTRAINT FK_gym_whatsapp_template_overrides_template FOREIGN KEY (template_id) REFERENCES dbo.whatsapp_message_templates(template_id) ON DELETE NO ACTION,
        CONSTRAINT CK_gym_whatsapp_template_overrides_body_nonempty CHECK (LEN(LTRIM(RTRIM(body))) > 0)
    );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_gym_whatsapp_template_overrides_updated' AND object_id=OBJECT_ID(N'dbo.gym_whatsapp_template_overrides'))
    CREATE INDEX IX_gym_whatsapp_template_overrides_updated ON dbo.gym_whatsapp_template_overrides(tenant_id, updated_at DESC, template_id);

IF NOT EXISTS (SELECT 1 FROM dbo.whatsapp_message_templates WHERE template_id='MEMBERSHIP_WELCOME')
    INSERT INTO dbo.whatsapp_message_templates (template_id,name,description,category,scope,default_body) VALUES ('MEMBERSHIP_WELCOME',N'ترحيب الاشتراك',N'تُستخدم بعد تسجيل العضو ونجاح إنشاء اشتراكه.',N'الاشتراكات','tenant',N'السلام عليكم يا {{member_name}} 👋

أهلًا بك في {{gym_name}}، تم تسجيل اشتراكك بنجاح.

الباقة: {{plan_name}}
نوع الاشتراك: {{membership_type}}
تاريخ البداية: {{start_date}}
تاريخ الانتهاء: {{expiry_date}}

{{#if amount_due}}المستحق: {{amount_due}}
{{/if}}{{#if amount_paid}}المدفوع: {{amount_paid}}
{{/if}}{{#if remaining_amount}}المتبقي: {{remaining_amount}}
{{/if}}نتمنى لك تجربة تدريب موفقة 💪');
IF NOT EXISTS (SELECT 1 FROM dbo.whatsapp_message_templates WHERE template_id='MEMBERSHIP_FROZEN')
    INSERT INTO dbo.whatsapp_message_templates (template_id,name,description,category,scope,default_body) VALUES ('MEMBERSHIP_FROZEN',N'الاشتراك المجمد',N'تُستخدم لإبلاغ العضو بتجميد اشتراكه.',N'الاشتراكات','tenant',N'السلام عليكم يا {{member_name}} 👋

تم تجميد اشتراكك في {{gym_name}} حتى تاريخ:
{{freeze_until}}

يسعدنا عودتك قريبًا 💙');
IF NOT EXISTS (SELECT 1 FROM dbo.whatsapp_message_templates WHERE template_id='MEMBERSHIP_EXPIRED')
    INSERT INTO dbo.whatsapp_message_templates (template_id,name,description,category,scope,default_body) VALUES ('MEMBERSHIP_EXPIRED',N'انتهاء الاشتراك',N'تُستخدم عند انتهاء العضوية الحالية.',N'الاشتراكات','tenant',N'السلام عليكم يا {{member_name}} 👋

نحيطك علمًا بأن اشتراكك في {{gym_name}} انتهى بتاريخ:
{{expiry_date}}

يسعدنا تجديد اشتراكك واستقبالك من جديد 💪');
IF NOT EXISTS (SELECT 1 FROM dbo.whatsapp_message_templates WHERE template_id='MEMBERSHIP_EXPIRING')
    INSERT INTO dbo.whatsapp_message_templates (template_id,name,description,category,scope,default_body) VALUES ('MEMBERSHIP_EXPIRING',N'قرب انتهاء الاشتراك',N'تُستخدم لتذكير العضو قبل انتهاء الاشتراك.',N'الاشتراكات','tenant',N'السلام عليكم يا {{member_name}} 👋

اشتراكك في {{gym_name}} يقترب من الانتهاء بتاريخ {{expiry_date}}.
{{#if days_remaining}}متبقي {{days_remaining}} يومًا.
{{/if}}يسعدنا مساعدتك في التجديد 💙');
IF NOT EXISTS (SELECT 1 FROM dbo.whatsapp_message_templates WHERE template_id='PAYMENT_OUTSTANDING')
    INSERT INTO dbo.whatsapp_message_templates (template_id,name,description,category,scope,default_body) VALUES ('PAYMENT_OUTSTANDING',N'المبلغ المتبقي',N'تُستخدم لتذكير العضو بالمبلغ المستحق.',N'المدفوعات','tenant',N'السلام عليكم يا {{member_name}} 👋

يوجد مبلغ متبقٍ على اشتراكك في {{gym_name}} بقيمة: {{remaining_amount}}
{{#if expiry_date}}الاشتراك مستمر حتى: {{expiry_date}}
{{/if}}نرجو مراجعة الإدارة لاستكمال السداد.
شكرًا لك 💙');
IF NOT EXISTS (SELECT 1 FROM dbo.whatsapp_message_templates WHERE template_id='MEMBER_ABSENCE')
    INSERT INTO dbo.whatsapp_message_templates (template_id,name,description,category,scope,default_body) VALUES ('MEMBER_ABSENCE',N'الغياب الطويل',N'تُستخدم للتواصل مع العضو الغائب لفترة طويلة.',N'التواصل','tenant',N'السلام عليكم يا {{member_name}} 👋

افتقدناك في {{gym_name}}.
{{#if days_since_last_visit}}مرّ {{days_since_last_visit}} يومًا منذ آخر زيارة.
{{/if}}نتمنى رؤيتك قريبًا ونكمل تمرينك معًا 💪');
IF NOT EXISTS (SELECT 1 FROM dbo.whatsapp_message_templates WHERE template_id='DAY_PASS_THANK_YOU')
    INSERT INTO dbo.whatsapp_message_templates (template_id,name,description,category,scope,default_body) VALUES ('DAY_PASS_THANK_YOU',N'شكر الحصة اليومية',N'تُستخدم بعد تسجيل الحصة اليومية.',N'الحصص اليومية','tenant',N'أهلًا {{visitor_name}} 👋

شكرًا لحضورك اليوم في {{gym_name}}، نورتنا جدًا 💙

{{#if visit_reference}}رقم الزيارة: {{visit_reference}}
{{/if}}{{#if pass_type}}نوع الحصة: {{pass_type}}
{{/if}}نتمنى نشوفك دائمًا 💪');
IF NOT EXISTS (SELECT 1 FROM dbo.whatsapp_message_templates WHERE template_id='TENANT_ACTIVATED')
    INSERT INTO dbo.whatsapp_message_templates (template_id,name,description,category,scope,default_body) VALUES ('TENANT_ACTIVATED',N'تفعيل الحساب',N'تُستخدم من إدارة المنصة عند تفعيل Gym أو Independent Trainer.',N'المنصة','platform',N'مرحبًا بك في Logic Fit 👋

تم تفعيل حساب {{tenant_type}} بنجاح.

الاسم: {{gym_name}}
{{#if plan_name}}الباقة: {{plan_name}}
{{/if}}{{#if start_date}}تاريخ البداية: {{start_date}}
{{/if}}{{#if expiry_date}}تاريخ الانتهاء: {{expiry_date}}
{{/if}}
رابط تسجيل الدخول: {{login_url}}

اسم المستخدم: {{username}}
{{#if temporary_password}}كلمة المرور المؤقتة: {{temporary_password}}

يرجى تغيير كلمة المرور بعد أول تسجيل دخول.{{/if}}');
IF NOT EXISTS (SELECT 1 FROM dbo.whatsapp_message_templates WHERE template_id='PORTAL_ACCESS')
    INSERT INTO dbo.whatsapp_message_templates (template_id,name,description,category,scope,default_body) VALUES ('PORTAL_ACCESS',N'بيانات بوابة المشترك',N'تُستخدم لإرسال أو إعادة إرسال كود ورابط بوابة المشترك.',N'بوابة المشترك','tenant',N'السلام عليكم يا {{member_name}} 👋

دي بيانات الدخول الخاصة ببوابة المشترك في {{gym_name}}:

كود العضوية: {{membership_code}}

رابط البوابة: {{portal_url}}

احتفظ بالكود لنفسك ولا تشاركه مع أي شخص.');
