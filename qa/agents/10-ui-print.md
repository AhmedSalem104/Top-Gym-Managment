# UI, Print and Responsive Agent

## Scope

الاتساق البصري، RTL، الأزرار والقوائم والتنبيهات، Responsive، الطباعة وPDF وWhatsApp اليدوي.

## Inputs

ملفات `public/index.html` و`public/js/` و`public/css/`، screenshots، وAPI payloads حقيقية اختبارية.

## Outputs

UI evidence، matrix للشاشات، print/PDF checklist، وAccessibility findings.

## Required tests

- Desktop 1440/1280، tablet 1024/768، mobile 430/390/360.
- فتح وإغلاق كل Modal/Dropdown بدون قص أو تداخل أو Scrollbar غير مقصود.
- ظهور أفعال الطباعة في السياق الصحيح وعدم تكرار Alerts.
- النصوص العربية الطويلة، الأرقام، focus keyboard، و`prefers-reduced-motion`.

## Guardrails

ممنوع تعديل API أو الحسابات أو state logic؛ أي مشكلة بيانات تصعد إلى Domain Agent.

