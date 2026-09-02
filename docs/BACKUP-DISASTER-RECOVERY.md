# Logic Fit Backup & Disaster Recovery

## Status and scope

This document describes the current Backup/DR implementation in Logic Fit. It
is an additive recovery layer over the existing SQL Server, Express, session,
tenant and RLS architecture. It does not claim that a production object-storage
provider, a native SQL Server full backup, or a real isolated restore rehearsal
is active until those dependencies are configured and verified.

Current implementation status:

- Tenant logical backup: `IMPLEMENTED` and locally covered by unit/source tests,
  including complete-registry, manifest, checksum and sensitive-column checks.
- Platform logical DR export: `IMPLEMENTED` as a separate platform-scoped
  artifact; native database backup capability is still an infrastructure
  verification item.
- Tenant isolation and trusted context: `VERIFIED` locally through registry,
  RLS and authorization checks; authenticated A/B attack testing remains a
  staging requirement.
- Private object-storage contract: `VERIFIED` locally; a MinIO/private bucket
  and restricted application policy are provisioned on the VPS, while HTTPS
  endpoint/Vercel activation remains a production verification item.
- New branding and SaaS payment-proof uploads use the same private storage
  boundary when configured; legacy SQL-backed bytes remain readable and are
  not moved by the metadata migration.
- Local private filesystem adapter: `IMPLEMENTED` for isolated
  `local`/`development`/`test` rehearsals only. It is never accepted in
  `staging` or `production` and is not durable off-site storage.
- Tenant restore: `IMPLEMENTED` with checksum/manifest/registry validation, a mandatory
  pre-restore safety backup and transactional tenant-scoped writes; a real
  isolated restore rehearsal is `BLOCKED` pending a safe environment.
- Platform application-level restore: `IMPLEMENTED` for the explicit local/test
  rehearsal path, including legacy pre-Trainer source schemas. No dangerous
  full-platform restore button is exposed to Owners.

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
6. Size, existence, checksum, gzip contents and the complete manifest/registry
   are verified. Only then is the record marked `VERIFIED` and made downloadable.
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
- no password hashes, session tokens, API keys or secret columns. Every
  `tenant_id` reference in both the global control-plane section and tenant
  sections is checked against the exported tenant catalog.

The current platform artifact is a verified logical export, not a native SQL
Server `.bak` database backup. Native `.bak` requests fail closed so a logical
gzip artifact can never be mislabeled as a native database backup. The current
MonsterASP Free plan does not provide a downloadable native `.bak`; the
application-level path below is therefore the supported rehearsal mechanism.

### Legacy source-schema compatibility

Platform DR v3 is source-schema aware. It supports both the current
`modern-phase3-8` schema and the deployed `legacy-pre-trainer` schema used by
the Gym application before `tenant_type` and the Trainer tables were added.
Legacy backup creation does not require or write `gym_tenants.tenant_type`.

On a legacy source, the classifier reviews every physical application table
and assigns it to `GLOBAL_REQUIRED`, `TENANT_REQUIRED`, `LEGACY_REQUIRED`,
`REFERENCE_REQUIRED`, or an explicit exclusion. Legacy `TenantId` and modern
`tenant_id` spellings are both recognized. Where a legacy table has no direct
tenant column, ownership is derived only from reviewed foreign-key
relationships; unreviewed tables remain `UNKNOWN` and fail the coverage gate.
Legacy GUID-backed or nullable tenant references are preserved as source data;
they are not coerced to modern integer tenant ids during read-only export.

The legacy manifest records the source generation, whether `tenant_type` was
present, Trainer table presence/absence, physical table count, included and
explicitly excluded counts, classification reasons, and `unknown`/
`unexplained` counts. The expected absent pre-Trainer objects
(`saas_plan_tenant_types`, `trainer_client_profiles`, `trainer_packages`,
`trainer_package_purchases`, `trainer_package_usage`, and `coaching_sessions`)
are compatibility metadata, not coverage failures. Historical legacy business
tables such as appointments, memberships, payments, training, nutrition,
store, financial history, permissions, and audit history remain recoverable.

For a legacy source, the required coverage equation is:

`physical application tables = included required tables + explicit exclusions`

The platform artifact is created under trusted platform read-only context so
RLS/session context cannot silently reduce a tenant's exported rows. Counts and
tenant-group coverage must be compared against the source before the artifact
is accepted. This logical artifact remains distinct from a physical SQL Server
backup and must be restored only through a documented application-level
recovery/bootstrap process.

Private tenant files that are stored outside SQL Server require the configured
storage provider to support a second platform/off-site copy. The current
repository provides the key and adapter contract but does not pretend that
off-site replication is active without provider configuration.

## Artifact format and integrity

Tenant artifacts use `format = logic-fit-tenant-backup` and version `2`.
Platform artifacts use `format = logic-fit-platform-backup` and version `3`.
Each manifest carries:

- `applicationVersion`, `schemaVersion` and registry version;
- backup type and UTC creation time;
- tenant id for tenant artifacts;
- canonical tenant type metadata for tenant artifacts;
- per-table counts and total row count;
- `excludesSecrets` for platform exports where applicable;
- SHA-256 over the serialized table sections;
- SHA-256 over the final compressed artifact in metadata/storage verification.

Only the verified logical `json.gz` format is accepted by the service. Upload
and restore reject unsupported versions, unknown tables, missing tenant
ownership, foreign-tenant rows, mismatched counts and checksum tampering.
Restore additionally requires the current tenant registry to be fully present,
so an old partial artifact cannot silently erase newly introduced tenant data.
Download also rejects malformed or expired metadata before private bytes are
returned, even if retention cleanup has not run yet.

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

Platform Backup Health reports the latest platform artifact, latest verified
artifact, scheduled weekly/monthly policy, restore-rehearsal evidence when a
real audit event exists, off-site provider status, recent platform failures,
and a live catalog check for tenant-scoped tables that are missing from the
backup registry. Missing rehearsal or off-site evidence is shown as pending;
it is never inferred from artifact creation alone.

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

Retention cleanup first claims an eligible artifact with the database marker
`BACKUP_DELETE_IN_PROGRESS` (with stale-claim recovery), marks it expired,
deletes the private object, verifies the database transition, and leaves a
retryable `EXPIRED` record when storage/database steps partially fail. The daily Vercel invocation
also schedules `platform_weekly` on UTC Sundays and `platform_monthly` on the
first UTC day of the month. Both are configurable through
`BACKUP_ENABLE_PLATFORM_WEEKLY` and `BACKUP_ENABLE_PLATFORM_MONTHLY`, are
database-idempotent, and run sequentially after the daily platform snapshot to
avoid an avoidable burst against SQL Server.

## Tenant restore runbook

Tenant restore is an Owner-authorized logical restore, not a SQL Server full
database restore:

1. Authenticate and resolve the active trusted tenant.
2. Confirm the backup belongs to that tenant and is `VERIFIED`.
3. Recheck the compressed artifact checksum, manifest and complete current
   tenant registry.
4. Require an explicit confirmation header and a non-empty reason.
5. Create a mandatory `tenant_pre_restore` safety backup. Restore fails closed
   if that safety copy cannot be verified in private storage.
6. Acquire a database application lock for the tenant.
7. Delete and restore only registered tenant-scoped rows in foreign-key order
   within one transaction.
8. Validate per-table counts, commit, and write `RESTORE_COMPLETED` with the
   source backup id and the pre-restore safety backup id.
9. On any failure, roll back the transaction and write `RESTORE_FAILED`.

Concurrent restore/backup work for the same tenant is rejected by the
database-level application lock. Assistant restore is not granted by the
Owner route permissions. External branding/payment-proof objects require
provider-aware validation during restore; the current logical backup carries
their database metadata references but does not silently embed a second copy
of every external object.

## Platform disaster recovery runbook

Platform recovery must be performed by PlatformAdmin/infrastructure operators
in an isolated maintenance environment:

1. Enter maintenance/recovery mode and preserve the incident/request id.
2. Obtain the latest verified platform artifact and its checksum from private
   storage plus the off-site copy when configured.
3. Restore the database using the provider-supported native backup or the
   verified logical application-level import strategy. Never restore over
   Production during rehearsal.
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
and safe metadata only. Restore records distinguish the source backup from the
pre-restore safety backup. They never contain backup content, credentials,
signed URLs, SQL text, stack traces or sensitive member data.

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
- Native SQL Server `.bak` creation is not implemented by the current
  deployment; only the verified logical `json.gz` format is accepted.
- No backup operation is hidden behind a dashboard/history GET.

## Local tests and current evidence

The recovery implementation has local unit/source coverage for:

- checksum, manifest, version and cross-tenant row validation;
- platform manifest completeness, control-plane/tenant reference validation,
  credential-column exclusion and stored-byte revalidation;
- complete registry enforcement on restore;
- bounded concurrency, retention defaults, deletion claims and download expiry
  gates;
- sensitive projection checks that preserve the nutritional `salt` field;
- private tenant/platform key separation and provider fail-closed behavior;
- read-only path safety and route contracts;
- migration safety, RLS/tenant QA, platform-admin contracts and build syntax.

Run the relevant checks from the repository:

```text
npm run test:unit
npm run test:backup
npm run qa:database
npm run qa:tenancy
npm run qa:platform-admin
npm run qa:gate
npm run build
```

The exact result for the current commit is recorded in the hand-off summary
and `qa/reports/` generated by the commands. The local legacy Production
artifact drill described below is read-only against the source database and
uses a disposable local SQL Server target; it does not establish native `.bak`
coverage, durable off-host retention, or Production migration readiness.

## Verification debt and required production configuration

The central debt file remains authoritative:
`docs/PRODUCTION-VERIFICATION-DEBT.md`.

Backup-specific outstanding items are:

| Item | Status | Evidence needed |
| --- | --- | --- |
| VPS private object-storage activation | `REQUIRES PRODUCTION VERIFICATION` | Configure HTTPS/DNS/firewall, add the restricted application credential to Vercel outside Git, then test private tenant/platform objects, signed access, deletion and off-site copy. |
| External branding/payment-proof object restore and legacy-file cutover | `REQUIRES STAGING VERIFICATION` | Validate provider objects, checksums, tenant ownership and recovery behavior without deleting legacy SQL-backed rows. |
| Native SQL Server backup or equivalent | `REQUIRES PRODUCTION VERIFICATION` | Confirm provider capability and run a non-destructive restore rehearsal in an isolated target. |
| Tenant restore rehearsal in isolated Staging | `BLOCKED` | The local synthetic restore drill passes; restore a verified artifact into isolated Staging and verify relationships, files, RLS and login/access. |
| Daily cron execution | `REQUIRES PRODUCTION VERIFICATION` | Configure `CRON_SECRET`, verify scheduler invocation, duration, retry and health reporting. |
| Authenticated Tenant A/B backup attack matrix | `REQUIRES STAGING VERIFICATION` | Test list/download/restore/ids/tenant changes with synthetic credentials. |
| RPO/RTO | `PENDING REAL-WORLD EVIDENCE` | Measure from a real isolated restore rehearsal; do not infer from daily schedule. |

## Relevant changes

- `16e32d0 backup: add tenant registry and recovery metadata`
- `45ccd8e backup: add tenant and platform recovery foundation`
- `8385ee4 test: align backup route safety coverage`
- `378eeb3 backup: harden integrity and retention coordination`
- `a23e1b1 backup: reject unsupported stored formats`
- `3d74bb5 backup: validate sensitive fields and manifests`
- `a597139 backup: validate restore safety failures`
- `972a9d1 backup: coordinate retention deletion claims`
- `fd604e4 backup: enforce manifest and restore provenance`
- `fd2d0ad backup: preserve nutritional salt fields`
- `6abbaff backup: validate all platform tenant references`
- `7fc0714 backup: exclude sensitive tenant projections`
- `83b7609 backup: enforce retention on downloads`

This report deliberately recommends **No-Go for a production backup/DR claim**
until the Critical provider and restore evidence is available. It does not
block continued local implementation or testing of unrelated production-readiness work.

## Application-level platform DR contract (v3)

The platform artifact is an **application-level disaster-recovery backup**,
not a SQL Server physical backup. Version 3 contains a complete manifest for
the current registry, including the application release identifier when one
is available, schema/registry versions, required restore version, tenant
count, per-table row counts and SHA-256 checksums. The payload is gzip JSON;
the compressed bytes and the logical payload are both integrity-checked.

Platform exports run in trusted platform scope and use the SQL Server
`SESSION_CONTEXT` platform mode for every read. A runtime coverage check
compares every non-system `dbo` table and every physical `tenant_id` table to
the platform/global registry. An uncovered, unclassified or missing table
fails the backup rather than producing a partial artifact. The read transaction
uses `SERIALIZABLE` isolation so the logical snapshot is internally coherent.

The platform registry intentionally includes control-plane tables required to
recreate commercial state, including plan terms, platform payment methods and
gym registration requests/payment proofs. Transient sessions and recovery
metadata are excluded and rebuilt/invalidated during recovery. Credential
hashes, session tokens and other secret-like columns are never exported.

The supported local/test restore drill is:

```text
1. Create a disposable local/test SQL Server database.
2. Run the canonical schema/bootstrap/migration process for the target app.
3. Set DR_RESTORE_TARGET=local or test and DR_RESTORE_CONFIRM=YES only in
   the restore process environment.
4. Run scripts/restore-platform-backup.js against the verified v3 artifact.
5. Verify counts, relationships, RLS, tenant isolation and application health.
```

For the deployed legacy pre-Trainer Production schema, use the dedicated
read-only artifact and restore drill instead:

```text
1. Create the artifact only through the explicitly confirmed
   scripts/create-production-platform-backup-artifact.js path.
2. Compare it with the source using
   scripts/compare-production-platform-artifact.js.
3. Copy/retrieve the gzip artifact independently from the database host and
   verify the SHA-256 checksum.
4. Provide a disposable local SQL Server connection through the process
   environment (never .env) and run
   scripts/restore-production-legacy-artifact.js <artifact.json.gz>.
5. Verify source/artifact/restore counts and checksums before any migration.
6. Run the canonical migration only on the restored local clone, then rerun
   it to verify idempotency and re-check RLS/application readiness.
```

This legacy path classifies every physical source table before extraction,
allows the absent `tenant_type` and future Trainer tables to remain absent,
and derives legacy ownership only through reviewed relationships. It excludes
credential/session secrets and resets credentials on restore. `is_active` on a
legacy `gym_users` source is preserved semantically through the current
`status` field during logical restore; this is a documented compatibility
transformation, not a claim that the physical schemas are identical.

The restore refuses Production-hosted processes, the known Production database
name and non-local SQL Server targets. It clears only the explicitly confirmed
isolated target, restores in foreign-key order, invalidates auth/portal
sessions, and assigns unusable credentials requiring out-of-band credential
recovery. It does not claim native `.bak` equivalence.

The daily backup endpoint now returns a non-2xx response when any tenant,
platform or retention operation fails. Health data reports registry and
physical-schema coverage separately from provider configuration, so a cron
invocation cannot appear successful merely because its HTTP handler returned.

## Local synthetic restore evidence (2026-09-02)

The v3 platform artifact and restore drill were exercised against the
disposable local SQL Server database `GymMembershipClosure_20260902F` and a
new isolated target `LogicFit_DR_Restore_20260902_01`. The artifact contained
9,390 projected rows and restored with matching counts for all 79 registered
global/tenant tables. The restored target reported 87 physical application
tables, 76 physical `tenant_id` tables, and complete platform backup coverage;
153 foreign keys had zero orphan rows. The dynamic local RLS gate reported 75
actual tenant tables, 75 registry tables and 75 protected tables, with zero
unprotected tables, missing entries or invalid predicates. The canonical
migration runner was then executed twice successfully, and the target app
returned healthy responses for health, session and both registration catalog
endpoints. This is local synthetic evidence only: it does not establish
Production row-count/checksum parity, provider persistence, off-site recovery,
or a live scheduler run.

On 2026-09-02, the same path was exercised against the read-only legacy
Production source `db62278`: 162 physical tables were classified, 152 were
included, 10 were explicitly excluded, and unknown/unexplained tables were
zero. The resulting 5,330-row artifact matched Production counts, checksums
and tenant groups. An independent local copy had the same checksum, and a
new local restore matched all 5,330 rows/checksums; the target migration then
ran twice, followed by local application, RLS and tenancy checks. This is
application-level logical DR evidence only: it does not establish native
`.bak` coverage, durable off-site retention, Production migration readiness,
or live scheduler evidence.
## Production storage activation status (2026-08-30)

The private object-storage provider is active for the deployed Logic Fit
application. Tenant artifacts use tenant-scoped keys such as
`tenants/{tenant_id}/private/backups/{uuid}.gz`; platform artifacts use the
separate `platform/private/backups/{uuid}.gz` scope. Uploads are read back and
SHA-256 verified before a record becomes `VERIFIED`; storage failures remain
`FAILED`.

The current private endpoint is the VPS provider reverse-DNS HTTPS hostname
`https://static.112.58.140.128.clients.your-server.de`. MinIO API/console
ports are loopback-only and no permanent public backup URL is issued. The
endpoint is not a Logic Fit-owned domain: `logicfit.saas.app` was not activated
without verified ownership, and `logicfit.vercel.app` is occupied.

End-to-end checks through Vercel successfully created and downloaded one
verified Tenant backup and one verified Platform backup. The checks used the
existing Platform Admin authorization path and discarded the private artifact
contents after transfer. A secondary off-site copy and a destructive restore
rehearsal in an isolated environment remain operational prerequisites; the VPS
is a primary storage failure domain, not complete off-site disaster recovery.
