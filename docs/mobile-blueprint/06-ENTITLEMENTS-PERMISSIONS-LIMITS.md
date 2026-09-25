# 06 — Entitlements, Permissions, and Limits

## Effective authorization pipeline

```text
Authenticated session
 -> active user/status
 -> trusted tenant resolution
 -> tenant status/type
 -> current subscription + historical snapshot
 -> plan/tenant compatibility
 -> feature catalog + implemented capability set
 -> plan feature rows
 -> tenant overrides
 -> resource limits
 -> role/user permission
 -> route/controller/service authorization
 -> tenant/branch/section-scoped SQL with RLS context
```

Sources: `src/middleware/auth.middleware.js`, `src/middleware/permission.middleware.js`, `src/permissions/route-permissions.js`, `src/permissions/role-permissions.js`, `src/services/capability-service.js`, `src/services/saas-service.js`, `src/services/permission-service.js`, and `src/database/pool.js`.

## Roles and permission catalog

The permission catalog contains 93 codes in `src/permissions/permissions.js`. Domains include dashboard, notifications/templates, members/memberships/codes, payments, coaching, attendance, finance/reports/pricing, day passes, library, management users/backup, feedback, permissions, branding, SaaS, portal analytics/member requests, intelligence, store, branches, inventory, and bar. Owner defaults are broad; Assistant defaults are explicitly constrained; PlatformAdmin follows separate middleware/service rules.

The exact catalog is executable source. Mobile must not copy a hardcoded role matrix; it should consume server-derived permission/effective capability payloads and use local maps only for presentation.

## Plan limits

Current catalog plans in `src/services/saas-plan-catalog.js`:

| Plan | maxMembers | maxClients | maxUsers | maxBranches | maxAiGenerations | maxStorageMb |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Starter | 150 | 50 | 2 | 1 | 50 | 1024 |
| Basic | 500 | 150 | 5 | 2 | 200 | 5120 |
| Pro | 1500 | 500 | 15 | 5 | 750 | 20480 |
| Business | unlimited | unlimited | unlimited | unlimited | 2000 | 51200 |

`saas-service.js` also contains an Enterprise compatibility/default path. Its availability and lifecycle are data-backed; it must not be assumed available to every tenant. Legacy Trainer plans can use `maxMembers` as a fallback for `maxClients`.

## Snapshot semantics

Subscription assignment stores billing term, price, currency, feature snapshot, and numeric limit snapshots. Current branch capacity is an intentional current-plan exception for the core Gym branch contract; other resources use snapshot values unless the owning service explicitly applies current metadata. Scheduled plan changes update future/current subscription state under compatibility and lock checks.

## Status behavior

`trial` and `active` are operational. `expired`, `cancelled`, and `suspended` deny new operational access according to endpoint guard while historical records and recovery/billing surfaces remain available where defined. Tenant `archived` is a stronger lifecycle block.

## Denial contract

- Authentication/session failure: `401`.
- Permission/role denial: `403`.
- Feature not in plan/override false: `403 SAAS_FEATURE_NOT_INCLUDED`.
- Tenant type capability absent: `503 CAPABILITY_NOT_ENABLED` or route-specific not-found behavior.
- Incompatible plan/tenant type: `503/409 SAAS_PLAN_TENANT_TYPE_MISMATCH` according to operation.
- Resource limit: service-specific limit error; server counts tenant-scoped records.

## Exact permission catalog

The following 93 entries are extracted from `PERMISSION_CATALOG` in `src/permissions/permissions.js`. Role defaults and request-specific rules remain executable in `role-permissions.js` and `route-permissions.js`.

| Code | Group | Operation | Owner-only |
| --- | --- | --- | --- |
| `notifications.read` | `notifications` | `view` | no |
| `message_templates.manage` | `messaging` | `manage` | yes |
| `dashboard.read` | `dashboard` | `عرض` | no |
| `members.read` | `members` | `عرض` | no |
| `members.create` | `members` | `إضافة` | no |
| `members.update` | `members` | `تعديل` | no |
| `members.delete` | `members` | `حذف` | no |
| `members.alerts` | `members` | `عملية خاصة` | no |
| `members.print` | `members` | `تصدير` | no |
| `memberships.read` | `memberships` | `عرض` | no |
| `memberships.create` | `memberships` | `إضافة` | no |
| `memberships.update` | `memberships` | `تعديل` | no |
| `memberships.freeze` | `memberships` | `عملية خاصة` | no |
| `memberships.renew` | `memberships` | `عملية خاصة` | no |
| `membership_codes.read` | `membership_codes` | `عرض` | yes |
| `membership_codes.reveal` | `membership_codes` | `عملية خاصة` | yes |
| `membership_codes.resend` | `membership_codes` | `عملية خاصة` | yes |
| `membership_codes.rotate` | `membership_codes` | `عملية خاصة` | yes |
| `payments.create` | `payments` | `إضافة` | no |
| `payments.refund` | `payments` | `عملية خاصة` | yes |
| `trainees.read` | `trainees` | `عرض` | no |
| `trainees.create` | `trainees` | `إضافة` | no |
| `coaching.read` | `coaching` | `عرض` | no |
| `coaching.create` | `coaching` | `إضافة` | no |
| `coaching.update` | `coaching` | `تعديل` | no |
| `coaching.delete` | `coaching` | `حذف` | no |
| `attendance.read` | `attendance` | `عرض` | no |
| `attendance.check_in` | `attendance` | `إضافة` | no |
| `attendance.check_out` | `attendance` | `تعديل` | no |
| `attendance.report` | `attendance` | `عملية خاصة` | no |
| `finance.read` | `finance` | `عرض` | no |
| `finance.create` | `finance` | `إضافة` | no |
| `finance.update` | `finance` | `تعديل` | no |
| `finance.delete` | `finance` | `حذف` | no |
| `reports.read` | `reports` | `عرض` | no |
| `reports.export` | `reports` | `تصدير` | no |
| `pricing.read` | `pricing` | `عرض` | no |
| `pricing.create` | `pricing` | `إضافة` | no |
| `pricing.update` | `pricing` | `تعديل` | no |
| `day_passes.read` | `day_passes` | `عرض` | no |
| `day_passes.create` | `day_passes` | `إضافة` | no |
| `day_passes.update` | `day_passes` | `تعديل` | no |
| `day_passes.delete` | `day_passes` | `حذف` | no |
| `day_passes.whatsapp` | `day_passes` | `عملية خاصة` | no |
| `library.read` | `library` | `عرض` | no |
| `library.create` | `library` | `إضافة` | no |
| `library.update` | `library` | `تعديل` | no |
| `library.delete` | `library` | `حذف` | no |
| `management.users.read` | `management` | `عرض` | yes |
| `management.users.create` | `management` | `إضافة` | yes |
| `management.users.update` | `management` | `تعديل` | yes |
| `management.users.status` | `management` | `عملية خاصة` | yes |
| `management.users.delete` | `management` | `حذف` | yes |
| `management.backup.read` | `management` | `عرض` | yes |
| `management.backup.create` | `management` | `إضافة` | yes |
| `management.backup.restore` | `management` | `عملية خاصة` | yes |
| `management.backup.delete` | `management` | `حذف` | yes |
| `feedback.read` | `feedback` | `عرض` | yes |
| `permissions.manage` | `permissions` | `إدارة` | yes |
| `branding.view` | `branding` | `عرض` | yes |
| `branding.edit` | `branding` | `تعديل` | yes |
| `branding.publish` | `branding` | `نشر` | yes |
| `branding.reset` | `branding` | `إدارة` | yes |
| `store.view` | `store` | `عرض` | no |
| `store.products.manage` | `store` | `إدارة` | no |
| `store.inventory.view` | `store` | `عرض` | no |
| `store.inventory.adjust` | `store` | `إدارة` | no |
| `store.sales.create` | `store` | `إضافة` | no |
| `store.sales.view` | `store` | `عرض` | no |
| `store.returns.manage` | `store` | `إدارة` | no |
| `store.purchases.manage` | `store` | `إدارة` | no |
| `store.suppliers.manage` | `store` | `إدارة` | no |
| `store.expenses.manage` | `store` | `إدارة` | no |
| `store.reports.view` | `store` | `عرض` | no |
| `store.profit.view` | `store` | `حساس` | no |
| `intelligence.read` | `intelligence` | `عرض` | no |
| `intelligence.generate` | `intelligence` | `إنشاء` | no |
| `saas.subscription.read` | `saas` | `عرض` | yes |
| `saas.subscription.request` | `saas` | `إدارة` | yes |
| `portal.analytics.read` | `portal` | `view` | yes |
| `branches.read` | `branches` | `view` | no |
| `branches.manage` | `branches` | `manage` | yes |
| `branches.access.manage` | `branches` | `manage` | yes |
| `inventory.locations.manage` | `inventory` | `manage` | yes |
| `inventory.transfers.read` | `inventory` | `view` | no |
| `inventory.transfers.manage` | `inventory` | `manage` | no |
| `bar.read` | `bar` | `view` | no |
| `bar.sell` | `bar` | `sell` | no |
| `bar.recipes.manage` | `bar` | `manage` | yes |
| `bar.shifts.manage` | `bar` | `manage` | no |
| `bar.waste.manage` | `bar` | `manage` | no |
| `member.subscription_requests.read` | `memberships` | `view` | yes |
| `member.subscription_requests.review` | `memberships` | `review` | yes |

## Mobile rule

Do not cache an entitlement as authority. On app bootstrap, tenant change, branch change, subscription change, permission change, and session refresh, mobile must revalidate/refresh the effective envelope. A stale cache may render a disabled screen but must never authorize a request.
