# Phase 1 — Static Performance and Query Audit

**Status:** `IN PROGRESS`

**Authenticated real baseline:** `PENDING`

**Runner:** `VERIFIED`

**`baseline-before.json`:** not produced. The runner correctly refuses to
start an authenticated measurement without an explicitly supplied Local or
Staging session cookie. No login or auto-login path is used.

**Audit date:** 2026-08-29

**Code revision audited:** `21c69ec perf: keep report reads baseline-safe`

This document records findings that can be established from source and schema
inspection without inventing latency numbers or touching the live database.
Execution-plan and workload conclusions remain verification debt until an
authenticated Local/Staging baseline is available.

## Evidence and method

The audit covered:

- `src/repositories/**`
- `src/services/**`
- `src/controllers/**`
- `src/routes/**`
- `database/schema.sql`
- `database/migrations/*.sql`
- `src/database/**`
- the permanent read-only baseline runner in `scripts/performance-baseline.js`

The following facts are static evidence, not runtime benchmarks:

- Member list reads use server-side pagination and an explicit page-size cap.
- Dashboard and analytics use batched SQL and parallelize independent reads.
- Member list enrichment uses two batched reads (`membership code previews` and
  `attendance statuses`); no per-member read loop was found there.
- Platform tenant lists and library lists use server-side pagination.
- The reusable SQL pool is process-scoped and reset after a failed connection.
- The transaction helper commits on success and attempts rollback on failure.
- The static index declaration inventory contains **61 declarations / 59 unique
  names** across the canonical schema and migration SQL. This is not a live
  database catalog inventory and does not prove that every declaration exists
  in the hosted database.
- The baseline runner and SQL guard enforce GET/HEAD/OPTIONS-only execution and
  never send a login request.
- Member-list/detail reads skip membership-code schema setup and backfill in
  the read-only baseline context; the prepared database remains a prerequisite
  for those columns and tables.

## Domain inventory

| Domain | Current read path | Static finding | Evidence / status |
| --- | --- | --- | --- |
| Members | `member.repository.js`, `member-service.js` | Server pagination exists; list projection is generated through a CTE; search uses `%term%` over name/phone/email. | Query-shape improvement is safe; search/index changes are pending workload evidence. |
| Search | Members, store, coaching, library, attendance, day-pass and platform services | Several searches use contains matching (`LIKE '%term%'`). This can prevent a normal B-tree seek for large datasets. | `CANDIDATE — PENDING BASELINE/EXECUTION PLAN`; no index or search semantics changed. |
| Dashboard | `member-service.getDashboard`, `dashboard.controller`, optional store dashboard | Member dashboard is one SQL batch plus optional store work. Store dashboard reuses report inventory but still loads a complete active inventory set. | Large-tenant payload/DB work is a high-priority measurement target. |
| Analytics | `analytics-service.getDashboardAnalytics` | Current-period detail rows are returned to Node and grouped into trends/distributions. Current and previous reads are parallelized. | Aggregation/payload optimization is `CANDIDATE — PENDING BASELINE`; do not change financial semantics before measurement. |
| Attendance | `attendance-service.js` | Today reads are bounded by the route; report reads are bounded to 366 days but do not expose a detailed-row page size. Read paths can also run table-ensure code unless the prepared read-only path is used. | Payload and table-initialization behavior require authenticated baseline verification. |
| Reports | `report-service.js` | Multiple independent queries run in parallel, but period detail rows and debtor rows are bounded by `TOP (1000)` rather than an explicit report pagination contract. Other period detail queries are range-bounded but not row-paginated. | High payload/latency risk; execution plans and representative date ranges are required. |
| POS / Store | `store-service.js` | Product, purchase, sale and movement lists paginate; inventory and store-expense reads can be unbounded. Product pagination is applied to joined product/variant rows, so one product's variants can be split between pages. | High correctness/performance candidate; preserve response contract while redesigning only after baseline. |
| Platform Admin | `platform-admin-service.js` | Tenant list and several nested lists are paginated; dashboard intentionally fans out several independent read queries. | Requires authenticated PlatformAdmin baseline to rank. |
| Member Portal | `library-service.js` and portal routes | Library list reads use page/size parameters and a capped page size. | Safe static result; real portal latency remains pending. |

## Findings by priority

### High — large or potentially unbounded reads

1. **Reports return large period datasets.** `report-service.js:getReportData`
   reads member/payment/expense/membership details and debtor rows in the same
   request. Some queries use `TOP (1000)` while others are only date-bounded.
   The response is then transformed in Node. The impact depends on tenant size,
   date range and hosted SQL latency, so this must be measured before choosing
   pagination or SQL aggregation changes.

2. **Store inventory is not server-paginated.** `store-service.js:listInventory`
   returns the complete grouped inventory result. `getReports` and
   `getDashboard` reuse it, which makes inventory size a direct dashboard/report
   payload risk.

3. **Store expenses are not server-paginated.** `listStoreExpenses` returns all
   rows in the selected date range when profit data is requested. This is a
   candidate for an aggregate-first response or explicit detail pagination;
   financial totals must remain exact.

4. **Search contains matching is widespread.** Members, store customers and
   products, coaching, library, attendance, day-pass and platform tenant search
   use contains patterns in at least one path. This can become an index scan as
   tenant data grows. No speculative index was added.

5. **Runtime schema ensure calls are distributed across services.** The service
   promises prevent repeated work within one process for some domains, but read
   requests still enter ensure functions in legacy paths. The prepared baseline
   server and the read-only guards prevent those schema writes during the runner;
   moving all schema work into reviewed migrations remains a production
   hardening item.

### Medium — proven code-shape improvements, not yet benchmarked

1. Training reads previously used `SELECT *` for external trainees,
   measurements, workout sessions and workout sets. Those reads now project
   only the fields consumed by their mappers; the response contract is
   unchanged.

2. `member-service.js:getDashboard` uses an explicit member projection for the
   temporary table and alert rows. The generic backup exporter remains an
   intentional `SELECT *` because a backup must preserve the complete row
   shape.

3. `store-service.js:bootstrap` calls three independent read services
   sequentially. It is a safe `Promise.all` candidate after read-only table
   initialization is respected; this should reduce wall latency without adding
   SQL concurrency to the main dashboard path.

4. The duplicate-member guard performs a full member read on a write path before
   inserting. It is not a read-hot-path N+1 issue, but it is a future write
   scalability candidate. A uniqueness/normalization strategy must be designed
   before changing it.

### Low / informational

1. `SELECT *` remains intentional in the generic backup table exporter because a
   backup must preserve the complete row shape. It should not be replaced with
   a hand-written projection.

2. Any remaining wildcard reads in write-side locking/compatibility paths are
   not automatically performance bugs; each requires a response-contract and
   transaction review before modification.

3. Correlated `OUTER APPLY` and scalar subqueries in reports/coaching are SQL
   operators inside one request, not application-level N+1 round trips. Their
   actual cost requires execution plans and representative data.

## N+1 and round-trip review

No confirmed GET list N+1 was found in the main members path:

- the member page is one repository query;
- membership-code previews are batched;
- attendance statuses are batched;
- dashboard/report independent reads use `Promise.all` or SQL batches in the
  inspected paths.

Loops found in store sales, purchases, returns, backups, branding publication,
and permission seeding are write/transaction or administrative workflows. They
must not be parallelized as a performance shortcut because inventory, financial
atomicity, audit ordering or restore integrity can be affected.

## Pagination review

Confirmed server-side pagination exists for members, platform tenants, library
lists, coaching client lists, store products, purchases, sales and stock
movements. The following need a measured design review:

- reports detailed datasets;
- attendance report details;
- store inventory;
- store expenses;
- any dashboard response whose alert source is a full inventory read;
- joined product/variant pagination, which can split a product across pages.

The baseline runner uses small read-only page sizes and does not request
unbounded artificial datasets.

## Transaction boundaries

`src/database/transaction.js` has a single reusable transaction helper with
commit-on-success and rollback-on-error. Store, payment, renewal, refund and
inventory writes intentionally use transactions and should not be changed by a
read-only performance audit. The baseline runner cannot enter these routes and
the SQL guard rejects persistent mutations if a route accidentally attempts one.

## Session and audit query patterns

The session middleware normally reads the session and periodically updates
`last_seen`. The baseline read-only context skips the periodic write so a timing
run does not mutate session state. Audit writes remain part of write workflows;
the runner does not call them. The SQL pool records only safe query counts and
durations, never SQL text, bodies, cookies or tokens.

## Index inventory and decision gate

The static declaration inventory is recorded above. No index was added, removed
or modified during this audit.

Potential composite-index areas are only candidates until both an authenticated
baseline and an actual execution plan support them, for example:

- members: `tenant_id` plus registration/status/search access pattern;
- attendance: `tenant_id` plus attendance date/member;
- payments: `tenant_id` plus paid date/membership;
- store sales: `tenant_id` plus sale date/member;
- audit/report date ranges.

These remain:

`CANDIDATE — PENDING BASELINE/EXECUTION PLAN`

The live catalog, fragmentation, statistics and actual plans require a safe
Staging database connection. They are not inferred from declarations.

## Next evidence sequence

1. Provide `QA_BASE_URL` for Local/Staging and a session cookie through an
   environment variable only.
2. Run `npm run perf:baseline` with the same configuration recorded in the
   report metadata.
3. Rank routes by p95, DB timing, query count, payload and error rate.
4. Capture execution plans only for the measured priority group.
5. Implement the smallest safe optimization group and run regression checks.
6. Run the same runner again for `baseline-after.json` and compare the full
   group, not one endpoint in isolation.

Until step 2 happens, any claim about the slowest production endpoint or real
improvement would be speculation.
