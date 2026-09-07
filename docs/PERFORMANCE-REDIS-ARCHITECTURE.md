# Logic Fit Performance & Redis Architecture

Status: `IMPLEMENTED — RELEASE READY`

This document records the measured performance work for the current release. It intentionally separates verified local/browser evidence from measurements that require an authenticated QA session or a secure Redis connectivity path.

## Scope and safety

- SQL Server remains the source of truth.
- Tenant isolation, RLS, permissions, capabilities, plans, branch/section scope, authentication and session storage were not weakened or moved.
- Migration 029 was not rerun. Migration 030 was not touched.
- No Production database, backups, media, or cron configuration was modified by this performance work.
- Redis is installed as a loopback-only cache on the VPS. Vercel reaches it only through an authenticated HTTPS gateway behind the existing Caddy TLS endpoint; raw port 6379 is not exposed.

## Baseline evidence

Authenticated API timing was not run because no QA session cookie was available to the read-only baseline runner. The runner correctly refuses Production-like targets and does not log in or create data.

| Surface | Evidence | Status |
| --- | --- | --- |
| Main application structural browser load | 34 requests, 2 API requests, approximately 1.7 MB transferred | PASS |
| Member Portal structural load | 11 requests, approximately 267 KB transferred | PASS |
| Platform Admin structural load | 12 requests, approximately 178 KB transferred | PASS |
| Authenticated Login/Dashboard/Members/Reports timing | Requires an approved QA session cookie | NOT VERIFIED |
| SQL query count and DB p50/p95/p99 | Requires authenticated QA data and Server-Timing capture | NOT VERIFIED |

## Root causes found

1. Several lazy screens had both a tab-router load trigger and an eager deep-link/active-tab load trigger. This could request the same resource twice during navigation.
2. Different frontend modules used local `fetch()` wrappers instead of the existing shared API boundary, preventing safe in-flight request reuse and consistent branch/section request context.
3. Branch bootstrap loaded independent branch/section work serially.
4. Assistant branch access was filtered in JavaScript after loading branch rows instead of being constrained in SQL.
5. Empty member attendance status input could initialize the attendance table/database path unnecessarily.

## Implemented optimizations

### Frontend

- Added in-flight GET request deduplication to `window.topGymApi`.
- Deduplication is limited to identical, signal-free GET requests and is removed when the Promise settles. This is not a stale response cache.
- The deduplication key includes path, credentials, cache mode and normalized headers, including the current branch/section context.
- Coaching and library reads now use the shared API boundary.
- Removed eager duplicate loads from attendance, store, coaching, intelligence, SaaS billing, permissions, feedback, subscription requests, portal analytics and reports. The tab-router event is the single lazy-load trigger.

### Backend / SQL

- Branch bootstrap now loads independent branch lists and section lists concurrently.
- Allowed branch filtering is performed in SQL with tenant and user-access predicates.
- Empty attendance-member input returns before attendance table setup or pool acquisition.
- No new index or schema migration was required by the reviewed changes.

## Verification after code changes

- Unit suite: `360/360 PASS`
- Frontend dedup focused tests: `3/3 PASS`
- Performance baseline contract tests: `12/12 PASS`
- Visual QA: `PASS`
- Build: `PASS`
- Database readiness: `PASS`
- npm audit: `0 vulnerabilities`
- `git diff --check`: `PASS`

The real authenticated before/after latency comparison remains `NOT VERIFIED` until an approved local/staging QA session is provided.

## VPS discovery

Target: `128.140.58.112`

| Item | Observed |
| --- | --- |
| OS | Ubuntu 22.04.5 LTS |
| CPU | 2 vCPU |
| RAM | 3.7 GiB total, 2.6 GiB available at inspection |
| Swap | 2 GiB |
| Disk | 38 GiB total, 29 GiB free |
| Timezone | UTC |
| Existing storage | `logicfit-storage` and storage proxy healthy |
| Existing backup service | Enabled/active daily timer at 02:30 UTC |
| Redis | Redis 6.0.16, loopback-only, `maxmemory 256mb`, `allkeys-lru` |
| Cache gateway | `logicfit-cache-gateway.service`, loopback `127.0.0.1:9400` |
| Public cache boundary | HTTPS `static.112.58.140.128.clients.your-server.de/logicfit-cache/*` via Caddy |
| Existing files/backups/cron | Unchanged |

Storage evidence was read-only: backups approximately 6.6 MB, media approximately 6.4 MB, object storage approximately 8.5 MB. No storage path or retention setting was changed.

## Redis production architecture

`REDIS INSTALLATION: PASS`

Redis is bound to `127.0.0.1`/`::1` with protected mode enabled, persistence disabled because it is cache-only, and a dedicated ACL user restricted to `logicfit:*` plus `GET`, `SET`, `DEL`, and `PING`. The VPS firewall was not broadened and port 6379 is not publicly reachable.

The public boundary is the existing Caddy HTTPS host. Caddy routes only `/logicfit-cache/*` to the gateway on `127.0.0.1:9400`; the gateway requires a separate bearer token, validates the namespace and payload size, and returns generic errors without logging values. The token is stored only in the VPS protected environment file and Vercel Sensitive Environment Variables.

The gateway was tested externally with HTTPS: authorized `PING` returned `200`, while an unauthenticated request returned `401`. Existing MinIO/storage health remained `PASS` after the Caddy reload.

## Deployed cache contract

```text
logicfit:{environment}:tenant:{tenantId}:{resource}:{scope}
logicfit:{environment}:platform:{resource}:{scope}
```

Candidate resources, subject to measured value and invalidation:

| Resource | Tenant scoped | Branch/Section scoped | Safe fallback | Current status |
| --- | --- | --- | --- | --- |
| Branding | Yes | No | SQL Server | CacheService integration |
| Branches | Yes | No | SQL Server | Not cached intentionally (user access varies) |
| Sections | Yes | Branch | SQL Server | CacheService integration after access check |
| Plans | Platform | No | SQL Server | Plan list cache integration |
| Capabilities | Yes | No | SQL Server | Not cached |
| Dashboard aggregates | Yes | Yes where applicable | SQL Server | Not cached |
| Members | Yes | Yes | SQL Server | Not cached intentionally |
| Attendance / payments / balances | Yes | Yes where applicable | SQL Server | Not cached intentionally |

`CacheService` uses short timeouts, SQL fallback on all gateway/Redis errors, deterministic `logicfit:{version}:{environment}:tenant:{tenantId}:...` or platform keys, in-flight coalescing, JSON validation, and bounded payloads. Plan and branding changes invalidate their keys; branch/section reads are cached only after the existing authorization check, and branch changes invalidate the branch section keys. Redis never replaces RLS, permissions, capabilities, or tenant checks.

## Remaining bottlenecks / gaps

- Authenticated p50/p95/p99 and DB query-count measurements are not available without a safe QA session.
- SQL Server execution-plan evidence (logical reads, seeks/scans, sort cost) was not collected because no approved test database/session was available for this run.
- Production cache hit/miss population is traffic-dependent; the production health endpoint verifies gateway reachability after release. The gateway and Redis service are healthy on the VPS.
- Authenticated p50/p95/p99 comparison still requires an approved QA session; no credentials were created or logged by this work.
