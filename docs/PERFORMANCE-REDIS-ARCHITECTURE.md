# Logic Fit Performance & Redis Architecture

Status: `IMPLEMENTED - DEPLOYED`

This document records the measured performance work for the current release and separates local structural evidence from read-only authenticated Production evidence.

## Scope and safety

- SQL Server remains the source of truth.
- Tenant isolation, RLS, permissions, capabilities, plans, branch/section scope, authentication and session storage were not weakened or moved.
- Migration 029 was not rerun. Migration 030 was not touched.
- No Production database, backups, media, or cron configuration was modified by this performance work.
- Redis is installed as a loopback-only cache on the VPS. Vercel reaches it only through an authenticated HTTPS gateway behind the existing Caddy TLS endpoint; raw port 6379 is not exposed.

## Baseline evidence

Authenticated timing was collected against the Production alias with an approved QA Owner account. The run logged in, sent GET requests with the read-only baseline header, and revoked the test session afterward; no business write was performed.

| Surface | Evidence | Status |
| --- | --- | --- |
| Main application structural browser load | 34 requests, 2 API requests, approximately 1.7 MB transferred | PASS |
| Member Portal structural load | 11 requests, approximately 267 KB transferred | PASS |
| Platform Admin structural load | 12 requests, approximately 178 KB transferred | PASS |
| Production authenticated login | 200; cold sample 2.09s-5.94s | PASS |
| Production authenticated Dashboard | 200; p50 4407ms, p95 4762ms, 97.5KB | PASS |
| Production authenticated Members | 200; p50 3565ms, p95 4994ms, 17.9KB | PASS |
| Production authenticated Attendance | 200; p50 3484ms, p95 3730ms | PASS |
| Production authenticated Reports | 200; p50 4811ms, p95 5251ms, 38.6KB | PASS |
| Production authenticated Branch bootstrap after read-only fix | 200 on 3/3 samples; p50 5099ms | PASS |
| Production Platform Admin dashboard | 200 on 3/3 samples; 0.72-1.60s, 11.6KB | PASS |
| Production Platform Admin tenants/requests/plans | 200 on 9/9 samples; 0.58-1.69s, 2.8-3.4KB | PASS |
| SQL execution-plan/logical-read evidence | Not exposed by the safe Production run | NOT VERIFIED |

### Production Server-Timing evidence

Production performance metrics were explicitly enabled for the read-only measurement release. The headers expose bounded aggregate timings only; no SQL text, rows, request bodies or secrets are logged.

| Endpoint | Samples | DB queries/request | DB wall time | DB work time | Total time | Payload |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `/api/bootstrap` | 3 | 17-23 | 3.46-5.11s | 4.22-11.46s | 4.74-6.27s | 103.2KB |
| `/api/dashboard` | 3 | 20 | 3.36-3.41s | 4.87-5.06s | 3.69-3.81s | 97.5KB |
| `/api/members` | 3 | 15-17 | 3.20-3.98s | 3.42-4.20s | 3.72-5.15s | 17.9KB |
| `/api/attendance` | 3 | 13 | ~2.78s | ~2.78s | 3.08-3.24s | 127B |
| `/api/reports` | 3 | 29 | 4.17-4.68s | 8.11-10.19s | 4.90-6.63s | 38.7KB |
| `/api/branches/bootstrap` | 3 | 19-21 | 3.82-4.75s | 4.25-5.18s | 4.35-5.38s | 1.0KB |
| `/api/platform-admin/dashboard` | 3 | 8 | 0.58-1.13s | 1.97-3.99s | 0.77-1.50s | 11.6KB |

The query count is the application request-level metric, not a claim about the number of SQL statements inside a multi-statement batch. SQL logical reads and actual execution plans remain intentionally unverified.

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
- Branch section authorization now combines tenant, branch existence and delegated access checks in one read, avoiding repeated `tenant → branch → access` lookups on context/bootstrap paths.
- Owner branch bootstrap reuses the already-authorized branch result instead of issuing a second all-branches query.
- Frontend branch bootstrap and attendance requests now reuse an in-flight request and abort stale attendance reads when search/context changes.
- No new index or schema migration was required by the reviewed changes.

## Verification after code changes

- Unit suite: `361/361 PASS`
- Frontend dedup focused tests: `3/3 PASS`
- Performance baseline contract tests: `12/12 PASS`
- Visual QA: `PASS`
- Build: `PASS`
- Database readiness: `PASS`
- npm audit: `0 vulnerabilities`
- `git diff --check`: `PASS`
- Production `/api/health`: `200`, database connected, cache healthy.
- Production `/api/health/live`: `200`.
- Final Production cache sample: `10` hits, `2` misses, `0` errors, `2` sets, average cache operation `207.45ms`.
- Post-optimization local regression: unit `360/360 PASS`, database readiness `19/19 PASS`, performance contracts `12/12 PASS`, and syntax checks for the changed JavaScript files `PASS`.
- Latest clean Production release: deployment `dpl_8AKFJZmqgXKUJgJJeTaEYu8LTvLe`, Git SHA `c9d6e704f2be95b114d5eb4e92c7bc2d503e4c4f`, ref `main`, Vercel `gitDirty` metadata absent. The production alias returned `/api/health=200`, `/api/health/live=200`, and the cache health probe returned `healthy` after this release.
- Authenticated endpoint remeasurement after the latest clean release: `NOT VERIFIED`. The authorized Production secret store exposes the Platform Admin email metadata but did not provide a password value to the local measurement process; no chat-shared password was copied into a command, file, log, or source. The earlier authenticated Server-Timing baseline remains valid and is not relabeled as post-release evidence.
- Current read-only health probes after the release: `/api/health=200`, database `connected`, storage `configured`, cache `enabled=true` and `status=healthy`. The process-local cache counters showed no new cache hit/miss during health-only probes; the previously measured cache sample remains `10 hits / 12 total cache reads` (83.33%) and is not relabeled as a fresh authenticated sample.

## VPS discovery

Target: `128.140.58.112`

Current SSH revalidation from the execution environment: `BLOCKED` (`publickey` authentication was denied). No password fallback was attempted. The VPS and Redis observations below are retained from the earlier approved read-only inspection and are not presented as a new direct SSH measurement.

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

- SQL Server execution-plan evidence (logical reads, seeks/scans and sort cost) was not collected because the safe Production run intentionally did not enable diagnostic SQL commands.
- Trainer Studio and Member/Trainer Portal authenticated p50/p95 require separate approved QA sessions; Gym Owner and Platform Admin coverage is verified above.
- Production cache hit ratio is instance/traffic dependent; the final observed sample had 10 hits and 2 misses with no errors.
- The dominant remaining latency is database/application cold-start and remote SQL work, with authenticated p95 values commonly in the 3.7-5.6s range.
- Production remeasurement of the branch-context/request-dedup patch is still required after its release; the numbers above are the pre-patch authenticated Server-Timing baseline.
- `ufw` is inactive on the VPS, but Redis and the gateway remain loopback-only; firewall hardening and the Redis 6.0.16 lifecycle review are separate operational follow-ups.

## 2026-09-09 autonomous performance pass

The following source-level optimizations were implemented after the earlier baseline. They do not change API contracts, tenant checks, RLS, permissions, plans, or database schema:

- Member list rendering no longer starts one `/api/members/:id/membership-code` request per row. `/api/members` already returns the tenant-scoped preview map in the same response, so pagination and refresh now render from that result directly.
- Branch bootstrap reuses the already-authorized branch rows when loading sections. The public `getBranchSections` path still performs its full tenant/branch/access check; only the internal bootstrap path avoids repeating that check once per authorized branch.
- Report generation now uses a summary-only dashboard query for the status and alert-count fields it actually returns, instead of hydrating dashboard alert rows and contact state that the report response does not expose.
- Independent report maintenance-table readiness checks now run concurrently before the report queries start.

### Direct VPS verification

The execution environment successfully authenticated to the approved VPS using the local credential file without printing or storing its password. Read-only checks confirmed:

- Redis service active; authenticated Redis `PING` passed.
- Redis 6.0.16, loopback-only (`127.0.0.1`/`::1`), protected mode enabled.
- `maxmemory=256mb`, `maxmemory-policy=allkeys-lru`, AOF disabled.
- Authenticated gateway `POST /ping` passed on `127.0.0.1:9400`.
- Port 6379 is not publicly bound; the HTTPS gateway remains the only external cache boundary.
- MinIO, storage containers, Caddy, cron and scheduled backup timers were present and running/healthy at inspection.
- Redis INFO counters are restricted by the application ACL; no ACL broadening was performed. Memory/eviction counters requiring an administrative Redis identity remain `NOT VERIFIED`.

### Measurement boundary

Authenticated p50/p95 for Dashboard, Members, Attendance, Reports and Bootstrap remains `BLOCKED` until an approved QA session and safe SQL diagnostic environment are supplied. No chat-shared password, authentication bypass, production write, migration, or schema/index change was used. Public health verification remains `PASS`; it is not relabeled as authenticated endpoint performance evidence.

## 2026-09-09 local authenticated QA verification

The missing authenticated measurement path was completed safely against the isolated local database `LogicFit_QA_20260907`. The runner creates only ephemeral local SQL access and ephemeral QA password hashes in the local QA database, logs in through the real authentication endpoint, and removes the temporary SQL login after the run. No Production credential, customer data, Production database, migration, or schema/index change was used.

The prepared QA fixture contained 500 synthetic members, 450 memberships, 450 payment rows and 450 attendance rows under Tenant 1. The application was mounted with the real Express routes, authentication, tenant context, RLS/readiness checks and services; schema bootstrap replay was not run against the prepared QA database.

### Authenticated API results

Five measured warm samples were collected after one warm-up request per route. Cache was intentionally disabled for this run so the result measures application/SQL behavior without attributing a cache benefit that was not measured.

| Endpoint | Warm p50 | Warm p95 | DB p95 | DB queries | Payload | Result |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| `/api/dashboard` | 68.07ms | 71.34ms | 49.11ms | 18 | 326,621B | PASS |
| `/api/members` | 37.24ms | 40.84ms | 33.61ms | 13 | 17,909B | PASS |
| `/api/attendance` | 16.64ms | 23.24ms | 20.02ms | 11 | 127B | PASS |
| `/api/reports` | 242.94ms | 251.69ms | 228.10ms | 26 | 481,793B | PASS |
| `/api/bootstrap` | 63.10ms | 66.04ms | 46.32ms | 15 | 331,954B | PASS |
| `/api/branches` | 16.39ms* | 23.82ms* | 17.49ms* | 10 | — | PASS |
| `/api/branches/bootstrap` | 25.87ms* | 29.71ms* | 24.19ms* | 17 | — | PASS |

`*` Branch measurements are five post-warm-up samples; the harness records the raw samples and Server-Timing headers separately from the baseline JSON report.

### Browser authenticated runtime

- Real Chromium login was completed against the local application with the ephemeral QA Owner account.
- Authenticated shell initial load: 4 API requests, 0 duplicate requests.
- Navigation through Dashboard → Members → Attendance → Reports: 0 duplicate API requests in the authenticated phase.
- Failed API requests: 0.
- Console errors: 0.
- The anonymous login page and the authenticated shell are intentionally measured as separate phases; their session/branding requests are not counted as duplicates of the authenticated shell.

### Backend correction included in this pass

`src/repositories/member.repository.js` had a real SQL Server CTE-scope defect: the reusable `member_rows` CTE embedded a `SELECT`, while `list()` appended a second statement. SQL Server therefore returned `Invalid object name 'member_rows'` for Members and Bootstrap in the prepared QA path. The CTE is now definition-only, and `findById()` owns its following `SELECT`. The regression contract test covers this scope requirement. After the correction, service diagnostics and both HTTP routes returned 200.

### Safe SQL evidence

The QA database Query Store is enabled in `READ_WRITE` mode and contains aggregate runtime statistics from the authenticated run. The top observed aggregate was an exercise-catalog query at approximately 112ms average and approximately 10,326 logical reads per execution; it is outside the core Gym Owner critical path and no index or schema change was applied. Query Store also recorded the members-list shape at approximately 14.62ms average and approximately 2,554 logical reads per execution. Full execution-plan XML/seek-vs-scan classification remains `NOT VERIFIED`; no Production SQL diagnostic command was run.

### Production boundary after local verification

These measurements are `LOCAL AUTHENTICATED QA`, not Production evidence. The source correction was released in commit `9f57f4af4f3a539b1cdaf19df7ca4f48c5df3925` as Vercel deployment `dpl_8MEnGvwbNKjE1D23akskwYSoGZGg`, which is Ready and aliased to `gym-membership-app-smoky.vercel.app`. Production read-only smoke returned `/api/health=200`, `/api/health/live=200`, and unauthenticated protected endpoints returned `401`.

Authenticated Production verification of the CTE correction remains `NOT VERIFIED` because no approved Production QA session was available without using a password from chat history. The local authenticated result therefore remains the functional evidence for this release, while Production health and routing are separately verified. Production warm health samples were approximately 516–655ms after the cold sample; the remote cache operation decreased from approximately 412ms to 211ms across the sample set, making Redis gateway latency a remaining Production bottleneck rather than a reason to mislabel the application as fully instant.
