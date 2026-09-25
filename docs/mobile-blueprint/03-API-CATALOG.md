# 03 — API Catalog

## Inventory method and completeness

The inventory was extracted from the executable route registrations under `src/routes/` and cross-checked against `src/routes/index.js`, `docs/API.md`, controllers, frontend API calls, and tests. It contains **347 route declarations across 29 route modules**. A declaration is counted once by method and path; compatibility namespaces are retained because they are real current routes.

The route modules are the authoritative endpoint list. Shared middleware applies authentication, same-origin, tenant context, permission, capability, subscription, rate-limit, read-only, and branch/section checks; the specific service/controller is the source for request and response fields.

## Shared contract columns

| Concern | Current contract | Source |
| --- | --- | --- |
| Staff authentication | HttpOnly SameSite cookie backed by hashed SQL session; missing/expired is `401` | `src/services/auth-service.js`, `src/middleware/auth.middleware.js` |
| Tenant context | trusted session/user resolution plus `AsyncLocalStorage`; SQL request sets `tenant_id` and `tenant_mode` session context | `src/tenancy/tenant-context.js`, `src/database/pool.js` |
| Platform context | tenantless session; target tenant must be explicit | `src/middleware/platform.middleware.js`, `src/services/platform-admin-service.js` |
| Authorization | role defaults plus route/body-aware permission resolution; forbidden is `403` | `src/permissions/role-permissions.js`, `src/permissions/route-permissions.js` |
| Capability | effective plan/tenant-type/override/status resolution; feature denial `SAAS_FEATURE_NOT_INCLUDED`, type denial `CAPABILITY_NOT_ENABLED` | `src/services/capability-service.js`, `src/services/saas-service.js` |
| Pagination | endpoint-specific query values; services normalize page/pageSize/limit and return current web envelopes | controllers/services under the domain |
| Errors | JSON error mapper preserves safe code/status/message and hides SQL/stack/credentials | `src/utils/error-response.js` |
| Uploads | Busboy/raw upload paths validate MIME/signature/size and use private object storage | `src/middleware/security.middleware.js`, `src/services/object-storage-service.js`, domain services |

## Complete route-module index

The following index accounts for every declaration. The count is the source-derived declaration count, not a count of guessed mobile screens.

| Module/source | Count | Endpoint families |
| --- | ---: | --- |
| `attendance.routes.js` | 5 | attendance list/report/member/check-in/check-out |
| `auth.routes.js` | 13 | session/login/logout/password/users/permissions |
| `backup.routes.js` | 12 | status/history/daily/records/archives/download/inspect/restore |
| `bar.routes.js` | 10 | menu/modifiers/recipes/sales/shifts/waste |
| `branch.routes.js` | 7 | branch bootstrap/list/create/update/archive/user access |
| `branding.routes.js` | 9 | settings/branding/assets/draft/publish/reset |
| `coaching.routes.js` | 22 | catalog/clients/training plans/nutrition plans/measurements/checkins/workout sessions/meal logs |
| `dashboard.routes.js` | 3 | bootstrap/dashboard/analytics |
| `day-pass.routes.js` | 9 | pricing/list/summary/create/update/delete/void/WhatsApp-opened |
| `finance.routes.js` | 4 | monthly finance/expenses CRUD |
| `gym-registration.routes.js` | 12 | public Gym/Trainer catalog, request, status, proof |
| `index.js` | 2 | `/api/health`, `/api/health/live` |
| `intelligence.routes.js` | 6 | overview/churn/query/refine/workout/diet suggestions |
| `library.routes.js` | 6 | options and typed collection/item CRUD |
| `member-feedback.routes.js` | 2 | public portal feedback and staff feedback list |
| `member-portal.routes.js` | 13 | lookup/session/occupancy/library/catalog/payments/notifications/feedback/subscription requests/proof |
| `members.routes.js` | 16 | member CRUD/details/refund/freeze/resume/renew/membership/payment/code/branch access |
| `member-subscription.routes.js` | 7 | member subscription request review/approval/rejection/proof |
| `notification.routes.js` | 10 | staff notifications/read/stream/unread |
| `phone.routes.js` | 2 | countries and country detection |
| `platform.routes.js` | 13 | compatibility platform overview/tenants/plans/requests/audit/WhatsApp |
| `platform-admin.routes.js` | 42 | canonical platform dashboard/tenants/users/plans/requests/backups/audit/payments |
| `pricing.routes.js` | 8 | pricing, pricing plans, membership types |
| `reports.routes.js` | 1 | reports |
| `saas.routes.js` | 8 | entitlements/catalog/plans/subscription/requests/proof |
| `stock-location.routes.js` | 7 | stock locations/transfers/adjust/approve/receive |
| `store.routes.js` | 33 | store bootstrap/catalog/products/categories/inventory/purchases/sales/expenses/reports/suppliers |
| `trainer.routes.js` | 61 | Trainer workspace/library/intelligence/clients/measurements/check-ins/plans/packages/payments/sessions/goals/tasks/templates |
| `whatsapp-template.routes.js` | 4 | runtime templates/list/edit/restore |

## Domain endpoint matrix

The full method/path declarations are in the listed route modules; the following rows give the mobile-relevant contract and readiness without duplicating controller code.

| Domain | Canonical source | Auth/context | Main request/response contract | Mobile readiness |
| --- | --- | --- | --- | --- |
| Health | `routes/index.js` | public | liveness; health checks DB/storage/cache | READY_WITH_CLIENT_ADAPTATION |
| Auth/team | `auth.routes.js`, `auth-service.js` | staff session/Owner for team | email/password login, session probe/logout/password, assistant users and permissions | READY_WITH_CLIENT_ADAPTATION |
| Bootstrap | `dashboard.routes.js`, `branch-service.js`, `saas-service.js` | staff tenant | current user, tenant, entitlements, branch context, dashboard seed | READY_WITH_CLIENT_ADAPTATION |
| Gym members/memberships | `members.routes.js`, `member-service.js`, `member-subscription-service.js` | tenant + branch/section where applicable + permission | list/detail/create/update/freeze/renew/refund/membership/payment/code | READY_WITH_CLIENT_ADAPTATION |
| Attendance | `attendance.routes.js`, `attendance-service.js` | Gym tenant + branch/section | today/report/member/check-in/out | READY_WITH_CLIENT_ADAPTATION |
| Day passes | `day-pass.routes.js`, `day-pass-service.js` | Gym tenant + Owner/Assistant permission | list/summary/pricing/create/update/void | READY_WITH_CLIENT_ADAPTATION |
| Finance | `finance.routes.js`, `finance-service.js`, `financial-ledger-service.js` | Gym tenant + finance permission | expenses/monthly finance and ledger-scoped reporting | READY_WITH_CLIENT_ADAPTATION |
| Coaching/nutrition | `coaching.routes.js`, `coaching-service.js` | tenant feature + coaching permission | client plans, workouts, diet, measurements/check-ins/session logs | READY_WITH_CLIENT_ADAPTATION |
| Library | `library.routes.js`, `library-service.js` | feature + permission | typed exercise/food/muscle/catalog CRUD | READY_WITH_CLIENT_ADAPTATION |
| Reports/intelligence | `reports.routes.js`, `intelligence.routes.js` | feature + permission + limits for AI | report payloads and AI generation/refinement | READY_WITH_CLIENT_ADAPTATION |
| Store/inventory/bar | `store.routes.js`, `stock-location.routes.js`, `bar.routes.js` | Gym + branch + operation permission | product/inventory/purchase/sale/return/bar shift/sale | READY_WITH_CLIENT_ADAPTATION |
| Branch/section | `branch.routes.js`, `branch-service.js` | Gym + branches capability + branch permissions | branch bootstrap/list/manage, user access, sections | READY_WITH_CLIENT_ADAPTATION |
| Branding/WhatsApp | `branding.routes.js`, `whatsapp-template.routes.js` | tenant + permission; private upload | draft/publish/assets/template rendering and WhatsApp links | READY_WITH_CLIENT_ADAPTATION |
| SaaS tenant billing | `saas.routes.js`, `saas-service.js` | Owner | effective entitlements, subscription, plans, request/proof | READY_WITH_CLIENT_ADAPTATION |
| Public registration | `gym-registration.routes.js` | public/rate-limited; platform review | Gym/Trainer catalog, request, status, proof upload | READY_WITH_CLIENT_ADAPTATION |
| Member Portal | `member-portal.routes.js`, `member-portal-service.js` | membership code + portal session | lookup establishes portal session; session-scoped member data/notifications/feedback/requests | READY_WITH_CLIENT_ADAPTATION |
| Trainer | `trainer.routes.js`, `trainer-service.js`, `trainer-studio-service.js` | independent_trainer tenant + feature/permission/limit | clients, plans, sessions, packages, goals, tasks, templates, library, AI | READY_WITH_CLIENT_ADAPTATION |
| Platform Admin | `platform-admin.routes.js`, `platform-admin-service.js` | PlatformAdmin; explicit tenant target | tenant lifecycle, plans, overrides, subscriptions, users, backups, audit, payment methods | READY_WITH_CLIENT_ADAPTATION |
| Backup | `backup.routes.js`, backup services | Owner/cron/platform | private archive lifecycle and restore; not a normal mobile workflow | WEB_SPECIFIC |

## Current consumers and mobile notes

Web consumers are in `public/js/` and are not a mobile contract by themselves. Mobile must use the same server paths and response semantics, replace cookie/session transport only through an approved server-compatible strategy, and add contract tests before implementation. Browser-only downloads, print, hash routes, and DOM-driven dialogs are `WEB_SPECIFIC` unless a user workflow is explicitly mapped in `09-MOBILE-INFORMATION-ARCHITECTURE.md`.

## Exact source declaration index

The following table is the machine-extracted method/path index used for the completeness count above. Request body, response, error, service, database, and mobile-readiness details are inherited from the domain rows above and the referenced controller/service; this avoids copying implementation into documentation.

| Method | Path | Route source |
| --- | --- | --- |
| GET | `/api/attendance` | `src/routes/attendance.routes.js` |
| GET | `/api/attendance/report` | `src/routes/attendance.routes.js` |
| GET | `/api/attendance/member/:id` | `src/routes/attendance.routes.js` |
| POST | `/api/attendance/check-in` | `src/routes/attendance.routes.js` |
| POST | `/api/attendance/check-out` | `src/routes/attendance.routes.js` |
| GET | `/api/auth/session` | `src/routes/auth.routes.js` |
| POST | `/api/auth/login` | `src/routes/auth.routes.js` |
| POST | `/api/auth/logout` | `src/routes/auth.routes.js` |
| POST | `/api/auth/change-password` | `src/routes/auth.routes.js` |
| GET | `/api/auth/users` | `src/routes/auth.routes.js` |
| POST | `/api/auth/users` | `src/routes/auth.routes.js` |
| PUT | `/api/auth/users/:id` | `src/routes/auth.routes.js` |
| PATCH | `/api/auth/users/:id/status` | `src/routes/auth.routes.js` |
| DELETE | `/api/auth/users/:id` | `src/routes/auth.routes.js` |
| GET | `/api/auth/permissions/catalog` | `src/routes/auth.routes.js` |
| GET | `/api/auth/users/:id/permissions` | `src/routes/auth.routes.js` |
| PUT | `/api/auth/users/:id/permissions` | `src/routes/auth.routes.js` |
| POST | `/api/auth/users/:id/permissions/reset` | `src/routes/auth.routes.js` |
| GET | `/api/backup/daily` | `src/routes/backup.routes.js` |
| GET | `/api/backup/download` | `src/routes/backup.routes.js` |
| GET | `/api/backup/status` | `src/routes/backup.routes.js` |
| POST | `/api/backup/records` | `src/routes/backup.routes.js` |
| GET | `/api/backup/history` | `src/routes/backup.routes.js` |
| GET | `/api/backup/archives/:id` | `src/routes/backup.routes.js` |
| GET | `/api/backup/records/:id/download` | `src/routes/backup.routes.js` |
| DELETE | `/api/backup/archives/:id` | `src/routes/backup.routes.js` |
| DELETE | `/api/backup/records/:id` | `src/routes/backup.routes.js` |
| POST | `/api/backup/records/:id/restore` | `src/routes/backup.routes.js` |
| POST | `/api/backup/inspect` | `src/routes/backup.routes.js` |
| POST | `/api/backup/restore` | `src/routes/backup.routes.js` |
| GET | `/api/bar/menu` | `src/routes/bar.routes.js` |
| GET | `/api/bar/recipes` | `src/routes/bar.routes.js` |
| POST | `/api/bar/recipes` | `src/routes/bar.routes.js` |
| GET | `/api/bar/modifiers` | `src/routes/bar.routes.js` |
| POST | `/api/bar/modifiers` | `src/routes/bar.routes.js` |
| POST | `/api/bar/shifts` | `src/routes/bar.routes.js` |
| GET | `/api/bar/shifts/branch/:branchId/open` | `src/routes/bar.routes.js` |
| POST | `/api/bar/shifts/:id/close` | `src/routes/bar.routes.js` |
| POST | `/api/bar/sales` | `src/routes/bar.routes.js` |
| POST | `/api/bar/waste` | `src/routes/bar.routes.js` |
| GET | `/api/branches` | `src/routes/branch.routes.js` |
| GET | `/api/branches/bootstrap` | `src/routes/branch.routes.js` |
| POST | `/api/branches` | `src/routes/branch.routes.js` |
| PATCH | `/api/branches/:id` | `src/routes/branch.routes.js` |
| POST | `/api/branches/:id/archive` | `src/routes/branch.routes.js` |
| GET | `/api/branches/users/:userId` | `src/routes/branch.routes.js` |
| PUT | `/api/branches/users/:userId` | `src/routes/branch.routes.js` |
| GET | `/api/branding` | `src/routes/branding.routes.js` |
| GET | `/api/branding/assets/:key` | `src/routes/branding.routes.js` |
| GET | `/api/branding/draft-assets/:key` | `src/routes/branding.routes.js` |
| GET | `/api/branding/settings` | `src/routes/branding.routes.js` |
| PUT | `/api/branding/draft` | `src/routes/branding.routes.js` |
| POST | `/api/branding/publish` | `src/routes/branding.routes.js` |
| POST | `/api/branding/reset` | `src/routes/branding.routes.js` |
| POST | `/api/branding/assets` | `src/routes/branding.routes.js` |
| DELETE | `/api/branding/assets/:key` | `src/routes/branding.routes.js` |
| GET | `/api/external-trainees` | `src/routes/coaching.routes.js` |
| POST | `/api/external-trainees` | `src/routes/coaching.routes.js` |
| GET | `/api/coaching/clients` | `src/routes/coaching.routes.js` |
| GET | `/api/coaching/catalog` | `src/routes/coaching.routes.js` |
| GET | `/api/clients/:id/coaching-summary` | `src/routes/coaching.routes.js` |
| GET | `/api/clients/:id/training-overview` | `src/routes/coaching.routes.js` |
| PUT | `/api/clients/:id` | `src/routes/coaching.routes.js` |
| GET | `/api/clients/:id/measurements` | `src/routes/coaching.routes.js` |
| POST | `/api/clients/:id/measurements` | `src/routes/coaching.routes.js` |
| PUT | `/api/clients/:id/measurements/:measurementId` | `src/routes/coaching.routes.js` |
| DELETE | `/api/clients/:id/measurements/:measurementId` | `src/routes/coaching.routes.js` |
| GET | `/api/clients/:id/checkins` | `src/routes/coaching.routes.js` |
| POST | `/api/clients/:id/checkins` | `src/routes/coaching.routes.js` |
| PUT | `/api/clients/:id/checkins/:checkinId` | `src/routes/coaching.routes.js` |
| DELETE | `/api/clients/:id/checkins/:checkinId` | `src/routes/coaching.routes.js` |
| POST | `/api/workoutsessions/start` | `src/routes/coaching.routes.js` |
| GET | `/api/workoutsessions` | `src/routes/coaching.routes.js` |
| GET | `/api/workoutsessions/:id` | `src/routes/coaching.routes.js` |
| POST | `/api/workoutsessions/:id/sets` | `src/routes/coaching.routes.js` |
| POST | `/api/workoutsessions/:id/end` | `src/routes/coaching.routes.js` |
| POST | `/api/meal-logs` | `src/routes/coaching.routes.js` |
| GET | `/api/meal-logs` | `src/routes/coaching.routes.js` |
| GET | `/api/dashboard` | `src/routes/dashboard.routes.js` |
| GET | `/api/dashboard-analytics` | `src/routes/dashboard.routes.js` |
| GET | `/api/bootstrap` | `src/routes/dashboard.routes.js` |
| GET | `/api/day-passes/pricing` | `src/routes/day-pass.routes.js` |
| PUT | `/api/day-passes/pricing` | `src/routes/day-pass.routes.js` |
| GET | `/api/day-passes` | `src/routes/day-pass.routes.js` |
| GET | `/api/day-passes/summary` | `src/routes/day-pass.routes.js` |
| POST | `/api/day-passes` | `src/routes/day-pass.routes.js` |
| PUT | `/api/day-passes/:id` | `src/routes/day-pass.routes.js` |
| DELETE | `/api/day-passes/:id` | `src/routes/day-pass.routes.js` |
| POST | `/api/day-passes/:id/whatsapp-opened` | `src/routes/day-pass.routes.js` |
| POST | `/api/day-passes/:id/void` | `src/routes/day-pass.routes.js` |
| GET | `/api/monthly-finance` | `src/routes/finance.routes.js` |
| POST | `/api/expenses` | `src/routes/finance.routes.js` |
| PUT | `/api/expenses/:id` | `src/routes/finance.routes.js` |
| DELETE | `/api/expenses/:id` | `src/routes/finance.routes.js` |
| GET | `/api/public/gym-registration/catalog` | `src/routes/gym-registration.routes.js` |
| POST | `/api/public/gym-registration/requests` | `src/routes/gym-registration.routes.js` |
| POST | `/api/public/gym-registration/requests/:requestId/proof` | `src/routes/gym-registration.routes.js` |
| GET | `/api/public/gym-registration/requests/:requestId` | `src/routes/gym-registration.routes.js` |
| GET | `/api/public/trainer-registration/catalog` | `src/routes/gym-registration.routes.js` |
| POST | `/api/public/trainer-registration/requests` | `src/routes/gym-registration.routes.js` |
| POST | `/api/public/trainer-registration/requests/:requestId/proof` | `src/routes/gym-registration.routes.js` |
| GET | `/api/public/trainer-registration/requests/:requestId` | `src/routes/gym-registration.routes.js` |
| GET | `/api/platform-admin/gym-registration-requests` | `src/routes/gym-registration.routes.js` |
| GET | `/api/platform-admin/gym-registration-requests/proofs/:proofId/file` | `src/routes/gym-registration.routes.js` |
| POST | `/api/platform-admin/gym-registration-requests/:requestId/approve` | `src/routes/gym-registration.routes.js` |
| POST | `/api/platform-admin/gym-registration-requests/:requestId/reject` | `src/routes/gym-registration.routes.js` |
| GET | `/api/health/live` | `src/routes/index.js` |
| GET | `/api/health` | `src/routes/index.js` |
| GET | `/api/intelligence/overview` | `src/routes/intelligence.routes.js` |
| POST | `/api/intelligence/query` | `src/routes/intelligence.routes.js` |
| GET | `/api/intelligence/churn` | `src/routes/intelligence.routes.js` |
| POST | `/api/intelligence/workout-suggestions` | `src/routes/intelligence.routes.js` |
| POST | `/api/intelligence/diet-suggestions` | `src/routes/intelligence.routes.js` |
| POST | `/api/intelligence/refine` | `src/routes/intelligence.routes.js` |
| GET | `/api/library/options` | `src/routes/library.routes.js` |
| GET | `/api/library/:type` | `src/routes/library.routes.js` |
| GET | `/api/library/:type/:id` | `src/routes/library.routes.js` |
| POST | `/api/library/:type` | `src/routes/library.routes.js` |
| PUT | `/api/library/:type/:id` | `src/routes/library.routes.js` |
| DELETE | `/api/library/:type/:id` | `src/routes/library.routes.js` |
| POST | `/api/member-portal/feedback` | `src/routes/member-feedback.routes.js` |
| GET | `/api/member-feedback` | `src/routes/member-feedback.routes.js` |
| POST | `/api/member-portal/lookup` | `src/routes/member-portal.routes.js` |
| GET | `/api/member-portal/session` | `src/routes/member-portal.routes.js` |
| GET | `/api/member-portal/payment-methods` | `src/routes/member-portal.routes.js` |
| GET | `/api/member-portal/membership-catalog` | `src/routes/member-portal.routes.js` |
| POST | `/api/member-portal/occupancy` | `src/routes/member-portal.routes.js` |
| GET | `/api/member-portal/library/options` | `src/routes/member-portal.routes.js` |
| GET | `/api/member-portal/library/:type` | `src/routes/member-portal.routes.js` |
| GET | `/api/member-portal/library/:type/:id` | `src/routes/member-portal.routes.js` |
| GET | `/api/members/:id/membership-code` | `src/routes/member-portal.routes.js` |
| POST | `/api/members/:id/membership-code/reveal` | `src/routes/member-portal.routes.js` |
| POST | `/api/members/:id/membership-code/resend` | `src/routes/member-portal.routes.js` |
| POST | `/api/members/:id/membership-code/rotate` | `src/routes/member-portal.routes.js` |
| GET | `/api/portal/analytics` | `src/routes/member-portal.routes.js` |
| GET | `/api/members` | `src/routes/members.routes.js` |
| GET | `/api/members/:id/refund-preview` | `src/routes/members.routes.js` |
| GET | `/api/members/:id/details` | `src/routes/members.routes.js` |
| GET | `/api/members/:id` | `src/routes/members.routes.js` |
| POST | `/api/members/:id/alert-communications` | `src/routes/members.routes.js` |
| POST | `/api/members` | `src/routes/members.routes.js` |
| PUT | `/api/members/:id` | `src/routes/members.routes.js` |
| POST | `/api/members/:id/freeze` | `src/routes/members.routes.js` |
| POST | `/api/members/:id/resume` | `src/routes/members.routes.js` |
| POST | `/api/members/:id/renew` | `src/routes/members.routes.js` |
| POST | `/api/members/:id/refund` | `src/routes/members.routes.js` |
| POST | `/api/members/:id/memberships` | `src/routes/members.routes.js` |
| GET | `/api/memberships/:id/branches` | `src/routes/members.routes.js` |
| PUT | `/api/memberships/:id/branches` | `src/routes/members.routes.js` |
| POST | `/api/memberships/:id/payments` | `src/routes/members.routes.js` |
| DELETE | `/api/members/:id` | `src/routes/members.routes.js` |
| GET | `/api/member-portal/subscription-requests` | `src/routes/member-subscription.routes.js` |
| POST | `/api/member-portal/subscription-requests` | `src/routes/member-subscription.routes.js` |
| POST | `/api/member-portal/subscription-requests/:requestId/proof` | `src/routes/member-subscription.routes.js` |
| GET | `/api/member-subscription-requests` | `src/routes/member-subscription.routes.js` |
| GET | `/api/member-subscription-requests/proofs/:proofId/file` | `src/routes/member-subscription.routes.js` |
| POST | `/api/member-subscription-requests/:requestId/approve` | `src/routes/member-subscription.routes.js` |
| POST | `/api/member-subscription-requests/:requestId/reject` | `src/routes/member-subscription.routes.js` |
| GET | `/api/notifications` | `src/routes/notification.routes.js` |
| GET | `/api/notifications/unread-count` | `src/routes/notification.routes.js` |
| POST | `/api/notifications/:id/read` | `src/routes/notification.routes.js` |
| POST | `/api/notifications/read-all` | `src/routes/notification.routes.js` |
| GET | `/api/notifications/stream` | `src/routes/notification.routes.js` |
| GET | `/api/member-portal/notifications` | `src/routes/notification.routes.js` |
| GET | `/api/member-portal/notifications/unread-count` | `src/routes/notification.routes.js` |
| POST | `/api/member-portal/notifications/:id/read` | `src/routes/notification.routes.js` |
| POST | `/api/member-portal/notifications/read-all` | `src/routes/notification.routes.js` |
| GET | `/api/member-portal/notifications/stream` | `src/routes/notification.routes.js` |
| GET | `/api/phone/countries` | `src/routes/phone.routes.js` |
| GET | `/api/phone/country` | `src/routes/phone.routes.js` |
| GET | `/api/platform/overview` | `src/routes/platform.routes.js` |
| GET | `/api/platform/tenants` | `src/routes/platform.routes.js` |
| POST | `/api/platform/tenants` | `src/routes/platform.routes.js` |
| PATCH | `/api/platform/tenants/:id/status` | `src/routes/platform.routes.js` |
| GET | `/api/platform/plans` | `src/routes/platform.routes.js` |
| GET | `/api/platform/feature-catalog` | `src/routes/platform.routes.js` |
| PATCH | `/api/platform/plans/:id` | `src/routes/platform.routes.js` |
| PATCH | `/api/platform/plans/:id/status` | `src/routes/platform.routes.js` |
| GET | `/api/platform/subscription-requests` | `src/routes/platform.routes.js` |
| POST | `/api/platform/subscription-requests/:id/approve` | `src/routes/platform.routes.js` |
| POST | `/api/platform/subscription-requests/:id/reject` | `src/routes/platform.routes.js` |
| GET | `/api/platform/payment-proofs/:id/file` | `src/routes/platform.routes.js` |
| GET | `/api/platform/audit` | `src/routes/platform.routes.js` |
| GET | `/api/platform-admin/dashboard` | `src/routes/platform-admin.routes.js` |
| GET | `/api/platform-admin/tenants` | `src/routes/platform-admin.routes.js` |
| POST | `/api/platform-admin/tenants` | `src/routes/platform-admin.routes.js` |
| GET | `/api/platform-admin/tenants/:tenantId` | `src/routes/platform-admin.routes.js` |
| PATCH | `/api/platform-admin/tenants/:tenantId` | `src/routes/platform-admin.routes.js` |
| PATCH | `/api/platform-admin/tenants/:tenantId/status` | `src/routes/platform-admin.routes.js` |
| GET | `/api/platform-admin/tenants/:tenantId/subscription` | `src/routes/platform-admin.routes.js` |
| PATCH | `/api/platform-admin/tenants/:tenantId/subscription` | `src/routes/platform-admin.routes.js` |
| PATCH | `/api/platform-admin/tenants/:tenantId/plan` | `src/routes/platform-admin.routes.js` |
| GET | `/api/platform-admin/tenants/:tenantId/usage` | `src/routes/platform-admin.routes.js` |
| GET | `/api/platform-admin/tenants/:tenantId/overrides` | `src/routes/platform-admin.routes.js` |
| PUT | `/api/platform-admin/tenants/:tenantId/overrides` | `src/routes/platform-admin.routes.js` |
| GET | `/api/platform-admin/tenants/:tenantId/users` | `src/routes/platform-admin.routes.js` |
| PATCH | `/api/platform-admin/tenants/:tenantId/users/:userId/status` | `src/routes/platform-admin.routes.js` |
| POST | `/api/platform-admin/tenants/:tenantId/users/:userId/reset-password` | `src/routes/platform-admin.routes.js` |
| POST | `/api/platform-admin/tenants/:tenantId/owner` | `src/routes/platform-admin.routes.js` |
| GET | `/api/platform-admin/tenants/:tenantId/health` | `src/routes/platform-admin.routes.js` |
| GET | `/api/platform-admin/tenants/:tenantId/audit` | `src/routes/platform-admin.routes.js` |
| GET | `/api/platform-admin/tenants/:tenantId/notes` | `src/routes/platform-admin.routes.js` |
| POST | `/api/platform-admin/tenants/:tenantId/notes` | `src/routes/platform-admin.routes.js` |
| GET | `/api/platform-admin/plans` | `src/routes/platform-admin.routes.js` |
| GET | `/api/platform-admin/feature-catalog` | `src/routes/platform-admin.routes.js` |
| POST | `/api/platform-admin/plans` | `src/routes/platform-admin.routes.js` |
| PATCH | `/api/platform-admin/plans/:planId` | `src/routes/platform-admin.routes.js` |
| PATCH | `/api/platform-admin/plans/:planId/status` | `src/routes/platform-admin.routes.js` |
| DELETE | `/api/platform-admin/plans/:planId` | `src/routes/platform-admin.routes.js` |
| GET | `/api/platform-admin/subscription-requests` | `src/routes/platform-admin.routes.js` |
| POST | `/api/platform-admin/subscription-requests/:requestId/approve` | `src/routes/platform-admin.routes.js` |
| POST | `/api/platform-admin/subscription-requests/:requestId/reject` | `src/routes/platform-admin.routes.js` |
| GET | `/api/platform-admin/payment-methods` | `src/routes/platform-admin.routes.js` |
| POST | `/api/platform-admin/payment-methods` | `src/routes/platform-admin.routes.js` |
| PATCH | `/api/platform-admin/payment-methods/:methodId` | `src/routes/platform-admin.routes.js` |
| GET | `/api/platform-admin/payment-proofs/:proofId/file` | `src/routes/platform-admin.routes.js` |
| GET | `/api/platform-admin/audit` | `src/routes/platform-admin.routes.js` |
| GET | `/api/platform-admin/backups/health` | `src/routes/platform-admin.routes.js` |
| GET | `/api/platform-admin/backups` | `src/routes/platform-admin.routes.js` |
| POST | `/api/platform-admin/backups/run` | `src/routes/platform-admin.routes.js` |
| POST | `/api/platform-admin/backups/retention` | `src/routes/platform-admin.routes.js` |
| GET | `/api/platform-admin/backups/:backupId/download` | `src/routes/platform-admin.routes.js` |
| GET | `/api/platform-admin/tenants/:tenantId/backups` | `src/routes/platform-admin.routes.js` |
| POST | `/api/platform-admin/tenants/:tenantId/backups` | `src/routes/platform-admin.routes.js` |
| GET | `/api/platform-admin/tenants/:tenantId/backups/:backupId/download` | `src/routes/platform-admin.routes.js` |
| GET | `/api/pricing` | `src/routes/pricing.routes.js` |
| PUT | `/api/pricing` | `src/routes/pricing.routes.js` |
| PUT | `/api/pricing/:planCode` | `src/routes/pricing.routes.js` |
| POST | `/api/pricing-plans` | `src/routes/pricing.routes.js` |
| PUT | `/api/pricing-plans/:planCode` | `src/routes/pricing.routes.js` |
| POST | `/api/membership-types` | `src/routes/pricing.routes.js` |
| PUT | `/api/membership-types/:typeCode` | `src/routes/pricing.routes.js` |
| DELETE | `/api/membership-types/:typeCode` | `src/routes/pricing.routes.js` |
| GET | `/api/reports` | `src/routes/reports.routes.js` |
| GET | `/api/saas/entitlements` | `src/routes/saas.routes.js` |
| GET | `/api/saas/subscription` | `src/routes/saas.routes.js` |
| GET | `/api/saas/plans` | `src/routes/saas.routes.js` |
| GET | `/api/saas/feature-catalog` | `src/routes/saas.routes.js` |
| GET | `/api/saas/subscription-requests` | `src/routes/saas.routes.js` |
| POST | `/api/saas/subscription-requests` | `src/routes/saas.routes.js` |
| POST | `/api/saas/subscription-requests/:id/proof` | `src/routes/saas.routes.js` |
| GET | `/api/saas/payment-proofs/:id/file` | `src/routes/saas.routes.js` |
| GET | `/api/commerce/stock-locations` | `src/routes/stock-location.routes.js` |
| POST | `/api/commerce/stock-locations` | `src/routes/stock-location.routes.js` |
| POST | `/api/commerce/stock-locations/:locationId/adjustments` | `src/routes/stock-location.routes.js` |
| GET | `/api/commerce/stock-transfers` | `src/routes/stock-location.routes.js` |
| POST | `/api/commerce/stock-transfers` | `src/routes/stock-location.routes.js` |
| POST | `/api/commerce/stock-transfers/:id/approve` | `src/routes/stock-location.routes.js` |
| POST | `/api/commerce/stock-transfers/:id/receive` | `src/routes/stock-location.routes.js` |
| GET | `/api/store/bootstrap` | `src/routes/store.routes.js` |
| GET | `/api/store/dashboard` | `src/routes/store.routes.js` |
| GET | `/api/store/reports` | `src/routes/store.routes.js` |
| GET | `/api/store/categories` | `src/routes/store.routes.js` |
| POST | `/api/store/categories` | `src/routes/store.routes.js` |
| PUT | `/api/store/categories/:id` | `src/routes/store.routes.js` |
| GET | `/api/store/products` | `src/routes/store.routes.js` |
| GET | `/api/store/products/:id` | `src/routes/store.routes.js` |
| POST | `/api/store/products` | `src/routes/store.routes.js` |
| PUT | `/api/store/products/:id` | `src/routes/store.routes.js` |
| DELETE | `/api/store/products/:id` | `src/routes/store.routes.js` |
| POST | `/api/store/products/:productId/variants` | `src/routes/store.routes.js` |
| PUT | `/api/store/products/:productId/variants/:variantId` | `src/routes/store.routes.js` |
| DELETE | `/api/store/products/:productId/variants/:variantId` | `src/routes/store.routes.js` |
| GET | `/api/store/suppliers` | `src/routes/store.routes.js` |
| POST | `/api/store/suppliers` | `src/routes/store.routes.js` |
| PUT | `/api/store/suppliers/:id` | `src/routes/store.routes.js` |
| GET | `/api/store/inventory` | `src/routes/store.routes.js` |
| GET | `/api/store/inventory/movements` | `src/routes/store.routes.js` |
| POST | `/api/store/inventory/adjustments` | `src/routes/store.routes.js` |
| GET | `/api/store/customers/search` | `src/routes/store.routes.js` |
| GET | `/api/store/purchases` | `src/routes/store.routes.js` |
| GET | `/api/store/purchases/:id` | `src/routes/store.routes.js` |
| POST | `/api/store/purchases` | `src/routes/store.routes.js` |
| GET | `/api/store/sales` | `src/routes/store.routes.js` |
| GET | `/api/store/sales/:id` | `src/routes/store.routes.js` |
| POST | `/api/store/sales` | `src/routes/store.routes.js` |
| POST | `/api/store/sales/:id/returns` | `src/routes/store.routes.js` |
| GET | `/api/store/expenses` | `src/routes/store.routes.js` |
| POST | `/api/store/expenses` | `src/routes/store.routes.js` |
| PUT | `/api/store/expenses/:id` | `src/routes/store.routes.js` |
| DELETE | `/api/store/expenses/:id` | `src/routes/store.routes.js` |
| GET | `/api/members/:id/store-purchases` | `src/routes/store.routes.js` |
| GET | `/api/trainer/workspace` | `src/routes/trainer.routes.js` |
| GET | `/api/trainer/library/options` | `src/routes/trainer.routes.js` |
| GET | `/api/trainer/library/catalog` | `src/routes/trainer.routes.js` |
| GET | `/api/trainer/library/:type` | `src/routes/trainer.routes.js` |
| GET | `/api/trainer/library/:type/:id` | `src/routes/trainer.routes.js` |
| POST | `/api/trainer/intelligence/workout-suggestions` | `src/routes/trainer.routes.js` |
| POST | `/api/trainer/intelligence/diet-suggestions` | `src/routes/trainer.routes.js` |
| POST | `/api/trainer/intelligence/refine` | `src/routes/trainer.routes.js` |
| GET | `/api/trainer/reports/summary` | `src/routes/trainer.routes.js` |
| GET | `/api/trainer/clients` | `src/routes/trainer.routes.js` |
| GET | `/api/trainer/follow-up` | `src/routes/trainer.routes.js` |
| POST | `/api/trainer/clients` | `src/routes/trainer.routes.js` |
| GET | `/api/trainer/clients/:id` | `src/routes/trainer.routes.js` |
| GET | `/api/trainer/clients/:id/timeline` | `src/routes/trainer.routes.js` |
| POST | `/api/trainer/clients/:id/portal-access` | `src/routes/trainer.routes.js` |
| PATCH | `/api/trainer/clients/:id` | `src/routes/trainer.routes.js` |
| DELETE | `/api/trainer/clients/:id` | `src/routes/trainer.routes.js` |
| GET | `/api/trainer/clients/:id/measurements` | `src/routes/trainer.routes.js` |
| POST | `/api/trainer/clients/:id/measurements` | `src/routes/trainer.routes.js` |
| PATCH | `/api/trainer/clients/:id/measurements/:measurementId` | `src/routes/trainer.routes.js` |
| DELETE | `/api/trainer/clients/:id/measurements/:measurementId` | `src/routes/trainer.routes.js` |
| GET | `/api/trainer/clients/:id/checkins` | `src/routes/trainer.routes.js` |
| POST | `/api/trainer/clients/:id/checkins` | `src/routes/trainer.routes.js` |
| PATCH | `/api/trainer/clients/:id/checkins/:checkinId` | `src/routes/trainer.routes.js` |
| DELETE | `/api/trainer/clients/:id/checkins/:checkinId` | `src/routes/trainer.routes.js` |
| GET | `/api/trainer/training-plans` | `src/routes/trainer.routes.js` |
| POST | `/api/trainer/training-plans` | `src/routes/trainer.routes.js` |
| PATCH | `/api/trainer/training-plans/:id` | `src/routes/trainer.routes.js` |
| PATCH | `/api/trainer/training-plans/:id/status` | `src/routes/trainer.routes.js` |
| DELETE | `/api/trainer/training-plans/:id` | `src/routes/trainer.routes.js` |
| GET | `/api/trainer/nutrition-plans` | `src/routes/trainer.routes.js` |
| POST | `/api/trainer/nutrition-plans` | `src/routes/trainer.routes.js` |
| PATCH | `/api/trainer/nutrition-plans/:id` | `src/routes/trainer.routes.js` |
| PATCH | `/api/trainer/nutrition-plans/:id/status` | `src/routes/trainer.routes.js` |
| DELETE | `/api/trainer/nutrition-plans/:id` | `src/routes/trainer.routes.js` |
| GET | `/api/trainer/packages` | `src/routes/trainer.routes.js` |
| POST | `/api/trainer/packages` | `src/routes/trainer.routes.js` |
| PATCH | `/api/trainer/packages/:id` | `src/routes/trainer.routes.js` |
| GET | `/api/trainer/package-purchases` | `src/routes/trainer.routes.js` |
| POST | `/api/trainer/package-purchases` | `src/routes/trainer.routes.js` |
| GET | `/api/trainer/payments` | `src/routes/trainer.routes.js` |
| POST | `/api/trainer/package-purchases/:id/payments` | `src/routes/trainer.routes.js` |
| POST | `/api/trainer/package-purchases/:id/refunds` | `src/routes/trainer.routes.js` |
| GET | `/api/trainer/sessions` | `src/routes/trainer.routes.js` |
| POST | `/api/trainer/sessions` | `src/routes/trainer.routes.js` |
| PATCH | `/api/trainer/sessions/:id` | `src/routes/trainer.routes.js` |
| PATCH | `/api/trainer/sessions/:id/status` | `src/routes/trainer.routes.js` |
| GET | `/api/trainer/goals` | `src/routes/trainer.routes.js` |
| POST | `/api/trainer/goals` | `src/routes/trainer.routes.js` |
| PATCH | `/api/trainer/goals/:id` | `src/routes/trainer.routes.js` |
| PATCH | `/api/trainer/goals/:id/status` | `src/routes/trainer.routes.js` |
| DELETE | `/api/trainer/goals/:id` | `src/routes/trainer.routes.js` |
| GET | `/api/trainer/notifications` | `src/routes/trainer.routes.js` |
| GET | `/api/trainer/tasks` | `src/routes/trainer.routes.js` |
| POST | `/api/trainer/tasks` | `src/routes/trainer.routes.js` |
| PATCH | `/api/trainer/tasks/:id` | `src/routes/trainer.routes.js` |
| POST | `/api/trainer/tasks/:id/dismiss` | `src/routes/trainer.routes.js` |
| GET | `/api/trainer/templates` | `src/routes/trainer.routes.js` |
| POST | `/api/trainer/templates` | `src/routes/trainer.routes.js` |
| PATCH | `/api/trainer/templates/:id` | `src/routes/trainer.routes.js` |
| POST | `/api/trainer/templates/:id/instantiate` | `src/routes/trainer.routes.js` |
| GET | `/api/whatsapp-templates/runtime` | `src/routes/whatsapp-template.routes.js` |
| GET | `/api/platform/whatsapp-templates` | `src/routes/whatsapp-template.routes.js` |
| PUT | `/api/platform/whatsapp-templates/:templateId` | `src/routes/whatsapp-template.routes.js` |
| POST | `/api/platform/whatsapp-templates/:templateId/restore-default` | `src/routes/whatsapp-template.routes.js` |

## Unresolved API contract detail

The repository has no machine-readable OpenAPI schema. Exact field-level request/response contracts are distributed across controllers/services and existing tests. Future mobile implementation must generate/maintain typed client contracts from reviewed endpoint evidence; `21-OPEN-QUESTIONS.md` records this as a non-critical tooling decision, not as permission to guess.
