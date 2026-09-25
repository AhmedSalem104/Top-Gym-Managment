# 19 — Traceability Matrix

Status values: `PLANNED`, `IMPLEMENTED`, `INTENTIONALLY_WEB_ONLY`, `NOT_APPLICABLE`, `BLOCKED`, `NEEDS_DECISION`.

| Current capability | Source | API family | Rule/access | Role/tenant | Entitlement/limit | Proposed mobile flow/destination | Tests/evidence | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Authentication/session | `auth-service.js`, `auth.middleware.js` | `/api/auth/*` | active user/session, 401 | all staff roles | none | login/restore/logout | auth unit/browser tests | PLANNED |
| Gym bootstrap/dashboard | `dashboard.routes.js`, `branch-service.js` | `/api/bootstrap`, `/api/dashboard` | tenant + subscription + permission | Owner/Assistant, gym | dashboard | Gym Home | dashboard/bootstrap tests | PLANNED |
| Members/memberships | `member-service.js`, `members.routes.js` | `/api/members*`, `/api/memberships*` | scope/permission/limits | Owner/Assistant, gym | members/maxMembers | member list/detail/actions | member contract/browser tests | PLANNED |
| Attendance | `attendance-service.js` | `/api/attendance*` | branch/section and state | Owner/Assistant, gym | attendance | quick check-in/out | attendance tests | PLANNED |
| Day passes | `day-pass-service.js` | `/api/day-passes*` | owner/assistant permissions | gym | day_passes | quick action | day-pass tests | PLANNED |
| Finance/ledger | `financial-ledger-service.js`, `finance-service.js` | `/api/monthly-finance`, `/api/expenses*` | financial scope and semantics | gym | finance/payments | finance/read/collect | ledger/scope tests | PLANNED |
| Coaching/nutrition | `coaching-service.js` | `/api/coaching*`, `/api/workout*`, `/api/diet*` | tenant/permission | gym/trainer | coaching/nutrition | focused plans | coaching tests | PLANNED |
| Library | `library-service.js` | `/api/library*` | tenant/permission | gym/trainer | library | search/library | library tests | PLANNED |
| Reports/intelligence | `report-service.js`, `intelligence-service.js` | `/api/reports`, `/api/intelligence*` | read/AI limit | gym/trainer | reports/ai/maxAiGenerations | report/assistant surfaces | report/intelligence tests | PLANNED |
| Branches/sections | `branch-service.js` | `/api/branches*` | gym branch access, core capability | Owner/Assistant, gym | branches/maxBranches | context switcher/manage | branch/RLS tests | PLANNED |
| Store/inventory/bar | `store-service.js`, `stock-location-service.js`, `bar-service.js` | `/api/store*`, `/api/commerce*`, `/api/bar*` | branch + operation permissions | gym | store/inventory/bar | POS/inventory tasks | store/branch tests | PLANNED |
| Branding/team | branding/auth services | `/api/branding*`, `/api/auth/users*` | owner/permission/storage | gym/trainer | branding/team | settings/team | branding/auth tests | PLANNED |
| Notifications | `notification-service.js` | `/api/notifications*` | recipient/tenant scope | gym/trainer | notifications | inbox/read | notification tests | PLANNED |
| SaaS billing | `saas-service.js` | `/api/saas/*` | owner/subscription snapshots | Owner, gym/trainer | plan/features/limits | billing/status/recovery | SaaS/plan tests | PLANNED |
| Public registration | `gym-registration-service.js` | `/api/public/*` | public rate-limited review | public/platform | plan catalog | registration flow | registration tests | PLANNED |
| Trainer clients | `trainer-service.js` | `/api/trainer/clients*` | trainer tenant/client scope | Owner, independent_trainer | clients/maxClients | Trainer Clients | trainer tests | PLANNED |
| Trainer sessions/plans | `trainer-studio-service.js` | `/api/trainer/sessions*`, plans | coaching permissions | trainer | sessions/coaching | Today/Sessions/Plans | trainer browser tests | PLANNED |
| Trainer packages/payments | `trainer-commerce-service.js` | `/api/trainer/packages*`, payments | finance/refund permissions | trainer | packages/payments | Packages/Payments | trainer commerce tests | PLANNED |
| Trainer tasks/templates | trainer studio services | `/api/trainer/tasks*`, templates | coaching/update permissions | trainer | tasks/templates | Action Center/Templates | trainer tests | PLANNED |
| Member Portal | `membership-code-service.js`, `member-portal-service.js` | `/api/member-portal/*` | code HMAC + portal session | member, owning tenant | portal | code → portal | member portal tests | PLANNED |
| Backups | backup services | `/api/backup*` | Owner/cron/platform, private storage | gym/platform | backup/storage | read-only status at most | backup/recovery tests | INTENTIONALLY_WEB_ONLY |
| Platform Admin | `platform-admin-service.js` | `/api/platform-admin/*` | PlatformAdmin + explicit tenant | PlatformAdmin | platform management | admin console | platform tests | PLANNED |
| Web hash shell/DOM dialogs | `public/js/app.js`, feature loader | no mobile API | browser runtime | web only | none | native navigation/sheets replacement | browser tests | INTENTIONALLY_WEB_ONLY |

## Completeness notes

All 31 canonical feature keys are represented in `05-FEATURE-CATALOG.md`; the table above maps the meaningful domains. Exact method/path declarations remain in the 347-declaration module index in `03-API-CATALOG.md`. A future implementation must add one row per new mobile capability and link its contract test before calling it implemented.
