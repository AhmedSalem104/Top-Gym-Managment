# Backend performance audit

## Current request path

Express middleware → auth/permission/tenant context → route/controller → service → repository or service-owned parameterized SQL → tenant-aware SQL Server pool. `src/middleware/performance-metrics.js` can report route duration, DB critical-path/work duration, query count, response bytes and safe slow-operation category when enabled. Enablement is double-gated in Production by `PERFORMANCE_METRICS` and `PERFORMANCE_METRICS_PRODUCTION`.

## Static findings

- `src/config/env.js`: request timeout defaults to 120s, connect timeout 30s, pool max 10/min 0 per Node process, bounded via environment. These are defaults, not proven production settings.
- `src/database/pool.js`: one reusable `mssql` pool; encrypt defaults true, `trustServerCertificate` false; tenant session context is added to SQL requests unless explicitly skipped. Instrumentation measures query durations.
- `docs/ARCHITECTURE.md` identifies large legacy services and SQL ownership as future extraction, not confirmed latency issues.
- Attendance read/list logic composes joins and derived summaries; check-in/out also reconciles auto-checkout in the path. This may add work but has not been profiled.
- `docs/PHASE-1-STATIC-AUDIT.md` previously flags potentially broad report/store reads, contents-search patterns and runtime schema readiness work; treat as investigation leads, not quantified regressions.

## Not measured

No request timings, query plans, query counts per workflow, CPU/memory, connection wait, DB lock waits, response sizes, timeout rates, or throughput were collected. No SQL or production data was queried.

## Recommendations, gated by evidence

1. In staging, correlate route request IDs with `Server-Timing` and SQL query count for target workflows.
2. Identify top p95 DB categories, inspect actual parameterized query plans and selectivity; only then propose indexes with write-cost and migration review.
3. Inspect repeated independent calls; parallelize only independent reads and preserve tenant scope/error semantics.
4. Bound report/export payloads and server-side pagination only when contract-compatible and backed by measurements.
5. Keep financial and attendance writes synchronous/transactional as business semantics require; never add blind retries.
