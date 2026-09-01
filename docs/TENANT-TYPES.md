# Tenant type foundation

Phase 1 adds tenant type as metadata on the existing `dbo.gym_tenants`
aggregate. The canonical values are `gym` and `independent_trainer`, exposed
to backend code through `src/tenancy/tenant-types.js`.

## Current behavior

- Existing tenants are backfilled to `tenant_type = 'gym'` by migration 014.
- Top Gym remains an ordinary Gym tenant; it has no tenant-type exception.
- All existing provisioning paths explicitly insert `gym`.
- Independent Trainer is recognized as a domain value and the currently
  shipped Trainer workspace domains are exposed only through guarded,
  tenant-scoped routes. Any baseline domain that has not shipped remains
  unavailable and fails closed.
- Tenant isolation remains `tenant_id` + trusted `SESSION_CONTEXT` + SQL
  Server RLS. `tenant_type` is not an RLS predicate.
- Tenant type is read-only in the PlatformAdmin DTOs. No mutation endpoint is
  exposed; changing it after provisioning requires a future audited process.

## Migration safety

`database/migrations/014-tenant-type-foundation.sql` is additive and
idempotent. It adds the column when absent, backfills only NULL/blank legacy
values, validates the allowed values, and adds the NOT NULL/default/check
contract without dropping tables, columns, constraints, or business rows.

The explicit migration must be applied before the application is considered
ready. Runtime tenant security readiness also requires the canonical
`tenant_type` column, so an old or mismatched database fails closed.

## Future extension point

Phase 2 adds the normalized `saas_plan_tenant_types` mapping. Effective
authorization is resolved from the trusted tenant type, compatible plan,
subscription lifecycle, plan limits, explicit tenant overrides, and user
permissions. Existing plans are mapped to `gym`; the Trainer-compatible
registration and currently shipped Trainer workspace domains use the same
mapping without duplicating billing. A plan compatibility change cannot
invalidate an active/trial subscription, and missing/invalid mapping metadata
fails closed.

The precedence is:

`tenant type baseline → implemented capability set → compatible active plan →
plan feature/limit snapshot → tenant override → user permission`.

Overrides cannot add an unimplemented capability, bypass subscription state,
or bypass role permissions. The frontend may consume the effective payload for
navigation/UX only; server-side enforcement remains authoritative. Trainer
routes currently cover the workspace, clients, assessments/measurements,
check-ins, shared training/nutrition plans, sessions, packages, payments,
reports and the existing tenant-private client portal path.
