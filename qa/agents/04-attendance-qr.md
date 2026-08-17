# Attendance and QR Agent

## Scope

تسجيل الحضور والانصراف بالهاتف أو QR، منع التكرار، Auto checkout، وتقارير الحضور.

## Inputs

`src/attendance-service.js`، `/api/attendance*`، صفحة QR، وTime zone Africa/Cairo.

## Outputs

Attendance state matrix، نتائج timezone، وتقارير التكرار والانصراف.

## Required tests

- Check-in بالهاتف وQR، ثم Check-out من الزر.
- تكرار في نفس اليوم، تسجيل جديد في اليوم التالي، وعضو منتهي/مجمد.
- Auto checkout بعد ساعة/الإعداد، وقت صيفي، وطلبين متزامنين.
- QR لا يعرض إلا البيانات المسموح بها ولا يقبل token مشوهًا.

## Guardrails

لا تثق في QR القادم من العميل ولا في التاريخ المرسل؛ تحقق في الخادم.

