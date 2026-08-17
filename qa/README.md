# TOP GYM QA Agent System

هذه الحزمة هي طبقة ضمان جودة مستقلة عن تطبيق TOP GYM. لا تعمل داخل مسار طلبات المستخدم، ولا تمنح أي وكيل صلاحية مباشرة على قاعدة الإنتاج أو Vercel.

## بنية المشروع الحالية

- Backend: Node.js + Express داخل `server.js` وخدمات `src/`.
- Database: SQL Server عبر حزمة `mssql`.
- Frontend: HTML/CSS/Vanilla JavaScript داخل `public/`.
- Domains: العضويات، المالية، الحضور وQR، التدريب، التغذية، المكتبات، التقارير، النسخ الاحتياطية والطباعة.
- الاختبار الموجود: `scripts/smoke-test.js` ويحتاج اتصالًا بقاعدة البيانات.

## الوكلاء

يوجد 13 دورًا منطقيًا: منسق QA واحد و12 وكيلًا متخصصًا. ملفات التعليمات موجودة داخل `qa/agents/`، وكل وكيل يلتزم بالعقد المشترك في [AGENT-CONTRACT.md](./AGENT-CONTRACT.md).

## التشغيل

```bash
npm run qa:gate
npm run qa:gate -- --build
npm run qa:gate:smoke
npm run test:e2e
npm run qa:gate:browser
npm audit --audit-level=high
```

`qa:gate` آمن ولا يلمس قاعدة البيانات. خيار `--smoke` يشغّل الاختبار الشامل الموجود، وينشئ بيانات اختبار مؤقتة ثم يحاول تنظيفها؛ استخدمه فقط مع بيئة اختبار.

ينتج الفحص تقريرًا آليًا داخل `qa/reports/`، وهذه التقارير مستبعدة من Git. يمكن تمرير `--report <path>` لحفظ التقرير في مسار مخصص.

اختبار المتصفح يستخدم Playwright لمراجعة التبويبات، الـResponsive layout، أحجام مناطق اللمس، عدم وجود Overflow أفقي، حدود الـModals والقوائم، وقياس التحميل الأولي والـCLS. محليًا يستخدم Chrome المثبت إن وُجد، وفي CI يستخدم Chromium الذي يتم تثبيته عبر Playwright. الأدلة المرئية والتقارير المؤقتة تخرج داخل `qa/artifacts/` و`qa/reports/` ولا تُرفع إلى Git.

## دورة الإصدار

```text
Commit / Issue
  -> QA Orchestrator
  -> وكلاء المجالات بالتوازي
  -> QA Gate + Smoke + UI/Performance
  -> Security Gate
  -> موافقة بشرية
  -> Push / Deploy
```

لا يحق لوكيل تعديل API أو قاعدة البيانات لمجرد إصلاح فشل UI. أي تغيير في Contract أو Schema يحتاج موافقة صريحة واختبار Regression.

## فجوة أمنية حالية

لا تظهر طبقة هوية وصلاحيات للمستخدمين على جميع `/api` في البنية الحالية. لذلك لا يعتبر النظام محميًا من الوصول العام لمجرد وجود Security Headers وRate Limiting. وكيل الأمان يجب أن يمنع الإصدار العام إلى أن توجد حدود وصول موثوقة أو طبقة Auth مناسبة.
