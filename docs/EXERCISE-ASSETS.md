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

## Operational catalog integration

> The historical 265-record paragraph above is retained for provenance only.
> The current operational catalog is the 873-record catalog described below;
> the legacy file and compatibility rows exist only to preserve old program
> references.

The active library is now `data/library/exercises.json` with exactly **873**
canonical records. Each record has a stable `sourceId` in the reserved
`100001..100873` namespace, a unique `upstreamId`, a unique `slug`, and local
`start`/`end` WebP assets.

The original 265-record seed is preserved in
`data/library/exercises-legacy.json`. Existing SQL rows are not deleted or
re-keyed: they remain addressable for old workout programs and are marked
`legacy-compatibility`, while the API list and library options expose the 873
canonical records. The full mapping is in
`data/library/exercise-catalog-mapping.json`.

Run `npm run sync:library` after changing the catalog. The sync is additive for
canonical records and keeps old `gym_exercises.id` and
`workout_exercises.exercise_id` references intact. It is safe to run more than
once.

Print/PDF output uses the same local catalog. Workout rows receive a compact
thumbnail and the exercise reference section includes start/end images when
available. The print path waits for image loading before opening the browser
print dialog or generating the PDF.

عند تحديث المصدر، يجب تثبيت revision جديد عمدًا ثم مراجعة تقرير المطابقة قبل اعتماد الصور في الإنتاج.
