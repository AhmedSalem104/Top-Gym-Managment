# TOP GYM — Technical Specification (As-Is)

## 0. بيانات الوثيقة ونطاقها

| البند | القيمة |
|---|---|
| النظام | TOP GYM Membership, Training & Nutrition Management |
| تاريخ المراجعة | 2026-08-16 |
| نوع المراجعة | قراءة وتحليل فقط — لا Migration ولا Refactor ولا تعديل على Business Logic |
| مصدر الحقيقة | الكود الحالي، ملف قاعدة البيانات، مسارات API، الواجهة الحالية، واختبار Smoke |
| المنطقة الزمنية | Africa/Cairo في منطق التطبيق |
| اللغة والاتجاه | العربية، RTL |
| قاعدة البيانات | Microsoft SQL Server عبر مكتبة mssql |

هذه الوثيقة تصف النظام كما هو موجود فعليًا الآن، وليس كما يُفترض أن يكون. أي نقطة معنونة
بـ **فجوة حالية** أو **ملاحظة تنفيذية** يجب اعتبارها جزءًا من سلوك النسخة الحالية، لا كاقتراح
تم تنفيذه بالفعل.

### طريقة قراءة الحالة

- **مطبق:** موجود في الكود وقابل للتتبع إلى مسار أو جدول أو واجهة.
- **ملاحظة:** سلوك صحيح لكنه يحتاج أن يعرفه مطور النسخة الجديدة.
- **فجوة:** اختلاف أو خطر أو قيد موجود في النسخة الحالية.
- **قرار إعادة البناء:** ما يجب الحفاظ عليه عند نقل النظام، مع توضيح ما لا ينبغي نقله دون مراجعة.

---

## 1. الملخص التنفيذي

TOP GYM هو تطبيق إدارة جيم عربي يعمل كصفحة SPA واحدة، ويجمع أربع مناطق مترابطة:

1. إدارة الأعضاء والاشتراكات والمدفوعات والتجميد والتجديد.
2. الحضور والانصراف عبر الهاتف أو QR Code.
3. إدارة التدريب والتغذية والقياسات والتنفيذ الفعلي للأنظمة.
4. الإدارة المالية والتقارير والنسخ الاحتياطية ومكتبة التمارين والأطعمة والعضلات.

القرار المعماري الأهم في النسخة الحالية هو أن جدول members يمثل هوية العميل الوحيدة:

- المشترك الحالي في الجيم هو Member لديه Membership.
- المتدرب الخارجي هو Member بدون اشتراك Gym فعال، لكنه يظهر في شاشة المتدربين الخارجيين
  إذا كان لديه برنامج تدريب أو خطة تغذية.
- عند اشتراك المتدرب الخارجي لاحقًا، يضاف Membership إلى نفس Member؛ لا ينشأ سجل عميل جديد.
- برامج التدريب، خطط التغذية، القياسات، الجلسات، وتسجيلات الوجبات كلها مرتبطة بـ members.id.

الحفظ المركب للبرنامج التدريبي أو خطة التغذية يتم داخل Transaction واحدة. لذلك لا يعتمد
التنفيذ الحالي على سلسلة Requests منفصلة تترك برنامجًا ناقصًا عند فشل أحد العناصر.

### أرقام قاعدة البيانات وقت المراجعة

الأرقام التالية Snapshot من قاعدة البيانات المتصلة وقت التحليل، وليست Seed ثابتًا:

| الجدول | عدد السجلات |
|---|---:|
| members | 71 |
| memberships | 75 |
| gym_payments | 75 |
| gym_payment_transactions | 77 |
| membership_events | 98 |
| gym_attendance | 8 |
| gym_expenses | 0 |
| membership_freezes | 0 |
| gym_muscles | 297 |
| gym_foods | 367 |
| gym_exercises | 265 |
| workout_programs | 1 |
| workout_routines | 2 |
| workout_exercises | 7 |
| diet_plans | 1 |
| diet_meals | 1 |
| diet_meal_items | 2 |
| body_measurements | 0 |
| athlete_checkins | 0 |
| workout_sessions | 1 |
| workout_set_logs | 1 |
| meal_logs | 0 |
| gym_backup_operations | 141 |
| gym_backup_archives | 3 |

---

## 2. خريطة المعمارية الحالية

### 2.1 الطبقات

    Browser
      └── public/index.html + public/css + public/js
            └── fetch JSON
                  └── Express server.js
                        └── src/*-service.js
                              └── SQL Server

الواجهة ليست React أو Vue؛ هي HTML ثابت مع Vanilla JavaScript وتقسيم ملفات Feature يتم
تحميل بعضها عند فتح التبويب بواسطة public/js/feature-loader.js.

### 2.2 ملفات المصدر ومسؤولية كل ملف

| الملف | المسؤولية |
|---|---|
| server.js | تشغيل Express، static files، جميع Routes، security headers، rate limit، error normalization، QR HTML |
| src/db.js | Pool SQL Server، قراءة الاتصال، تنفيذ database/schema.sql عند الإقلاع |
| src/date-utils.js | تاريخ Cairo، parsing للتاريخ فقط، الإضافة بالأيام/الشهور، فرق الأيام |
| src/member-service.js | الأعضاء، العضويات، التسعير، الحالات، التجميد، التجديد، المدفوعات، السجل المالي والأحداث، dashboard الأساسي |
| src/attendance-service.js | check-in/check-out، QR/phone resolution، auto checkout، تقارير الحضور |
| src/finance-service.js | المصروفات وملخص الشهر الحالي |
| src/analytics-service.js | مؤشرات week/month/year، الاتجاهات، الحضور، أوقات الذروة، الغياب |
| src/report-service.js | التقارير العامة بحسب فترة زمنية |
| src/library-service.js | عضلات، أطعمة، تمارين، CRUD وfilters وseed/sync |
| src/coaching-service.js | المتدربون الخارجيون، التدريب، التغذية، القياسات، المتابعات، الجلسات، meal logs |
| src/backup-service.js | إنشاء/ضغط/فحص/استرجاع/أرشفة النسخ |
| public/index.html | هيكل SPA، tabs، الجداول، dialogs |
| public/js/app.js | حالة الصفحة الرئيسية، الأعضاء، التسعير، dashboard، pagination، WhatsApp hooks |
| public/js/coaching.js | شاشة المتدربين وبناة التدريب والتغذية وملف العميل |
| public/js/attendance.js | واجهة الحضور، QR reader/generator، الحضور السريع |
| public/js/library.js | واجهة مكتبة العضلات والأطعمة والتمارين |
| public/js/reports.js | واجهة التقارير والفلاتر والجداول والتصدير |
| public/js/print-enhancements.js | مستندات الطباعة وPDF للأعضاء والإيصالات والأنظمة |
| public/css/base.css | primitives، dialogs، forms، buttons، responsive base |
| public/css/coaching.css | المتدربون، الملف، builder، searchable dropdowns |
| public/css/print.css | صفحات الطباعة وA4 وPDF |
| public/css/dashboard.css وui-polish.css | dashboard وطبقات polish البصرية |
| database/schema.sql | schema idempotent الأساسي، constraints، indexes، seed pricing/types |
| scripts/smoke-test.js | اختبار تشغيل تكاملي واسع للـAPI والـDB والـbackup والحضور |
| scripts/seed-performance-test-data.js | توليد بيانات اختبار الأداء |
| scripts/sync-library-data.js | مزامنة مكتبة البيانات من ملفات DATA |

### 2.3 الاعتماديات

    express       HTTP server
    mssql         SQL Server driver
    dotenv        environment configuration
    tailwindcss   build-time CSS utility generation

لا توجد طبقة ORM، ولا migration framework مستقل، ولا Auth package، ولا React runtime.

### 2.4 التشغيل والـdeployment

1. يقرأ dotenv.
2. يطبق security headers.
3. يطبق express.json بحد أقصى 1MB.
4. يخدم public كملفات ثابتة.
5. يضع API responses على no-store، مع rate limit لطلبات non-GET لكل IP: 120 طلبًا في الدقيقة.
6. initDatabase() ينفذ database/schema.sql، ثم يضمن بيانات المكتبة والجداول الإضافية.
7. يبدأ Express.
8. أي route غير ملف أو API يرجع public/index.html لتعمل SPA hash routes.

الإعدادات المهمة في .env.example:

| المفتاح | المعنى | الافتراضي |
|---|---|---|
| MSSQL_CONNECTION_STRING | اتصال SQL Server | مطلوب |
| PORT | منفذ Express | 3000 |
| APP_TIMEZONE | منطقة الحسابات والتاريخ | Africa/Cairo |
| ATTENDANCE_AUTO_CHECKOUT_MINUTES | إغلاق الحضور المفتوح تلقائيًا | 60 |
| CRON_SECRET | سر اختياري لتأمين scheduled backup | فارغ |

الـVercel cron الحالي:

    /api/backup/daily — schedule: 0 12 * * *

جدولة Vercel UTC تطابق 15:00 في القاهرة خلال التوقيت الصيفي الحالي، لكنها تصبح 14:00
خلال التوقيت الشتوي؛ لذلك لا تعتبر هذه الجدولة تنفيذًا مضمونًا لـ15:00 محليًا طوال العام.

### 2.5 لا يوجد Auth حاليًا

لا توجد في النسخة الحالية شاشة Login أو Session أو Roles أو Tenant/Coach boundary:

- كل من يصل إلى API يستطيع نظريًا استدعاء كل العمليات.
- memberId وclientId معرفات داخلية وليست حماية صلاحيات.
- endpoint QR يعرض صفحة بيانات عضو عند معرفة الـID.
- route scheduled backup لديه حماية cron، لكن بقية الإدارة ليست محمية بمستخدم.

هذا مهم جدًا في إعادة البناء: لا تنقل النظام إلى الإنتاج متعدد الموظفين دون إضافة طبقة
صلاحيات وتدقيق، لكن لا تنسب هذه الصلاحيات إلى النسخة الحالية.

---

## 3. قاموس المجال والعلاقات الأساسية

| المصطلح | التعريف |
|---|---|
| Member | هوية العميل الأساسية: الاسم والهاتف والبريد والملاحظات |
| Membership | فترة اشتراك Gym واحدة مرتبطة بعضو؛ العضو قد يملك أكثر من Membership عبر التجديد |
| Payment summary | صف حالي واحد لكل Membership في gym_payments |
| Payment transaction | حدث مالي غير قابل للاستبدال في gym_payment_transactions |
| External trainee | Member بدون Gym membership فعال ولديه Training أو Nutrition |
| Workout program | برنامج تدريب رئيسي لعضو |
| Routine | يوم/وحدة داخل البرنامج |
| Workout exercise | تمرين داخل Routine مع sets/reps/weight/rest/intensity |
| Diet plan | خطة تغذية رئيسية لعضو |
| Meal | وجبة داخل الخطة |
| Meal item | طعام بكمية معينة داخل الوجبة مع snapshot للقيم الغذائية |
| Measurement | قياس جسم في تاريخ معين |
| Athlete check-in | متابعة يومية للنوم والإجهاد والألم والمزاج والمؤشرات الحيوية |
| Workout session | جلسة تنفيذ فعلية لبرنامج |
| Meal log | تسجيل تناول عنصر طعام فعليًا |

### 3.1 ERD نصي

    members
      ├──< memberships
      │      ├──1 gym_payments
      │      ├──< gym_payment_transactions
      │      └──< membership_freezes
      ├──< membership_events
      ├──< gym_attendance
      ├──< workout_programs ──< workout_routines ──< workout_exercises >── gym_exercises >── gym_muscles
      ├──< diet_plans ──< diet_meals ──< diet_meal_items >── gym_foods
      ├──< body_measurements
      ├──< athlete_checkins
      ├──< coaching_activity_events
      ├──< workout_sessions ──< workout_set_logs
      └──< meal_logs

عند حذف Member، معظم أبناء العضو cascade delete. توجد علاقات مقصودة بـ NO ACTION إلى
البرنامج/العنصر، ولذلك يسبق الحذف في الخدمة nulling لبعض foreign keys في logs/sessions.

---

## 4. نموذج قاعدة البيانات التفصيلي

> الأنواع أدناه هي SQL Server types من schema الحالي. الجداول athlete_checkins و
> coaching_activity_events وبعض أعمدة diet_plans يتم ضمانها runtime أيضًا من
> src/coaching-service.js، وليست كلها في النسخة الأصلية من database/schema.sql.

### 4.1 الهوية والعضويات

#### dbo.members

- id INT IDENTITY — Primary Key.
- full_name NVARCHAR(120) NOT NULL.
- phone NVARCHAR(30) NOT NULL.
- phone_normalized NVARCHAR(30) NULL — صيغة المقارنة بعد توحيد أرقام عربية/مصرية.
- email NVARCHAR(254) NULL.
- registration_date DATE NOT NULL.
- notes NVARCHAR(1000) NULL.
- created_at وupdated_at DATETIME2(0) — UTC defaults.
- Indexes على phone وphone_normalized.
- لا يوجد unique constraint أصلي على الهاتف؛ duplicate check يتم في service بعد normalization.

#### dbo.memberships

- id INT IDENTITY — Primary Key.
- member_id INT NOT NULL — FK إلى members مع ON DELETE CASCADE.
- membership_plan VARCHAR(30) NOT NULL — مثل gym_only وgym_cardio.
- membership_type VARCHAR(30) NOT NULL — مثل monthly وhalf_month.
- start_date DATE NOT NULL.
- end_date DATE NOT NULL مع check أن النهاية لا تسبق البداية.
- notes NVARCHAR(1000) NULL.
- created_at وupdated_at.
- لا يوجد unique يمنع Memberships متعددة؛ هذا مقصود للتجديد والتاريخ.

#### dbo.membership_pricing

- id INT IDENTITY Primary Key.
- plan_code VARCHAR(30) NOT NULL UNIQUE.
- plan_name NVARCHAR(80) NOT NULL.
- monthly_price DECIMAL(12,2) >= 0.
- is_active BIT DEFAULT 1.
- sort_order INT DEFAULT 0.
- timestamps.

#### dbo.membership_types

- id INT IDENTITY Primary Key.
- type_code VARCHAR(30) NOT NULL UNIQUE.
- type_name NVARCHAR(80) NOT NULL.
- duration_mode VARCHAR(10) — months أو days.
- duration_value DECIMAL(8,2) > 0.
- price_multiplier DECIMAL(8,4) > 0.
- is_active BIT DEFAULT 1.
- sort_order INT DEFAULT 0.
- timestamps.

Seed types الحالية: monthly = شهر، half_month = 15 يوم، quarterly = 3 شهور،
semiannual = 6 شهور، annual = 12 شهر. القيمة legacy two month موجودة في بعض البيانات
الحالية ويتم التعامل معها كـalias/compatibility داخل service.

#### dbo.membership_type_prices

- plan_code VARCHAR(30) — جزء من Composite PK وFK إلى pricing.
- type_code VARCHAR(30) — جزء من Composite PK وFK إلى types.
- price DECIMAL(12,2) >= 0.
- timestamps.
- تمثل override مستقلًا لسعر كل زوج باقة/مدة؛ fallback هو السعر الشهري × multiplier.

#### dbo.membership_freezes

- id INT IDENTITY Primary Key.
- membership_id INT NOT NULL FK cascade.
- start_date DATE NOT NULL.
- end_date DATE NOT NULL.
- resumed_date DATE NULL.
- reason NVARCHAR(500) NULL.
- timestamps.
- checks على ترتيب التواريخ وعلى أن resumed لا يسبق start.

#### dbo.gym_payments

- id INT IDENTITY Primary Key.
- membership_id INT NOT NULL UNIQUE FK cascade؛ صف ملخص واحد لكل اشتراك.
- list_price DECIMAL(12,2).
- discount_amount DECIMAL(12,2).
- amount_due DECIMAL(12,2).
- amount_paid DECIMAL(12,2).
- amount_remaining computed persisted = amount_due - amount_paid.
- payment_method VARCHAR(20) من cash/card/transfer/other.
- paid_at DATE NULL.
- notes NVARCHAR(500) NULL.
- timestamps.
- checks: القيم غير سالبة، المدفوع لا يتجاوز المستحق، المستحق = السعر - الخصم.

#### dbo.gym_payment_transactions

- id INT IDENTITY Primary Key.
- membership_id INT NOT NULL FK cascade.
- transaction_type VARCHAR(20) من subscription/payment/adjustment.
- list_price، discount_amount، amount_due، amount_paid، amount_remaining.
- payment_method، paid_at، notes.
- source_payment_id INT NULL مع unique filtered index عند وجوده.
- created_at.
- transaction من نوع adjustment يسمح بقيمة amount_paid سالبة/موجبة حسب قيد التعديل؛
  subscription/payment يتطلب قيمة موجبة.
- هذا هو المصدر التاريخي للإيصالات والتحصيل، وليس مجرد overwrite لصف summary.

#### dbo.membership_events

- id INT IDENTITY Primary Key.
- member_id INT NOT NULL FK cascade.
- membership_id INT NULL FK NO ACTION.
- event_type VARCHAR(30).
- details NVARCHAR(MAX) — JSON أو نص تفاصيل.
- created_at.
- يستخدم لتسجيل create/update/renew/freeze/resume/payment/delete وغيرها.

### 4.2 الحسابات والحضور

#### dbo.gym_expenses

- id INT IDENTITY Primary Key.
- expense_name NVARCHAR(120) NOT NULL.
- amount DECIMAL(12,2) > 0.
- expense_date DATE NOT NULL.
- notes NVARCHAR(500) NULL.
- timestamps.
- index على التاريخ.

#### dbo.gym_attendance

- id INT IDENTITY Primary Key.
- member_id INT NOT NULL FK cascade.
- membership_id INT NULL — لقطة الاشتراك المستخدم عند الحضور، دون FK صريح في schema.
- attendance_date DATE NOT NULL.
- check_in_at DATETIME2(0) default UTC.
- check_out_at DATETIME2(0) NULL.
- check_in_source VARCHAR(10) من phone/qr/manual.
- check_out_source VARCHAR(10) من phone/qr/manual/auto.
- notes NVARCHAR(250) NULL.
- timestamps.
- unique index على (member_id, attendance_date) لمنع حضورين في نفس اليوم.
- check-out لا يسبق check-in.

### 4.3 مكتبة التدريب والتغذية

#### dbo.gym_muscles

- id INT IDENTITY Primary Key.
- source_id INT NULL UNIQUE لربط DATA المصدر.
- name NVARCHAR(120) NOT NULL.
- name_ar NVARCHAR(120) NULL.
- body_part NVARCHAR(80) NULL.
- description وdescription_ar NVARCHAR(1000) NULL.
- icon NVARCHAR(20) NULL.
- timestamps.
- index على body part والاسم.

#### dbo.gym_foods

- id INT IDENTITY Primary Key.
- source_id INT NULL UNIQUE.
- name_ar وname_en NVARCHAR(160) NULL.
- category NVARCHAR(80) NULL.
- calories وprotein وcarbs وfat وfiber وsugar وsodium DECIMAL(12,3) — القيم المرجعية لكل serving size.
- serving_size DECIMAL(12,3) DEFAULT 100.
- serving_unit NVARCHAR(40) NULL.
- timestamps.
- index على category والاسم.

#### dbo.gym_exercises

- id INT IDENTITY Primary Key.
- source_id INT NULL UNIQUE.
- name NVARCHAR(160) NOT NULL وname_ar NVARCHAR(160) NULL.
- description وdescription_ar NVARCHAR(2000) NULL.
- target_muscle_id INT NULL FK إلى muscles بـNO ACTION.
- secondary_muscles_json NVARCHAR(MAX) default [].
- equipment NVARCHAR(100) NULL.
- is_high_impact BIT.
- difficulty، category، movement_pattern، mechanic، force.
- instructions_json وinstructions_ar_json وtips_json وtips_ar_json،
  common_mistakes_json وcommon_mistakes_ar_json — JSON arrays.
- reps_range وsets_range وtempo وicon وvideo_url وmetadata_json.
- rest_seconds INT NULL.
- timestamps.
- index على category/difficulty/equipment/target muscle/name.

### 4.4 التدريب والتغذية والتقدم

#### dbo.workout_programs

- id INT IDENTITY Primary Key.
- member_id INT NOT NULL FK cascade.
- name NVARCHAR(160) NOT NULL.
- description NVARCHAR(2000) NULL.
- start_date DATE NOT NULL، end_date DATE NULL.
- duration_weeks INT NULL من 1 إلى 520.
- goal NVARCHAR(60) NULL.
- level NVARCHAR(40) NULL.
- days_per_week INT NULL من 1 إلى 7.
- status VARCHAR(20) من draft/active/paused/completed/archived.
- notes NVARCHAR(2000) NULL.
- version INT DEFAULT 1.
- timestamps.

#### dbo.workout_routines

- id INT IDENTITY Primary Key.
- program_id INT NOT NULL FK cascade.
- name NVARCHAR(160) NOT NULL.
- day_of_week INT NULL من 1 إلى 7.
- sort_order INT.
- notes NVARCHAR(1000).
- timestamps.

#### dbo.workout_exercises

- id INT IDENTITY Primary Key.
- routine_id INT NOT NULL FK cascade.
- exercise_id INT NOT NULL FK إلى gym_exercises بـNO ACTION.
- sort_order INT.
- sets INT DEFAULT 3 من 1 إلى 100.
- reps_min وreps_max INT NULL من 1 إلى 1000، وmax لا يقل عن min.
- weight_kg DECIMAL(10,2) NULL >= 0.
- rest_seconds INT NULL من 0 إلى 7200.
- rir INT NULL من 0 إلى 10 — أضيف runtime.
- rpe DECIMAL(4,1) NULL من 1 إلى 10 — أضيف runtime.
- tempo NVARCHAR(40)، superset_group_id NVARCHAR(40)، notes NVARCHAR(1000).
- timestamps.

#### dbo.diet_plans

- id INT IDENTITY Primary Key.
- member_id INT NOT NULL FK cascade.
- name NVARCHAR(160) NOT NULL.
- description NVARCHAR(2000) NULL.
- start_date DATE NOT NULL، end_date DATE NULL.
- meals_per_day INT NULL من 1 إلى 12.
- target_calories وtarget_protein وtarget_carbs وtarget_fats DECIMAL(12,2) NULL >= 0.
- calorie_goal VARCHAR(20) — lose/maintain/gain، runtime compatibility column.
- calorie_adjustment DECIMAL(12,2) — deficit/surplus.
- calculator_weight_kg DECIMAL(8,2)، calculator_height_cm DECIMAL(8,2)،
  calculator_age INT، calculator_gender VARCHAR(10)، calculator_activity VARCHAR(20).
- bmr وtdee DECIMAL(12,2).
- status وnotes وversion وtimestamps مثل البرنامج التدريبي.

#### dbo.diet_meals

- id INT IDENTITY Primary Key.
- diet_plan_id INT NOT NULL FK cascade.
- name NVARCHAR(120) NOT NULL.
- meal_time VARCHAR(10) NULL.
- sort_order INT.
- notes NVARCHAR(1000).
- timestamps.

#### dbo.diet_meal_items

- id INT IDENTITY Primary Key.
- meal_id INT NOT NULL FK cascade.
- food_id INT NOT NULL FK إلى gym_foods بـNO ACTION.
- sort_order INT.
- assigned_quantity DECIMAL(12,3) > 0.
- serving_unit NVARCHAR(40) NULL.
- calc_calories وcalc_protein وcalc_carbs وcalc_fats DECIMAL(12,3).
- notes NVARCHAR(500).
- timestamps.
- قيم calc_* snapshot وقت حفظ الخطة، وليست join حيًا مع قيم الطعام لاحقًا.

#### dbo.body_measurements

- id INT IDENTITY Primary Key.
- member_id INT NOT NULL FK cascade.
- measured_at DATE NOT NULL.
- weight_kg وheight_cm DECIMAL(8,2).
- body_fat_percent DECIMAL(5,2).
- chest_cm وwaist_cm وhips_cm وarms_cm وthighs_cm DECIMAL(8,2).
- notes NVARCHAR(1000).
- timestamps.
- لا يوجد unique على (member_id, measured_at)؛ يمكن وجود أكثر من قياس في اليوم.

#### dbo.athlete_checkins — runtime coaching table

- id INT IDENTITY Primary Key.
- member_id INT NOT NULL FK cascade.
- checkin_date DATE NOT NULL.
- sleep_hours DECIMAL(4,1) من 0 إلى 24.
- sleep_quality وfatigue وsoreness وstress وmood INT من 1 إلى 5.
- resting_hr INT من 20 إلى 250.
- hrv DECIMAL(8,2) من 0 إلى 500.
- bodyweight_kg DECIMAL(8,2) من 0 إلى 1000.
- notes NVARCHAR(1000).
- timestamps.
- unique (member_id, checkin_date).

#### dbo.coaching_activity_events — runtime coaching table

- id INT IDENTITY Primary Key.
- member_id INT NOT NULL FK cascade.
- event_type VARCHAR(50).
- entity_type VARCHAR(40) NULL.
- entity_id INT NULL.
- details NVARCHAR(1000) NULL.
- created_at.
- يستخدم Timeline للملف وتسجيل الأحداث التدريبية/الغذائية.

#### dbo.workout_sessions

- id INT IDENTITY Primary Key.
- member_id INT NOT NULL FK cascade.
- program_id INT NULL وroutine_id INT NULL، كلاهما NO ACTION.
- started_at DATETIME2(0).
- ended_at DATETIME2(0) NULL.
- status VARCHAR(20) من started/completed/cancelled.
- notes NVARCHAR(1000).

#### dbo.workout_set_logs

- id INT IDENTITY Primary Key.
- session_id INT NOT NULL FK cascade.
- workout_exercise_id INT NULL FK NO ACTION.
- set_number INT من 1 إلى 100.
- weight_kg DECIMAL(10,2) >= 0.
- reps INT من 0 إلى 1000.
- completed_at DATETIME2(0).
- notes NVARCHAR(500).

#### dbo.meal_logs

- id INT IDENTITY Primary Key.
- member_id INT NOT NULL FK cascade.
- meal_item_id INT NULL FK إلى diet item بـNO ACTION.
- consumed_quantity DECIMAL(12,3) > 0.
- consumed_at DATETIME2(0).
- calc_calories وcalc_protein وcalc_carbs وcalc_fats DECIMAL(12,3).
- notes NVARCHAR(500).
- created_at.
- الحسابات محفوظة وقت التسجيل.

### 4.5 النسخ الاحتياطية

#### dbo.gym_backup_operations

- id INT IDENTITY Primary Key.
- operation_type VARCHAR(20) من download/inspect/restore.
- file_name NVARCHAR(260).
- source_generated_at DATETIME2(0).
- row_count INT.
- table_counts NVARCHAR(MAX) — JSON.
- status VARCHAR(20) من success/failed.
- details NVARCHAR(1000).
- created_at.

#### dbo.gym_backup_archives

- id INT IDENTITY Primary Key.
- backup_day DATE.
- file_name NVARCHAR(260).
- backup_format VARCHAR(10) من json.gz/bak.
- generated_at DATETIME2(0).
- content VARBINARY(MAX).
- content_bytes BIGINT.
- row_count INT.
- table_counts NVARCHAR(MAX).
- created_at.
- unique (backup_day, backup_format).

### 4.6 الفهارس المهمة

الفهارس الأساسية تغطي:

- latest membership: (member_id, end_date DESC).
- payment ledger: (membership_id, created_at DESC) و(paid_at DESC).
- attendance: unique (member_id, attendance_date) وdate ordering.
- coaching list: member/status/start date، routine/program sort، meal/plan sort.
- progress: measurements member/date، sessions member/start، logs member/date.
- library filter: body part/category/difficulty/equipment/target muscle.

---

## 5. الواجهات والشاشات

### 5.1 الهيكل العام

الصفحة الرئيسية في public/index.html تحتوي على:

- Brand/Top actions.
- تبويبات hash:
  - dashboard
  - members
  - trainees
  - management
  - attendance
  - expenses
  - library
  - reports
- dialogs native HTML dialog للعمليات المركبة.
- الـdefault tab عند فتح التطبيق هو لوحة التحكم.

التبويبات لا تمثل routes server مستقلة؛ هي حالات واجهة داخل SPA، بينما بعض الـprint يفتح
window جديدة لأن الطباعة تحتاج document مستقلًا.

### 5.2 الحوارات المشتركة

الحوارات الموجودة:

- إضافة/تعديل عضو.
- إجراء عام: تجميد، تجديد، دفع، حذف.
- تفاصيل عضو وملفه الكامل.
- أسعار الباقات.
- أنواع العضويات.
- إضافة/تعديل مصروف.
- قارئ QR.
- QR عضو.
- نموذج مكتبة وdetails.
- ملف المتدرب الخارجي.
- Builder التدريب/التغذية.
- restore backup.
- measurement/check-in dialogs الديناميكية.

كل dialog قابل للتمرير داخليًا عند صغر الشاشة، لكن يجب التفريق عند النقل بين scroll
الـdialog المقصود وبين dropdown popover؛ الـdropdown في builder يعتمد على popover مخصص
لتجنب خروج القائمة خارج النافذة.

---

## 6. نظام Membership بالتفصيل

### 6.1 شاشة المشتركين

#### شريط الأدوات

- بحث بالاسم أو الهاتف.
- filter status.
- sort:
  - الأقرب انتهاء.
  - الأحدث.
  - المبلغ المتبقي.
- pagination server-side.
- default page size = 5، والحد الأعلى المسموح للطلب = 50.
- refresh.
- زر إضافة عضو.

#### الأعمدة الحالية

- المشترك: avatar/initial، الاسم، الهاتف، البريد.
- الاشتراك: الباقة والنوع.
- الحالة: active / expiring_soon / expired / frozen.
- تاريخ الانتهاء الفعال والأيام المتبقية.
- التجميد: count من أصل 3.
- الحساب: المستحق والمدفوع والمتبقي.
- الإجراءات.

الإجراءات الأساسية:

- تفاصيل.
- تعديل البيانات والاشتراك.
- تجديد.
- تجميد أو استئناف.
- تسجيل دفعة.
- حضور/انصراف سريع.
- QR.
- تدريب/تغذية من امتداد الملف.
- طباعة؛ في النسخة الحالية جرى وضع الطباعة داخل قائمة المزيد بصريًا، لكن API/function
  الطباعة مستقل في print-enhancements.js.
- حذف العضو.

### 6.2 نموذج إضافة/تعديل المشترك

#### بيانات الشخص

| الحقل | إلزامي | القاعدة |
|---|---|---|
| fullName | نعم | نص حتى 120 |
| phone | نعم | حتى 30، format هاتف، normalized comparison |
| email | لا | حتى 254، basic email validation |
| registrationDate | نعم عمليًا | تاريخ فقط |
| notes | لا | حتى 1000 |

#### بيانات Membership

| الحقل | القاعدة |
|---|---|
| membershipPlan | default gym_only، يجب أن يكون plan معروفًا |
| membershipType | type معروف أو legacy alias متوافق |
| startDate | تاريخ صحيح |
| endDate | يحسب من النوع، ويمكن قبول قيمة يدوية عند edit حسب المسار |
| membershipNotes | حتى 1000 |

#### الحساب

| الحقل | القاعدة |
|---|---|
| listPrice / amountDue | يحددها server من catalog |
| discountAmount | غير سالب ولا يتجاوز السعر |
| amountPaid | غير سالب ولا يتجاوز المستحق |
| paymentMethod | cash/card/transfer/other |
| paidAt | تاريخ الدفع عند وجود دفعة |
| WhatsApp | checkbox واجهة يجهز رسالة يدوية بعد النجاح، لا يرسل تلقائيًا من backend |

### 6.3 توحيد الهاتف ومنع التكرار

دالة normalization:

1. تحويل الأرقام العربية إلى English digits.
2. إزالة non-digits.
3. إزالة prefix 00.
4. تحويل رقم مصر بصيغة 20xxxxxxxxxx إلى 0xxxxxxxxxx.
5. رفض الناتج إذا كان أقل من 5 أرقام.

قبل إنشاء أو تعديل عضو:

- مقارنة phone_normalized مع كل الأعضاء.
- مقارنة email بدون حساسية حالة الأحرف.
- عند وجود duplicate يرجع HTTP 409 مع:
  - code: DUPLICATE_MEMBER_PHONE أو DUPLICATE_MEMBER_EMAIL.
  - field.
  - memberName.
  - وفي بعض مسارات coaching memberId.
- الواجهة تعرض validation داخل الـdialog في SweetAlert/validation surface مركزي، حتى لا تظهر
  الرسالة خلف النافذة.

ملاحظة إعادة بناء: لا تعتمد على scan كامل للجدول عند نمو النظام؛ استخدم unique index على
قيمة normalized وemail بعد تنظيف البيانات.

### 6.4 التسعير وحساب تاريخ النهاية

أولوية السعر:

1. قيمة override من membership_type_prices(plan_code, type_code).
2. إن لم توجد، السعر الشهري للباقة × price_multiplier.
3. amountDue = listPrice - discountAmount.

حساب end date inclusive:

- duration_mode = days: end = start + duration_value - 1 day.
- duration_mode = months: end = addMonths(start, duration_value) - 1 day.

الفترة الشهرية من 1 أغسطس إلى 31 أغسطس إذا بدأت في 1 أغسطس، وليست 30 يومًا ثابتة.

### 6.5 حالات Membership

يتم اختيار أحدث Membership للعضو بترتيب end date تنازليًا ثم id.

أولًا تحسب النهاية الفعالة:

    effectiveEndDate = originalEndDate + مجموع أيام التجميد

ثم:

- frozen: يوجد freeze غير مستأنف يغطي اليوم.
- expired: النهاية الفعالة قبل اليوم.
- expiring_soon: الأيام المتبقية بين 0 و7 شاملًا.
- active: غير ذلك مع Membership سارية.

التاريخ المستخدم هو Cairo date-only، وليس new Date() المحلي غير المنضبط.

### 6.6 الإضافة في Transaction

POST /api/members ينفذ:

1. validation وduplicate check.
2. تحميل pricing catalog.
3. حساب السعر والتاريخ.
4. insert members.
5. insert memberships.
6. insert صف gym_payments.
7. إذا المدفوع > 0: insert transaction من نوع subscription.
8. insert membership_events من نوع created.
9. commit.
10. يرجع member mapped، مع membership/payment وQR token.

أي exception يعمل rollback، فلا يفترض أن يظهر عضو بلا اشتراك في مسار الإضافة العادي.

### 6.7 التعديل

PUT /api/members/:id:

- يحدث البيانات الأساسية وMembership الحالية والحساب.
- يعيد حساب المستحق.
- إذا تغيرت القيمة المدفوعة، يضيف transaction delta بدل overwrite للتاريخ.
- يكتب event updated.
- لا يوجد optimistic version على Member نفسه.

### 6.8 التجميد والاستئناف

POST /api/members/:id/freeze:

- days integer من 1 إلى 365.
- reason اختياري حتى 500.
- لا يسمح بتجميد عضو expired.
- لا يسمح بتجميد إذا يوجد freeze active.
- الحد الأقصى التاريخي 3 مرات للعضو.
- يسجل row في membership_freezes وevent.
- يمدد النهاية الفعلية بعدد الأيام.

POST /api/members/:id/resume:

- يتطلب freeze نشطًا.
- يضع resumed_date.
- الحالة تعود active/expiring حسب التاريخ الفعال.
- لا يحذف سجل التجميد.

### 6.9 التجديد وإضافة Membership لاحقة

POST /api/members/:id/renew وPOST /api/members/:id/memberships يستخدمان نفس service:

- إذا العضو بلا Membership: إنشاء Membership جديدة تبدأ اليوم.
- إذا الحالية expired: البداية اليوم.
- إذا الحالية ما زالت سارية: البداية اليوم التالي للنهاية الفعالة.
- إذا frozen حاليًا: يرفض التجديد حتى الاستئناف.
- يحفظ Membership جديدة، summary payment، transaction subscription عند الدفع، event.
- لا ينشئ Member جديدًا.

### 6.10 الدفع والدفتر المالي

POST /api/memberships/:id/payments يقبل:

- paymentAmount كقيمة incremental، أو
- amountPaid كقيمة مطلقة جديدة.

الخدمة:

1. تتحقق من membership.
2. تحدث summary gym_payments.
3. تحسب delta.
4. تضيف transaction payment أو adjustment.
5. تصدر receipt number في response mapping بصيغة TG-000001 اعتمادًا على transaction id.
6. تسجل event.

الدفتر الكامل في details يحتوي:

- رقم الإيصال.
- تاريخ/وقت العملية.
- نوع العملية.
- الباقة والنوع.
- قيمة العملية.
- الرصيد المتبقي.
- طريقة الدفع.
- الملاحظات.

### 6.11 حذف Member

DELETE /api/members/:id عملية مادية وليست archive:

1. تفصل workout_set_logs.workout_exercise_id إلى NULL.
2. تفصل meal_logs.meal_item_id إلى NULL.
3. تفصل session program/routine عند الحاجة.
4. تحذف member، ثم cascade لباقي أبناء العضو.

النتيجة: البرامج والاشتراكات والحضور والأحداث والمدفوعات المرتبطة بالعضو تزول، بينما
بعض logs قد تبقى orphaned مع member_id cascade لا يبقى؛ لذلك يجب اعتبار الحذف destructive.

### 6.12 Membership API catalog

| Method | Endpoint | الوظيفة | Response |
|---|---|---|---|
| GET | /api/members | list/search/filter/pagination | members, pagination |
| GET | /api/members/:id | عضو مختصر | member |
| GET | /api/members/:id/details | الملف الكامل | member, memberships, freezes, payments, financialSummary, events |
| POST | /api/members | عضو + اشتراك + حساب | 201 member |
| PUT | /api/members/:id | تعديل العضو والاشتراك | member |
| POST | /api/members/:id/freeze | تجميد | member |
| POST | /api/members/:id/resume | استئناف | member |
| POST | /api/members/:id/renew | تجديد | member |
| POST | /api/members/:id/memberships | إضافة Membership بنفس العضو | 201 member |
| POST | /api/memberships/:id/payments | دفع/تعديل الرصيد | member |
| DELETE | /api/members/:id | حذف كامل | 204 |
| GET | /api/pricing | catalog الأسعار | plans, types, prices, aliases, durations |
| PUT | /api/pricing | تحديث جماعي للأسعار | catalog |
| PUT | /api/pricing/:planCode | تعديل باقة | catalog |
| POST/PUT | /api/pricing-plans[/code] | CRUD الباقات | catalog |
| POST/PUT | /api/membership-types[/code] | CRUD الأنواع | catalog |

### 6.13 مثال payload للإضافة

    {
      "fullName": "اسم العميل",
      "phone": "01000000000",
      "email": "member@example.com",
      "registrationDate": "2026-08-16",
      "notes": "ملاحظات",
      "membershipPlan": "gym_only",
      "membershipType": "monthly",
      "startDate": "2026-08-16",
      "discountAmount": 0,
      "amountPaid": 150,
      "paymentMethod": "cash"
    }

السيرفر هو المسؤول عن السعر النهائي، المستحق، تاريخ النهاية، وQR token. لا تثق في
amountDue القادم من الواجهة.

### 6.14 الطباعة وWhatsApp

الطباعة في print-enhancements.js تدعم:

- صف/اشتراك.
- إيصال دفعة.
- ملف عضو كامل.
- برنامج تدريب.
- خطة تغذية.
- print window مستقل.
- PDF محلي باستخدام html2pdf يتم تحميله عند الحاجة، مع A4 وCSS print.css.

رأس المستند:

- شعار/favicon.
- TOP GYM مرة واحدة.
- نوع المستند.
- اسم/هاتف العضو.
- رقم العضو أو الإيصال.
- تاريخ الطباعة.

التذييل:

- إدارة الجيم.
- C/ Ahmed Abdel Hamid · C/ Karim Abdelhamid.

WhatsApp:

- يتم تجهيز رسالة friendly في المتصفح باستخدام الرقم نفسه.
- يفتح conversation عبر السلوك الموجود في helper/feature الحالي.
- لا يوجد WhatsApp provider أو إرسال server-side.
- الإرسال النهائي يدوي من المستخدم.
- قوالب الرسائل الحالية تشمل: تسجيل جديد، قرب الانتهاء، انتهاء، مبلغ متبقٍ، غياب طويل.

---

## 7. نظام الحضور والانصراف

### 7.1 مصادر التعرف

يمكن تحديد العضو عبر:

- رقم الهاتف normalized.
- QR token مثل TOPGYM-MEMBER:123.
- TOPGYM|MEMBER|123.
- URL يحتوي /qr/123.
- query memberId أو member.
- JSON فيه memberId.

### 7.2 Check-in

POST /api/attendance/check-in:

1. يحل العضو من phone/QR.
2. يتأكد أن لديه Membership سارية اليوم.
3. يرفض expired أو frozen أو خارج فترة العضوية.
4. يتأكد من عدم وجود record في نفس اليوم.
5. ينشئ gym_attendance مع source phone/qr/manual.
6. يرجع record واسم العضو ورسالة نجاح.

Duplicate نفس اليوم يرجع 409 مع attendance record الحالي.

### 7.3 Check-out

POST /api/attendance/check-out:

- يجد record اليوم.
- يرفض إذا لا يوجد check-in.
- يرفض إذا سبق checkout.
- لا يشترط إعادة التحقق من Membership active للانصراف.
- يكتب timestamp وsource.

### 7.4 Auto checkout

reconcileAutoCheckout يستدعى عند قراءة أو تعديل attendance:

- أي record مفتوح أقدم من ATTENDANCE_AUTO_CHECKOUT_MINUTES يغلق.
- source يصبح auto.
- الافتراضي 60 دقيقة والحد الأعلى 1440.
- يحافظ على check-in الأصلي ولا يغير تاريخ attendance.

### 7.5 تقارير الحضور

GET /api/attendance:

- تاريخ اليوم افتراضيًا.
- search اختياري.
- summary + records + autoClosed + threshold.

GET /api/attendance/member/:id:

- من بداية الشهر حتى اليوم افتراضيًا.
- from/to اختياريان.
- records مرتبة تنازليًا.

GET /api/attendance/report:

- افتراضيًا آخر 30 يومًا.
- أقصى نطاق 366 يومًا.
- summary: إجمالي الزيارات، unique members، المفتوح، المغلق، متوسط الدقائق، الغائبين.
- daily buckets.
- ترتيب الأعضاء حسب الزيارات.
- absent members: لديهم Membership متقاطعة مع الفترة ولم يسجلوا حضورًا، مع استثناء freeze نشط.

### 7.6 QR

GET /qr/:id صفحة HTML عامة نسبيًا تعرض:

- TOP GYM.
- الاسم والهاتف.
- الباقة والنوع.
- البداية والنهاية الفعالة.
- الحالة والأيام المتبقية.
- QR token.

الواجهة تنشئ QR للعضو الجديد أو عند طلب عضو حالي، ويمكن scan من كاميرا الهاتف عبر HTTPS.

---

## 8. نظام المتدربين والتدريب

### 8.1 قاعدة الأهلية

لا يشترط وجود Membership لإنشاء برنامج تدريب أو خطة تغذية. الشرط الوحيد هو وجود Member
صحيح يمكن ربط النظام به.

المتدرب الخارجي في الواجهة هو Member يحقق الشرطين:

1. لديه برنامج Training غير archived أو Diet Plan غير archived.
2. لا يملك Membership فعالة اليوم، مع احتساب freeze في effective end.

إذا انتهت Membership لمشترك سابق، وكان لديه برنامج أو خطة، يظهر في شاشة المتدربين الخارجيين
حتى يظل ملفه موجودًا. بمجرد إضافة Membership جديدة إلى نفس member id يختفي من شاشة
الخارجيين ويعود إلى قائمة المشتركين دون فقد أنظمته.

### 8.2 شاشة المتدربين الخارجيين

المسار البصري: تبويب trainees داخل SPA.

#### Header

- label: إدارة التدريب والتغذية.
- title: المتدربون غير المشتركين.
- وصف يوضح أنهم عملاء لديهم Training/Nutrition بدون Gym active.
- زر إضافة متدرب خارجي.

#### KPI

- عدد المتدربين الخارجيين.
- عدد برامج التدريب.
- عدد خطط التغذية.
- عدد القياسات.

#### Toolbar

- بحث بالاسم أو الهاتف أو البريد.
- تحديث القائمة.
- pagination.
- default page في واجهة coaching هو 20، والـAPI يقبل حدًا أعلى 50.

#### جدول Desktop / Cards Mobile

البيانات:

- الاسم والهاتف والبريد.
- النوع External.
- عدد برامج التدريب.
- عدد خطط التغذية.
- ملخص خطة التغذية الحالية.
- عدد القياسات.
- آخر نشاط.
- فتح الملف.
- إنشاء/تعديل Training.
- إنشاء/تعديل Nutrition.
- حذف Diet.

عند عدم وجود نتائج بحث تعرض الواجهة Empty State. عند فشل التحميل تعرض retry.

### 8.3 إنشاء متدرب خارجي

POST /api/external-trainees يقبل بيانات أساسية فقط:

    {
      "fullName": "اسم المتدرب",
      "phone": "01000000000",
      "email": "optional@example.com",
      "registrationDate": "2026-08-16",
      "notes": "اختياري"
    }

العملية داخل Transaction واحدة لكنها insert واحد عمليًا:

1. validation.
2. duplicate phone/email check.
3. insert members.
4. commit.

لا يتم إنشاء Membership ولا Payment ولا QR مختلف؛ QR العضو العام يمكن إنشاؤه بعد ذلك
لكن الحضور نفسه لا يقبل external بلا Membership active.

### 8.4 خيارات العملاء داخل Builder

GET /api/coaching/clients?search=&limit=:

- يرجع حتى 300 عميل افتراضيًا حسب استدعاء الواجهة.
- يشمل الاسم والهاتف والبريد.
- لا يفرض وجود Membership.
- تستخدمه حقول اختيار العميل في Builder.

ملاحظة: النسخة الحالية لا تطبق CoachClient أو Tenant أو CoachId، رغم أن أسماء بعض
المفاهيم في الواجهة قد توحي بذلك.

### 8.5 ملف العميل التدريبي

GET /api/clients/:id/training-overview يرجع مركبًا:

- member.
- workoutPrograms.
- dietPlans.
- measurements.
- workoutSessions.
- mealLogs.
- checkins.
- execution summary.
- progress summary.
- activity timeline.
- alerts/insights.

واجهة الملف تحتوي:

1. بطاقة بيانات العميل.
2. KPI للجلسات، الوزن، الدهون، والتقدم.
3. تبويب/قسم تطور الوزن.
4. رسم أو bars للقياسات.
5. نسبة تنفيذ التدريب والتغذية.
6. القياسات CRUD.
7. المتابعة اليومية CRUD.
8. قائمة البرامج والخطط.
9. بدء جلسة وتسجيل وجبة.
10. نشاط العميل والتنبيهات.

### 8.6 Builder المشترك

Builder التدريب والتغذية Dialog واحد بثلاث مراحل:

1. معلومات أساسية.
2. بناء النظام.
3. Review قبل الحفظ.

حالة builder في الواجهة تحفظ:

- type: workout أو diet.
- id عند التعديل.
- memberId/memberName.
- step.
- draft.
- catalog.
- active routine.
- version عند التعديل.

في edit يتم تعطيل تغيير العميل، ويجب إرسال version الموجود لمنع overwrite لتعديل أحدث.

### 8.7 برنامج التدريب — المرحلة الأولى

الحقول:

| الحقل | القاعدة الحالية |
|---|---|
| client/member | إلزامي |
| name | إلزامي، حتى 160 |
| description | حتى 2000 |
| startDate | إلزامي، تاريخ صحيح |
| endDate | اختياري، لا يسبق البداية |
| durationWeeks | integer من 1 إلى 520 |
| goal | حتى 60؛ واجهة القيم: بناء العضلات، زيادة القوة، حرق الدهون، لياقة عامة، التحمل |
| level | حتى 40؛ مبتدئ، متوسط، متقدم |
| daysPerWeek | من 1 إلى 7 |
| status | draft/active/paused/completed/archived |
| notes | حتى 2000 |

إذا لم يرسل endDate وكان durationWeeks موجودًا:

    endDate = startDate + (durationWeeks × 7) - 1 day

لا يشترط backend إدخال كل goal/level كـenum؛ يتحقق من الطول والقيمة العملية، لذلك يجب
الاحتفاظ بقاموس الواجهة إن كانت النسخة الجديدة تريد نفس التجربة.

### 8.8 Workout Builder — المرحلة الثانية

البرنامج يحتوي على routines مرتبة:

| Routine field | القاعدة |
|---|---|
| name | مطلوب حتى 160 |
| dayOfWeek | null أو 1..7 |
| sortOrder | 0..9999 |
| notes | حتى 1000 |

كل routine يجب أن يحتوي تمرينًا واحدًا على الأقل عند الانتقال للمراجعة.

كل workout exercise:

| الحقل | القاعدة |
|---|---|
| exerciseId | مطلوب ويجب أن يوجد في gym_exercises |
| sortOrder | 0..9999 |
| sets | default 3، 1..100 |
| repsMin | 1..1000 |
| repsMax | 1..1000، لا يقل عن min |
| weightKg | 0..10000 |
| restSeconds | integer 0..7200 |
| rir | 0..10 |
| rpe | 1..10 |
| tempo | حتى 40 |
| supersetGroupId | حتى 40 |
| notes | حتى 1000 |

واجهة builder تعرض:

- Tabs للأيام.
- إضافة/حذف/تحريك الأيام.
- إضافة/حذف/تحريك التمارين.
- searchable select للتمرين.
- تعليمات، tips، common mistakes، target muscle من المكتبة.
- sets/reps/weight/rest/tempo/superset/RIR/RPE.
- إجمالي التمارين.
- إجمالي المجموعات.
- volume تقريبي.
- توزيع مجموعات الحمل على العضلات.

### 8.9 حسابات التدريب في الواجهة

لأغراض الـlive summary:

    averageReps = (repsMin + repsMax) / 2
    exerciseVolume = sets × averageReps × weightKg
    totalVolume = مجموع exerciseVolume

وتحسب العضلة المستهدفة من targetMuscleNameAr أو targetMuscleName أو fallback غير محددة،
ثم تجمع عدد sets لكل عضلة.

هذا volume تقديري، ولا يضيف عوامل tempo أو RPE أو وزن الجسم أو التمرينات التي لا تحتوي
weight مدخلًا.

### 8.10 Workout Review

قبل الحفظ تعرض الواجهة:

- العميل.
- اسم البرنامج.
- البداية والنهاية.
- المدة.
- الهدف والمستوى.
- عدد الأيام.
- عدد التمارين.
- عدد المجموعات.
- الحجم التقريبي.
- muscle distribution.
- جدول كل يوم وتمارينه.
- RIR/RPE عند وجودهما.
- أزرار Preview/Print/PDF/Save.

### 8.11 حفظ برنامج التدريب

POST /api/workoutprograms أو alias /api/workout-programs:

    {
      "memberId": 71,
      "name": "برنامج القوة",
      "description": "وصف",
      "startDate": "2026-08-16",
      "endDate": "2026-09-12",
      "durationWeeks": 4,
      "goal": "زيادة القوة",
      "level": "متوسط",
      "daysPerWeek": 3,
      "status": "active",
      "notes": "ملاحظات",
      "routines": [
        {
          "name": "اليوم الأول",
          "dayOfWeek": 1,
          "sortOrder": 0,
          "notes": "",
          "exercises": [
            {
              "exerciseId": 12,
              "sortOrder": 0,
              "sets": 4,
              "repsMin": 8,
              "repsMax": 12,
              "weightKg": 50,
              "restSeconds": 90,
              "rir": 2,
              "rpe": 8,
              "tempo": "3-1-2-0",
              "supersetGroupId": null,
              "notes": ""
            }
          ]
        }
      ]
    }

سيرفر التدريب:

1. يضمن الجداول والمكتبة.
2. يتحقق من member.
3. يطبع/يطبعن payload nested.
4. يبدأ transaction.
5. inserts البرنامج.
6. يتحقق من كل exerciseId قبل ترك transaction.
7. inserts routines ثم exercises.
8. يسجل coaching activity event.
9. commit.
10. يرجع برنامجًا مفصلًا مع member info وعدادات وروابط المكتبة.

فشل أي Exercise أو FK أو validation يعمل rollback كامل.

### 8.12 تعديل وحذف وحالة البرنامج

PUT /api/workoutprograms/:id:

- memberId immutable.
- يستخدم version.
- عند version mismatch يرجع 409.
- يقفل البرنامج بـ UPDLOCK/HOLDLOCK.
- يحدث metadata وversion+1.
- يفصل set logs عن workout_exercises القديمة.
- يفصل sessions عن program/routine عند الحاجة.
- يحذف routines cascade ويعيد إدخال structure الجديدة داخل نفس transaction.
- يسجل event.

PATCH /api/workoutprograms/:id/status:

- يغير status إلى قيمة مسموحة.
- يزيد version.
- يسجل event.

DELETE /api/workoutprograms/:id:

- يفصل workout_set_logs references.
- يفصل workout_sessions references.
- يحذف البرنامج، routines، exercises cascade.
- يسجل event.

### 8.13 قوائم التدريب

GET /api/workoutprograms أو alias:

query:

- memberId أو clientId.
- search.
- status.
- level.

الاستجابة تتضمن:

- id/member/name/basic fields.
- status/version.
- created/updated.
- routineCount.
- exerciseCount.
- totalSets.

لا يوجد في الاستعلام فرض CoachId أو TenantId، لأن النظام الحالي ليس multi-coach.

---

## 9. نظام التغذية بالتفصيل

### 9.1 Nutrition Builder — المرحلة الأولى

الحقول الأساسية:

- العميل.
- اسم الخطة.
- تاريخ البداية.
- تاريخ النهاية الاختياري.
- عدد الوجبات اليومية: 3 أو 4 أو 5 أو 6 في الواجهة.
- status.
- Target Calories.
- Target Protein.
- Target Carbs.
- Target Fat.
- description.
- notes.

### 9.2 حاسبة BMR/TDEE الحالية

الواجهة تستخدم Mifflin–St Jeor:

    male BMR   = 10 × weightKg + 6.25 × heightCm - 5 × age + 5
    female BMR = 10 × weightKg + 6.25 × heightCm - 5 × age - 161

معاملات النشاط:

| key | factor |
|---|---:|
| sedentary | 1.2 |
| light | 1.375 |
| moderate | 1.55 |
| high | 1.725 |
| very_high | 1.9 |

    TDEE = BMR × activityFactor
    targetCalories = max(0, TDEE + calorieAdjustment)

الهدف:

- lose: default adjustment = -500.
- maintain: default adjustment = 0.
- gain: default adjustment = +300.

إذا عدّل المستخدم adjustment يدويًا، يتم احترامه ولا يعاد overwrite عند تغيير الهدف
لاحقًا في الجلسة.

عند الضغط على Apply:

    targetProtein = round(targetCalories × 0.30 / 4)
    targetCarbs   = round(targetCalories × 0.40 / 4)
    targetFats    = round(targetCalories × 0.30 / 9)

هذه نسب توزيع الطاقة الافتراضية، وليست توصية طبية ثابتة. الـbackend يخزن الأرقام ولا يعيد
حساب BMR من نفسه؛ الواجهة ترسل calculator metadata وbmr/tdee.

### 9.3 جلب آخر قياس

عند اختيار العميل في خطة جديدة:

1. تطلب الواجهة GET /api/clients/:id/measurements.
2. تختار أول قياس في response يحتوي weight أو height.
3. تملأ الوزن والطول فقط إذا كانا فارغين.
4. تحفظ measurementDate لعرض مصدر القيم.
5. العمر والنوع والنشاط لا يتم استنتاجها من القياس.

إذا فشل جلب القياس، يستمر builder ويتيح الإدخال اليدوي.

### 9.4 بناء الوجبات

النسخة الحالية تبدأ افتراضيًا بأربع وجبات:

- الفطور.
- وجبة خفيفة.
- الغداء.
- العشاء.

عدد الوجبات يضبط إلى نطاق 3..6 في الواجهة، مع دعم backend العام 1..12.

كل Meal:

| الحقل | القاعدة |
|---|---|
| name | مطلوب حتى 120 |
| mealTime | حتى 10 |
| sortOrder | ترتيب |
| notes | حتى 1000 |
| items | عنصر واحد على الأقل قبل review |

كل Meal item:

| الحقل | القاعدة |
|---|---|
| foodId | مطلوب ويجب أن يوجد |
| assignedQuantity | من 0.001 إلى 100000 |
| servingUnit | حتى 40 |
| sortOrder | ترتيب |
| notes | حتى 500 |

واجهة builder تعرض صفوفًا منظمة:

- الطعام searchable dropdown.
- الكمية والوحدة.
- calories/protein/carbs/fat للعنصر مباشرة.
- الإجمالي لكل وجبة.
- نقل الوجبة لأعلى/أسفل.
- حذف/إضافة وجبة وطعام.
- ملاحظات الوجبة.

### 9.5 حساب قيم الطعام

كل Food في المكتبة يمثل قيمًا عند serving_size، وغالبًا 100 جرام:

    factor = assignedQuantity / food.serving_size
    calcCalories = food.calories × factor
    calcProtein  = food.protein × factor
    calcCarbs    = food.carbs × factor
    calcFats     = food.fat × factor

الواجهة تعرض live totals بجمع العناصر، مع:

- إجمالي السعرات مقابل Target.
- progress percent للسعرات.
- Protein/Carbs/Fat مقابل الهدف.
- عدد الوجبات والأطعمة.
- المتبقي من السعرات.

### 9.6 Food snapshot

عند حفظ الخطة، service يقرأ food catalog ويكتب النتائج في:

- calc_calories.
- calc_protein.
- calc_carbs.
- calc_fats.

لذلك تغيير قيمة الطعام في المكتبة لا يغير خطة تاريخية محفوظة تلقائيًا. هذه خاصية مهمة
لإعادة البناء؛ احفظ snapshot أو version للمكتبة إذا كان المطلوب audit علمي.

### 9.7 Nutrition Review

تعرض المرحلة الثالثة:

- العميل.
- اسم الخطة.
- الفترة.
- الهدف: lose/maintain/gain.
- adjustment.
- BMR/TDEE.
- target calories/macros.
- current calculated totals.
- عدد الوجبات والأطعمة.
- كل وجبة في جدول مع الطعام والكمية والقيم.
- Preview/Print/PDF/Save.

### 9.8 حفظ خطة التغذية

POST /api/dietplans أو alias /api/diet-plans:

    {
      "memberId": 71,
      "name": "خطة بناء العضلات",
      "description": "وصف",
      "startDate": "2026-08-16",
      "endDate": "2026-09-15",
      "mealsPerDay": 4,
      "targetCalories": 2500,
      "targetProtein": 188,
      "targetCarbs": 250,
      "targetFats": 83,
      "calorieGoal": "gain",
      "calorieAdjustment": 300,
      "calculator": {
        "weightKg": 80,
        "heightCm": 180,
        "age": 30,
        "gender": "male",
        "activity": "moderate",
        "bmr": 1780,
        "tdee": 2759
      },
      "meals": [
        {
          "name": "الفطور",
          "mealTime": "08:00",
          "sortOrder": 0,
          "notes": "",
          "items": [
            {
              "foodId": 15,
              "assignedQuantity": 150,
              "servingUnit": "جرام",
              "sortOrder": 0,
              "notes": ""
            }
          ]
        }
      ],
      "status": "active",
      "notes": ""
    }

المعالجة داخل Transaction:

1. validation وmember existence.
2. insert diet plan metadata/calculator.
3. تحقق من كل foodId.
4. insert meals.
5. حساب snapshot لكل item.
6. insert meal items.
7. تسجيل activity event.
8. commit.

فشل أي food أو meal أو FK يعمل rollback كامل.

### 9.9 تعديل وحذف وحالة الخطة

PUT /api/dietplans/:id:

- member immutable.
- version conflict يرجع 409.
- يحدث metadata والأهداف والحاسبة.
- يفصل meal_logs.meal_item_id قبل حذف meals.
- يحذف meals/items cascade.
- يعيد بناء meals/items داخل transaction.
- يزيد version ويسجل event.

PATCH /api/dietplans/:id/status:

- status من draft/active/paused/completed/archived.
- يزيد version ويسجل event.

DELETE /api/dietplans/:id:

- يفصل meal logs.
- يحذف الخطة ووجباتها وعناصرها.
- لا يحذف food catalog.
- يسجل event.

### 9.10 قوائم التغذية

GET /api/dietplans أو alias:

query:

- memberId أو clientId.
- search.
- status.

الاستجابة تتضمن:

- basic plan data.
- target calories/macros.
- calorie goal/adjustment.
- calculator BMR/TDEE.
- status/version.
- mealCount/itemCount.

### 9.11 Meal logs

POST /api/meal-logs:

    {
      "memberId": 71,
      "mealItemId": 22,
      "consumedQuantity": 150,
      "consumedAt": "2026-08-16T12:00:00",
      "notes": "تم تناولها كاملة"
    }

الخدمة:

1. تتحقق من member وmeal item.
2. تتأكد أن item تابع لخطة هذا العضو.
3. factor = consumedQuantity / assignedQuantity.
4. تستخدم snapshot الموجود في item.
5. تحسب القيم الفعلية.
6. insert meal_logs.
7. تسجل activity event.

لا يوجد duplicate prevention لتسجيل نفس الوجبة، لأن التكرار قد يكون مقصودًا؛ لكن يجب
إضافة idempotency أو unique policy إذا كان التطبيق الجديد يحتاج حماية من double click.

GET /api/meal-logs:

- memberId/clientId.
- filters الزمنية في service.
- يرجع meal logs بالقيم المحسوبة.

### 9.12 خطة التدريب والتغذية كامتداد للمشترك

من تفاصيل العضو الحالي تظهر:

- فتح المتابعة.
- + تدريب.
- + تغذية.
- بدء جلسة.
- تسجيل وجبة.
- + قياس.

إضافة نظام لا تنشئ عضوًا ولا تغير Membership. وبالمقابل إضافة Membership لمتدرب خارجي
تتم عبر endpoint membership بنفس member id.

---

## 10. التنفيذ والتقدم والمتابعة

### 10.1 Workout sessions

POST /api/workoutsessions/start:

- memberId مطلوب.
- programId/routineId اختياريان لكن إن أرسلا يجب أن يخصا العضو.
- يمنع وجود session أخرى status=started للعضو.
- ينشئ status started.

GET /api/workoutsessions وGET /api/workoutsessions/:id:

- يرجع session والـset logs.
- volume = مجموع weightKg × reps.
- total reps = مجموع reps.

POST /api/workoutsessions/:id/sets:

- session يجب أن تكون مفتوحة.
- workoutExercise اختياري؛ إن أرسل يجب أن يكون ضمن نفس member/program/routine.
- setNumber من 1 إلى 100.
- يمنع duplicate لنفس session/exercise/set number.
- weight 0..10000، reps 0..1000.

POST /api/workoutsessions/:id/end:

- يقبل completed أو cancelled.
- لا ينهي session مغلقة.
- يكتب ended_at.
- يسجل activity.

### 10.2 Progress heuristic

الـprogress الحالي ليس adherence علميًا كاملًا؛ هو heuristic تشغيلي:

1. إذا للبرنامج endDate، total days = الفرق بين start/end؛ وإلا 84 يومًا.
2. elapsed days = اليوم - البداية، بحد أدنى 1.
3. expected units = (elapsed / 7) × unitsPerWeek، بحد أدنى 1.
4. percent = completed units / expected units × 100.
5. clamp بين 0 و100.

للبرنامج يستخدم الجلسات المكتملة، وللتغذية يستخدم meal log count/days وفق summary.

### 10.3 ملخص التنفيذ في ملف العميل

يشمل:

- total sessions/completed sessions.
- logged sets/reps.
- total training volume.
- meal log count/days.
- total logged calories/macros.
- checkin count.
- average workout completion.
- average nutrition completion.
- first/current weight وفرق الوزن.
- lastMeasurementAt.
- آخر activity.

### 10.4 القياسات

GET/POST/PUT/DELETE:

    /api/clients/:id/measurements
    /api/clients/:id/measurements/:measurementId

validation:

- measuredAt default today.
- يجب وجود قيمة قياس واحدة على الأقل.
- weight 0..1000.
- height 0..300.
- fat 0..100.
- محيطات الجسم 0..500.
- notes حتى 1000.
- كل العمليات scoped إلى member id.

### 10.5 Daily check-ins

GET/POST/PUT/DELETE:

    /api/clients/:id/checkins
    /api/clients/:id/checkins/:checkinId

الحقول:

- checkinDate.
- sleepHours.
- sleepQuality.
- fatigue.
- soreness.
- stress.
- mood.
- restingHr.
- hrv.
- bodyweightKg.
- notes.

unique يومي لكل عضو، مع readiness/insight UI في الملف. الحذف والتعديل scoped إلى نفس
العضو، وليس بمعرف عام فقط.

---

## 11. تقرير API مختصر للتدريب والتغذية

| Method | Endpoint | الوظيفة |
|---|---|---|
| GET | /api/external-trainees | external list/search/paging |
| POST | /api/external-trainees | basic member بدون membership |
| GET | /api/coaching/clients | client options للـbuilder |
| GET | /api/clients/:id/training-overview | ملف coaching مركب |
| PUT | /api/clients/:id | تعديل basic client |
| GET/POST | /api/clients/:id/measurements | list/create measurement |
| PUT/DELETE | /api/clients/:id/measurements/:measurementId | update/delete |
| GET/POST | /api/clients/:id/checkins | list/create daily checkin |
| PUT/DELETE | /api/clients/:id/checkins/:checkinId | update/delete |
| GET/POST/PUT/PATCH/DELETE | /api/workoutprograms | CRUD workout |
| GET/POST/PUT/PATCH/DELETE | /api/workout-programs | alias متوافق |
| GET/POST/PUT/PATCH/DELETE | /api/dietplans | CRUD nutrition |
| GET/POST/PUT/PATCH/DELETE | /api/diet-plans | alias متوافق |
| POST | /api/workoutsessions/start | بدء جلسة |
| GET | /api/workoutsessions | قائمة جلسات |
| GET | /api/workoutsessions/:id | تفاصيل جلسة |
| POST | /api/workoutsessions/:id/sets | تسجيل set |
| POST | /api/workoutsessions/:id/end | إنهاء جلسة |
| POST/GET | /api/meal-logs | تسجيل/قراءة الوجبات |

---

## 12. الإدارة المالية والـDashboard والتقارير

### 12.1 ملخص الشهر الحالي

GET /api/monthly-finance يرجع نطاق الشهر الحالي بحسب Cairo:

- monthStart.
- monthEnd أو current date.
- subscriptionTotal.
- expenseTotal.
- net.
- expenses list.

المعادلة:

    subscriptionTotal = مجموع gym_payment_transactions.amount_paid
                        حيث amount_paid > 0 وpaid_at داخل الشهر
    expenseTotal      = مجموع gym_expenses.amount
                        حيث expense_date داخل الشهر
    net               = subscriptionTotal - expenseTotal

مهم: التحصيل لا يحسب من gym_payments.amount_due ولا من كل Memberships، بل من ledger
transactions الموجبة بتاريخ الدفع. لهذا قد يختلف عن مجموع قيمة الاشتراكات المسجلة في
الفترة إذا كانت بعض الاشتراكات غير مدفوعة أو دفعت في تاريخ مختلف.

### 12.2 المصروفات

CRUD:

- POST /api/expenses.
- PUT /api/expenses/:id.
- DELETE /api/expenses/:id.

الحقول:

| الحقل | القاعدة |
|---|---|
| expenseName | مطلوب حتى 120 |
| amount | أكبر من 0 وحتى 9,999,999,999 |
| expenseDate | تاريخ صحيح، default اليوم |
| notes | اختياري حتى 500 |

بعد كل عملية تعيد الواجهة تحميل monthly finance، لذلك يتحدث net تلقائيًا.

### 12.3 Dashboard الأساسي

GET /api/dashboard يجمع:

- إجمالي الأعضاء أصحاب Membership.
- active.
- expiring soon.
- expired.
- frozen.
- alerts.
- debtors.
- inactive members.
- monthly finance حسب widget.

التنبيهات:

1. status alerts للعضوية: frozen/expiring/expired.
2. debt alerts عندما amountRemaining > 0.
3. inactivity للعضو النشط الذي لا يملك زيارة أو آخر زيارة أقدم من 7 أيام.
4. de-duplication على kind:id.
5. الواجهة الحالية تمنع عرض عضو بلا Membership في alerts الرئيسية.

التنبيه يحتوي عادة على:

- نوع alert.
- member id/name/phone.
- السبب.
- التاريخ أو المتبقي.
- إجراء WhatsApp يدوي.

### 12.4 Dashboard analytics

GET /api/dashboard-analytics?period=week|month|year.

#### الفترات

- week: من الاثنين إلى الأحد، buckets يومية.
- month: من أول الشهر إلى آخره، buckets يومية.
- year: يناير إلى ديسمبر، buckets شهرية.

#### KPIs

- currentMembers.
- activeMembers.
- expiringSoon.
- expiredMembers.
- frozenMembers.
- newMembers.
- newMemberships.
- paidTransactions.
- collected.
- expenseCount.
- expenses.
- net.
- outstandingCount.
- outstanding.
- alertsCount.

#### Trend

- collected.
- expenses.
- newMembers.
- newMemberships.
- paidTransactions.
- expenseTransactions.

#### Distribution

- statuses.
- plans.
- types.
- paymentMethods.

#### Attendance analytics

- visits.
- uniqueMembers.
- activeDays.
- averageVisitsPerDay.
- openVisits.
- inactiveMembers.
- peakHour.
- daily visits/unique members.
- peak up to 6 hours.
- top up to 8 members.
- inactive up to 12 members.

ساعة الحضور تحوّل إلى Africa/Cairo بواسطة Intl، ثم تجمع على ساعة 0..23.

### 12.5 التقارير العامة

GET /api/reports:

- from/to اختياريان.
- default من بداية الشهر إلى اليوم.
- أقصى نطاق 730 يومًا.
- from لا يتجاوز to.

الـresponse يحتوي:

- summary.
- plan/status/payment method breakdown.
- daily timeline.
- memberships.
- payments.
- expenses.
- coaching stats.
- coaching status.
- library counts/new rows.
- debtors.
- members.

الكميات القصوى في queries الحالية تصل عادة إلى 1000 صف للقوائم، و50 debtor في بعض
الواجهات.

### 12.6 فرق حسابي يجب توثيقه

في تقرير الفترة:

- summary outstanding/debtors يعتمد على كل gym_payments.amount_remaining > 0.
- قيمة summary.outstanding في جزء من report service تعتمد على Memberships الموجودة
  داخل الفترة المختارة، لا على كل أعضاء المدينين.

هذا قد يسبب اختلافًا بين إجمالي المديونية في summary وقائمة debtors. عند إعادة البناء
يجب اختيار تعريف واحد: مديونية كل الأعضاء حتى تاريخ التقرير، أو مديونية اشتراكات
بدأت داخل الفترة، ثم استخدامه في كل widgets.

### 12.7 مكتبة التدريب والتغذية

GET /api/library/options يرجع options مختصرة.

GET/POST/PUT/DELETE:

    /api/library/muscles
    /api/library/foods
    /api/library/exercises

كل نوع يدعم:

- list مع page/search/filter.
- item details.
- create.
- update.
- delete.

الـAPI يضع private cache قصيرًا: max-age 20 وstale-while-revalidate 60، لأن المكتبة
تقرأ كثيرًا داخل dropdowns.

المكتبة الحالية مستوردة من ملفات LogicFit seed:

- muscles.json.
- foods.json.
- exercises.json.

يوجد source_id للمزامنة ومنع التكرار. حذف Muscle/Exercise/Food مستخدم داخل نظام قد
يرفضه FK NO ACTION؛ يجب عرض خطأ واضح أو استخدام archive بدل delete في النسخة الجديدة.

---

## 13. النسخ الاحتياطي والاسترجاع

### 13.1 أنواع النسخ

الـAPI يدعم:

- .json.gz: gzip compressed JSON.
- .bak: نفس payload المخصص مضغوطًا، لكن بامتداد bak.

مهم: .bak الحالي ليس native SQL Server full backup. هو custom compressed JSON backup
داخل octet-stream. لذلك لا يمكن استعادته بأداة SQL Server Restore؛ يجب استخدام endpoint
الخاص بالتطبيق.

### 13.2 محتوى النسخة

Payload النسخة يحتوي:

- format: top-gym-json-backup.
- version: 1.
- generatedAt.
- timeZone.
- schemaSql.
- tables.
- tableCounts.
- rowCount.
- integrity SHA-256.

الجداول التي تدخل النسخة هي جداول التطبيق المحددة في BACKUP_TABLES، وتشمل:

- members.
- memberships.
- membership_pricing.
- membership_types.
- membership_type_prices.
- membership_freezes.
- gym_payments.
- gym_payment_transactions.
- gym_expenses.
- gym_attendance.
- membership_events.
- gym_muscles.
- gym_foods.
- gym_exercises.
- workout_programs.
- workout_routines.
- workout_exercises.
- diet_plans.
- diet_meals.
- diet_meal_items.
- body_measurements.
- athlete_checkins.
- coaching_activity_events.
- workout_sessions.
- workout_set_logs.
- meal_logs.

لا تدخل النسخة جدول dbo.Payments المشترك غير التابع للتطبيق.

### 13.3 Download

GET /api/backup/download?format=json.gz أو format=bak:

1. يقرأ الجداول الحالية.
2. يبني JSON.
3. يحسب integrity.
4. يضغط gzip في الذاكرة.
5. يسجل operation من نوع download.
6. يرسل الملف مباشرة للمستخدم.
7. لا يخزن النسخة اليدوية على السيرفر.

أسماء الملفات:

    backup_YYYY-MM-DD_HH-mm.json.gz
    backup_YYYY-MM-DD_HH-mm.bak

Content-Type:

- application/gzip لـjson.gz.
- application/octet-stream لـbak.

### 13.4 Inspect

POST /api/backup/inspect:

- body raw binary.
- header اختياري X-BACKUP-FILENAME.
- limit upload 25MB.
- يتحقق من gzip magic.
- gunzip.
- JSON parse.
- format/version.
- known tables.
- members array.
- primitive row values.
- row limits.
- integrity SHA-256 إن وجدت.

حدود الفحص:

- compressed upload حتى 25MB.
- decompressed JSON حتى 80MB.
- rows حتى 150,000.

يرجع:

- valid.
- generatedAt/timeZone.
- compressedBytes/jsonBytes.
- rowCount.
- tableCounts.
- integrity verified.

### 13.5 Restore

POST /api/backup/restore:

- body raw binary.
- header X-TOP-GYM-RESTORE-CONFIRM: RESTORE إلزامي.
- filename header اختياري.

الاسترجاع:

1. يفحص الملف بنفس inspect.
2. يمنع restore متزامنين عبر in-process flag.
3. يضمن الجداول.
4. يبدأ Transaction.
5. يحذف بيانات الجداول بترتيب عكسي.
6. يعيد الإدخال بترتيب foreign-key صحيح.
7. يستخدم identity insert عند الحاجة.
8. commit أو rollback كامل.
9. يسجل restore operation.

العملية destructive full replacement، ولا توجد شاشة merge. لا يتم بعد restore تلقائيًا
إجراء verification شامل لكل count خارج حدود transaction؛ لذلك يجب إضافة post-restore
verification في مشروع إعادة البناء.

### 13.6 الأرشيف المجدول

GET /api/backup/daily:

- محمي بطلب cron/user-agent أو CRON_SECRET.
- ينشئ backup format bak.
- يخزن content داخل gym_backup_archives.
- unique يوم/format يمنع نسخة ثانية لنفس اليوم والصيغة.
- يحذف الأرشيفات التي created_at أقدم من الآن ناقص يومين.
- يسجل العملية.

الاحتفاظ الحالي rolling based on created_at، وليس ضمانًا دقيقًا لعدد يومين تقويميين إذا
فشل cron أو تغير وقت التنفيذ. يوجد في قاعدة البيانات وقت المراجعة 3 archives بصيغة bak
لأيام 2026-08-14 إلى 2026-08-16.

### 13.7 سجل النسخ

GET /api/backup/history?limit=&archiveLimit= يرجع:

- operations: download/inspect/restore، success/failed، filename، counts، details، date.
- archives: id، day، format، filename، bytes، row count، generated/created dates.

GET /api/backup/archives/:id ينزل archive stored.

DELETE /api/backup/archives/:id يحذف archive من database، ولا يحذف operation log.

---

## 14. السلوك المشترك للـAPI والأمان والصلاحيات

### 14.1 شكل الأخطاء

server.js يغلف async routes ويحول الأخطاء إلى response موحد قدر الإمكان:

    {
      "error": "رسالة قابلة للعرض",
      "code": "OPTIONAL_MACHINE_CODE",
      "field": "optionalField",
      "memberName": "optional duplicate owner",
      "memberId": 123,
      "attendance": {}
    }

قواعد عامة:

- أخطاء validation غالبًا 400.
- duplicate/conflict غالبًا 409.
- missing resource غالبًا 404.
- restore بدون confirmation 400.
- أخطاء السيرفر الداخلية 500 مع إخفاء التفاصيل الحساسة.

### 14.2 النقل والتخزين

- كل SQL requests parameterized عبر mssql inputs.
- البيانات العربية NVARCHAR.
- الأموال DECIMAL وليست floating point في SQL.
- timestamps مخزنة UTC، بينما date-only business dates تعالج في Cairo.
- API body JSON limit 1MB، باستثناء raw backup upload له parser وحد 25MB.

### 14.3 HTTP headers والـrate limit

يضيف server:

- X-Content-Type-Options: nosniff.
- X-Frame-Options: SAMEORIGIN.
- Referrer-Policy: strict-origin-when-cross-origin.
- Permissions-Policy: camera=(self), microphone=().
- API no-store/no-cache.
- static CSS/JS/assets cache لمدة يوم مع stale-while-revalidate.
- non-GET rate limit: 120 request/min/IP.

هذه حماية transport/basic hardening فقط، وليست Authentication أو Authorization.

### 14.4 الصلاحيات الحالية

الصلاحية الفعلية الحالية هي: أي عميل يصل للـAPI يملك قدرة الإدارة الكاملة.

لا توجد أدوار:

- مدير.
- استقبال.
- محاسب.
- مدرب.
- قراءة فقط.

ولا توجد:

- audit actor/user id.
- login.
- tenant isolation.
- coach-client relation.
- field-level permission.

membership_events وcoaching_activity_events يسجلان الحدث والوقت، لكن لا يسجلان من
نفذه؛ لأن user identity غير موجودة.

### 14.5 توصية نقل الصلاحيات

عند بناء المشروع الآخر، حافظ على domain services لكن أضف قبلها:

1. users.
2. roles/permissions.
3. sessions أو JWT/secure cookies.
4. actor_id في events.
5. tenant_id فقط إذا كان المطلوب multi-gym.
6. ownership checks لكل member/program/plan/report/backup.
7. حماية QR وrestore والـfinancial endpoints بشكل خاص.

---

## 15. الطباعة، PDF، والرسائل

### 15.1 مستندات العضوية

print-enhancements.js يبني HTML مستقلًا باللغة العربية RTL، ثم:

1. يطلب details أو payment data.
2. يبني header ثابتًا.
3. يضيف member hero.
4. يضيف membership/current account.
5. عند full mode يضيف:
   - financial ledger.
   - membership history.
   - freeze history.
   - events history.
6. يضيف footer.
7. يفتح print window أو يحول document إلى PDF.

### 15.2 مستندات التدريب

مستند برنامج التدريب يحتوي:

- TOP GYM والعميل.
- الفترة والحالة والإصدار.
- KPI: الأيام، التمارين، المجموعات، الحجم.
- الهدف والمستوى والأيام الأسبوعية.
- توزيع العضلات برسوم bars.
- كل Routine في جدول.
- الأعمدة: التمرين، العضلة، sets، reps، الوزن، الراحة، tempo/intensity، superset.
- مرجع تعليمات التمرين، tips، common mistakes.
- الملاحظات.

### 15.3 مستندات التغذية

مستند خطة التغذية يحتوي:

- العميل والخطة والفترة.
- target vs calculated calories.
- عدد الوجبات والأطعمة.
- calorie goal/adjustment.
- target macros.
- calculator fields: weight/height/age/gender/activity/BMR/TDEE.
- كل وجبة في جدول.
- food/quantity/calories/protein/carbs/fat.
- totals لكل وجبة وإجمالي macros.
- الملاحظات.

### 15.4 PDF المحلي

عند طلب PDF:

- يتم lazy load لمكتبة html2pdf.
- يحمّل print.css.
- ينشئ holder مخفي بعرض A4.
- ينتظر fonts/images.
- يستخدم html2canvas scale 2.
- jsPDF portrait A4.
- ينزل Blob باسم:

    TOP-GYM-Nutrition-اسم-الخطة-id.pdf
    TOP-GYM-Workout-اسم-البرنامج-id.pdf

الفشل يظهر Toast/alert ولا يغير بيانات التطبيق.

### 15.5 رسالة WhatsApp

الرسالة النهائية نص واحد كامل، وليست snippets منفصلة:

- الاسم الكامل.
- تفاصيل الاشتراك.
- الحساب.
- المتبقي يظهر فقط إذا كان أكبر من صفر في رسالة الإنشاء.
- الرسائل friendly باللهجة المصرية.
- frame النصي محفوظ كجزء من string واحدة؛ النقل يجب أن يحافظ على newline وعدم encoding
  الخاطئ للـemoji.
- فتح WhatsApp يدوي، ولا توجد API credentials أو إرسال تلقائي من الخادم.

فجوة عملية: إذا فتح المتصفح WhatsApp في tab/window خارج SPA، العودة إلى صفحة المشتركين
تعتمد على browser behavior وليس workflow server state.

---

## 16. الأداء وتحميل الواجهة

### 16.1 التحميل الأولي الحالي

الصفحة تحمل HTML/CSS وبعض ملفات JavaScript الأساسية، ثم يستخدم feature-loader لتحميل
ملفات التبويبات عند الحاجة. هذا يقلل الحمل النظري لكنه ليس route splitting كاملًا لأن
index.html يظل يملك هيكل كل dialogs، وبعض scripts مشتركة.

### 16.2 Lazy loading الموجود

- analytics الثقيلة للـdashboard بعد idle.
- reports/library/coaching/attendance feature scripts عند فتح التبويب.
- html2pdf عند طلب PDF.
- QR reader assets عند فتح قارئ QR.

### 16.3 نقاط الضغط الحالية

- شاشة builder تحمل catalog الأطعمة والتمارين، وقد تطلب صفحات كثيرة حتى تجمع المكتبة.
- client options قد تحمل حتى 300 عميل داخل select/search component.
- بعض table/card layouts موجودة معًا لتغطية Desktop/Mobile.
- dashboard يجمع عدة widgets واستعلامات.
- لا توجد React memoization؛ rendering هو innerHTML وإعادة بناء sections.

### 16.4 Pagination والبحث

- members server pagination، default 5، max 50.
- external trainees server pagination، API max 50، وUI state أوسع.
- search الأعضاء يستخدم debounce حوالي 300ms.
- library endpoints تدعم page/filter/cache.
- workout/diet list ليست server pagination قوية مثل members؛ تعيد list حسب filters.

### 16.5 نقاط يجب قياسها عند إعادة البناء

- first request إلى /api/bootstrap.
- زمن /api/dashboard.
- زمن فتح trainees.
- عدد requests عند فتح workout/diet builder.
- حجم catalog المحمل.
- LCP وCLS وINP على 390px.
- معدل إعادة render عند تعديل food quantity أو exercise field.

---

## 17. الفجوات والمخاطر والاختلافات الحالية

### 17.1 حماية البيانات

1. لا يوجد Auth أو RBAC؛ كل API الإدارة مكشوف لمن يصل للتطبيق.
2. restore endpoint يحتاج header confirmation لكنه لا يملك user authorization.
3. QR page يكشف بيانات عضو عند معرفة id.
4. backup archives مخزنة داخل نفس قاعدة البيانات؛ فقدان DB قد يفقد archives معها.

### 17.2 اتساق البيانات

1. duplicate phone/email يفحص في service وليس database unique؛ concurrent requests قد
   تتجاوز الفحص.
2. في بعض البيئات توجد runtime indexes/constraints غير واضحة في schema الأصلي؛ يجب استخراج
   schema من actual DB قبل النقل.
3. membership_events.membership_id وFK NO ACTION يجعل حذف membership منفردًا حساسًا.
4. حذف Member destructive، ولا يوجد archive/soft delete.
5. measurements تسمح بأكثر من قياس في نفس اليوم.
6. meal logs وset logs قد تصبح orphaned references منطقية بعد تعديل/حذف النظام.

### 17.3 اختلافات الزمن

1. timestamps UTC.
2. business date Cairo.
3. cron Vercel fixed UTC، وبالتالي لا يضمن 15:00 Cairo في الشتاء.
4. تقرير اليوم/الشهر يعتمد على date-utils، بينما أي SQL خارجي يجب ألا يستخدم server local
   timezone بالصدفة.

### 17.4 الحسابات المالية

1. monthly finance يعتمد على transactions موجبة بتاريخ paid_at.
2. report outstanding قد يختلف عن debtors كما سبق.
3. amountPaid في payment API له معنيان محتملان: absolute أو incremental حسب field.
4. يوجد summary row mutable وledger immutable؛ يجب عدم استخدام summary وحده في التقارير.

### 17.5 التدريب والتغذية

1. RIR/RPE runtime additions ويجب التأكد من وجودهما قبل insert في مشروع جديد.
2. target macros قابلة للإدخال يدويًا؛ لا يوجد backend scientific validation للعلاقة بين
   calories وmacros.
3. formula BMR/TDEE في الواجهة وليست service مركزية.
4. progress percent heuristic وليس قياسًا طبيًا/رياضيًا موحدًا.
5. meal item snapshot جيد للتاريخ، لكن لا يحفظ كل metadata الكامل للطعام داخل item.
6. لا توجد وسائط Coach/Client أو login للعميل.
7. لا يوجد منع duplicate meal log.

### 17.6 الواجهة

1. SPA hash tabs؛ refresh يعيد HTML العام ثم state UI.
2. بعض dropdowns مخصصة لتجنب خروجها من dialog، لكن native select والمكتبة لا يملكان
   نفس السلوك دائمًا.
3. بعض نصوص/بيانات legacy قد تظهر alias مثل two month ويجب عمل mapping.
4. RTL مع phone/date/email يحتاج dir=ltr داخل الخلايا.

---

## 18. مصفوفة حالات الحافة

| الحالة | السلوك الحالي | ما يجب اختباره عند النقل |
|---|---|---|
| رقم هاتف عربي أو يبدأ 00 | normalize قبل المقارنة | نفس الرقم لا ينشأ مرتين |
| رقم مصري بصيغة +20 | يتحول إلى صيغة محلية بعد إزالة non-digits | WhatsApp وduplicate وattendance |
| email بحروف مختلفة | compare lowercase | update لنفس العضو لا يرفض نفسه |
| عضو بلا Membership | مسموح في coaching، غير ظاهر في members list | external filter صحيح |
| متدرب خارجي يشترك لاحقًا | إضافة Membership لنفس member id | لا duplicate ولا فقد plans |
| Membership منتهية مع freeze | effective end يحسب أيام freeze | status/attendance |
| ثلاث freezes سابقة | freeze رابع يرفض | الحد التاريخي لا current count فقط |
| renew أثناء freeze | يرفض | resume ثم renew |
| amountPaid أكبر من due | 400 | لا negative remaining |
| دفعة إضافية بعد الاكتمال | يجب رفض تجاوز due | ledger لا يكسر constraint |
| تعديل سعر باقة قديمة | لا يغير list_price القديم | snapshot مالي |
| برنامج بدون routine | لا يمر للـsave | API وUI نفس rule |
| routine بدون exercise | لا يمر review/save | rollback عند API |
| exercise id محذوف من library | FK/validation error | لا برنامج ناقص |
| plan بدون meal/item | لا يمر save | transaction rollback |
| food catalog تغير | item snapshot لا يتغير | historical values ثابتة |
| حذف diet وله meal logs | nulling ثم delete | logs لا تكسر FK |
| حذف workout وله sessions/logs | nulling ثم delete | execution history مفهوم |
| duplicate check-in في نفس اليوم | 409 | لا سجل ثانٍ |
| check-in عضوية frozen/expired | يرفض | رسالة مفهومة |
| open attendance قديم | auto checkout | source=auto وduration |
| تغيير وقت الصيف/الشتاء | cron fixed UTC | backup local time |
| restore ملف تالف | inspect يرفض قبل delete | database بلا تغيير |
| restore ملف صحيح لكن بيانات كبيرة | limits 25MB/80MB/150k | رسالة حد واضحة |
| تقرير من أكبر من 730 يومًا | يرفض | pagination/export policy |
| اسم خطة طويل | print/UI truncation | لا layout break |

---

## 19. الاختبارات الموجودة وTest Plan

### 19.1 الاختبار الموجود

النطاق npm run test:smoke يشغل scripts/smoke-test.js ويختبر فعليًا:

1. init database وhealth.
2. download json.gz وbak.
3. inspect الصيغتين والتحقق من integrity.
4. invalid backup وrestore بدون confirmation.
5. history.
6. bootstrap وpricing.
7. external trainee وإنهاؤه.
8. dashboard analytics.
9. members pagination/search/status.
10. pricing plan/type create/update.
11. create member + QR page.
12. duplicate phone.
13. edit member.
14. freeze/resume/limit 3.
15. payment وledger.
16. renewal إلى plan/type مختلف.
17. details/receipts/events.
18. attendance check-in/duplicate/check-out.
19. member attendance report.
20. auto checkout.
21. next-day check-in.
22. cleanup للبيانات التجريبية.

### 19.2 اختبارات Membership المطلوبة لإعادة البناء

- create member without subscription إذا كان المنتج الجديد يسمح بذلك.
- create member with exact prices.
- month-end dates: Jan/Feb/leap year.
- half-month inclusive date.
- custom pair price overrides.
- invalid/negative discount/paid.
- duplicate concurrent phone.
- update payment and verify delta ledger.
- renew active/expired/frozen.
- freeze across end date.
- delete/restore data.
- debtor and monthly finance reconciliation.

### 19.3 اختبارات Training المطلوبة

- member active، expired، external، بلا membership.
- program with 1 routine/1 exercise.
- program with multiple routines and sort order.
- invalid exercise id.
- repsMax < repsMin.
- RIR/RPE boundary.
- version conflict update.
- failure halfway through nested insert، والتحقق أن لا rows بقيت.
- delete with session/set logs.
- start duplicate open session.
- wrong member routine/exercise.
- end completed/cancelled.
- volume and progress calculations.

### 19.4 اختبارات Nutrition المطلوبة

- Mifflin male/female known values.
- each activity factor.
- lose/maintain/gain defaults.
- manual adjustment preservation.
- latest measurement prefill.
- 3/4/5/6 meals.
- missing food id.
- quantity boundaries.
- food serving_size not 100.
- snapshot after library edit.
- plan update with meal logs.
- duplicate meal log policy.
- calories/macros review vs server totals.

### 19.5 اختبارات Security/Backup

- API بدون auth حاليًا يجب تسجيله كـknown gap، وليس نجاحًا أمنيًا.
- rate limit.
- body size.
- SQL injection input.
- XSS strings in names/notes/print.
- malformed gzip.
- invalid format/version.
- corrupted integrity.
- restore without exact confirmation.
- restore rollback on FK/value error.
- archive retention after 3+ days.
- cron authorization.
- DST scheduled time.

### 19.6 اختبارات UI/Responsive

الأحجام المطلوبة:

    1440px, 1280px, 1024px, 768px, 430px, 390px, 360px

لكل حجم:

- لا horizontal overflow غير مقصود.
- dialog validation في الطبقة الأمامية.
- dropdown داخل builder لا يخرج من dialog.
- search debounce.
- pagination.
- WhatsApp string كاملة ولا تتكرر.
- print preview/PDF A4.
- Arabic/emoji/font rendering.
- keyboard focus وreduced motion.

---

## 20. خريطة الـAPI الكاملة

هذا جدول تجميعي لكل المسارات المعرفة في server.js، مع الإشارة إلى التفاصيل الموسعة في
الأقسام السابقة.

| Method | Endpoint | المجال | ملاحظات |
|---|---|---|---|
| GET | /api/health | platform | اختبار اتصال DB |
| GET | /api/bootstrap | app bootstrap | members/dashboard/pricing/pagination |
| GET | /api/dashboard | dashboard | statuses/alerts/finance |
| GET | /api/dashboard-analytics | dashboard | period week/month/year |
| GET | /api/monthly-finance | finance | month current |
| POST | /api/expenses | finance | create |
| PUT | /api/expenses/:id | finance | update |
| DELETE | /api/expenses/:id | finance | delete |
| GET | /api/members | membership | list/search/status/sort/page |
| GET | /api/members/:id | membership | single member |
| GET | /api/members/:id/details | membership | complete file |
| POST | /api/members | membership | member + membership + payment |
| PUT | /api/members/:id | membership | update |
| POST | /api/members/:id/freeze | membership | freeze |
| POST | /api/members/:id/resume | membership | resume |
| POST | /api/members/:id/renew | membership | renew |
| POST | /api/members/:id/memberships | membership | add membership |
| POST | /api/memberships/:id/payments | membership | payment |
| DELETE | /api/members/:id | membership | destructive delete |
| GET | /api/pricing | pricing | catalog |
| PUT | /api/pricing | pricing | bulk update |
| PUT | /api/pricing/:planCode | pricing | plan update |
| POST | /api/pricing-plans | pricing | create plan |
| PUT | /api/pricing-plans/:planCode | pricing | update plan |
| POST | /api/membership-types | pricing | create type |
| PUT | /api/membership-types/:typeCode | pricing | update type |
| GET | /api/attendance | attendance | today/date |
| GET | /api/attendance/report | attendance | range report |
| GET | /api/attendance/member/:id | attendance | member history |
| POST | /api/attendance/check-in | attendance | phone/QR/manual |
| POST | /api/attendance/check-out | attendance | phone/QR/manual |
| GET | /api/external-trainees | coaching | external list |
| POST | /api/external-trainees | coaching | basic member |
| GET | /api/coaching/clients | coaching | client options |
| GET | /api/clients/:id/training-overview | coaching | full overview |
| PUT | /api/clients/:id | coaching | basic update |
| GET/POST | /api/clients/:id/measurements | progress | list/create |
| PUT/DELETE | /api/clients/:id/measurements/:measurementId | progress | update/delete |
| GET/POST | /api/clients/:id/checkins | progress | list/create |
| PUT/DELETE | /api/clients/:id/checkins/:checkinId | progress | update/delete |
| GET/POST/PUT/PATCH/DELETE | /api/workoutprograms[/:id] | training | primary alias |
| GET/POST/PUT/PATCH/DELETE | /api/workout-programs[/:id] | training | compatibility alias |
| GET/POST/PUT/PATCH/DELETE | /api/dietplans[/:id] | nutrition | primary alias |
| GET/POST/PUT/PATCH/DELETE | /api/diet-plans[/:id] | nutrition | compatibility alias |
| POST | /api/workoutsessions/start | training execution | start |
| GET | /api/workoutsessions | training execution | list |
| GET | /api/workoutsessions/:id | training execution | details |
| POST | /api/workoutsessions/:id/sets | training execution | log set |
| POST | /api/workoutsessions/:id/end | training execution | complete/cancel |
| POST | /api/meal-logs | nutrition execution | log food |
| GET | /api/meal-logs | nutrition execution | list logs |
| GET | /api/library/options | library | compact options |
| GET/POST/PUT/DELETE | /api/library/:type[/id] | library | muscles/foods/exercises |
| GET | /api/reports | reports | date range |
| GET | /api/backup/download | backup | download now |
| GET | /api/backup/history | backup | operations + archives |
| GET | /api/backup/archives/:id | backup | download stored archive |
| DELETE | /api/backup/archives/:id | backup | delete archive |
| POST | /api/backup/inspect | backup | validate upload |
| POST | /api/backup/restore | backup | destructive restore |
| GET | /api/backup/daily | backup | scheduled archive |
| GET | /qr/:id | QR | public HTML profile |

---

## 21. Replication Blueprint — خطة بناء النظام في مشروع جديد

### المرحلة 0 — قرارات قبل كتابة الكود

يجب تثبيت القرارات التالية:

1. هل النظام لجيم واحد أم multi-tenant؟
2. هل الإدارة تحتاج users/roles من اليوم الأول؟
3. هل external trainee يسمح بإنشاء برنامج فقط أم يحتاج ملفًا أساسيًا مستقلًا؟
4. هل الأسعار تتغير تاريخيًا؟ إذا نعم، يجب حفظ price snapshot في كل Membership.
5. هل .bak مطلوب native SQL Server أم custom portable backup؟
6. هل الحضور يسمح بعدة visits في نفس اليوم أم record واحد؟
7. هل meal logs وsession logs قابلة للتعديل أو الحذف؟
8. ما سياسة soft delete والاحتفاظ بالتاريخ؟
9. ما timezone الرسمية وDST policy؟
10. هل client login مطلوب لاحقًا؟ إذا نعم صمم member identity بدون ربطها مباشرة بحساب الإدارة.

### المرحلة 1 — Foundation

- Express أو framework API مناسب.
- SQL Server schema versioned.
- connection pool.
- UTC timestamps وCairo business date helper.
- validation library أو validators موحدة.
- error envelope موحد.
- request id وstructured logs.
- Auth/RBAC إن كان مطلوبًا.

### المرحلة 2 — Core identity and membership

ترتيب الجداول:

1. members.
2. pricing plans/types.
3. type prices.
4. memberships.
5. payments summary.
6. payment transactions.
7. freezes.
8. membership events.

ثم نفذ:

- phone normalization.
- database unique strategy.
- pricing resolver.
- inclusive end-date calculator.
- latest membership query.
- state machine للحالات.
- create/update/renew/freeze/resume/payment داخل service transactions.

### المرحلة 3 — Finance

- expenses.
- monthly finance.
- ledger reconciliation.
- receipts.
- period reports.

قاعدة القبول: مجموع التحصيل في dashboard = مجموع transactions الموجبة في الفترة نفسها،
مع توضيح هل outstanding لكل النظام أم داخل الفترة.

### المرحلة 4 — Library

- muscles.
- foods.
- exercises.
- source_id/upsert.
- archive instead of destructive delete عند reference.
- paged search/options endpoint.

### المرحلة 5 — Coaching

- workout_programs/routines/exercises.
- diet_plans/meals/items.
- measurements.
- athlete check-ins.
- activity events.

كل Create/Update مركب يجب أن يكون API واحدًا يستقبل nested payload داخل transaction.

### المرحلة 6 — Execution

- workout sessions.
- set logs.
- meal logs.
- snapshot calculations.
- progress summary.
- idempotency لمنع double click عند الحاجة.

### المرحلة 7 — Attendance and QR

- active membership resolver.
- phone/QR parser.
- unique member/day.
- auto checkout worker/job.
- report.
- QR signed token أو opaque token بدل كشف member id مباشرة إن كانت الخصوصية مهمة.

### المرحلة 8 — Reports and backup

- query services محددة بمصدر أرقام واحد.
- report filters/ranges.
- backup export/import with schema version.
- inspect before destructive restore.
- external object storage للنسخ، مع archive metadata في DB.
- scheduled worker يدعم timezone/DST أو UTC policy معلنة.

### المرحلة 9 — UI

شاشات التنفيذ بالترتيب:

1. Members list + add/edit.
2. Member details + financial ledger.
3. External trainees.
4. Workout builder.
5. Nutrition builder.
6. Measurements/check-ins.
7. Attendance/QR.
8. Dashboard.
9. Reports.
10. Backup management.
11. Print/PDF/WhatsApp manual flows.

يجب أن تعيد الواجهة استخدام:

- MemberPicker.
- SearchableSelect.
- DateField.
- MoneyField.
- StatusBadge.
- DataTable/MobileCard.
- DialogShell.
- ConfirmDanger.
- Toast/Validation surface.
- PrintDocument service.

### 21.1 حدود Transaction المطلوبة

| العملية | الحد الأدنى للـtransaction |
|---|---|
| إنشاء مشترك | member + membership + payment summary + initial ledger + event |
| تعديل اشتراك | member/membership + payment delta + event |
| تجديد | new membership + payment + ledger + event |
| تجميد | freeze + event |
| إنشاء Workout | program + all routines + all exercises + event |
| تعديل Workout | lock/version + detach logs + replace children + event |
| إنشاء Diet | plan + all meals + all items/snapshots + event |
| تعديل Diet | version + detach meal logs + replace children + event |
| تسجيل Payment | summary + ledger transaction + event |
| Restore | delete/insert full selected dataset + verification |

### 21.2 قواعد عدم فقدان البيانات

- لا تستخدم update على summary وحده بدل ledger.
- لا تحذف library item referenced؛ archive أو restrict.
- لا تحذف program قبل فصل execution logs.
- لا تحذف diet meal قبل فصل meal logs.
- استخدم version لكل aggregate مركب.
- اجعل restore يمر inspect ثم confirmation ثم transaction.
- احتفظ بمصدر السعر والقيمة الغذائية في snapshot.
- اختبر rollback عن طريق حقن فشل بعد insert parent وقبل child.

### 21.3 Contract acceptance criteria

يعتبر النقل مطابقًا عندما:

1. نفس Member يستطيع امتلاك صفر أو أكثر Membership وzero/multiple plans.
2. external trainee يختفي من external list بمجرد Membership active على نفس id.
3. لا يمكن إنشاء duplicate phone بعد normalization حتى مع concurrent requests.
4. تاريخ الشهر والـhalf-month مطابق inclusive rules.
5. كل مبلغ مدفوع له ledger/receipt قابل للتتبع.
6. حالات active/soon/expired/frozen متطابقة مع effective end.
7. برنامج أو خطة ناقصة لا يمكن أن تظل بعد فشل الحفظ.
8. Nutrition totals تستخدم serving size وsnapshot.
9. Training volume وmuscle distribution يعيدان نفس النتائج.
10. لا يوجد حضور مكرر لنفس العضو/اليوم.
11. auto checkout يسجل source=auto.
12. التقارير تعلن بوضوح نطاق التحصيل والمديونية.
13. backup inspect يرفض الملف التالف دون تغيير DB.
14. restore يعيد counts وrelationships.
15. print/PDF يحتوي على البيانات نفسها، لا UI placeholders.
16. كل الوظائف تعمل على RTL وmobile.

---

## 22. فهرس الأدلة المحلية

هذه الملفات هي نقاط الرجوع الأساسية للمطور الذي سيعيد البناء:

| الملف | ما يثبته |
|---|---|
| ../server.js | route map، HTTP middleware، startup، QR، error behavior |
| ../database/schema.sql | الجداول الأساسية، FK، checks، indexes، seed |
| ../src/member-service.js | Membership rules، pricing، status، payment ledger، events |
| ../src/attendance-service.js | QR/phone، check-in/out، auto checkout، report |
| ../src/finance-service.js | expenses وmonthly finance |
| ../src/analytics-service.js | dashboard period analytics |
| ../src/report-service.js | reports date range وsummary |
| ../src/library-service.js | library CRUD/seed/options |
| ../src/coaching-service.js | training/nutrition/progress/runtime tables/transactions |
| ../src/backup-service.js | backup payload/inspect/restore/archive |
| ../public/index.html | screens/dialogs/fields/layout |
| ../public/js/app.js | membership UI/dashboard/requests/pagination |
| ../public/js/coaching.js | external trainees/builders/calculations/profile |
| ../public/js/attendance.js | attendance/QR UI |
| ../public/js/print-enhancements.js | member/system print/PDF |
| ../scripts/smoke-test.js | integration contract and edge paths currently tested |
| ../.env.example | runtime configuration |
| ../vercel.json | scheduled backup cron |

---

## 23. الخلاصة التنفيذية

النواة التي يجب نقلها كما هي مفاهيميًا:

- Member واحد هو مصدر هوية العميل.
- Membership تاريخية متعددة لكل Member.
- Payment summary للعرض السريع وimmutable ledger للتاريخ.
- Training/Nutrition امتداد مستقل لا يتطلب Gym subscription.
- Nested aggregate save داخل transaction.
- Snapshot للقيم المالية والغذائية.
- Measurements/check-ins/execution logs مرتبطة بالعضو.
- Attendance يتحقق من Membership الفعالة ويمنع التكرار.
- Reports وbackup مبنيان على services منفصلة.

الأشياء التي يجب ألا تعتبرها مكتملة في النسخة الحالية:

- Authentication وauthorization.
- multi-coach/tenant isolation.
- native SQL Server .bak.
- timezone-safe 15:00 cron طوال السنة.
- unified outstanding definition في كل التقارير.
- database-enforced duplicate phone/email.
- scientific adherence/progress model.
- post-restore verification وexternal backup storage.

بهذا التفريق يمكن لمطور آخر بناء نسخة مطابقة وظيفيًا، ثم اتخاذ قرارات واعية حول الأمان
والتاريخ المالي والتدقيق بدل إعادة إنتاج القيود الحالية بالخطأ.
