# Database production-readiness audit

Last reviewed: 2026-08-29

This is a source/configuration audit. It is not a live SQL Server capacity or
execution-plan result; those require a disposable Staging database with
representative data.

## Repeatable local safety gate

Run `npm run qa:database` for the repository-level check. It writes only the
ignored report `qa/reports/database-readiness-latest.json`; it does not connect
to SQL Server and it does not execute a migration. The check currently covers:

- Numeric migration ordering and duplicate-version detection.
- `OBJECT_ID` guards for `CREATE TABLE`.
- `COL_LENGTH`/existence guards for additive columns.
- `sys.indexes` guards for indexes.
- Existence guards for seed inserts.
- Rejection of destructive migration statements and unsupported `GO` batches.
- Migration-runner error/cleanup wiring.
- Pool reuse, bounded timeout wiring and pool close handling.
- Transaction begin/work/commit/rollback ordering.
- SaaS pending subscription request duplicate preflight and filtered unique
  guard checks.

The current local result is `PASS` for the three files under
`database/migrations/` (`005`, `006`, `007`). This is a source-level safety
result, not proof that an existing production database will migrate cleanly.

## Verified from the repository

- `src/database/pool.js` reuses one `mssql` pool per warm Node instance and
  resets the cached promise after a failed connection attempt.
- Connection timeout, request timeout, pool max/min and idle timeout are
  bounded configuration values. Defaults remain conservative (`30s`, `120s`,
  `10`, `0`, `30s`); connection/request values are clamped to `1s..300s` and
  `1s..600s` respectively.
- `src/database/transaction.js` commits only after the callback succeeds and
  attempts rollback only after a successful `begin`, while preserving the
  original error if rollback itself fails.
- `database/schema.sql`, `database/migrations/005-member-feedback.sql`,
  `006-permissions.sql` and `007-store.sql` use existence/column/index guards
  for their additive objects. No `DROP TABLE`, `TRUNCATE` or mass data delete
  was found in those migration files.
- The tenancy migration explicitly prepares the root schema, tenancy metadata,
  SaaS objects, runtime feature tables and RLS. `npm run migrate:tenancy` is
  repeatable at the object-creation level.
- CI, `package.json` and `.nvmrc` now target Node 24.
- `scripts/migrate-tenancy.js` fails closed before any database operation when
  an external target has no explicit environment, and requires an exact
  confirmation value for Production migrations.
- The standalone server closes its HTTP listener and cached SQL pool on
  shutdown signals; this is process-lifecycle hardening, not a claim about
  Vercel function shutdown semantics.

## Findings and boundaries

1. There is no migration ledger recording applied versions, checksum or actor.
   The current migration command is an ordered, idempotent bootstrap rather
   than a full migration framework. This is acceptable for the current MVP
   path but needs a Staging rehearsal before treating it as production-safe.
2. There is no automated rollback migration for schema changes. Recovery is
   currently backup/restore based; a restore rehearsal is still open.
3. Runtime `ensure*Tables` calls remain in legacy services. They are skipped by
   read-only baseline requests but remain part of normal startup/lazy setup.
   Moving them into reviewed migrations is a future hardening task and was not
   changed without a production-like database rehearsal.
4. Index declarations in source are an inventory only. No performance index
   was added from static inspection. Candidate indexes remain
   `CANDIDATE — PENDING BASELINE/EXECUTION PLAN` in
   `docs/PHASE-1-STATIC-AUDIT.md`.
5. The pending SaaS subscription request guard is an integrity constraint, not
   a speculative performance index. Existing duplicate pending rows stop the
   schema preflight with a clear error instead of being silently changed.
6. Live database size, row growth, fragmentation, execution plans, connection
   limits, timeout behavior and provider latency are
   `REQUIRES STAGING/PRODUCTION VERIFICATION`.

## Required Staging rehearsal

Use a disposable production-like copy and:

1. Run `npm run migrate:tenancy` twice.
2. Compare schema objects, constraints, indexes, row counts and RLS state.
3. Capture migration output and any SQL errors.
4. Exercise connection timeout, request timeout, pool saturation and recovery.
5. Take a backup, rehearse restore, then run tenancy and critical-flow checks.

Do not run this rehearsal against Production without an approved backup,
maintenance window and rollback decision.

## Status

| Area | Status |
| --- | --- |
| Pool reuse, close lifecycle and bounded configuration | `VERIFIED` locally; live saturation/recovery pending |
| Transaction begin/commit/rollback path | `VERIFIED` locally with failure doubles; live failure rehearsal pending |
| Static migration safety gate | `VERIFIED` locally (`npm run qa:database`) |
| Additive migration guards | `IMPLEMENTED` by source audit |
| SaaS pending-request integrity guard | `VERIFIED` locally; existing-data rehearsal pending |
| Migration repeatability on real data | `REQUIRES STAGING VERIFICATION` |
| Live DB capacity and workload | `REQUIRES STAGING/PRODUCTION VERIFICATION` |
| Production/Stage/Development separation | `REQUIRES STAGING/PRODUCTION VERIFICATION` |
| Restore rehearsal | `BLOCKED — REAL RESTORE TEST REQUIRED` |
