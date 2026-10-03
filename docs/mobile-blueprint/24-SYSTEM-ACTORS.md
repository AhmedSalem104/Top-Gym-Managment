# 24 — System Actors and Authorization Boundaries

This is the actor-level source-of-truth map for the future mobile client. Executable behavior wins over this document. A screen being visible is never authorization.

## Actor inventory

| Actor / context | Authentication and identity | Tenant resolution / data scope | Workspace and capabilities | Key restrictions |
|---|---|---|---|---|
| Gym Owner (`Owner`, tenant type `gym`) | Staff login; server session cookie on Web, mobile bearer session contract on native clients | Tenant is resolved from the authenticated staff session; SQL requests carry tenant/RLS context. Branch/section context is server-validated. | Gym operations plus Owner-only management: dashboard, members/memberships/payments, attendance, pricing, branches, finance, reports, store/inventory/bar where entitled, team/permissions, backup, audit, branding, SaaS request. | Tenant must be operational for protected operations; a feature/limit and service rule can deny an otherwise authorized action. |
| Gym Assistant (`Assistant`, tenant type `gym`) | Same staff authentication/session family as Owner | Same owning tenant; optional explicit branch access assignment; current branch/section is not authority by itself. | Only effective per-user grants, server capability/feature, scope, and route rules. New Assistant defaults are the safe set below. | Cannot receive any catalog permission marked owner-only. A route with no resolved permission rule fails closed. Existing accounts can retain a broader legacy default; inspect actual grants, never infer from role label. |
| Independent Trainer Owner (`Owner`, tenant type `independent_trainer`) | Same staff auth/session family | Resolved independent-trainer tenant; trainer/client scope. Gym branch/section contract does not apply. | Trainer Studio: clients, assessments, progress, goals, sessions, packages, payments, coaching/nutrition, AI, library, reports, notifications, tasks, templates, portal, team/branding subject to effective capability/plan. | Trainer routes are unavailable to Gym tenants (`404 TRAINER_ROUTE_NOT_FOUND`); do not present Gym-only capabilities as trainer features. |
| Independent Trainer Assistant (`Assistant`, tenant type `independent_trainer`) | Same staff auth/session family | Same trainer tenant; client-scoped operations. | Per-user grants plus Trainer capability/entitlement and client scope. | Do not assume the Gym Assistant defaults or Gym branch scope apply. Effective authorization is route-specific and must be read from the server envelope. Owner-only operations remain blocked. |
| Platform Admin (`PlatformAdmin`) | Staff auth; platform session | Platform context is tenantless by default. A target tenant is explicit and authorized per operation; never inherit a Gym tenant from request input. | Platform control plane: tenants, plans, subscriptions/requests, payment proof review, lifecycle actions, platform backup/recovery, audit/operational controls defined by platform routes. | Not a Gym Owner and is explicitly denied tenant-role routes. Platform endpoints require PlatformAdmin middleware; Gym permission codes do not grant platform authority. |
| Gym Member Portal identity | Membership-code lookup and HMAC ownership resolution; separate portal session, not `gym_users` staff session | Code resolves the owning tenant and one member/membership server-side. No tenant slug supplied by the client is an authorization grant. | Self-only portal surfaces available for the owning tenant: profile/membership, payment/attendance or freeze-safe details, training/library/nutrition, notifications, feedback, and subscription requests under current route behavior. | No member directory, staff shell, staff permissions, or cross-member access. Code revocation/rotation blocks new lookups but does not revoke an already issued session; session expiry is separate. No portal logout/revoke endpoint is exposed. |
| Trainer Client Portal identity | Portal identity/session associated with a trainer client and owning independent-trainer tenant | Server resolves the client/tenant association; never trusts a submitted client ID as authority. | Only the shipped trainer-client portal contract and self-associated content. | Distinct from Gym Member Portal and staff Trainer Studio. Pausing/archiving a client is not proven to invalidate portal access; no logout/revoke endpoint is exposed. |
| Public visitor / registration applicant | Public registration endpoints; no authenticated staff role | Public request is validated/rate-limited; tenant context is created/resolved only by server registration flow. | Registration, public login/bootstrap surfaces, and documented public pages only. | No authenticated tenant data or Platform Admin operations. |
| Background/system actor | Runtime worker, scheduler, or explicit system service identity; no interactive user session | Service-specific tenant/platform scope and audited system operation. | Scheduled attendance checkout, expiry reconciliation, backup/retention, email outbox, and other registered jobs. | Not a mobile user. Job authority must not be represented as a client capability or bypass tenant-scoped service rules. |

## Staff authorization decision

The effective decision is the conjunction below; an `Owner` role does not waive a missing capability, tenant compatibility, scope rule, or validation failure:

```text
authenticated + active account
 → trusted tenant + tenant type/status
 → current subscription/entitlement + implemented capability
 → resource limit
 → route/method-specific permission + ownerOnly rule
 → tenant/branch/section/resource ownership
 → business validation and transaction
```

### Assistant defaults and exceptions

New Assistant accounts receive 21 safe grants from `SAFE_ASSISTANT_DEFAULT_PERMISSIONS`: notifications read; members read/create/update/print; memberships read/create/update; trainees read/create; coaching read/create/update; attendance read/check-in/check-out/report; pricing read; day passes read; library read; intelligence read/generate. This is a default, not an immutable Assistant role template.

Legacy Assistant defaults are broader and may include delete, freeze, renew, payment create, day-pass writes, library writes, and intelligence generation. Effective account grants are authoritative. Non-owner-only permissions can be assigned by the Gym Owner; owner-only permissions cannot be assigned to Assistant (`403 OWNER_ONLY_PERMISSION`). Permission administration by a non-owner returns `403 OWNER_REQUIRED`.

The role grouping constant `ROLE_PERMISSIONS` is not the effective-grant source. Route method/path requirements plus the persisted user permission set and `ownerOnly` catalog are authoritative. Compound operations require every listed permission.

### Owner-only permission families

`membership_codes.*`; `payments.refund` (Gym route); `management.users.*`; `management.backup.*`; `feedback.read`; `permissions.manage`; `branding.*`; `saas.subscription.*`; `portal.analytics.read`; `branches.manage`; `branches.access.manage`; `inventory.locations.manage`; `bar.recipes.manage`; `member.subscription_requests.*`. `message_templates.manage` is flagged owner-only in the retained catalog but is not an active tenant operation; see its legacy disposition in 27.

These are still subject to tenant type, feature, resource scope, and lifecycle guards.

## Actor-by-module overview

Legend: `Y` = capability exists subject to feature/permission/scope; `P` = permission-dependent; `O` = Owner-only; `S` = separately scoped portal contract; `—` = not part of actor context.

| Module | Gym Owner | Gym Assistant | Trainer Owner | Trainer Assistant | Platform Admin | Member Portal | Trainer Client Portal |
|---|---:|---:|---:|---:|---:|---:|---:|
| Gym dashboard | Y | P | — | — | — | — | — |
| Gym members / memberships / attendance | Y | P | — | — | — | S | — |
| Gym finance / day passes / store / inventory / bar | Y | P | — | — | — | — | — |
| Branches / sections | Y/O for management | read or denied by grant; management O | — | — | explicit target operations only | server-derived | — |
| Trainer clients / sessions / coaching | — | — | Y | P | — | — | S |
| Notifications | Y | P | Y | P | platform audience only | S | S |
| Team / permissions / branding | O or entitled management | O/denied | O or entitled management | O/denied | platform administration separate | — | — |
| SaaS subscription request | O | — | O | — | review as PlatformAdmin | — | — |
| Platform tenant/plan/recovery control | — | — | — | — | Y | — | — |

## Owner vs Assistant operational matrix

`Owner = allowed` below still means the route must resolve and all tenant/feature/limit/state checks pass. Assistant is never inferred from the role name; `grant` means that exact persisted permission is required. `Owner-only` is denied to Assistant irrespective of a submitted grant.

| Flow / action | Owner | Assistant | Permission(s) | Feature / limit | Denied behavior |
|---|---|---|---|---|---|
| Dashboard / bootstrap | allowed | grant-dependent | `dashboard.read` | `dashboard` | 403; absent feature → `SAAS_FEATURE_NOT_INCLUDED` |
| Member list/detail | allowed | grant-dependent | list: `members.read` + `memberships.read`; detail uses same scoped read contract | `members`; `maxMembers` on create | 403, scoped 404, feature/limit error |
| Member create | allowed | grant-dependent | `members.create`; if payment/discount/payment note/non-cash method is included, also `payments.create` | `members`; `maxMembers` | 403 for missing compound grant; duplicate/validation/limit conflict |
| Member update | allowed | grant-dependent | base: `members.update`; membership fields add `memberships.update`; pricing/payment fields add `payments.create` | `members` + payment-related capability | 403 if any field-dependent grant missing; scoped 404/validation |
| Member delete / alerts / print | allowed | grant-dependent | `members.delete`, `members.alerts`; print: `members.print` plus read grants | `members` | 403; print is client-side and has no dedicated write API |
| Membership create/update | allowed | grant-dependent | `memberships.create/update`; creation route also requires `payments.create` per current route rule | `members`; member limit | 403 if compound grant missing; state/pricing/scope validation |
| Freeze/resume | allowed | grant-dependent | `memberships.freeze` | `members` | 403; invalid/current state rejected; no client-side status mutation |
| Renewal/payment collection | allowed | grant-dependent | renewal requires `memberships.renew` + `payments.create`; standalone collection `payments.create` | `members` + `payments` | 403 unless all required grants; transactional/domain validation |
| Refund | allowed | Owner-only | `payments.refund` with Owner-only route guard | `payments` | `403 OWNER_REQUIRED`; invalid/already-refunded conflict |
| Attendance read/check-in/out/report | allowed | grant-dependent; new default includes all four | `attendance.read`, `attendance.check_in`, `attendance.check_out`, `attendance.report` | `attendance`; branch/section + membership state | 403; duplicate/expired/frozen/scope conflict |
| Branch read/context | allowed | grant-dependent | `branches.read` (special branch matcher) | `branches`; `maxBranches` affects creation, not default branch availability | 403/404 on inaccessible branch |
| Branch create/edit/archive/access assignment | allowed | Owner-only | `branches.manage`, `branches.access.manage` | `branches`; `maxBranches` | `403 OWNER_REQUIRED`; limit or dependency/state rejection |
| Expenses/finance | allowed | grant-dependent | `finance.read/create/update/delete` | Gym `finance`; tenant/branch scope | 403/feature denial; validation/domain errors |
| Reports/export | allowed | report API may be grant-dependent; current Reports screen/export UI is Owner-only | `reports.read`; `reports.export` is checked by the client-side CSV action | `reports`; financial details additionally require finance/profit permission | Assistant does not reach the current Reports screen through Web navigation; direct API still independently checks its route permission/scope. |
| Store / POS / inventory / Bar | allowed | grant-dependent per action | granular `store.*`, `inventory.*`, `bar.*` codes in 27 | Gym `store`, `inventory`, `bar`; authorized branch/location/stock state | 403; stock/shift/transfer conflict or validation error |
| Team / Assistant status / permission editor | allowed | Owner-only | `management.users.*`, `permissions.manage` | `team`; `maxUsers` | `403 OWNER_REQUIRED`, limit/identity error |
| Notifications | allowed | grant-dependent; new default includes read | `notifications.read`; recipient/audience additionally server-resolved | `notifications` | 403; foreign notification is not readable/actionable |
| Tenant SaaS subscription/request/proof | allowed | Owner-only | `saas.subscription.read/request` and Owner-only routes | subscription/compatible plan/term | `403 OWNER_REQUIRED`; pending duplicate → 409 |
| Settings/branding | allowed | Owner-only for management | `branding.view/edit/publish/reset` | `branding`; `maxStorageMb` | `403 OWNER_REQUIRED`; storage/validation error |
| Backup/history/restore | allowed | Owner-only | `management.backup.read/create/restore/delete` | `backup`; `maxStorageMb` | `403 OWNER_REQUIRED`; official verification/recovery gate failure |
| Member subscription requests review / feedback / portal analytics | allowed | Owner-only | `member.subscription_requests.*`, `feedback.read`, `portal.analytics.read` | `memberships` / `portal` as applicable | `403 OWNER_REQUIRED`; tenant/resource scope remains mandatory |

This matrix describes the Gym staff permission path. Trainer Assistant capabilities use the Trainer route family and per-user grants; see the explicit Trainer context matrix in `25-END-TO-END-FLOWS.md` rather than applying Gym-only features or branch rules.

## Denial and error behavior

| Failure | Contract / expected client behavior |
|---|---|
| No/expired/revoked staff session | `401 AUTH_REQUIRED` (login/session endpoints may have their own validation errors); clear stale local session, do not render authenticated state. |
| Wrong authenticated workspace/role | `403 PLATFORM_ADMIN_REQUIRED`, `403 TENANT_ACCESS_REQUIRED`, or fail-closed route-specific response. |
| Missing permission | `403 FORBIDDEN` or `403 OWNER_REQUIRED` for Owner-only middleware. Hiding UI is advisory; show server denial and do not retry as another identity. |
| Attempt to grant Owner-only permission | `403 OWNER_ONLY_PERMISSION`; preserve grants and explain Owner-only boundary. |
| Unknown/unmapped route permission | Denied; do not interpret unknown as public. |
| Feature absent | `403 SAAS_FEATURE_NOT_INCLUDED`; refresh effective subscription envelope, preserve data. |
| Capability absent for tenant type | `503 CAPABILITY_NOT_ENABLED` or documented route-specific not-found behavior. |
| Wrong tenant type on Trainer route | `404 TRAINER_ROUTE_NOT_FOUND`. |
| Tenant inactive/archived | lifecycle guard blocks operations; recovery/admin path only where explicitly allowed. |
| Limit reached | owning service returns a domain limit error; refresh usage/limit state and do not client-side bypass. |
| Branch/section/resource mismatch | scoped not-found/forbidden/domain validation; clear stale context and refetch server-provided scope. |

## Evidence and scope limits

Primary sources: `src/permissions/roles.js`, `permissions.js`, `role-permissions.js`, `route-permissions.js`, `permission-service.js`, `auth.middleware.js`, `platform.middleware.js`, `tenancy/tenant-types.js`, `services/feature-catalog.js`, `capability-service.js`, `saas-service.js`, portal controllers/services, and authorization tests. The actor/module matrix in this file is completed by the operation journeys in `25`, the state contract in `26`, and the permission/feature disposition in `27`. The remaining policy questions are listed separately in `21`; they do not leave the current implemented behavior undocumented.
