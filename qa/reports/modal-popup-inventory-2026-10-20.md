# تقرير حصر النوافذ والـPopups — Logic Fit / TOP GYM

**التاريخ:** 20 أكتوبر 2026
**النطاق:** تدقيق ساكن (read-only) لمصادر الواجهة وملفاتها واختباراتها.
**القرار:** لا تعديل في كود التطبيق أو الاختبارات أو التوثيق المعماري، ولا commit أو نشر. أُنشئ هذا التقرير وحده كأثر تدقيق مسموح به.

## الملخص التنفيذي

| المقياس | النتيجة | طريقة العد |
|---|---:|---|
| تجارب Dialog مخصصة فريدة | **40** | 39 عنصر HTML `<dialog>` فريدًا (ثابتًا أو ينشأ وقت التشغيل)، إضافة إلى نافذة مكتبة العضو المخصصة المبنية بـ`div[role=dialog]`. |
| مواضع تعريف `<dialog>` في الصفحات/القوالب | **33** | تشمل تكرار نافذتي التسجيل والاستعادة نفسيهما في `index.html` و`login.html`. |
| مواضع التعريف الديناميكي | **8** | فرع واحد، و6 في التدريب/التغذية، وواحد لطلب الاشتراك. |
| SweetAlert2 | **1 تنفيذ مشترك / 41 استدعاءً مباشرًا** | العد الحالي لـ`Swal.fire(` في `public/js`; قد يكون الاستدعاء تأكيدًا أو تنبيهًا أو Toast. |
| تأكيد/تنبيه المتصفح الأصلي | **49 موضع استدعاء** | `window.confirm/prompt/alert`; ليست 49 واجهة مخصصة. |
| Overlay مركز الإشعارات | **1 تنفيذ متجاوب** | Popover على الشاشة الواسعة وطبقة حوارية على الهاتف. |
| Drawers تنقل مخصصة | **3** | تنقل التطبيق، إدارة المنصة، وTrainer Studio. |
| مجموعات قوائم/Popover مخصصة المكتشفة | **8 مجموعات/ملاك تنفيذ** | سياق الفرع/القسم، بلد الهاتف، بحث التمرين، قائمة العضو، قائمة تفاصيل العضو، «المزيد» في التدريب، إعدادات Navbar، ونافذة إجراءات الحضور/المكوّنات التابعة. بعض هذه الأنماط متعددة المواضع. |
| Toast/feedback | **تنفيذان داخليان أساسيان + SweetAlert2 toast** | Toast التطبيق في `app.js`/`ui-feedback.js`، Toast الإشعارات الحية في `notification-center.js`، وخيار toast في SweetAlert2. قد تتكامل/تتراجع هذه المسارات لبعضها وليست كل رسالة Toast مستقلة. |
| عناصر غير محسومة في التغطية الساكنة | **موجودة ومفصلة أدناه** | لا يمكن إثبات كل شروط الأدوار أو كل trigger فعليًا دون جلسات متصفح موثقة لكل الأدوار والميزات. |

**تعريف «الاستخدام»:** حُسبت تجربة النافذة الواحدة مرة واحدة مهما تعددت أزرار فتحها. وأُبلغ منفصلًا عن مواضع الـmarkup (33) والاستدعاءات (41 SweetAlert2 و49 native). ليست أرقام استدعاءات SweetAlert/المتصفح جزءًا من عدد الـ40.

## منهجية وتغطية الاستكشاف

تمت مراجعة تعليمات `AGENTS.md` ومواصفة `docs/LOGIC_FIT_V2_DESIGN_SYSTEM.md`، والمهارات الأربع في `.agents/skills/` (`frontend-design`, `ui-ux-review`, `responsive-design`, `design-system`). شمل البحث تعريفات `<dialog>` و`role=dialog` و`aria-modal`، الإنشاء الديناميكي، `showModal/close`، استدعاءات SweetAlert والمتصفح، خصائص ARIA للقوائم، manifest التحميل الكسول، القوالب، CSS، واختبارات الوحدة والمتصفح.

### مصالحة مسارات الاكتشاف

| المسار | النتيجة |
|---|---|
| A — تعريف المصدر | 33 موضع HTML ثابت + 8 تعريفات `<dialog>` ديناميكية + نافذة portal مبنية بـ`div`. لا توجد نتائج أخرى لتعريف حوار في مصادر الواجهة القابلة للبحث. |
| B — المشغلات | كل تجربة ثابتة/ديناميكية لها مالك تشغيل في صفحة الميزة أو shared utility. توجد مشغلات متعددة لبعض النوافذ، وتوجد استدعاءات تفويضية عبر أزرار `data-*`؛ لذلك لا يساوي عدد الاستدعاءات عدد النوافذ. تفاصيل نقاط الدخول في السجل أدناه. |
| C — المسارات والميزات | `public/js/core/feature-manifest.js` يسجل ميزات shell وملفات القوالب المؤجلة؛ `page-tabs.js` يعرّف صفحات Gym UI. كما فُحصت صفحات الدخول، `/platform-admin`، `/trainer-workspace/*`، والـmember portal. |
| D — الخدمات المشتركة | `public/js/app.js` يملك فتح/إغلاق آمنًا لبعض dialogs واعتماد SweetAlert؛ `dialog-enhancements.js` يضيف تحسينات للأحجام/الوصول؛ `core/dialog-loader.js` يحمّل fragments ويهيئها؛ `ui-feedback.js` و`notification-center.js` يملكان مسارات feedback أخرى. |
| E — الاختبارات | توجد اختبارات حوار/Popup مباشرة وموزعة، منها `tests/browser/members-popups.spec.js`, `dialog-fragments-v2-acceptance.spec.js`, `feature-dialogs-v2-visual.spec.js`, `dynamic-coaching-modal-contract.spec.js`, `branch-modal-cascade.spec.js`, `trainer-workspace-dialog-v2-visual.spec.js`, `notifications-modal.spec.js` و`tests/unit/design-system-ownership.test.js`. |
| F — المطابقة | 40 تجربة حوار مخصصة مُسجلة أدناه؛ 39 منها native `<dialog>` وواحدة custom portal. المتبقي غير المحسوم هو إثبات مسارات runtime المقيدة بالأدوار/البيانات، لا تعريفات المصدر المعروفة. |

## سجل الحوارات المخصصة

المراجع أدناه إلى الملف والسطر. «الملكية المشتركة» تعني أن `modal-foundation.css` يوفر shell/geometry عند وجود `lf-modal-shell`؛ أما محتوى الحقول والأحداث والتحقق فيبقى في مالك الميزة. الحقول التفصيلية التي تبنى ديناميكيًا تُسجل «حسب الإجراء» حين يتغير النموذج الواحد بين حالات مختلفة.

| ID | الاسم / الوحدة / المسار | النوع والمشغّل والمصدر | CSS / استخدام مشترك | الصلاحية والبيانات والحقول والإجراءات / التحقق | الإغلاق / الاستجابة / اللغة / الثيم | الخطر / الجاهزية |
|---|---|---|---|---|---|---|
| MOD-001 | اختيار التسجيل؛ الدخول `/` و`/login` | معلوماتي/اختيار مسار؛ `authRegisterOpen`; `public/index.html:168`, `public/login.html:64`, `auth-ui.js:780` | `login-entry.css`; لا يستخدم `lf-modal-shell` | خيارات التسجيل الحالية؛ مسارات موجودة. لا API حوارية؛ صلاحية حسب صفحة الدخول. | native dialog؛ زر إغلاق/Escape؛ RTL/LTR وLight/Dark من صفحة الدخول، لم يتحقق runtime | منخفض / NEEDS ADAPTER |
| MOD-002 | إرشاد استعادة الوصول؛ الدخول | معلوماتي؛ `authForgotHelp`; `index.html:176`, `login.html:72`, `auth-ui.js:781` | `login-entry.css`; لا shell V2 | نص إرشادي وزر تأكيد/إغلاق؛ ليس واجهة تغيير كلمة مرور بحد ذاته. | native dialog؛ السلوك نفسه أعلاه | منخفض / NEEDS ADAPTER |
| MOD-003 | تغيير نطاق البيانات؛ Dashboard | اختيار/نموذج قصير؛ `dashboardScopeOpen`; `index.html:358`, `branch-context.js:150–216` | `modal-foundation.css` + `pages/dashboard.css` + `components/branch-context.css` | فرع/قسم مسموحان، بحث/خيارات وتحميل/معاينة؛ الإلغاء يعيد staged state والتطبيق ذري وفق المواصفة. | native dialog؛ Cancel/Escape؛ حقول تستجيب، مظهر RTL/LTR والثيمين حسب tokens | متوسط / READY |
| MOD-004 | وسيلة دفع العضو؛ إعدادات الدفع اليدوي | إضافة/تعديل؛ trigger من `member-payment-methods.js` (`open` عند ~194)؛ `index.html:805` | modal foundation + `pages/member-payment-methods.css` | نوع/اسم/حساب/مستلم/تعليمات/ترتيب/إظهار بحسب النموذج؛ Apply يحرر draft فقط. صلاحية branding/settings غير مثبتة runtime. | native، أزرار إغلاق/إلغاء/تطبيق؛ RTL/ثيمين عبر الصفحة | متوسط / READY |
| MOD-005 | تسجيل حصة يومية (Day Pass)؛ Dashboard | إضافة/تعديل من `day-passes.js:168,192`; markup `index.html:1015` | foundation + `pages/dashboard.css`/`pages/attendance.css` | نموذج تسجيل الزائر/الحصة والبيانات المرتبطة؛ حفظ/إلغاء؛ تحقق النموذج في feature. لا تخلط بسجل الحصص أو بجلسة تدريب. | native + معالج إغلاق click؛ responsive موثق في V2؛ runtime غير مفحوص | متوسط / READY |
| MOD-006 | إضافة/تعديل مصروف؛ Expenses | نموذج؛ `monthly-finance.js:336–352`, `index.html:1032` | foundation + `pages/expenses.css` | بيانات المصروف وتاريخ/تصنيف/مبلغ حسب الحقول؛ حفظ/إلغاء؛ نطاقات المالية والصلاحيات من الخدمة. | native؛ feature يثبت dialog إلى body في `monthly-finance.js:412–425`; RTL/ثيمين | مرتفع / HIGH RISK (مالي) |
| MOD-007 | إضافة/تعديل عضو؛ Members | نموذج مركب؛ مشغلات `topAddMemberButton`, `addMemberButton`, وأفعال الصف؛ `index.html:1045`, `app.js:1272,1446,2164` | foundation يملك هندسة `member-dialog`؛ `pages/members.css` للتركيب | بيانات العضو والعضوية والدفع والخصم والفرع/القسم حسب النموذج؛ submit/إلغاء/إعادة ضبط؛ تحقق وخدمات `app.js`. | native وfocus trigger في `app.js:184–203`; طويل ومتجاوب؛ غير مجرب فعليًا في كل الحالات | مرتفع / HIGH RISK |
| MOD-008 | إجراء العضوية/الدفعة؛ Members | نموذج سياقي متعدد الأوضاع: تجميد/تجديد/دفعة/استرداد؛ `app.js:1475–1518`, `index.html:1160` | foundation، محتوى ديناميكي في `app.js` | بيانات مالية/عضوية/سبب/تاريخ/طريقة حسب الفعل؛ مراجعة الاسترداد والخادم؛ submit حساس مالي. الصلاحية من إجراءات الأعضاء والخادم. | native مع open/close safe؛ لا يُستنتج dismiss خارجي؛ body scroll عبر structured variant | حرج / HIGH RISK |
| MOD-009 | باقة العضوية؛ الإدارة | إضافة/تعديل من `button-loading.js:120–232`; `index.html:1197` | foundation + `pages/memberships.css` | الاسم/السعر/الحالة/الحقول المدعومة؛ حفظ/إلغاء؛ owner-only (`data-owner-only`). | native; الإغلاق/التحقق في `app.js` و`button-loading.js`; RTL/ثيمين | متوسط / READY |
| MOD-010 | نوع العضوية؛ الإدارة | إضافة/تعديل؛ `app.js:1948–49,2164`; `index.html:1214` | foundation + `pages/memberships.css` | code/name/mode/duration/multiplier/sort/active؛ معاينة السعر؛ owner-only؛ تحقق النموذج | native; أزرار إغلاق/إلغاء؛ الترجمة مركزية | متوسط / READY |
| MOD-011 | تفاصيل العضو؛ Members | تفاصيل بتبويبات؛ فتح من الصف في `app.js:2033–39`; `index.html:1235` | foundation + `member-details-ui.js`, `member-portal-admin.js`, `member-coaching-summary.js` | بيانات اشتراك/حضور/حساب/متجر/تدريب/بوابة وأفعال حسب الصلاحيات؛ بعض التبويبات lazy | native؛ رأس/tab ثابت ومحتوى قابل للتمرير وفق spec؛ اللغة/ثيم ضمن التبويبات | مرتفع / SPECIALIZED |
| MOD-012 | ماسح QR للحضور؛ Attendance | حوار كاميرا؛ زر QR، `attendance.js:670–796`; `index.html:1242` | foundation + `pages/attendance.css` | كاميرا/معرّف QR؛ طلب صلاحية كاميرا وتعامل مع رفض/إغلاق؛ لا ينفذ check-in عند البحث وحده | native، إغلاق ينظف scanner؛ يحتاج اختبار أجهزة/إذن runtime | مرتفع / SPECIALIZED |
| MOD-013 | بطاقة QR العضوية؛ Members/Details | عرض/تصدير/مشاركة وتحديث بيانات البطاقة؛ `member-digital-card.js:203,229`; `index.html:1245` | foundation + `member-digital-card.css` | canvas/QR/هاتف/أزرار مشاركة وتنزيل وتعديل؛ صلاحيات الأفعال القائمة | native؛ قدرات الطباعة/المشاركة تختلف حسب الجهاز؛ RTL/ثيم | متوسط / SPECIALIZED |
| MOD-014 | إضافة فرع؛ Branches | نموذج ينشأ ديناميكيًا؛ `branch-context.js:359–391,793–95` | foundation + `pages/branches.css` + branch-context | اسم/تفاصيل الفرع والخيارات الحالية؛ إضافة/إلغاء؛ صلاحيات الفرع بحسب feature | native; Escape/cancel موصول؛ load fragment/context؛ responsive غير متحقق بصريًا | مرتفع / READY |
| MOD-015 | استعادة نسخة احتياطية؛ Backup history | تحقق/تأكيد واستعادة؛ `backup.js:271–279`, `dialogs/backup.html:1` | foundation + page backup styles | اختيار نسخة/سبب/تحقق الملف وسلامة الاستعادة؛ تفعيل استعادة حساس ومقيد؛ `backup.js` | native؛ تأكيد وسجل أخطاء؛ RTL/ثيمين بالـi18n؛ runtime غير مختبر | حرج / HIGH RISK |
| MOD-016 | حساب مساعد/صلاحيات؛ Permissions | إضافة/تعديل حساب؛ `dialogs/permissions.html:1`, `auth-users.js:45` | foundation + `pages/permissions.css` | حقول مستخدم/دور وصلاحيات؛ حفظ/إلغاء؛ authorization حرج ومملوك للخادم | native; Escape وclose behavior feature-owned؛ RTL/ثيم | حرج / HIGH RISK |
| MOD-017 | عنصر المكتبة؛ Library | إضافة/تعديل؛ `library.js:399`; `dialogs/library.html:1` | foundation + `pages/library.css` | محتوى مكتبة/ملفات وصور وتصنيف؛ upload/validation/save؛ limits/permission لم تثبت runtime | native `library.js:121–129`; upload يزيد مخاطرة الإغلاق | مرتفع / NEEDS ADAPTER |
| MOD-018 | تفاصيل عنصر المكتبة؛ Library | عرض تفاصيل/وسائط؛ `dialogs/library.html:8`, `library.js` | foundation + `pages/library.css` | عرض بيانات ووسائط؛ زر إغلاق؛ لا CRUD من نافذة التفاصيل بحسب المصدر | native; محتوى متغير/وسائط؛ responsive غير runtime-verified | منخفض / SPECIALIZED |
| MOD-019 | متدرب خارجي؛ Coaching | إضافة؛ `dialogs/coaching.html:1`; trigger من coaching | foundation + `pages/coaching.css` | حقول متدرب/هاتف/بيانات حسب نموذج التسجيل؛ حفظ/إلغاء؛ التحقق بالميزة | native، أزرار close/cancel؛ دعم ترجمة feature | متوسط / READY |
| MOD-020 | منشئ خطة التدريب/التغذية؛ Coaching | workflow معقد/مراحل؛ `dialogs/coaching.html:11`, `coaching.js:1218–2392` | foundation مع specialized builder + `pages/coaching.css`, print builder | إنشاء/تعديل خطة ومراحل وجبات/تمارين ومراجعة/طباعة/PDF؛ بيانات عضو وصور/كتالوج؛ entitlement والصلاحية يلزم تتبع runtime | native؛ خطوة/تبويبات/بحث داخلي؛ long content؛ RTL/LTR والثيمين مع استثناء ألوان الطباعة | حرج / SPECIALIZED |
| MOD-021 | ملف المتدرب؛ Coaching | عرض الملف؛ `dialogs/coaching.html:22`, `coaching.js:835` | foundation + coaching page | بيانات المتدرب وسجله وأفعال مرتبطة؛ close؛ permission من الميزة | native; تفاصيل طويلة/تبعيات async | متوسط / SPECIALIZED |
| MOD-022 | قياس الجسم؛ Coaching | dynamic create/edit; `coaching.js:2399–2444` | foundation classnames injected + `pages/coaching.css` | تاريخ/قياسات جسم وقيمها؛ حفظ/إلغاء؛ schema validation بالميزة | native؛ open/close مشتركان؛ RTL/ثيم حسب CSS | متوسط / READY |
| MOD-023 | متابعة/Check-in؛ Coaching | dynamic create/edit; `coaching.js:2446–2503` | foundation classnames injected + coaching | سجل متابعة/حالة/ملاحظات حسب النموذج؛ حفظ/إلغاء؛ تحقق feature-owned | native؛ سلوك close مشترك | متوسط / READY |
| MOD-024 | اشتراك/باقة تدريب؛ Coaching | dynamic; `coaching.js:2505–2515`, opener `2558` | foundation classnames injected + coaching | عضوية/اشتراك المدرب أو المتدرب؛ حفظ/إلغاء؛ يتطلب مراجعة شروط الوصول والباقة | native، async data/actions | مرتفع / HIGH RISK |
| MOD-025 | تعديل عميل التدريب؛ Coaching | dynamic; `coaching.js:2517–2652`, opener `2526` | foundation classnames injected + coaching | بيانات عميل/عضو؛ حفظ/إلغاء؛ صلاحية تحديث العميل | native; translated fields; runtime permissions unknown | مرتفع / READY (بعد adapter) |
| MOD-026 | جدولة جلسة؛ Coaching | dynamic; `coaching.js:2654–2670`, opener `2738` | foundation classnames injected + coaching | موعد/جلسة ومدرب/عضو حسب النموذج؛ حفظ/إلغاء؛ concurrency/validation غير runtime-verified | native; date/time responsive | مرتفع / HIGH RISK |
| MOD-027 | سجل وجبة؛ Coaching | dynamic; `coaching.js:2672+`, opener `2844` | foundation classnames injected + coaching | وجبة/بيانات غذائية متعلقة بالعضو؛ حفظ/إلغاء؛ حقول مفصلة مبنية ديناميكيًا | native؛ دعم LTR للأرقام والقيم يحتاج browser check | متوسط / READY (بعد adapter) |
| MOD-028 | عميل Trainer Workspace؛ Trainer | إضافة/تعديل؛ `trainer-workspace.html:115`, `trainer-workspace.js:247–253` | classes `lf-modal--structured/form`, `pages/trainer-workspace.css`, `trainer-studio-v2.css` | ملف عميل؛ حفظ/إلغاء؛ authorizations من مساحة المدرب | native; responsive/workspace styling specialized | مرتفع / NEEDS ADAPTER |
| MOD-029 | تفاصيل عميل Trainer Workspace؛ Trainer | تفاصيل؛ `trainer-workspace.html:131`, `trainer-workspace.js:258–262,700` | specialized workspace + trainer page CSS | سجل/ملف العميل؛ close؛ بيانات async | native؛ scroll/RTL/LTR يحتاج اختبار | متوسط / SPECIALIZED |
| MOD-030 | الخط الزمني للعميل؛ Trainer | عرض timeline؛ `trainer-workspace.html:135`, opener `trainer-workspace.js:571` | trainer page CSS | نشاط/قياسات متتابعة؛ لا تحرير مثبت من عنوان المصدر | native | منخفض / SPECIALIZED |
| MOD-031 | قياس؛ Trainer Workspace | إضافة؛ `trainer-workspace.html:139`, opener `trainer-workspace.js:579` | trainer page CSS + shared form class | قياسات العميل؛ حفظ/إلغاء | native؛ تحقق feature-owned | متوسط / READY (بعد adapter) |
| MOD-032 | متابعة العميل؛ Trainer Workspace | إضافة؛ `trainer-workspace.html:159`, opener `trainer-workspace.js:620` | trainer page CSS + shared form class | سجل متابعة؛ حفظ/إلغاء؛ صلاحية ضمن trainer workspace | native | متوسط / READY (بعد adapter) |
| MOD-033 | باقة المدرب؛ Trainer Workspace | إضافة؛ `trainer-workspace.html:175`, opener `trainer-workspace.js:411` | trainer page CSS + shared form class | باقة/سعر/حدود/فترة وفق feature؛ حفظ | native؛ مالي/entitlement بحاجة regression | مرتفع / HIGH RISK |
| MOD-034 | جدولة جلسة؛ Trainer Workspace | إضافة؛ `trainer-workspace.html:190`, opener `trainer-workspace.js:452` | trainer page CSS + shared form class | عضو/مدرب/موعد؛ حفظ/إلغاء؛ تحقق التوفر والصلاحية غير مثبت runtime | native؛ التاريخ والوقت على الهاتف | مرتفع / HIGH RISK |
| MOD-035 | شراء؛ Trainer Workspace | إضافة؛ `trainer-workspace.html:204`, opener `trainer-workspace.js:497` | trainer page CSS + shared form class | عملية شراء باقة؛ حفظ/إلغاء؛ أثر مالي | native | حرج / HIGH RISK |
| MOD-036 | دفعة؛ Trainer Workspace | إضافة؛ `trainer-workspace.html:220`, opener `trainer-workspace.js:527` | trainer page CSS + shared form class | مبلغ/وسيلة/مرجع شراء حسب السياق؛ حفظ/إلغاء؛ أثر مالي | native | حرج / HIGH RISK |
| MOD-037 | إجراء منصة عام؛ Platform Admin | Dialog ديناميكي متعدد أنواع العمليات؛ `platform-admin.html:166`, `platform-admin.js:963–1057,1136–1220` | `pages/platform-admin.css` مستقل؛ ليس `lf-modal-shell` | إنشاء/تعديل/قبول/رفض/حذف/نسخ backups وtenant/plan/payment؛ permission platform-owner/admin؛ API كثيرة وحساسة | native; close button/cancel; outside click مدعوم (`1290`); form validation varies per operation | حرج / BLOCKED قبل تحديد adapter لكل action |
| MOD-038 | بيانات اعتماد تسجيل الجيم؛ Platform Admin | نتيجة/معلومات بعد إنشاء؛ `platform-admin.html:167`, `platform-admin.js:1096,1207` | `pages/platform-admin.css` | بيانات مؤقتة تُعرض بعد نجاح إنشاء tenant؛ لا إعادة طلب؛ صلاحية المنصة | native; submit-to-close; حساسية بيانات الاعتماد؛ preview RTL | حرج / SPECIALIZED |
| MOD-039 | طلب اشتراك المنصة؛ SaaS Billing | form dynamic create; `saas.js:373–457`, event flow `404–457` | foundation classnames + `pages/saas.css` | طلب اشتراك/مدة/بيانات مطلوبة وفق الحالة؛ submit network; cancel ممنوع أثناء submitting (`404,406`); validations/actions بالميزة | native; outside click يمنع أثناء submit; mobile boundaries تحتاج runtime | مرتفع / HIGH RISK |
| MOD-040 | تفاصيل عنصر المكتبة للعضو؛ Member Portal | custom `div[role=dialog]`; ينشأ ضمن mount في `member-portal-library.js`/markup `member-portal-anatomy.js:111`; open/close `168–210,242–298` | `pages/member-portal.css`, owner `member-portal-library.js`; لا native dialog/foundation | تفاصيل تمرين/غذاء مختارة؛ تحميل async وإلغاء/عرض؛ tenant/member portal access؛ بيانات مكتبة فقط | إغلاق بزر/نقر backdrop (`298`); focus/keyboard custom code؛ browser matrix لم تنفذ؛ لغة/ثيم عبر portal | متوسط / NEEDS ADAPTER |

### نقاط مهمة في سجل الـ40

- `authRegistrationDialog` و`authRecoveryDialog` موجودان في صفحتي الدخول؛ هما **تجربتان فريدتان بأربعة مواضع markup** لا أربع تجارب.
- `actionDialog` نافذة واحدة تُعاد تهيئة محتوياتها لأربعة إجراءات على الأقل؛ لا يجوز ترحيلها كنموذج واحد ثابت أو إسقاط حالات الاسترداد/الدفع/التجميد.
- منشئ التدريب/التغذية يحتفظ بالـform state وخطواته وواجهات البحث والطباعة/PDF؛ وهو workflow متخصص، وليس نموذج CRUD عاديًا.
- `platformActionDialog` حاوية عامة لا تظهر حقولها كاملة في HTML؛ يبنيها `platform-admin.js` حسب نوع الإجراء. لذلك الـHTML لا يكفي وحده لحصر متطلبات الترحيل.
- القوالب المؤجلة `public/dialogs/{coaching,backup,permissions,library}.html` تُحمّل عبر `feature-manifest.js` و`dialog-loader.js`؛ عدم وجودها في `index.html` عند أول تحميل لا يعني أنها غير موجودة.

## سجل الـOverlays غير الحوارية (مستبعدة من عدد 40)

| المعرّف | النمط | المالك والمصدر | التصنيف/ملاحظات |
|---|---|---|---|
| OVL-01 | مركز الإشعارات | `notification-center.js:596`؛ CSS `components/notifications.css` | popover desktop، mobile layer يضع `role=dialog/aria-modal=true` في `notification-center.js:524–542`. تجربة واحدة responsive. |
| OVL-02 | درج التنقل الرئيسي | `page-tabs.js:356–444`; `navigation-shell.css`/`sidebar.css` | Drawer tablet/mobile مع قفل/إغلاق سياقي. ليست centered dialog. |
| OVL-03 | درج إدارة المنصة | `platform-admin.js:1286`, `.platform-sidebar`; `pages/platform-admin.css` | فتح/غلق على breakpoint؛ لا يثبت في هذا التدقيق focus trap أو overlay semantics. |
| OVL-04 | درج Trainer Studio | `trainer-studio-v2.js:401–480`; `pages/trainer-studio-v2.css` | Sidebar تنقل ديناميكية وحالة `trainer-sidebar-open`; specialized workspace. |
| OVL-05 | إعدادات Navbar | `<details class="topbar-more-menu">` في `index.html:246`; CSS `navbar.css` | قائمة native disclosure تعرض اللغة/الثيم/fullscreen والخروج وفق breakpoint. |
| OVL-06 | قوائم إجراءات صف العضو | `pages/members/action-menu.js:156–197` | قائمة متولدة لكل صف (implementation واحدة، instances مرتبطة بالصفوف)، صلاحيات كل إجراء في `app.js`/buttons. |
| OVL-07 | المزيد بتفاصيل العضو | `member-details-ui.js:700`, `266,630` | menu داخل تفاصيل العضو، عناصرها شرطية حسب permission/role؛ لا modal إضافي. |
| OVL-08 | المزيد للمتدرب | `pages/coaching/coaching.js:516–593` | trainee more-menu؛ instance بحسب عناصر القائمة. |
| OVL-09 | بحث اختيار تمرين/غذاء | `pages/coaching/coaching.js:1920–2110` | searchable listbox popover داخل منشئ الخطة، ينشأ ديناميكيًا؛ يتموضع حسب المساحة. |
| OVL-10 | محدد الفرع/القسم | `branch-context.js:448–498` | searchable listbox context field؛ يوجد أكثر من اختيار في owner واحد، scoped permissions/state. |
| OVL-11 | country selector للهاتف | `core/phone-inputs.js:581–588` | listbox + search لكل Smart Phone Input عند التفعيل؛ shared implementation، وليس modal. |
| OVL-12 | Tooltip للتنقل | `page-tabs.js:145–216` | ينشأ singleton ديناميكيًا؛ ليس modal، ولا يحول إلى dialog. |
| OVL-13 | Toast التطبيق | `app.js:134` أو `ui-feedback.js:60–102` | Feedback قصير accessible (`status/alert`)؛ يوجد مسارا تنفيذ/fallback وتكامل بينهما؛ لا يدخل inventory dialogs. |
| OVL-14 | Live Toast الإشعارات | `notification-center.js:190–207` | Toast منفصل دلاليًا داخل مركز الإشعارات. |
| OVL-15 | SweetAlert2 prompts/confirmations/toasts | `Swal.fire` عبر 15 ملفًا؛ 41 موضعًا وفق scan الحالي | مكتبة خارجية واحدة/overlay implementation مشتركة؛ بعض المواضع toast. صفحة feature CSS `components/modals.css` + foundation ينسقان المظهر. |
| OVL-16 | نافذة browser-native | `window.confirm/prompt/alert`; 49 موضعًا/20 ملفًا | fallback/رسائل browser غير قابلة لتنسيق النظام، وتختلف حسب المتصفح. لا تحسب كتنفيذ modal مملوك للمشروع. |
| OVL-17 | نوافذ خارجية/طباعة | `window.open`, 18 موضعًا وفق scan أولي | طباعة/واتساب/فتح بوابة/معاينة؛ browser popup window وليست overlay داخل الصفحة. الـ18 عدّ أولي لمواضع regex ويحتاج فصل استعمالات الطباعة عن فتح روابط قبل اعتماده كـworkflow count. |
| OVL-18 | قوائم النظام | `<select>`, `input[type=date]` | قوائم المتصفح الأصلية، لا يوجد custom popup منفصل عنها في الكود. |

## مصفوفة تغطية الوحدات

| المجال/المسار المكتشف | الحوارات | الحالة الساكنة |
|---|---|---|
| تسجيل الدخول والتسجيل | MOD-001–002 | تعريف مكرر بين `index.html` و`login.html`; runtime/device states غير منفذة. |
| Dashboard / نطاق البيانات / الحصص اليومية | MOD-003, MOD-005 | المصدر والloader والمشغل معروفون؛ لم تفتح جلسة متصفح. |
| Members / تفاصيل العضو / QR / الإجراءات المالية | MOD-007–008, MOD-011–013 | triggers وخدمات مشتركة واضحة؛ تنوع الصلاحيات والحالات يتطلب اختبارات الدور. |
| المصروفات والمالية | MOD-006 | نموذج واضح؛ لا فحص للبيانات الحقيقية أو API runtime. |
| الباقات وأنواع العضوية | MOD-009–010 | owner-only معلن بالmarkup؛ التنفيذ/التحقق بملف app.js. |
| الفروع والنطاق | MOD-003, MOD-014 | branch dialog ديناميكي؛ listboxes خارج dialogs في OVL-10. |
| الدفع اليدوي | MOD-004 | feature lazy-loaded من manifest. |
| Attendance | MOD-012 | QR dialog؛ إجراءات أخرى ورسائل تحذير تستخدم shared alerts. |
| Coaching / التدريب والتغذية | MOD-019–027 | 3 fragments + 6 dialogs ديناميكية؛ بقية الفلاتر/popovers متميزة. |
| مكتبة التمارين/الأغذية | MOD-017–018, MOD-040 | إدارة داخل shell + واجهة عضو مستقلة؛ الفصل بينهما مهم. |
| Trainer Workspace / Trainer Studio | MOD-028–036, OVL-04 | 9 static dialogs؛ trainer studio drawer. |
| النسخ الاحتياطية والصلاحيات | MOD-015–016 | lazy fragments؛ إجراءات حرجة ومقيدة. |
| SaaS / اشتراك المنصة | MOD-039 | dialog ديناميكي؛ إغلاق مقيد أثناء الإرسال. |
| Platform Admin | MOD-037–038, OVL-03 | controller واحد يبني أنواعًا متعددة؛ شروط الصلاحية server/session-dependent. |
| Notifications / navigation / shared menus | OVL-01–05, OVL-12, OVL-14 | غير محسوبة كحوارات مستقلة إلا طبقة notification center على الموبايل. |
| بقية صفحات Gym routes بالـmanifest | لا يوجد تعريف dialog مستقل إضافي في HTML/JS scan؛ قد تستخدم SweetAlert/native/toast أو overlay مشترك | حالات استثنائية مدرجة في قسم unresolved أدناه. |

## الملكية والتكرار

1. **المرجع الحالي للحوار القياسي:** `public/css/components/modal-foundation.css` يملك `lf-modal-shell` والـsize/structured/form variants. `public/css/tokens.css` مصدر الـtokens، و`public/js/dialog-enhancements.js` يضيف التعزيزات المرتبطة بالـdialogs. محتوى النماذج ودورة API تبقى في وحدات الميزات.
2. **Lazy fragments:** `public/js/core/dialog-loader.js` يحمّل قوالب الميزة مرة واحدة ويفحص IDs ويضيف `role=dialog` و`aria-modal` وlabels عند الحاجة. manifest يربط: coaching (3 IDs)، backup (1)، permissions (1)، library (2).
3. **أنظمة متخصصة متوازية:** `platform-admin.css`/markup لا يستخدمان shell V2؛ `auth-choice-dialog` له تصميم دخول مستقل؛ Trainer workspace لديه قواعد page-specific؛ بوابة مكتبة العضو custom `div`. هذه ليست مجرد اختلافات محتوى.
4. **SweetAlert2 مقابل native dialog:** تنفيذ overlay مركزي من مكتبة، لكنه يظل مختلفًا عن native `<dialog>` في markup/behaviors؛ `app.js` يلف `Swal.fire` في بعض المسارات فقط. الـ49 native alert/confirm قد تكون fallback لمواضع فيها SweetAlert ويجب تحديدها حالةً بحالة قبل استبدالها.
5. **CSS duplication/legacy:** الملفات ذات الملكية المباشرة تشمل `modal-foundation.css`, `modals.css`, `pages/platform-admin.css`, `pages/coaching.css`, `pages/trainer-workspace.css`, `pages/trainer-studio-v2.css`, `pages/library.css`, `pages/permissions.css`, `pages/expenses.css`, `pages/dashboard.css`, `pages/member-payment-methods.css`, `pages/saas.css`, و`login-entry.css`. `modals.css` يحوي قواعد لـ`dialog:not(.lf-modal-shell)` وSweetAlert2، بينما foundation يملك shell. هذا فصل توافق/مكتبة لكنه يحتاج تدقيق consumers قبل حذف أي شيء.
6. **`!important`:** ظهر في `modals.css` لتنسيق أزرار SweetAlert (`343–388`) وفي `modal-foundation.css` بقواعد reduced-motion (`1213–16`). لا تغيير في هذه المرحلة. يجب تقييم نطاقه ومبرراته ضمن ترحيل لاحق دون إضافة overrides.
7. **الاختبارات تتحقق من عقد DOM والتصميم** عبر `design-system-ownership.test.js`، وقبول fragments وcoaching/member/attendance/platform. وجود test لا يثبت تحقق جميع مسارات الصلاحيات أو كل نقاط التوقف بصريًا.

## التباينات التصميمية الحالية مقارنة بالمرجع المعتمد

- التصميم المرجعي الحالي في V2 هو Azure هادئ ومضغوط (وليس deep-blue gradient): Header/Footer form عبر tokens، Body أبيض/سطحي، ويُطبق فقط على `lf-modal--form`. لذلك وصف الصورة الجديدة بتدرج أزرق غامق وزر إلغاء أحمر outline **يختلف** عن مواصفة V2 الحالية. قبل أي توحيد لاحق يجب حسم أولوية المرجع الجديدة رسميًا؛ هذا التقرير لا يعدّل التصميم.
- بعض dialogs تستخدم shared shell، وأخرى تحتوي تواريخ/خطط/محتوى تفاصيل طويل. اختلاف الارتفاعات وscroll policy طبيعي لبعضها، ولا ينبغي فرض header/footer ثابتين أو مقاس واحد على التأكيد/QR/details/workspace.
- `auth-choice-dialog`, منصة الإدارة، custom member-library dialog ليست ضمن shell الحالي. بقية dialogs المشتركة تستفيد جزئيًا من class/token foundation لكن لا توجد React-style markup components: المعمارية Vanilla HTML/JS/CSS، و«المكوّن المشترك» هنا CSS semantic shell وutilities لا Header/Body/Footer JS primitives منفصلة.
- SweetAlert2 يعرض عناصره خارج custom dialog layer، ويضم alert/prompt/confirm/toast؛ لا يمكن اعتباره مُرحّلًا لمجرد وجود قواعد CSS مشتركة.

## المراجعة الساكنة للاستجابة وإمكانية الوصول

- **ثابت من المصدر:** حوارات native تستفيد من سلوك `<dialog>` الأصلي؛ `app.js` يحتفظ بمشغل dialog ويرجع التركيز في المسار المشترك (`184–203`); fragment loader يضيف role/aria labels؛ V2 يحدد الـviewport/scroll contracts؛ `notification-center` يحول panel إلى modal على الهاتف.
- **مخاطر المصدر المرصودة:** portal modal يدير show/hide/focus يدويًا بدل native dialog؛ `platformActionDialog` ليس ضمن shell؛ trainers لها قواعد CSS feature-level؛ الكثير من `dialog.showModal()` يفتح مباشرة من feature owner دون مرور بالـsafe wrapper العام؛ behavior قد يظل صحيحًا لكن يحتاج تحقق لكل نافذة. القوائم المنبثقة داخل dialog قد تتأثر بحدود scroll/stacking.
- **غير منفذ runtime:** لا توجد لقطات أو تجربة browser في هذه المرحلة. لا أدّعي اختبار العروض 320–1920 أو RTL/LTR أو Light/Dark أو virtual keyboard أو focus trap/restore فعليًا لكل عنصر. الأدوار/الصلاحيات المقيدة والتحميل/الخطأ/الإلغاء لم تختبر بحسابات مصرح بها.

## مراجعة الاختبارات ذات الصلة

اختبارات موجودة اكتُشفت (لم تُشغّل لأن المرحلة طلبت audit read-only ولم تُطلب بوابة تغيير):

- `tests/unit/design-system-ownership.test.js` — قواعد الـshell والـvariants والملفات المالكة.
- `tests/browser/dialog-fragments-v2-acceptance.spec.js` — تحميل fragments/حوار مركزي.
- `tests/browser/feature-dialogs-v2-visual.spec.js` — عينات بصرية للـdialogs.
- `tests/browser/dynamic-coaching-modal-contract.spec.js` و`coaching-v2-screen-continuation.spec.js` — dynamic coaching.
- `tests/browser/members-popups.spec.js`, `member-details-scope-print.spec.js` — أعضاء وتفاصيل.
- `tests/browser/branch-modal-cascade.spec.js` — فرع/حوار وتداخل dialog.
- `tests/browser/trainer-workspace-dialog-v2-visual.spec.js`, `trainer-workspace-v2.spec.js` — trainer dialogs.
- `tests/browser/notifications-modal.spec.js` — إشعارات/modal responsive.
- `tests/browser/platform-admin-*` — شاشات/مصفوفات منصة، لكن تغطية كل action dynamic ليست مؤكدة من اسم الاختبار وحده.

**الحالة:** الاختبارات مكتشفة فقط؛ لم يتم تشغيلها، لذلك نتيجتها `NOT RUN`.

## تقرير التكرار والملكية

| النمط | درجة التكرار | أثر التدقيق |
|---|---|---|
| Shell / Header / Footer / scroll geometry | Near duplication | `modal-foundation.css` هو المالك القانوني، لكن page CSS/markup المتخصص يضيف layout مستقلًا؛ راجع كل selector قبل cleanup. |
| فتح/إغلاق native dialog | Near duplication | safe wrapper في `app.js`، مع دوال open/close في coaching, branch, trainer, library, backup, permissions, platform, SaaS. لكل منها سياسات مختلفة؛ لا تنقلها آليًا قبل مطابقة Escape/outside-click/submit. |
| تأكيدات/رسائل | Unsafe duplication محتمل | SweetAlert2، `window.confirm`, `window.showToast`, `LogicFitFeedback.toast`, Toast الإشعارات. يجب ربط كل callsite بمعناه وfallback قبل توحيده. |
| بوابة مكتبة العضو مقابل dialog native | Specialized but duplicated lifecycle | يكرر overlay/close/focus يدويًا ويستحق adapter، لا استبدال مباشر قبل اختبار التركيز والموبايل. |
| منصة الإدارة | Intentional specialized behavior | dialog واحد يملأ body حسب action registry؛ تبسيطه قد يفقد أنواع أعمال متعددة وحساسة. |
| قوائم الصف/قوائم التدريب/listboxes | أنماط متشابهة وليست modal duplicates | تصنف ضمن dropdown/popover system، ولا تهاجر إلى Dialog System. |

لم أحتسب تكرار selectors CSS برمجيًا على كل bundle: `app-shell.css` و`main.css` ملفات build/minified كبيرة مشتقة. البحث المباشر فيها ينتج مطابقة مضللة ولا يثبت ازدواجية source. المراجعة تحدد ملفات المصدر المرجعية والمتخصصة؛ يلزم تحليل AST/source-map أو قواعد المستهلكين ضمن مرحلة التنفيذ قبل حذف/دمج CSS.

## جاهزية الترحيل المقترحة

التصنيف موجود بكل صف في السجل. الترتيب الآمن المقترح:

1. **READY منخفض/متوسط:** dashboard scope، أنواع العضوية/الباقات، عناصر library form البسيطة، قياس/متابعة غير مالية، إضافة المتدرب الخارجي، إضافة فرع بعد التحقق من triggers/permissions.
2. **NEEDS ADAPTER:** نوافذ الدخول، portal library custom dialog، مكتبة بملفات، Trainer workspace dialogs التي تحمل CSS/DOM conventions مستقلة.
3. **SPECIALIZED:** تفاصيل العضو، تفاصيل المكتبة، QR reader/بطاقة QR، builder التدريب/التغذية، timelines ونتيجة بيانات الاعتماد؛ حافظ على الحجم/التفاعل الخاص.
4. **HIGH RISK مع عزل واختبارات:** عضو/عضوية، action dialog (خصوصًا refund/payment/renewal/freeze)، expense، backup restore، صلاحيات المستخدم، اشتراك المنصة، عمليات المدرب المالية/الجلسات.
5. **BLOCKED حتى إعداد adapter لكل نوع:** `platformActionDialog` لأنه يجمع عمليات متعددة على مستوى المنصة، ويتعامل مع tenant/plan/payment/backup وعمليات إنشاء الحساب. لا تنقل النموذج العام ككتلة واحدة.

هذه خارطة مقترحة لا تنفيذ. لا يتم ترحيل dialogs حرجة قبل اختبارات تفصيلية لكل trigger والتحقق والصلاحية وتأكيدات الخادم.

## عناصر غير محسومة / قيود التغطية

1. لا يوجد browser session موثق/حساب test لكل role (Gym owner, staff, trainer, platform admin, member). لذلك ظهور عناصر `data-owner-only` أو permission-dependent وتدفقها الفعلي `NOT VERIFIED`.
2. القوالب المؤجلة موجودة في manifest، لكن لا يمكن التأكد من نجاح fetch/fragment parsing بعد مسار auth أو feature entitlement دون runtime.
3. `platformActionDialog` لديه عدد كبير من action types يُبنى body لها في `platform-admin.js`; جرد كل نوع حقلًا/field-by-field يتطلب تفريغ جميع حالات `openDialog(type)` (مصدر التنفيذ المشار إليه) وربطها بكل handler. الجدول يسجل container كحوار واحد، لا يجعل كل action type تعريف dialog منفصلًا.
4. `Swal.fire` حُسب 41 استدعاءً مباشرًا في النسخة الحالية من المصدر؛ مواصفة V2 تسجل 43 عبر الملفات وتذكر أعدادًا أعلى لبعض الوحدات. هذا **تعارض توثيق/scan**: لا يمكن تفسير مواضع alias/الاستدعاء غير المباشر من العد البسيط. يلزم مقارنة كل callsite (ومنها مراجع `window.Swal`) قبل اعتبار 41 عدد الاستخدامات الكامل النهائي.
5. `window.confirm/prompt/alert` عددها 49 موضعًا في scan الحالي. لم تُصنف كل رسالة منفردة إلى تأكيد/تحذير/خطأ؛ fallback browser-native قد يتكرر خلف SweetAlert. لا تعدّ كل 49 تجارب مستقلة.
6. `window.open` العد 18 أولي بالـregex؛ يحتاج فصل طباعة report/receipt، WhatsApp، فتح portal ومعاينة SaaS. لا يستخدم كرقم نافذة overlay.
7. لا تُحسب native `<select>` و`input[type=date]` كتنفيذات popover مملوكة للتطبيق. لم يُراجع UI الداخلي لكل متصفح.
8. لم تُنفذ مصفوفة responsive/RTL/LTR/theme ولا قياس accessibility runtime؛ الموجود هو source evidence + قائمة الاختبارات المكتشفة.

لهذا، **التغطية الساكنة للتعريفات معروفة (40 تجربة)، لكن لا يصح وصف التدقيق بأنه تحقق runtime بنسبة 100%** قبل إغلاق البنود 1–8 حسب نطاق التنفيذ. لم أجد تعريف حوار ساكنًا إضافيًا بعد passes البحث، لكن تبقى استدعاءات مكتبية/مبنية على بيانات تتطلب runtime reconciliation.

## الأثر على العمل وشروط المرحلة التالية

- ملفات التطبيق المعدلة: **لا شيء**.
- اختبارات/بيانات/إعدادات معدلة: **لا شيء**.
- commit/push/deploy: **لا شيء**.
- الملف الوحيد المضاف: هذا التقرير في `qa/reports/`.
- أي migration إلى النظام الجديد يتطلب موافقة Phase 2، ثم يبدأ من المكوّنات منخفضة المخاطر، ويحفظ سياسات الإغلاق والتحقق/الـAPI لكل feature. لا تهاجر Toast/listbox/drawer إلى modal.

**MOBILE IMPACT: NONE** — هذا تدقيق توثيقي ساكن، ولم يتغير أي عقد أو كود.
**MOBILE BLUEPRINT: N/A** — لا تغيير في تدفقات أو API أو سلوك جوال.
**UPDATED MOBILE DOCS: []**
