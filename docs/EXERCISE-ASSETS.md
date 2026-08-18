# TOP GYM Exercise Assets

هذا المجلد يضيف صورًا موحّدة لمكتبة التمارين الحالية، مع الاحتفاظ بكتالوج Dataset كامل بصيغة متوافقة مع Schema المشروع.

## المصدر والترخيص

المصدر الوحيد للبيانات والصور هو [yuhonas/free-exercise-db](https://github.com/yuhonas/free-exercise-db)، مثبت على revision:

`b0eed061e1c832b3ed815fbaa4b45b3cdc14df49`

يعلن المستودع المصدر عن استخدام **Unlicense**. يجب على مالك المشروع مراجعة متطلبات الاستخدام التجاري والاحتفاظ بمرجع الـrevision عند النشر.

## ما تم توليده

- `873` تمرينًا في `data/library/exercises-dataset.json`.
- `1,746` صورة محلية (وضع بداية/نهاية لكل تمرين) داخل `public/assets/exercises/{upstreamId}/`.
- الصور بصيغة `WebP` وبأبعاد موحدة `720×480`، مع ضغط مناسب للويب.
- `public/data/exercise-assets.json` هو Manifest خفيف تستخدمه الواجهة لربط صور التمارين بدون تغيير API أو قاعدة البيانات.
- `data/library/exercise-image-matching.json` هو تقرير المطابقة القابل للمراجعة.

## توافق Schema

ملف `exercises-dataset.json` عبارة عن Array مباشرة مثل `data/library/exercises.json`، وكل سجل فيه يحتفظ بنفس المفاتيح الحالية:

`name`, `nameAr`, `description`, `descriptionAr`, `targetMuscleId`, `secondaryMuscles`, `equipment`, `isHighImpact`, `difficulty`, `category`, `movementPattern`, `mechanic`, `force`, `instructions`, `instructionsAr`, `tips`, `tipsAr`, `commonMistakes`, `commonMistakesAr`, `repsRange`, `setsRange`, `restSeconds`, `tempo`, `icon`, `videoUrl`.

الحقول التالية إضافية فقط للكتالوج والصور، ولا تدخل في عقد API الحالي:

`upstreamId`, `slug`, `sourceImagePaths`, `imageAssets`, `imageAudit`.

الكتالوج التشغيلي الحالي `data/library/exercises.json` بقي كما هو (265 تمرينًا) حتى لا يتغير عدد عناصر API أو سلوك قاعدة البيانات تلقائيًا. الكتالوج الكامل جاهز لإضافة مرحلية لاحقة بعد مراجعة Product/Backend.

## المطابقة الحالية

من أصل 265 تمرينًا حاليًا:

- `60` مطابقة مباشرة بالاسم بعد التطبيع.
- `90` مطابقة بواسطة aliases مراجعة يدويًا.
- `115` حالة `manual review`؛ لا يتم عرض صورة عشوائية لها.

التمارين غير المحسومة تحتوي على أفضل المرشحين ودرجات التشابه داخل `exercise-image-matching.json`. التمارين الموجودة في الـDataset وغير المرتبطة بالـ265 الحالية موجودة في قسم `newDatasetExercises` بنفس التقرير.

## سلوك الواجهة

- مكتبة التمارين تعرض صورة رئيسية صغيرة داخل الصف.
- تفاصيل التمرين تعرض وضع البداية والنهاية عند وجود المطابقة.
- باني برنامج التدريب يعرض صورة التمرين المختار بجانب العضلة والتعليمات، وتظهر الصورة أيضًا في مرحلة المراجعة.
- الصور تستخدم `loading="lazy"`، وأبعادًا ثابتة لمنع Layout Shift، وFallback موحدًا عند فشل التحميل.
- لا توجد تغييرات على Business Logic أو API أو SQL schema.

## إعادة التوليد

يتطلب السكربت Python وPillow ونسخة checkout من المصدر المثبت:

```powershell
python -m pip install Pillow
python scripts/sync-exercise-assets.py --source-root C:\path\to\free-exercise-db
```

يمكن تغيير مسارات الإخراج بالخيارات الموجودة في:

```text
python scripts/sync-exercise-assets.py --help
```

عند تحديث المصدر، يجب تثبيت revision جديد عمدًا ثم مراجعة تقرير المطابقة قبل اعتماد الصور في الإنتاج.
