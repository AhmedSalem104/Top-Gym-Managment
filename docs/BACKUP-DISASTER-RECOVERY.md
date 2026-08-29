# Logic Fit Backup & Disaster Recovery

## Status and scope

This document describes the current Backup/DR implementation in Logic Fit. It
is an additive recovery layer over the existing SQL Server, Express, session,
tenant and RLS architecture. It does not claim that a production object-storage
provider, a native SQL Server full backup, or a real isolated restore rehearsal
is active until those dependencies are configured and verified.

Current implementation status:

- Tenant logical backup: `IMPLEMENTED` and locally covered by unit/source tests.
- Platform logical DR export: `IMPLEMENTED` as a separate platform-scoped
  artifact; native database backup capability is still an infrastructure
  verification item.
- Tenant isolation and trusted context: `VERIFIED` locally through registry,
  RLS and authorization checks; authenticated A/B attack testing remains a
  staging requirement.
- Private object-storage contract: `VERIFIED` locally; provider activation is
  `BLOCKED` until an approved private provider and credentials are supplied.
- Tenant restore: `IMPLEMENTED` with checksum/manifest validation, a mandatory
  pre-restore safety backup and transactional tenant-scoped writes; a real
  isolated restore rehearsal is `BLOCKED` pending a safe environment.
- Platform restore: runbook/strategy only. No dangerous full-platform restore
  button is exposed to Owners.

## Architecture discovered

The application uses a shared SQL Server database with `tenant_id`, SQL Server
Row-Level Security and an AsyncLocalStorage tenant context. `PlatformAdmin`
uses platform scope (`tenant_id = NULL`) and must provide an explicit target
tenant for tenant operations. `top-gym` is an ordinary tenant and is never a
backup fallback.

The recovery layer consists of:

- `src/services/backup-registry.js`: the authoritative registry of tenant-owned
  tables and explicit control-plane exclusions.
- `src/services/backup-recovery-service.js`: artifact creation, validation,
  integrity, metadata state, retention, daily orchestration and tenant restore.
- `src/services/object-storage-service.js`: private tenant/platform storage
  contract with validated keys and no public URL API.
- `gym_backup_records`: tenant backup metadata and lifecycle state.
- `gym_backup_audit_log`: tenant backup/restore events.
- `gym_platform_backup_records`: platform-scope artifact metadata.
- `gym_platform_backup_audit_log`: platform Backup/DR events.

The legacy `gym_backup_archives` and `gym_backup_operations` tables remain only
for compatibility with old schema/data. New persistent recovery records are
stored in the new metadata tables and artifacts are not stored in `public/` or
in the Vercel filesystem.

## Tenant backup flow

1. The authenticated Owner or the platform scheduler resolves a trusted tenant
   context. A client-provided tenant id cannot override the active tenant.
2. The service claims a metadata row. `tenant_daily` is unique by
   `tenant_id + backup_type + backup_day`; stale `RUNNING` work can be retried.
3. The registry is read with explicit columns, bounded table concurrency and
   an explicit `tenant_id` predicate.
4. A versioned gzip JSON artifact is created with a manifest containing the
   tenant reference, application/schema/registry versions, table counts and
   SHA-256 content integrity.
5. The compressed artifact is sent to the private tenant storage adapter under
   `tenants/{tenant_id}/private/backups/...`.
6. Size, existence and checksum are verified. Only then is the record marked
   `VERIFIED` and made downloadable.
7. Failures are isolated to the tenant, recorded with a safe error code and
   remain retryable. Secrets, passwords and sessions are not part of a tenant
   artifact.

The registry currently covers member, membership, payment, attendance,
coaching, nutrition, measurements, intelligence, expenses, store, branding,
permissions and tenant-owned library data, including the tenant's own
`gym_user_tenants` mappings. SaaS control-plane records and backup metadata are
explicitly excluded from tenant restore and are represented by the platform
backup inventory.

## Platform DR flow

The daily scheduler enters platform scope, enumerates eligible tenants and
processes tenant backups with bounded concurrency and independent retry. A
tenant failure does not stop other tenants. It then creates one separate
`platform_daily` artifact containing:

- platform tenant/user/control-plane metadata;
- SaaS plans, subscriptions, requests, payment-proof metadata, overrides,
  changes, notes and platform audit data;
- all registered tenant-owned rows grouped under a `tenant` section;
- no password hashes, salts, session tokens, API keys or secret columns.

The current platform artifact is a verified logical export, not a native SQL
Server `.bak` database backup. The `bak` format label is retained only for
compatibility and still contains the gzip logical format. A native full backup
or a provider-supported equivalent must be selected and tested before claiming
full disaster-recovery coverage.

Private tenant files that are stored outside SQL Server require the configured
storage provider to support a second platform/off-site copy. The current
repository provides the key and adapter contract but does not pretend that
off-site replication is active without provider configuration.

## Artifact format and integrity

Tenant artifacts use `format = logic-fit-tenant-backup` and version `2`.
Platform artifacts use `format = logic-fit-platform-backup` and the same
version. Each manifest carries:

- `applicationVersion`, `schemaVersion` and registry version;
- backup type and UTC creation time;
- tenant id for tenant artifacts;
- per-table counts and total row count;
- `excludesSecrets` for platform exports where applicable;
- SHA-256 over the serialized table sections;
- SHA-256 over the final compressed artifact in metadata/storage verification.

Upload and restore reject unsupported versions, unknown tables, missing tenant
ownership, foreign-tenant rows, mismatched counts and checksum tampering.
Restore additionally requires the current tenant registry to be fully present,
so an old partial artifact cannot silently erase newly introduced tenant data.

## Storage and private access

`ObjectStorageService` exposes `put`, `get`, `head`, `delete` and signed-download
contracts for tenant and platform scopes. Keys are generated server-side,
contain no original path, reject traversal/absolute paths and are checked again
on every read/delete. Private objects do not expose a permanent public URL.

Until an approved provider adapter is configured, writes fail closed with a
safe `OBJECT_STORAGE_PROVIDER_NOT_CONFIGURED` error. This is intentional:
local/Vercel temporary files are not treated as durable production backups.
Provider activation requires private access, encryption at rest/in transit,
tenant prefixes, signed URLs, MIME/size enforcement, checksum metadata,
deletion/reconciliation and an isolated recovery test.

## Backup state, retention and scheduling

Records use:

`PENDING → RUNNING → UPLOADED → VERIFYING → VERIFIED`

with `FAILED`, `EXPIRED` and `DELETED` terminal/cleanup states as applicable.
Metadata includes safe status, counts, size, checksum, timestamps, attempt
count and expiry; storage keys are not returned in ordinary API responses.

The authorized `/api/backup/daily` cron route is the only intentional
state-changing GET. It requires the configured cron secret in production and
does not resolve `top-gym` as a default tenant. Scheduler work is idempotent at
the database level and uses bounded concurrency. Normal history/status/download
reads never seed, sync, migrate or initialize schema. An explicit download may
create only its dedicated audit event.

Default retention is configurable through environment variables:

- tenant daily/manual/pre-restore: 30 days;
- platform daily/manual: 30 days;
- platform weekly: 84 days;
- platform monthly: 365 days.

Retention cleanup first marks an eligible artifact expired, deletes the private
object, verifies the database transition, and leaves a retryable `EXPIRED`
record when storage/database steps partially fail. Weekly/monthly scheduling
is not claimed merely because retention values exist; only the daily cycle is
currently wired to the existing scheduler.

## Tenant restore runbook

Tenant restore is an Owner-authorized logical restore, not a SQL Server full
database restore:

1. Authenticate and resolve the active trusted tenant.
2. Confirm the backup belongs to that tenant and is `VERIFIED`.
3. Recheck the compressed artifact checksum and manifest.
4. Require an explicit confirmation header and a non-empty reason.
5. Create a mandatory `tenant_pre_restore` safety backup. Restore fails closed
   if that safety copy cannot be verified in private storage.
6. Acquire a database application lock for the tenant.
7. Delete and restore only registered tenant-scoped rows in foreign-key order
   within one transaction.
8. Validate per-table counts, commit, and write `RESTORE_COMPLETED`.
9. On any failure, roll back the transaction and write `RESTORE_FAILED`.

Concurrent restore/backup work for the same tenant is rejected by the
database-level application lock. Assistant restore is not granted by the
Owner route permissions. Files outside SQL Server require provider-aware
staged validation before any replacement; that production integration remains
pending.

## Platform disaster recovery runbook

Platform recovery must be performed by PlatformAdmin/infrastructure operators
in an isolated maintenance environment:

1. Enter maintenance/recovery mode and preserve the incident/request id.
2. Obtain the latest verified platform artifact and its checksum from private
   storage plus the off-site copy when configured.
3. Restore the database using the provider-supported native backup or verified
   logical import strategy. Never restore over Production during rehearsal.
4. Restore private files and verify object checksums and tenant prefixes.
5. Run migrations/compatibility checks in the approved order.
6. Validate schema, RLS, tenant isolation, SaaS control plane, critical
   relationships and application health.
7. Re-provision/reset credentials because platform exports intentionally omit
   password hashes, salts, sessions and secrets; load secrets from secret
   management, never from the artifact.
8. Record the recovery result and only then return the platform online.

No RPO/RTO or uptime SLA is claimed until a real isolated restore rehearsal has
measured them. Daily artifacts provide a policy target, not proof of a one-day
RPO.

## Permissions and audit

Owner permissions cover tenant history, manual creation, verified download,
explicit restore and deletion. PlatformAdmin-only routes under
`/api/platform-admin/...` cover platform history/health, tenant-targeted
manual backup and platform cleanup. PlatformAdmin operations require an
explicit target tenant for tenant actions and are audited.

Sensitive events include:

- `BACKUP_CREATED`, `BACKUP_FAILED`, `BACKUP_VERIFIED`,
  `BACKUP_DOWNLOADED`, `BACKUP_DELETED`;
- `RESTORE_REQUESTED`, `RESTORE_COMPLETED`, `RESTORE_FAILED`;
- `PLATFORM_BACKUP_STARTED`, `PLATFORM_BACKUP_COMPLETED`,
  `PLATFORM_BACKUP_FAILED`, `PLATFORM_BACKUP_DOWNLOADED` and cleanup events.

Audit records contain actor, tenant/backup reference, bounded reason, result
and safe metadata only. They never contain backup content, credentials, signed
URLs, SQL text, stack traces or sensitive member data.

## Performance and safety considerations

- Explicit column projections avoid `SELECT *` in the new backup engine.
- Table reads use bounded concurrency and do not load multiple copies of a
  table into parallel worker processes.
- Tenant and platform records claim work before artifact creation to avoid
  duplicate scheduler work.
- Restore uses short metadata/claim transactions and one controlled tenant
  restore transaction; the application lock prevents overlapping recovery.
- Uploads are size-limited at 25 MiB compressed / 80 MiB JSON and 150,000 rows
  by default. Larger production backups need a streaming/chunked design and
  an explicit capacity decision; these limits are safety gates, not capacity
  claims.
- No backup operation is hidden behind a dashboard/history GET.

## Local tests and current evidence

The recovery implementation has local unit/source coverage for:

- checksum, manifest, version and cross-tenant row validation;
- complete registry enforcement on restore;
- bounded concurrency and retention defaults;
- private tenant/platform key separation and provider fail-closed behavior;
- read-only path safety and route contracts;
- migration safety, RLS/tenant QA, platform-admin contracts and build syntax.

Run the relevant checks from the repository:

```text
npm run test:unit
npm run qa:database
npm run qa:tenancy
npm run qa:platform-admin
npm run qa:gate
npm run build
```

The exact result for the current commit is recorded in the hand-off summary
and `qa/reports/` generated by the commands. No real provider upload, native
SQL backup, isolated restore, authenticated cross-tenant attack matrix or
production scheduler execution is represented as locally verified.

## Verification debt and required production configuration

The central debt file remains authoritative:
`docs/PRODUCTION-VERIFICATION-DEBT.md`.

Backup-specific outstanding items are:

| Item | Status | Evidence needed |
| --- | --- | --- |
| Approved private object-storage provider | `BLOCKED` | Configure credentials outside Git; test private tenant/platform objects, signed access, deletion and off-site copy. |
| Native SQL Server backup or equivalent | `REQUIRES PRODUCTION VERIFICATION` | Confirm provider capability and run a non-destructive restore rehearsal in an isolated target. |
| Tenant restore rehearsal | `BLOCKED` | Restore a synthetic verified artifact into isolated Staging and verify relationships, files, RLS and login/access. |
| Daily cron execution | `REQUIRES PRODUCTION VERIFICATION` | Configure `CRON_SECRET`, verify scheduler invocation, duration, retry and health reporting. |
| Authenticated Tenant A/B backup attack matrix | `REQUIRES STAGING VERIFICATION` | Test list/download/restore/ids/tenant changes with synthetic credentials. |
| RPO/RTO | `PENDING REAL-WORLD EVIDENCE` | Measure from a real isolated restore rehearsal; do not infer from daily schedule. |

## Relevant changes

- `16e32d0 backup: add tenant registry and recovery metadata`
- `45ccd8e backup: add tenant and platform recovery foundation`
- Current working change: owner recovery UI, platform controls, restore safety,
  audit/download handling, QA contracts and this runbook.

This report deliberately recommends **No-Go for a production backup/DR claim**
until the Critical provider and restore evidence is available. It does not
block continued local implementation or testing of unrelated production-readiness work.
