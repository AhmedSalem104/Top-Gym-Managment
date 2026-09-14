/*
  LOGIC_FIT_CONTROLLED_TEMPLATE_UPDATE: whatsapp-platform-defaults

  Controlled, fail-closed update of the nine platform-owned WhatsApp system
  templates. The official release runner supplies the transaction and records
  the migration ledger entry. No tenant, member, membership, payment, or
  schema data is touched.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.whatsapp_message_templates', N'U') IS NULL
    THROW 53501, 'The WhatsApp template table is missing.', 1;

DECLARE @Expected TABLE (
    template_id VARCHAR(64) NOT NULL PRIMARY KEY,
    previous_body_hash CHAR(64) NOT NULL,
    candidate_body_hash CHAR(64) NOT NULL
);

INSERT INTO @Expected (template_id, previous_body_hash, candidate_body_hash)
VALUES
    ('MEMBERSHIP_WELCOME', 'c7a4c47807a17e0a0ed19255dacaff5c66716343bdfe3a9c7b0bfc533a2fecfe', 'a0aa439d10b5959529c3e7c7fbf32da5c60c83ee62a91515887281117e6400bb'),
    ('MEMBERSHIP_FROZEN', '020f511112f549f29f2cfcc6753d52bdb2c91b1f92fd08b553017afeb83aba8c', 'be61d4ebc782c64d3ba9799f8742a3b013230c07ab367468d37e14e86b19a485'),
    ('MEMBERSHIP_EXPIRED', '88e94e68a86f89969faa6f13710419eadd9accbecdbd4e03d18910dbe0531b01', '06153f230084683b86db901daaa8888bb1744703f0d023fa4184aebfdf32d565'),
    ('MEMBERSHIP_EXPIRING', '62d77cabe6a68ce644ee9fe88fd2f7cbad732c462e9df434eabccaa03a2267c9', 'f4d8bbe9404ab3d9d90bf5d72d59d53ec9de8ffde75f8acc06749fb2c05f9888'),
    ('PAYMENT_OUTSTANDING', '616c3725a37459e75a2cba0797eb6b696a6ccdb7e34d79d31766c1bf9c88b367', '3266981954419aeaf81aec57079a12b3ef63af2460d77d59454f0e44aacd1974'),
    ('MEMBER_ABSENCE', '6f625007e3b016a1bb5b0737a60e3387a1067fe3e1a59eda912880c0c8d8354c', 'aeff7e15ef9b186d4daf521f6c655f76551b5c0f64d1f423de66a31f455e3d55'),
    ('DAY_PASS_THANK_YOU', 'd4c1848c190b2bba2204d42948b3b00658a2978176a993fd11435271cb2cde38', '86d75170b27b6da71cf2af050ddfae42272a643e9cf460699800b05b0fd1d42c'),
    ('TENANT_ACTIVATED', 'c388216516204d98951889ce555057bfd3b381ce66dacc8737685713a1f13595', 'daaa5091016519311d0d46307ce1b1b132e395416194d0527c830b9f096a1ee8'),
    ('PORTAL_ACCESS', '9d96a49b9789c01abd9e1f96f006d4ebcfc734da52fe7f6168c9a003a6ad929', '2c167e8d24242731827421f330f6bcdebf5b9d67c3fa4b2449dbb7a165fa7756');

DECLARE @Candidate TABLE (
    template_id VARCHAR(64) NOT NULL PRIMARY KEY,
    default_body NVARCHAR(MAX) NOT NULL,
    candidate_body_hash CHAR(64) NOT NULL
);

INSERT INTO @Candidate (template_id, default_body, candidate_body_hash)
VALUES
    ('MEMBERSHIP_WELCOME', N'السلام عليكم يا *{{member_name}}* 👋

مبروك يا بطل 🎉
تم تسجيل اشتراكك في *{{gym_name}}* بنجاح ✅

*تفاصيل اشتراكك*
• الباقة: *{{plan_name}}*
• النوع: *{{membership_type}}*
• البداية: *{{start_date}}*
• الانتهاء: *{{expiry_date}}*

*ملخص الحساب*
• السعر الأساسي: *{{base_price}}*
• الخصم: *{{discount_amount}}*
• المستحق: *{{amount_due}}*
• المدفوع: *{{amount_paid}}*
{{#if remaining_amount}}• المتبقي: *{{remaining_amount}}*
{{/if}}• طريقة الدفع: *{{payment_method}}*

{{#if portal_code}}*كود العضوية الخاص بك لبوابة المشترك:*
*{{portal_code}}*

*رابط بوابة المشترك:*
{{portal_url}}

لا تشارك الكود مع أي شخص.

{{/if}}مبسوطين إنك بقيت جزء من *{{gym_name}}* ❤️
مستنيينك تبدأ بقوة،
وإحنا معاك خطوة بخطوة
لحد ما توصل لهدفك.', 'a0aa439d10b5959529c3e7c7fbf32da5c60c83ee62a91515887281117e6400bb'),
    ('MEMBERSHIP_FROZEN', N'السلام عليكم يا *{{member_name}}* 👋

اشتراكك متجمّد لحد:
{{#if freeze_until}}*{{freeze_until}}*
{{/if}}ياريت تراجع الإدارة لو محتاج أي تفاصيل.

مستنيينك ترجع تكمل تمرينك معانا ❤️', 'be61d4ebc782c64d3ba9799f8742a3b013230c07ab367468d37e14e86b19a485'),
    ('MEMBERSHIP_EXPIRED', N'السلام عليكم يا *{{member_name}}* 👋

حبيت أنبهك إن اشتراكك في
*{{gym_name}}* انتهى بتاريخ:

{{#if expiry_date}}*{{expiry_date}}*
{{/if}}ياريت تمر علينا في الإدارة
لتجديد الاشتراك والرجوع
للتمرين من جديد.

مكانك معانا موجود
ومستنيين نشوفك راجع بقوة

وجودك في *{{gym_name}}* بيفرق معانا ❤️', '06153f230084683b86db901daaa8888bb1744703f0d023fa4184aebfdf32d565'),
    ('MEMBERSHIP_EXPIRING', N'السلام عليكم يا *{{member_name}}* 👋

حبيت أفكرك إن اشتراكك في
*{{gym_name}}* هينتهي يوم:

{{#if expiry_date}}*{{expiry_date}}*
{{/if}}{{#if days_remaining}}متبقي {{days_remaining}} يومًا.
{{/if}}ياريت تعدّي علينا في الإدارة
لتجديد الاشتراك واستمرار تمرينك
من غير انقطاع.

مستنيينك تكمل معانا يا بطل
ولسه قدامنا أهداف نحققها سوا

*{{gym_name}}* ❤️', 'f4d8bbe9404ab3d9d90bf5d72d59d53ec9de8ffde75f8acc06749fb2c05f9888'),
    ('PAYMENT_OUTSTANDING', N'السلام عليكم يا *{{member_name}}* 👋

بنحب نفكرك إن فيه مبلغ متبقي
على اشتراكك بقيمة:

*{{remaining_amount}}*

{{#if expiry_date}}واشتراكك مستمر لحد:
*{{expiry_date}}*

{{/if}}ياريت تعدّي علينا في الإدارة
لاستكمال السداد وتنظيم حسابك.

مستنيينك في الجيم يا بطل
وجودك وتمرينك معانا مهم،
ولسه عندنا أهداف نكملها سوا

شكرًا إنك جزء من *{{gym_name}}* ❤️', '3266981954419aeaf81aec57079a12b3ef63af2460d77d59454f0e44aacd1974'),
    ('MEMBER_ABSENCE', N'السلام عليكم يا *{{member_name}}* 👋

بقالنا فترة مشوفناكش في الجيم

اشتراكك لسه مستمر لحد:
{{#if expiry_date}}*{{expiry_date}}*
{{/if}}ومستنيين نشوفك راجع تتمرن
معانا قريب.

{{#if days_since_last_visit}}مرّ {{days_since_last_visit}} يومًا منذ آخر زيارة.

{{/if}}الجيم من غيرك ناقصه حماس
يلا نرجع نكمل على هدفك سوا ❤️

*{{gym_name}}*', 'aeff7e15ef9b186d4daf521f6c655f76551b5c0f64d1f423de66a31f455e3d55'),
    ('DAY_PASS_THANK_YOU', N'أهلًا {{visitor_name}} 👋

شكرًا لحضورك اليوم في {{gym_name}}، نورتنا جدًا 💙

{{#if visit_reference}}رقم الزيارة: {{visit_reference}}
{{/if}}{{#if pass_type}}نوع الحصة: {{pass_type}}
{{/if}}نتمنى نشوفك دائمًا 💪', '86d75170b27b6da71cf2af050ddfae42272a643e9cf460699800b05b0fd1d42c'),
    ('TENANT_ACTIVATED', N'مرحبًا بك في Logic Fit 👋

تم تفعيل حساب {{tenant_type}} بنجاح.

الاسم: {{gym_name}}
{{#if plan_name}}الباقة: {{plan_name}}
{{/if}}{{#if start_date}}تاريخ البداية: {{start_date}}
{{/if}}{{#if expiry_date}}تاريخ الانتهاء: {{expiry_date}}
{{/if}}
رابط تسجيل الدخول: {{login_url}}

اسم المستخدم: {{username}}
{{#if temporary_password}}كلمة المرور المؤقتة: {{temporary_password}}

يرجى تغيير كلمة المرور بعد أول تسجيل دخول.{{/if}}', 'daaa5091016519311d0d46307ce1b1b132e395416194d0527c830b9f096a1ee8'),
    ('PORTAL_ACCESS', N'السلام عليكم يا {{member_name}} 👋

دي بيانات الدخول الخاصة ببوابة المشترك في {{gym_name}}:

كود العضوية: {{membership_code}}

رابط البوابة: {{portal_url}}

احتفظ بالكود لنفسك ولا تشاركه مع أي شخص.', '2c167e8d24242731827421f330f6bcdebf5b9d67c3fa4b2449dbb7a165fa7756');

IF (SELECT COUNT_BIG(*) FROM @Expected) <> 9
    THROW 53502, 'The controlled template update does not contain exactly nine expected keys.', 1;

IF (SELECT COUNT_BIG(*) FROM @Candidate) <> 9
    THROW 53503, 'The controlled template update does not contain exactly nine candidate bodies.', 1;

IF (SELECT COUNT_BIG(*) FROM dbo.whatsapp_message_templates WHERE template_id IN ('MEMBERSHIP_WELCOME', 'MEMBERSHIP_FROZEN', 'MEMBERSHIP_EXPIRED', 'MEMBERSHIP_EXPIRING', 'PAYMENT_OUTSTANDING', 'MEMBER_ABSENCE', 'DAY_PASS_THANK_YOU', 'TENANT_ACTIVATED', 'PORTAL_ACCESS')) <> 9
    THROW 53504, 'Production must contain exactly the nine approved template rows.', 1;

IF EXISTS (
    SELECT template_id
    FROM dbo.whatsapp_message_templates
    WHERE template_id IN ('MEMBERSHIP_WELCOME', 'MEMBERSHIP_FROZEN', 'MEMBERSHIP_EXPIRED', 'MEMBERSHIP_EXPIRING', 'PAYMENT_OUTSTANDING', 'MEMBER_ABSENCE', 'DAY_PASS_THANK_YOU', 'TENANT_ACTIVATED', 'PORTAL_ACCESS')
    GROUP BY template_id
    HAVING COUNT_BIG(*) <> 1
)
    THROW 53505, 'Duplicate approved template keys were found.', 1;

IF EXISTS (
    SELECT expected.template_id
    FROM @Expected AS expected
    LEFT JOIN dbo.whatsapp_message_templates AS current_row
      ON current_row.template_id = expected.template_id
    WHERE current_row.template_id IS NULL
)
    THROW 53506, 'An approved template key is missing.', 1;

DECLARE @Before TABLE (
    template_id VARCHAR(64) NOT NULL PRIMARY KEY,
    name NVARCHAR(160) NOT NULL,
    description NVARCHAR(500) NOT NULL,
    category NVARCHAR(80) NOT NULL,
    scope VARCHAR(20) NOT NULL,
    default_body NVARCHAR(MAX) NOT NULL,
    is_active BIT NOT NULL,
    updated_by_user_id INT NULL,
    created_at DATETIME2(0) NOT NULL,
    updated_at DATETIME2(0) NOT NULL,
    body_hash CHAR(64) NOT NULL
);

INSERT INTO @Before (
    template_id, name, description, category, scope, default_body,
    is_active, updated_by_user_id, created_at, updated_at, body_hash
)
SELECT
    current_row.template_id,
    current_row.name,
    current_row.description,
    current_row.category,
    current_row.scope,
    current_row.default_body,
    current_row.is_active,
    current_row.updated_by_user_id,
    current_row.created_at,
    current_row.updated_at,
    CONVERT(CHAR(64), HASHBYTES('SHA2_256', CONVERT(VARBINARY(MAX), current_row.default_body)), 2)
FROM dbo.whatsapp_message_templates AS current_row
WHERE current_row.template_id IN ('MEMBERSHIP_WELCOME', 'MEMBERSHIP_FROZEN', 'MEMBERSHIP_EXPIRED', 'MEMBERSHIP_EXPIRING', 'PAYMENT_OUTSTANDING', 'MEMBER_ABSENCE', 'DAY_PASS_THANK_YOU', 'TENANT_ACTIVATED', 'PORTAL_ACCESS');

IF (SELECT COUNT_BIG(*) FROM @Before) <> 9
    THROW 53507, 'The rollback snapshot could not capture all nine approved rows.', 1;

DECLARE @AlreadyApplied BIT = CASE WHEN NOT EXISTS (
    SELECT 1
    FROM @Before AS before_row
    INNER JOIN @Candidate AS candidate
      ON candidate.template_id = before_row.template_id
    WHERE before_row.body_hash <> candidate.candidate_body_hash
       OR before_row.scope <> 'platform'
) THEN 1 ELSE 0 END;

IF @AlreadyApplied = 0
BEGIN
    IF EXISTS (
        SELECT 1
        FROM @Before AS before_row
        INNER JOIN @Expected AS expected
          ON expected.template_id = before_row.template_id
        WHERE before_row.body_hash <> expected.previous_body_hash
    )
        THROW 53508, 'A template body changed after the approved read-only audit; refusing to overwrite it.', 1;

    UPDATE target
    SET target.default_body = candidate.default_body,
        target.scope = 'platform',
        target.updated_at = SYSUTCDATETIME()
    FROM dbo.whatsapp_message_templates AS target
    INNER JOIN @Candidate AS candidate
      ON candidate.template_id = target.template_id;

    IF @@ROWCOUNT <> 9
        THROW 53509, 'The controlled template update did not update exactly nine rows.', 1;
END;

DECLARE @PostExpected TABLE (
    template_id VARCHAR(64) NOT NULL PRIMARY KEY,
    candidate_body_hash CHAR(64) NOT NULL
);

INSERT INTO @PostExpected (template_id, candidate_body_hash)
VALUES
    ('MEMBERSHIP_WELCOME', 'a0aa439d10b5959529c3e7c7fbf32da5c60c83ee62a91515887281117e6400bb'),
    ('MEMBERSHIP_FROZEN', 'be61d4ebc782c64d3ba9799f8742a3b013230c07ab367468d37e14e86b19a485'),
    ('MEMBERSHIP_EXPIRED', '06153f230084683b86db901daaa8888bb1744703f0d023fa4184aebfdf32d565'),
    ('MEMBERSHIP_EXPIRING', 'f4d8bbe9404ab3d9d90bf5d72d59d53ec9de8ffde75f8acc06749fb2c05f9888'),
    ('PAYMENT_OUTSTANDING', '3266981954419aeaf81aec57079a12b3ef63af2460d77d59454f0e44aacd1974'),
    ('MEMBER_ABSENCE', 'aeff7e15ef9b186d4daf521f6c655f76551b5c0f64d1f423de66a31f455e3d55'),
    ('DAY_PASS_THANK_YOU', '86d75170b27b6da71cf2af050ddfae42272a643e9cf460699800b05b0fd1d42c'),
    ('TENANT_ACTIVATED', 'daaa5091016519311d0d46307ce1b1b132e395416194d0527c830b9f096a1ee8'),
    ('PORTAL_ACCESS', '2c167e8d24242731827421f330f6bcdebf5b9d67c3fa4b2449dbb7a165fa7756');

IF EXISTS (
    SELECT 1
    FROM dbo.whatsapp_message_templates AS current_row
    INNER JOIN @PostExpected AS expected
      ON expected.template_id = current_row.template_id
    WHERE current_row.scope <> 'platform'
       OR CONVERT(CHAR(64), HASHBYTES('SHA2_256', CONVERT(VARBINARY(MAX), current_row.default_body)), 2) <> expected.candidate_body_hash
)
    THROW 53510, 'The final platform template body or scope verification failed.', 1;

IF EXISTS (
    SELECT 1
    FROM dbo.whatsapp_message_templates AS current_row
    INNER JOIN @Before AS before_row
      ON before_row.template_id = current_row.template_id
    WHERE current_row.template_id <> before_row.template_id
       OR current_row.name <> before_row.name
       OR current_row.description <> before_row.description
       OR current_row.category <> before_row.category
       OR current_row.is_active <> before_row.is_active
       OR ISNULL(current_row.updated_by_user_id, -1) <> ISNULL(before_row.updated_by_user_id, -1)
       OR current_row.created_at <> before_row.created_at
)
    THROW 53511, 'Protected template IDs or metadata changed unexpectedly.', 1;
