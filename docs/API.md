# API reference

All application endpoints are under `/api`. Protected requests require the server session cookie. Existing response shapes are intentionally preserved; this document describes the route surface rather than replacing the contract with a new envelope.

## Health and authentication

| Method | Path | Access |
|---|---|---|
| GET | `/api/health/live` | Public liveness probe; no database access |
| GET | `/api/health` | Public health check; database connectivity is verified |
| GET | `/api/auth/session` | Public session probe |
| POST | `/api/auth/login` | Public; email and password |
| POST | `/api/auth/logout` | Public/session-aware |
| GET | `/api/auth/users` | Owner |
| POST | `/api/auth/users` | Owner |
| PUT | `/api/auth/users/:id` | Owner |
| PATCH | `/api/auth/users/:id/status` | Owner |
| DELETE | `/api/auth/users/:id` | Owner; يحذف Assistant فقط ويلغي جلساته وصلاحياته |

## Members and membership

`/api/members` supports list, details, single-member reads, create, update, freeze, resume, renew, membership creation and delete. The payment path is `/api/memberships/:id/payments`.

### Alert communication state

The WhatsApp reminder button records its workflow without claiming that the
external WhatsApp client confirmed delivery. The first request records that
WhatsApp was opened; the operator can then confirm that the message was sent.

```http
POST /api/members/:id/alert-communications
Content-Type: application/json

{
  "alertKind": "debt",
  "alertKey": "debt:3812:150.00",
  "status": "opened"
}
```

`alertKind` is one of `membership`, `debt`, or `inactive`; `status` is
`opened` or `sent`. Dashboard alerts and report tables return the same
`alertKey` plus `alertContact.status`, `openedAt`, `sentAt`, and `sendCount`.
The key stays stable while the underlying alert reason is unchanged, so a
reminder is not shown as new every day.

## Attendance

| Method | Path |
|---|---|
| GET | `/api/attendance` |
| GET | `/api/attendance/report` |
| GET | `/api/attendance/member/:id` |
| POST | `/api/attendance/check-in` |
| POST | `/api/attendance/check-out` |

## Daily passes / day classes

Daily passes are one-time visits and are intentionally stored separately from members and recurring memberships. They do not create a member record or change an existing subscription.

| Method | Path | Access |
|---|---|---|
| GET | `/api/day-passes/pricing` | Authenticated Owner/Assistant read access |
| PUT | `/api/day-passes/pricing` | Owner |
| GET | `/api/day-passes` | Authenticated Owner/Assistant |
| GET | `/api/day-passes/summary` | Authenticated Owner/Assistant |
| POST | `/api/day-passes` | Authenticated Owner/Assistant |
| PUT | `/api/day-passes/:id` | Owner |
| DELETE | `/api/day-passes/:id` | Owner |
| POST | `/api/day-passes/:id/whatsapp-opened` | Authenticated Owner/Assistant |
| POST | `/api/day-passes/:id/void` | Owner |

Create a visit with the visitor name, phone, configured type and payment method. The server resolves the current price and returns a prepared Arabic WhatsApp message; the browser opens WhatsApp only after the operator confirms the action.

```json
{
  "visitorName": "أحمد محمد",
  "visitorPhone": "01012345678",
  "passTypeCode": "day_gym_cardio",
  "paymentMethod": "cash"
}
```

## Coaching and nutrition

The coaching routes cover external trainees, clients, measurements, check-ins, workout programs, diet plans, workout sessions and meal logs. Both legacy program aliases remain supported:

- `/api/workoutprograms` and `/api/workout-programs`
- `/api/dietplans` and `/api/diet-plans`

Workout session paths are under `/api/workoutsessions`; meal logs are under `/api/meal-logs`.

## Finance and pricing

| Method | Path |
|---|---|
| GET | `/api/monthly-finance` |
| POST/PUT/DELETE | `/api/expenses` and `/api/expenses/:id` |
| GET | `/api/pricing` |
| PUT | `/api/pricing` and `/api/pricing/:planCode` |
| POST/PUT | `/api/pricing-plans` and `/api/pricing-plans/:planCode` |
| POST/PUT | `/api/membership-types` and `/api/membership-types/:typeCode` |

## Library and reports

| Method | Path |
|---|---|
| GET | `/api/library/options` |
| GET | `/api/library/:type` and `/api/library/:type/:id` |
| POST/PUT/DELETE | `/api/library/:type` and `/api/library/:type/:id` |
| GET | `/api/reports` |
| GET | `/api/dashboard` |
| GET | `/api/dashboard-analytics` |
| GET | `/api/bootstrap` |

## Member portal and feedback

The portal is public and does not use the administration session. A member must
present the active membership code in the request body; the server hashes the
code, resolves `member_id`, and returns only that member's sanitized portal
data.

| Method | Path | Access |
|---|---|---|
| POST | `/api/member-portal/lookup` | Public; active membership code required |
| POST | `/api/member-portal/feedback` | Public; active membership code required; rate limited |
| GET | `/api/member-feedback` | Owner only |

Submit a portal rating:

```http
POST /api/member-portal/feedback
Content-Type: application/json

{
  "membershipCode": "TG-XXXX-XXXX-XXXX-XXXX",
  "rating": 5,
  "noteType": "suggestion",
  "message": "التجربة ممتازة ونقترح إضافة حصة صباحية."
}
```

`noteType` is one of `general`, `problem`, `complaint`, `suggestion`, or
`feature_request`. The Owner list supports `rating`, `noteType`, `from`, `to`,
`search`, `page`, and `pageSize` query filters. The feedback table stores only
`member_id`, rating, type, message, and UTC submission time; it does not store
the membership code.

## Backup

| Method | Path | Access |
|---|---|---|
| GET | `/api/backup/daily` | Authorized cron request |
| GET | `/api/backup/download` | Owner |
| GET | `/api/backup/history` | Owner |
| GET | `/api/backup/archives/:id` | Owner |
| DELETE | `/api/backup/archives/:id` | Owner |
| POST | `/api/backup/inspect` | Owner; raw upload |
| POST | `/api/backup/restore` | Owner; raw upload |

## SaaS control plane

SaaS subscriptions are separate from the memberships sold by each gym to its
members. Tenant requests use the authenticated Owner session; platform routes
use a separate `PlatformAdmin` account created from the platform environment
variables. For API clients that can access more than one gym, send
`X-Gym-Slug` so the server resolves `slug -> tenant_id -> RLS context`.

Plan responses include `compatibleTenantTypes`, resolved from the platform
control-plane mapping `saas_plan_tenant_types`. Tenant billing responses also
include the backend-derived `tenantType`, effective capabilities and effective
limits. These are presentation data; every operational request is independently
validated against tenant isolation, subscription state, capability and user
permission on the server.

| Method | Path | Access |
|---|---|---|
| GET | `/api/saas/subscription` | Tenant Owner |
| GET | `/api/saas/plans` | Tenant Owner |
| GET | `/api/saas/subscription-requests` | Tenant Owner |
| POST | `/api/saas/subscription-requests` | Tenant Owner |
| POST | `/api/saas/subscription-requests/:id/proof` | Tenant Owner; raw image/PDF up to 4 MB |
| GET | `/api/saas/payment-proofs/:id/file` | Tenant Owner |
| GET | `/api/platform-admin/dashboard` | PlatformAdmin |
| GET/POST | `/api/platform-admin/tenants` | PlatformAdmin |
| GET/PATCH | `/api/platform-admin/tenants/:tenantId` | PlatformAdmin |
| GET/PATCH | `/api/platform-admin/tenants/:tenantId/subscription` | PlatformAdmin |
| PATCH | `/api/platform-admin/tenants/:tenantId/status` | PlatformAdmin |
| PATCH | `/api/platform-admin/tenants/:tenantId/plan` | PlatformAdmin |
| GET/PUT | `/api/platform-admin/tenants/:tenantId/overrides` | PlatformAdmin |
| GET | `/api/platform-admin/tenants/:tenantId/usage` | PlatformAdmin |
| GET | `/api/platform-admin/tenants/:tenantId/users` | PlatformAdmin |
| GET | `/api/platform-admin/tenants/:tenantId/health` | PlatformAdmin |
| GET | `/api/platform-admin/tenants/:tenantId/audit` | PlatformAdmin |
| GET/POST | `/api/platform-admin/tenants/:tenantId/notes` | PlatformAdmin |
| GET | `/api/platform-admin/plans` | PlatformAdmin |
| PATCH | `/api/platform-admin/plans/:planId` | PlatformAdmin |
| GET | `/api/platform-admin/subscription-requests` | PlatformAdmin |
| POST | `/api/platform-admin/subscription-requests/:id/approve` | PlatformAdmin |
| POST | `/api/platform-admin/subscription-requests/:id/reject` | PlatformAdmin |
| GET | `/api/platform-admin/payment-methods` | PlatformAdmin; active and inactive Logic Fit payment methods |
| POST | `/api/platform-admin/payment-methods` | PlatformAdmin; create a Logic Fit payment method |
| PATCH | `/api/platform-admin/payment-methods/:methodId` | PlatformAdmin; edit, reorder or deactivate a Logic Fit payment method |
| GET | `/api/platform-admin/payment-proofs/:id/file` | PlatformAdmin; private inline response |
| GET | `/api/platform-admin/audit` | PlatformAdmin |
| GET | `/api/platform/overview` | PlatformAdmin |
| GET/POST | `/api/platform/tenants` | PlatformAdmin |
| GET/PATCH | `/api/platform/plans` and `/api/platform/plans/:id` | PlatformAdmin |
| GET | `/api/platform/subscription-requests` | PlatformAdmin |
| POST | `/api/platform/subscription-requests/:id/approve` | PlatformAdmin |
| POST | `/api/platform/subscription-requests/:id/reject` | PlatformAdmin |
| GET | `/api/platform/payment-proofs/:id/file` | PlatformAdmin |
| GET | `/api/platform/audit` | PlatformAdmin |

## Independent Trainer workspace

Trainer routes are available only when the server-resolved tenant is an
`independent_trainer` tenant with an active/trial subscription, compatible
plan entitlements and the authenticated user's permissions. The frontend
does not provide the security boundary.

| Method | Path | Access |
|---|---|---|
| GET | `/api/trainer/workspace` | Independent Trainer Owner/authorized user |
| GET | `/api/trainer/reports/summary` | Independent Trainer; reports read |
| GET/POST | `/api/trainer/clients` | Independent Trainer; coaching permission |
| GET/PATCH/DELETE | `/api/trainer/clients/:id` | Independent Trainer; coaching permission |
| GET/POST/PATCH/DELETE | `/api/trainer/clients/:id/measurements` | Independent Trainer; coaching permission |
| GET/POST/PATCH/DELETE | `/api/trainer/clients/:id/checkins` | Independent Trainer; coaching permission |
| GET/PATCH/DELETE | `/api/trainer/training-plans/:id` | Independent Trainer; coaching permission |
| GET/PATCH/DELETE | `/api/trainer/nutrition-plans/:id` | Independent Trainer; coaching permission |
| GET/POST/PATCH | `/api/trainer/packages` | Independent Trainer; coaching permission |
| GET/POST | `/api/trainer/package-purchases` | Independent Trainer; coaching permission |
| GET/POST | `/api/trainer/payments` and `/api/trainer/package-purchases/:id/payments` | Independent Trainer; finance/payment permission |
| POST | `/api/trainer/package-purchases/:id/refunds` | Independent Trainer; refund permission |
| GET/POST/PATCH | `/api/trainer/sessions` | Independent Trainer; coaching permission |
| PATCH | `/api/trainer/sessions/:id/status` | Independent Trainer; coaching permission |
| GET/POST/PATCH/DELETE | `/api/trainer/goals` and `/api/trainer/goals/:id` | Independent Trainer; coaching permission; tenant/client scoped |
| GET | `/api/trainer/notifications` | Independent Trainer; coaching permission; derived action center |
| GET/POST/PATCH | `/api/trainer/tasks` and `/api/trainer/tasks/:id` | Independent Trainer; coaching permission; tenant/client scoped action center |
| POST | `/api/trainer/tasks/:id/dismiss` | Independent Trainer; coaching update permission; soft-dismisses a task |
| GET/POST/PATCH | `/api/trainer/templates` and `/api/trainer/templates/:id` | Independent Trainer; coaching permission; tenant scoped |
| POST | `/api/trainer/templates/:id/instantiate` | Independent Trainer; coaching permission; training/nutrition templates only |

Platform payment methods are stored in `saas_platform_payment_methods` and are
the source for the public `/register-gym` catalog. They are intentionally
separate from tenant member-payment methods, which remain in the published
tenant identity configuration and are returned only through the authenticated
member-portal flow.

When a trial or paid SaaS subscription expires, tenant APIs return
`402 SAAS_SUBSCRIPTION_REQUIRED` while the subscription/recovery endpoints
remain available. Existing tenant data is retained.

## Error behavior

Authentication and authorization retain `401` for missing/expired sessions and `403` for forbidden actions. Do not expose SQL, stack traces, credentials or connection strings in production responses.
