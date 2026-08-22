# نظام الصلاحيات المركزي

## الهدف

الصلاحيات في TOP GYM مبنية على نمط `resource.action`. الشاشة لا تُفتح إلا عند امتلاك صلاحية `read` الخاصة بها، وكل عملية تُراجع مرة أخرى في الـBackend قبل الوصول إلى الـController أو الـService. واجهة JavaScript تخفي التبويبات والأزرار لتحسين التجربة فقط، وليست حدًا أمنيًا.

المشروع الحالي يعمل لجيم واحد (single-gym). لا يوجد في مخطط قاعدة البيانات الحالي `tenant_id` عام لكل جداول النظام؛ لذلك لا يتم ادعاء عزل multi-tenant غير موجود. طبقة الصلاحيات تمنع تعديل Owner وتسمح فقط باختيار Assistant من نفس قاعدة بيانات الجيم. إضافة multi-tenant حقيقية تحتاج Migration مستقلة تشمل جداول البيانات التشغيلية كلها.

## التدفق

```text
Session Cookie
  ↓
Auth Middleware
  ↓
Permission Resolver (path + method → resource.action)
  ↓
requirePermission / Owner-only guard
  ↓
Route → Controller → Service → Repository
```

المصادر الأساسية:

- `src/permissions/permissions.js`: Catalog، مجموعات الشاشات، الافتراضيات.
- `src/permissions/route-permissions.js`: ربط الـAPI الفعلي بالصلاحيات.
- `src/middleware/permission.middleware.js`: Resolver و`requirePermission` المركزي.
- `src/services/permission-service.js`: القراءة والتعديل والـMigration وسجل التدقيق.
- `src/middleware/financial-data.middleware.js`: إزالة الحقول المالية من JSON عندما تكون `finance.read` معطلة.
- `public/js/core/permissions.js`: UX للتبويبات والأزرار فقط.
- `public/js/smart-assistant.js`: خريطة المساعدة والإجراءات؛ لا تمنح صلاحيات ولا تعرض اقتراحًا محجوبًا.

## المساعد الذكي والصلاحيات

المساعد الذكي جزء من طبقة العرض وليس بديلًا عن حماية الـBackend. يغطي خريطة النظام الحالية: لوحة التحكم، المشتركين والعضويات، المتدربين الخارجيين، التدريب والتغذية، الحضور والانصراف، المصروفات، الحصص اليومية، الأسعار، المكتبة، التقارير، تقييمات المشتركين، الصلاحيات والنسخ الاحتياطية.

قبل عرض أي شاشة أو إجراء سريع، يراجع المساعد:

1. صلاحية فتح الشاشة (`*.read` أو الصلاحية المالكة الفعلية للشاشة).
2. صلاحية العملية نفسها مثل `members.create` أو `coaching.update`.
3. صلاحية التبويب الحالية من `public/js/core/permissions.js`.
4. صلاحية `finance.read` قبل شرح أو عرض أي معلومة مالية.

إذا كانت الصلاحية غير موجودة، يوضح المساعد أن الجزء غير متاح ولا يعرض زرًا قابلًا للتنفيذ. هذا تحقق UX فقط؛ الطلب الحقيقي يمر دائمًا عبر `src/permissions/route-permissions.js` و`auth.middleware.js` ويُرفض بـ403 عند المنع.

لا يملك المساعد وصولًا إلى كلمات المرور أو الجلسات أو أسرار النظام، ولا يضع كود بوابة المشترك أو بيانات مالية داخل رسائل عامة. عند إلغاء جلسة Assistant بعد تعديل الصلاحيات، تختفي واجهة المساعد مع انتهاء الجلسة ولا يستطيع استخدام الإجراءات القديمة.

## صلاحيات Assistant الفعلية

| المورد | الصلاحيات المتاحة | الاستخدام |
|---|---|---|
| `dashboard` | `read` | فتح لوحة التحكم عند منحها؛ ليست ضمن افتراضي Assistant الآمن |
| `members` | `read`, `create`, `update`, `delete`, `alerts`, `print` | قائمة المشتركين وعمليات الملف |
| `memberships` | `read`, `create`, `update`, `freeze`, `renew` | العضويات والتجديد والتجميد |
| `payments` | `create` | إنشاء دفعة، وتجديد أو إنشاء عضوية مدفوعة |
| `trainees` | `read`, `create` | المتدربون الخارجيون |
| `coaching` | `read`, `create`, `update`, `delete` | التدريب والتغذية والقياسات والجلسات |
| `attendance` | `read`, `check_in`, `check_out`, `report` | الحضور والانصراف وتقاريرهما |
| `finance` | `read`, `create`, `update`, `delete` | البيانات المالية والمصروفات؛ مغلقة افتراضيًا للحساب الجديد |
| `reports` | `read`, `export` | التقارير والتصدير من الواجهة |
| `pricing` | `read`, `create`, `update` | عرض وإدارة الأسعار؛ يظل تعديل أسعار الحصص اليومية Owner-only وفق الـRoute الحالي |
| `day_passes` | `read`, `create`, `update`, `delete`, `whatsapp` | الحصص اليومية؛ التعديل والحذف Owner فقط حاليًا |
| `library` | `read`, `create`, `update`, `delete` | مكتبة التمارين والأطعمة والعضلات |

عمليات غير موجودة في الـAPI الحالي، مثل `payments.refund` أو `members.cancel`، لا تُضاف إلى الكتالوج ولا تُخترع لها واجهة.

## Owner

الـOwner يمتلك `*` دائمًا. لا يمكن تعديل صلاحياته أو اختياره كهدف في APIs الصلاحيات. الـOwner-only endpoints تشمل:

- إدارة حسابات Assistant.
- إدارة الصلاحيات.
- النسخ الاحتياطي والاستعادة.
- تقييمات المشتركين.
- عمليات إدارة الأسعار أو الحصص التي كانت Owner-only في السلوك السابق.

## الافتراضيات والهجرة

- الحسابات القديمة تحتفظ بسطح العمليات القديم للـAssistant عند أول تشغيل للنظام.
- الحسابات الجديدة تبدأ بصلاحيات تشغيلية آمنة: القراءة وبعض الإضافة والتعديل، بينما الحذف والتحصيل والماليات والتقارير مغلقة حتى يمنحها Owner.
- `finance.read` مغلقة للحساب الجديد؛ وعند غيابها لا تُعاد الحقول المالية من الاستجابات المحمية.
- لا يوجد حذف لجداول أو بيانات أثناء Migration.
- ملف SQL المرجعي: `database/migrations/006-permissions.sql`.
- التشغيل الفعلي idempotent من `src/services/permission-service.js` بعد إنشاء `gym_users`.

## شاشة `#permissions`

الشاشة Owner-only وتحتوي على:

1. قسم حسابات Assistant لإضافة الحساب وتعديله وتعطيله وإعادة تعيين كلمة المرور؛ هذا القسم موجود داخل `#permissions` فقط.
2. قائمة Assistant لاختيار الحساب ثم بطاقات قابلة للفتح لكل شاشة/مورد.
3. Checkbox لكل عملية فعلية داخل بطاقة الشاشة.
4. خيار `قراءة فقط` للمجموعات التي لديها `*.read`؛ يبقي العرض ويمسح عمليات الكتابة.
5. حقل سبب التعديل.
6. حفظ الصلاحيات.
7. استعادة الافتراضي الآمن.
8. رسالة توضح أن جلسة Assistant المستهدف أُلغيت بعد الحفظ.

## APIs Owner-only

| Method | Endpoint | الغرض |
|---|---|---|
| `GET` | `/api/auth/permissions/catalog` | جلب الكتالوج |
| `GET` | `/api/auth/users/:id/permissions` | جلب حالة Assistant |
| `PUT` | `/api/auth/users/:id/permissions` | استبدال حالة الصلاحيات مع `reason` |
| `POST` | `/api/auth/users/:id/permissions/reset` | استعادة الافتراضي الآمن مع `reason` |
| `DELETE` | `/api/auth/users/:id` | حذف Assistant نهائيًا وإلغاء جلساته وصلاحياته؛ Owner فقط |

صيغة التحديث:

```json
{
  "reason": "منح التقارير لمراجعة حضور الأسبوع",
  "permissions": {
    "members.read": true,
    "members.create": true,
    "members.delete": false,
    "reports.read": true,
    "reports.export": false
  }
}
```

الـAPI يرفض:

- كود صلاحية غير موجود.
- منح كود Owner-only.
- استهداف Owner.
- سببًا فارغًا أو أطول من 500 حرف.
- أي طلب Assistant إلى APIs الصلاحيات.

## قاعدة البيانات والتدقيق

### `gym_user_permissions`

تخزن الحالة الحالية لكل Assistant:

- `user_id`
- `permission_code`
- `is_granted`
- `updated_by_user_id`
- `created_at`, `updated_at`

يوجد قيد `UNIQUE(user_id, permission_code)`.

### `gym_permission_audit`

يسجل كل تغيير فعلي:

- المستخدم المستهدف والمنفذ.
- كود الصلاحية.
- القيمة القديمة والجديدة.
- سبب التعديل.
- IP وUser-Agent.
- وقت التعديل.

تحديث الحالة وسجل التدقيق داخل Transaction واحدة، ثم تُلغى جلسات Assistant المستهدف عبر `sessionRepository.revokeForUser`.

## الماليات وعدم التسريب

`reports.read` مستقلة عن `finance.read`. امتلاك التقارير لا يمنح الماليات. عند غياب `finance.read`:

- يُمنع `/api/monthly-finance` مباشرة بـ403.
- لا يظهر تبويب التحصيل والمصروفات داخل التقارير.
- تُزال الحقول المالية المعروفة من JSON في الاستجابات المسموح بها، مثل الأرصدة والمدفوعات والمصروفات.
- لا يمكن الاعتماد على إخفاء الواجهة لتجاوز ذلك.

كتالوج الأسعار التشغيلي مستقل في `pricing.read` حتى يستطيع Owner اختيار احتياجات تشغيلية منفصلة عن تقارير الماليات؛ وتظل عمليات تعديل الأسعار محمية.

## الاختبار

اختبارات الوحدة الخاصة بالسياسة موجودة في `tests/unit/permissions.test.js` وتشمل:

- Owner access.
- read-only GET مقابل رفض POST.
- حماية التجديد من دون `payments.create`.
- إزالة الحقول المالية.
- رفض المسارات غير المعروفة.

أوامر التحقق:

```bash
node --test tests/unit/permissions.test.js
npm run build:css
npm run qa:gate
```
