# Logic Fit Production Migration & Deployment Runbook

## Status

This is a planning document. It does not authorize or execute a Production
migration, deployment, database write, environment-variable change, push, or
rollback.

Production must remain on:

- application: `80dad9b`
- database: `db62278`
- status: stable

The rehearsed target is currently identified as:

- target candidate: `adab363a485dd9f5d267df636caff9818c1a3196`
- required runtime: Node `24.x`

The local Production-equivalent rehearsal passed. That evidence is local and
does not by itself authorize a Production change.

## Non-negotiable safety rules

1. Never run the migration against `db62278` until every ordered gate below
   is recorded as `PASS` and a separate explicit Production execution approval
   is given.
2. Never use `schema.sql` as a substitute for the canonical migration process.
3. Never run a partial subset such as only migrations `013–019`.
4. Never print connection strings, credentials, tokens, hashes, PII, SQL
   result rows, or private storage keys.
5. Never use `top-gym` as a tenant fallback or as a recovery target.
6. Never treat application rollback as database rollback.
7. Native SQL Server `.bak` recovery is not available on the current hosting
   plan; this runbook does not claim otherwise.
8. If a critical gate fails, keep the write freeze active and stop.

## Evidence baseline

The following evidence is already available from the local rehearsal:

- Production legacy application artifact: 162 physical tables, 152 included,
  10 explicit exclusions, `UNKNOWN=0`, 5,330 rows.
- Production-vs-artifact counts, checksums and tenant-group parity: exact
  match.
- Independent retrieved artifact copy: SHA-256 matched the source artifact.
- Clean local restore and post-migration restore: passed.
- Canonical migration run twice: passed with no duplicate schema or data and
  no historical timestamp mutation.
- Dynamic local RLS: 75/75 protected, unprotected 0, missing registry 0,
  invalid predicates 0; `saas_audit_log` was protected.
- Local tenancy, IDOR, Trainer flow, Gym flow, portals, financial concurrency,
  PlatformAdmin, Node 24 and browser QA: passed.

These are rehearsal results, not Production results.

## 1. Pre-flight

### 1.1 Release identity

Record in the change ticket:

```text
CURRENT_PRODUCTION_COMMIT=80dad9b
TARGET_RELEASE_COMMIT=<full immutable SHA>
TARGET_REQUIRED_RUNTIME=24.x
```

Verify the target from a clean checkout, without printing secrets:

```text
git show --no-patch --format=fuller <TARGET_RELEASE_COMMIT>
git diff --exit-code <TARGET_RELEASE_COMMIT> --
git status --short
```

The target is eligible only when the exact commit contains every source fix
used by the successful rehearsal. The current working tree has uncommitted
closure changes; therefore `adab363...` must not be promoted blindly. Either
prove those changes are already in the target commit or create a reviewed
release commit and rerun the affected gates before requesting execution
approval. Do not include UI experiments, Multi-Branch, Bar, or unrelated
refactors.

**STOP if:** the immutable target cannot be shown to contain the rehearsed
code, the working tree is dirty for the release source, or the target SHA is
not the SHA tested on the migrated clone.

### 1.2 Production health and deployment

Before any database write, record:

- active Production deployment identifier and URL;
- active commit, expected `80dad9b`;
- `/api/health` result;
- `/api/auth/session` result;
- current error-log baseline;
- confirmation that Production traffic still uses `db62278`.

Expected current state is healthy on `80dad9b`. If the live deployment or
database target differs, stop and re-identify the target; do not infer it from
an environment name.

### 1.3 Runtime and dependency checks

The repository declares `engines.node = 24.x`. On the controlled migration
host, record:

```text
node --version
npm --version
npm ci
```

The recorded runtime must be Node 24.x. The successful Node 22 result is not
runtime parity evidence. Run the release-candidate build and critical tests
from the immutable target, not from a dirty working tree.

### 1.4 Environment configuration presence

Check presence only (`true/false`), never values. The current code consumes:

| Variable group | Variables | Gate |
| --- | --- | --- |
| Database | `MSSQL_CONNECTION_STRING` or `DATABASE_URL` | exactly the authorized Production target; no value output |
| Runtime | `NODE_ENV`, `PORT`, `TRUST_PROXY_HOPS` | Production values verified |
| Cron | `CRON_SECRET` | present; missing secret fails the Production cron closed |
| Authentication | existing `AUTH_*` settings | present according to the deployed baseline; no secret output |
| Portal/registration | `MEMBERSHIP_CODE_SECRET`, `MEMBER_PORTAL_SESSION_SECRET`, `PUBLIC_REGISTRATION_SECRET` | purpose-specific secrets present or approved fallback documented |
| Private storage | `OBJECT_STORAGE_*` or documented `BACKUP_STORAGE_*` aliases | configured, private, independently retrievable and tested |
| Public URL | `PUBLIC_APP_URL`, optional `PLATFORM_ADMIN_HOST` | verified against the actual deployment |
| DB limits | `MSSQL_CONNECTION_TIMEOUT`, `MSSQL_REQUEST_TIMEOUT`, pool settings | finite and suitable for the measured environment |

Use the existing secret-management/provider mechanism. Do not edit `.env`,
commit secrets, or echo values.

### 1.5 Database identity and read-only preflight

Using the authorized Production connection mechanism, run only metadata and
aggregate queries. Record safe metadata:

- database name: expected `db62278`;
- SQL Server version/edition: expected `17.0.4060.2`, Express 64-bit;
- database state and read/write state;
- current schema object signature;
- current legacy migration history, if present;
- counts only for tenants, users, members, memberships, payments,
  subscriptions, registration requests and other registered backup tables;
- current RLS policy/function inventory;
- current tenant registry and tenant-id coverage.

The preflight must check legacy schema drift, NULL/duplicate/foreign-key
violations, invalid subscription/plan references, missing tenant ownership,
duplicate indexes/constraints, auth incompatibility, and the known absence of
`tenant_type` and Trainer tables.

**STOP if:** the database identity is not proven, unexpected data anomalies
are found, or any required migration prerequisite is unresolved.

## 2. Maintenance and write freeze

### 2.1 Repository capability and limitation

The repository has no global `maintenance mode` switch. The application has a
read-only baseline header for performance tests, but that header is not a
Production write-freeze control. It must not be repurposed for this release.

The safe freeze therefore requires an infrastructure/provider traffic gate:

1. Put the Production domain behind the provider's maintenance/traffic gate,
   returning a maintenance response for all application requests except an
   explicitly approved health probe.
2. Drain existing requests and confirm no in-flight mutation remains.
3. Block public, authenticated, portal and PlatformAdmin traffic. Do not rely
   on hiding buttons or on a frontend flag.
4. Pause the Vercel cron for `/api/backup/daily` at `0 12 * * *`, or block it
   through the provider scheduler. Confirm that no invocation is running.
5. Stop or pause any external webhook, worker, operator script or job that can
   write to the database. The source has no active `setInterval` worker for
   SaaS expiry; expiry synchronization can occur on non-read-only service
   paths, which is another reason normal API traffic must be blocked.
6. Keep only safe health/liveness and static maintenance delivery available.

If the provider cannot enforce this gate, do not migrate. Do not create an
application patch during the migration window.

### 2.2 Write classes to freeze

The freeze covers all routes and external callers below:

- public gym and Trainer registration requests and payment-proof uploads;
- login/session/password/logout writes where they affect live state;
- Gym members, memberships, attendance, payments, refunds, expenses,
  permissions, branding, coaching, nutrition, library, store, POS,
  inventory, suppliers and uploads;
- Trainer clients, measurements, check-ins, plans, packages, purchases,
  payments, refunds, sessions, portal access, reports and uploads;
- PlatformAdmin tenant, plan, subscription, approval, payment-proof,
  credential, override, note, backup and status mutations;
- Member Portal and Trainer Client Portal requests, feedback, subscription
  requests and proof uploads;
- the state-changing authorized `GET /api/backup/daily` cron;
- any provider job, notification, payment webhook or scheduled mutation.

Reads may resume only after the post-deployment database and application
gates pass. Reads during migration are not assumed safe unless the provider
gate and SQL connection behavior have been explicitly tested for the current
deployment.

## 3. Final pre-migration Application-Level DR artifact

This is a mandatory abort gate immediately before migration and after the
write freeze. It is a logical application-level artifact, not a physical SQL
Server backup.

### 3.1 Read-only creation

Use the existing `scripts/create-production-platform-backup-artifact.js`
from a controlled host with process/session-only configuration injection:

```text
DR_PRODUCTION_READ_ONLY_CONFIRM=YES
DR_PRODUCTION_ARTIFACT_CONFIRM=READ_ONLY
DR_PRODUCTION_ENV_FILE=<provider-injected-production-config-path>
DR_PRODUCTION_ARTIFACT_OUTPUT=<new-independent-local-output-path>
node scripts/create-production-platform-backup-artifact.js
```

PowerShell operators may set those variables for the current process only;
they must clear the session afterward. Do not edit `.env` or print the
configuration path contents. The helper is fail-closed unless explicit
read-only confirmation and an explicit output path are supplied.

### 3.2 Artifact gates

Record only safe metadata:

- artifact identifier and creation timestamp;
- compressed size;
- SHA-256;
- `sourceSchemaGeneration` (expected `legacy-pre-trainer` before migration);
- `sourceTenantTypeColumn` (expected `false` before migration);
- Trainer table presence (expected `false` before migration);
- physical table count, included count and explicit exclusion count;
- `UNKNOWN` and `unexplained` counts;
- total row count and per-table counts.

Run the read-only parity helper against the same source and artifact:

```text
DR_PRODUCTION_READ_ONLY_CONFIRM=YES
DR_PRODUCTION_ENV_FILE=<provider-injected-production-config-path>
DR_PRODUCTION_ARTIFACT_INPUT=<artifact-path>
node scripts/compare-production-platform-artifact.js
```

Require all of the following:

- physical tables = included required tables + explicit exclusions;
- `UNKNOWN = 0` and `unexplained = 0`;
- table counts match exactly;
- deterministic checksums match where supported;
- tenant-by-tenant groups match exactly;
- missing tenants = 0;
- missing tenant rows = 0;
- cross-tenant mixing = 0;
- gzip, JSON, manifest and checksum verification pass.

Copy the artifact to the approved independent private storage path. Verify
the retrieved copy's checksum equals the source checksum. A local temp file,
Vercel filesystem, or SQL-backed legacy archive is not sufficient as the only
recovery copy.

**STOP if:** any count/checksum/tenant/storage gate fails. Do not begin DDL.

## 4. Canonical Production migration

Only the source-controlled `scripts/migrate-tenancy.js` process is permitted.
Run it from a controlled host after the clone rehearsal and all gates have
passed. The command requires an explicit Production confirmation:

```text
MIGRATION_ENV=production
MIGRATION_PRODUCTION_CONFIRM=I_UNDERSTAND_PRODUCTION_MIGRATION
npm run migrate:tenancy
```

The command must be executed once during the approved window, with step-level
stdout/stderr retained in the change evidence. Do not run it from a Vercel
build hook or deploy hook, and do not manually execute fragments.

### 4.1 Exact order implemented by the current runner

The current source order is:

1. `initDatabase()` batches `database/schema.sql`.
2. `tenantService.ensureTenantTables()`.
3. `014-tenant-type-foundation.sql`.
4. `tenantService.ensureBootstrapTenant()`.
5. `backupRecoveryService.ensureRecoveryTables()`.
6. `saasService.ensureSaasTables()`.
7. `011-commercial-portal-and-registration.sql`.
8. `015-plan-tenant-type-compatibility.sql`.
9. `016-independent-trainer-registration.sql`.
10. `017-trainer-client-profile.sql`.
11. `018-trainer-commercial-operations.sql`.
12. `019-trainer-portal-foundation.sql`.
13. `commercialSchema.ensureCommercialTables()`.
14. `paymentLedgerSchema.ensurePaymentLedgerIntegrity()` using migration
    `012-payment-ledger-integrity.sql`.
15. Auth, library, coaching, day-pass, membership-code, member-feedback,
    store, intelligence and branding readiness.
16. `013-phase0-security-preconditions.sql`.
17. `tenantService.ensureTenantColumnsAndRls()`.
18. Library data seed/readiness.
19. `saasService.ensureBootstrapSubscription()`.

Some steps intentionally repeat idempotent schema readiness already used by
the application. That repetition is part of the current canonical runner and
must not be removed or reordered during execution.

### 4.2 Expected schema/data behavior

- Existing tenants receive `tenant_type = 'gym'` only through the reviewed
  migration backfill/default behavior.
- Existing tenant IDs, users, memberships, payments and historical rows stay
  unchanged.
- `tenant_type` becomes `VARCHAR(32) NOT NULL`, default `gym`, with a CHECK
  allowing only `gym` and `independent_trainer`.
- Plan compatibility is represented by `saas_plan_tenant_types`.
- Trainer registration, client profile, package/purchase/usage, coaching
  session and Trainer portal tables are created additively.
- Payment ledger integrity is added through the existing payment migration;
  no second ledger is created.
- Dynamic tenant RLS is recreated/verified by the existing security path.
- `saas_audit_log` must be included in the protected set after migration.

The runner is not one all-step SQL transaction. If it fails, stop and follow
the recovery section; never assume a Git rollback undoes partial DDL/data.

## 5. Immediate post-migration database gate

Before activating the target application, keep the write freeze active and
record:

1. migration process exit status and every completed step;
2. schema contract status;
3. `tenant_type` type, nullability, default and CHECK constraint;
4. required Trainer and commercial tables;
5. plan compatibility mapping and subscription relationships;
6. payment ledger constraints and financial row reconciliation;
7. auth, branding, portal and backup/recovery readiness;
8. tenant registry count and physical `tenant_id` table count;
9. actual RLS policy/function/predicate inventory;
10. data counts/aggregates against the pre-migration artifact;
11. no tenant ID reassignment, orphan, duplicate, unexpected deletion or
    cross-tenant movement.

Run the repository's real checks against Production only from the approved
operator environment:

```text
npm run qa:database
npm run qa:rls
npm run qa:tenancy
```

The database gate requires:

```text
actual tenant tables = registry tables = protected tables
unprotected tenant tables = 0
missing registry entries/tables = 0
invalid predicates = 0
```

Specifically verify that `dbo.saas_audit_log` is protected and that existing
Gym tenants remain Gym tenants. If any gate fails, do not activate the new
application and do not reopen writes.

## 6. Target application deployment

Deploy/promote only the exact immutable release candidate that passed the
migrated-clone rehearsal. The deployment must contain no unrelated changes.

Required deployment gate:

```text
TARGET_RELEASE_SHA == SHA_TESTED_ON_MIGRATED_CLONE
```

Do not deploy from the current dirty working tree. Do not rebuild an older
commit if the exact verified immutable deployment is available. Do not
change Production environment variables as part of this runbook.

If the target requires a newly committed closure fix, that new SHA becomes
the target and the affected local gates must be rerun before this runbook can
proceed.

## 7. Post-deployment Production verification

Keep writes frozen while running the following checks.

### 7.1 Safe HTTP smoke checks

Verify the actual Production domain, not a preview URL:

```text
GET /api/health
GET /api/health/live
GET /api/auth/session
GET /api/public/gym-registration/catalog
GET /api/public/trainer-registration/catalog
```

Expected results are healthy status, session-safe behavior, and valid 200
catalog responses. Confirm static HTML, CSS, JS, branding and favicon assets
load without failed requests.

### 7.2 Authenticated checks

Use existing authorized accounts only; do not create uncontrolled Production
records. Verify, without mutation where possible:

- Gym Owner login, dashboard, members, memberships, payments, attendance,
  expenses, training, nutrition, AI, reports, store/POS, branding,
  permissions and Member Portal;
- Trainer Owner login and routing to Trainer Workspace, not Gym Dashboard;
- PlatformAdmin tenant list, Gym/Trainer visibility and read-only tenant
  details;
- Member Portal access for an existing authorized Gym member;
- Trainer Client Portal only for an existing authorized Trainer client or a
  pre-approved synthetic canary tenant.

If a flow requires a write and no dedicated synthetic/canary tenant exists,
record it as not run rather than mutating real customer data. A login/session
write is allowed only under the approved smoke-test procedure and must be
correlated by request ID.

### 7.3 Security and financial checks

During the freeze, verify safe read paths and denial behavior for:

- tenant resolution and capability checks;
- Gym-to-Trainer and Trainer-to-Gym route denial;
- cross-tenant IDs supplied to read endpoints;
- portal resource ownership;
- private upload/download authorization;
- financial ledger visibility and duplicate/idempotency protections.

Do not perform charges, refunds, package purchases or tenant provisioning in
Production unless a separately approved synthetic canary identity and
reversal procedure exists.

Inspect logs and deployment telemetry for 500, EREQUEST, SQL/schema, RLS,
SESSION_CONTEXT, auth, tenant-resolution, registration and payment errors.
Retain request IDs but not secrets or response bodies.

**STOP if:** any smoke, auth, RLS, tenant-isolation, data-integrity or
critical Gym regression check fails.

## 8. Write release criteria

Writes may reopen only when all of these are `PASS`:

- final DR artifact, independent copy and checksum;
- migration exit status and database schema contract;
- legacy data reconciliation;
- dynamic RLS and tenant registry;
- post-deployment health, auth and both registration catalogs;
- Gym smoke/regression;
- Trainer routes/catalog/routing where safe evidence exists;
- PlatformAdmin and portal isolation;
- logs clean for the observation window;
- no active migration, job or old deployment request remains;
- rollback/recovery owner has acknowledged the state.

Reopen writes in one controlled step, then watch errors and financial/auth
telemetry. If any critical alert appears, re-enter maintenance immediately.

## 9. Recovery and abort plan

### A. Failure before migration

- Abort; keep Production on `80dad9b`.
- Keep writes available only if the freeze was never entered; otherwise
  release it after confirming no change occurred.
- Do not restore anything.
- Fix the failed preflight/DR gate and create a new evidence set.

### B. Failure during migration

- Stop the runner and keep all traffic/writes blocked.
- Do not rerun blindly and do not run random repair SQL.
- Capture the failing step, safe error code, completed-step list and schema
  state.
- Decide only after review whether the failure is safely retryable on the
  partially changed database; prefer a clean restored rehearsal first.
- An application-level artifact restores application data through a
  compatible schema; it does not reverse arbitrary SQL Server DDL, RLS
  metadata, indexes or constraints. It is therefore not an instant rollback
  for a half-migrated Production database.
- If the hosting provider cannot rebuild/swap a database from a recoverable
  source, keep maintenance active and escalate. Do not improvise a reset.

### C. Migration succeeds, deployment has not started

- Keep writes blocked.
- Run the complete post-migration database gate again.
- If the old `80dad9b` application was explicitly proven against this schema
  in the rehearsal, it may remain active while the target deployment issue is
  investigated; do not assume this compatibility from additive DDL alone.
- If old-app compatibility is not proven, do not activate either version
  until the provider recovery/cutover path is confirmed.

### D. Failure after deployment, before writes reopen

- Keep maintenance active and stop target traffic if the failure is critical.
- First determine whether `80dad9b` is backward-compatible with the migrated
  schema; Git rollback alone is never sufficient.
- If compatibility is proven, application rollback may restore service while
  the database remains migrated.
- If compatibility is not proven, do not roll back blindly. Use the approved
  database rebuild/restore/cutover process. The application-level artifact is
  data recovery, not native SQL Server rollback.

### E. Failure after writes reopen

- Re-enter maintenance and stop all new writes.
- Preserve logs, request IDs, financial ledger state and a fresh verified DR
  artifact if the backup path is healthy.
- Do not restore the pre-migration artifact over newer writes without a write
  reconciliation plan.
- For payment/ledger issues, stop financial operations first and reconcile
  idempotency/transaction records before any retry.
- For RLS/IDOR/auth failures, keep all tenant traffic blocked and do not use a
  frontend or SQL bypass.
- Choose application rollback only after schema compatibility is verified;
  otherwise use an explicitly approved database recovery/cutover process.

## 10. Downtime, RTO and RPO

The known Production artifact contains about 5,330 recoverable logical rows
and is about 1.57 MiB compressed in the recorded rehearsal. The local
rehearsal passed, but a Production elapsed-time measurement has not been
recorded. Therefore no hard RTO or downtime guarantee may be advertised.

Use a provisional maintenance budget large enough for:

1. final artifact and independent-copy verification;
2. migration with step logging;
3. database/RLS gates;
4. deployment propagation;
5. smoke tests and an observation window.

Record actual start/end times and set an operator abort threshold before the
window. If the migration or verification makes no measurable progress before
that threshold, keep maintenance active and escalate; do not extend blindly.

With the freeze enforced before the final artifact, the effective logical
business-data RPO is the last committed row included at the freeze/artifact
boundary. Writes after that boundary must be zero. Secrets, sessions and
external private objects follow their separate recovery policy and are not
claimed to be present in the logical artifact.

## 11. Audit evidence to retain

Retain in the protected change record:

- source Production deployment/commit (`80dad9b`);
- exact target immutable SHA and clean-tree proof;
- Node/npm versions and dependency-install result;
- safe Production database identity and schema state;
- preflight result and operator/request ID;
- final artifact identifier, manifest summary, size, timestamp and SHA-256;
- independent-copy and retrieval checksum evidence;
- migration command identity, start/end, step output and exit status;
- post-migration schema/RLS/registry output;
- before/after aggregate reconciliation and tenant-count evidence;
- deployment identifier and activation timestamp;
- health/auth/catalog/smoke results;
- log review and observation-window result;
- final GO/NO-GO decision and approvers;
- any abort/recovery decision, with no secrets or PII.

## 12. Strict ordered execution checklist

1. Confirm Production is stable on `80dad9b`. **STOP on mismatch.**
2. Confirm target SHA is immutable, clean and exactly rehearsed. **STOP on
   dirty/unmatched source.**
3. Confirm Node 24 and required configuration presence. **STOP on missing or
   unsafe configuration.**
4. Resolve and record the actual Production database identity. **STOP if not
   proven.**
5. Run read-only preflight and anomaly checks. **STOP on any blocker.**
6. Establish provider maintenance/traffic gate and pause cron/jobs. **STOP if
   writes cannot be proven blocked.**
7. Create the final read-only Application-Level DR artifact. **STOP on
   `UNKNOWN`, unexplained, count, checksum or tenant mismatch.**
8. Copy/retrieve the artifact independently and verify the checksum. **STOP
   if the copy is not independently retrievable.**
9. Record the final GO/NO-GO for the migration window. No earlier step grants
   Production migration authority.
10. Run the exact `npm run migrate:tenancy` command with the explicit
    Production confirmation. **STOP on any error.**
11. Run the immediate post-migration database/RLS/data gates. **STOP on any
    mismatch or unprotected tenant table.**
12. Deploy only the exact rehearsed target SHA. **STOP on SHA mismatch.**
13. Run health, auth, catalog, Gym, Trainer, PlatformAdmin and portal smoke
    checks. **STOP on any critical failure.**
14. Inspect logs and observe the system. **STOP and re-enter maintenance on
    critical errors.**
15. Reopen writes only after every release criterion is `PASS`.
16. Record the final state and retain all evidence.

## 13. Known approval blockers

This runbook is complete as an execution plan, but Production execution is
not yet approved. The following must be resolved/confirmed before a safe
request can become an execution GO:

1. The current workspace contains uncommitted closure changes; the exact
   immutable release SHA that includes the rehearsed code is not yet proven.
2. The repository has no central maintenance switch; an authorized provider
   maintenance/traffic gate and cron/job pause procedure must be confirmed.
3. Independent durable private storage and retrieval for the final Production
   artifact must be confirmed at execution time.
4. A provider-supported recovery/cutover procedure for a partially migrated
   SQL Server database is not demonstrated by the application-level artifact;
   the artifact is not a native `.bak` and cannot reverse arbitrary DDL.
5. The current source has a strong runtime schema guard, but an authoritative
   pre-deploy application-required-schema-version gate is not evidenced in
   the current repository. It should be completed before the release or
   explicitly accepted as a separate release-blocking control.

Until these are closed, the correct decision is `NO-GO`; Production remains
on `80dad9b` with no database changes.

## Final planning status

LOCAL PRODUCTION-EQUIVALENT REHEARSAL: PASS

PRODUCTION RUNBOOK COMPLETE: YES

WRITE-FREEZE STRATEGY DEFINED: YES

FINAL DR GATE DEFINED: YES

MIGRATION COMMAND VERIFIED: YES

POST-MIGRATION DB GATES DEFINED: YES

DEPLOYMENT GATES DEFINED: YES

PRODUCTION SMOKE GATES DEFINED: YES

RECOVERY PROCEDURE DEFINED: YES

GO/NO-GO CRITERIA DEFINED: YES

SAFE TO REQUEST PRODUCTION EXECUTION APPROVAL: NO

Remaining blockers are listed in section 13. No Production migration,
deployment, environment-variable change, push, or database modification was
performed while preparing this runbook.
