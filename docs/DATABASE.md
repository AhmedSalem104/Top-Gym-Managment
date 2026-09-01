# Database architecture

## Engine and access

The project uses Microsoft SQL Server through the `mssql` package. `src/database/pool.js` owns one reusable connection pool and parses the server-side connection string. `src/database/transaction.js` provides the transaction boundary helper.

`database/schema.sql` remains the primary idempotent schema source. Runtime compatibility setup still exists in selected services because the application has historically upgraded existing installations without destructive migrations.

## Main tables

- `members`: member identity and contact data.
- `memberships`: plan, type, start/end dates and notes.
- `membership_pricing`, `membership_types`, `membership_type_prices`: catalog and price configuration.
- `membership_freezes`: freeze periods and resume state.
- `gym_payments`, `gym_payment_transactions`: current payment summary and immutable payment events.
- `gym_expenses`: expenses and monthly summaries.
- `gym_attendance`: check-in/check-out records.
- `gym_day_pass_types`: configurable one-day class/pass types. The initial seed is 30 EGP for gym-only and 40 EGP for gym plus cardio.
- `gym_day_pass_sales`: one-time visitor sales, payment method, price snapshot, visit date and WhatsApp-open audit timestamp. These rows are separate from member subscriptions and are included in income/report calculations.
- `gym_alert_communications`: one latest WhatsApp contact state per member, alert kind and stable alert key. It records when WhatsApp was opened, when the operator confirmed sending, and the number of confirmed sends.
- `membership_events`: membership audit events.
- `gym_users`, `gym_auth_sessions`: authentication and sessions.
- `gym_exercises`, `gym_foods`, `gym_muscles`: library catalogs.
- `workout_programs`, `workout_routines`, `workout_exercises`, `workout_sessions`, `workout_set_logs`: training programs and execution.
- `diet_plans`, `diet_meals`, `diet_meal_items`, `meal_logs`: nutrition plans and logs.
- `body_measurements`: coaching measurements.
- `gym_backup_operations`, `gym_backup_archives`: backup history and stored archives.

## Rules

- Use parameterized SQL through `mssql` request inputs.
- Do not concatenate user values into SQL.
- Reuse the pool; do not connect per request.
- Keep daily pass prices server-owned and resolve the amount from `gym_day_pass_types`; never trust a client-supplied amount.
- Use a transaction for multi-table operations that must be atomic.
- Add indexes only after reviewing query patterns and execution plans.
- Keep existing table/column names unless a separate migration is approved.
- Do not expose password hashes, session token hashes or backup secrets.

## Repository status

Current explicit repository boundaries are member list/details reads, expenses/monthly finance, authentication users and authentication sessions. Large legacy services still contain SQL for their own domain and are the next incremental extraction targets.

## Multi-tenant foundation

The application now uses `gym_tenants` as the gym/organization record and `gym_user_tenants` as the account-to-gym membership map. The existing installation was bootstrapped as:

- name: `Top Gym`
- slug: `top-gym`
- tenant_type: `gym`
- status: `active`

All current operational rows are assigned to this tenant through a non-null `tenant_id`. Credentials and sessions remain global so the server can resolve the account before applying the gym context.

`src/tenancy/tenant-context.js` stores the request tenant with `AsyncLocalStorage`. `src/database/pool.js` writes that context to SQL Server `SESSION_CONTEXT` before every query/batch, and `tenant-service.js` installs a SQL Server Row-Level Security policy over every tenant-owned table. This protects reads, updates and inserts even where legacy services do not yet include an explicit `tenant_id` predicate.

Run `npm run migrate:tenancy` to apply the idempotent bootstrap/migration manually. Before an authorized environment is considered ready, run `npm run qa:rls` for the schema-driven RLS contract and then `npm run qa:tenancy` for unassigned rows, Top Gym ownership and cross-tenant read/write blocking.

The Phase 0 security migration (`013-phase0-security-preconditions.sql`) makes
the forced-password columns part of the canonical schema. It is additive and
idempotent; the runtime compatibility DDL remains only as a guarded bridge for
older installations. Tenant API readiness also requires the live auth/session
schema contract, the schema-bound tenant predicate function, an enabled policy,
and complete metadata-discovered coverage. A database that does not satisfy
that contract fails closed with `TENANT_ISOLATION_NOT_READY`.

Migration `014-tenant-type-foundation.sql` adds the canonical tenant type to
the existing tenant aggregate. Existing rows are safely backfilled to
`gym`; `independent_trainer` is reserved for a later approved product phase
and is not operationally enabled yet. Tenant type is metadata only and never
replaces `tenant_id`-based RLS.

## SaaS control plane

SaaS billing is a separate domain from gym-member memberships. The platform
uses these independent tables:

- `saas_plans`: platform plans such as Starter, Pro and Enterprise.
- `saas_plan_tenant_types`: normalized plan compatibility mapping. Existing
  plans are seeded for `gym`; this table is platform-scoped and does not
  participate in tenant RLS.
- `saas_tenant_subscriptions`: the active/trial subscription owned by a gym tenant.
- `saas_subscription_requests`: manual upgrade/renewal requests.
- `saas_payment_proofs`: one image/PDF proof per request, limited to 4 MB.
- `saas_audit_log`: platform onboarding, review, activation and status events.

`saas_plans` is platform-scoped. `saas_audit_log` is dual-scope: tenant events
carry `tenant_id` and are protected by the same SQL Server RLS policy, while
platform events intentionally use `NULL` and are available only in platform
context. The other SaaS tables are tenant-scoped and covered by that policy.
The runtime schema is idempotently provisioned by `src/services/saas-service.js`
and by `npm run migrate:tenancy`; the schema-driven `qa:rls` gate is the source
of truth for whether the live policy contract is ready.

The default Top Gym tenant receives an Enterprise bootstrap subscription so
the existing installation remains available. New tenants receive a 14-day
Starter trial, an Owner account and an isolated tenant context. When a trial
or subscription expires, access is blocked at the authentication middleware;
the billing/recovery endpoints remain available so the Owner can submit a new
manual payment request without deleting gym data.
