# 02 — Users, Roles, and Workspaces

## Identity types

| Identity | Authentication | Tenant relation | Workspace |
| --- | --- | --- | --- |
| Gym Owner | `POST /api/auth/login`; server session cookie backed by `gym_auth_sessions` | One Gym tenant; owner context | Gym shell and SaaS owner surfaces |
| Gym Assistant | Same staff login/session | One tenant; explicit permissions; branch access may be assigned | Gym shell, restricted by role/permissions |
| Independent Trainer Owner | Same staff login/session; tenant must be `independent_trainer` | One Trainer tenant | Trainer Workspace/Studio |
| Platform Admin | Same auth service but tenant-neutral session; `/platform-admin` | Platform scope; explicit target tenant for actions | Platform Admin |
| Member Portal user | Membership code lookup, HMAC ownership resolution, portal session cookie | One member/membership and owning tenant | Member Portal; not a staff session |

Backend roles are exactly `Owner`, `Assistant`, and `PlatformAdmin` in `src/permissions/roles.js`. Member Portal is not a role in `gym_users`; its access is a separate code/session path (`src/services/membership-code-service.js`, `src/services/commercial-service.js`, `src/controllers/member-portal.controller.js`).

## Role behavior

- Owner receives the tenant administration and owner-only permissions defined by `src/permissions/permissions.js` and `role-permissions.js`.
- Assistant access is an explicit permission set; UI tab hiding is not sufficient. Owner-only operations are rejected server-side.
- PlatformAdmin is guarded by `src/middleware/platform.middleware.js`; it must not inherit a default Gym tenant.
- Trainer route modules add `trainerOnly`, which returns `404 TRAINER_ROUTE_NOT_FOUND` when the resolved tenant type is not `independent_trainer`.
- Member Portal exposes a deliberately narrow read/feedback/subscription-request contract and never exposes a member directory.

## Workspace capability matrix

| Workspace | Tenant type | Primary capabilities | Branch context | Subscription impact |
| --- | --- | --- | --- | --- |
| Gym | `gym` | dashboard, members, attendance, coaching, nutrition, payments, finance, reports, store, inventory, branches, bar, portal, team, backup, audit | Required for branch-scoped operations; branch is a core Gym capability | active/trial for operational APIs; expired/suspended deny new access while history remains readable where contract permits |
| Trainer Studio | `independent_trainer` | clients, assessments, progress, goals, sessions, packages, coaching, nutrition, reports, notifications, tasks, templates, portal | No Gym branch capability in catalog | active/trial compatible plan and server-derived feature/limits |
| Platform Admin | platform scope | tenants, plans, subscriptions, requests, overrides, backups, audit, payment methods | No default tenant; explicit target tenant | platform authority; tenant status/plan controls are audited |
| Member Portal | Gym or Independent Trainer owning tenant | member profile/subscription/payments/attendance/freeze-safe view/library/feedback/notifications depending on route | Resolved from membership code owner; no staff branch switching | membership code and portal session; portal endpoints validate current access |

## Capability dimensions are distinct

`role`, `permission`, `tenant_type`, `feature`, `entitlement`, and `limit` are separate dimensions. A user can have a permission while the tenant lacks a commercial feature; a compatible plan can expose a feature while a user lacks the operation permission; a limit can deny creation after feature access succeeds.

## Required context matrix

| Context | Gym staff | Trainer staff | Platform Admin | Member Portal |
| --- | --- | --- | --- | --- |
| authenticated user id | yes | yes | yes | portal identity is session/member bound |
| tenant id | trusted tenant context | trusted tenant context | absent by default; explicit target for tenant actions | resolved from code ownership |
| tenant type | `gym` | `independent_trainer` | target tenant metadata only | owning tenant metadata |
| branch id | when branch-scoped | not a Gym branch contract | explicit tenant/branch only where an endpoint requires it | server-derived from membership/tenant data |
| section id | when section-scoped | not a Gym section contract | explicit target context only | not exposed as a client authority |
| subscription/entitlements | operational guard | operational guard | platform manages/read target | portal contract checks session/membership |

## State behavior

Auth/session, tenant status, subscription status, feature availability, and limits are resolved server-side for each protected request. Frontend bootstrap consumes the effective envelope for navigation only. Expired/suspended/archived/permission-denied/feature-not-included outcomes are documented in `10-USER-FLOWS.md`.
