# Database production-readiness audit

Last reviewed: 2026-08-29

This is a source/configuration audit. It is not a live SQL Server capacity or
execution-plan result; those require a disposable Staging database with
representative data.

## Verified from the repository

- `src/database/pool.js` reuses one `mssql` pool per warm Node instance and
  resets the cached promise after a failed connection attempt.
- Connection timeout, request timeout, pool max/min and idle timeout are
  bounded configuration values. Defaults remain conservative (`30s`, `120s`,
  `10`, `0`, `30s`).
- `src/database/transaction.js` commits only after the callback succeeds and
  attempts rollback while preserving the original error.
- `database/schema.sql`, `database/migrations/005-member-feedback.sql`,
  `006-permissions.sql` and `007-store.sql` use existence/column/index guards
  for their additive objects. No `DROP TABLE`, `TRUNCATE` or mass data delete
  was found in those migration files.
- The tenancy migration explicitly prepares the root schema, tenancy metadata,
  SaaS objects, runtime feature tables and RLS. `npm run migrate:tenancy` is
  repeatable at the object-creation level.
- CI, `package.json` and `.nvmrc` now target Node 24.

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
5. Live database size, row growth, fragmentation, execution plans, connection
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
| Pool reuse and bounded configuration | `IMPLEMENTED` / locally tested |
| Transaction rollback path | `IMPLEMENTED` by code review; live failure rehearsal pending |
| Additive migration guards | `IMPLEMENTED` by source audit |
| Migration repeatability on real data | `REQUIRES STAGING VERIFICATION` |
| Live DB capacity and workload | `REQUIRES STAGING/PRODUCTION VERIFICATION` |
| Production/Stage/Development separation | `REQUIRES STAGING/PRODUCTION VERIFICATION` |
| Restore rehearsal | `BLOCKED — REAL RESTORE TEST REQUIRED` |
