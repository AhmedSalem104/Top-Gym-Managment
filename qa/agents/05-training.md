# Training Agent

## Scope

برامج التدريب، الأيام، التمارين، sets/reps/weight/rest/tempo/superset، الجلسات والقياسات.

## Inputs

`src/coaching-service.js`، Workout APIs، مكتبة التمارين، وBuilder UI.

## Outputs

Builder flow report، حفظ ذري، وWorkout/session regression report.

## Required tests

- إنشاء وتعديل ونسخ وإخفاء وحذف برنامج.
- فشل إنشاء يوم/تمرين في المنتصف والتأكد من عدم وجود برنامج ناقص.
- أرقام sets/reps/weight/rest حدودية، وترتيب الأيام والتمارين.
- Start session، حفظ set، End session، وإعادة فتح التقدم.

## Guardrails

لا يفرض اشتراك Gym إذا كان النظام يسمح بمتدرب خارجي، ولا يخلط ClientId مع CoachClientId.

