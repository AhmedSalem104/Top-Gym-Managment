# Logic Fit — Multi-Branch Architecture Audit

Status: discovery and design only. No application behavior, database, environment variable, Production database, migration, deployment, or push is changed by this document.

## 1. Executive decision

The current application is a tenant-first SaaS system. `tenant_id` is the security boundary and SQL Server row-level security (RLS) is the cross-tenant enforcement mechanism. A branch must therefore be introduced as a tenant-owned operational context, not as a second tenant and not as a replacement for RLS.

Current Multi-Branch support is **partial only**:

- The backup registry already recognizes legacy branch tables such as `Branches`, `BranchOperatingHours`, `EmployeeBranches`, and `UserBranchAccesses` as recoverable historical data.
- The runtime has no current Branch aggregate, branch context, branch authorization service, branch selector, branch-aware API, or branch-aware RLS predicate.
- Current Gym flows remain tenant-wide. `attendance-service`, `report-service`, `store-service`, and the current dashboard do not accept an authoritative branch context.

The safe direction is additive: create a default branch for each Gym tenant, add branch scope only to domains that have a real operational branch meaning, and keep tenant-level records tenant-level.

## 2. Evidence-based current architecture

| Concern | Current evidence | Current status | Consequence for Multi-Branch |
|---|---|---|---|
| Tenant identity | `src/tenancy/tenant-context.js`, `src/middleware/auth.middleware.js`, `src/services/tenant-service.js` | Exists | Branch context must be nested below the resolved tenant context. |
| Cross-tenant security | `tenant-service.ensureTenantColumnsAndRls()`, `dbo.gym_tenant_security_policy`, `dbo.gym_tenant_access_predicate` | Exists | Do not replace or weaken tenant RLS. |
| Tenant tables | `tenant-service.js` explicit tenant registry and `backup-registry.js` registry | Exists | New branch tables must join the registry and backup coverage gate. |
| Roles | `src/permissions/roles.js`: `Owner`, `Assistant`, `PlatformAdmin` | Exists | Add branch scope to existing roles/permissions; do not invent roles as a prerequisite. |
| Permissions | `src/permissions/permissions.js`, `role-permissions.js`, `permission-service.js` | Exists | Keep permission code separate from branch access. Effective access = permission + allowed branch. |
| Plan/capability checks | `src/services/capability-service.js`, `plan-compatibility-service.js` | Exists | Add `maxBranches` only through the existing effective-limit path. |
| Membership ownership | `members`, `memberships`, `membership_*` in `database/schema.sql` and `src/services/member-service.js` | Exists | A member remains one tenant record; branch eligibility is an extension to a membership. |
| Attendance | `src/services/attendance-service.js`, `src/routes/attendance.routes.js` | Exists, tenant-wide | Add a server-resolved branch only to new check-in context and historical records where attribution is known. |
| Occupancy | `attendance-service.js`, `member-portal-service.js` | Exists, tenant-wide | Aggregate from branch-tagged attendance; preserve tenant-wide fallback during migration. |
| Finance | `src/services/finance-service.js`, `expense.repository.js`, `gym_expenses` | Exists | Add nullable attribution, where meaningful; NULL means tenant-wide, never unknown. |
| Payments/ledger | `gym_payments`, `gym_payment_transactions`, `src/services/member-service.js`, trainer commerce services | Exists | Keep the existing financial source of truth. |
| Store | `src/routes/store.routes.js`, `src/controllers/store.controller.js`, `src/services/store-service.js`, `database/migrations/007-store.sql` | Implemented, tenant-wide | Extend inventory allocation and sale context; do not create a second Store. |
| Legacy branches | `Branches`, `BranchOperatingHours`, `EmployeeBranches`, `UserBranchAccesses` in legacy Production/backup registry | Legacy only | Treat as historical migration input after relationship validation, not as current runtime API. |
| UI shell | `public/index.html`, `public/js/feature-loader.js`, page CSS/JS | Exists | Add Branch UI only for Gym tenants with more than one active branch or an operational screen that requires context. |
| Independent Trainer | `src/routes/trainer.routes.js`, `trainer-service.js`, `trainer-commerce-service.js`, `member-portal-service.js` | Implemented | Branch capability is disabled by default for `independent_trainer`; test shared middleware regressions. |

## 3. Route → service → database map

| Flow | Current route | Current service/controller | Current data |
|---|---|---|---|
| Dashboard | `GET /api/dashboard`, `/api/dashboard-analytics` | `dashboard.routes.js` → `dashboard.controller.js` → member/analytics/store services | members, memberships, payments, attendance, coaching, Store |
| Reports | `GET /api/reports` | `reports.routes.js` → `reports.controller.js` → `report-service.js`, `store-service.js` | tenant-wide aggregates and timelines |
| Attendance | `GET/POST /api/attendance/*` | `attendance.routes.js` → `attendance.controller.js` → `attendance-service.js` | `gym_attendance`, `members`, `memberships`, freezes |
| Finance | `GET/POST/PUT/DELETE /api/finance/*` | `finance.routes.js` → finance controller/service/repository | `gym_expenses` |
| Store | `/api/store/*` | store routes → store controller → `store-service.js` | `gym_store_*`, `gym_expenses` for Store expense source |
| Gym portal | `/api/member-portal/*` | `member-portal.routes.js` → `member-portal-service.js` | member/membership/payment/attendance and portal session/visit tables |
| Trainer portal | same shared portal entry with tenant type branch | `member-portal-service.js` → `trainer-commerce-service.js`, coaching services | trainer client data, packages, sessions, payments |
| PlatformAdmin | `/api/platform-admin/*` | platform-admin routes/controller/service | tenants, subscriptions, plans, overrides, users, audit, backups |
| Backup | `/api/backup/*`, `/api/platform-admin/backups/*` | backup controllers → `backup-recovery-service.js` → `backup-registry.js` | versioned gzip JSON artifacts and registry metadata |

The branch selector, when added, must supply only a requested working context. Every service above must resolve and authorize that context server-side before adding a branch predicate to a query.

## 4. Domain ownership map

| Domain | Target ownership | Why |
|---|---|---|
| Tenant | Global/platform + tenant root | SaaS isolation and billing identity. |
| Branch | Tenant-level, Gym-only | A branch is an operational location of one Gym tenant. |
| User | Global account; tenant membership | The same user may belong to more than one tenant. |
| Role | Global reference / tenant assignment | Existing role model remains authoritative. |
| Permission | Global catalog + tenant grant | Branch access must be an additional scope. |
| Member | Tenant-level | Prevent duplicate people across branches. |
| Membership | Tenant-level hybrid | Commercial contract is tenant-owned; eligibility may reference branches. |
| Membership plan/type | Tenant-level | Catalog and pricing are Gym-level unless a later requirement proves otherwise. |
| Payment/ledger | Hybrid | Financial event remains tenant-owned, with nullable collection/origin branch attribution. |
| Expense | Hybrid | Branch expense or tenant-wide expense. |
| Attendance/QR | Branch-level event under tenant | A check-in has a physical branch. |
| Product/category | Tenant-level catalog | One catalog can be sold at many branches. |
| Inventory/stock movement | Stock-location level under a branch | Quantity physically exists somewhere, not merely in the catalog. |
| Supplier/purchase | Tenant-level with receiving location | Supplier relationship is tenant-wide; receiving is branch/location-specific. |
| POS sale/shift/refund | Branch/location-level under tenant | Operational cash/register context is physical. Financial event remains shared. |
| Training/nutrition/client programs | Tenant-level for current Trainer semantics | Do not add Gym branch semantics to Independent Trainer by default. |
| Coaching session | Tenant-level, optionally operational location later | A session may be remote or location-specific; do not force branch until product rules exist. |
| Class/booking | Not present in current runtime | Future phase only; do not create as part of branch foundation. |
| Branding | Tenant-level | Preserve one Gym identity. Branch may override contact/location only. |
| Reports | Shared tenant query with branch filter | Reuse report engine; no second analytics system. |
| Audit | Tenant-scoped event with branch metadata where applicable | Preserve actor, tenant, branch, action, entity, before/after summary. |
| Files | Tenant-level object ownership, optional branch metadata | Storage authorization remains tenant-first. |
| Portal | Member tenant portal with eligible branch projection; Trainer portal unchanged | Never expose unauthorized branch or Gym-only concepts to Trainer clients. |
| Notifications | Tenant-level/event-specific | Branch can be event metadata; delivery policy remains existing. |

## 5. Target Branch aggregate

Proposed new aggregate: `gym_branches`.

Required fields should follow existing naming/types and be finalized from the database conventions before implementation:

- `id` or `branch_id` as the project-standard integer key;
- `tenant_id` with FK to `gym_tenants`;
- unique tenant-local `branch_code`;
- `name`, address/contact fields, working-hours representation;
- `status` with `active`, `inactive`, `archived`;
- `is_main_branch`;
- timestamps and actor/audit metadata as supported by the existing model.

Lifecycle rules:

1. `active`: selectable and usable for new operations.
2. `inactive`: retained and visible to authorized management, not usable for new sales/check-ins; reactivation is allowed.
3. `archived`: retained for history and reporting, not selectable for new operations; no hard delete after operational use.

No extra lifecycle state is required initially. “Pending” belongs to a future approval workflow only if branch provisioning becomes asynchronous.

Invariants:

- exactly one active/main default branch per Gym after migration;
- branch IDs are tenant-local only through FK ownership, never security tokens;
- a branch cannot be moved between tenants;
- archived branches remain queryable for history but fail new-write authorization;
- Independent Trainer tenants do not get branch rows unless an explicit future capability is approved.

## 6. Default branch and backward compatibility

Migration strategy:

1. Create `gym_branches` and its tenant RLS registration.
2. For every `gym_tenants` row with `tenant_type = 'gym'`, create one deterministic Main Branch if no branch exists.
3. If legacy `Branches` data is trustworthy and linked by tenant identity, preserve it and select the existing main/active branch according to an explicit mapping report. Never guess from names alone.
4. Add nullable `branch_id` only to tables whose events physically occur at a branch.
5. Backfill only where a reliable source exists: legacy branch FK, known receiving branch, or the single default branch when the old application was inherently single-location.
6. Leave tenant-wide and unknown historical attribution as NULL with a documented reason; NULL is `TENANT_WIDE` or `HISTORICAL_UNATTRIBUTED`, never silently “Main Branch” without evidence.
7. Validate counts, foreign keys, tenant ownership, unique constraints, and domain totals before any NOT NULL transition.
8. Keep current API behavior by resolving the only active branch automatically for a single-branch Gym.

For legacy rows with no branch evidence, the safe compatibility rule is: preserve the row and tenant relationship, keep `branch_id` NULL until a business-approved attribution exists, and make reports label it “tenant-wide/historical attribution unavailable.”

## 7. Central Branch Context

The future request flow is:

```text
Authenticated user
  → resolved tenant context (existing)
  → tenant type/capability (existing)
  → requested branch context (header/session/query only as a request)
  → server lookup of branch ownership and status
  → server lookup of user branch scope
  → permission check
  → domain service query/write
```

Design rules:

- Add one `branch-context` module/service, not scattered `if (branchId)` checks.
- The browser may request a branch ID, but it is never trusted.
- A missing branch is valid for tenant-wide screens and for a single-branch compatibility path.
- A specific branch is mandatory for POS, attendance terminal, stock movement, transfer, waste, and shift operations.
- `all branches` is a reporting scope, not a branch ID and not an authorization bypass.
- Re-check authorization on every write and on every resource ID, including branch ownership.
- Do not place branch context in SQL Server `SESSION_CONTEXT` in the first implementation. Keep the existing tenant context only; use parameterized query scoping and server authorization. If database-level branch enforcement is later justified, it needs a separate pooled-connection threat model and concurrency test.

## 8. Staff branch scope

Do not add roles. Add a tenant-scoped branch access mapping for existing users, for example `gym_branch_user_access`.

- Owner: implicit all active branches, unless a future explicit restriction is approved.
- Assistant: existing permission plus one or more allowed branches.
- PlatformAdmin: platform mode, not constrained by tenant branch scope, but all tenant-targeted actions still require explicit target tenant and audit.
- Revocation takes effect server-side on the next request; cached UI context is not authority.
- Archived branches are removed from new operational access while historical reads remain permission-controlled.

## 9. Membership branch eligibility

Do not duplicate memberships. Add a membership access mode and, for selected branches, a join table:

- `SINGLE_BRANCH`: one branch ID;
- `SELECTED_BRANCHES`: one or more explicit branch IDs;
- `ALL_BRANCHES`: no branch list required, evaluated against active tenant branches.

The membership plan/type remains the commercial catalog. A membership instance carries the purchased eligibility snapshot so later plan edits do not rewrite historical access. Renewals copy the policy according to the product rule and record changes in membership events.

Freeze, expiry, cancellation, refund, and portal visibility continue to use the existing membership state. Attendance adds one eligibility check after tenant/membership validation.

## 10. Attendance and occupancy

Check-in sequence:

1. Resolve tenant from authenticated/member context.
2. Resolve requested active branch server-side.
3. Resolve member and membership under the tenant.
4. Check active/expired/frozen state.
5. Check membership branch eligibility.
6. Reject unauthorized branch with a non-leaking authorization response.
7. Prevent a second open attendance across any branch by tenant/member unless an explicit policy changes.
8. Insert `tenant_id`, `branch_id`, `member_id`, membership, source, and timestamps in one transaction.

Current `gym_attendance` is tenant-associated through member relationships and has a unique member/date rule. The future migration must preserve existing rows and determine whether the uniqueness rule remains tenant-day or becomes an explicit open-session constraint. Do not silently change check-in semantics.

Occupancy is `open attendance by active branch`; all-branch occupancy is the sum of branch aggregates. Member Portal exposes only policy-approved branch name/contact/hours/occupancy and never turns branch selection into an access grant.

## 11. Financial attribution

Separate ownership from attribution:

- member and subscription ownership: tenant-level;
- membership collection: nullable `collection_branch_id` when collected at a branch;
- POS sale: required operational branch/location, with existing payment records retained;
- expense: nullable branch for tenant-wide expenses;
- refund: inherit the original sale/payment attribution and record actor/current branch where operationally meaningful;
- tenant-wide transfer/marketing expense: `branch_id IS NULL` with an explicit tenant-wide classification;
- historical records without evidence: preserve and mark as historical/unattributed, never invent a branch.

The current Store payment tables (`gym_store_sale_payments`) and membership/trainer payment ledger are not identical. A future Commerce Core must provide an adapter/reconciliation boundary, not a third independent ledger and not an unsafe silent rewrite.

## 12. SaaS limits and PlatformAdmin

Extend `capability-service.js` limit resolution with `maxBranches` only after the plan contract is defined. Effective creation authorization must be:

```text
Gym tenant
 → branch capability enabled
 → compatible plan
 → active/trial subscription
 → effective maxBranches (plan + override)
 → active branch count < limit
 → existing permission
 → create/audit transaction
```

Do not hard-code Starter/Professional/Business numbers in the application until commercial requirements are authoritative. PlatformAdmin should see tenant type, plan, effective limit, active count, and total count; branch day-to-day management remains in the Gym workspace.

## 13. Independent Trainer safety

`independent_trainer` remains branch-disabled by default:

- no Branch selector in Trainer Workspace;
- no Gym branch routes or navigation;
- no branch requirement added to Trainer client, package, session, or Trainer Client Portal semantics;
- shared `members`, payment, portal, RLS, and auth changes require explicit Trainer regression tests;
- a future Trainer location capability would be a separate approved product decision.

## 14. Security design

Primary controls:

- cross-tenant: existing SQL Server RLS using `tenant_id` and existing `SESSION_CONTEXT`;
- within-tenant cross-branch: server-side branch access mapping and query predicates;
- high-risk branch tables: optional database composite ownership checks/FKs, but not a replacement for application authorization;
- frontend selector: context hint only;
- archived branch: no new operational writes;
- backup: new branch tables classified and covered by the existing fail-closed registry;
- audit: branch create/archive/access/eligibility/inventory/financial actions record actor, tenant, branch, action, entity, and safe before/after summaries.

Threat tests must cover forged branch IDs, resource IDs from another branch, a Gym-to-Trainer target, Store/Bar cross-branch reads/writes, stale branch permissions, archived branches, and pooled-connection tenant context. Branch context should not be put into `SESSION_CONTEXT` initially; this avoids adding another pooled mutable security marker.

## 15. Backup/restore impact

The existing `backup-registry.js` and `backup-recovery-service.js` already fail closed on unknown tables and support legacy-pre-trainer classification. Every future branch table must be added with:

- ownership and tenant/branch relationship;
- classification (`TENANT_REQUIRED` unless platform/reference);
- restore order/FK dependencies;
- row counts and checksums;
- safe exclusion reason only if transient/secret/derived;
- tenant-by-tenant and branch-by-branch parity checks.

No branch table may be excluded merely because it is “configuration” or because a newer table supersedes it. Branch history, staff scope, membership eligibility, locations, transfers, shifts, waste, and commerce audit are recoverable business data.

## 16. Recommended first decision

Approve a contract-only Phase 0 with no schema change:

1. confirm legacy branch data mapping rules;
2. agree the exact branch lifecycle and plan-limit contract;
3. agree NULL semantics (`TENANT_WIDE` vs `HISTORICAL_UNATTRIBUTED`);
4. freeze the list of branch-scoped domains;
5. create synthetic single/multi-branch fixtures and security cases;
6. review the Commerce boundary document before any migration is authored.
