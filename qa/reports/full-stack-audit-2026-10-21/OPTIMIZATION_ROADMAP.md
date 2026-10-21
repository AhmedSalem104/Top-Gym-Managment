# Optimization roadmap (proposal only)

## Consolidated priority matrix

| Rank | Work | Why | Gate / success evidence |
|---|---|---|---|
| P1 | Make mobile refresh-token rotation atomic | Source read-then-revoke race | Auth review + unit/DB integration test: synchronized reuse yields one successful rotation |
| P1 | Establish actual rate-limit deployment semantics | Local in-memory counters are not distributed | Verify topology/config; if needed use approved atomic shared adapter; test outage/fail-closed and key scopes |
| P1 | Cross-tenant and object-level authorization regression matrix | Static architecture cannot prove every route | Isolated synthetic tenant/role browser/API tests; no cross-scope sentinel disclosure |
| P1 | Verify attendance unique constraint and concurrent check-in behavior | Code catches unique violation but deployed enforcement unknown | Migration-ledger/schema evidence + isolated concurrent test |
| P2 | Instrument and baseline representative workflows | No measured performance baseline | Repeated cold/warm production-build/staging runs; p50/p75/p95, request count, bytes, DB timing |
| P2 | Profile high-cost feature payloads and DB operations | Report/store/list paths are candidates only | Browser trace + correlated DB metrics + query plans |
| P2 | Verify cache key partitioning/invalidation | Optional cache gateway and unknown effective setup | Cache audit by tenant/user/role/branch/section/filter/page/locale; mutation/logout/context invalidation tests |
| P2 | Complete security headers/CSRF/XSS/upload review | Static gaps and prior audit debt | Staging security tests, CSP report-only plan, no regression to inline/runtime features |
| P3 | Frontend bundle and module-loading refinement | Legacy shell/large optional feature candidates | Bundle analyzer + actual navigation waterfall; defer only measured non-critical work |
| P3 | Public indexing and SEO policy | No robots/sitemap found; product public surface unclear | Product owner host/page policy then crawler validation |

## Quick wins (low-risk evidence work)

1. Generate a normalized route registry test/report from `src/routes` and compare it with API docs.
2. Add a staging-only, read-only browser network baseline to existing `perf:baseline`; do not use production for load tests.
3. Publish a non-secret production configuration attestation during release.
4. Add a regression test for failed/zero-row refresh-token consume before changing implementation.
5. Add a test proving app/static API cache headers follow the intended private/public classification.

## Safe implementation sequence

**A. Evidence:** authorized staging, synthetic data, browser network/performance traces, query plans, release configuration inventory. **B. Security correctness:** atomic refresh and attendance enforcement only after contract/schema review; update Mobile Blueprint for any auth/attendance contract change. **C. Data isolation:** route-level cross-tenant/role tests and cache invalidation tests. **D. Performance:** implement one measured bottleneck per change, before/after same conditions, rollback path. **E. Operations:** backup restore rehearsal and alert thresholds in isolated/approved environment. Each stage has independent tests and review.

## Baseline vs targets

| Category | Current audit baseline | Target setting |
|---|---|---|
| LCP/CLS | NOT MEASURED | Aim LCP ≤2.5s, CLS ≤0.1 under stated lab conditions; confirm with field data |
| INP | NOT MEASURED | Use real-user field data; do not infer from lab-only test |
| API/database p95 | NOT MEASURED | Establish per-route baseline before numeric SLO |
| JS/CSS bytes/long tasks | NOT MEASURED | Compare production build and traces, no arbitrary budget claims |
| Availability/error rate | NOT VERIFIED | Define SLO after provider telemetry review |
| RPO/RTO | NOT VERIFIED | Record measured isolated restore results |

## Executive recommendation

Do not perform a broad refactor or infrastructure purchase based on this static audit. First collect safe, scoped runtime evidence, then address the two concrete correctness/control-plane risks (refresh rotation and distributed rate-limit semantics) under review. No change or deployment is part of this report.
