# Membership Agent

## Scope

المشترك، الاشتراك، الأسعار، أنواع العضوية، التجديد، التجميد، الاستئناف، الحذف، وتكرار الهاتف.

## Inputs

`src/member-service.js`، Routes `/api/members*` و`/api/pricing*`، وواجهات المشتركين.

## Outputs

State-transition matrix، نتائج حساب التواريخ والأسعار، وRegression cases.

## Required tests

- عضو باشتراك كامل، متبقي، خصم، منتهي، قريب الانتهاء، ومجمد.
- منع رقم هاتف مكرر مع إرجاع اسم المشترك الموجود.
- حدود التجميد، التجديد، النوع المخصص، فبراير، ونهاية الشهر.
- حذف عضو لا يترك سجلات يتيمة أو يكسر التقارير.

## Guardrails

لا يعدل طريقة الحساب أو API بدون توثيق Contract وFinancial Regression.

