# مرجع شاشات نظام TOP GYM

> **حالة المستند:** مرجع فني مبني على الكود الحالي في المستودع.
> **تاريخ المراجعة:** 2026-08-22
> **نطاق المستند:** واجهات الإدارة، البوابة العامة للمشترك، النوافذ المنبثقة، تدفق البيانات، الـ APIs، ومخطط قاعدة البيانات.

هذا الملف هو المرجع الموحد لفهم كل شاشة في النظام دون الحاجة إلى تتبع الملفات يدويًا. أسماء الجداول والأعمدة الواردة هنا هي الأسماء الفعلية في `database/schema.sql` أو في إنشاء الجداول runtime داخل `src/services/coaching-service.js`.

## فهرس الشاشات

1. [النموذج المعماري المشترك](#النموذج-المعماري-المشترك)
2. [تسجيل الدخول](#1-تسجيل-الدخول)
3. [لوحة التحكم](#2-لوحة-التحكم)
4. [المشتركون](#3-المشتركون)
5. [المتدربون الخارجيون](#4-المتدربون-الخارجيون)
6. [التدريب والتغذية وملف العميل](#5-التدريب-والتغذية-وملف-العميل)
7. [الأسعار والعضويات](#6-الأسعار-والعضويات)
8. [الحضور والانصراف](#7-الحضور-والانصراف)
9. [المصروفات والملخص المالي](#8-المصروفات-والملخص-المالي)
10. [المكتبة](#9-المكتبة)
11. [التقارير](#10-التقارير)
12. [تقييمات المشتركين](#11-تقييمات-المشتركين)
13. [إدارة المستخدمين والنسخ الاحتياطية](#12-إدارة-المستخدمين-والنسخ-الاحتياطية)
14. [بوابة المشترك](#13-بوابة-المشترك)
15. [النوافذ المنبثقة والطباعة](#14-النوافذ-المنبثقة-والطباعة)
16. [دليل الـ API حسب الشاشة](#دليل-api-حسب-الشاشة)
17. [مرجع الجداول والعلاقات](#مرجع-الجداول-والعلاقات)
18. [التحويلات والقيود العامة](#التحويلات-والقيود-العامة)

---

## النموذج المعماري المشترك

### المسار العام للبيانات

```text
Browser / public HTML
        |
        v
Vanilla JS page module -> core/api.js -> Express route
                                      |
                                      v
                         auth/session middleware
                                      |
                                      v
                              Controller
                                      |
                                      v
                               Service
                                      |
                                      v
                         Repository / SQL query
                                      |
                                      v
                               SQL Server
```

### هيكل الواجهة

- `public/index.html`: shell واحد يضم شاشة الدخول، التبويبات، أقسام الصفحات، و`dialog` للنوافذ المنبثقة.
- `public/member-portal.html`: صفحة عامة مستقلة لبوابة المشترك.
- `public/js/page-tabs.js`: إدارة Hash Navigation والتبويب النشط.
- `public/js/feature-loader.js`: تحميل ملفات الميزات عند الحاجة مرة واحدة.
- `public/js/app.js`: bootstrap/منطق الشاشة الأساسية للمشتركين واللوحة والنوافذ المشتركة.
- `public/js/pages/*`: وحدات الحضور، المالية، التقارير، المكتبة، التدريب، الإدارة والتقييمات.
- `src/routes/*`: تعريف المسارات فقط.
- `src/controllers/*`: تحويل HTTP إلى استدعاء خدمة وإرسال Response.
- `src/services/*`: قواعد العمل، الحسابات، تحويل البيانات، والمعاملات.
- `src/repositories/*`: استعلامات SQL وإعادة استخدام الاتصال.

### التبويبات المتاحة

| Hash | الشاشة | Owner | Assistant |
|---|---|---:|---:|
| `#dashboard` | لوحة التحكم | نعم | لا |
| `#members` | المشتركون | نعم | نعم |
| `#trainees` | المتدربون الخارجيون / التدريب | نعم | نعم |
| `#management` | الأسعار والعضويات والنسخ الاحتياطية | نعم | حسب `pricing.read` |
| `#permissions` | حسابات Assistant والصلاحيات | نعم | لا |
| `#attendance` | الحضور والانصراف | نعم | نعم |
| `#expenses` | المصروفات | نعم | لا |
| `#library` | المكتبة | نعم | نعم |
| `#reports` | التقارير | نعم | لا |
| `#feedback` | تقييمات المشتركين | نعم | لا |

إخفاء التبويب في الواجهة تحسين UX فقط؛ القرار الأمني النهائي في middleware الخلفي. الـOwner يملك `*`، والـAssistant مسموح له بمسارات الأعضاء والمتدربين والحضور والمكتبة، مع GET محدود للأسعار/الحصص حسب قواعد الصلاحيات الحالية.

---

## 1. تسجيل الدخول

### الغرض والتخطيط

شاشة `#authScreen` داخل `public/index.html`، وتظهر قبل واجهة الإدارة. تحتوي على:

- شعار وهوية TOP GYM.
- نموذج بريد إلكتروني وكلمة مرور.
- اختيار «تذكرني».
- زر تسجيل الدخول وحالة تحميل.
- رسالة خطأ أسفل النموذج.
- زر إظهار/إخفاء كلمة المرور.

الصفحة RTL، بينما البريد وكلمة المرور LTR. بعد نجاح الجلسة ينتقل المستخدم إلى التبويب المناسب حسب الدور، وتتم إزالة حالة شاشة الدخول من الواجهة.

### البيانات ومصدرها

| البيان | المصدر | المعالجة | العرض |
|---|---|---|---|
| البريد | إدخال المستخدم ثم `POST /api/auth/login` | trim/normalization في الخدمة | لا يُعرض بعد الدخول إلا ضمن بيانات الحساب إن كانت واجهة الحساب مفعلة |
| كلمة المرور | إدخال المستخدم | مقارنة آمنة مع `crypto.scrypt`؛ لا تُخزن كنص | لا تُعرض ولا تُعاد في Response |
| المستخدم والدور | `GET /api/auth/session` أو Response تسجيل الدخول | بناء session user | يُستخدم لتحديد التبويبات والصلاحيات |
| حالة الجلسة | Cookie HttpOnly + `gym_auth_sessions` | token hash، انتهاء وإلغاء الجلسة | لا تُعرض للمستخدم |

### قاعدة البيانات

| الجدول | الأعمدة المستخدمة | المعروض | الخلفية فقط |
|---|---|---|---|
| `gym_users` | `id`, `email`, `email_normalized`, `password_hash`, `full_name`, `role`, `status`, `last_login_at` | الاسم/الدور عند الحاجة | `password_hash`, `email_normalized`, timestamps والإدارة الداخلية |
| `gym_auth_sessions` | `id`, `user_id`, `token_hash`, `expires_at`, `revoked_at`, `ip_address`, `user_agent`, `created_at`, `last_seen_at` | لا شيء خام | كل الأعمدة؛ تستخدم للتحقق من الجلسة |

العلاقة: `gym_auth_sessions.user_id -> gym_users.id`.

### APIs والـFlow

| الطريقة | Endpoint | الاستخدام |
|---|---|---|
| `GET` | `/api/auth/session` | استعادة المستخدم الحالي بعد refresh |
| `POST` | `/api/auth/login` | التحقق وإنشاء session cookie |
| `POST` | `/api/auth/logout` | إلغاء الجلسة |

التدفق: form -> `auth-ui.js` -> API -> `auth-service.js` -> `gym_users`/`gym_auth_sessions` -> cookie HttpOnly -> `page-tabs.js`.

### القيود والحالات الخاصة

- البريد مطلوب، وكلمة المرور لا تُسجل في logs.
- الحساب غير النشط لا ينشئ جلسة.
- Login rate limit يطبق على محاولات الدخول.
- عند `401` يعاد توجيه المستخدم إلى شاشة الدخول؛ عند `403` تعرض رسالة صلاحيات.
- توجد معالجة لحالة refresh حتى لا تُظهر الواجهة شاشة الدخول كحالة مستقرة أثناء استعادة session.

---

## 2. لوحة التحكم

### الغرض والتخطيط

التبويب `#dashboard` هو نقطة البداية للـOwner. يتكون من:

1. Hero/header وإجراءات طباعة الاشتراكات والباقات.
2. بطاقات KPI: إجمالي الأعضاء، النشطة، قريبة الانتهاء، المنتهية، المجمدة.
3. التنبيهات اليومية مع البحث وحالة التواصل عبر WhatsApp.
4. ملخص الشهر الحالي: تحصيل الاشتراكات، الحصص اليومية، المصروفات، وصافي الشهر.
5. بطاقة الحصص اليومية وسجل الزيارات والإيرادات.
6. Dashboard analytics: اتجاهات التحصيل، الحضور، الذروة، الأكثر حضورًا، والمتابعة.
7. تقارير/مؤشرات إضافية عند تحميل الميزة.

### البيانات المعروضة والتحويلات

| المجموعة | البيانات المعروضة | المصدر |
|---|---|---|
| KPI العضويات | إجمالي، نشطة، قريبة الانتهاء، منتهية، مجمدة | `/api/dashboard` من `members`, `memberships`, `membership_freezes`, `gym_payments` |
| التنبيهات | اسم، هاتف، نوع الحالة، تاريخ الانتهاء، المتبقي، حالة رسالة WhatsApp | `/api/dashboard`؛ الحالة مشتقة من `memberships` والتجميد والدفع، وحالة التواصل من `gym_alert_communications` |
| الماليات | تحصيل الاشتراكات، الحصص، المصروفات، صافي الشهر، عناصر المصروفات | `/api/monthly-finance` |
| الحصص اليومية | العدد والإيراد حسب الشهر وآخر السجلات | `/api/day-passes/summary` و`/api/day-passes` |
| التحليلات | timeline، الساعات الذروة، الأكثر حضورًا، الإشغال، المتابعة | `/api/dashboard-analytics?period=month` |

### قاعدة البيانات

| الجداول | الأعمدة المستخدمة أو المشتقة | المعروض | الخلفية فقط |
|---|---|---|---|
| `members` | `id`, `full_name`, `phone`, `email`, `registration_date` | الاسم والهاتف وبعض التواريخ | `phone_normalized`, notes، membership-code secrets وtimestamps |
| `memberships` | `id`, `member_id`, `membership_plan`, `membership_type`, `start_date`, `end_date` | الباقة والمدة والبداية/النهاية | notes وtimestamps |
| `membership_freezes` | `membership_id`, `start_date`, `end_date`, `resumed_date` | المجمد/عدد أيام التجميد | السبب وtimestamps عند عدم الحاجة |
| `gym_payments` | `membership_id`, `amount_due`, `amount_paid`, `amount_remaining`, `paid_at` | المتبقي والمدفوع | list/discount/payment internals حسب البطاقة |
| `gym_payment_transactions` | `transaction_type`, `amount_paid`, `amount_remaining`, `payment_method`, `paid_at`, `created_at` | إجمالي التحصيل واتجاهاته | `source_payment_id`, تفاصيل ledger الداخلية |
| `gym_expenses` | `expense_name`, `amount`, `expense_date`, `notes` | إجمالي وعناصر المصروفات | ids وtimestamps |
| `gym_day_pass_types` | `type_code`, `type_name`, `price`, `is_active` | نوع الحصة وسعرها | ids وترتيب الإدارة |
| `gym_day_pass_sales` | `visitor_name`, `visitor_phone`, `pass_type_code`, `amount_paid`, `visit_date`, `status`, `whatsapp_opened_at` | الزيارات والإيرادات وWhatsApp | `visitor_phone_normalized`, user id، notes، timestamps |
| `gym_attendance` | `attendance_date`, `check_in_at`, `check_out_at`, `member_id` | مؤشرات الحضور والذروة | مصادر QR/phone وnotes |
| coaching tables | counts فقط في analytics | عدد البرامج والجلسات والوجبات والقياسات | تفاصيل الخطط لا تظهر في KPI المختصر |

العلاقات الأساسية: `members` هو الأصل؛ ترتبط به `memberships`، ومنها `gym_payments` و`gym_payment_transactions` و`membership_freezes`، بينما الحضور يرتبط مباشرة بالعضو وبالعضوية الاختيارية. الحصة اليومية مستقلة عن العضوية وترتبط بنوع الحصة.

### APIs والـFlow

| الطريقة | Endpoint | الاستخدام |
|---|---|---|
| `GET` | `/api/bootstrap` | تحميل أولي اختياري للأعضاء والـdashboard وكتالوج الأسعار |
| `GET` | `/api/dashboard` | بيانات اللوحة والتنبيهات |
| `GET` | `/api/dashboard-analytics?period=month` | التحليلات والرسوم |
| `GET` | `/api/monthly-finance` | الملخص المالي الحالي |
| `GET` | `/api/day-passes/summary` | ملخص الحصص |
| `GET` | `/api/day-passes` | آخر سجلات الحصص |
| `POST` | `/api/members/:id/alert-communications` | تسجيل فتح/إرسال تنبيه WhatsApp |
| `POST` | `/api/day-passes/:id/whatsapp-opened` | تسجيل فتح رسالة زائر الحصة |

التحويلات المهمة: تواريخ SQL تتحول إلى `YYYY-MM-DD` ثم تعرض محليًا، الأموال تحول إلى أرقام وتجمع في الخدمة، وحالة العضوية تحسب مع أيام التجميد الفعلية.

---

## 3. المشتركون

### الغرض والتخطيط

التبويب `#members` هو شاشة CRUD الأساسية للأعضاء. يحتوي على:

- عنوان الشاشة وعدد الأعضاء.
- KPI مختصرة.
- بحث بالاسم/الهاتف/البريد، فلتر الحالة، وترتيب النتائج.
- زر إضافة مشترك، الأسعار، وأنواع العضويات.
- جدول Desktop يتحول إلى بطاقات على الهاتف.
- Pagination.
- إجراءات العضو: تفاصيل، تعديل، تجديد، تسجيل دفعة، تجميد/استئناف، QR، حضور/انصراف، حذف، والمزيد.

### جدول المشتركين

#### البيانات الظاهرة

| القسم | البيانات |
|---|---|
| العضو | `full_name`, `phone`, `registration_date`، وأحيانًا email |
| الاشتراك | `membership_plan`, `membership_type`, البداية والنهاية الفعلية |
| الحالة | `active`, `expiring_soon`, `expired`, `frozen` مشتقة من التواريخ والتجميد |
| الحساب | `amount_due`, `amount_paid`, `amount_remaining`, طريقة الدفع |
| التجميد | عدد مرات التجميد، الحد، المتبقي |
| البوابة | كود مختصر/مقنع فقط؛ الكود الكامل لا يظهر إلا بصلاحية Owner |
| الحضور | حالة اليوم وآخر حضور من `gym_attendance` |

#### مصدر البيانات وقاعدة البيانات

| الجدول | الأعمدة التي يستخدمها الاستعلام | المعروض | غير المعروض/خلفي |
|---|---|---|---|
| `members` | `id`, `full_name`, `phone`, `email`, `registration_date`, `notes`, `phone_normalized`, `created_at`, `updated_at` | الاسم، الهاتف، البريد، التسجيل | `id` كمعرف داخلي، normalized، notes غالبًا في التفاصيل، timestamps |
| `memberships` | `id`, `member_id`, `membership_plan`, `membership_type`, `start_date`, `end_date`, `notes` | الخطة/المدة/الفترة | notes وmember_id |
| `membership_freezes` | `id`, `membership_id`, `start_date`, `end_date`, `resumed_date` | عدد التجميدات والحالة الحالية | reason، timestamps |
| `gym_payments` | `membership_id`, `list_price`, `discount_amount`, `amount_due`, `amount_paid`, `amount_remaining`, `payment_method`, `paid_at` | الإجمالي والمدفوع والمتبقي | membership id، discount عند عدم فتح التفاصيل |
| `gym_attendance` | `member_id`, `membership_id`, `attendance_date`, `check_in_at`, `check_out_at`, `check_in_source`, `check_out_source` | حضور/انصراف اليوم | مصادر الحضور وnotes/timestamps |
| `gym_membership_code_audit` | `member_id`, `action`, `created_at` | لا يظهر في الجدول العام | IP، user agent، actor id وسجل التدقيق |

الاستعلام يختار أحدث عضوية لكل عضو، ويطبق `OFFSET/FETCH` للصفحات. لا يظهر عضو بلا عضوية فعالة في قائمة الأعضاء الأساسية (`membershipId IS NOT NULL`).

### إضافة/تعديل مشترك

#### الحقول

- الاسم، الهاتف، البريد، تاريخ التسجيل، الملاحظات.
- الباقة ونوع العضوية وتواريخ البداية والنهاية.
- الخصم، المستحق، المدفوع، وطريقة الدفع.
- خيار فتح رسالة WhatsApp بعد الإضافة.

#### APIs

| الطريقة | Endpoint | العملية |
|---|---|---|
| `POST` | `/api/members` | إنشاء عضو، عضوية أولى، دفع، ledger/event، وكود بوابة عند الإنشاء |
| `PUT` | `/api/members/:id` | تعديل بيانات العضو والعضوية والدفع حسب body |
| `GET` | `/api/pricing` | ملء الباقات والأنواع والأسعار |

#### الجداول المتأثرة

في الإنشاء المعتاد توجد معاملة واحدة تشمل `members` ثم `memberships` ثم `gym_payments` و`gym_payment_transactions`، مع `membership_events`. كود البوابة يحفظ hash/ciphertext في `members` ويسجل الإصدار في `gym_membership_code_audit`.

القيود: الهاتف/البريد لا يتكرران، التواريخ صحيحة، المبالغ غير سالبة ولا يتجاوز المدفوع المستحق، نوع الدفع ضمن `cash/card/transfer/other`.

### تفاصيل العضو

تفتح من `GET /api/members/:id/details` داخل `#detailsDialog` وتشمل:

- ملخص التسجيل، عدد الاشتراكات، التجميد، العمليات.
- سجل الاشتراكات والتجديدات.
- سجل التجميد.
- السجل المالي والإيصالات.
- سجل العمليات.
- امتداد ملف العميل: التدريب والتغذية والقياسات والجلسات وتسجيلات الوجبات.
- بطاقة كود بوابة المشترك للـOwner.

| الجدول | الأعمدة المستخدمة في التفاصيل | المعروض |
|---|---|---|
| `members` | `id`, `full_name`, `phone`, `email`, `registration_date`, `notes`, `created_at`, `updated_at` | البيانات الأساسية والتسجيل؛ notes إن وجدت |
| `memberships` | `id`, `membership_plan`, `membership_type`, `start_date`, `end_date`, `notes` | الخطة والفترة والحساب والحالة |
| `gym_payments` | `list_price`, `discount_amount`, `amount_due`, `amount_paid`, `amount_remaining`, `payment_method`, `paid_at`, `notes` | إجماليات العضوية |
| `membership_freezes` | كل الأعمدة التشغيلية | البداية والنهاية والاستئناف والمدة والسبب |
| `membership_events` | `id`, `membership_id`, `event_type`, `details`, `created_at` | timeline مختصر بعد فك JSON للتفاصيل |
| `gym_payment_transactions` | `id`, `membership_id`, `transaction_type`, `list_price`, `discount_amount`, `amount_due`, `amount_paid`, `amount_remaining`, `payment_method`, `paid_at`, `notes`, `created_at` | رقم الإيصال، التاريخ، العملية، الاشتراك، المدفوع، المتبقي، الدفع، طباعة الإيصال |

الحقول الداخلية مثل `membership_code_hash`, `membership_code_ciphertext`, IP/user-agent، والـSQL identifiers لا تعرض للمشترك.

### إجراءات العضو

| الإجراء | API | الجداول/النتيجة |
|---|---|---|
| تجديد/إضافة اشتراك | `POST /api/members/:id/renew` أو `POST /api/members/:id/memberships` | يضيف `memberships` و`gym_payments` وledger/event |
| تسجيل دفعة | `POST /api/memberships/:id/payments` | يحدث `gym_payments` ويضيف `gym_payment_transactions` وevent |
| تجميد | `POST /api/members/:id/freeze` | يضيف `membership_freezes` ويعدل تاريخ النهاية الفعلي ويسجل event |
| استئناف | `POST /api/members/:id/resume` | يحدّث `resumed_date` ويسجل event |
| حذف | `DELETE /api/members/:id` | يحذف العضو حسب علاقات cascade/تنظيف coaching المرتبط |
| تفاصيل | `GET /api/members/:id/details` | قراءة مجمعة بدون تعديل |
| QR الحضور | تستخدم خدمة الحضور مع `qrToken` `TOPGYM-MEMBER:{id}` | لا تغير كود البوابة |

---

## 4. المتدربون الخارجيون

### الغرض والتخطيط

التبويب `#trainees` يعرض العملاء الذين لديهم برامج تدريب/تغذية لكن لا يملكون عضوية فعالة. يحتوي على:

- بطاقات عدد المتدربين والبرامج وخطط التغذية والقياسات.
- بحث وPagination.
- جدول/بطاقات المتدربين.
- إجراءات فتح الملف، تعديل البيانات، فتح التدريب، فتح التغذية، القياسات، الجلسات، الوجبات، والمزيد.
- نافذة إضافة متدرب خارجي.

### البيانات وقاعدة البيانات

| الجدول | الأعمدة | المعروض | الخلفية |
|---|---|---|---|
| `members` | `id`, `full_name`, `phone`, `email`, `registration_date`, `notes`, `created_at`, `updated_at` | الاسم، الهاتف، البريد، التسجيل، آخر نشاط مشتق | id، normalized، timestamps |
| `workout_programs` | `member_id`, `status`, `updated_at` | عدد البرامج وآخر نشاط | تفاصيل البرنامج في الملف |
| `diet_plans` | `member_id`, `status`, `name`, `target_calories`, `updated_at` | عدد الخطط وبعض الأهداف | النسخة والملاحظات والتفاصيل الكاملة |
| `body_measurements` | `member_id`, `measured_at` | عدد القياسات وآخر قياس | القيم الصحية تظهر داخل ملف العميل فقط |
| `memberships` + `membership_freezes` | member id وتاريخ النهاية الفعال | تستخدم لاستبعاد العضو ذي العضوية الحالية | لا تعرض كبيانات المتدرب الخارجي |

الفلتر المهم: وجود برنامج أو خطة، مع عدم وجود عضوية ينتهي تاريخها الفعلي بعد اليوم.

### APIs

| الطريقة | Endpoint | الاستخدام |
|---|---|---|
| `GET` | `/api/external-trainees?page=&pageSize=&search=` | القائمة والصفحات |
| `POST` | `/api/external-trainees` | إنشاء سجل أساسي في `members` بدون عضوية |
| `GET` | `/api/coaching/clients?limit=` | قائمة اختيار العميل داخل builders |
| `GET` | `/api/clients/:id/training-overview` | فتح ملف التدريب الكامل |
| `PUT` | `/api/clients/:id` | تعديل الاسم/الهاتف/البريد/الملاحظات |

التحقق: الاسم والهاتف مطلوبان في إضافة المتدرب الخارجي، الهاتف يطبع إلى صيغة normalized، البريد اختياري لكنه يتحقق من صيغة البريد، وتمنع الازدواجية.

---

## 5. التدريب والتغذية وملف العميل

هذه الوظائف تظهر داخل ملف العضو/المتدرب وفي نوافذ `coachingProfileDialog` و`coachingBuilderDialog`.

### أقسام الواجهة

- ملخص التقدم: الوزن الأول والحالي، فرق الوزن، الجلسات، الحجم التدريبي، التكرارات، السعرات والبروتين والكربوهيدرات والدهون.
- برامج التدريب: إنشاء/تعديل/حذف وتغيير الحالة.
- خطط التغذية: إنشاء/تعديل/حذف وتغيير الحالة.
- القياسات: إضافة/تعديل/حذف.
- Check-ins: النوم، الإجهاد، الألم، المزاج والمؤشرات الحيوية.
- جلسة تمرين: بدء، تسجيل sets، إنهاء.
- تسجيل وجبة: اختيار عنصر من خطة غذائية وحساب القيم.
- Timeline نشاط coaching.

### قاعدة البيانات والعلاقات

| الجدول | الأعمدة الفعلية المستخدمة | العلاقة |
|---|---|---|
| `workout_programs` | `id`, `member_id`, `name`, `description`, `start_date`, `end_date`, `duration_weeks`, `goal`, `level`, `days_per_week`, `status`, `notes`, `version`, `created_at`, `updated_at` | `member_id -> members.id` |
| `workout_routines` | `id`, `program_id`, `name`, `day_of_week`, `sort_order`, `notes`, `created_at`, `updated_at` | `program_id -> workout_programs.id` |
| `workout_exercises` | `id`, `routine_id`, `exercise_id`, `sort_order`, `sets`, `reps_min`, `reps_max`, `weight_kg`, `rest_seconds`, `tempo`, `superset_group_id`, `notes`, `created_at`, `updated_at` | routine + `exercise_id -> gym_exercises.id` |
| `diet_plans` | `id`, `member_id`, `name`, `description`, `start_date`, `end_date`, `meals_per_day`, `target_calories`, `target_protein`, `target_carbs`, `target_fats`, `status`, `notes`, `version`, `created_at`, `updated_at` | `member_id -> members.id` |
| `diet_meals` | `id`, `diet_plan_id`, `name`, `meal_time`, `sort_order`, `notes`, `created_at`, `updated_at` | `diet_plan_id -> diet_plans.id` |
| `diet_meal_items` | `id`, `meal_id`, `food_id`, `sort_order`, `assigned_quantity`, `serving_unit`, `calc_calories`, `calc_protein`, `calc_carbs`, `calc_fats`, `notes`, `created_at`, `updated_at` | meal + `food_id -> gym_foods.id` |
| `body_measurements` | `id`, `member_id`, `measured_at`, `weight_kg`, `height_cm`, `body_fat_percent`, `chest_cm`, `waist_cm`, `hips_cm`, `arms_cm`, `thighs_cm`, `notes`, `created_at`, `updated_at` | `member_id -> members.id` |
| `athlete_checkins` runtime | `id`, `member_id`, `checkin_date`, `sleep_hours`, `sleep_quality`, `fatigue`, `soreness`, `stress`, `mood`, `resting_hr`, `hrv`, `bodyweight_kg`, `notes`, `created_at`, `updated_at` | `member_id -> members.id` |
| `coaching_activity_events` runtime | `id`, `member_id`, `event_type`, `entity_type`, `entity_id`, `details`, `created_at` | `member_id -> members.id` |
| `workout_sessions` | `id`, `member_id`, `program_id`, `routine_id`, `started_at`, `ended_at`, `status`, `notes` | member/program/routine |
| `workout_set_logs` | `id`, `session_id`, `workout_exercise_id`, `set_number`, `weight_kg`, `reps`, `completed_at`, `notes` | session/exercise |
| `meal_logs` | `id`, `member_id`, `meal_item_id`, `consumed_quantity`, `consumed_at`, `calc_calories`, `calc_protein`, `calc_carbs`, `calc_fats`, `notes`, `created_at` | member/meal item |

### APIs

#### البرامج التدريبية

| الطريقة | Endpoint |
|---|---|
| `GET` | `/api/workoutprograms?memberId=&search=&status=&level=` أو `/api/workout-programs` |
| `GET` | `/api/workoutprograms/:id` أو alias المسار الآخر |
| `POST` | `/api/workoutprograms` |
| `PUT` | `/api/workoutprograms/:id` |
| `PATCH` | `/api/workoutprograms/:id/status` |
| `DELETE` | `/api/workoutprograms/:id` |

#### خطط التغذية

| الطريقة | Endpoint |
|---|---|
| `GET` | `/api/dietplans?memberId=&search=&status=` أو `/api/diet-plans` |
| `GET` | `/api/dietplans/:id` أو alias المسار الآخر |
| `POST` | `/api/dietplans` |
| `PUT` | `/api/dietplans/:id` |
| `PATCH` | `/api/dietplans/:id/status` |
| `DELETE` | `/api/dietplans/:id` |

#### التنفيذ والمتابعة

| الطريقة | Endpoint | الاستخدام |
|---|---|---|
| `GET/POST/PUT/DELETE` | `/api/clients/:id/measurements` و`/:measurementId` | CRUD القياسات |
| `GET/POST/PUT/DELETE` | `/api/clients/:id/checkins` و`/:checkinId` | CRUD check-ins |
| `POST` | `/api/workoutsessions/start` | بدء جلسة |
| `GET` | `/api/workoutsessions?memberId=` | جلسات العضو |
| `GET` | `/api/workoutsessions/:id` | جلسة مع sets |
| `POST` | `/api/workoutsessions/:id/sets` | تسجيل مجموعة |
| `POST` | `/api/workoutsessions/:id/end` | إنهاء الجلسة |
| `POST` | `/api/meal-logs` | تسجيل وجبة |
| `GET` | `/api/meal-logs?memberId=` | سجل الوجبات |

### منطق خاص

- `training-overview` يجمع البرامج والخطط والقياسات والجلسات والوجبات والـcheck-ins والنشاط في Response واحد.
- نسب التقدم تحسب من مدة الخطة والوحدات المتوقعة والجلسات/الوجبات المنفذة.
- قيم الوجبة تحسب من `diet_meal_items` وتضرب في معامل الكمية قبل الحفظ في `meal_logs`.
- حذف برنامج يزيل البنية التابعة بحسب قواعد الخدمة مع الحفاظ على سلامة الجلسات/السجلات.
- لا تُستخدم هذه الشاشات لتغيير صلاحيات أو منطق العضوية إلا عند استدعاء endpoint العضوية صراحة.

---

## 6. الأسعار والعضويات

### الغرض والتخطيط

تبويب `#management` يعرض أدوات الأسعار والعضويات والنسخ الاحتياطية حسب صلاحيات الحساب، ويحتوي على:

- اختصار «أسعار الباقات».
- اختصار «أنواع العضويات».
- إدارة أسعار الحصص اليومية.
- النسخ الاحتياطية والاسترجاع.

إدارة حسابات Owner/Assistant لا تظهر هنا؛ توجد حصريًا داخل `#permissions`.

### جداول التسعير

| الجدول | الأعمدة المستخدمة | العرض |
|---|---|---|
| `membership_pricing` | `plan_code`, `plan_name`, `monthly_price`, `is_active`, `sort_order` | اسم الباقة، السعر الشهري، الحالة والترتيب |
| `membership_types` | `type_code`, `type_name`, `duration_mode`, `duration_value`, `price_multiplier`, `is_active`, `sort_order` | النوع، المدة، معامل السعر، الحالة |
| `membership_type_prices` | `plan_code`, `type_code`, `price` | مصفوفة السعر لكل باقة/نوع |
| `gym_day_pass_types` | `type_code`, `type_name`, `price`, `is_active`, `sort_order` | نوع الحصة اليومية وسعرها |

الأعمدة المخفية: ids، timestamps، وحقول الأكواد تستخدم كمعرفات لا كبيانات عرضية. السعر النهائي يقرأ من override في `membership_type_prices` أو يحسب من `monthly_price * price_multiplier` عند عدم وجود override.

### APIs

| الطريقة | Endpoint | الصلاحية |
|---|---|---|
| `GET` | `/api/pricing` | مستخدم مصادق |
| `PUT` | `/api/pricing` | Owner |
| `PUT` | `/api/pricing/:planCode` | Owner |
| `POST` | `/api/pricing-plans` | Owner |
| `PUT` | `/api/pricing-plans/:planCode` | Owner |
| `POST` | `/api/membership-types` | Owner |
| `PUT` | `/api/membership-types/:typeCode` | Owner |
| `GET` | `/api/day-passes/pricing` | مستخدم مصادق |
| `PUT` | `/api/day-passes/pricing` | Owner |

القيود: الأكواد تبدأ بحرف إنجليزي وتستخدم أحرف/أرقام/underscore، المدة والسعر موجبان، ولا يسمح بتكرار code أو حفظ نوع غير موجود.

---

## 7. الحضور والانصراف

### الغرض والتخطيط

تبويب `#attendance` يسجل دخول وخروج الأعضاء ويعرض سجل اليوم والتقرير وسجل عضو مفرد. يحتوي على:

- حقل بحث/هاتف أو QR.
- زر تسجيل حضور.
- زر تسجيل انصراف.
- وضع Kiosk عام لتطبيق الجيم يمكن تفعيله من الشريط العلوي أو من شاشة الحضور، مع إخفاء شريط التطبيق وإبقاء الشاشة التشغيلية وزر الخروج متاحين.
- جدول اليوم مع الحالة والمصدر والتوقيت.
- تفاصيل حضور العضو.
- تقرير نطاق تاريخ عند استخدام التقرير.

### قاعدة البيانات

| الجدول | الأعمدة المستخدمة | المعروض |
|---|---|---|
| `gym_attendance` | `id`, `member_id`, `membership_id`, `attendance_date`, `check_in_at`, `check_out_at`, `check_in_source`, `check_out_source`, `notes`, `created_at`, `updated_at` | الاسم عبر join، الهاتف، اليوم، الدخول، الانصراف، الحالة والمصدر |
| `members` | `id`, `full_name`, `phone`, `email` | هوية العضو |
| `memberships` | `id`, `member_id`, `membership_plan`, `membership_type`, `start_date`, `end_date` | الباقة الحالية/التحقق من العضوية |
| `membership_freezes` | `membership_id`, تواريخ التجميد والاستئناف | حساب النهاية الفعلية والتحقق |

`id`, notes، timestamps الخام ومصادر النظام لا تظهر إلا عند الحاجة في التفاصيل. يوجد unique index يمنع أكثر من سجل حضور لنفس العضو في نفس اليوم.

### APIs

| الطريقة | Endpoint | الاستخدام |
|---|---|---|
| `GET` | `/api/attendance?date=&search=` | سجل اليوم |
| `GET` | `/api/attendance/report?from=&to=` | تقرير نطاق |
| `GET` | `/api/attendance/member/:id` | سجل عضو |
| `POST` | `/api/attendance/check-in` | تسجيل حضور يدوي/هاتف/QR |
| `POST` | `/api/attendance/check-out` | تسجيل انصراف |
| `GET` | `/api/members/:id` | جلب العضو من أدوات QR/البحث |

القيود: لا يسمح بتكرار اليوم، لا يسمح بانصراف قبل الحضور، ومصادر الدخول `phone/qr/manual` ومصادر الخروج `phone/qr/manual/auto`.

---

## 8. المصروفات والملخص المالي

### الغرض والتخطيط

تبويب `#expenses` يعرض إدارة مصروفات الجيم، بينما يظهر ملخص مالي مختصر في لوحة التحكم. يتضمن:

- بطاقات إجمالي التحصيل والمصروفات والصافي.
- نموذج إضافة/تعديل مصروف.
- جدول المصروفات مع تعديل وحذف.
- تجميع حسب الشهر.

### قاعدة البيانات ومصدر البيانات

| الجدول | الأعمدة | العرض |
|---|---|---|
| `gym_expenses` | `id`, `expense_name`, `amount`, `expense_date`, `notes`, `created_at`, `updated_at` | الاسم، المبلغ، التاريخ، الملاحظات |
| `gym_payment_transactions` | `transaction_type`, `amount_paid`, `paid_at`, `payment_method` | إجمالي تحصيل الاشتراكات وعدد عملياتها |
| `gym_day_pass_sales` | `amount_paid`, `visit_date`, `status`, `pass_type_code` | إيراد الحصص اليومية وعددها |
| `gym_day_pass_types` | `type_code`, `type_name`, `price` | تسمية نوع الحصة في الملخص |

`id`, source/payment internals، timestamps وحالة void لا تعرض في بطاقة الملخص إلا كجزء من التجميع.

### APIs

| الطريقة | Endpoint | الاستخدام |
|---|---|---|
| `GET` | `/api/monthly-finance` | ملخص الشهر وعناصر المصروفات |
| `POST` | `/api/expenses` | إضافة مصروف |
| `PUT` | `/api/expenses/:id` | تعديل مصروف |
| `DELETE` | `/api/expenses/:id` | حذف مصروف |

المعادلة: `net = subscriptions total + day passes total - expenses total`. المصروف يجب أن يكون موجبًا، والتاريخ صحيحًا، والاسم ضمن الطول المحدد.

---

## 9. المكتبة

### الغرض والتخطيط

تبويب `#library` لإدارة بيانات التمارين والطعام والعضلات. يحتوي على:

- تبويبات داخلية حسب النوع.
- KPI بعدد العضلات والأطعمة والتمارين.
- بحث وفلاتر وPagination.
- جدول يتحول إلى بطاقات على الهاتف.
- نافذة تفاصيل التمرين/العضلة/الطعام.
- نموذج إضافة/تعديل وحذف.
- صور التمارين والعضلات من `public/assets` مع fallback.

### مصادر البيانات

| النوع | الجدول | الأعمدة المستخدمة في القائمة | المعروض |
|---|---|---|---|
| عضلات | `gym_muscles` | `id`, `source_id`, `name`, `name_ar`, `body_part`, `description`, `description_ar`, `icon` | الاسم، الجزء، الوصف/الأيقونة |
| أطعمة | `gym_foods` | `id`, `source_id`, `name_ar`, `name_en`, `category`, `calories`, `protein`, `carbs`, `fat`, `fiber`, `sugar`, `sodium`, `serving_size`, `serving_unit` | الاسم، التصنيف، القيم الغذائية والحصة |
| تمارين | `gym_exercises` | كل حقول التعريف الأساسية | الاسم، العضلة، الأداة، المستوى، التصنيف، الصورة/الفيديو |

حقول التمرين التفصيلية مثل JSON التعليمات والأخطاء الشائعة والنصائح والmetadata تظهر في نافذة التفاصيل حسب توفرها، ولا تظهر كلها في الجدول.

### APIs

| الطريقة | Endpoint | الاستخدام |
|---|---|---|
| `GET` | `/api/library/options` | فلاتر الأجزاء والتصنيفات والمستويات والأدوات |
| `GET` | `/api/library/:type?page=&pageSize=&search=` | قائمة النوع |
| `GET` | `/api/library/:type/:id` | تفاصيل عنصر |
| `POST` | `/api/library/:type` | إضافة |
| `PUT` | `/api/library/:type/:id` | تعديل |
| `DELETE` | `/api/library/:type/:id` | حذف |

التحويلات: `secondary_muscles_json` وحقول JSON تفك إلى مصفوفات، `target_muscle_id` يربط بالعضلة، وقيم الأرقام تحول إلى Numbers. ملفات الصور لا تُخزن في SQL؛ mapping/asset files في `public/data` و`public/assets` تكمل العرض.

---

## 10. التقارير

### الغرض والتخطيط

تبويب `#reports` يعرض تقارير نطاق تاريخ، مع تبويبات داخلية مثل الملخص العام، الحضور والانصراف، التحصيل، المصروفات، الديون، التدريب، المكتبة والنسخ. يحتوي على:

- تاريخ بداية ونهاية.
- زر عرض التقارير.
- بطاقات مؤشرات.
- جداول نتائج قابلة للتمرير الداخلي.
- قائمة المدينين وزر WhatsApp/فتح تفاصيل العضو.
- تقرير الحضور المنفصل.
- روابط/إجراءات النسخ الاحتياطية عند صلاحية Owner.

### مصادر البيانات

| مجموعة التقرير | الجداول | الحقول/المشتقات المعروضة |
|---|---|---|
| أعضاء جدد | `members`, أحدث `memberships`, `gym_payments` | الاسم، الهاتف، التسجيل، الاشتراك الحالي، الحساب |
| اشتراكات جديدة | `memberships`, `members`, `gym_payments`, `membership_freezes` | الباقة، المدة، الفترة الفعلية، الحالة، المتبقي |
| التحصيل | `gym_payment_transactions`, `memberships`, `members` | الإيصال، العضو، النوع، المدفوع، طريقة الدفع، التاريخ |
| المصروفات | `gym_expenses` | الاسم، التاريخ، المبلغ، الملاحظات |
| طرق الدفع | `gym_payment_transactions` | count وsum حسب `payment_method` |
| المدينون | `gym_payments`, `memberships`, `members` | العضو، الهاتف، العضوية، المتبقي، الانتهاء |
| الحصص اليومية | `gym_day_pass_sales`, `gym_day_pass_types` | الزائر، النوع، المبلغ، التاريخ، الحالة |
| التدريب | `workout_programs`, `diet_plans`, `body_measurements`, `workout_sessions`, `meal_logs`, `athlete_checkins`, `workout_set_logs` | counts، الحالات، الجلسات، القياسات، التغذية والحجم التدريبي |
| المكتبة | `gym_muscles`, `gym_foods`, `gym_exercises` | الإجماليات والعناصر الجديدة في الفترة |
| الحضور | `/api/attendance/report` من `gym_attendance`, `members`, `memberships` | عدد الحضور، الساعات، الحضور حسب العضو/اليوم |

### APIs

| الطريقة | Endpoint | الاستخدام |
|---|---|---|
| `GET` | `/api/reports?from=YYYY-MM-DD&to=YYYY-MM-DD` | التقرير المجمع |
| `GET` | `/api/attendance/report?from=&to=` | تقرير الحضور |
| `GET` | `/api/dietplans/:id` | تفاصيل خطة عند فتحها من التقرير |
| `GET` | `/api/backup/history?limit=&archiveLimit=` | تاريخ النسخ عند إظهاره داخل التقارير/الإدارة |
| `POST` | `/api/members/:id/alert-communications` | تحديث حالة رسالة المدين/التنبيه |
| `GET` | `/api/members/:id` أو `/details` | فتح تفاصيل المدين |

### التحويلات والقيود

- النطاق الافتراضي من أول الشهر حتى اليوم، والحد الأقصى 730 يومًا.
- timeline يملأ الأيام الخالية بأصفار حتى لا تنكسر الرسوم.
- الأرقام المالية تجمع من ledger immutable (`gym_payment_transactions`) وليس من سجل الدفع المختصر فقط.
- حالة الدين تعتمد على `amount_remaining > 0`.
- لا يعرض التقرير الكامل أي hash/ciphertext لكود البوابة أو session tokens.

---

## 11. تقييمات المشتركين

### الغرض والتخطيط

تبويب `#feedback` للـOwner فقط. يعرض تقييمات بوابة المشتركين في جدول مع:

- اسم المشترك ورقم الهاتف.
- عدد النجوم.
- نوع الملاحظة.
- النص الكامل.
- تاريخ الإرسال.
- فلاتر التقييم، النوع، التاريخ، والبحث.
- Pagination وإمكانية فتح تفاصيل العضو.

### قاعدة البيانات

| الجدول | الأعمدة | العرض |
|---|---|---|
| `gym_member_feedback` | `id`, `member_id`, `rating`, `note_type`, `message`, `submitted_at` | كل الأعمدة التشغيلية باستثناء ids الداخلية؛ rating/type/message/date |
| `members` | `id`, `full_name`, `phone` | الاسم والهاتف |

كود العضوية لا يُخزن في `gym_member_feedback`؛ يحل إلى `member_id` قبل الإدراج. العلاقة: `gym_member_feedback.member_id -> members.id`.

### APIs والـFlow

| الطريقة | Endpoint | الصلاحية |
|---|---|---|
| `POST` | `/api/member-portal/feedback` | عام، لكن يتطلب كود عضوية نشط داخل body |
| `GET` | `/api/member-feedback?rating=&noteType=&from=&to=&search=&page=&pageSize=` | Owner فقط |

التدفق العام: بوابة المشترك ترسل `membershipCode` + `rating` + `noteType` + `message` -> hash lookup في `members` -> insert `gym_member_feedback` -> شاشة Owner تعمل join مع `members`.

القيود: التقييم من 1 إلى 5، نوع الملاحظة أحد `general/problem/complaint/suggestion/feature_request`، النص مطلوب وبحد أقصى 4000 حرف، وrate limit مطبق على endpoint العام. الـAssistant يحصل على `403` حتى لو استدعى API مباشرة.

---

## 12. إدارة المستخدمين والنسخ الاحتياطية

### 12.1 حسابات Owner وAssistant

#### الواجهة

- تظهر إدارة حسابات Owner وAssistant داخل شاشة `#permissions` فقط، ولا تظهر في شاشة الأسعار والعضويات.
- جدول الحسابات: الاسم، البريد، الدور، الحالة، آخر دخول.
- إضافة Assistant وتعديل البيانات وتفعيل/تعطيله وإعادة تعيين كلمة المرور.
- لا يسمح بتعديل أو حذف Owner من نفس القواعد الحالية.

#### الجداول

| الجدول | الأعمدة المستخدمة | المعروض |
|---|---|---|
| `gym_users` | `id`, `full_name`, `username`, `email`, `role`, `status`, `last_login_at`, `created_at`, `updated_at` | الاسم والبريد والدور والحالة وآخر دخول |
| `gym_auth_sessions` | `user_id`, `expires_at`, `revoked_at`, `last_seen_at` | لا تعرض tokens؛ تستخدم لإدارة الجلسة |

`password_hash`, `email_normalized`, token hash، IP وuser-agent حقول خلفية.

#### APIs

| الطريقة | Endpoint | الصلاحية |
|---|---|---|
| `GET` | `/api/auth/users` | Owner |
| `POST` | `/api/auth/users` | Owner؛ إنشاء Assistant |
| `PUT` | `/api/auth/users/:id` | Owner |
| `PATCH` | `/api/auth/users/:id/status` | Owner |

### 12.2 النسخ الاحتياطية

#### الواجهة

- تنزيل JSON gzip أو BAK.
- رفع نسخة للفحص.
- تأكيد restore.
- سجل العمليات والأرشيفات.
- حذف archive قديم.

#### الجداول

| الجدول | الأعمدة | المعروض |
|---|---|---|
| `gym_backup_operations` | `id`, `operation_type`, `file_name`, `source_generated_at`, `row_count`, `table_counts`, `status`, `details`, `created_at` | نوع العملية، الملف، الحالة، العدد، التاريخ والتفاصيل |
| `gym_backup_archives` | `id`, `backup_day`, `file_name`, `backup_format`, `generated_at`, `content`, `content_bytes`, `row_count`, `table_counts`, `created_at` | metadata فقط؛ `content` لا يعرض كنص في الجدول |

الأرشيف يحتوي snapshots للجداول المسموح بها؛ كلمة مرور/secret الجلسة لا تظهر في الواجهة. عمليات restore تتحقق من الملف وتستخدم transaction/validation حسب خدمة النسخ.

#### APIs

| الطريقة | Endpoint | الصلاحية/الاستخدام |
|---|---|---|
| `GET` | `/api/backup/download?format=json.gz` | Owner؛ إنشاء وتنزيل نسخة |
| `GET` | `/api/backup/download?format=bak` | Owner |
| `GET` | `/api/backup/history?limit=&archiveLimit=` | Owner |
| `GET` | `/api/backup/archives/:id` | Owner؛ تنزيل archive |
| `DELETE` | `/api/backup/archives/:id` | Owner |
| `POST` | `/api/backup/inspect` | Owner؛ فحص upload خام |
| `POST` | `/api/backup/restore` | Owner؛ استرجاع |
| `GET` | `/api/backup/daily` | Cron مصرح فقط عبر secret/تحقق cron |

---

## 13. بوابة المشترك

### الغرض والتخطيط

صفحة مستقلة في `/member-portal` عبر `public/member-portal.html`، لا تحتاج إلى جلسة إدارة. تحتوي على:

- بطاقة TOP GYM.
- حقل كود العضوية وزر «عرض بياناتي».
- تنبيه أمان.
- بعد النجاح: تقرير حالة العضوية، إجراءات الطباعة/PDF، زر كود آخر.
- بيانات العضو الأساسية والاشتراك الحالي والزيارات والمدفوعات والتجميد.
- قسم «قيّم تجربتك» بعد نجاح الدخول.

### البيانات المعروضة

| القسم | البيانات |
|---|---|
| العضو | الاسم، الهاتف، البريد إن كان موجودًا، تاريخ أول انضمام |
| الحالي | الباقة، النوع، تاريخ النهاية الفعلي، الأيام المتبقية، الحالة |
| الماليات | المستحق، المدفوع، المتبقي، عدد الإيصالات |
| التاريخ | كل الاشتراكات والتجديدات، المدفوعات والإيصالات، سجل الحضور، التجميد |
| التقييم | نجوم 1-5، نوع الملاحظة، نص، رسالة نجاح |

لا تعرض: ملاحظات الإدارة الحساسة، كود العضوية بعد lookup، hashes/ciphertext، user/session data، أو تفاصيل تدقيق الإدارة.

### قاعدة البيانات والعلاقات

| الجداول | الأعمدة المستخدمة |
|---|---|
| `members` | `id`, `full_name`, `phone`, `email`, `registration_date` |
| `memberships` | `id`, `member_id`, `membership_plan`, `membership_type`, `start_date`, `end_date`, `notes` |
| `gym_payments` | `membership_id`, `amount_due`, `amount_paid`, `amount_remaining`, `payment_method`, `paid_at` |
| `gym_payment_transactions` | `id`, `membership_id`, `transaction_type`, `amount_paid`, `amount_remaining`, `payment_method`, `paid_at`, `created_at` |
| `gym_attendance` | `member_id`, `attendance_date`, `check_in_at`, `check_out_at` |
| `membership_freezes` | `membership_id`, `start_date`, `end_date`, `resumed_date` |
| `gym_member_feedback` | `member_id`, `rating`, `note_type`, `message`, `submitted_at` عند إرسال التقييم |

### APIs والـFlow

| الطريقة | Endpoint | الاستخدام |
|---|---|---|
| `POST` | `/api/member-portal/lookup` | body يحتوي `membershipCode` فقط؛ يرجع portal-safe DTO |
| `POST` | `/api/member-portal/feedback` | حفظ تقييم العضو بعد lookup |
| `GET` | `/api/members/:id/membership-code` | Owner داخل الإدارة فقط |
| `POST` | `/api/members/:id/membership-code/reveal` | Owner؛ كشف مؤقت مع audit |
| `POST` | `/api/members/:id/membership-code/resend` | Owner؛ تجهيز رسالة WhatsApp |
| `POST` | `/api/members/:id/membership-code/rotate` | Owner؛ إلغاء القديم وإصدار جديد |

الكود لا يوضع في URL، ولا يعاد في سجلات التقنية. البحث يتم باستخدام hash، والـResponse العام يمر عبر whitelist للبيانات. التقييم يربط بالكود بعد تحويله إلى `member_id` ولا يخزن الكود نفسه.

### الطباعة وPDF

زرَا الطباعة وPDF يستدعيان `window.print()`/Print CSS من الصفحة الحالية. التقرير يخفي `data-no-print`، ويشمل الهوية والحالة والماليات والسجلات والتوقيعات، ولا يطبع الكود الكامل أو ملاحظات الإدارة.

---

## 14. النوافذ المنبثقة والطباعة

### قائمة النوافذ في `public/index.html`

| Dialog ID | الغرض | الشاشة |
|---|---|---|
| `expenseDialog` | إضافة/تعديل مصروف | المصروفات/لوحة التحكم |
| `memberDialog` | إضافة/تعديل مشترك | المشتركون |
| `actionDialog` | تجديد/دفعة/تجميد | المشتركون |
| `dayPassDialog` | إضافة/تعديل حصة يومية | لوحة التحكم |
| `pricingDialog` | أسعار الباقات | الإدارة |
| `membershipTypesDialog` | أنواع العضويات | الإدارة |
| `membershipPlanDialog` | تفاصيل باقة | الإدارة |
| `membershipTypeDialog` | إضافة/تعديل نوع | الإدارة |
| `detailsDialog` | تفاصيل عضو/السجل المالي | المشتركون |
| `qrReaderDialog` | قراءة QR | الحضور |
| `memberQrDialog` | عرض QR العضو | المشتركون |
| `libraryFormDialog` | إضافة/تعديل مكتبة | المكتبة |
| `libraryDetailsDialog` | تفاصيل تمرين/طعام/عضلة | المكتبة |
| `externalTraineeDialog` | إضافة متدرب خارجي | المتدربون |
| `coachingProfileDialog` | ملف التدريب والتغذية | المتدربون/المشتركون |
| `coachingBuilderDialog` | بناء برنامج/خطة | التدريب |
| `authUserDialog` | حساب Assistant | الإدارة |
| `backupRestoreDialog` | فحص/استرجاع نسخة | الإدارة |

النوافذ لا تملك API منفصلًا؛ كل نافذة تستعمل Endpoint الشاشة التي فتحتها. أما الطباعة فتتم من `public/js/integrations/print-enhancements.js` وعمليات receipt/report/plan حسب الحدث.

### قواعد العرض المشتركة

- `dialog` هو طبقة UI؛ مصدر البيانات يظل الخدمة المقابلة.
- عند الفتح، يظهر loading ثم يملأ body بالـDTO القادم من API.
- كل modal طويل يجب أن يمرر body داخليًا مع Header/Footer ثابتين.
- إغلاق النافذة لا يحذف البيانات من قاعدة البيانات إلا إذا استُدعي DELETE صراحة.
- أزرار الأيقونات تستخدم `aria-label`، والأرقام/التواريخ تُنسق في طبقة العرض فقط.

### الطباعة

| نوع الطباعة | المصدر |
|---|---|
| تقرير العضوية العامة | `member-portal.html` + print CSS |
| إيصال الدفع | تفاصيل العضو + `printPaymentReceipt(memberId, paymentId)` |
| ملف العضو/الاشتراكات | `print-enhancements.js` |
| خطط التدريب والتغذية | محتوى builder/profile + print module |
| تقارير الإدارة | بيانات `reports.js` + print styles |
| كتالوج الأسعار | زر لوحة التحكم `dashboardPrintPricingButton` |

---

## دليل API حسب الشاشة

الجدول التالي يجمع السطح الحالي للـ API حتى لا يكون endpoint خارج توثيق الشاشة المقابلة.

### الصحة والمصادقة

| Method | URL | Auth |
|---|---|---|
| `GET` | `/api/health` | عام؛ يفحص SQL Server |
| `GET` | `/api/auth/session` | عام/جلسة اختيارية |
| `POST` | `/api/auth/login` | عام |
| `POST` | `/api/auth/logout` | عام/جلسة اختيارية |
| `GET` | `/api/auth/users` | Owner |
| `POST` | `/api/auth/users` | Owner |
| `PUT` | `/api/auth/users/:id` | Owner |
| `PATCH` | `/api/auth/users/:id/status` | Owner |

### الأعضاء والعضويات

| Method | URL |
|---|---|
| `GET` | `/api/bootstrap` |
| `GET` | `/api/dashboard` |
| `GET` | `/api/members` |
| `GET` | `/api/members/:id` |
| `GET` | `/api/members/:id/details` |
| `POST` | `/api/members` |
| `PUT` | `/api/members/:id` |
| `DELETE` | `/api/members/:id` |
| `POST` | `/api/members/:id/freeze` |
| `POST` | `/api/members/:id/resume` |
| `POST` | `/api/members/:id/renew` |
| `POST` | `/api/members/:id/memberships` |
| `POST` | `/api/memberships/:id/payments` |
| `POST` | `/api/members/:id/alert-communications` |

### التسعير والمالية والحصص

| Method | URL |
|---|---|
| `GET` | `/api/pricing` |
| `PUT` | `/api/pricing` |
| `PUT` | `/api/pricing/:planCode` |
| `POST` | `/api/pricing-plans` |
| `PUT` | `/api/pricing-plans/:planCode` |
| `POST` | `/api/membership-types` |
| `PUT` | `/api/membership-types/:typeCode` |
| `GET` | `/api/monthly-finance` |
| `POST` | `/api/expenses` |
| `PUT` | `/api/expenses/:id` |
| `DELETE` | `/api/expenses/:id` |
| `GET` | `/api/day-passes/pricing` |
| `PUT` | `/api/day-passes/pricing` |
| `GET` | `/api/day-passes` |
| `GET` | `/api/day-passes/summary` |
| `POST` | `/api/day-passes` |
| `PUT` | `/api/day-passes/:id` |
| `DELETE` | `/api/day-passes/:id` |
| `POST` | `/api/day-passes/:id/whatsapp-opened` |
| `POST` | `/api/day-passes/:id/void` |

### الحضور والتدريب والمكتبة

| Method | URL |
|---|---|
| `GET` | `/api/attendance` |
| `GET` | `/api/attendance/report` |
| `GET` | `/api/attendance/member/:id` |
| `POST` | `/api/attendance/check-in` |
| `POST` | `/api/attendance/check-out` |
| `GET/POST` | `/api/external-trainees` |
| `GET` | `/api/coaching/clients` |
| `GET/PUT` | `/api/clients/:id` |
| `GET/POST/PUT/DELETE` | `/api/clients/:id/measurements` و`/:measurementId` |
| `GET/POST/PUT/DELETE` | `/api/clients/:id/checkins` و`/:checkinId` |
| `GET/POST/PUT/PATCH/DELETE` | `/api/workoutprograms` و`/api/workout-programs` |
| `GET/POST/PUT/PATCH/DELETE` | `/api/dietplans` و`/api/diet-plans` |
| `POST/GET` | `/api/workoutsessions/start`, `/api/workoutsessions`, `/api/workoutsessions/:id` |
| `POST` | `/api/workoutsessions/:id/sets` و`/:id/end` |
| `POST/GET` | `/api/meal-logs` |
| `GET` | `/api/library/options` |
| `GET/POST/PUT/DELETE` | `/api/library/:type` و`/:type/:id` |

### التقارير والنسخ والتقييم والبوابة

| Method | URL | Auth |
|---|---|---|
| `GET` | `/api/reports` | مستخدم مصادق |
| `GET` | `/api/dashboard-analytics` | Owner |
| `GET` | `/api/backup/daily` | Cron secret |
| `GET` | `/api/backup/download` | Owner |
| `GET` | `/api/backup/history` | Owner |
| `GET` | `/api/backup/archives/:id` | Owner |
| `DELETE` | `/api/backup/archives/:id` | Owner |
| `POST` | `/api/backup/inspect` | Owner |
| `POST` | `/api/backup/restore` | Owner |
| `POST` | `/api/member-portal/lookup` | عام بكود صالح |
| `GET` | `/api/members/:id/membership-code` | Owner |
| `POST` | `/api/members/:id/membership-code/reveal` | Owner |
| `POST` | `/api/members/:id/membership-code/resend` | Owner |
| `POST` | `/api/members/:id/membership-code/rotate` | Owner |
| `POST` | `/api/member-portal/feedback` | عام بكود صالح + rate limit |
| `GET` | `/api/member-feedback` | Owner |

---

## مرجع الجداول والعلاقات

### الجداول الأساسية والحقول الفعلية

> الأعمدة التالية هي تعريفات الجداول الحالية. بعض الأعمدة تظهر في شاشة واحدة فقط أو لا تظهر مطلقًا لأنها IDs أو metadata أو أسرار أمنية.

#### الهوية والعضوية

- `members`: `id`, `full_name`, `phone`, `phone_normalized`, `email`, `registration_date`, `notes`, `membership_code_hash`, `membership_code_ciphertext`, `membership_code_version`, `membership_code_issued_at`, `membership_code_revoked_at`, `created_at`, `updated_at`.
- `memberships`: `id`, `member_id`, `membership_plan`, `membership_type`, `start_date`, `end_date`, `notes`, `created_at`, `updated_at`.
- `membership_freezes`: `id`, `membership_id`, `start_date`, `end_date`, `resumed_date`, `reason`, `created_at`, `updated_at`.
- `membership_events`: `id`, `member_id`, `membership_id`, `event_type`, `details`, `created_at`.

#### الماليات والحصص

- `gym_payments`: `id`, `membership_id`, `list_price`, `discount_amount`, `amount_due`, `amount_paid`, `payment_method`, `paid_at`, `notes`, `created_at`, `updated_at`, `amount_remaining` computed.
- `gym_payment_transactions`: `id`, `membership_id`, `transaction_type`, `list_price`, `discount_amount`, `amount_due`, `amount_paid`, `amount_remaining`, `payment_method`, `paid_at`, `notes`, `source_payment_id`, `created_at`.
- `gym_expenses`: `id`, `expense_name`, `amount`, `expense_date`, `notes`, `created_at`, `updated_at`.
- `gym_day_pass_types`: `id`, `type_code`, `type_name`, `price`, `is_active`, `sort_order`, `created_at`, `updated_at`.
- `gym_day_pass_sales`: `id`, `visitor_name`, `visitor_phone`, `visitor_phone_normalized`, `pass_type_code`, `pass_type_name`, `amount_due`, `amount_paid`, `payment_method`, `visit_date`, `notes`, `status`, `created_by_user_id`, `whatsapp_opened_at`, `created_at`, `updated_at`.
- `gym_attendance`: `id`, `member_id`, `membership_id`, `attendance_date`, `check_in_at`, `check_out_at`, `check_in_source`, `check_out_source`, `notes`, `created_at`, `updated_at`.

#### التسعير

- `membership_pricing`: `id`, `plan_code`, `plan_name`, `monthly_price`, `is_active`, `sort_order`, `created_at`, `updated_at`.
- `membership_types`: `id`, `type_code`, `type_name`, `duration_mode`, `duration_value`, `price_multiplier`, `is_active`, `sort_order`, `created_at`, `updated_at`.
- `membership_type_prices`: `plan_code`, `type_code`, `price`, `created_at`, `updated_at`.

#### المكتبة

- `gym_muscles`: `id`, `source_id`, `name`, `name_ar`, `body_part`, `description`, `description_ar`, `icon`, `created_at`, `updated_at`.
- `gym_foods`: `id`, `source_id`, `name_ar`, `name_en`, `category`, `calories`, `protein`, `carbs`, `fat`, `fiber`, `sugar`, `sodium`, `serving_size`, `serving_unit`, `created_at`, `updated_at`.
- `gym_exercises`: `id`, `source_id`, `name`, `name_ar`, `description`, `description_ar`, `target_muscle_id`, `secondary_muscles_json`, `equipment`, `is_high_impact`, `difficulty`, `category`, `movement_pattern`, `mechanic`, `force`, `instructions_json`, `instructions_ar_json`, `tips_json`, `tips_ar_json`, `common_mistakes_json`, `common_mistakes_ar_json`, `reps_range`, `sets_range`, `rest_seconds`, `tempo`, `icon`, `video_url`, `metadata_json`, `created_at`, `updated_at`.

#### التدريب والتغذية

- `workout_programs`: `id`, `member_id`, `name`, `description`, `start_date`, `end_date`, `duration_weeks`, `goal`, `level`, `days_per_week`, `status`, `notes`, `version`, `created_at`, `updated_at`.
- `workout_routines`: `id`, `program_id`, `name`, `day_of_week`, `sort_order`, `notes`, `created_at`, `updated_at`.
- `workout_exercises`: `id`, `routine_id`, `exercise_id`, `sort_order`, `sets`, `reps_min`, `reps_max`, `weight_kg`, `rest_seconds`, `tempo`, `superset_group_id`, `notes`, `created_at`, `updated_at`.
- `diet_plans`: `id`, `member_id`, `name`, `description`, `start_date`, `end_date`, `meals_per_day`, `target_calories`, `target_protein`, `target_carbs`, `target_fats`, `status`, `notes`, `version`, `created_at`, `updated_at`.
- `diet_meals`: `id`, `diet_plan_id`, `name`, `meal_time`, `sort_order`, `notes`, `created_at`, `updated_at`.
- `diet_meal_items`: `id`, `meal_id`, `food_id`, `sort_order`, `assigned_quantity`, `serving_unit`, `calc_calories`, `calc_protein`, `calc_carbs`, `calc_fats`, `notes`, `created_at`, `updated_at`.
- `body_measurements`: `id`, `member_id`, `measured_at`, `weight_kg`, `height_cm`, `body_fat_percent`, `chest_cm`, `waist_cm`, `hips_cm`, `arms_cm`, `thighs_cm`, `notes`, `created_at`, `updated_at`.
- `workout_sessions`: `id`, `member_id`, `program_id`, `routine_id`, `started_at`, `ended_at`, `status`, `notes`.
- `workout_set_logs`: `id`, `session_id`, `workout_exercise_id`, `set_number`, `weight_kg`, `reps`, `completed_at`, `notes`.
- `meal_logs`: `id`, `member_id`, `meal_item_id`, `consumed_quantity`, `consumed_at`, `calc_calories`, `calc_protein`, `calc_carbs`, `calc_fats`, `notes`, `created_at`.

#### الأمن والتدقيق والتقييم والنسخ

- `gym_users`: `id`, `full_name`, `username`, `email`, `email_normalized`, `password_hash`, `role`, `status`, `last_login_at`, `created_at`, `updated_at`.
- `gym_auth_sessions`: `id`, `user_id`, `token_hash`, `expires_at`, `revoked_at`, `ip_address`, `user_agent`, `created_at`, `last_seen_at`.
- `gym_membership_code_audit`: `id`, `member_id`, `action`, `actor_user_id`, `ip_address`, `user_agent`, `created_at`.
- `gym_member_feedback`: `id`, `member_id`, `rating`, `note_type`, `message`, `submitted_at`.
- `gym_alert_communications`: `id`, `member_id`, `channel`, `alert_kind`, `alert_key`, `status`, `opened_at`, `sent_at`, `send_count`, `created_by_user_id`, `last_action_user_id`, `created_at`, `updated_at`.
- `gym_backup_operations`: `id`, `operation_type`, `file_name`, `source_generated_at`, `row_count`, `table_counts`, `status`, `details`, `created_at`.
- `gym_backup_archives`: `id`, `backup_day`, `file_name`, `backup_format`, `generated_at`, `content`, `content_bytes`, `row_count`, `table_counts`, `created_at`.
- `athlete_checkins` runtime: `id`, `member_id`, `checkin_date`, `sleep_hours`, `sleep_quality`, `fatigue`, `soreness`, `stress`, `mood`, `resting_hr`, `hrv`, `bodyweight_kg`, `notes`, `created_at`, `updated_at`.
- `coaching_activity_events` runtime: `id`, `member_id`, `event_type`, `entity_type`, `entity_id`, `details`, `created_at`.

### مخطط العلاقات المختصر

```text
gym_users 1 ───< gym_auth_sessions
members 1 ───< memberships 1 ─── 0..1 gym_payments
memberships 1 ───< gym_payment_transactions
memberships 1 ───< membership_freezes
members 1 ───< membership_events
members 1 ───< gym_attendance
members 1 ───< gym_member_feedback
members 1 ───< gym_membership_code_audit
members 1 ───< workout_programs 1 ───< workout_routines 1 ───< workout_exercises >── 1 gym_exercises
members 1 ───< diet_plans 1 ───< diet_meals 1 ───< diet_meal_items >── 1 gym_foods
members 1 ───< body_measurements
members 1 ───< athlete_checkins
members 1 ───< workout_sessions 1 ───< workout_set_logs
members 1 ───< meal_logs
gym_day_pass_types 1 ───< gym_day_pass_sales
gym_muscles 1 ───< gym_exercises عبر target_muscle_id
```

---

## التحويلات والقيود العامة

### التواريخ والأرقام

- SQL dates تُحوّل إلى date-only في الخدمات، ثم تعرضها الواجهة باستخدام `Intl.DateTimeFormat('ar-EG-u-ca-gregory')`.
- أوقات العمليات تبقى timestamps وتعرض بصيغة محلية.
- الأموال تقرّب إلى منزلتين عشريتين، و`amount_remaining` في `gym_payments` عمود computed.
- الأكواد والهواتف والمعرفات التقنية تُعرض LTR عند الحاجة داخل RTL.

### الحالات المشتقة

- العضوية: `active`, `expiring_soon`, `expired`, `frozen`.
- الحساب: `amount_remaining > 0` يعني مستحقًا.
- الحضور: داخل الجيم عند وجود دخول دون خروج، وتم الانصراف عند وجود `check_out_at`.
- الحصة: `completed` أو `voided` حسب `gym_day_pass_sales.status`.
- البرنامج/الخطة: الحالة محفوظة في `status`، والتقدم يحسب من التنفيذ.

### الأمن

- كلمات المرور `crypto.scrypt`، والـsessions تحفظ token hashes لا tokens الخام.
- كود بوابة المشترك يحفظ hash/ciphertext ولا يوضع في URL.
- `gym_member_feedback` لا يخزن كود العضوية، بل `member_id` فقط.
- Owner-only APIs محمية في الخادم، وإخفاء التبويب في الواجهة ليس طبقة الحماية الوحيدة.
- الاستعلامات Parameterized، وملفات النسخ/الاسترجاع تتطلب Owner أو cron secret.

### مصادر التحقق والصيانة

عند تعديل شاشة أو API يجب تحديث هذا الملف مع الملفات الفعلية التالية:

- `public/index.html` و`public/member-portal.html`.
- `public/js/app.js`, `public/js/page-tabs.js`, `public/js/feature-loader.js`.
- وحدات `public/js/pages/*`.
- route/controller/service/repository المقابل.
- `database/schema.sql` وأي `ensure*Tables` runtime.

هذا المستند توثيق للحالة الحالية، وليس عقدًا يسمح بتغيير API أو schema دون Migration واختبارات توافق.
