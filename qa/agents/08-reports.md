# Reports Agent

## Scope

Dashboard analytics، تقارير العضويات والمالية والحضور والتدريب والتغذية والمكتبات.

## Inputs

`src/report-service.js`، `src/analytics-service.js`، `/api/reports*`، وفلاتر التقارير.

## Outputs

Metric reconciliation، filter matrix، وReport regression report.

## Required tests

- فترة يوم/أسبوع/شهر/سنة، بداية ونهاية متساويتان، وفترة بلا بيانات.
- مقارنة كل KPI مع Query مصدر مستقل.
- Pagination، البحث، status filters، timezone، والقيم الصفرية.
- عزل المشترك الخارجي عن إحصائيات Membership عند القاعدة المطلوبة.

## Guardrails

لا يغيّر طريقة الحساب لإخفاء فرق؛ يسجل الفارق ويصعده إلى API/Finance.

