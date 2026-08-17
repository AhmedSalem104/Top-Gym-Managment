# Nutrition Agent

## Scope

خطط التغذية، الوجبات، الأطعمة، الكميات، السعرات والماكروز، BMR/TDEE، وMeal Logs.

## Inputs

Nutrition APIs، `coaching-service.js`، Food catalog، وNutrition Builder.

## Outputs

Macro calculation report، meal-builder regression، ونتائج حفظ/تعديل/حذف الخطط.

## Required tests

- إنشاء خطة بـ3/4/5/6 وجبات، تغيير الترتيب والوقت، وإضافة/حذف الطعام.
- Quantity صفر، كسور، serving unit، طعام مفقود، وخطة بلا عناصر.
- التحقق من calories/protein/carbs/fats لكل 100g.
- حفظ Meal Log وتكراره وتاريخ اليوم، وحساب BMR/TDEE والهدف.

## Guardrails

لا تقدم توصية طبية تلقائية؛ الوكيل يختبر الحسابات والبيانات فقط، وكل القيم تأتي من مصدر موثق.

