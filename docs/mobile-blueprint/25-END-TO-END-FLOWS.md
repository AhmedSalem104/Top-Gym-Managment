# 25 — End-to-End User Journeys

Web, backend services, and tests are the functional source of truth. This document traces the shipped business-operation families to their current API families, authorization dimensions, preconditions, outcomes, and denied paths. It is not a pixel-level inventory, and it does not promote internal/compatibility routes to mobile features.

## Gym Owner journeys

| Flow | Preconditions / entry | Actions and server path | Permission / entitlement / scope | Result and next state | Important failures / alternatives |
|---|---|---|---|---|---|
| Staff login → Gym workspace | Active Owner account; `/` login | `POST /api/auth/login` → server session → session/bootstrap → trusted tenant and effective access | Role Owner; tenant type `gym`; active tenant/subscription guard | Gym shell and dashboard with server-derived navigation and context | Invalid login; 401 session expiry; expired/suspended tenant recovery; forced password change; network error. Never accept tenant ID from a client as the login authority. |
| Dashboard → operational action | Authenticated Gym context | Bootstrap/dashboard APIs → KPI/alerts/quick links → navigate to owning module | `dashboard.read`; `dashboard` feature; tenant and selected branch where data is scoped | Dashboard data then selected operational workflow | Missing permission/feature, stale branch, tenant lifecycle denial; dashboard tile is a navigation aid, not a write authorization. |
| Member create → initial membership → optional collection | Member module; valid Gym plan/branch | Form → `POST /api/members`; service validates identity/duplicates, tenant, membership, branch/section, limits; creates member/membership and payment only when supported/requested | `members.create`; if paid/discount/payment fields are present also `payments.create`; `members` feature/maxMembers; validated branch/section | Member profile/list updated; optional payment recorded; receipt/ledger state as returned | Duplicate member, validation, limit, permission, branch mismatch, payment validation/transaction failure. Unpaid initial membership must not require payment permission solely because optional defaults serialize. |
| Member list → detail → edit | Existing tenant member | Search/filter/sort/list → detail → `PUT /api/members/:id` | `members.read`; update requires `members.update`; membership fields add `memberships.update`; pricing/payment fields add `payments.create`; scoped member access | Updated profile/current membership and refreshed list/detail | Missing compound permission → 403; missing/cross-tenant resource → scoped not-found; stale branch context requires refetch. |
| Membership renewal / payment | Existing member and allowed membership state | Select plan/term/discount/payment → renewal endpoint (`POST /api/members/:id/renew`) / payment route; service computes amount, updates subscription and append-only payment semantics transactionally | `memberships.renew` + `payments.create`; `memberships`/`payments` capability; tenant/member/branch scope | New/extended membership and payment record; ledger is authoritative for cash | Insufficient combined permission; pricing/validation/conflict; payment idempotency rules as defined by endpoint. Do not represent a membership snapshot as a second cash event. |
| Freeze / resume membership | Member with eligible membership | Detail/action → freeze or resume endpoint → validated date/range and freeze record | `memberships.freeze`; membership scope and service transition validation | Freeze affects effective membership/attendance eligibility; resume closes freeze and recalculates effective end date according to service contract | Invalid dates, already frozen/not eligible, conflict, missing permission. Frozen members are not eligible for normal check-in. |
| Refund | Existing collected payment/subscription that satisfies refund rules | Preview then refund endpoint; service preserves payment/ledger history and writes refund adjustment | Owner-only `payments.refund`; finance/payment capability; tenant/member/source scope | Refund adjustment and updated member balance/status; audit trail | Non-refundable/already refunded/stale preview/permission denial; never delete historical financial facts. |
| Attendance check-in/out | Active branch context; member/day pass identity; policy allows visit | Search/scan/select member → check-in; active visit → checkout; API applies membership/freeze/branch/section/women-only/duplicate rules | `attendance.check_in`/`check_out`; attendance feature; tenant + branch + section scope | Attendance event persisted; notifications/occupancy and dashboard may refresh; automatic checkout is a separate system job | Frozen/expired/ineligible membership, duplicate active visit, branch/section mismatch, capacity/policy validation; conflict returns current state for reconciliation. |
| Branch/section setup and context | Gym Owner; branch capability | Branch list/create/update/archive → sections/access assignment; switch context then refetch dependent data | `branches.read`; management Owner-only (`branches.manage`, `branches.access.manage`); `branches` feature/maxBranches; all entities remain same tenant | Branch and section tree; staff access assignment; new selected context | Limit, cannot archive due to dependency/state, non-owner denied; branch switch invalidates dependent dashboard/member/attendance/finance/inventory reads. |
| Day pass | Gym operational, configured day-pass price | View pricing/records → create/update/void → optional WhatsApp action/audit | `day_passes.*`, `pricing.read/update` as route rules specify; `day_passes` feature; branch scope | Pass/visit/collection state updated; WhatsApp is a client link/open event, not proof a provider delivered message | Invalid price/state, duplicate/void conflict, missing permission, feature/tenant denial. |
| Coaching / nutrition / library | Member or client exists in tenant scope | Select subject → create/update/archive workout/diet/measurement/session/log; library read/manage | `coaching.*`, `library.*`, AI permissions when generated; matching features and AI quota; tenant/subject scope | Plan/content/log state updated and visible in appropriate staff/portal surface | Invalid subject ownership, status transition, unsupported data, AI quota or feature denial. |
| Finance, expenses, reports | Finance-capable Gym | Select range/branch → view ledger/expenses/reports → create/update/delete expense or export where available | `finance.*`, `reports.*`; finance/reports features; tenant and branch scope | Aggregates reflect actual collections/refunds and expense facts; exports preserve applied filters | Permission/feature/scope/validation; no double count of migrated subscription snapshot; historical rows are not rewritten. |
| Store / inventory / bar | Gym plan enables module; authorized branch/location | Product/supplier/purchase/stock transfer → POS sale/return/expense; bar shift/recipe/waste | Exact `store.*`, `inventory.*`, `bar.*` permissions, relevant feature flags, branch/location scope | Sale/payment/stock/shift audit and inventory quantities transition | Insufficient stock, closed shift, transfer state conflict, unauthorized location, plan/permission denial. Financial/stock side effects must reconcile through server result. |
| Team and Assistant permissions | Owner; team entitlement/user limit | List/create/update/disable/delete staff → edit grants → branch access; login sessions may be revoked by lifecycle action | Owner-only `management.users.*`, `permissions.manage`, `branches.access.manage`; `team` feature/maxUsers | Active staff and effective permission envelope updated | Limit, username collision, forced password/session condition, `OWNER_ONLY_PERMISSION`, `OWNER_REQUIRED`; unknown codes rejected. |
| Gym subscription request | Owner; no canonical pending request | Load plan/terms/history → select plan/term, optional notes, one proof → one multipart submit | Owner-only `saas.subscription.*`; active compatible catalog term; tenant lock/unique pending guard | `pending` record + proof metadata + persistent notifications atomically; success moves UI to pending | `409 SAAS_REQUEST_ALREADY_PENDING`; invalid proof/pricing/tenant, timeout ambiguous (read history before retry), mail failure is post-commit and does not reverse success. |
| Profile/settings, branding, backup, audit | Owner; relevant plan and operational tenant | Edit tenant/profile/settings, brand draft/publish/reset, inspect audit, create/inspect/restore/delete backups | Owner-only or route-specific permission; `branding`/`backup`/`audit`/`team` entitlement, storage limits | Settings or controlled backup operation recorded; restore is a high-impact workflow with official verification | Validation, storage limit, immutable audit, restore safety gate, permission denied. Backup/restore should remain mobile read/status-only unless a safe native workflow is separately specified. |
| Notifications → read/action | Authenticated recipient | Load list/count/filter → open notification → mark one/all read → navigate to linked record | `notifications.read`; tenant, audience, role and recipient scope | Persisted unread count/list reflects state; action destination reauthorizes independently | Stale/foreign notification is not accessible; category or notification ID grants no capability. |

## Assistant journey and permission-dependent operations

Assistant follows the same staff login and tenant resolution as Owner, then receives only its effective permission envelope. Navigation hides or disables unavailable actions, but each API checks again.

| Operation | Owner | New Assistant default | Existing Assistant | Requirements / denied result |
|---|---|---|---|---|
| Read/create/update member | allowed | granted | depends on persisted grant | `GET /members` also requires `memberships.read`; service scope/limit still applies. |
| Create member with payment/discount | allowed | denied unless explicitly granted `payments.create` | depends | `members.create` plus conditional `payments.create`; otherwise 403. |
| Edit membership fields | allowed | denied unless `memberships.update` (default granted) | depends | `members.update` + `memberships.update`; payment-related fields additionally require `payments.create`. |
| Delete member / freeze / renew | allowed subject to rules | not granted by safe defaults | depends on grant except Owner-only/compound rule | Delete uses `members.delete`; freeze uses `memberships.freeze`; renewal requires `memberships.renew` AND `payments.create`. |
| Attendance | allowed | check-in/out/report granted by safe defaults | depends | Requires operation permission + feature/context/member eligibility. |
| Read pricing / change pricing | allowed | read granted; write denied | write permission is Owner-only at route despite catalog write codes | `pricing.create/update` in catalog do not defeat route `ownerOnly`. |
| Finance/store/branch config/backup/team/branding/SaaS | allowed when entitled | unavailable by default; owner-only subsets denied | permission-dependent only where not owner-only | Owner-only keys cannot be assigned to Assistant; service/feature guards remain. |
| Coaching/library/day pass | allowed | read/create/update coaching; read library; read day pass granted | depends; legacy grants may be broader | Delete/write scope follows exact grant and route method; feature and subject scope still apply. |

Never describe Assistant as a fixed “limited Owner”. Actual permissions differ for legacy/current accounts, and per-request predicates may require multiple keys.

## Independent Trainer Owner journey

```text
Staff login → trusted independent_trainer context → Trainer Studio bootstrap
 → dashboard/workspace → clients → client profile/follow-up
 → assessments/measurements/progress/goals
 → sessions and training/nutrition plans/logs
 → packages and purchases/payments/refunds
 → tasks/templates/library/AI/reports/notifications
 → trainer client portal → team/settings → local portal reset/session expiry (no server logout endpoint)
```

Each step is subject to the independent-trainer feature snapshot, `maxClients` (legacy fallback `maxMembers` where applicable), applicable `maxUsers`, AI quota, payment/refund rule, tenant/client ownership, and route permission. Trainer APIs used by the shipped app include `/api/trainer/*`; shared coaching aliases exist and must not be mistaken for an unscoped alternate authorization route. Wrong tenant type returns `404 TRAINER_ROUTE_NOT_FOUND`. The operation map below and `27-FEATURE-PERMISSION-MATRIX.md` cover the current route/action families; no action listed here is intentionally left as an inferred “CRUD” capability.

| Trainer flow | Entry/action → API family | Guard and result |
|---|---|---|
| Workspace/dashboard | Login/bootstrap → `GET /api/trainer/workspace`, effective subscription/entitlements | Independent Trainer tenant only; dashboard permission/feature; summary includes active clients, today's/upcoming sessions, follow-ups, expiring packages, and due payments. |
| Client lifecycle | Search/list/create/detail/edit/archive: `GET/POST /api/trainer/clients`, `GET/PATCH/DELETE /api/trainer/clients/:id` | `coaching.read/create/update/delete` route family, `clients` feature + `maxClients`, tenant ownership; over-limit create returns `409 SAAS_PLAN_LIMIT_REACHED`; foreign client returns `CLIENT_NOT_FOUND`. |
| Client assessment/progress | Measurements/check-ins create/read/update/delete and timeline under `/api/trainer/clients/:id/{measurements,checkins,timeline}` | Coaching permission + same client/tenant; server-owned timestamps and client reference. |
| Training/nutrition plans | CRUD and status under `/api/trainer/{training-plans,nutrition-plans}`; catalog/library reads under `/api/trainer/library/*` | Coaching permission, feature, client scope; AI generation is a draft path requiring AI feature/quota and `intelligence.generate`; generated data is reviewed/saved through normal plan route. |
| Session scheduling | Read/create/update/status via `/api/trainer/sessions` | Coaching permission; client scope; visible states include `scheduled`, `completed`, `cancelled`, `no_show`; status endpoint validates transition. |
| Package and purchase | `/api/trainer/packages`, `/api/trainer/package-purchases` | Coaching permission and trainer tenant/client scope; package balances are server-authoritative. |
| Payment/refund | Read payments `/api/trainer/payments`; add payment/refund at `/api/trainer/package-purchases/:id/{payments,refunds}` | `finance.read`, `payments.create`, `payments.refund` respectively; writes accept idempotency key; refund is a distinct financial transition. |
| Goals/tasks/templates | `/api/trainer/goals`, `/tasks`, `/templates`; status/dismiss/instantiate actions | Coaching permission and client ownership; task completion/dismissal, goal archive/reactivation and template instantiation are separate actions. Exact enum/error edges need the owning service tests before native enum parity is claimed. |
| Notifications/follow-up/reports | `/api/trainer/notifications`, `/follow-up`, `/reports/summary` | Trainer tenant scope; coaching/read, notification audience and report permission. Notification action links open the related client only after reauthorization. |
| Client Portal access | `POST /api/trainer/clients/:id/portal-access` | Issues/retrieves a portal capability for that client. Current generic permission matcher classifies this POST as `coaching.create`; this security-sensitive classification is an explicit open question, not silently remapped. |

### Trainer Assistant note

The global staff role enum also includes `Assistant`; route permissions are account-grant based, not a separate Trainer role. The safe defaults include shared coaching/read/create/update and AI grants, but a specific Trainer Assistant's access must be resolved from persisted grants and the `independent_trainer` entitlement/context. Do not apply Gym UI tab grouping as a Trainer authorization map.

| Trainer flow/action | Trainer Owner | Trainer Assistant | Permission / feature / limit | Denied or state behavior |
|---|---|---|---|---|
| Workspace, dashboard, follow-up, reports | Allowed when Trainer capability and plan permit | Grant-dependent; do not inherit Gym Assistant navigation assumptions | `dashboard.read`, `coaching.read`, `reports.read`; `dashboard`, `clients` | Wrong tenant type `404 TRAINER_ROUTE_NOT_FOUND`; feature or permission denial remains authoritative. |
| Client read/create/edit/archive | Allowed in own trainer tenant | `coaching.read/create/update/delete` grant-dependent | `clients`; `maxClients` is checked on create (legacy `maxMembers` fallback where service applies) | Foreign client returns scoped `CLIENT_NOT_FOUND`; create at limit returns `409 SAAS_PLAN_LIMIT_REACHED`. |
| Measurements, check-ins, timeline, progress | Allowed for own clients | Grant-dependent per coaching operation | `assessments`, `progress`; `coaching.*` | Client ownership and validation; no cross-tenant ID access. |
| Training/nutrition plans, logs, library | Allowed subject to feature/state | Grant-dependent per method | `coaching.*`, `library.*`; `coaching`, `nutrition`, `library` | Invalid status/subject denied; archive/delete semantics follow exact action. |
| Sessions | Allowed subject to client/session state | Grant-dependent under coaching routes | `coaching.*`, `sessions`; client ownership/package balance | Completed session is immutable; package exhaustion conflicts; refetch after 409. |
| Packages/purchases/payment collection | Allowed subject to feature and purchase state | Package/coaching actions grant-dependent; collection also needs `payments.create` | `packages`, `payments` | Cancelled/expired purchase cannot collect/consume; idempotency and balance enforced server-side. |
| Refund | Allowed only under Owner-only refund grant/route policy | Denied (`payments.refund` is owner-only) | `payments.refund`; payments capability | Owner-only denial; preserve original collection and render refund adjustment. |
| Goals/tasks/templates | Allowed subject to client ownership and valid state | Grant-dependent by read/create/update/delete route | `goals`, `tasks`, `templates`; `coaching.*` | Invalid/terminal transition rejected; instantiate uses target-client/plan validation. |
| Trainer Client Portal access issuance | Allowed for own client | Grant-dependent: generic POST rule requires `coaching.create` | `clients` capability; no dedicated `portal` feature or `maxClients` issuance check | Client ownership/tenant guard; whether paused/archived client blocks access is a Product/Security decision. |
| Notifications | Allowed for own Trainer audience | `notifications.read` grant-dependent | `notifications` | Recipient is server-resolved; foreign item not addressable. |
| Team, permission grants, branding | Owner-only | Denied regardless of submitted grant | `management.users.*`, `permissions.manage`, `branding.*`; `team/maxUsers`, `branding/maxStorageMb` | `403 OWNER_REQUIRED` / owner-only permission rejection. |

Trainer Owner and Assistant share tenant plan/feature/limit snapshots; the role changes per-operation grants, not the commercial plan or tenant data boundary. Trainer workspaces have no Gym Branch/Section context. Current Trainer Assistant grant data must be fetched from the authenticated server envelope; there is no safe assumption that every Trainer Assistant has the new-account default set.

## Member and Trainer Client portal journeys

### Portal data differences that must survive mobile adaptation

| Portal mode | Authenticated payload / capabilities | Explicitly absent |
|---|---|---|
| Gym Member | Lookup response includes own member/tenant portal snapshot; later endpoints provide own memberships, payments, freeze details, attendance, permitted branches, report/print/PDF, library, rating/feedback, notifications, crowd aggregate, and member subscription request/proof operations according to current routes. | Other members, staff navigation, staff roles, branch switching authority, raw attendance identity/crowd member list. |
| Trainer Client | Own trainer-client identity, training/nutrition plans, measures/check-ins/timeline, training activity, package purchases, sessions, payments, notifications and available portal content. | Gym membership, Gym attendance/freeze, Gym crowd state, Gym subscription request. |

The trainer issues/retrieves client portal access through `POST /api/trainer/clients/:id/portal-access`. It is guarded by the `clients` capability, normal tenant/subscription guards, and generic Trainer-client POST permission `coaching.create`; it has no dedicated `portal` feature/permission check, and `maxClients` is checked when creating a client, not when issuing portal access for an existing client. Portal mode is resolved by the server (`trainer_client` vs Gym member); a mobile caller must not choose or override it.

### Gym member

```text
Enter membership code → POST /api/member-portal/lookup
 → server HMAC resolves member + tenant → portal session
 → GET /api/member-portal/session → tenant/member identity IDs only → fetch self profile and enabled portal data
 → navigate only own attendance/payment/training/nutrition/library/notification/feedback/request surfaces
 → local reset/session expiry → code entry (no server logout endpoint)
```

Membership codes can be revoked/rotated by Owner. Code reveal/resend/rotate never become Member actions. File/proof access remains separately authorized. A member subscription request is reviewed by Owner and can atomically create membership/payment on approval; member request states and proof use separate portal routes and rate/ownership checks. `member.subscription_requests.read/review` are Owner-only staff permissions.

Portal API families include `POST /api/member-portal/lookup`, `GET /api/member-portal/session`, portal-scoped profile/subscription/payment/attendance/library/occupancy/feedback/notification endpoints, and the separate `/api/member-subscription-requests` routes for member request creation and proof lifecycle. The exact route catalog is in `03-API-CATALOG.md`; do not assume every module is enabled for both portal modes.

### Portal auth and subscription request contract confirmed

| Step/action | API / actor | Guard, state and outcome |
|---|---|---|
| Issue/read/reveal/resend/rotate a Gym member code | Owner: `/api/members/:id/membership-code` (GET), `/reveal`, `/resend`, `/rotate` (POST) | Owner-only; tenant/member scope; raw code is not logged; rotate/revoke invalidates previous capability. Catalog permission family `membership_codes.*`. |
| Enter code | Portal identity: `POST /api/member-portal/lookup` with code and optional slug hint | Rate-limited; HMAC lookup resolves owner tenant/member; revoked code or tenant outside `trial`/`active` fails closed. Success sets HttpOnly portal-session cookie and returns the initial snapshot/mode. Optional slug is a consistency hint, not authority. |
| Restore current portal identity | Portal cookie: `GET /api/member-portal/session` | Validates session hash, `revoked_at IS NULL`, and `expires_at > now`; returns tenant/member IDs only, not profile/snapshot. Client then fetches portal data. Returns 401 `PORTAL_SESSION_REQUIRED` or `PORTAL_SESSION_EXPIRED`; current Web reload starts at code entry instead of calling it automatically. |
| Logout/reset | No server logout/revocation route is registered; visible reset clears page state only | Client reset is not server revocation. Session expiry is configurable 1–7 days (default one day); early server logout requires a Product/Security decision and a new contract. |
| Code rotation / existing session | Owner rotates/revokes the membership code | Rotation blocks future code lookup but does not invalidate sessions already issued using the old code; session resolution checks its own revoke flag/expiry, not the current code state. Whether rotation should revoke existing sessions is a Product/Security decision. |
| Tenant status after portal login | Lookup checks tenant is `trial` or `active`; existing session resolution checks the session record only | Existing portal session is not shown to re-check tenant status. Whether suspend/expiry must immediately invalidate existing sessions is a Product/Security decision; do not promise immediate invalidation. |
| Member subscription request create | Member: `POST /api/member-portal/subscription-requests` | Portal cookie/session identity; membership plan/type validated; one pending request per type enforced; request/proof are separate API steps. |
| Upload request proof | Member: `POST /api/member-portal/subscription-requests/:requestId/proof` with raw file body | Ownership + pending state + type/size/signature validation; 4 MiB limit; no public storage URL. Upload failure is recoverable against the existing request; do not create a second request blindly. |
| Review member request | Gym Owner: `GET /api/member-subscription-requests`, protected proof file, `POST /:requestId/approve|reject` | Owner-only permission keys `member.subscription_requests.read/review`; approve transaction creates associated membership/payment and persistent notification; stale or repeated review is rejected. |

Current entitlement observation: portal-session routes use a dedicated path, not the general staff SaaS route guard. Member code lookup checks tenant status `trial`/`active`; existing session resolution does not re-check it. The reviewed paths do not uniformly enforce the `portal` plan feature. This is current behavior, not a client-side authorization assumption. Whether to add a uniform portal feature gate or immediate tenant-suspension revocation is a Product/Security decision, not a documentation gap.

### Trainer client

```text
Trainer client portal entry → resolve owning trainer/client session → self-scoped portal payload
 → permitted plan/session/progress/task data → session expiry/logout
```

This is not a Gym Member identity and must not reuse Gym member code/session assumptions. Its access issuance, server-resolved `trainer_client` mode, self-scoped data, shared portal session expiry, and missing explicit logout route are mapped here. The logout/revocation and code-expiry policy questions are isolated in `21-OPEN-QUESTIONS.md` and do not change the documented current contract.

The Trainer issues portal access through `/api/trainer/clients/:id/portal-access`; it requires `coaching.create`, the `clients` capability, and normal tenant/subscription checks. `maxClients` applies at client creation, not access issuance. There is no separate `portal` feature check on this route. Lookup resolves `portalMode: trainer_client`, creates the separate portal session, and filters out Gym membership/attendance/freeze/crowd/renewal surfaces. Current lookup/session resolution does not establish that paused/archived clients or suspended tenants invalidate an existing session; see the isolated decisions in `21-OPEN-QUESTIONS.md`.

## Platform Admin journeys

```text
Platform Admin login → tenantless platform session → overview
 → search/list tenant → explicit target tenant detail
 → inspect plan/subscription/features/limits/audit
 → perform permitted lifecycle/plan/override/payment-review action
 → audit result + re-read authoritative tenant state
 → logout
```

| Flow | Preconditions / steps | Result and guardrails |
|---|---|---|
| Tenant onboarding | Platform Admin → create tenant/initial Owner (or review public registration for Gym or Independent Trainer) → set compatible tenant type/plan/initial state | Tenant and Owner created through platform service; uniqueness/validation; public registration queue is shared across tenant types and review reads `tenant_type` from the request. Never accept target tenant from non-platform caller. |
| Plan/catalog management | Read plan/terms → create/update/disable/archive as supported → compatibility checks | Plan state/terms persist; historical subscription snapshots remain authoritative for assigned tenant; incompatible type/term rejected. |
| Subscription request review | Queue → request detail → private proof → approve/reject once | `pending → approved/rejected`; valid proof/current term required; plan/duration and paid-time accumulation rules apply; notifications persist to Gym, email side effect/outbox does not determine business success. |
| Tenant lifecycle | Select explicit tenant → set supported state among `trial`, `active`, `suspended`, `expired`, `archived` → provide reason for suspend/archive → confirm/audit | Current lifecycle operation validates the requested enum and required reason but does not enforce a stricter previous-state transition graph in the reviewed service. This documents accepted behavior; client must only show actions exposed by the current Platform UI and re-fetch after mutation. Archived blocks login; hard deletion is not implied. |
| Plan/feature/limit override | Explicit tenant → inspect persisted effective plan and overrides → apply supported change → audit | Server resolves effective feature and limits; tenant type, subscription snapshot, service compatibility, and schedule semantics still apply. |
| Owner reset / operational support | Explicit tenant → permitted reset/support control → reauthenticate/confirm where required → audit | Sensitive platform-only action; do not move to Gym/Trainer contexts or expose credentials/secret material to mobile. |
| Platform backup/recovery and audit | Platform Admin → inspect health/history → execute only supported guarded operation | Backup artifact must be verified; recovery is a high-risk official service flow, not a casual mobile feature. |

### Platform lifecycle detail confirmed in service/routes

- Tenant statuses accepted by the lifecycle control surface are `trial`, `active`, `suspended`, `expired`, `archived`; suspend/archive actions collect an audit reason/context. Do not invent a stricter transition graph than the service currently enforces.
- Platform subscription lifecycle includes `trial`, `active`, `expired`, `cancelled`, `suspended`. Reactivation of an expired subscription is rejected until expiry is extended/reset through a supported lifecycle action.
- Scheduled plan-change records use `scheduled`, `applied`, `cancelled`; a new renewal schedule cancels/replaces the prior pending schedule according to the current service flow. They are distinct from immediate plan application.
- Plan lifecycle includes `active`, `disabled`, `archived`; disabling requires a reason and last-active-plan/Enterprise protection rules remain enforced.
- Platform controls also include tenant search/filter/sort/pagination, tenant profile tabs, usage/entitlement overrides, user status/reset/Owner operations, plan/payment-method operations, subscription request and public registration request review, audit/internal notes, and platform/tenant backup health/history/operations. Legacy `/api/platform/*` routes coexist with `/api/platform-admin/*`; treat each path as its own contract until equivalence is proven.
- Public Gym/Trainer registration review is distinct from an existing tenant's SaaS subscription request. Both may include private proof, but have different aggregates, transitions, and endpoints.

### Current Platform Admin action → API map

Every action below is authenticated by `PlatformAdmin` via `platformOnly`; tenant-scoped actions require an explicit `tenantId` in the route and audit the mutation. The API catalog/routes remain authoritative for exact payload schemas.

| Platform action/flow | Current canonical API | Preconditions / result / next state |
|---|---|---|
| Overview and tenant directory | `GET /api/platform-admin/dashboard`, `GET /api/platform-admin/tenants` | Filters/pagination return current tenant summaries; selecting one loads an explicit tenant profile. |
| Create tenant / edit profile / lifecycle status | `POST /api/platform-admin/tenants`, `GET/PATCH /api/platform-admin/tenants/:tenantId`, `PATCH /:tenantId/status` | Create validates tenant type and first Owner; edits/status require supported values and audit context, with reason for suspend/archive. Re-read profile after success. |
| Subscription and plan assignment | `GET/PATCH /api/platform-admin/tenants/:tenantId/subscription`, `PATCH /:tenantId/plan` | Server validates plan compatibility, term/dates, and lifecycle; request approval accumulation rules remain authoritative. |
| Features, usage, overrides | `GET /api/platform-admin/feature-catalog`, `GET /:tenantId/usage`, `GET/PUT /:tenantId/overrides` | Tenant-specific effective features/limits are server-resolved; override changes are audited. Do not infer from default plan values. |
| Tenant users and Owner operations | `GET /:tenantId/users`, `PATCH /:tenantId/users/:userId/status`, `POST /:tenantId/users/:userId/reset-password`, `POST /:tenantId/owner` | Explicit target tenant/user; sensitive resets/replacement require guarded input and audit; secrets are not returned to clients. |
| Technical health, audit, notes | `GET /:tenantId/health`, `GET /:tenantId/audit`, `GET/POST /:tenantId/notes`, `GET /api/platform-admin/audit` | Read-only tenant/platform status; notes are internal; no tenant authority inferred from route identifiers. |
| Plan catalog and payment methods | `GET/POST /plans`, `PATCH /plans/:planId`, `PATCH /plans/:planId/status`, `DELETE /plans/:planId`; `GET/POST /payment-methods`, `PATCH /payment-methods/:methodId` | Plan protections/compatibility and active-state constraints apply; payment-method changes are platform-owned. |
| SaaS request review | `GET /api/platform-admin/subscription-requests`, `GET /payment-proofs/:proofId/file`, `POST /subscription-requests/:requestId/{approve,reject}` | Pending-only; approve requires authorized private proof and current plan-term/amount validation; approved/rejected is terminal; notification/outbox and subscription state follow service transaction. |
| Public Gym/Trainer registration review | `GET /api/platform-admin/gym-registration-requests`, protected proof, `POST /:requestId/{approve,reject}` | One review queue for both tenant types; applicant's route-bound `tenant_type` determines the created tenant; approval creates first Owner, rejection is terminal. |
| Platform and tenant backups | Platform `/backups/{health,history,run,retention,:backupId/download}`; tenant `GET/POST /tenants/:tenantId/backups`, `GET /tenants/:tenantId/backups/:backupId/download` | Rate-limited operational actions; private artifact, verified-only download, official retention/recovery policy and audit required. This is Mobile N/A absent approved high-risk recovery UX. |

The active Platform Admin HTML/JS consumes these canonical action families. Old `/api/platform/*` operations are registered but the previous consumer has no current HTML entry; they are legacy for Mobile and not presumed equivalent. Platform endpoint denial is `403 PLATFORM_ADMIN_REQUIRED` for a non-PlatformAdmin identity; missing/stale object and invalid-state responses must be re-read rather than retried blindly.

### Platform route canonicality (for future mobile clients)

| Route family / flow | Classification | Evidence and client rule |
|---|---|---|
| `/api/platform-admin/*` tenant, plans, subscription, registration, proof, payment-method, audit, backup | **CURRENT CANONICAL** | `public/platform-admin.html` loads `public/js/platform-admin.js`, whose current actions call this family; routes are guarded by `platformOnly`. Use this family for any future Platform Admin client flow. |
| `/api/platform/*` overview/tenants/plans/subscription-requests/proofs/audit | **LEGACY / COMPATIBILITY** | Still registered and consumed by old `public/js/pages/platform/platform.js`; the source scan found no current HTML entry loading that script. Do not port this old screen's calls to a new client. No route removal is inferred. |
| `/api/platform/whatsapp-templates/*` central system templates | **CURRENT CANONICAL EXCEPTION** | Current Platform Admin settings component `public/js/pages/management/whatsapp-templates.js` is mounted from `platform-admin.html` and uses these routes; all are `platformOnly`. It is not the deprecated tenant-template surface. |
| `/api/whatsapp-templates/*` tenant management | **DEPRECATED / DISABLED** | Legacy namespace is explicitly blocked with `403 PLATFORM_TEMPLATES_ONLY`; runtime read route remains separately permission-gated. |
| `/api/platform-admin/gym-registration-requests/*` | **CURRENT CANONICAL** | Current Platform Admin registration review flow, separate from existing-tenant subscription request queue. The queue accepts both Gym and Independent Trainer applications. |

The old and current platform families overlap for some operations but are not proven behavior-equivalent; classification is based on current Web consumer and route registration, not API name similarity. For Mobile, `/api/platform/*` is **LEGACY / DO NOT USE**; whether it is retained for external compatibility or retired is a separate maintenance decision (`MOB-017`). Current mobile contract follows active Platform Admin UI action families listed above. The active `/api/platform/whatsapp-templates/*` exception is not part of the legacy family.

Public registration actor mapping: Gym and Independent Trainer applicants use their respective public registration forms/routes. The Platform Admin review queue is one canonical queue/service for both; its legacy route/UI word “gym” does not make it Gym-only. Approval creates the tenant of the requested type and its first Owner. This is an implementation fact, not a product choice.

## Cross-module journeys

1. `Member → Membership → Payment → Ledger → Attendance`: membership state and payment facts are separate but transactionally linked as service requires; check-in revalidates active/frozen/expired state and branch/section policy.
2. `Branch → Section → Staff access → Member eligibility → Attendance`: every context is validated against the same tenant; women-only/mixed policy is enforced by the owning branch/section services, not client filter alone.
3. `Trainer → Client → Package → Purchase/Payment → Session → Training/Nutrition → Progress/Goal`: client ownership and package/session balances are server-authoritative; payment/refund is a distinct financial flow.
4. `Plan → Features/limits → route capability → role permission`: entitlement and permission are independent gates; a visible tab does not grant access.
5. `Subscription request → proof → Platform review → subscription snapshot → feature envelope → Gym notification`: approval drives the effective plan/duration; email is a side-effect and not an authorization or success signal.
6. `Member code → portal session → owning tenant/member → portal content/feedback/request`: identity remains self-scoped; staff operations never run through portal session.

## Shared failure paths

| Condition | Typical contract / action |
|---|---|
| `401` | Restore/refresh once only where contract permits; otherwise clear secure session and return to sign-in. |
| `403` role/permission | Keep server denial; update capability presentation from authoritative envelope; never use hidden UI as a security boundary. |
| Feature/plan unavailable | `403 SAAS_FEATURE_NOT_INCLUDED`; show recovery/plan information only if allowed. |
| Plan limit | Preserve entered data, display server limit/current usage if response provides it; no optimistic creation. |
| Suspended/expired/archived tenant | Route to allowed recovery/help state; historical read surfaces only if endpoint explicitly permits. |
| Expired/frozen membership | Attendance/renewal-specific validation; fetch current membership state rather than retrying stale action. |
| Duplicate/conflict | Reconcile current server state; do not blind retry non-idempotent operation. Examples: open workout session, pending SaaS request, already-reviewed request. |
| Validation | Field-level/server code mapping; preserve safe draft; do not locally widen accepted values. |
| Network/5xx | Reads may retry under bounded policy; mutation retry only with documented idempotency or authoritative reconciliation. |

## Traceability status

This journey document is the source-grounded mobile business-flow contract for the shipped operation families. `23-WEB-MOBILE-PARITY-AUDIT.md` remains the detailed Web surface inventory; `06-ENTITLEMENTS-PERMISSIONS-LIMITS.md` and `05-FEATURE-CATALOG.md` remain the canonical catalogs. Route/action families, permission dispositions (including special matchers and UI/controller-only permissions), state transitions, and flow-changing denials are cross-referenced in `24`, `26`, and `27`. Native UI implementation and a one-row-per-internal-route export are not acceptance criteria for this functional contract.

### Portal contract decisions (current behavior is documented)

The contract is complete for present behavior: membership codes have no TTL; rotation blocks new lookup only; sessions have configurable 1–7 day expiry (default one day), no exposed server logout, and `/session` returns identity IDs only; current Web reload starts at code entry; lookup checks tenant `trial/active` but an existing session does not re-check tenant status; the reviewed routes do not uniformly enforce the `portal` feature; Trainer portal-access uses `coaching.create` plus `clients` capability and has no separate portal-feature check; and paused/archived Trainer client access is not shown to be blocked. These are described in the portal tables and separately classified as Product/Security decisions in 21. The member subscription request/proof sequence remains intentionally separate from the Owner SaaS multipart contract.
