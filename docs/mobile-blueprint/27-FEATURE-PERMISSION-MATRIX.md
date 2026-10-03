# 27 — Feature, Permission, Limit, and Flow Crosswalk

The executable catalogs are `src/services/feature-catalog.js`, `src/services/saas-plan-catalog.js`, `src/services/capability-service.js`, and `src/permissions/permissions.js`. This document connects them to actors and flow families without treating UI visibility as authorization.

## Authorization dimensions

| Dimension | Question answered | Source / enforcement |
|---|---|---|
| Actor/role | Who is signed in? | `roles.js`, auth service/middleware |
| Tenant type | Which product workspace can exist? | trusted persisted `gym` / `independent_trainer`, capability service |
| Permission | Which operation may this staff user perform? | persisted Assistant grants + method/path `permissionForRequest`; Owner-only guard |
| Feature | Is the commercial domain included? | Feature catalog + plan snapshot/tenant override |
| Capability | Has this server module shipped for this tenant type? | `IMPLEMENTED_CAPABILITIES_BY_TENANT_TYPE`, fail closed |
| Limit | Is another resource/AI/storage action within quota? | effective plan/tenant snapshot and service-side count |
| Context/scope | Does this tenant/user/branch/section/resource own the target? | middleware/service + SQL RLS context |
| State/business rule | Is the transition valid now? | domain service + transaction/locking |

All dimensions must allow. A feature does not grant a permission, and a permission does not bypass tenant type, plan, limit, resource state, or RLS.

## Feature key → actors, flow, limits, and denial

| Feature key | Tenant/actor and flow family | Main limits | Enforcement and unavailable behavior |
|---|---|---|---|
| `dashboard` | Gym Owner/Assistant dashboard | — | Gym capability + plan feature + `dashboard.read`; unavailable feature returns `403 SAAS_FEATURE_NOT_INCLUDED`. |
| `members` | Gym staff member lifecycle; member portal reads are separately scoped | `maxMembers` | Create service enforces tenant count; feature/permission/scope all apply. |
| `attendance` | Gym staff attendance/day operations | — | Route capability, check-in/out permissions, branch/section + membership eligibility. |
| `coaching` | Gym staff and Trainer staff plans/sessions | — | Tenant-type capability, coaching permissions and subject ownership. |
| `nutrition` | Gym/Trainer plans and meal logs; relevant portal view | — | Entitlement and tenant/client scope; writes through service. |
| `ai` | Gym/Trainer intelligence generation | `maxAiGenerations` | Both read/generate permission as applicable and server quota; quota/feature denial is authoritative. Legacy alias `intelligence → ai`. |
| `library` | Gym/Trainer staff library; portal consumption where allowed | — | Library permission and compatible tenant feature. |
| `pricing` | Gym membership/day-pass pricing and registration catalog reads | — | Gym feature; pricing writes may be Owner-only at route even where permission codes exist. |
| `payments` | Gym collections/refunds, Trainer packages/payments, portal read contracts | — | Separate create/refund rules; refund is Owner-only in Gym catalog; append-only financial truth. |
| `finance` | Gym expenses/finance/ledger | — | Gym-only feature + finance permissions + branch scope. |
| `day_passes` | Gym day-pass CRUD/void/WhatsApp | — | Gym-only feature; action-specific permissions and state validation. |
| `reports` | Gym and Trainer reports/exports | — | Report permission and tenant/branch filters; export separately permission-gated. |
| `store` | Gym POS/products/sales/returns/purchases/suppliers/expenses/reports | — | Gym-only; granular `store.*` permission; branch and stock state. |
| `inventory` | Gym locations/stock/transfers | — | Gym-only; location and branch authorization; adjustment/transfer permissions. |
| `branches` | Gym branch/section/context/access flows | `maxBranches` | Branch context is core Gym capability; creation/management Owner-only; existing/default branch not disabled by limit. |
| `bar` | Gym Bar menu/recipe/shift/sell/waste | — | Gym-only; granular `bar.*` grants and branch/shift state. |
| `portal` | Gym member and Trainer client portal commercial entitlement | — | Dedicated Portal routes use a separate session path and do not uniformly enforce this feature today. Gym lookup checks tenant `trial/active`; Trainer portal issuance is guarded by `clients` capability + normal tenant/subscription guard + `coaching.create`, not `portal`; `maxClients` applies at client creation only. This observed gap is a Product/Security decision in 21, not a client-side authorization rule. |
| `branding` | Gym/Trainer tenant branding | `maxStorageMb` | Owner-only branding view/edit/publish/reset; private storage validation. |
| `team` | Gym/Trainer Owner staff/account/permission management | `maxUsers` | Owner-only staff and permission administration; assistant grant cannot exceed catalog boundary. |
| `backup` | Gym backup UI plus platform recovery services (separate actor/scope) | `maxStorageMb` | Gym backup Owner-only permissions; official artifact verification, private storage, audit. |
| `audit` | Gym audit view; platform audit as separate platform routes | — | Gym plan feature and service scope; never expose other tenant records. |
| `clients` | Independent Trainer client lifecycle/follow-up | `maxClients` (legacy `maxMembers` fallback) | Trainer-only route + limit + client ownership. |
| `assessments` | Trainer assessment and measurements | — | Trainer capability + coaching permission + client scope. |
| `progress` | Trainer progress | — | Trainer capability + client scope. |
| `goals` | Trainer goal lifecycle | — | Trainer capability + status/ownership validation. |
| `sessions` | Trainer scheduling/session lifecycle | — | Trainer capability + active session rules and client scope. |
| `packages` | Trainer offers/purchases/session balances | — | Trainer capability; payment operations remain distinct from package CRUD. |
| `notifications` | Staff/member inboxes (role/audience-separated) | — | Server-resolved recipient/audience and unread state; `notifications.read` for staff. |
| `tasks` | Trainer action center | — | Trainer-only capability, client/tenant scope, task permission. |
| `templates` | Trainer training/nutrition templates | — | Trainer-only capability and coaching permission. |
| `prioritySupport` | Platform support entitlement display/contact | — | Commercial entitlement; no implementation API path listed in the catalog, so do not invent an in-app operational action. |

`saas-plan-catalog.js` contains the initial Starter/Basic/Pro/Business configuration and billing terms. Runtime plan/term rows and assigned subscription snapshots are authoritative; never assume catalog defaults override persisted tenant pricing. `Enterprise` is a data-backed compatibility/default path, not assumed universally purchasable.

## Limits and default catalog values

| Plan (initial catalog) | `maxMembers` | `maxClients` | `maxUsers` | `maxBranches` | `maxAiGenerations` | `maxStorageMb` |
|---|---:|---:|---:|---:|---:|---:|
| Starter | 150 | 50 | 2 | 1 | 50 | 1,024 |
| Basic | 500 | 150 | 5 | 2 | 200 | 5,120 |
| Pro | 1,500 | 500 | 15 | 5 | 750 | 20,480 |
| Business | unlimited | unlimited | unlimited | unlimited | 2,000 | 51,200 |

The table is source-default catalog, not a promise that every tenant currently has those values. Current subscription snapshot/overrides and service-specific exceptions decide actual access. `maxBranches` is resolved from the current plan for core Gym branch behavior; other limits generally use assigned snapshots. Plan term defaults are monthly/quarterly/semiannual/annual (1/3/6/12 months), with persisted active `saas_plan_terms` authoritative.

## Permission decision matrix

The exact 93 codes and their group/action/owner-only flag are already enumerated in `06-ENTITLEMENTS-PERMISSIONS-LIMITS.md`. The operational role decision is:

| Permission code class | Owner | Assistant | Platform Admin | Member/Trainer portal |
|---|---|---|---|---|
| Non-owner-only Gym permissions (all groups in catalog) | Allowed after route resolves, feature/scope/state still checked | Only if the individual persisted grant is true and the route/method maps to it; 21 safe defaults for new accounts; legacy accounts may differ | Denied in tenant role path; use platform route guards | Not applicable; portal contract is separate |
| Catalog `ownerOnly=true` codes | Owner only | Denied even if client submits/grant is attempted (`403 OWNER_ONLY_PERMISSION`) | Not a substitute; Platform Admin must use platform endpoints | Not applicable |
| Platform Admin endpoints | Not applicable | Not applicable | Allowed only under platform middleware and explicit target-tenant rules | Denied |
| Unknown/unmapped permission or route | Fail closed if no route permission is resolved | Denied; `*` does not make unknown route public | Platform routes still require registered platform guard | Denied unless explicit public/portal route |

High-impact compound rules verified in `route-permissions.js` and permission tests:

| API action | Required keys / owner rule | Denied behavior |
|---|---|---|
| `GET /members` | `members.read` + `memberships.read` | 403 when either is missing |
| `POST /members` unpaid/default initial member | `members.create` | 403 without grant |
| `POST /members` including payment, positive discount, payment note or non-default payment method | `members.create` + `payments.create` | 403 if financial grant absent |
| `PUT /members/:id` base fields | `members.update` | 403 |
| `PUT /members/:id` membership fields | `members.update` + `memberships.update` | 403 if either absent |
| `PUT /members/:id` price/payment fields | above as relevant + `payments.create` | 403 if financial grant absent |
| `POST /members/:id/renew` | `memberships.renew` + `payments.create` | 403 unless both granted |
| Branch read/manage/access | read permission for reads; branch management/access grants; management routes Owner-only | 403/OWNER_REQUIRED |
| Pricing | `pricing.read` may be granted; writes route Owner-only | 403/OWNER_REQUIRED even if `pricing.create/update` key appears |
| Gym SaaS request/proof, member request review, backup, branding, membership code secrets | matching catalog key plus Owner-only | 403/OWNER_REQUIRED |


### Static permission-rule extraction result

A read-only enumeration of `PERMISSION_CATALOG` against `ROUTE_PERMISSION_RULES` found 93 catalog entries and 86 permission codes referenced directly by static route rules. Three branch codes (`branches.read`, `branches.manage`, `branches.access.manage`) are resolved by the special branch logic in `permissionForRequest`, not by the static array. The remaining four require distinct treatment:

| Permission | Source evidence | Current mapping status |
|---|---|---|
| `members.print` | Member-detail/list Web print action checks `members.print` with member/membership read grants; browser print, no dedicated API write. | Mapped UI action; API-protected reads supply scoped data; no distinct server print operation. |
| `reports.export` | Reports UI checks this key on its CSV export action; no separate export API route. Current Gym Reports screen is initialized for Owner only, so Assistant does not reach the current UI export even if a grant exists. | Mapped UI-only key; Owner-only screen reachability is the current Web contract. Do not infer a mobile Assistant export action from the key alone. |
| `store.profit.view` | Store/dashboard/report controller projection includes or omits cost/COGS/profit values; Web hides profit-only fields. | Mapped data-projection authorization; no separate route. Enforcement is in response projection plus UI, not UI-only visibility. |
| `message_templates.manage` | The catalog key remains but its old tenant-editing surface is disabled: `GET/PUT /api/whatsapp-templates/*` is behind `PLATFORM_TEMPLATES_ONLY` (403). Runtime template reads use `requirePermission('__whatsapp_templates_runtime__')`; system template management is `GET/PUT /api/platform/whatsapp-templates*` guarded by `platformOnly`. The Platform Admin settings UI calls these routes. Tests assert tenant Owner writes are denied and PlatformAdmin can manage the central catalog. | **LEGACY/UNUSED tenant permission**. It grants no current tenant template-management action. Central template edit/restore is PlatformAdmin-only and uses `platformOnly`, not this permission key. Source: `src/routes/whatsapp-template.routes.js`, `tests/unit/whatsapp-template-api.test.js`, `tests/unit/whatsapp-template-inventory.test.js`. |

Therefore the source crosswalk classifies all 93 catalog entries: 86 occur in static route rules, three branch keys are resolved by the special branch matcher, three have identifiable UI/controller semantics, and one (`message_templates.manage`) is retained but unused for tenant authorization while central template management is PlatformAdmin-only. The operation index below records each code against its current route/action family. Mapping is not a claim that every possible role × feature × state combination has an isolated test.

### Permission-by-permission operation index

All paths omit the common `/api` prefix. “Grant-dependent” means the exact persisted Assistant grant is required; an Owner-only guard cannot be overridden by a grant. Feature, limit, tenant, branch/section, and state checks remain independent.

| Permission code(s) | Current operation and API/action | Actor and operational disposition |
|---|---|---|
| `dashboard.read` | `GET /dashboard*`, `/bootstrap*`, `/trainer/workspace` | Gym/Trainer staff read; `dashboard` feature and tenant capability apply. |
| `notifications.read` | `GET/POST /notifications*` (list/count/read) | Staff inbox; recipient/audience is resolved by server. |
| `members.read`, `members.create`, `members.update`, `members.delete`, `members.alerts`, `members.print` | `/members*`; alert `POST /members/:id/alert-communications`; print is a Web action | Gym staff; member create uses `maxMembers`. Print is UI-only and also needs member/membership read. Create/update compose membership/payment permissions conditionally from submitted fields. |
| `memberships.read`, `memberships.create`, `memberships.update`, `memberships.freeze`, `memberships.renew` | `/members*`; `/members/:id/{memberships,freeze,resume,renew}`; `/memberships/:id/{payments,branches}` | Gym staff; `memberships.create` and renew are compound with `payments.create` where defined; membership state and tenant scope apply. |
| `membership_codes.read`, `membership_codes.reveal`, `membership_codes.resend`, `membership_codes.rotate` | Owner routes `/members/:id/membership-code*` | Gym Owner-only portal-code operations; reveal/resend/rotate are never Member actions. |
| `payments.create`, `payments.refund` | Gym `/members/:id/{renew,refund-preview,refund}`, `/memberships/:id/payments`; Trainer `/trainer/package-purchases/:id/{payments,refunds}`; day-pass collection | Gym/Trainer payment operations; Gym refund is Owner-only; append-only ledger/refund semantics and source-state validation apply. |
| `trainees.read`, `trainees.create` | `GET/POST /external-trainees*` | Gym external-trainee flow; distinct from independent Trainer clients. |
| `coaching.read`, `coaching.create`, `coaching.update`, `coaching.delete` | Gym `/clients*`, `/workoutprograms*`, `/dietplans*`, `/workoutsessions*`, `/meal-logs*`; Trainer `/trainer/clients*`, `/training-plans*`, `/nutrition-plans*`, `/sessions*`, `/goals*`, `/tasks*`, `/templates*`, `/packages*`, `/package-purchases*` | Gym/Trainer staff per tenant type and subject scope. Trainer client portal access currently matches `coaching.create`; no distinct permission exists. |
| `attendance.read`, `attendance.check_in`, `attendance.check_out`, `attendance.report` | `GET /attendance*`, `POST /attendance/{check-in,check-out}` | Gym staff; member eligibility, one-visit state, branch/section rules apply. |
| `finance.read`, `finance.create`, `finance.update`, `finance.delete` | `GET /monthly-finance`, `GET /trainer/payments`, `POST/PUT/DELETE /expenses*` | Gym finance and Trainer payment-read flows as exposed; tenant/branch scope applies. |
| `reports.read`, `reports.export` | `GET /reports`, `GET /trainer/reports/summary`; client-side CSV export action | Report API is route-authorized. Current Gym Reports Web screen/export UI is Owner-only; `reports.export` does not itself expose a separate API. |
| `pricing.read`, `pricing.create`, `pricing.update` | `GET /pricing`; `/pricing-plans`, `/membership-types`, `/pricing`, `/day-passes/pricing` | Gym pricing; create/update routes are Owner-only even where catalog codes are grantable. |
| `day_passes.read`, `day_passes.create`, `day_passes.update`, `day_passes.delete`, `day_passes.whatsapp` | `/day-passes*` pricing/list/summary/create/update/delete/void/WhatsApp-opened | Gym staff; update/delete/void Owner-only, `day_passes` feature and branch/payment state apply. WhatsApp key is an opened/contact action, not delivery proof. |
| `library.read`, `library.create`, `library.update`, `library.delete` | Gym `/library*`; Trainer `/trainer/library*` | Gym/Trainer library actions; tenant/type/item scope applies. |
| `management.users.read`, `management.users.create`, `management.users.update`, `management.users.status`, `management.users.delete` | `GET/POST/PUT/PATCH/DELETE /auth/users*` | Tenant Owner-only; `team` + `maxUsers`; lifecycle can invalidate sessions. |
| `management.backup.read`, `management.backup.create`, `management.backup.restore`, `management.backup.delete` | `/backup/{archives,history,status,records,daily,inspect,restore,download}*` | Tenant Owner-only interactive operations; `backup/maxStorageMb`, verified artifact and official restore gates. Platform recovery has separate guards. |
| `feedback.read` | `GET /member-feedback*` | Gym Owner-only, tenant-scoped portal feedback. |
| `permissions.manage` | `/auth/permissions*`, user permission read/write/reset | Gym/Trainer Owner-only; validates known codes and rejects granting Owner-only codes. |
| `branding.view`, `branding.edit`, `branding.publish`, `branding.reset` | `/branding/settings`, `/branding/draft*`, `/branding/assets*`, `/branding/publish`, `/branding/reset` | Tenant Owner-only; `branding/maxStorageMb`; draft, publish and reset are distinct actions. |
| `intelligence.read`, `intelligence.generate` | `/intelligence*`, `/trainer/intelligence*` | Gym/Trainer staff; `ai/maxAiGenerations`; read and generation are separate permission/feature checks. |
| `store.view`, `store.products.manage`, `store.inventory.view`, `store.inventory.adjust`, `store.sales.create`, `store.sales.view`, `store.returns.manage`, `store.purchases.manage`, `store.suppliers.manage`, `store.expenses.manage`, `store.reports.view` | `/store*`, `/commerce/stock-locations*`, `/commerce/stock-transfers*`, `/members/:id/store-purchases` | Gym staff; `store`/`inventory`, branch/location, stock and transaction-state checks. The method-specific route rules identify the action within each family. |
| `store.profit.view` | Controller-level inclusion/redaction of cost, COGS and profit values on relevant dashboard/store/report responses; matching UI visibility | Gym Owner or Assistant with grant; data projection is its authorization effect, not a separate write endpoint. |
| `branches.read`, `branches.manage`, `branches.access.manage` | Special `permissionForRequest` matcher: branch/bootstrap reads, branch create/edit/archive, `/branches/users/:id` access assignment | Gym staff; management/access assignment Owner-only; `branches/maxBranches` applies to branch creation. |
| `inventory.locations.manage`, `inventory.transfers.read`, `inventory.transfers.manage` | `/commerce/stock-locations*`, `/commerce/stock-transfers*` | Gym staff; location creation Owner-only; transfer create/approve/receive scoped to authorized branches. |
| `bar.read`, `bar.sell`, `bar.recipes.manage`, `bar.shifts.manage`, `bar.waste.manage` | `/bar/menu`, `/bar/recipes`, `/bar/modifiers`, `/bar/shifts*`, `/bar/sales`, `/bar/waste` | Gym staff; recipe management Owner-only; branch, shift, stock and transaction-state checks apply. |
| `saas.subscription.read`, `saas.subscription.request` | `/saas/subscription`, `/saas/plans`, `/saas/subscription-requests*`, private proof file | Gym/Trainer Owner-only; allowed catalog term, pending uniqueness and proof authorization apply. |
| `portal.analytics.read` | `GET /portal/analytics` | Gym Owner-only, tenant-scoped aggregate. |
| `member.subscription_requests.read`, `member.subscription_requests.review` | `/member-subscription-requests*`, protected proof, approve/reject | Gym Owner-only; approval validates pending/proof and commits membership/payment/notification per service contract. |
| `message_templates.manage` | No active tenant management action; `/whatsapp-templates*` tenant management is disabled; central template UI uses PlatformAdmin-only `/platform/whatsapp-templates*` | `LEGACY/UNUSED` tenant permission. Catalog description is stale; do not grant or implement it as a mobile tenant capability. |

The permission code roster above was checked against the executable `PERMISSION_CATALOG`: 93/93 distinct keys have a disposition. It documents current behavior, not route equivalence between legacy and canonical Platform APIs.

## Crosswalk source references

- Permissions: `src/permissions/permissions.js`, `route-permissions.js`, `permission-service.js`, `permission.middleware.js`, `role-permissions.js`.
- Features/limits: `src/services/feature-catalog.js`, `capability-service.js`, `saas-plan-catalog.js`, `saas-service.js`.
- Route outcomes and flows: `docs/mobile-blueprint/25-END-TO-END-FLOWS.md`, `03-API-CATALOG.md`, and `23-WEB-MOBILE-PARITY-AUDIT.md`.
- Denial contract: `06-ENTITLEMENTS-PERMISSIONS-LIMITS.md`; never collapse `401`, `403`, `404`, `409`, and feature/limit errors into one client state.

## Resolved source dispositions and bounded decisions

- All 93 permission keys now have an implemented route/action family, a special matcher/UI/data-projection disposition, or an explicit legacy/unused disposition above. Conditional member permissions, Owner-only route overrides, branch matching, and the Owner/Assistant distinction are explicit; runtime grants and plan snapshots remain server-authoritative.
- No permission key is labeled `DOCUMENTATION GAP`. A missing dedicated test for a UI-only permission is not represented as proof of a missing operation; its enforcement locus is identified above. Security test coverage remains as cited in the tests/source references.
- The active behavior of `message_templates.manage` is documented, but its catalog description still says tenant template management. The documentation records the mismatch as stale source metadata; changing product code/catalog is outside this documentation-only task.
- Tenant-specific runtime feature/limit overrides cannot be generalized as plan defaults. Mobile must consume the authenticated effective entitlement envelope and server errors, not infer tenant values from the initial plan table.
- Platform, Gym Member Portal, and Trainer Client Portal authorization are separate contracts, not unmapped Gym permission combinations.
