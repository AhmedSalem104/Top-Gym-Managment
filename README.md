# TOP GYM — Gym Management System

نظام إدارة جيم عربي يعمل باتجاه RTL لإدارة الأعضاء والاشتراكات والحضور
والمالية والتدريب والتغذية والمكتبات والتقارير والنسخ الاحتياطية من لوحة تشغيل
واحدة.

المشروع Modular Monolith مبني على Node.js وExpress وVanilla JavaScript
وMicrosoft SQL Server. لا يعتمد على React أو Next.js أو Vue أو MongoDB أو
Microservices، ويحافظ على REST APIs الحالية وHash Navigation والصلاحيات
والبيانات والأصول ومسارات الطباعة.

> آخر مراجعة لهذا المستند: 2026-08-20
> مصدر الحقيقة: الكود الحالي داخل المستودع.

## Table of contents

- [نظرة سريعة](#نظرة-سريعة)
- [المميزات](#المميزات)
- [المتجر وPOS والمخزون](#المتجر-وpos-والمخزون)
- [المتطلبات](#المتطلبات)
- [التثبيت والتشغيل](#التثبيت-والتشغيل)
- [إعداد قاعدة البيانات](#إعداد-قاعدة-البيانات)
- [Environment variables](#environment-variables)
- [الاستخدام](#الاستخدام)
- [الأدوار والصلاحيات](#الأدوار-والصلاحيات)
- [خريطة الشاشات](#خريطة-الشاشات)
- [المعمارية](#المعمارية)
- [هيكل المشروع](#هيكل-المشروع)
- [مرجع REST API](#مرجع-rest-api)
- [نظام التصميم والواجهة](#نظام-التصميم-والواجهة)
- [البيانات والأصول](#البيانات-والأصول)
- [الطباعة وPDF](#الطباعة-وpdf)
- [الاختبارات وQA](#الاختبارات-وqa)
- [النشر على Vercel](#النشر-على-vercel)
- [الأداء والأمان](#الأداء-والأمان)
- [المساهمة والتطوير](#المساهمة-والتطوير)
- [استكشاف الأخطاء](#استكشاف-الأخطاء)
- [الترخيص والمؤلفون](#الترخيص-والمؤلفون)
- [المراجع الداخلية](#المراجع-الداخلية)

## نظرة سريعة

| البند | القيمة |
|---|---|
| نوع التطبيق | Gym Management SaaS / Modular Monolith |
| لغة الواجهة | العربية، RTL |
| Backend | Node.js + Express 4 |
| Frontend | HTML5 + Vanilla JavaScript + Vanilla CSS |
| قاعدة البيانات | Microsoft SQL Server عبر mssql |
| المصادقة | Server-side session + HttpOnly cookie |
| تشفير كلمات المرور | Node.js crypto.scrypt مع salt عشوائي |
| التنقل | Hash Navigation مثل #members |
| النشر | Vercel |
| الاختبارات | Static QA، Smoke، Playwright، Browser Visual QA |
| Runtime المعلن | Node.js 24.x في package.json |
| المنطقة الزمنية الافتراضية | Africa/Cairo |

## المميزات

### إدارة العملاء والاشتراكات

- إنشاء وتعديل وحذف الأعضاء.
- قراءة ملف العضو وتاريخ التسجيل والاشتراكات والتجميد والمدفوعات.
- إنشاء اشتراك، تجديد الاشتراك، تسجيل دفعة، تجميد واستئناف العضوية.
- حالات اشتراك واضحة: نشط، قريب الانتهاء، منتهٍ، مجمد أو معلّق بحسب البيانات.
- طباعة ملف العضو والإيصالات وQR وخطط التدريب أو التغذية.
- بحث وفلاتر وتقسيم صفحات.
- تحويل الجداول إلى Data Cards على الشاشات الصغيرة.

### التدريب والتغذية

- إدارة المتدربين الخارجيين دون اشتراك عضوية فعال.
- ملف متابعة العميل، القياسات، check-ins وسجل الجلسات.
- Workout Programs مع routines وexercises وsets.
- Diet Plans مع meals وfood items.
- بدء جلسة تدريب، تسجيل المجموعات، إنهاء الجلسة وتسجيل الوجبات.

### الحضور والمالية

- Check-in وCheck-out بواسطة الهاتف أو QR.
- تقارير حضور يومية وتقارير حسب العضو أو الفترة.
- تسجيل المصروفات وتعديلها وحذفها.
- ملخص مالي شهري وتحليلات لوحة التحكم.
- تجهيز رسالة WhatsApp عبر إجراء المستخدم؛ لا يوجد إرسال تلقائي دون تدخل.

### المكتبات

- مكتبة 873 تمرينًا من Dataset المحلي.
- مكتبة 367 عنصر طعام.
- كتالوج 297 سجل عضلة.
- صور التمارين والعضلات محلية داخل public/assets.
- تفاصيل عربية/إنجليزية، عضلات، معدات، مستوى، خطوات وصور حسب البيانات.
- Fallback موحد عند غياب أصل صورة مؤكد.

### الإدارة والنسخ الاحتياطية

- Owner يستطيع إدارة حسابات Assistant.
- تغيير الاسم والبريد، تعطيل أو إعادة تفعيل Assistant وتغيير كلمة المرور.
- حذف حساب Assistant نهائيًا من شاشة حسابات الإدارة بعد تأكيد صريح؛ حساب Owner محمي.
- إعداد أسعار الباقات وأنواع العضويات.
- إنشاء نسخة احتياطية، تحميلها، فحصها، استعراض سجلها واسترجاعها بعد تأكيد.
- Cron endpoint للنسخة اليومية محمي بـ CRON_SECRET.

### بوابة المشترك وتقييم التجربة

- بوابة عامة `/member-portal` للدخول بكود عضوية نشط فقط.
- تقرير عضوية منظم يشمل الاشتراكات والمدفوعات والحضور، مع طباعة A4.
- قسم «قيّم تجربتك» داخل البوابة بخمس نجوم وأنواع ملاحظات متعددة.
- شاشة `#feedback` للتقييمات متاحة للـOwner فقط، مع فلاتر التقييم والنوع
  والتاريخ والبحث وإمكانية فتح تفاصيل العضو.
- تقييمات البوابة مرتبطة بـ`member_id` في SQL Server ولا تخزن كود العضوية.

### المتجر وPOS والمخزون

- شاشة `#store` مستقلة بنقطة بيع سريعة، كتالوج منتجات، مخزون، مشتريات، مبيعات، موردين، مصروفات وتقارير.
- عند اختيار عضو من البحث يُستخدم `member_id` وبياناته الحالية من `members` مباشرة؛ لا يتم إنشاء عميل مكرر.
- الزائر يمكنه إتمام الشراء دون عضوية، مع حفظ الاسم والهاتف اختياريًا كـWalk-in.
- كل استلام أو بيع أو مرتجع أو تسوية يكتب حركة في `gym_store_stock_movements` داخل Transaction، مع سجل حركات قابل للعرض وتقارير حسب المنتج والتصنيف والعميل واليوم.
- التكلفة تستخدم Weighted Average، وتفصل مصروفات المتجر عن مصروفات الجيم عبر `expense_source='store'`. إلغاء مصروف المتجر Soft Void قابل للتدقيق ولا يحذف السجل المالي.
- صلاحيات المتجر مستقلة، وMigration المتجر idempotent وتدخل جداول المتجر في النسخ الاحتياطي.

## المتطلبات

1. Node.js متوافق مع engines.node الحالية: 24.x.
2. npm حديث يدعم package-lock.json.
3. SQL Server reachable من بيئة التشغيل.
4. متصفح حديث للمستخدم النهائي.
5. Chromium أو Chrome/Edge لاختبارات Playwright المحلية.

متطلبات اختيارية: Git، PowerShell أو Bash، وPython 3 لأداة مزامنة أصول
العضلات.

ملاحظة: package.json و.nvmrc وWorkflow الخاص بـGitHub Actions تستخدم Node 24.x
بنفس النسخة؛ اختبارات CI لا تتصل بقاعدة Production ولا تستخدم أسرارًا.

## التثبيت والتشغيل

~~~bash
git clone https://github.com/AhmedSalem104/Top-Gym-Managment.git
cd Top-Gym-Managment
npm ci
~~~

Windows PowerShell:

~~~powershell
Copy-Item .env.example .env
~~~

Linux/macOS:

~~~bash
cp .env.example .env
~~~

املأ القيم السرية وConnection string، ثم:

~~~bash
npm start
~~~

للتطوير:

~~~bash
npm run dev
~~~

افتح http://localhost:3000/ ثم تحقق:

~~~bash
curl http://localhost:3000/api/health
~~~

استجابة الصحة:

~~~json
{
  "ok": true,
  "database": "connected"
}
~~~

## إعداد قاعدة البيانات

طبقة SQL Server تستخدم Pool مركزيًا عبر:

- src/database/pool.js
- src/database/transaction.js
- src/database/index.js
- src/db.js كمدخل توافق للكود القديم.

المخطط الأساسي في database/schema.sql. في بيئة جديدة:

1. أنشئ قاعدة بيانات منفصلة للتطوير والاختبار.
2. طبّق schema.sql أو Migration المعتمدة.
3. تحقق من صلاحيات مستخدم التطبيق.
4. شغّل /api/health.
5. شغّل الاختبارات على Test Database فقط.

| المجال | الجداول |
|---|---|
| العملاء | members, memberships |
| الأسعار | membership_pricing, membership_types, membership_type_prices |
| التجميد والمدفوعات | membership_freezes, gym_payments, gym_payment_transactions |
| الحضور والعمليات | gym_attendance, membership_events |
| المصروفات | gym_expenses |
| المتجر والبيع | gym_store_categories, gym_store_products, gym_store_product_variants, gym_store_suppliers, gym_store_customers, gym_store_purchases, gym_store_purchase_items, gym_store_purchase_payments, gym_store_inventory_balances, gym_store_inventory_batches, gym_store_stock_movements, gym_store_sales, gym_store_sale_items, gym_store_sale_payments, gym_store_returns, gym_store_return_items, gym_store_audit_log |
| المصادقة | gym_users, gym_auth_sessions |
| المكتبات | gym_exercises, gym_foods, gym_muscles |
| التدريب | workout_programs, workout_routines, workout_exercises, workout_sessions, workout_set_logs |
| التغذية | diet_plans, diet_meals, diet_meal_items, meal_logs |
| المتابعة | body_measurements |
| النسخ | gym_backup_operations, gym_backup_archives |

كل SQL Parameterized. لا تغيّر أسماء الجداول أو الأعمدة ضمن Refactor شكلي،
ولا تعرض Hash أو Token أو Connection string في API أو Logs.

## Environment variables

القيم مدعومة من .env.example وsrc/config/env.js.

| المتغير | مطلوب | الوصف |
|---|---:|---|
| NODE_ENV | لا | development افتراضيًا؛ production على Vercel |
| PORT | لا | منفذ Express، الافتراضي 3000 |
| MSSQL_CONNECTION_STRING | نعم | Connection string الرئيسي |
| DATABASE_URL | بديل | بديل لـMSSQL_CONNECTION_STRING |
| MSSQL_CONNECTION_TIMEOUT | لا | الافتراضي 30000ms |
| MSSQL_REQUEST_TIMEOUT | لا | الافتراضي 120000ms |
| MSSQL_POOL_MAX | لا | الحد الأقصى للـpool لكل instance، الافتراضي 10 |
| MSSQL_POOL_MIN | لا | الحد الأدنى للـpool لكل instance، الافتراضي 0 |
| MSSQL_POOL_IDLE_TIMEOUT_MS | لا | مهلة الخمول للـpool، الافتراضي 30000ms |
| APP_TIMEZONE | لا | الافتراضي Africa/Cairo |
| ATTENDANCE_AUTO_CHECKOUT_MINUTES | لا | Auto checkout؛ الافتراضي البرمجي 0 |
| CRON_SECRET | للإنتاج | سر حماية النسخة اليومية |
| AUTH_OWNER_EMAIL | bootstrap | بريد Owner الأول |
| AUTH_OWNER_NAME | bootstrap | اسم Owner الأول |
| AUTH_OWNER_PASSWORD | bootstrap | كلمة مرور Owner الأول |
| AUTH_SESSION_DAYS | لا | الافتراضي 7 |
| QA_BASE_URL | QA فقط | عنوان Browser QA الخارجي |
| AUTH_TEST_OWNER_EMAIL | E2E فقط | حساب Owner للاختبار |
| AUTH_TEST_OWNER_PASSWORD | E2E فقط | كلمة مرور Owner للاختبار |
| CI | لا | سلوك CI في Playwright |

استخدم Password عشوائية طويلة. إذا لم يتم إعداد Owner قد تعيد Session probe
قيمة setupRequired: true بحسب حالة قاعدة البيانات.

## الاستخدام

### تسجيل الدخول

1. أدخل Email وPassword فقط؛ لا يوجد اختيار Role.
2. الخادم يتحقق من الحساب والحالة والدور.
3. بعد النجاح تُنشأ Session وتُرسل Cookie آمنة.
4. تظهر التبويبات المسموحة، لكن الحماية الحقيقية Backend.

### دورة عضو نموذجية

~~~text
إضافة عضو
  -> إنشاء الاشتراك الأول
  -> تسجيل دفعة
  -> متابعة الحضور
  -> تجديد أو تجميد عند الحاجة
  -> طباعة الملف أو الإيصال
~~~

### التدريب والتغذية

افتح تفاصيل العضو أو المتدرب الخارجي، اختر التدريب والتغذية، أنشئ البرنامج أو
الخطة، اربط التمارين أو الطعام، احفظ ثم ابدأ جلسة أو سجل وجبة.

### النسخ والطباعة

Owner فقط ينفذ Backup وInspect وRestore. لا تنفذ Restore إلا بعد فحص النسخة
وتأكيد RESTORE. أزرار الطباعة تستخدم Print CSS مخصصًا لـA4.

## الأدوار والصلاحيات

### Owner

يمتلك لوحة التحكم، الأعضاء، المتدربين والتدريب والتغذية، الأسعار والعضويات،
الحضور، المصروفات، المكتبة، التقارير، النسخ الاحتياطية وإدارة Assistant.

### Assistant

يصل إلى المشتركون، المتدرب الخارجي، الحضور والانصراف، المكتبة ومسارات التدريب
والتغذية المرتبطة بعميل مسموح.

لا يستطيع Assistant إدارة المستخدمين أو المصروفات أو التقارير أو النسخ
الاحتياطية أو إعدادات الإدارة الحساسة. إخفاء Tab UX فقط؛ Backend يعيد 403.

## خريطة الشاشات

| Hash / القسم | الوظيفة | Owner | Assistant |
|---|---|:---:|:---:|
| #dashboard | المؤشرات والتنبيهات والمالية والتحليلات | ✓ | حسب الصلاحية الحالية |
| #members | الأعضاء والاشتراكات والدفعات والتفاصيل | ✓ | ✓ |
| #trainees | المتدربون الخارجيون والمتابعة | ✓ | ✓ |
| #management | الأسعار والعضويات والنسخ الاحتياطية | ✓ | حسب `pricing.read` |
| #permissions | إدارة حسابات Assistant وصلاحياتها | ✓ | مقفل/مخفي |
| #attendance | الحضور والانصراف والتقارير | ✓ | ✓ |
| #expenses | المصروفات والملخص المالي | ✓ | مقفل/مخفي |
| #library | تمارين وطعام وعضلات | ✓ | ✓ |
| #reports | التقارير والتحليلات التفصيلية | ✓ | مقفل/مخفي |

~~~mermaid
flowchart TD
    Login[Login: Email + Password] --> Session{Valid session?}
    Session -- No --> Login
    Session -- Yes --> Role{Role}
    Role -- Owner --> OwnerTabs[All permitted tabs]
    Role -- Assistant --> AssistantTabs[Members / Trainees / Attendance / Library]
    OwnerTabs --> Member[Member details]
    Member --> Workout[Workout program]
    Member --> Diet[Diet plan]
    Member --> Payment[Payment / renewal / freeze]
    AssistantTabs --> Attendance[Check-in / Check-out]
    OwnerTabs --> Reports[Finance / reports / backup]
~~~

صور Browser QA لا تُحفظ في Git لأن qa/artifacts ضمن .gitignore. أنشئها:

~~~bash
npm run test:visual
~~~

## المعمارية

~~~mermaid
flowchart LR
    Browser[Browser: HTML + JS + CSS]
    Shell[public/index.html]
    Core[Frontend API / state / permissions]
    Tabs[Hash tabs + feature loader]
    Express[Express app]
    Security[Security + session + auth]
    HTTP[Routes + controllers]
    Domain[Services]
    Data[Repositories + pool + transactions]
    SQL[(Microsoft SQL Server)]
    Assets[Local data and assets]
    Browser --> Shell --> Core --> Tabs --> Express
    Express --> Security --> HTTP --> Domain --> Data --> SQL
    Shell --> Assets
~~~

مسار الطلب:

~~~text
HTTP request
  -> security middleware
  -> session/auth middleware
  -> role/permission check
  -> route module
  -> controller
  -> service
  -> repository/database adapter
  -> parameterized SQL Server query
  -> response
~~~

| الطبقة | المسؤولية | ممنوع عليها |
|---|---|---|
| Route | HTTP method/path وتركيب middleware/controller | SQL أو Business Logic |
| Middleware | Auth، Permissions، Security، Rate limit، Cron guard | تغيير Domain data |
| Controller | قراءة req واستدعاء Service وإرسال res | SQL أو قواعد الاشتراك |
| Service | Business rules، حسابات، Transactions | معرفة req/res |
| Repository | SQL Parameterized وDB access | UI أو authorization decisions |
| Database | Pool وTransaction | HTTP أو HTML |
| Frontend API | fetch مركزي، cookies، parsing، status/errors | تكرار URLs |
| Page module | شاشة محددة وربط DOM بالأحداث | استبدال Backend security |
| CSS | Tokens ومكونات وتجاوب وطباعة | Business Logic |

~~~mermaid
sequenceDiagram
    participant B as Browser
    participant A as Auth API
    participant DB as SQL Server
    B->>A: POST /api/auth/login
    A->>DB: Find normalized email
    A->>A: Verify crypto.scrypt + timingSafeEqual
    A->>DB: Store session token hash
    A-->>B: HttpOnly cookie + user + expiresAt
    B->>A: Protected request with cookie
    A->>DB: Validate expiry and revocation
    A-->>B: Data or 401/403
    B->>A: POST /api/auth/logout
    A->>DB: Revoke session
    A-->>B: 204
~~~

## هيكل المشروع

~~~text
project-root/
├── server.js
├── package.json / package-lock.json
├── .env.example
├── vercel.json
├── src/
│   ├── app.js
│   ├── config/
│   ├── database/
│   ├── routes/
│   ├── controllers/
│   ├── services/
│   ├── repositories/
│   ├── middleware/
│   ├── permissions/
│   └── utils/
├── public/
│   ├── index.html
│   ├── css/
│   │   ├── main.css
│   │   ├── tokens.css
│   │   ├── reset.css
│   │   ├── typography.css
│   │   ├── layout.css
│   │   ├── utilities.css
│   │   ├── responsive.css
│   │   ├── print.css
│   │   ├── components/
│   │   └── pages/
│   ├── js/
│   │   ├── core/
│   │   ├── pages/
│   │   └── integrations/
│   ├── data/
│   └── assets/
├── database/
├── data/library/
├── data/anatomy/
├── tests/
├── scripts/
├── docs/
├── .github/workflows/qa.yml
└── qa/
~~~

الموديولات الحالية في Backend تشمل auth وmembers وcoaching وattendance وfinance
وdashboard وlibrary وreports وpricing وbackup. src/db.js Compatibility entrypoint،
وpublic/js/app.js ما زال shell متوافقًا لتدفقات الأعضاء وDashboard والأسعار.

## مرجع REST API

### القواعد العامة

- Base URL محلي: http://localhost:3000.
- كل المسارات تبدأ بـ /api.
- استخدم credentials: include في المتصفح أو cookie jar في curl.
- Health وAuth probe/login/logout عامة.
- باقي المسارات محمية ما لم يذكر خلاف ذلك.
- JSON يستخدم Content-Type: application/json.
- Backup inspect/restore يستخدم Raw body بصيغة gzip/octet-stream.

نمط خطأ شائع:

~~~json
{
  "error": "رسالة للمستخدم",
  "code": "AUTH_REQUIRED"
}
~~~

| الحالة | المعنى |
|---:|---|
| 200 | نجاح قراءة أو تعديل |
| 201 | إنشاء ناجح |
| 204 | نجاح بدون Body |
| 400 | بيانات أو Query غير صالحة |
| 401 | جلسة مفقودة أو منتهية |
| 403 | صلاحية مفقودة أو Origin غير مسموح |
| 404 | مورد غير موجود |
| 409 | تعارض |
| 429 | Rate limit |
| 500 | خطأ داخلي |

### Health and authentication

| Method | Path | Access | Body/Query | Result |
|---|---|---|---|---|
| GET | /api/health | Public | — | ok وdatabase |
| GET | /api/auth/session | Public | — | authenticated وuser وsetupRequired |
| POST | /api/auth/login | Public | email وpassword | user وexpiresAt + Cookie |
| POST | /api/auth/logout | Public/session-aware | — | 204 |
| GET | /api/auth/users | Owner | — | users |
| POST | /api/auth/users | Owner | name وemail وpassword | 201 user |
| PUT | /api/auth/users/:id | Owner | name وemail وpassword اختياري | user |
| PATCH | /api/auth/users/:id/status | Owner | status Active أو Disabled | user |

~~~bash
curl http://localhost:3000/api/health
curl -b cookies.txt http://localhost:3000/api/auth/session
curl -i -c cookies.txt -H "Content-Type: application/json" -d '{"email":"owner@example.com","password":"long-random-password"}' http://localhost:3000/api/auth/login
curl -b cookies.txt -X POST http://localhost:3000/api/auth/logout
curl -b cookies.txt http://localhost:3000/api/auth/users
curl -b cookies.txt -X POST -H "Content-Type: application/json" -d '{"name":"مساعد الصالة","email":"assistant@example.com","password":"long-random-password"}' http://localhost:3000/api/auth/users
curl -b cookies.txt -X PUT -H "Content-Type: application/json" -d '{"name":"مساعد محدث","email":"assistant@example.com"}' http://localhost:3000/api/auth/users/2
curl -b cookies.txt -X PATCH -H "Content-Type: application/json" -d '{"status":"Disabled"}' http://localhost:3000/api/auth/users/2/status
~~~

### Members and memberships

| Method | Path | Access | Request |
|---|---|---|---|
| GET | /api/members | Owner/Assistant | search, status, sort, page, pageSize |
| GET | /api/members/:id/details | Owner/Assistant | — |
| GET | /api/members/:id | Owner/Assistant | — |
| POST | /api/members | Owner/Assistant | member + first membership |
| PUT | /api/members/:id | Owner/Assistant | member fields |
| POST | /api/members/:id/freeze | Owner/Assistant | days, reason |
| POST | /api/members/:id/resume | Owner/Assistant | — |
| POST | /api/members/:id/renew | Owner/Assistant | membership/payment fields |
| POST | /api/members/:id/memberships | Owner/Assistant | membership/payment fields |
| POST | /api/memberships/:id/payments | Owner/Assistant | amountPaid/paymentMethod |
| DELETE | /api/members/:id | Owner/Assistant | — |

~~~json
{
  "fullName": "أحمد منير",
  "phone": "01000000000",
  "email": "member@example.com",
  "registrationDate": "2026-08-20",
  "membershipPlan": "gym_only",
  "membershipType": "monthly",
  "startDate": "2026-08-20",
  "endDate": "2026-09-19",
  "amountDue": 350,
  "amountPaid": 200,
  "discountAmount": 0,
  "paymentMethod": "cash",
  "paymentNotes": "",
  "membershipNotes": ""
}
~~~

~~~bash
curl -b cookies.txt "http://localhost:3000/api/members?search=أحمد&page=1&pageSize=20"
curl -b cookies.txt http://localhost:3000/api/members/10/details
curl -b cookies.txt -X POST -H "Content-Type: application/json" -d @member.json http://localhost:3000/api/members
curl -b cookies.txt -X PUT -H "Content-Type: application/json" -d '{"notes":"تم تحديث البيانات"}' http://localhost:3000/api/members/10
curl -b cookies.txt -X POST -H "Content-Type: application/json" -d '{"days":7,"reason":"إجازة"}' http://localhost:3000/api/members/10/freeze
curl -b cookies.txt -X POST http://localhost:3000/api/members/10/resume
curl -b cookies.txt -X POST -H "Content-Type: application/json" -d '{"membershipPlan":"gym_only","membershipType":"monthly","amountPaid":350,"paymentMethod":"cash"}' http://localhost:3000/api/members/10/renew
curl -b cookies.txt -X POST -H "Content-Type: application/json" -d '{"amountPaid":150,"paymentMethod":"cash"}' http://localhost:3000/api/memberships/45/payments
curl -b cookies.txt -X DELETE http://localhost:3000/api/members/10
~~~

قائمة الأعضاء تعيد members وpagination، وتشمل pagination عادة page وpageSize
وtotal وtotalPages وsort وhasNext وhasPrevious.

### Attendance

| Method | Path | Access | Request |
|---|---|---|---|
| GET | /api/attendance | Owner/Assistant | date, search |
| GET | /api/attendance/report | Owner/Assistant | report filters |
| GET | /api/attendance/member/:id | Owner/Assistant | period filters |
| POST | /api/attendance/check-in | Owner/Assistant | phone أو qrToken |
| POST | /api/attendance/check-out | Owner/Assistant | phone أو qrToken |

~~~bash
curl -b cookies.txt "http://localhost:3000/api/attendance?date=2026-08-20&search=010"
curl -b cookies.txt "http://localhost:3000/api/attendance/report?from=2026-08-01&to=2026-08-20"
curl -b cookies.txt "http://localhost:3000/api/attendance/member/10?limit=50"
curl -b cookies.txt -X POST -H "Content-Type: application/json" -d '{"phone":"01000000000"}' http://localhost:3000/api/attendance/check-in
curl -b cookies.txt -X POST -H "Content-Type: application/json" -d '{"phone":"01000000000"}' http://localhost:3000/api/attendance/check-out
~~~

### Finance

| Method | Path | Access | Request |
|---|---|---|---|
| GET | /api/monthly-finance | Owner | finance filters optional |
| POST | /api/expenses | Owner | name, amount, expenseDate, notes |
| PUT | /api/expenses/:id | Owner | expense fields |
| DELETE | /api/expenses/:id | Owner | — |

~~~bash
curl -b cookies.txt http://localhost:3000/api/monthly-finance
curl -b cookies.txt -X POST -H "Content-Type: application/json" -d '{"name":"صيانة أجهزة","amount":1200,"expenseDate":"2026-08-20","notes":"دورية"}' http://localhost:3000/api/expenses
curl -b cookies.txt -X PUT -H "Content-Type: application/json" -d '{"amount":1350}' http://localhost:3000/api/expenses/7
curl -b cookies.txt -X DELETE http://localhost:3000/api/expenses/7
~~~

### Dashboard

| Method | Path | Access | Query |
|---|---|---|---|
| GET | /api/dashboard | Owner | — |
| GET | /api/dashboard-analytics | Owner | period week/month/year |
| GET | /api/bootstrap | Owner | — |

~~~bash
curl -b cookies.txt http://localhost:3000/api/dashboard
curl -b cookies.txt "http://localhost:3000/api/dashboard-analytics?period=month"
curl -b cookies.txt http://localhost:3000/api/bootstrap
~~~

### Pricing and membership types

| Method | Path | Access | Request |
|---|---|---|---|
| GET | /api/pricing | Owner/Assistant read |
| PUT | /api/pricing | Owner | plans array |
| PUT | /api/pricing/:planCode | Owner | plan fields |
| POST | /api/pricing-plans | Owner | plan fields |
| PUT | /api/pricing-plans/:planCode | Owner | plan fields |
| POST | /api/membership-types | Owner | type fields |
| PUT | /api/membership-types/:typeCode | Owner | type fields |

~~~json
{
  "planCode": "gym_only",
  "planName": "جيم فقط",
  "monthlyPrice": 350,
  "isActive": true,
  "sortOrder": 1
}
~~~

~~~json
{
  "typeCode": "monthly",
  "typeName": "شهرية",
  "durationMode": "months",
  "durationValue": 1,
  "priceMultiplier": 1,
  "isActive": true
}
~~~

~~~bash
curl -b cookies.txt http://localhost:3000/api/pricing
curl -b cookies.txt -X POST -H "Content-Type: application/json" -d '{"planCode":"gym_only","planName":"جيم فقط","monthlyPrice":350,"isActive":true}' http://localhost:3000/api/pricing-plans
curl -b cookies.txt -X PUT -H "Content-Type: application/json" -d '{"monthlyPrice":375}' http://localhost:3000/api/pricing/gym_only
curl -b cookies.txt -X POST -H "Content-Type: application/json" -d '{"typeCode":"monthly","typeName":"شهرية","durationMode":"months","durationValue":1,"priceMultiplier":1,"isActive":true}' http://localhost:3000/api/membership-types
~~~

### Library

قيمة type تحدد المجموعة: exercises أو foods أو muscles.

| Method | Path | Access | Request |
|---|---|---|---|
| GET | /api/library/options | Owner/Assistant | — |
| GET | /api/library/:type | Owner/Assistant | filters وpage وpageSize |
| GET | /api/library/:type/:id | Owner/Assistant | — |
| POST | /api/library/:type | Owner/Assistant | item payload |
| PUT | /api/library/:type/:id | Owner/Assistant | item fields |
| DELETE | /api/library/:type/:id | Owner/Assistant | — |

~~~bash
curl -b cookies.txt http://localhost:3000/api/library/options
curl -b cookies.txt "http://localhost:3000/api/library/exercises?search=bench&page=9&pageSize=100"
curl -b cookies.txt http://localhost:3000/api/library/exercises/101
curl -b cookies.txt -X POST -H "Content-Type: application/json" -d '{"nameAr":"ضغط صدر بالبار","name":"Barbell Bench Press","difficulty":"intermediate"}' http://localhost:3000/api/library/exercises
curl -b cookies.txt -X PUT -H "Content-Type: application/json" -d '{"difficulty":"beginner"}' http://localhost:3000/api/library/exercises/101
curl -b cookies.txt -X DELETE http://localhost:3000/api/library/exercises/101
~~~

ملاحظة تشغيلية: Pagination يقبل pageSize حتى 100. Count query منفصل عن
Projection التمرين المركب حتى لا يفشل الطلب عند الصفحات الكبيرة.

### Reports

| Method | Path | Access | Query |
|---|---|---|---|
| GET | /api/reports | Owner | from وto أو range fields |

~~~bash
curl -b cookies.txt "http://localhost:3000/api/reports?from=2026-08-01&to=2026-08-20"
~~~

### External trainees and clients

| Method | Path | Access | Request |
|---|---|---|---|
| GET | /api/external-trainees | Owner/Assistant | search, page, pageSize |
| POST | /api/external-trainees | Owner/Assistant | fullName, phone, email, registrationDate, notes |
| GET | /api/coaching/clients | Owner/Assistant | search, limit |
| GET | /api/clients/:id/training-overview | Owner/Assistant | — |
| PUT | /api/clients/:id | Owner/Assistant | client fields |

~~~json
{
  "fullName": "محمد علي",
  "phone": "01011111111",
  "email": "trainee@example.com",
  "registrationDate": "2026-08-20",
  "notes": "متابعة أسبوعية"
}
~~~

~~~bash
curl -b cookies.txt "http://localhost:3000/api/external-trainees?page=1&pageSize=20"
curl -b cookies.txt "http://localhost:3000/api/coaching/clients?search=محمد&limit=20"
curl -b cookies.txt http://localhost:3000/api/clients/10/training-overview
curl -b cookies.txt -X POST -H "Content-Type: application/json" -d @trainee.json http://localhost:3000/api/external-trainees
curl -b cookies.txt -X PUT -H "Content-Type: application/json" -d '{"notes":"متابعة شهرية"}' http://localhost:3000/api/clients/10
~~~

### Measurements and check-ins

| Method | Path | Access |
|---|---|---|
| GET | /api/clients/:id/measurements | Owner/Assistant |
| POST | /api/clients/:id/measurements | Owner/Assistant |
| PUT | /api/clients/:id/measurements/:measurementId | Owner/Assistant |
| DELETE | /api/clients/:id/measurements/:measurementId | Owner/Assistant |
| GET | /api/clients/:id/checkins | Owner/Assistant، limit |
| POST | /api/clients/:id/checkins | Owner/Assistant |
| PUT | /api/clients/:id/checkins/:checkinId | Owner/Assistant |
| DELETE | /api/clients/:id/checkins/:checkinId | Owner/Assistant |

~~~json
{
  "measuredAt": "2026-08-20",
  "weightKg": 82.5,
  "bodyFatPercent": 18,
  "muscleMassKg": 62,
  "chestCm": 104,
  "waistCm": 86,
  "notes": "قياس صباحي"
}
~~~

~~~bash
curl -b cookies.txt http://localhost:3000/api/clients/10/measurements
curl -b cookies.txt -X POST -H "Content-Type: application/json" -d @measurement.json http://localhost:3000/api/clients/10/measurements
curl -b cookies.txt -X PUT -H "Content-Type: application/json" -d '{"weightKg":81.8}' http://localhost:3000/api/clients/10/measurements/4
curl -b cookies.txt -X DELETE http://localhost:3000/api/clients/10/measurements/4
curl -b cookies.txt "http://localhost:3000/api/clients/10/checkins?limit=20"
curl -b cookies.txt -X POST -H "Content-Type: application/json" -d '{"checkinDate":"2026-08-20","notes":"تحسن في الالتزام","mood":"good"}' http://localhost:3000/api/clients/10/checkins
~~~

### Workout programs

المساران التاليان متكافئان للحفاظ على Backward Compatibility:

- /api/workoutprograms
- /api/workout-programs

| Method | Path | Access | Request |
|---|---|---|---|
| GET | prefix | Owner/Assistant | memberId أو clientId، search، status، level |
| GET | prefix/:id | Owner/Assistant | memberId أو clientId اختياري |
| POST | prefix | Owner/Assistant | program + routines + exercises |
| PUT | prefix/:id | Owner/Assistant | program fields |
| PATCH | prefix/:id/status | Owner/Assistant | status |
| DELETE | prefix/:id | Owner/Assistant | — |

~~~json
{
  "memberId": 10,
  "name": "برنامج القوة الأساسي",
  "description": "برنامج 8 أسابيع",
  "startDate": "2026-08-20",
  "endDate": "2026-10-15",
  "durationWeeks": 8,
  "goal": "strength",
  "level": "beginner",
  "daysPerWeek": 3,
  "status": "active",
  "version": 1,
  "routines": [
    {
      "name": "اليوم الأول",
      "dayOfWeek": 1,
      "exercises": [
        {
          "exerciseId": 101,
          "sets": 3,
          "repsMin": 8,
          "repsMax": 12,
          "weightKg": 20,
          "restSeconds": 90
        }
      ]
    }
  ]
}
~~~

~~~bash
curl -b cookies.txt "http://localhost:3000/api/workoutprograms?memberId=10&status=active"
curl -b cookies.txt http://localhost:3000/api/workoutprograms/12?memberId=10
curl -b cookies.txt -X POST -H "Content-Type: application/json" -d @workout-program.json http://localhost:3000/api/workoutprograms
curl -b cookies.txt -X PUT -H "Content-Type: application/json" -d @workout-program-update.json http://localhost:3000/api/workoutprograms/12
curl -b cookies.txt -X PATCH -H "Content-Type: application/json" -d '{"status":"archived"}' http://localhost:3000/api/workoutprograms/12/status
curl -b cookies.txt -X DELETE http://localhost:3000/api/workoutprograms/12
~~~

### Diet plans

المساران التاليان متكافئان:

- /api/dietplans
- /api/diet-plans

| Method | Path | Access | Request |
|---|---|---|---|
| GET | prefix | Owner/Assistant | memberId أو clientId، search، status |
| GET | prefix/:id | Owner/Assistant | client id اختياري |
| POST | prefix | Owner/Assistant | plan + meals + items |
| PUT | prefix/:id | Owner/Assistant | plan fields |
| PATCH | prefix/:id/status | Owner/Assistant | status |
| DELETE | prefix/:id | Owner/Assistant | — |

~~~json
{
  "memberId": 10,
  "name": "خطة التغذية اليومية",
  "description": "خطة متوازنة",
  "startDate": "2026-08-20",
  "endDate": "2026-09-20",
  "mealsPerDay": 4,
  "targetCalories": 2400,
  "targetProtein": 160,
  "targetCarbs": 260,
  "targetFats": 70,
  "status": "active",
  "meals": [
    {
      "name": "الإفطار",
      "mealTime": "08:00",
      "items": [
        {
          "foodId": 22,
          "assignedQuantity": 100,
          "servingUnit": "g"
        }
      ]
    }
  ]
}
~~~

~~~bash
curl -b cookies.txt "http://localhost:3000/api/dietplans?memberId=10&status=active"
curl -b cookies.txt http://localhost:3000/api/dietplans/4?memberId=10
curl -b cookies.txt -X POST -H "Content-Type: application/json" -d @diet-plan.json http://localhost:3000/api/dietplans
curl -b cookies.txt -X PUT -H "Content-Type: application/json" -d @diet-plan-update.json http://localhost:3000/api/dietplans/4
curl -b cookies.txt -X PATCH -H "Content-Type: application/json" -d '{"status":"archived"}' http://localhost:3000/api/dietplans/4/status
curl -b cookies.txt -X DELETE http://localhost:3000/api/dietplans/4
~~~

### Workout sessions and meal logs

| Method | Path | Access | Request |
|---|---|---|---|
| POST | /api/workoutsessions/start | Owner/Assistant | member/client، program، routine، startedAt |
| GET | /api/workoutsessions | Owner/Assistant | member/client وفلاتر |
| GET | /api/workoutsessions/:id | Owner/Assistant | — |
| POST | /api/workoutsessions/:id/sets | Owner/Assistant | exercise، set، reps، weight، RPE |
| POST | /api/workoutsessions/:id/end | Owner/Assistant | endedAt، notes |
| POST | /api/meal-logs | Owner/Assistant | member/client، food/meal، quantity، time |
| GET | /api/meal-logs | Owner/Assistant | member/client وفلاتر |

~~~bash
curl -b cookies.txt -X POST -H "Content-Type: application/json" -d '{"memberId":10,"programId":12,"routineId":30,"startedAt":"2026-08-20T18:00:00+03:00"}' http://localhost:3000/api/workoutsessions/start
curl -b cookies.txt http://localhost:3000/api/workoutsessions/55
curl -b cookies.txt -X POST -H "Content-Type: application/json" -d '{"exerciseId":101,"setNumber":1,"reps":10,"weightKg":20,"restSeconds":90,"rpe":7}' http://localhost:3000/api/workoutsessions/55/sets
curl -b cookies.txt -X POST -H "Content-Type: application/json" -d '{"endedAt":"2026-08-20T19:05:00+03:00","notes":"جلسة مكتملة"}' http://localhost:3000/api/workoutsessions/55/end
curl -b cookies.txt -X POST -H "Content-Type: application/json" -d '{"memberId":10,"foodId":22,"consumedAt":"2026-08-20T08:15:00+03:00","quantity":100,"servingUnit":"g"}' http://localhost:3000/api/meal-logs
curl -b cookies.txt "http://localhost:3000/api/meal-logs?memberId=10&limit=20"
~~~

### Backup and restore

| Method | Path | Access |
|---|---|---|
| GET | /api/backup/daily | Cron authorized request فقط |
| GET | /api/backup/download?format=json.gz | Owner |
| GET | /api/backup/history?limit=3&archiveLimit=10 | Owner |
| GET | /api/backup/archives/:id | Owner |
| DELETE | /api/backup/archives/:id | Owner |
| POST | /api/backup/inspect | Owner، raw gzip |
| POST | /api/backup/restore | Owner، raw gzip + confirmation |

~~~bash
curl -b cookies.txt -L "http://localhost:3000/api/backup/download?format=json.gz" -o top-gym-backup.json.gz
curl -b cookies.txt -L "http://localhost:3000/api/backup/download?format=bak" -o top-gym-backup.bak
curl -b cookies.txt "http://localhost:3000/api/backup/history?limit=3&archiveLimit=10"
curl -b cookies.txt -X POST -H "Content-Type: application/octet-stream" -H "X-BACKUP-FILENAME: top-gym-backup.json.gz" --data-binary "@top-gym-backup.json.gz" http://localhost:3000/api/backup/inspect
curl -b cookies.txt -X POST -H "Content-Type: application/octet-stream" -H "X-BACKUP-FILENAME: top-gym-backup.json.gz" -H "X-TOP-GYM-RESTORE-CONFIRM: RESTORE" --data-binary "@top-gym-backup.json.gz" http://localhost:3000/api/backup/restore
curl -b cookies.txt -X DELETE http://localhost:3000/api/backup/archives/3
~~~

## نظام التصميم والواجهة

### المبادئ

- Arabic-first وRTL مع فصل LTR للبريد والهاتف والتاريخ والمعرفات.
- Flat SaaS UI: أسطح بيضاء، Primary Blue، حدود هادئة وظلال خفيفة.
- أزرار واضحة وحالات Focus وDisabled وLoading.
- Touch targets لا تقل عادة عن 40–44px.
- الجداول Desktop تتحول إلى Cards على الهاتف بدل ضغط الأعمدة.
- لا تضف Inline style عندما يمكن استخدام Component token.
- لا تستخدم !important إلا في reset/responsive/print المبررة.

### CSS architecture

نقطة الدخول الوحيدة التي يحمّلها المتصفح هي public/css/main.css. ملفات الطبقات القابلة للتعديل موجودة في public/css/main.source.css، ويحوّلها build:css إلى ملف إنتاج واحد:

~~~text
main.source.css
  -> tokens.css
  -> reset.css
  -> typography.css
  -> layout.css
  -> utilities.css
  -> components/*
  -> pages/*
  -> responsive.css
  -> print.css
  -> main.css (production bundle)
~~~

لا تعدّل main.css يدويًا؛ عدّل الطبقة المناسبة ثم شغّل `npm run build:css`. هذا يقلل طلبات CSS من سلسلة imports متعددة إلى طلب واحد مع الحفاظ على تنظيم الطبقات.

### Design tokens والألوان

| الفئة | Tokens أو القيمة الحالية |
|---|---|
| Background | --color-bg = #f5f7fb |
| Surface | --color-surface = #ffffff |
| Primary | --color-primary = #1769e8 |
| Primary hover | --color-primary-hover = #0f56c9 |
| Text | --color-text = #172033 |
| Muted text | --color-text-muted = #718096 |
| Success | --color-success = #0f9f6e |
| Warning | --color-warning = #bd7604 |
| Danger | --color-danger = #d74343 |
| Member pale blue | --color-pale-blue = #eff6ff |
| Outstanding balance | --color-outstanding = #dc2626 |
| Border | --border-color = #e1e8f1 |
| Radius | --radius-xs إلى --radius-xl و--radius-pill |
| Spacing | --space-1 إلى --space-12 |
| Layers | --z-base إلى --z-toast |

يوجد Dark Theme عبر html[data-theme="dark"] أو body[data-theme="dark"].
الخط الأساسي Cairo ثم Tahoma ثم sans-serif. Email وPhone وURLs والأكواد
والقيم المركبة تستخدم LTR عند الحاجة مع unicode-bidi: isolate.

### المكونات المشتركة

| المكوّن | الملفات |
|---|---|
| Buttons | components/buttons.css |
| Forms | components/forms.css |
| Cards | components/cards.css |
| Tables | components/tables.css وtable-cards.js |
| Modals | components/modals.css |
| Tabs | components/tabs.css وpage-tabs.js |
| Badges/Alerts | components/badges.css وalerts.css |
| Navbar/Sidebar | components/navbar.css وsidebar.css |
| Dropdown/Pagination | components/dropdowns.css وpagination.css |
| Loading/Empty | components/loading.css وempty-states.css |
| Assistant | components/assistant.css وsmart-assistant.js |

### Responsive breakpoints

| النطاق | السلوك |
|---|---|
| <=379px | Compact mobile، تقليل padding وتكديس الإجراءات |
| 380–767px | Mobile cards وTabs قابلة للاستخدام وForms عمودية |
| 768–991px | Tablet، tables قابلة للتمرير عند الضرورة |
| 992–1199px | Small laptop، تقليل gaps |
| 1200–1439px | Laptop |
| >=1440px | Desktop مع max-width وعدم Stretch مبالغ |

### استراتيجية الجداول

table-cards.js يقرأ عناوين الجدول ويضيف Classes وظيفية، ثم responsive.css:

1. يخفي Header الجدول بصريًا مع إبقاء semantics.
2. يحول كل Row إلى Card.
3. يعرض كل خلية كـKey/Value.
4. يحافظ على اتجاه الأرقام والتواريخ.
5. يجعل Actions في صف واضح.
6. يمنع خروج الأزرار من البطاقة.

## البيانات والأصول

| الملف | العدد المحلي الحالي | الاستخدام |
|---|---:|---|
| data/library/exercises-dataset.json | 873 | Dataset التمارين |
| data/library/muscles.json | 297 | كتالوج العضلات |
| data/library/foods.json | 367 | كتالوج الطعام |
| data/library/exercise-image-matching.json | mapping | ربط الصور |
| data/library/exercise-image-aliases.json | mapping | مرادفات الصور |
| data/library/exercise-catalog-mapping.json | mapping | توحيد الكتالوج |
| public/data/exercise-assets.json | manifest | أصول التمرين |
| public/data/muscle-assets.json | manifest | أصول العضلات |

~~~text
public/assets/exercises/
public/assets/muscles/
public/assets/gym-background.webp
public/assets/login-athlete.webp
public/assets/icons/
public/assets/logos/
~~~

استخدم Mapping مؤكدًا فقط، وأبعادًا ثابتة للصور، Lazy loading للأصول غير
الضرورية، وFallback موحدًا عند عدم وجود الصورة.

## الطباعة وPDF

الملفات:

~~~text
public/css/print.css
public/js/integrations/print-enhancements.js
~~~

تخفي Print CSS Navbar وTabs وSidebar والأزرار وToast وPagination، وتحافظ على
الجداول والبطاقات والصور والمعلومات المهمة. تُضبط Page breaks والصور لورق A4.

~~~bash
npm run test:visual
~~~

## الاختبارات وQA

| الأمر | الوظيفة |
|---|---|
| npm run build:css | CSS imports وvariables وbraces وmedia وentrypoint وprint |
| npm run build | يمر عبر build:css |
| npm run qa:gate | Static وcontract وauth وlazy loading وsecrets |
| npm run qa:gate:smoke | QA + build + smoke |
| npm run qa:gate:browser | QA + build + browser QA |
| npm run test:smoke | Smoke tests |
| npm run test:e2e | Playwright E2E |
| npm run test:e2e:headed | Playwright بواجهة مرئية |
| npm run test:visual | Browser style/overflow/console/network/dialog/print |
| npm run qa:exercise-catalog | فحص Catalog التمارين |
| npm run qa:exercise-content | فحص محتوى التمارين |
| npm run qa:muscle-assets | فحص أصول العضلات |
| npm run build:muscle-mapping | بناء Mapping العضلات |
| npm run sync:library | مزامنة Dataset |
| npm run enrich:exercise-content | إثراء بيانات التمارين |

بوابة الجودة المحلية:

~~~bash
npm run build:css
npm run qa:gate
npm run test:smoke
npm run test:e2e
npm run test:visual
~~~

Smoke وE2E التي تحتاج Database يجب أن تعمل على Test Database آمنة. إذا لم توجد
بيئة اختبار، سجّل NOT RUN - TEST ENVIRONMENT REQUIRED.

Browser QA يغطي Login وDashboard وMembers وTrainees وManagement وAttendance
وExpenses وLibrary وReports والDialogs وPrint على:

~~~text
375، 430، 768، 1024، 1440، 1920
~~~

ويتحقق من Console errors وFailed responses وHorizontal overflow وتحميل
main.css مرة واحدة.

## النشر على Vercel

1. اربط Repository بمشروع Vercel واحد.
2. استخدم server.js كـExpress entry الحالي.
3. أضف Environment Variables نفسها من .env.
4. تأكد من SQL Server network access وTLS.
5. شغّل QA قبل النشر.
6. تحقق من /api/health بعد النشر.
7. اختبر Owner وAssistant وLogout والقراءة الأساسية.

### Cron

vercel.json يحتوي:

~~~json
{
  "crons": [
    {
      "path": "/api/backup/daily",
      "schedule": "0 12 * * *"
    }
  ]
}
~~~

الجدول يفسَّر وفق Vercel/UTC؛ تحقق من وقت التنفيذ الفعلي في Logs، واضبط
CRON_SECRET، ولا تجعل endpoint عامًا.

### Production checklist

- [ ] NODE_ENV=production.
- [ ] Connection string صحيح ومشفّر.
- [ ] AUTH_OWNER_PASSWORD قوي وغير موجود في Git.
- [ ] Cookies تستخدم Secure في الإنتاج.
- [ ] CRON_SECRET مضبوط.
- [ ] /api/health يرجع database: connected.
- [ ] Login وLogout يعملان.
- [ ] Assistant يحصل على 403 للمسارات الحساسة.
- [ ] Backup daily يظهر في Logs.
- [ ] لا توجد 404 للأصول أو CSS.
- [ ] لا توجد Console errors أو Failed requests غير متوقعة.

## الأداء والأمان

### الأداء

- Pool SQL مركزي.
- Parameterized queries.
- Pagination وserver-side search عند الحاجة.
- Debounce وAbort للبحث.
- Lazy feature scripts مع caching.
- التحميل الأولي يقتصر على 12 ملف JavaScript وملف CSS إنتاجي واحد؛ dashboard enhancements وملفات الشاشات الثقيلة تُحمّل عند الحاجة أو في وقت الخمول.
- صورة خلفية تسجيل الدخول لا تُطلب للمستخدم المسجّل؛ تُفعّل فقط عند ظهور شاشة الدخول.
- Cache للبيانات المرجعية شبه الثابتة فقط.
- صور WebP محلية وlazy loading.
- CSS entrypoint واحد.
- Data Cards على الهاتف بدل overflow للصفحة كلها.

### الأمان

- Password hashing عبر crypto.scrypt وsalt عشوائي.
- timing-safe comparison.
- Session token عشوائي، والمخزن في SQL hash.
- HttpOnly وSameSite=Lax وSecure في الإنتاج.
- Session rotation بعد Login وإبطال بعد Logout.
- Generic invalid-credentials message.
- Rate limiting للـLogin والعمليات الحساسة.
- Same-origin check للطلبات التي تغيّر البيانات.
- Backend authorization لكل طلب.
- حماية Cron وBackup.
- Security headers.
- عدم تسجيل Password أو Cookie أو Secret أو Connection string.

## المساهمة والتطوير

### قبل Pull Request

~~~bash
git switch -c feat/short-description
git status
git diff --check
npm run build:css
npm run qa:gate
~~~

حافظ على API names وDOM IDs وdata attributes. افصل Route ثم Controller ثم
Service ثم Repository، واستخدم SQL Parameters وTransactions. أصلح المشكلة
المشتركة في طبقتها المشتركة، ولا تضف Dependency جديدة دون سبب قابل للقياس.

### Commit convention

~~~text
feat: add member workflow
fix: prevent assistant access to reports
refactor: extract attendance service
style: improve mobile data cards
test: add permission regression coverage
docs: update API reference
~~~

### قواعد Refactor

- لا تنفذ Big Bang refactor.
- انقل Domain واحدًا في كل مرة.
- استخدم Compatibility wrapper مؤقتًا ثم احذفه بعد تحديث references.
- لا تغيّر Database schema بلا Migration منفصلة.
- لا تغيّر Response contract بلا خطة توافق.
- اختبر Create/Read/Update/Delete والـPermissions بعد كل مرحلة.

## استكشاف الأخطاء

### 401 Unauthorized بعد Refresh

تحقق من credentials و/api/auth/session وAUTH_SESSION_DAYS وSecret الجلسة في
Vercel. امسح Cookie قديمة فقط بعد حفظ سبب المشكلة.

### 403 Forbidden

تحقق من Role وStatus في gym_users. Assistant لا يملك finance/reports/backup
وuser management. اختبر API مباشرة ولا تعتمد على إخفاء Tab.

### 500 من Dashboard أو Analytics

اطلب /api/health، راجع Vercel Function Logs، تحقق من الجداول المطلوبة وtimeout
وConnection string. لا تخفِ الخطأ في الواجهة بدل إصلاح السبب.

### 500 من مكتبة التمارين في صفحة كبيرة

Pagination يقبل pageSize حتى 100. استعلام COUNT منفصل عن Projection التمارين
لتجنب فشل SQL Server في الصفحات الكبيرة. إذا استمر الخطأ راجع صحة الاتصال
والـmetadata_json وسجل الخادم.

### CSS لا يظهر أو يظهر بعد ثانية

افتح /css/main.css وتحقق من 200، شغّل npm run build:css، وتأكد أن index.html
يربط main.css مرة واحدة وأن imports موجودة في main.source.css ولا توجد imports فعالة
داخل bundle. لا تضف Inline override كحل مؤقت.

### الجداول لا تتحول إلى Cards

تحقق من تحميل table-cards.js مرة واحدة، cache bust في index.html، وجود table
وthead وtbody وdata attributes، ثم شغّل npm run test:visual.

### Modal أو Popup يتجاوز الشاشة

افحص max-height وoverflow الداخلي وz-index، ولا تجعل Header/Footer يغطيان
Body. اختبر 375 و430 و768 و1440.

### Actions تغطي جدول المتدرب الخارجي

على Desktop العريض يكون عمود الإجراءات ضمن تدفق الجدول، وقائمة المزيد Absolute
داخل خلية الإجراءات. على Tablet/Mobile فقط تتحول القائمة إلى Fixed عندما
يحتاجها overflow. إذا ظهرت نسخة قديمة، امسح cache وتحقق من إصدار script.

### Backup يفشل

تحقق من CRON_SECRET وصلاحيات SQL Server، راجع /api/backup/history، ونفذ
Download ثم Inspect قبل Restore. لا تسترجع Production دون نسخة حماية.

### Playwright لا يبدأ

~~~bash
npx playwright install chromium
npm run test:e2e
~~~

استخدم AUTH_TEST_OWNER_EMAIL وAUTH_TEST_OWNER_PASSWORD وQA_BASE_URL في Test
Environment آمنة.

## الترخيص والمؤلفون

المستودع خاص، وقيمة private في package.json مفعلة، ولا يوجد حاليًا ملف LICENSE
مفتوح المصدر. لا يُفترض منح حق النسخ أو إعادة التوزيع أو الاستخدام التجاري
خارج الجهة المالكة دون إذن مكتوب.

| الدور | البيانات |
|---|---|
| المنتج | TOP GYM |
| Repository maintainer | AhmedSalem104 بحسب Git remote الحالي |
| Repository | https://github.com/AhmedSalem104/Top-Gym-Managment |

## المراجع الداخلية

- docs/ARCHITECTURE.md — الطبقات ومسار الطلب.
- docs/API.md — مرجع API مختصر.
- docs/DATABASE.md — SQL Server والجداول.
- docs/AUTH.md — Login وhashing وsessions.
- docs/PERMISSIONS.md — Owner وAssistant.
- docs/DESIGN-SYSTEM.md — Tokens وcomponents وresponsive.
- docs/BACKUP-RESTORE.md — التشغيل الآمن للنسخ.
- docs/DEPLOYMENT.md — Vercel وEnvironment.
- docs/EXERCISE-ASSETS.md — Mapping وصور التمارين.
- docs/MUSCLE_ANATOMY_ASSETS.md — أصول العضلات.
- docs/REFACTOR-JOURNAL.md — سجل التغييرات المعمارية.
- docs/REFACTOR-REPORT.md — تقرير حالة Refactor.
- docs/TOP-GYM-TECHNICAL-SPECIFICATION.md — المواصفات الموسعة.

### مراجع تقنية رسمية

- https://nodejs.org/docs/latest/api/
- https://expressjs.com/
- https://learn.microsoft.com/sql/
- https://github.com/tediousjs/node-mssql
- https://playwright.dev/docs/intro
- https://vercel.com/docs
- https://developer.mozilla.org/

## صيانة README

حدّث هذا الملف عند تغيير Route أو Response contract أو Role أو Permission أو
Environment variable أو جدول أو Migration أو Hash route أو Design token أو
Breakpoint أو أمر QA أو طريقة النشر أو Dataset أو Asset path.

قبل اعتماد تحديث README:

~~~bash
npm run build:css
npm run qa:gate
~~~

اكتب ما لم يُختبر بوضوح بدل الإيحاء بأن كل شيء ناجح.
