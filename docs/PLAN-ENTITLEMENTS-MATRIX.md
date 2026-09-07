# Plans & Entitlements Matrix

This document is the reviewable contract for the existing SaaS plan model. It
does not introduce a second plans system: `saas_plans` remains the plan source
of truth, while `saas_plan_features` is the canonical per-feature map and the
legacy `features_json` column remains a compatibility snapshot.

## Feature catalog

| Capability key | Tenant type | Limits | Existing surfaces |
| --- | --- | --- | --- |
| dashboard | Gym | — | Dashboard, analytics, bootstrap |
| members | Gym | maxMembers | Members, member profiles, memberships |
| attendance | Gym | — | Attendance, check-in |
| coaching | Gym, Independent Trainer | — | Coaching, workout, training plans |
| nutrition | Gym, Independent Trainer | — | Diet, meal logs, nutrition plans |
| ai | Gym, Independent Trainer | maxAiGenerations | Intelligence and trainer intelligence |
| library | Gym, Independent Trainer | — | Exercise/muscle/nutrition library |
| pricing | Gym | — | Pricing and membership catalog |
| payments | Gym, Independent Trainer | — | Payments and finance ledgers |
| finance | Gym | — | Finance, expenses, monthly finance |
| day_passes | Gym | — | Day passes |
| reports | Gym, Independent Trainer | — | Reports and trainer reports |
| store | Gym | — | Store and POS |
| inventory | Gym | — | Inventory and stock |
| branches | Gym | maxBranches | Branches and branch operations |
| bar | Gym | — | Bar and recipes |
| portal | Gym, Independent Trainer | — | Member and trainer-client portals |
| branding | Gym, Independent Trainer | maxStorageMb | Branding and settings |
| team | Gym, Independent Trainer | maxUsers | Tenant accounts and permissions |
| backup | Gym | maxStorageMb | Backup/recovery |
| audit | Gym | — | Audit/activity history |
| clients | Independent Trainer | maxClients | Trainer workspace, clients, client profile |
| assessments | Independent Trainer | — | Assessments and measurements |
| progress | Independent Trainer | — | Progress tracking |
| goals | Independent Trainer | — | Client goals |
| sessions | Independent Trainer | — | Sessions and calendar |
| packages | Independent Trainer | — | Packages and session balances |
| notifications | Independent Trainer | — | Trainer notifications |
| tasks | Independent Trainer | — | Trainer action center |
| templates | Independent Trainer | — | Training/nutrition templates |
| prioritySupport | Gym, Independent Trainer | — | Commercial support entitlement |

Legacy keys such as `intelligence` normalize to `ai`; they are accepted only
for backward-compatible plan payloads and are not separate catalog features.

## Plan matrix

Each plan has:

- a tenant-type compatibility row in `saas_plan_tenant_types`;
- canonical feature rows in `saas_plan_features`;
- numeric limits (`max_members`, `max_clients`, `max_users`,
  `max_ai_generations`, `max_storage_mb`, `max_branches`);
- a lifecycle state: `active`, `disabled`, or `archived`.

The migration seeds the canonical feature rows from the existing
`features_json` values. Existing explicit false values remain false. Missing
legacy keys preserve the current enabled behavior, so existing subscriptions
do not lose access during the compatibility transition.

| Plan/tenant combination | Feature source | Limit source | Runtime guard |
| --- | --- | --- | --- |
| Gym + compatible plan | plan feature row, then tenant override | plan snapshot, then override | Gym capability/request middleware |
| Independent Trainer + compatible plan | plan feature row, then tenant override | `max_clients` snapshot/override; legacy `max_members` fallback | Trainer capability/request middleware |
| Incompatible tenant type | none | none | fail closed with `SAAS_PLAN_TENANT_TYPE_MISMATCH` |
| Disabled/expired subscription | snapshot remains for history | snapshot remains for history | subscription guard blocks new access |

## Enforcement matrix

| Enforcement area | Implementation | Bypass protection |
| --- | --- | --- |
| Feature access | Central request middleware calls `assertCapabilityAccess` using canonical catalog keys | API requests are denied with `SAAS_FEATURE_NOT_INCLUDED`; UI hiding is not relied upon |
| Tenant type | Catalog compatibility + capability resolver | Gym routes fail for Trainer; Trainer-only routes fail for Gym |
| Member limit | Existing tenant request-limit guard | Server-side count, not client-provided count |
| Trainer client limit | `/trainer/clients` uses `maxClients`, falling back to legacy `maxMembers` for old plans | Server-side tenant-scoped count |
| Trainer commerce | `/trainer/package-purchases` uses `packages`; payment/refund subroutes use `payments` | Central feature middleware plus tenant-scoped commerce service |
| Branch limit | Existing branch service/request limit | Server-side tenant scope and plan limit |
| AI limit | Existing AI request limit | Server-side generation accounting |
| Storage limit | Existing storage guard | Server-side byte accounting |
| Plan status | Platform Admin status endpoint and service | Last active plan cannot be disabled/archived; update is row-locked and audited |
| Hard delete | `deletePlan` archives through lifecycle service | No `DELETE FROM saas_plans`; history remains intact |
| Overrides | Platform Admin override service | Tenant-scoped override and audit path |
| Subscription history | Snapshot columns retain plan limits/features at assignment time | Scheduled changes update future/current snapshot through existing service path |

## Platform Admin and tenant UI

- Platform Admin plan management loads the central feature catalog and renders
  compatible feature controls, numeric limits, and lifecycle actions.
- Create/edit uses canonical feature keys and sends `maxClients` for Trainer
  plans.
- Disable/activate/archive is explicit and reason-required; status changes are
  audited.
- Tenant profile/billing surfaces show the selected current plan, status,
  feature entitlements, limits, and usage.
- Public SaaS plan comparison marks the current plan and shows features gained
  on higher compatible plans.

## Intentional compatibility exceptions

1. Legacy plans with no `max_clients` use `max_members` for Independent Trainer
   client limits. This is a compatibility fallback, not a second limit model.
2. Legacy `features_json` remains readable while `saas_plan_features` becomes
   canonical. It is retained to protect existing snapshots and integrations.
3. The existing seed compatibility mapping is preserved; a plan is available
   to a tenant type only when its compatibility row explicitly includes that
   type.

## Verification checklist

- Catalog coverage test: every shipped Gym/Trainer capability has a catalog row.
- Route tests: feature denial, tenant-type denial, aliases, and Trainer limits.
- Migration static safety: additive/idempotent checks, explicit false handling,
  no destructive table operation.
- Lifecycle static safety: last-active-plan guard, row locks, audit, and no
  hard delete.
- Full unit/build/QA suites remain required before commit or deployment.
