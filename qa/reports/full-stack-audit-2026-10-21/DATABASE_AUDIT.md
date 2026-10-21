# Database audit

## Confirmed stack/configuration

- SQL Server through `mssql` 11 (`package.json`); reusable pool in `src/database/pool.js`.
- Config defaults: connect timeout 30s; request timeout 120s; pool maximum 10 per process, minimum 0; TLS encryption on and certificate trust off by default (`src/config/env.js`, `src/database/pool.js`). Deployment values are NOT VERIFIED.
- Tenant session context is injected at query/batch boundary; read-only baseline guard blocks persistent SQL mutations where `readOnlyBaseline` is active.
- `docs/DATABASE.md`, migration manifest and release gate define migration ownership; migration ledger is authoritative per AGENTS release rules.
- Runtime readiness checks exist in some business services; financial paths are explicitly intended to use read-only schema readiness, not runtime DDL (AGENTS financial ledger truth).

## What this audit cannot establish

No database connection was made. No DB name/server fingerprint, schema, row counts, RLS policies, migration ledger, index definitions, fragmentation, statistics, deadlocks, wait stats, query plans, pool saturation, or backup was inspected. No index recommendations are made without plans.

## Investigation priorities

1. In a safely scoped staging tenant context, identify top DB critical-path routes from request ID/Server-Timing telemetry.
2. Capture actual SQL plans with representative parameters and row estimates; review implicit conversions, scans, cardinality, sorts, spills and parameter sensitivity.
3. Compare route filters/sorts/pagination with indexes and write patterns; propose migration only with measured benefit and safe expand/contract.
4. Verify pool wait/active counts and process count against SQL connection budget before changing `MSSQL_POOL_MAX`.
5. Validate backup restore with isolated existing recovery service and measured data coverage; do not treat successful process exit alone as proof.

## Explicitly not done

No SQL statements, migrations, seed scripts, reconciliation, backup/restore, or production operations were run.
