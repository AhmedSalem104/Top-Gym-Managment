# 15 — Performance Strategy

## Current evidence

The Web project has `src/middleware/performance-metrics.js`, `scripts/performance-baseline.js`, cache service/gateway support, lazy feature loading, component loading states, and SQL performance tests. These establish measurement patterns but do not provide mobile device baselines.

## Proposed budgets

| Metric | Initial target | Measurement |
| --- | --- | --- |
| cold start to usable entry | ≤ 2.5s on representative mid Android; ≤ 2.0s warm | device trace |
| bootstrap network waterfall | ≤ 3 sequential blocking requests | request trace |
| first meaningful workspace | ≤ 3.5s on slow 4G after auth | E2E trace |
| list scroll | sustained 55–60 FPS on target lists | native performance profiler |
| screen transition | no visible blank > 200ms after prefetched data | trace/video |
| memory | no unbounded list/image growth | Android/iOS profiler |
| crash-free sessions | ≥ 99.5% release target | crash service |

These are proposed acceptance budgets, not current measured facts. Large data domains must use pagination/virtualization; images use size-aware caching; uploads stream or constrain memory; server queries remain the performance authority.

## Avoided work

Do not duplicate analytics/business calculations in mobile, fetch all members/clients, persist entire server payloads, or preload every workspace. Feature entry should load the smallest API set needed for the task and reuse central query/cache services.
