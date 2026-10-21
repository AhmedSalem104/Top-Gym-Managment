# Engineering Standards — Logic Fit

**Purpose:** Persistent, project-wide safeguards for security, performance, data integrity, reliability, and maintainability. These standards guide future changes; this document is not a claim that the whole system has recently passed a full audit.

**Authority:** Read with the repository [`AGENTS.md`](../../AGENTS.md), the [Logic Fit V2 Design System](../LOGIC_FIT_V2_DESIGN_SYSTEM.md), the applicable [Mobile Blueprint](../mobile-blueprint/README.md), and the relevant domain/production procedures. The more specific security, tenancy, financial-ledger, UI ownership, and release requirements in those sources remain authoritative. Use the stricter compatible requirement where standards overlap.

## 1. Required change-impact analysis

Before implementation, identify the affected modules and proportionately assess:

1. Authentication, authorization, sensitive data, tenant/branch/section isolation, and RLS.
2. API contracts, validation, request sizes/timeouts, rate limiting, retries, and idempotency.
3. Concurrent writes, transaction boundaries, uniqueness/integrity constraints, and stale responses.
4. Database query shape, pagination, indexes/query plans, migrations, and recovery implications.
5. Frontend requests, caching, cancellation, rendering, accessibility, bundle and responsive impact.
6. Reliability, logs/metrics, failure handling, operational dependencies, and rollback.
7. Mobile Flow/Blueprint impact; public-page SEO/AEO/GEO impact only where applicable.
8. Focused tests, regression risks, and evidence needed to close the change.

Small isolated changes may use a brief checklist. Sensitive, cross-cutting, financial, tenancy, migration, or infrastructure changes require a deeper documented review before editing. Do not widen scope for unrelated opportunities; record them separately.

## 2. Security and privacy

- Preserve authentication, authorization, least privilege, session protections, CSRF protections, input validation, output encoding, and safe error handling. Enforce access on the server; hiding a control in the UI is not authorization.
- Scope every tenant-owned read and write to the authenticated tenant and applicable user, branch, and section permissions. Never trust a client-supplied tenant or scope without server-side validation. Preserve RLS context and the production tenant-inspection procedure in `AGENTS.md`.
- Treat request values, uploaded files, webhook data, external responses, and stored user content as untrusted. Use parameterized SQL and allowlisted dynamic identifiers; validate type, size, range, format, and ownership.
- Do not expose secrets, credentials, session material, personal/financial data, SQL text, or internal exceptions in source, documentation, screenshots, URLs, logs, or command output. Use the approved secret/configuration channel.
- Review dependency and CI supply-chain changes. Do not weaken security checks to make a build or test pass.
- Distinguish source review from runtime security evidence. Do not claim penetration-test, production-secret, distributed-rate-limit, or cross-tenant runtime verification unless it was actually performed in an authorized isolated environment.

## 3. API protection and efficiency

For every added or materially changed endpoint, review:

- Authentication and server-side permissions, including tenant/branch scope.
- Schema validation, request/response size bounds, timeouts, and safe errors.
- Endpoint-appropriate abuse controls: per-user/tenant/IP limits where justified, protection for expensive searches/exports/uploads and authentication flows, and correct `429`/`Retry-After` behavior.
- Retry safety and idempotency for operations that create effects; never retry financial or other writes blindly.
- Query pagination and bounded result size for growing collections.
- Duplicate requests, cancellation, stale responses, cache scope/freshness/invalidation, and shared-layout calls.

Do not add a universal rate limit or cache policy without considering legitimate usage and data sensitivity. User, member, subscription, payment, and other sensitive data must not enter shared/public caches. A cache never substitutes for authorization. Preserve immediate correctness after writes and isolate cached data by all result-affecting identity and scope dimensions.

For page-level work, count statically identifiable API calls and separately label measured runtime counts. Record payload sizes/latency only when measured; do not invent request budgets or timings.

## 4. Concurrency and data integrity

For shared-state operations, examine double submission, parallel clients, retries after lost responses, check-then-act logic, stale reads, job duplication, and scope changes during requests. Use the existing transaction, constraint, lock, or idempotency mechanisms where appropriate; frontend button disabling alone does not prevent concurrent writes.

Protect financial, membership, attendance, inventory, subscription, backup/restore, and permission workflows especially carefully. Do not change transaction meaning, ledger facts, accounting semantics, historical attribution, or state transitions for a visual/performance optimization. Follow the financial-ledger rules in `AGENTS.md`.

Never run destructive or concurrent-write verification against Production. Use isolated synthetic data and explicit environment guards for write/concurrency tests.

## 5. Database and migrations

- Inspect the actual query, indexes, constraints, transactions, and (when available) representative execution plans before proposing optimization. Add indexes only with measured/query-plan justification and write-cost review.
- Avoid N+1 access, unbounded reads, unnecessary columns, and unbounded in-memory processing. Preserve exact financial and domain semantics when aggregating or paginating.
- Runtime request paths may only perform the read-only schema checks allowed by project policy. DDL, backfills, and reconciliation use the approved migration/release process.
- Classify migrations for safety, transactionality, compatibility, tenant/RLS coverage, recovery, and rollback. Use expand/contract when prior application versions must remain runnable. Never infer applied migrations from filenames; the migration ledger is authoritative. Respect the forbidden migration versions in `AGENTS.md`.
- Do not run migrations, seed data, restore backups, or modify database records unless explicitly authorized and routed through the approved process.

## 6. Frontend and user experience

- Preserve existing routes, workflows, permissions, contracts, and design-system ownership. Use the canonical Logic Fit V2 tokens/components; do not create parallel systems or uncontrolled overrides.
- Avoid redundant requests, unnecessary re-renders, render-blocking work, unbounded DOM, excessive bundles, memory/listener/timer leaks, and stale async updates. Measure before claiming a bottleneck or performance improvement.
- Use lazy loading where it improves real critical-path cost without delaying essential content. Preserve loading, empty, error, retry, and reduced-motion/accessibility behavior.
- Verify responsive layouts, keyboard/focus behavior, Arabic RTL and English LTR, and supported themes for affected interfaces. Keep private SaaS content out of public indexing and shared caches.
- For user-facing strings, preserve localization. For print/PDF behavior, validate actual rendered output when layout is in scope.

## 7. Reliability, observability, and capacity

- Bound external calls, uploads, concurrency, queues, retries, payloads, and resource-intensive operations. Set or preserve appropriate timeouts; avoid retry storms and infinite loops.
- Handle dependency/database/network failures explicitly and fail closed for authorization, tenancy, security, and backup-integrity checks. Keep user-facing errors actionable without disclosing internals.
- Preserve safe observability: structured bounded error codes and useful timing/count metrics, with no secrets or sensitive payloads. Consider graceful shutdown, health/readiness, backup restoration, rollback, and single points of failure when the change touches operations.
- Do not infer concurrency capacity or scalability from a successful build or a few requests. Load/stress testing requires an isolated environment and explicit authorization.

## 8. SEO, AEO, and GEO scope

Apply crawlability, semantic HTML, metadata, canonical/locale links, structured data, and answer-oriented content checks to public pages when they are changed. Private/authenticated dashboards, member data, and operational routes must remain protected and non-indexable as appropriate. Never expose private content to improve search visibility or promise rankings/citations.

## 9. Evidence and testing gates

Choose tests proportional to risk and run the relevant existing checks. For changed business/API/security behavior, include appropriate validation, authorization, tenant/branch isolation, error, retry, and concurrency coverage. For UI changes, cover function, responsive layout, themes, RTL/LTR, keyboard/accessibility, and actual screenshots/browser runs where available.

Record results as:

| Gate | Required report values |
|---|---|
| Security / authorization / tenant isolation | PASS, FAIL, NOT VERIFIED, or N/A with evidence |
| API contract, efficiency, rate limiting | PASS, FAIL, NOT VERIFIED, or N/A |
| Concurrency / idempotency | PASS, FAIL, NOT VERIFIED, or N/A |
| Database integrity / migration | PASS, FAIL, NOT VERIFIED, or N/A |
| Performance / reliability | PASS, FAIL, NOT VERIFIED, or N/A; measured versus estimated |
| Regression / accessibility / responsive | PASS, FAIL, NOT VERIFIED, or N/A |
| SEO/AEO/GEO | PASS, FAIL, NOT VERIFIED, or N/A |

Never claim a test, benchmark, screenshot comparison, production check, or security property passed unless the evidence exists. Separate `CONFIRMED`, `POTENTIAL RISK`, `NOT VERIFIED`, and `NOT APPLICABLE` findings. State test environment, route/sample, and limitations where relevant.

## 10. Release and change completion

- Follow the production release/migration pipeline and exact-SHA rules in `AGENTS.md`. Before release, isolate intended paths, inspect staged diff, run applicable gates, scan for secrets, preserve unrelated work, and retain a rollback path.
- Do not deploy, edit live production files, mutate production data/configuration, or perform high-risk infrastructure changes without the authorization and approved pipeline required by project policy.
- Close with a concise report: modified files, behavior/contracts affected, tests and evidence, applicable quality-gate statuses, remaining risks, rollback considerations, and the required Mobile Impact fields from `AGENTS.md`.

## 11. Project evidence snapshot and verification debt

The repository contains project-specific evidence that must be rechecked before reuse:

- [`SECURITY-AUDIT.md`](../SECURITY-AUDIT.md) labels itself static/local, dated 2026-08-29, and explicitly leaves authenticated Staging attack-matrix checks, dedicated production secret rollout, distributed rate-limit deployment, SQL TLS trust configuration, and isolated backup-restore rehearsal as verification/deployment concerns. Its statuses are historical snapshots, not a current independent assessment.
- [`PHASE-1-STATIC-AUDIT.md`](../PHASE-1-STATIC-AUDIT.md) identifies large or potentially unbounded report/store reads, contains-search scalability risks, and distributed runtime schema-ensure paths; it states several impacts require measurements/query plans. Do not describe these as measured bottlenecks without new evidence.
- [`PERFORMANCE.md`](../PERFORMANCE.md) documents the guarded, read-only local/Staging performance baseline runner. Follow its environment allowlists and request limits; it blocks Production targets and is not a load-test tool.
- [`MULTI-BRANCH-ARCHITECTURE-AUDIT.md`](../MULTI-BRANCH-ARCHITECTURE-AUDIT.md) records branch-scope design and risks. Verify against current services, RLS, and tests before treating any implementation detail as current.

At the time these standards were added, the repository did **not** contain the full twelve-file audit deliverable set requested in the master audit prompt (including a project-wide page/API inventory and complete infrastructure/security/race-condition reports). Existing reports are partial and of differing dates/scopes. Any further comprehensive audit should produce the missing evidence before claiming full coverage; this setup task does not perform that audit.

## 12. Required Mobile Impact report fields

Every final Logic Fit task report must include exactly the applicable status in this form:

```text
MOBILE IMPACT: NONE / UPDATED
MOBILE BLUEPRINT: PASS / N/A
UPDATED MOBILE DOCS: [files]
```

When no cross-platform domain/API/permission/flow contract changes, state `MOBILE IMPACT: NONE`, `MOBILE BLUEPRINT: N/A`, and `UPDATED MOBILE DOCS: []`, with a brief reason. When an applicable contract changes, follow the synchronization workflow in `AGENTS.md` and report the updated documents.
