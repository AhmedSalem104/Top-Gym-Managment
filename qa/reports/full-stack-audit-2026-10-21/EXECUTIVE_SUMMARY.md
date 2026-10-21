# Executive summary

## Overall assessment

The repository documents a Node 24 / Express 4 modular monolith, Vanilla HTML/CSS/JS frontend, SQL Server via `mssql`, tenant-aware request context, and a GitHub Actions production release pipeline. The architecture is legible and has meaningful safeguards (parameterized SQL, a tenant-aware pool wrapper, API no-store headers, request IDs, transaction/idempotency patterns for some financial writes, backup/release gates). This is a **static code audit**, not a runtime security or performance certification.

### Highest-priority findings

| Priority | Finding | Evidence | Confidence |
|---|---|---|---|
| P1 | Mobile refresh-token rotation has a read-then-unconditional-consume sequence; concurrent requests can both read an active row before either revokes it. The update result is not checked before issuing new sessions. | `src/services/auth-service.js`, `mobileRefresh()` | Confirmed code pattern; exploitability/runtime effect not tested |
| P1 | In-memory rate-limit counters are per process. They cannot provide a shared limit across multiple instances unless a configured shared store is supplied and actually enabled. | `src/middleware/rate-limit.middleware.js`; `src/config/env.js` | Confirmed default implementation; production wiring NOT VERIFIED |
| P1 | Attendance `checkIn` performs a uniqueness-dependent insert and handles SQL duplicate-key errors, but database constraint/index and transaction semantics must be verified against deployed schema and concurrency tests. | `src/services/attendance-service.js` | Static evidence; deployed constraint NOT VERIFIED |
| P2 | Feature surface is broad: `src/routes/index.js` registers 27 route modules plus health endpoints; 366 route-registration source lines were found. Runtime endpoint inventory/authorization behavior still requires route tests. | `src/routes/index.js`, `src/routes/*.routes.js` | Confirmed static count |
| P2 | Several service modules retain legacy SQL and the frontend retains a large central `public/js/app.js`; maintainability/performance risks are documented, but no profiling establishes current user-visible cost. | `docs/ARCHITECTURE.md` | Confirmed documentation |
| P2 | Production observability is opt-in; central log shipping, alerting, actual timings, DB latency, and storage health are not established by repository inspection. | `docs/OBSERVABILITY.md`, `src/config/env.js` | Confirmed configuration model; deployed flags NOT VERIFIED |
| P2 | No `robots.txt` or sitemap was found in the inspected public file set; HTML metadata coverage is incomplete/private-page oriented. Public indexing policy needs an explicit product decision. | `public/` static scan | Static scan; deployment routing NOT VERIFIED |

## Audit numbers

- Route modules registered: **28**; health/liveness endpoints: **2**.
- Route registration source lines: **366** across route files (not necessarily 366 unique effective URLs; aliases/conditional middleware may exist).
- Frontend feature files with `/api/` text matches: **21 files**, **175 matches / 154 matched lines** in the bounded scan of `public/js/pages` (not runtime requests; central app/shared API and dynamic URL construction require additional mapping).
- Main user-facing HTML files discovered: 11, plus 4 dialog fragments (exact index in architecture/API report).
- Runtime API request counts: **NOT MEASURED**.
- Production configuration, traffic, data volumes, latency, throughput, query plans, Core Web Vitals: **NOT VERIFIED / NOT MEASURED**.

## 20 executive questions — concise answers

1. **Architecture?** Modular monolith; Express composition root, domain routes/controllers/services, partial repository layer, SQL Server.
2. **Frontend?** Vanilla HTML/CSS/JS, hash navigation, lazy feature loader; legacy central shell remains.
3. **Largest proven frontend bottleneck?** None proven without browser profiling. Large legacy shell and broad page modules are candidates, not measured bottlenecks.
4. **Largest proven backend bottleneck?** None proven without production/staging timings. Report/query services and synchronous aggregate paths need profiling.
5. **N+1?** Cannot certify globally from static sampling; inspect/report each service query with telemetry and query plans.
6. **Duplicate API requests?** Not measurable from source alone; require network capture on representative workflows.
7. **Slow database queries?** No plans or live timings obtained; do not add indexes by guess.
8. **Cache?** Optional gateway/cache config exists, disabled by default in config; deployed enablement and key isolation NOT VERIFIED.
9. **Rate limits?** Login, sensitive writes, member portal, backup controls exist; in-memory defaults do not create a distributed guarantee.
10. **Race conditions?** Mobile refresh rotation is a concrete candidate; financial idempotency/transactions exist in parts; attendance constraint requires deployed verification.
11. **Tenant isolation?** Tenant context is applied by the pool wrapper and architecture says SQL Server RLS; cross-tenant runtime tests NOT VERIFIED.
12. **Security vulnerabilities?** No dynamic security testing performed. Static review finds important validation gates; historical security debt remains relevant but is not current production proof.
13. **SEO?** Product is primarily authenticated SaaS. Public marketing/indexing posture and metadata need explicit confirmation; no sitemap/robots discovered.
14. **Availability/scaling?** Repo describes a single reverse-proxy upstream and bounded SQL pool per process; actual topology and HA NOT VERIFIED.
15. **Monitoring?** Request IDs and opt-in timing telemetry exist; deployed collection/alerts NOT VERIFIED.
16. **Backup/restore?** Release pipeline and backup verification scripts exist; live verified recovery and RPO/RTO NOT VERIFIED.
17. **What can safely optimize first?** Measure before changing; then fix atomic refresh rotation, establish cross-instance rate-limit policy, and profile page/API/SQL critical paths.
18. **What must not be changed speculatively?** DB indexes, cache TTLs/keys, payment/attendance semantics, pool size, and production infrastructure.
19. **Did this audit change code or production?** No.
20. **Is the system production-certified by this report?** No; this report is a static audit and lists required runtime verification.

## Baseline / target

| Metric | Baseline | Target / decision rule |
|---|---|---|
| Cold/warm LCP, CLS, INP | NOT MEASURED | Measure authenticated representative flows on defined device/network; use field data for INP |
| Page/API latency and request count | NOT MEASURED | Capture repeated runs; report median and p75/p95 with conditions |
| SQL critical path/query count | NOT MEASURED | Enable approved staging instrumentation; correlate request IDs |
| JS/CSS transfer/parse | NOT MEASURED | Production build + browser network/coverage; compare before/after |
| Error rate, availability, saturation | NOT VERIFIED | Obtain provider metrics/alerts over a representative period |
| Recovery objectives | NOT VERIFIED | Approved isolated restore exercise; record measured RPO/RTO |

## Coverage and limitations

Static inspection covered repository docs, package/build scripts, route registry, middleware/config/pool, sampled domain services and frontend feature modules, deployment descriptors, and existing audit documentation. It did **not** include authenticated browser usage, staging or production API calls, SQL Server execution plans/data, secrets/environment configuration, provider dashboards, DAST, load/concurrency tests, or independent penetration testing. Dynamic execution was intentionally not performed under the supplied audit's approval boundary.
