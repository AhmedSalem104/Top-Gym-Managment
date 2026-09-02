# Logic Fit — Commerce / Store / Bar Architecture Audit

Status: discovery and design only. This document does not implement Store, Bar, POS, inventory, schema, migration, Production, or deployment changes.

## 1. Current Store/POS state

The current Store is a real tenant-scoped implementation, not a placeholder:

- routes: `src/routes/store.routes.js`;
- controller: `src/controllers/store.controller.js`;
- service and transaction logic: `src/services/store-service.js`;
- schema: `database/migrations/007-store.sql` and runtime readiness in Store service;
- browser page: `public/js/pages/store/store.js`, `public/css/pages/store.css`, lazy loading through `public/js/feature-loader.js`;
- permissions: `src/permissions/permissions.js` and role resolution;
- backup coverage: `src/services/backup-registry.js` includes all current `gym_store_*` business tables.

Existing Store capabilities:

| Capability | Current state | Evidence |
|---|---|---|
| Categories | Implemented | `gym_store_categories`, Store routes/service |
| Products | Implemented | `gym_store_products` |
| Variants | Implemented | `gym_store_product_variants`, SKU/barcode/size/color/flavor/weight fields |
| Suppliers | Implemented | `gym_store_suppliers` |
| Purchases | Implemented | purchases, items, purchase payments |
| Inventory | Implemented, tenant-wide | balances, batches, stock movements; quantity precision is 3 decimals |
| Sales | Implemented | sales, sale items, sale payments |
| Walk-in/member sale | Implemented | optional `member_id` plus customer fields |
| Returns | Implemented | returns and return items; restock is explicit |
| Store expenses | Implemented | `gym_expenses` with `expense_source = 'store'`, void semantics |
| Audit | Implemented | `gym_store_audit_log` |
| Reporting | Implemented | Store reports and dashboard aggregates in `store-service.js` |
| Branches | Missing in runtime | no branch context or branch-aware Store query |
| Stock locations | Missing | current balances are variant-level |
| Transfers | Missing | no transfer aggregate or lifecycle |
| Bar | Missing | no Bar capability, menu, recipe or Bar POS |
| POS shifts/registers | Missing | sales have payment method but no open/close shift |
| Recipes/ingredients | Missing in current Store runtime | legacy `Recipes`/`RecipeIngredients` exist only as recoverable legacy data |
| Modifiers | Missing | variants exist, add-ons do not |
| Waste workflow | Partial | movement types include `damaged`/`expired`, but no structured waste approval/location workflow |
| Shared financial ledger | Partial | membership/trainer ledger uses `gym_payment_transactions`; Store has sale-payment tables and does not create the same ledger event |

Important current behavior: `gym_store_inventory_balances` is a cache and `gym_store_stock_movements` is the auditable movement history. `store-service.js` uses transactions, row locks for stock batches, quantity rounded to three decimals, money at two decimals, and idempotency-style validation for its own flows. Future Commerce work must preserve these invariants.

## 2. Commerce Core decision

Use one Commerce Core with two operational modes:

```text
Tenant
  └─ Gym branch
      └─ Stock location
          └─ Commerce Core
              ├─ Store retail mode
              └─ Bar quick-service mode
```

Shared concepts:

- tenant-owned product catalog;
- product variants/SKUs;
- suppliers and purchase receiving;
- stock balances, batches, and movements;
- sale/order and line items;
- member or guest customer reference;
- payments through the existing payment/ledger boundary;
- returns/refunds and audit;
- POS shift/register context;
- reports with tenant/branch/mode filters.

Store and Bar differ in UX and fulfillment rules, not in financial ownership or physical-stock accounting.

## 3. Store vs Bar boundary

Store is retail: supplements, clothing, shakers, gloves, accessories, equipment, and other packaged products. Bar is fast service: water, coffee, protein drinks, energy drinks, snacks, and prepared items.

Bar needs first-class operational concepts that a Store category cannot provide:

- quick-touch product/menu screen;
- recipes and ingredient consumption;
- modifiers/add-ons;
- availability calculated from ingredient stock;
- waste/spoilage;
- branch/location/register requirement;
- shift close and cash difference.

These concepts must reference the shared catalog, stock, sale, payment, and audit records. Do not create `bar_products`, `bar_payments`, or `bar_inventory` duplicates.

## 4. Stock Location model

Branch and Stock Location are different:

```text
Tenant
└── Branch
    ├── Main Warehouse
    ├── Store
    └── Bar
```

`gym_stock_locations` should be tenant-owned through its branch, with an active/inactive/archived lifecycle and a type such as `warehouse`, `store`, `bar`, or `other`. A location must belong to exactly one branch; a branch may have many locations.

Current product/catalog tables remain tenant-level. Current inventory tables should be extended only after the location model exists:

- balances become keyed by variant + stock location;
- batches carry stock location;
- movements carry source location and resulting quantity;
- existing tenant-wide balances migrate into the default branch/location only when operational evidence supports it;
- a temporary tenant-wide location can preserve legacy stock without pretending it was physically in a specific branch.

## 5. Sales and customers

The current Store already supports a member or walk-in sale. Preserve that behavior:

- guest sale: no member row required, optional safe display name/phone as current policy permits;
- member sale: reference the existing tenant member, never create a duplicate member;
- branch and stock location are server-resolved and required for operational sales;
- payment is recorded once through the existing Store sale-payment boundary and reconciled with the existing financial/audit model;
- duplicate client requests use an idempotency key and transaction boundary.

## 6. Recipes, units, variants, and modifiers

### Recipes

Add a Bar recipe aggregate only for prepared products:

```text
Sellable product/variant
  → recipe
      → ingredient variant + quantity + unit
```

Packaged water or a protein bar uses direct one-variant stock consumption and needs no recipe.

Recipe changes require versioned audit. A completed sale stores the applied recipe/version snapshot so later recipe edits do not rewrite historical cost calculations.

### Units

Use a canonical unit and conversion policy. SQL Server decimal quantities should be used, never binary floating-point. The current three-decimal Store convention is sufficient for pieces and common portions but may not be sufficient for milliliters/grams if the business sells precise ingredients. Before implementation, approve a precision/scale such as `DECIMAL(18,6)` for recipe quantities and retain money at `DECIMAL(12,2)`; do not change current columns globally without a data review.

Every ingredient must have a base unit. Conversions are explicit and immutable for historical movements; no implicit “1 scoop = 30g” magic in the checkout path.

### Variants vs modifiers

- Product variant: a sellable SKU/price/stock identity, e.g. 500ml vs 1L or chocolate vs vanilla packaged item. Current variant fields can be reused for this.
- Modifier: an optional choice applied to a sale line, e.g. extra scoop, banana, or peanut butter. Modifiers may add price and consume ingredients; they are not stock SKUs unless the business wants them sold independently.

Do not create hundreds of products to represent every modifier combination. Keep modifier selection attached to the order line and snapshot its price/recipe effect.

## 7. Availability and negative stock

For a direct item, available quantity is the selected location balance. For a recipe, availability is the minimum producible servings across all ingredients after unit conversion. Availability is read-only derived state and must be rechecked in the sale transaction.

Default policy: do not allow negative stock. The transaction locks the relevant balance/batches, validates all components, consumes all ingredients, writes movements, and commits the sale atomically. If payment succeeds but stock cannot be committed, the sale must remain in a recoverable pending/failed state according to the existing payment integration; do not create a paid sale with silently missing stock.

## 8. POS and shifts

The current Store has sale/payment methods but no shift/register lifecycle. Introduce one shared POS Shift Core for Store and Bar only if operational cash reconciliation is required:

```text
OPEN → sales/refunds → expected cash/card totals → CLOSE → variance/audit
```

Required context: tenant, branch, stock location/register, opened/closed by user, opening cash, payment totals, actual cash, difference, timestamps, and status. A sale cannot use a cash register without an open shift. Card/online payments do not become cash; they remain separately reconciled.

This is not a second ledger. The shift is an operational reconciliation view over existing sale/payment records.

## 9. Waste and spoilage

Current movement types (`damaged`, `expired`) are a useful starting point but are not enough for structured Bar operations. Add a typed adjustment/waste flow with reason, quantity, branch, location, actor, timestamp, source/reference, and audit. No silent decrement.

For a prepared drink refund, financial refund and ingredient restoration are separate decisions. By default, refunding a consumed prepared item does not restore milk/whey/banana; an authorized stock recovery action is separately recorded if ingredients were actually recoverable.

## 10. Per-branch Store/Bar enablement

Use three gates:

1. tenant capability/plan: tenant may use Store or Bar;
2. branch configuration: Store/Bar enabled for that branch;
3. user permission + branch scope: actor may operate the mode at that branch.

Do not show Bar or Store screens merely because a route exists. Server-side route checks remain mandatory.

## 11. Commerce permissions

Reuse existing Store permissions and add only missing granular permissions after the current catalog is reviewed. Candidate additions:

- `bar.view`, `bar.sell`, `bar.manage`;
- `inventory.transfer`, `inventory.waste`;
- `pos.shift.open`, `pos.shift.close`;
- `commerce.refund` if the current return permission is not sufficient.

The effective rule is `permission + tenant capability + branch scope + active branch/location + shift state`. `branch_id` from the UI never grants access.

## 12. Financial source of truth

The existing membership/trainer `gym_payment_transactions` ledger remains authoritative for those domains. Existing Store `gym_store_sales` and `gym_store_sale_payments` remain historical truth for current Store records. The implementation must define one integration boundary for Commerce reporting/reconciliation and must not create a third money table that can disagree with both.

Required financial invariants:

- sale total = line totals - discounts/tax according to existing semantics;
- payment allocations never exceed authorized amount unless current partial-payment policy permits it;
- refund is linked to the original sale/line/payment;
- ledger/report totals can be reconciled back to sale/payment records;
- idempotency key prevents duplicate financial events;
- every reversal is an append-only audit/reversal event, not an overwrite.

## 13. Reporting

Extend the existing Store/report service through shared filters:

- scope: tenant-wide, all active branches, or one branch;
- mode: all commerce, Store, or Bar;
- location: optional stock location/register;
- time range and currency as current report conventions support.

Metrics: sales, orders, average order value, refunds, gross margin where cost is reliable, waste, inventory valuation, low stock, transfers, shift variance, and branch comparison. Use grouped SQL or pre-aggregated read models only after query patterns are measured; do not add N+1 loops or unreviewed indexes.

## 14. Backup impact

The existing platform backup is schema-driven and versioned. New recoverable Commerce tables must be registered as tenant-required, ordered by FK dependencies, included in manifest counts/checksums, and verified after restore:

- branches and branch config;
- stock locations, location balances, batches, movements;
- transfers and items;
- recipe/version/items and modifier definitions;
- sales/order lines/payment allocations;
- shifts and close reconciliations;
- waste/adjustments;
- commerce audit.

Do not back up bearer sessions, secrets, or transient job/outbox records. Do not exclude operational history because it is “derived” unless the restore design can deterministically rebuild it and the policy is explicitly documented.

## 15. Combined flow

```text
Tenant RLS (tenant_id)
   ↓
Gym capability / plan / subscription
   ↓
Branch Context + user branch authorization
   ↓
Stock Location + shift/register context
   ↓
Store or Bar sale
   ↓
Atomic inventory movement + existing payment boundary
   ↓
Audit + reports + backup manifest
```

RLS remains cross-tenant. Branch authorization is server-side within a tenant. For high-risk inventory/finance rows, database FKs and tenant ownership checks should be added where useful, but branch context should not be added to `SESSION_CONTEXT` in the first release.

## 16. Failure modes and required behavior

| Failure | Required behavior |
|---|---|
| Branch archived during active session | Existing read can finish if authorized; new write fails and requires an active branch. |
| User loses branch access | Next request re-authorizes and fails closed; no trust in cached selector. |
| Transfer interrupted | Transaction leaves no partial quantity; an approved/in-transit transfer can be resumed by state. |
| Payment succeeds, stock fails | Do not silently mark completed; reconcile payment and keep sale recoverable/failed per existing payment policy. |
| Stock succeeds, payment fails | One transaction rolls back stock and sale unless the payment provider requires a compensating reversal. |
| Ingredient unavailable | Checkout rejects before commit and rechecks under lock. |
| Plan limit reduced below usage | Preserve existing branches; block new creation and show remediation, never delete branches. |
| Subscription suspended | Block new operational writes according to existing capability policy; preserve reads/history. |
| Offline POS | Do not claim financial completion without server confirmation; use an explicit pending queue only if later approved. |

## 17. Current verdict

Store and Inventory are implemented and reusable. Current POS is partial because Store sales exist but shifts/registers do not. Bar is missing. The safest route is extension and extraction around existing Store transactions, not a rewrite.
