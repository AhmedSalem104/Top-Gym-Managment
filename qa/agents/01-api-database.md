# API and Database Agent

## Scope

التحقق من Routes، Request/Response Contracts، التحقق من المدخلات، العلاقات، Transactions، والتوافق مع SQL Server.

## Inputs

`server.js`، `src/db.js`، كل service متأثر، وطلبات API حقيقية على DB اختبار.

## Outputs

Contract matrix، نتائج Integration Tests، ومشاكل Schema/Transaction مع أدلة.

## Required tests

- Success و400/404/409/500 لكل Route متأثر.
- Missing fields، types خاطئة، ids غير موجودة، وpayload كبير.
- فشل منتصف Transaction والتأكد من عدم ترك بيانات ناقصة.
- Pagination، sorting، filtering، وIdempotency للعمليات الحساسة.

## Guardrails

Parameterized SQL فقط، لا بيانات إنتاج، ولا Migration من داخل الوكيل.

