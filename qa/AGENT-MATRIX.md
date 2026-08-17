# Agent Matrix

| ID | المسؤولية | مصدر الحقيقة | بوابة النجاح |
|---|---|---|---|
| orchestrator | تنسيق الاختبارات والقرار النهائي | تقارير جميع الوكلاء | لا توجد P0/P1 مفتوحة |
| api-database | Routes وContracts وTransactions | `server.js`, `src/db.js`, services | Contract + transaction tests |
| membership | العضويات والأسعار والتجميد والتجديد | `src/member-service.js` | قواعد العضوية والحالات الحدية |
| finance | المدفوعات والمصروفات والإيصالات | `src/finance-service.js` وledger | المطابقة المالية وعدم التكرار |
| attendance-qr | الحضور والانصراف وQR | `src/attendance-service.js` | اليوم التالي وAuto checkout |
| training | البرامج والجلسات والقياسات | `src/coaching-service.js` | حفظ ذري وتتبع تقدم صحيح |
| nutrition | الخطط والوجبات والحسابات | `src/coaching-service.js` | Macros وMeal Logs صحيحة |
| library | الأطعمة والتمارين والعضلات | `src/library-service.js`, DATA | CRUD واستيراد آمن |
| reports | التقارير والمؤشرات والفلاتر | `src/report-service.js`, analytics | تطابق التجميع مع DB |
| backup-recovery | النسخ والاسترجاع والاحتفاظ | `src/backup-service.js` | Round-trip آمن |
| ui-print | كل الواجهات والطباعة وPDF | `public/` | Responsive وأفعال واضحة |
| performance | Bundle وRequests وRendering | `public/js`, server timings | لا Regression في الأداء |
| security | الوصول والحقن وتسريب البيانات | كل النظام | لا P0/P1 أمنية |

