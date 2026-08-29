# Observability

## Current implementation

Each request receives a safe correlation identifier from
`src/middleware/request-id.middleware.js`.

- Incoming `X-Request-ID` values are accepted only when they match a bounded
  alphanumeric correlation format.
- Invalid, missing or oversized values are replaced with a generated UUID.
- The identifier is returned as `X-Request-ID` and is included in API error
  responses so support can correlate a browser failure with server logs.
- Performance logs include the identifier, route, status, total duration, DB
  critical-path duration, DB work duration, query count, response bytes and
  the safe category of the slowest DB operation.
- `Server-Timing` exposes durations and query count only. It never exposes SQL,
  table names, credentials, cookies, tokens or response data.
- Error logs intentionally avoid raw exception messages because database and
  driver exceptions can contain internal implementation details. Use the
  request ID plus the deployment/provider logs for controlled diagnosis.

## Health endpoint

`GET /api/health` is tenant-neutral and verifies application routing and SQL
connectivity. It reports safe application/database/storage states and a
monotonic database-check duration; a database failure returns `503` without
exposing driver details. It is a read-only connectivity check, not proof of
capacity, RLS correctness, storage availability or backup recoverability.

## Verification boundary

Local tests verify request-ID format and safe error/logging shape. Central log
shipping, alert routing, Vercel function correlation, database health latency,
storage health and production alert thresholds still require a safe
Staging/Production verification described in
`docs/PRODUCTION-VERIFICATION-DEBT.md`.
