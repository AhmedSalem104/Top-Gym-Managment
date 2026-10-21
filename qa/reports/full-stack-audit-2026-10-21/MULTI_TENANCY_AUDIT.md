# Multi-tenancy and isolation audit

## Confirmed architecture

- `docs/ARCHITECTURE.md`: gym tenant requests resolve slug/auth membership to tenant context before SQL Server RLS; platform operations run without default tenant context and must supply explicit `tenant_id` for tenant-scoped operations.
- `src/database/pool.js` reads `getTenantContext()` and, unless explicitly skipped, sets SQL Server session context (`tenant_id`, `tenant_mode`) before every query/batch. Missing tenant mode defaults to `deny`; invalid/missing IDs are not silently replaced by a default tenant.
- Route composition separates `/api/platform-admin/*` from tenant gym operations; older `/api/platform/*` compatibility aliases remain.
- `docs/AGENTS.md` SQL inspection rule requires authenticated tenant/session context for any direct tenant data check and warns that no-context RLS results can be misleading.

## Risks / evidence gaps

- Static architecture does not prove every raw connection, transaction, platform service, background job or storage key establishes correct scope. Audit all `skipSessionContext` usages and tenant context entry points before asserting universal coverage.
- No cross-tenant, cross-branch, role/capability, cache-key, export/download, or platform-admin authorization tests were run.
- Optional cache gateway keys/namespace exist; actual enabled state and tenant/user/branch/scope key dimensions are NOT VERIFIED. Shared caching of sensitive member/finance data would be inappropriate absent private, partitioned controls.
- SQL Server RLS policy definitions and deployed session context were not queried. Migration ledger and deployed database identity were not accessed.

## Required isolated verification

Use two approved synthetic tenants/users with deliberately distinct sentinel records. Exercise read/list/search/export and mutation authorization across tenants/branches/sections, then account switch/logout and cache invalidation. Capture resolved tenant mode and database identity through existing safe diagnostics. Never infer absence from an unscoped query. No such test was performed here.
