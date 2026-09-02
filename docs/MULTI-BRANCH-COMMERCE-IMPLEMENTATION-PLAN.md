# Logic Fit — Multi-Branch + Commerce Implementation Plan

Status: future implementation plan only. No features, migrations, schema, Production, environment variables, deployment, or push are performed by this plan.

## 1. Reuse matrix

| Capability | Decision | Boundary |
|---|---|---|
| Tenant/RLS/SESSION_CONTEXT | REUSE AS-IS | Keep tenant as the SQL Server security boundary. |
| Members | EXTEND | Keep one tenant member; optional home branch and activity attribution. |
| Memberships | EXTEND | Add branch eligibility snapshot; do not duplicate membership records. |
| Payments/ledger | EXTEND SAFELY | Preserve current ledger; add branch attribution/reconciliation, not a parallel ledger. |
| Expenses | EXTEND | Nullable branch attribution and explicit tenant-wide semantics. |
| Store routes/service | REFACTOR SAFELY | Extract shared context/stock/payment seams without changing current endpoints. |
| Products/variants/categories | REUSE AS-IS THEN EXTEND | Catalog stays tenant-level; variants remain SKU identity. |
| Inventory/batches/movements | EXTEND | Add stock location allocation and movement references. |
| Suppliers/purchases | EXTEND | Receiving location and branch attribution; retain current purchase history. |
| Returns/refunds | EXTEND | Reuse current return flow; separate financial refund from recipe ingredient restoration. |
| POS | EXTEND | Reuse Store sale/payment transaction; add branch/location/shift context. |
| Reports | EXTEND | Shared branch/mode filters over existing report service. |
| Permissions | EXTEND | Existing permission + branch access mapping. |
| Member Portal | EXTEND | Project eligible branches only; preserve portal session/security. |
| Trainer Client Portal | REUSE AS-IS | No branch UX or Gym-only concepts by default. |
| PlatformAdmin | EXTEND | Show branch count/limit/type; retain platform authorization. |
| Backup/restore | EXTEND | Add registry entries, restore order, coverage/count/checksum checks. |
| RLS | REUSE AS-IS + REGISTER | Keep tenant policy; register every new tenant table. |

## 2. Table impact matrix

`branch_id = NULL` has an explicit meaning per table: tenant-wide or historical/unattributed. It never means “unknown row may be used anywhere.” All new/changed tables remain tenant-owned and must be in RLS/backup coverage.

| Table(s) | Current purpose | Tenant scoped? | Branch scoped future? | Branch column | Nullability/backfill | RLS impact | Backup impact / notes |
|---|---|---:|---:|---|---|---|---|
| `gym_tenants` | Tenant root | Global | No | No | N/A | Existing root | Keep tenant identity/status. |
| `gym_user_tenants` | User-to-tenant membership | Global control plane | Access mapping is separate | No | N/A | Existing global exception | Preserve as platform recovery data. |
| `gym_users` | Global user account | Global | No | No | N/A | Existing auth policy | Do not duplicate users per branch. |
| `gym_user_permissions` | Tenant permission grants | Yes | Indirectly | No | N/A | Existing tenant RLS | Branch scope goes in mapping table. |
| `gym_permission_audit` | Permission history | Yes | Optional metadata | Optional `branch_id` only if event targets branch | Nullable; historical NULL | Tenant RLS | Retain history. |
| `members` | Gym/Trainer person record | Yes | Hybrid | Optional `home_branch_id` | Nullable; derive only from reliable member registration/source | Tenant RLS | One member per tenant; preserve legacy rows. |
| `memberships` | Membership contract | Yes | Hybrid | Optional origin/home/collection attribution; eligibility separate | Nullable; no blind backfill | Tenant RLS | Preserve all contracts. |
| `membership_types`, `membership_pricing`, `membership_type_prices` | Tenant plan/type catalog | Yes | Usually no | No | N/A | Tenant RLS | Branch eligibility is on membership, not catalog by default. |
| `membership_freezes` | Freeze state/history | Yes through membership | No direct branch | No | N/A | Tenant RLS | Preserve freeze history. |
| `membership_events` | Membership lifecycle audit | Yes | Optional event branch metadata | Nullable | Existing history NULL | Tenant RLS | Retain immutable events. |
| `gym_payments` | Membership payment summary | Yes | Hybrid | Nullable `collection_branch_id` | Backfill from reliable payment context only | Tenant RLS | Financial reconciliation required. |
| `gym_payment_transactions` | Immutable membership/trainer payment events | Yes | Hybrid | Nullable attribution | Preserve NULL if no evidence | Tenant RLS | Never rewrite amounts/events. |
| `gym_subscription_refunds` | Subscription refunds | Yes | Hybrid | Nullable origin/collection branch | Inherit original payment where known | Tenant RLS | Link to original financial event. |
| `gym_expenses` | Gym/Store expenses | Yes | Hybrid | Nullable `branch_id` | NULL = tenant-wide/historical | Tenant RLS | `expense_source` remains. |
| `gym_attendance` | Member check-in/out | Via member today; future explicit tenant | Yes | `branch_id` | Nullable during additive phase; backfill default only for proven single-branch data | Tenant RLS + server branch authorization | Preserve historical attendance. |
| `gym_day_pass_types` | Day-pass catalog | Yes | Usually tenant-level | No | N/A | Tenant RLS | Eligibility rules may later reference branches. |
| `gym_day_pass_sales` | Day-pass sale | Yes | Yes | Nullable/required on new sale | Backfill from sale context if known | Tenant RLS | Financial/attendance attribution. |
| `gym_store_categories` | Store category | Yes | No | No | N/A | Tenant RLS | Shared Store/Bar catalog classification. |
| `gym_store_suppliers` | Supplier | Yes | No | No | N/A | Tenant RLS | Supplier is tenant-level. |
| `gym_store_products` | Product catalog | Yes | No | No | N/A | Tenant RLS | Do not duplicate per branch. |
| `gym_store_product_variants` | Sellable SKU/variant | Yes | No | No | N/A | Tenant RLS | Stock location holds quantity. |
| `gym_store_customers` | Store customer/walk-in history | Yes | Optional last/origin branch | Nullable | Preserve guests; no member duplication | Tenant RLS | PII policy unchanged. |
| `gym_store_purchases` | Supplier purchase | Yes | Yes receiving branch/location | Nullable for legacy; required new receiving | Tenant RLS + authorization | Preserve invoices/history. |
| `gym_store_purchase_items` | Purchase lines | Via purchase | Via parent | No direct column initially | Parent owns location | Tenant RLS | FK restore order. |
| `gym_store_purchase_payments` | Purchase payment allocations | Via purchase | Optional attribution | Nullable | Preserve current semantics | Tenant RLS | Reconcile with existing Store payment truth. |
| `gym_store_inventory_balances` | Variant quantity cache | Yes | Yes location | Extend with `stock_location_id` | Legacy tenant balance maps to legacy/default location only with policy | Tenant RLS + branch auth | Composite uniqueness variant/location. |
| `gym_store_inventory_batches` | Batch/expiry stock | Yes | Yes location | Extend with location | Same as balances | Tenant RLS + branch auth | Do not lose lot/expiry/cost. |
| `gym_store_stock_movements` | Inventory audit ledger | Yes | Yes | Add location/branch refs | Historical NULL only if no evidence | Tenant RLS + branch auth | Immutable movement history. |
| `gym_store_sales` | Store sale/order | Yes | Yes | Required for new operational sale | Legacy NULL allowed with historical marker | Tenant RLS + branch auth | Current sale remains source history. |
| `gym_store_sale_items` | Sale lines | Via sale | Via parent | No direct initially | Parent branch/location | Tenant RLS | Snapshot product/variant/cost. |
| `gym_store_sale_payments` | Store sale payment allocation | Via sale | Via parent | No direct initially | Parent attribution | Tenant RLS | No duplicate payment ledger. |
| `gym_store_returns` | Store returns/refunds | Via sale | Yes | Inherit sale branch; optional actor branch | Backfill from sale | Tenant RLS + branch auth | Financial refund vs stock restock explicit. |
| `gym_store_return_items` | Returned lines | Via return | Via parent | No direct initially | Parent owns | Tenant RLS | Preserve restock flag. |
| `gym_store_audit_log` | Store audit | Yes | Optional branch metadata | Nullable | Historical NULL | Tenant RLS | Include all commerce/branch actions. |
| `gym_branding_config`, `gym_branding_assets`, `gym_branding_audit` | Tenant brand | Yes | No, optional operational branch metadata only | No branch system | N/A | Tenant RLS | Keep tenant identity; do not duplicate branding. |
| `gym_member_portal_sessions`, `gym_member_portal_visit_daily`, `gym_member_portal_visit_visitors` | Portal session/analytics | Yes/control plane | No | No | N/A | Existing portal policy | Sessions transient; do not add branch security. |
| `coaching_sessions` | Trainer coaching operations | Yes | No by default | No | N/A | Tenant RLS | Trainer unaffected. |
| `trainer_packages`, `trainer_package_purchases`, `trainer_package_usage` | Trainer commerce/entitlements | Yes | No by default | No | N/A | Tenant RLS | Regression guard: no Gym branch assumptions. |
| `saas_plans`, `saas_plan_terms`, `saas_plan_tenant_types` | Platform commercial catalog | Global | No | No | N/A | Platform policy | Add maxBranches only through plan limits. |
| `saas_tenant_subscriptions`, `saas_tenant_overrides` | Tenant SaaS state | Control-plane/tenant-owned | No | No | N/A | Existing control-plane rules | Branch limit/feature override source. |
| `saas_audit_log`, `saas_platform_notes` | Platform audit/notes | Mixed | Optional target branch metadata | Nullable if supported | Preserve platform events | Existing policy | Do not convert to branch security boundary. |
| Legacy `Branches` | Historical branch aggregate | Legacy tenant relation | Source for migration | Existing legacy key | Read-only map first | Legacy handling | Retain in application-level DR. |
| Legacy `BranchOperatingHours` | Historical hours | Legacy branch relation | Source for migration | Via legacy branch | N/A | Legacy handling | Preserve history. |
| Legacy `EmployeeBranches`, `UserBranchAccesses` | Historical staff scope | Legacy tenant relation | Source for migration | Via legacy branch | N/A | Legacy handling | Never blindly map to current permissions. |
| Legacy `Appointments`, `Attendances`, `ClassEnrollments`, `ClassSchedules`, `GroupClasses` | Historical operations | Legacy/derived by FKs | Potential future branch source | No mass change | Map only with validated FK | Legacy backup + future RLS review | Do not exclude. |
| Legacy `Memberships`, `ClientSubscriptions`, `SubscriptionFreezes`, `Payments`, `Invoices`, `InvoiceItems`, `WalletTransactions`, `Commissions`, `Expenses` | Historical commercial/finance | Legacy | Attribution where evidence exists | Nullable future bridge | Preserve NULL history | Legacy backup; no blind rewrite | Financial reconciliation required. |
| Legacy `Products`, `ProductCategories`, `StockItems`, `StockMovements`, `Suppliers`, `PurchaseOrders`, `PurchaseOrderItems`, `Sales`, `SaleItems`, `Recipes`, `RecipeIngredients` | Historical commerce | Legacy | Source for future import only | No mass change | Preserve original model | Legacy backup | Keep as historical recovery data. |
| Legacy `AuditLogs`, `gym_audit_log`, `gym_cash_closings` | Historical audit/cash | Legacy | Optional branch inference | Nullable/unchanged | Preserve all rows | Legacy backup | No deletion during migration. |

## 3. New table justification

Only the following tables are justified as the initial additive model:

| Proposed table | Why required | Why existing cannot handle it | Tenant/branch | Security scope | Backup class |
|---|---|---|---|---|---|
| `gym_branches` | Branch identity/lifecycle/config | No current runtime Branch aggregate; legacy tables are not current contract | tenant_id; branch is root | Tenant RLS + server branch authorization | TENANT_REQUIRED |
| `gym_branch_user_access` | Many-to-many staff branch scope | `gym_user_tenants` expresses tenant membership, not branch grant | tenant_id + branch_id + user_id | Tenant RLS + server permission | TENANT_REQUIRED |
| `gym_membership_branch_access` | Selected/single membership eligibility | Existing membership has no branch policy and must not duplicate membership | tenant_id + membership_id + branch_id | Tenant RLS + membership authorization | TENANT_REQUIRED |
| `gym_stock_locations` | Physical inventory location inside a branch | Current balance is variant-level and cannot distinguish warehouse/store/bar | tenant_id + branch_id | Tenant RLS + branch authorization | TENANT_REQUIRED |
| `gym_stock_transfers` / `gym_stock_transfer_items` | Auditable movement between locations/branches | Current adjustment movement has no approval/receipt lifecycle | tenant_id; source/destination locations | Tenant RLS + source/destination auth | TENANT_REQUIRED |
| `gym_pos_shifts` | Register open/close and cash variance | Current sale has no shift/cash snapshot | tenant_id + branch_id + stock location/register | Tenant RLS + POS permissions | TENANT_REQUIRED |
| `gym_bar_recipes` / `gym_bar_recipe_items` | Prepared item ingredient consumption | Current Store variant is a single sellable stock identity | tenant_id; operational branch via sale/location | Tenant RLS + Bar permissions | TENANT_REQUIRED |
| `gym_commerce_modifiers` / `gym_commerce_modifier_options` | Add-ons distinct from SKU variants | Current variant fields cannot model per-order options and ingredient effects cleanly | tenant_id; product/recipe references | Tenant RLS + Bar/POS permissions | TENANT_REQUIRED |
| `gym_branch_commerce_config` | Branch Store/Bar enablement without bloating branch root | Capability alone cannot express branch operational availability | tenant_id + branch_id | Tenant RLS + branch authorization | TENANT_REQUIRED |

Do not introduce a new payment or ledger table. Use existing Store sale/payment records and the established membership/trainer ledger boundary, with an explicit reconciliation adapter if required by the finance audit.

## 4. User flows

### Branches and staff

1. First/default branch: migration creates one Main Branch for each Gym; one-branch UI auto-resolves it.
2. Add branch: Owner → capability/plan/limit check → unique code/name validation → create active branch → audit.
3. Edit: authorized Owner/Assistant permission + branch scope → update operational identity → audit.
4. Archive: verify no open shift/attendance/transfer requiring the branch → set archived, never delete history.
5. Assign staff: Owner selects existing user, branches, and permissions → server verifies tenant/branch ownership → transaction + audit.
6. Change context: selector requests branch; server returns only allowed active branches; all-branch is available only on aggregate screens.

### Membership and attendance

1. Create membership using existing pricing/membership flow.
2. Select Single/Selected/All branch access according to product policy.
3. Store policy snapshot and selected branch mappings.
4. QR check-in resolves member tenant, active branch, membership status, freeze, eligibility, and open-session rule.
5. Unauthorized branch returns a safe denial; it never leaks another branch's data.
6. Member Portal shows eligible branch information only.

### Financial and commerce

1. Branch payment: resolve branch and user scope; create existing payment event with nullable collection attribution.
2. Branch expense: choose branch or tenant-wide; write existing expense source plus attribution and audit.
3. Store sale: select branch/location/shift; member or guest; reserve/consume stock; create current sale/payment records atomically.
4. Bar sale: select branch/location/open shift; touch menu; resolve modifiers/recipe; lock/recheck availability; consume ingredients/direct stock; record payment/audit.
5. Guest/member sale: guest needs no Member; selected member must belong to tenant.
6. Transfer: draft → approved → in_transit → received, with source deduction and destination receipt as controlled transactions.
7. Refund: authorize against original sale; financial refund and stock restock are separate, explicit actions.
8. Waste: select location/item/reason/quantity; lock stock; write movement and audit.
9. All-branch reporting: Owner/authorized role selects aggregate scope; queries group by branch without bypassing tenant RLS.

### Platform and portals

- PlatformAdmin sees Gym tenant, tenant type, plan, branch count/limit, and active branches in existing tenant detail/list views.
- Gym Member Portal exposes eligible branch contact/hours/occupancy according to policy.
- Trainer Client Portal remains the existing trainer mode and does not expose branch, occupancy, Store, or Bar concepts unless a separate capability is approved.

## 5. Security threat model

| Threat | Control | Required evidence |
|---|---|---|
| Cross-tenant IDOR | Existing RLS + tenant context | Gym A cannot read/write Gym B. |
| Cross-branch IDOR | Server branch access + parent branch ownership | Branch-limited user denied Branch B resources. |
| Forged `branch_id` | Ignore client authority; resolve server-side | API test with forged branch ID fails. |
| Unauthorized inventory/finance | Permission + branch scope + location ownership | Store/Bar/payment/expense tests. |
| Selector manipulation | Selector is context only | Changing request/header never grants access. |
| Archived branch writes | Status gate in service transaction | New sale/check-in/transfer denied. |
| RLS regression | Registry/protected-table equality gate | dynamic uncovered count = 0. |
| SESSION_CONTEXT leakage | Keep branch out initially; preserve tenant pooled tests | 100+ mixed requests, no foreign markers. |
| Privilege escalation | Existing roles/wildcards audited; branch mapping cannot grant permission | Assistant/Owner matrix. |
| Backup leakage | Registry classification, secret/session exclusions, private artifact policy | manifest and restore inspection. |

## 6. Migration risk matrix

| Risk | Impact | Probability | Mitigation | Rollback | Evidence |
|---|---|---:|---|---|---|
| Wrong legacy branch mapping | Historical activity attributed to wrong location | Medium | Mapping report, FK validation, leave NULL when uncertain | Restore pre-migration artifact; remove additive tables only in rehearsal | before/after tenant and branch reconciliation |
| Duplicate default branches | Broken selector and limits | Low/Medium | unique tenant-main invariant, idempotent insert | restore/re-run clean clone | repeated migration |
| Mass `branch_id` backfill | Data semantics change | Medium | domain-specific backfill and nullable phase | restore artifact; no blind update | per-table counts/checksums |
| Attendance uniqueness change | Check-in regression | Medium | preserve current rule until tested | app rollback if schema compatible; DB restore otherwise | Gym attendance E2E |
| Financial attribution error | Reporting/ledger mismatch | Medium | nullable attribution, immutable events, reconciliation | financial restore/reconciliation | totals and transaction identity checks |
| Inventory allocation loss | Stock loss/negative stock | High | location opening balances, movement audit, locks | restore clone/source before release | stock count/cost reconciliation |
| Branch RLS registration gap | Cross-tenant exposure | High | dynamic RLS/registry gate before activation | keep app frozen; restore | uncovered=0, predicate validation |
| Trainer regression | Trainer clients/packages fail | Medium | capability deny-by-default for Trainer + full regression | application rollback if compatible | Trainer E2E |
| Backup coverage gap | Unrecoverable business data | High | registry gate and restore drill in every phase | do not release | UNKNOWN=0, parity |
| Plan limit mismatch | Unexpected branch creation/block | Medium | effective-limit contract and overrides | retain branches; block only new creation | PlatformAdmin/plan tests |
| Slow all-branch reports | Operational degradation | Medium | grouped queries, measured indexes later, bounded date ranges | disable aggregate UI flag if designed | query and performance tests |

## 7. Ordered implementation roadmap

### Phase 0 — Contracts, inventory, and test fixtures

- Goal: freeze domain ownership, legacy mapping, NULL semantics, capability/plan contract, and security acceptance criteria.
- Tables: none.
- Backend: add no behavior; create test fixtures/specs and review route/service seams.
- Frontend: none.
- Permissions: review current catalog and branch-scope proposal.
- Migration: none.
- RLS: verify current registry baseline only.
- Backup: prove a no-op inventory/classification design for future tables.
- Tests: single-branch, multi-branch synthetic fixtures, Trainer regression, IDOR matrix.
- Backward compatibility gate: current production-shaped single-tenant fixtures behave exactly as today.
- Exit: approved contracts and a complete mapping of legacy branch data.

### Phase 1 — Branch foundation

- Goal: introduce tenant-owned Gym branches and lifecycle.
- Tables: `gym_branches`, optional branch config.
- Backend: branch repository/service, tenant ownership, status/lifecycle, deterministic default branch resolution.
- Frontend: management page only for Gym Owner; single-branch UI remains quiet.
- Permissions: existing Owner/Assistant permissions plus branch management grant if needed.
- Migration: create one Main Branch per Gym; do not touch Trainer tenants.
- RLS: register branch table; validate actual=registry=protected.
- Backup: classify branch/config as TENANT_REQUIRED and restore in FK order.
- Tests: create/edit/archive, tenant IDOR, idempotent default creation.
- Backward compatibility gate: all current Gym endpoints work with implicit Main Branch; Trainer has no branch UI.
- Exit: one valid active/main branch per Gym and zero RLS/backup gaps.

### Phase 2 — Central branch context and staff scope

- Goal: server-authorized branch context without using branch in `SESSION_CONTEXT`.
- Tables: `gym_branch_user_access`.
- Backend: centralized context resolver, allowed-branch query, all-branch reporting scope, archived status gate.
- Frontend: selector only when >1 active branch or screen requires a branch.
- Permissions: existing permissions + mapping; no new role.
- Migration: map legacy staff access only with validated tenant/branch references; no blind grant.
- RLS: tenant RLS plus server branch checks.
- Backup: access mappings included with checksums.
- Tests: forged selector, Assistant one/many branches, revocation, PlatformAdmin isolation.
- Backward compatibility gate: one-branch Gym has unchanged navigation and implicit context.
- Exit: no cross-branch IDOR in read/write/update/delete tests.

### Phase 3 — Members, memberships, attendance, occupancy

- Goal: branch-aware physical operations while preserving tenant member ownership.
- Tables: additive membership access table; nullable branch attribution on approved operational tables.
- Backend: eligibility modes, check-in branch validation, open-session rule, branch/all occupancy.
- Frontend: membership eligibility controls and branch-aware attendance terminal; portal projection.
- Permissions: existing membership/attendance permissions plus branch scope.
- Migration: backfill only known historical branch values; keep uncertain history NULL.
- RLS: register all new tables and re-run dynamic coverage.
- Backup: include policies and historical activity.
- Tests: Single/Selected/All branches, unauthorized check-in, portal eligibility, simultaneous open attendance.
- Backward compatibility gate: existing memberships and QR/phone flows remain valid for Main Branch.
- Exit: Gym attendance and portals pass; Trainer semantics unchanged.

### Phase 4 — Financial attribution and reporting filters

- Goal: branch revenue/expense attribution without ledger duplication.
- Tables: nullable collection/origin branch references on reviewed financial tables; no new ledger.
- Backend: shared filter object in finance/report services; reconciliation queries.
- Frontend: branch/all filters and labels for tenant-wide/historical records.
- Permissions: existing finance/reports permissions with branch scope.
- Migration: only reliable attribution; never rewrite amounts/events.
- RLS: financial tables remain tenant-protected.
- Backup: manifest includes attribution columns and checksum changes.
- Tests: totals before/after, refunds, tenant-wide expenses, all-branch comparison.
- Backward compatibility gate: existing tenant-wide reports reconcile exactly when branch filter is absent.
- Exit: no financial total drift and clear NULL semantics.

### Phase 5 — Commerce Core seam around current Store

- Goal: establish shared branch/location/payment/audit interfaces without rewriting Store behavior.
- Tables: no new Bar tables yet; additive sale/location context only after Phase 6 contract.
- Backend: extract domain interfaces from `store-service.js`; retain current routes as adapters.
- Frontend: no Bar UI yet; Store UI remains working.
- Permissions: preserve current Store catalog and action permissions.
- Migration: additive and nullable operational context.
- RLS: no weakening; new objects registered.
- Backup: verify current Store plus new context parity.
- Tests: current Store CRUD/sale/return/purchase regression and idempotency.
- Backward compatibility gate: current Store API responses and workflows remain compatible.
- Exit: Store is a safe shared-core consumer and finance boundary is documented.

### Phase 6 — Stock locations and transfers

- Goal: separate branch from physical inventory locations and make movement auditable.
- Tables: `gym_stock_locations`, `gym_stock_transfers`, items; extend balances/batches/movements.
- Backend: location ownership, opening balance/import, transfer state machine and locks.
- Frontend: locations, transfer list/detail, receive flow; no Bar sales yet.
- Permissions: inventory view/adjust plus transfer permissions and branch scope.
- Migration: map current tenant balance to approved legacy/default location; preserve movement history.
- RLS: tenant RLS + source/destination authorization.
- Backup: location/balance/batch/movement/transfer coverage.
- Tests: branch-to-branch, location-to-location, interruption, double receipt, negative stock race.
- Backward compatibility gate: current Store inventory shows the same quantities for single-branch Gym.
- Exit: stock parity and concurrency pass.

### Phase 7 — Shared POS shift core and Bar foundation

- Goal: introduce branch-specific Store/Bar operation with shared sale/payment data.
- Tables: `gym_pos_shifts`, branch commerce config, Bar mode metadata.
- Backend: open/close shift, cash/card reconciliation, fast sale command, Store/Bar enablement gates.
- Frontend: touch-friendly Bar POS; Store can opt into shift context without a rewrite.
- Permissions: `bar.*`, shift permissions only if existing grants cannot express them.
- Migration: none destructive; existing sales remain historical and may have NULL shift.
- RLS: all tenant tables protected; branch server authorization.
- Backup: shifts/config included.
- Tests: shift lifecycle, register mismatch, duplicate sale/payment, guest/member sale.
- Backward compatibility gate: Store continues to sell under its current flow where no shift is required by existing policy.
- Exit: no parallel payment ownership and no branch crossing.

### Phase 8 — Recipes, modifiers, availability, waste, refunds

- Goal: implement Bar-specific operational rules on shared Commerce Core.
- Tables: recipes/items, modifiers/options, waste/adjustment extension only if current movement model cannot represent the audit requirement.
- Backend: unit conversion, availability, atomic ingredient consumption, recipe version snapshots, explicit waste/refund behavior.
- Frontend: menu/category tabs, modifiers, sticky cart, unavailable states, waste/recipe management.
- Permissions: Bar manage/sell, inventory waste, refund controls.
- Migration: seed no business data; existing Store variants remain direct-stock items.
- RLS: register all tables; test recipes cannot cross tenant.
- Backup: recipe versions, modifiers, waste, Bar transactions covered.
- Tests: recipe sale, ingredient exhaustion, concurrent sale, refund without false restock, unit precision.
- Backward compatibility gate: Store direct-stock sale and existing financial reports unchanged.
- Exit: financial, stock, and audit invariants pass.

### Phase 9 — Plan limits, PlatformAdmin, portals, and UX integration

- Goal: expose only approved branch/commerce capabilities per tenant/branch and portal policy.
- Tables: plan limit data only through existing SaaS structures; no hard-coded commercial values.
- Backend: `maxBranches`, branch count/limit, branch configuration, portal branch projection.
- Frontend: grouped navigation; Branches, Commerce, Inventory, POS; hide Gym branch UI from Trainer.
- Permissions: plan + capability + permission + branch scope.
- Migration: no destructive changes; validate existing overrides.
- RLS: full dynamic coverage and portal tenant tests.
- Backup: coverage gate with all new registry entries.
- Tests: PlatformAdmin visibility, plan enforcement, portals, RTL/light/dark/responsive critical screens.
- Backward compatibility gate: single-branch Gym remains simple; Independent Trainer remains unaffected.
- Exit: UI and authorization evidence complete.

### Phase 10 — Closure and release gate

- Goal: prove the complete system before any Production migration.
- Tables: final schema inventory.
- Backend: performance/concurrency instrumentation and compatibility checks.
- Frontend: browser regression and visual QA.
- Permissions: full matrix.
- Migration: two-run idempotency on a clean Production-equivalent clone.
- RLS: actual tenant tables = registry = protected; uncovered = 0; predicate validation.
- Backup: application-level DR creation, independent copy, clean restore, parity, UNKNOWN=0.
- Tests: Gym, Trainer, PlatformAdmin, portals, finance, IDOR, 100+ pooled-context requests, Node 24, all applicable package scripts.
- Backward compatibility gate: current Gym data and routes reconcile before/after.
- Exit: explicit evidence package and separate Production approval; no automatic deployment.

## 8. Test strategy before implementation

Required synthetic/local test families:

- one Gym with one default branch: existing flows and hidden/minimal selector;
- one Gym with three branches: Owner all-branch access;
- Assistant with one branch and Assistant with two branches;
- archived branch and revoked access;
- one member with Single, Selected, and All branch membership eligibility;
- cross-branch attendance and open-session denial;
- branch occupancy plus all-branch aggregate;
- branch/tenant-wide payments and expenses;
- Store direct sale, return, purchase, stock adjustment;
- Bar direct item, recipe item, modifier, guest sale, member sale;
- stock transfer approval/in-transit/receive/cancel;
- concurrent stock sale and transfer receipt;
- POS shift open/close/variance;
- refund, waste, ledger reconciliation, transaction rollback;
- Gym A/B, Trainer A/B, Gym↔Trainer IDOR across read/write/update/delete/download/portal/report/payment/package cases;
- PlatformAdmin tenant type/plan/branch visibility and overrides;
- Member Portal eligible branch projection and Trainer Client Portal isolation;
- backup manifest, registry coverage, checksum, restore, post-migration UNKNOWN=0;
- RLS and pooled `SESSION_CONTEXT` tenant tests with 100+ mixed requests;
- Node 24 build/unit/migration/startup/critical QA;
- RTL, light/dark, 320–1920 responsive critical flows and visual regression.

## 9. Navigation and responsive UX direction

Do not redesign the entire shell. Add grouped navigation only after capabilities are available:

- Management: Branches, staff branch access;
- Commerce: Store, Bar POS, Inventory, Transfers, Commerce Reports;
- existing Gym pages remain where they are;
- Branch selector in the workspace header only for multi-branch Gym users;
- POS requires one branch/location and uses a sticky cart/drawer on tablet/mobile;
- all-branch selector option appears only on aggregate reports/dashboard screens;
- Trainer Workspace keeps its existing navigation and never shows Gym Branch/Bar/Store controls.

## 10. Final architecture verdict

The repository can support both capabilities safely through additive extensions. The key blockers are not architectural impossibilities; they are migration discipline, financial reconciliation, branch authorization, and backup/RLS coverage. Implementation should start with Phase 0 contracts and synthetic tests, then branch foundation before changing attendance, finance, or commerce.
