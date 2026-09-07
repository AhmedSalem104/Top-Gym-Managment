# Logic Fit Performance & Redis Architecture

Status: `PARTIAL`

This document records the measured performance work for the current release. It intentionally separates verified local/browser evidence from measurements that require an authenticated QA session or a secure Redis connectivity path.

## Scope and safety

- SQL Server remains the source of truth.
- Tenant isolation, RLS, permissions, capabilities, plans, branch/section scope, authentication and session storage were not weakened or moved.
- Migration 029 was not rerun. Migration 030 was not touched.
- No Production database, backups, media, or cron configuration was modified by this performance work.
- Redis was not exposed publicly and was not installed because the required secure Vercel-to-VPS path is not present.

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

- Unit suite: `355/355 PASS`
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
| Redis before mission | Not installed; port 6379 not listening |
| Existing files/backups/cron | Unchanged |

Storage evidence was read-only: backups approximately 6.6 MB, media approximately 6.4 MB, object storage approximately 8.5 MB. No storage path or retention setting was changed.

## Redis decision

`REDIS INSTALLATION: BLOCKED`

The VPS has no existing private network path, WireGuard/Tailscale/VPN, SSH tunnel, TLS Redis endpoint, or authenticated HTTPS cache gateway for Vercel. UFW is inactive and iptables accepts inbound traffic. Opening port 6379 would create an unacceptable public Redis exposure, so Redis was not installed or exposed.

Required before Redis integration:

1. Approve a secure architecture: managed Redis with TLS, a private VPN/network path, or an authenticated HTTPS cache gateway with a narrowly scoped cache API.
2. Provide the corresponding runtime configuration through Vercel/VPS secret management, without committing secrets.
3. Re-run connectivity, fallback, tenant-key isolation and before/after measurements.

## Planned cache contract (not deployed)

The following is the intended contract once secure connectivity exists; it is not an assertion that Redis is active in the current release.

```text
logicfit:{environment}:tenant:{tenantId}:{resource}:{scope}
logicfit:{environment}:platform:{resource}:{scope}
```

Candidate resources, subject to measured value and invalidation:

| Resource | Tenant scoped | Branch/Section scoped | Safe fallback | Current status |
| --- | --- | --- | --- | --- |
| Branding | Yes | No | SQL Server | Not cached |
| Branches | Yes | No | SQL Server | Not cached |
| Sections | Yes | Branch | SQL Server | Not cached |
| Plans / Feature Catalog | Platform or tenant | No | SQL Server | Not cached |
| Capabilities | Yes | No | SQL Server | Not cached |
| Dashboard aggregates | Yes | Yes where applicable | SQL Server | Not cached |
| Members | Yes | Yes | SQL Server | Not cached intentionally |
| Attendance / payments / balances | Yes | Yes where applicable | SQL Server | Not cached intentionally |

Any future CacheService must use short timeouts, SQL fallback on all Redis errors, deterministic tenant-safe keys, versioned namespaces, and invalidation on plan, branding, branch, section and relevant write operations. Redis must never replace RLS or authorization checks.

## Remaining bottlenecks / gaps

- Authenticated p50/p95/p99 and DB query-count measurements are not available without a safe QA session.
- SQL Server execution-plan evidence (logical reads, seeks/scans, sort cost) was not collected because no approved test database/session was available for this run.
- Redis installation, secure connectivity, CacheService, cache invalidation, hit ratio and Redis before/after metrics are blocked by the missing secure Vercel-to-VPS path.
- The Redis-dependent portion is not deployed. The code-only request/SQL optimizations in this release do not require Redis and can be deployed independently; the exact release identity is recorded in the handoff report.
