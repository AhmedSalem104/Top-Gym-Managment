# System Screens, APIs, Entitlements & QA Inventory

**Audit date:** 2026-09-07 (Africa/Cairo)
**Repository:** `gym-membership-app`
**Audit scope:** local application and read-only public Production smoke only. No Production database writes, migrations, commits, pushes, or deployments were performed during this audit.

## Production release parity (read-only)

**Target:** `https://gym-membership-app-smoky.vercel.app`
**Project:** `gym-membership-app`
**Production deployment ID:** `dpl_HyKWxWQQBb94yndMdvhv5yunEGyP`
**Immutable deployment URL:** `https://gym-membership-gqu8qim7n-ahmedsalem104s-projects.vercel.app`
**Production alias:** `https://gym-membership-app-smoky.vercel.app`
**Deployment state:** `READY`
**Created:** `2026-09-07 14:40:33 Africa/Cairo`
**Production Git SHA:** `NOT EXPOSED` by the Vercel deployment metadata or public runtime. `x-vercel-id` was treated only as a request/edge identifier.
**Production Git ref:** `NOT EXPOSED`
**Origin/main:** `3b66e85ecce53822139db57c935967aae4f758cc`
**Local HEAD:** `3b66e85ecce53822139db57c935967aae4f758cc`
**Local HEAD == origin/main:** `YES`
**Production == origin/main:** `UNPROVABLE` (no Git SHA in the deployment metadata)
**Production == local HEAD:** `UNPROVABLE` (same reason)
**Parity:** `PARTIAL` — the deployment is ready and its public assets match the committed source for the sampled frontend assets after line-ending normalization, but the Git SHA, backend runtime commit, and applied Production database migrations are not exposed/verified.

### Asset evidence

The following public Production assets were fetched read-only and compared with the current committed files. `normalizedEqual=YES` means the contents match after normalizing CRLF/LF line endings; it is not a substitute for a deployment Git SHA or authenticated API verification.

| Asset | Production evidence | Local committed comparison |
| --- | --- | --- |
| `/` | 200; HTML marker `forced-password-v3`; 196,275 bytes | `public/index.html`, normalized equal |
| `/css/main.css?v=79` | 200; 898,232 bytes | `public/css/main.css`, normalized equal |
| `/js/app.js?...trainer-routing-v2` | 200; 101,805 bytes | `public/js/app.js`, normalized equal |
| `/js/branch-context.js?v=1` | 200; SHA-256 `5cd566f03ff794d16a9bd41d19e94ac0ae312e362e567416e7dcf9a8e0eacfdf` | exact SHA match |
| `/js/platform-admin.js?v=7` | 200; SHA-256 `960a76fb25c1c2aae3b29efdf020e606d21beb759fd29a2c522d31aca97df3be` | exact SHA match |
| `/js/core/api.js?v=1` | 200; SHA-256 `298370ed688e76f1c8ce672e8c7de063ae566c999b14ae908dd20fd708e0f45a` | exact SHA match |
| `/js/pages/attendance/attendance.js` | 200; SHA-256 `9543150ac51d83805efb89be6899ef9a38e9abb358412f9dc76b8fcf197bce8d` | exact SHA match |

### Worktree parity classification

| Category | Current files | Classification | On origin/main | On Production |
| --- | --- | --- | --- | --- |
| Source | none outside the committed application source | no uncommitted runtime source change | YES | Frontend sampled assets match; backend SHA not exposed |
| Migration | `database/migrations/029-branch-sections.sql` | local safety fix to remove a SQL Server multiple-cascade-path issue | NO (the earlier committed migration remains on origin/main) | Not confirmed/applied |
| Test | `tests/browser/ui-ux.spec.js` | uncommitted test changes | NO | Not applicable |
| QA harness | `scripts/qa-browser-style.js`, `scripts/qa-complete-ui.js`, `scripts/qa-post-migration-runtime.js` | local QA-only changes | NO | Not applicable |
| Documentation | `docs/COMPLETE-SCREEN-INVENTORY.md`, `docs/SYSTEM-SCREENS-API-QA-INVENTORY.md` | local documentation changes | first file NO; second file untracked | Not deployed as source evidence |
| Generated/temp | ignored `.vercel` metadata and local QA temp artifacts | not tracked; no runtime source | NO | Not applicable |

### Feature parity matrix

| Feature | Worktree | Local HEAD | origin/main | Production evidence | Status |
| --- | --- | --- | --- | --- | --- |
| Plans & Entitlements | no runtime source change; QA/docs only | present in committed application source | present | Platform Admin and app assets are served; no authenticated plan API verification | PRESENT ON PRODUCTION — NOT FUNCTIONALLY VERIFIED |
| Central Feature Catalog | no runtime source change | present in `src/services/feature-catalog.js` and committed UI | present | matching `platform-admin.js` asset; catalog API not authenticated/read | PRESENT ON PRODUCTION — NOT FUNCTIONALLY VERIFIED |
| Feature/capability API coverage | no runtime source change | present in committed controllers/services/routes | present | backend SHA and direct authorized API behavior not exposed | COMMITTED/REMOTE — NOT CONFIRMED ON PRODUCTION |
| Limits | no runtime source change | present in committed entitlement service/tests | present | no safe authenticated limit-boundary test on Production | COMMITTED/REMOTE — NOT CONFIRMED ON PRODUCTION |
| Plan lifecycle | no runtime source change | present in committed Platform Admin source | present | public Admin login only; no write/read lifecycle test | PRESENT ON PRODUCTION — NOT FUNCTIONALLY VERIFIED |
| Gym/Trainer compatibility | no runtime source change | present in committed plan compatibility source | present | no authenticated Gym/Trainer Production QA identities | COMMITTED/REMOTE — NOT CONFIRMED ON PRODUCTION |
| Subscription snapshots | no runtime source change | present in committed backend source | present | no authenticated subscription response evidence | COMMITTED/REMOTE — NOT CONFIRMED ON PRODUCTION |
| Upgrade/Downgrade | no runtime source change | present in committed source/tests | present | no safe Production plan test tenant; no write performed | COMMITTED/REMOTE — NOT CONFIRMED ON PRODUCTION |
| Portal entitlement | no runtime source change | present in committed source | present | Member Portal entry is public; authenticated portal behavior not verified | PRESENT ON PRODUCTION — NOT FUNCTIONALLY VERIFIED |
| Packages entitlement | no runtime source change | present in committed source | present | no authenticated Trainer/Gym data surface | COMMITTED/REMOTE — NOT CONFIRMED ON PRODUCTION |
| Payments entitlement | no runtime source change | present in committed source | present | no Production financial transaction or authenticated payment test | COMMITTED/REMOTE — NOT CONFIRMED ON PRODUCTION |
| Team/Permissions entitlement | no runtime source change | present in committed source | present | no authenticated role/API enforcement test | COMMITTED/REMOTE — NOT CONFIRMED ON PRODUCTION |
| Branch + Section | no runtime source change | committed UI/API source present; migration fix is worktree-only | present (pre-fix migration) | matching `branch-context.js` and attendance asset; no authenticated data test | PRESENT ON PRODUCTION — NOT FUNCTIONALLY VERIFIED |
| Branch/Section API filtering | no runtime source change | present in committed controllers/services | present | no authorized Branch/Section API evidence | COMMITTED/REMOTE — NOT CONFIRMED ON PRODUCTION |
| Migration 029 current safety fix | modified locally | earlier version only | earlier version only | no Production migration evidence; no migration run | LOCAL WORKTREE ONLY — NOT DEPLOYED |
| Current QA fixes | local QA/test harness only | absent | absent | not part of Production runtime | LOCAL WORKTREE ONLY — NOT DEPLOYED |

**Gate:** `CURRENT NEW SOURCE CODE DEPLOYED = NO` for the uncommitted migration/QA/documentation changes. `CURRENT MIGRATIONS DEPLOYED = UNKNOWN`; no Production migration was run or inferred from asset parity. `SAFE TO TEST NEW FEATURES ON PRODUCTION = NO` until a controlled release and approved Production QA tenant are available.

### Production public read-only QA — current release

These checks ran against the Production alias in the internal Chrome session. They are public-surface checks only; they do not establish authenticated E2E, entitlement enforcement, tenant isolation, or write safety.

| URL/surface | Viewports | Console | Network | RTL | Theme | Overflow | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/platform-admin` | 1920, 1440, 1366, 1024, 768, 430, 390, 360, 320 | 0 observed errors | 0 failed responses | `dir=rtl` | light public shell | none observed | PASS — anonymous entry only |
| `/member-portal` | same 9 viewports | 0 observed errors | 0 failed responses | `dir=rtl` | light public shell | none observed | PASS — portal code-entry only |
| `/#dashboard` | same 9 viewports | 0 observed errors | 0 failed responses | `dir=rtl` | light/dark checked | none observed | PASS — login shell only; no authenticated dashboard |
| `/register-gym` | same 9 viewports | 0 observed errors | 0 failed responses | `dir=rtl` | light public shell | none observed | PASS — public form surface; submit not executed |

Additional read-only evidence: `GET /api/health` returned 200 with application/database/storage checks healthy; `GET /api/auth/session` returned 200 with `authenticated=false`; no login or Production write was attempted.

### Production QA credential matrix

No Production QA credentials or dedicated Production QA tenant were exposed in the approved project/runtime configuration. No values were printed or used.

| Required account | Found | Authorized for Production QA | Read-only authenticated safe | Write-safe QA tenant | Blocked flows |
| --- | --- | --- | --- | --- | --- |
| Platform Admin | NO | NO | NO | NO | authenticated Admin panels, Plans, Catalog, lifecycle, audit |
| Gym Owner | NO | NO | NO | NO | Gym dashboard, branches, sections, members, attendance, reports |
| Assistant/Team | NO | NO | NO | NO | role/permission UI and direct API checks |
| Independent Trainer | NO | NO | NO | NO | Trainer Studio, clients, packages, plans, payments |
| Member Portal | NO | NO | public code-entry only | NO | authenticated member data/actions |
| Trainer Client Portal | NO | NO | NO | NO | authenticated client portal and payment/renewal flows |

Before the later credential-assisted checks below, authenticated Production surfaces were `NOT VERIFIED`; Local authenticated PASS results were not promoted to Production evidence.

## Production authenticated QA — authorized credentials

The following checks used the credentials supplied for this QA run. Passwords were not written to files, logs, screenshots, or this document. No business write, payment, plan change, migration, seed, or destructive action was executed.

| Account | Authentication | Session evidence | Read-only result | Status |
| --- | --- | --- | --- | --- |
| Platform Admin | `POST /api/auth/login` 200 | `role=PlatformAdmin`, `mustChangePassword=false` | Dashboard, Tenants, Subscription Requests, Payment Methods, Backups, Plans, Feature Catalog, Audit returned GET 200; 3 plans, 31 catalog entries, 4 tenants observed | PASS — read-only only |
| Gym Owner | `POST /api/auth/login` 200 | `role=Owner`, `tenantType=gym`, `mustChangePassword=false` | Shell rendered, but core tenant reads returned 503 `TENANT_ISOLATION_NOT_READY` | FAIL — Production blocker |
| Assistant/Team | `POST /api/auth/login` 401 | no authenticated session | No authenticated surface was reached | FAIL — supplied credential rejected |
| Independent Trainer | no credential supplied | not available | Not tested | NOT VERIFIED |
| Member Portal | no credential supplied | not available | Public code-entry only; authenticated data not tested | NOT VERIFIED |
| Trainer Client Portal | no credential supplied | not available | Not tested | NOT VERIFIED |

### Production Gym Owner API evidence

With the authenticated Gym Owner session, these read-only endpoints all returned 503 with the same safe error code; the server intentionally did not expose which readiness predicate failed:

`/api/dashboard`, `/api/dashboard-analytics`, `/api/branches`, `/api/branches/bootstrap`, `/api/members`, `/api/attendance`, `/api/attendance/report`, `/api/reports`, `/api/monthly-finance`, `/api/day-passes/summary`, `/api/saas/subscription`, `/api/saas/plans`, `/api/saas/feature-catalog`.

Observed code: `TENANT_ISOLATION_NOT_READY`. The source guard checks the tenant security policy, schema contract, registered/protected tenant tables, predicate function, and disabled/invalid policy state. The exact failing database predicate was not exposed by the Production API and was not investigated with Production SQL because this audit is read-only.

### Production boundary checks

| Request | Result |
| --- | --- |
| Unauthenticated `GET /api/platform-admin/plans` | 401 `AUTH_REQUIRED` — expected block, PASS |
| Gym Owner `GET /api/platform-admin/plans` | 403 `PLATFORM_ADMIN_REQUIRED` — expected block, PASS |
| Gym Owner `GET /api/trainer/workspace` | 503 `TENANT_ISOLATION_NOT_READY` — readiness blocker, not a clean authorization result |

Production authenticated Gym screens, Branch/Section data, memberships, attendance, reports, payments, portals, and entitlement enforcement remain unverified/failed according to the blocker above. No Production data was changed.

Platform Admin responsive read-only checks after authenticated login passed at `1440x900`, `768x1024`, and `390x844` in both `light` and `dark`; `dir=rtl` remained active and no horizontal overflow was observed. This covers layout behavior only, not write flows.

## Status legend

- `PASS`: executed and evidenced by the current QA run.
- `NOT VERIFIED`: requires authenticated QA credentials, a tenant fixture, or a live database target that was not available/safe in this run.
- `BLOCKED`: the project deliberately fails closed until an approved target or credential is supplied.
- `GAP`: a documentation or implementation item that needs a later scoped change.

## Evidence index

| Evidence | Result | Location |
| --- | --- | --- |
| Complete static screen discovery | PASS | `docs/COMPLETE-SCREEN-INVENTORY.md` |
| Complete UI structural/browser runner | PASS | `qa/reports/complete-ui-qa.json` |
| Browser style/responsive runner | PASS | runner output from `npm run test:visual` |
| QA gate | PASS | `qa/reports/qa-gate-latest.json` |
| Database static readiness | PASS; live schema not verified | `qa/reports/database-readiness-latest.json` |
| Headful Chrome public smoke | PASS for public login surface | Chrome screenshot/evaluation from local execution session |
| Authenticated browser/API QA | NOT VERIFIED | No safe QA credentials or approved non-production DB target present |

## System inventory

The inventory was regenerated from the source tree with `npm run qa:screen-inventory` and independently cross-checked against route declarations and service/catalog code.

| Surface | Count | Source/evidence | QA status |
| --- | ---: | --- | --- |
| HTML entry pages | 8 | `public/*.html`, generated inventory | Structural PASS; authenticated flows NOT VERIFIED |
| Active Gym hash views | 19 | `public/index.html`, `public/js/app.js`, generated inventory | Structural PASS |
| Platform Admin panels | 9 | `public/platform-admin.html`, `public/js/platform-admin.js` | Structural PASS; authenticated NOT VERIFIED |
| Gym registration steps | 6 | `public/register-gym.html`, `public/js/register-gym.js` | Structural PASS; blank validation tested |
| Portal roots | 6 | `public/member-portal.html`, portal JS | Structural PASS; portal auth/data NOT VERIFIED |
| Store views | 9 | Store JS and hash/view declarations | Structural PASS; live CRUD NOT VERIFIED |
| Portal tools | 5 | Member portal tool modules | Structural PASS |
| Dialog/overlay definitions | 29 | generated inventory and DOM audit | Structural/responsive PASS |
| Forms and filter hooks | 184 | generated inventory | Structural PASS; authenticated submissions NOT VERIFIED |
| State hooks | 69 | generated inventory | Structural PASS |
| Declared route handlers | 337 | `src/routes/*.js` static parser | Source audit PASS |
| Unique literal route paths | 262 | `src/routes/*.js` static parser | Source audit PASS |

### Product surfaces

#### Public/authentication

| Entry | Route | Purpose | Status |
| --- | --- | --- | --- |
| Login | `/` | Session login, theme/language, password visibility, forced-password handoff | Headful public PASS; authenticated login NOT VERIFIED |
| Forced password | `/change-password` | Isolated first-login password change | Unit and mocked browser PASS; real account NOT VERIFIED |
| Gym registration | `/register-gym` | Six-step public Gym onboarding | Headful blank-validation PASS; full submit NOT VERIFIED |
| Trainer registration | `/register-trainer` | Independent Trainer onboarding | Structural PASS; full submit NOT VERIFIED |
| Member portal | `/member-portal` | Code-based member portal entry | Structural PASS; real portal session NOT VERIFIED |
| Platform Admin | `/platform-admin` | Platform control-plane entry | Anonymous boundary structurally PASS; authenticated NOT VERIFIED |
| Platform forbidden | `/platform-admin-forbidden` | Non-platform denial surface | Structural PASS |
| Trainer workspace entry | `/trainer-workspace` and `.html` | Guarded Trainer Studio shell | Guarded route correctly requires auth; structural HTML audit PASS |

#### Gym application hash views

`#dashboard`, `#members`, `#trainees`, `#intelligence`, `#management`, `#permissions`, `#attendance`, `#expenses`, `#library`, `#reports`, `#branches`, `#branding`, `#feedback`, `#store`, `#saas-billing`, `#member-subscription-requests`, `#member-payment-methods`, `#portal-analytics`, and `#backup-history` are declared in the generated inventory. The complete DOM/selector list is maintained by `docs/COMPLETE-SCREEN-INVENTORY.md`.

These are a Gym composition. They must not be loaded by an Independent Trainer bootstrap; this is enforced in source tests and the Trainer browser harness.

#### Independent Trainer Studio surfaces

Declared Trainer Studio routes in `public/js/trainer-studio-v2.js`:

`dashboard`, `clients`, `calendar`, `sessions`, `training`, `nutrition`, `exercises`, `muscles`, `foods`, `measurements`, `progress`, `goals`, `checkins`, `packages`, `sales`, `renewals`, `finance`, `reports`, `portal`, `notifications`, `tasks`, `templates`, and `settings`.

The Trainer shell has separate navigation and composition. The current automated and structural QA proves route/surface rendering with a local request fixture. Real authenticated data, permissions, limits, and writes remain `NOT VERIFIED` here because no safe Trainer QA credential was supplied.

#### Platform Admin panels

The generated inventory records 9 Platform Admin panels covering overview, tenants, tenant details, plans/feature catalog, subscription requests, payments/proofs, lifecycle/health, audit/history, and platform payment settings. The server-side namespace is `/api/platform-admin/*` and is protected by the PlatformAdmin role boundary.

#### Dialogs, forms, states

All 29 discovered overlays are enumerated by the generated inventory and were included in the complete UI structural run. Dialog viewport checks passed at 375/390/430/768/1440 widths. Real save/edit/delete/restore behavior is `NOT VERIFIED` without authenticated fixtures. Loading, empty, error and disabled states are source-covered and structurally inspected; content-specific API states need authenticated verification.

## API inventory

The route source contains 337 handlers across 26 route modules and 262 unique literal paths. The table below is the authoritative module-level inventory; exact handler declarations and dynamic path parameters remain in the linked route source and are intentionally not duplicated into stale prose.

| Route module | Handler count | Domain | Tenant/role boundary |
| --- | ---: | --- | --- |
| `auth.routes.js` | 13 | Login, sessions, password, users | Auth/session; owner for user administration |
| `attendance.routes.js` | 5 | Check-in/out, attendance | Gym tenant + permissions |
| `backup.routes.js` | 12 | Tenant backup/recovery | Gym owner/backup capability |
| `bar.routes.js` | 10 | Bar/POS | Gym + store/bar capabilities |
| `branch.routes.js` | 7 | Branches and branch context | Gym + branches capability |
| `branding.routes.js` | 9 | Branding/assets | Tenant owner + private storage |
| `coaching.routes.js` | 30 | Training, nutrition, plans | Gym or Trainer by route/capability |
| `dashboard.routes.js` | 3 | Gym dashboard | Gym capability |
| `day-pass.routes.js` | 9 | Day passes | Gym capability |
| `finance.routes.js` | 4 | Expenses/monthly finance | Gym finance capability |
| `gym-registration.routes.js` | 12 | Public Gym registration | Public validation + platform review |
| `index.js` | 2 | Health/app bootstrap | Public health |
| `intelligence.routes.js` | 6 | AI/intelligence | Tenant + AI capability/limit |
| `library.routes.js` | 6 | Exercise/muscle/food library | Gym/Trainer library capability |
| `member-feedback.routes.js` | 2 | Feedback | Owner or portal session |
| `member-portal.routes.js` | 13 | Member portal | Portal session/member identity |
| `member-subscription.routes.js` | 7 | Portal subscription requests | Portal session + owner review |
| `members.routes.js` | 16 | Members/memberships | Gym permissions + tenant scope |
| `platform-admin.routes.js` | 42 | Control plane | PlatformAdmin only |
| `platform.routes.js` | 13 | Platform overview | Platform boundary |
| `pricing.routes.js` | 7 | Pricing/catalog | Gym pricing permission |
| `reports.routes.js` | 1 | Gym reports | Reports capability |
| `saas.routes.js` | 7 | Plans/subscription requests/proofs | Owner; commercial exception described below |
| `stock-location.routes.js` | 7 | Inventory locations | Gym inventory capability |
| `store.routes.js` | 33 | Products/sales/inventory | Gym store/inventory capability |
| `trainer.routes.js` | 61 | Trainer Studio and commerce | Independent Trainer + trainer capabilities |
| **Total** | **337** |  |  |

### Screen-to-API family matrix

| Screen family | Primary API families | Method classes | Server enforcement |
| --- | --- | --- | --- |
| Gym dashboard | `/api/dashboard*`, `/api/analytics*`, reports | GET | Auth, tenant, Gym capability, branch/section context where applicable |
| Members/memberships | `/api/members*`, `/api/memberships*`, pricing | GET/POST/PATCH/DELETE | Permission + Gym capability + tenant scope + limits |
| Branches/sections | `/api/branches*`, `/api/sections*` | GET/POST/PATCH | Gym capability, branch ownership, section belongs to selected branch |
| Attendance | `/api/attendance*`, QR/code services | GET/POST/PATCH | Gym capability, membership/branch/section validation, audit |
| Reports/finance | `/api/reports*`, `/api/expenses*`, monthly finance | GET/POST | Permission, finance data filter, tenant/branch/section scope |
| Store/POS | `/api/store*`, `/api/bar*`, stock locations | GET/POST/PATCH | Store/inventory capability, permission, tenant scope |
| Trainer dashboard/clients | `/api/trainer/workspace`, `/api/trainer/clients*` | GET/POST/PATCH/DELETE | Trainer tenant type, capability, client limit, ownership |
| Trainer training/nutrition/library | `/api/trainer/training-plans*`, `/api/trainer/nutrition-plans*`, `/api/trainer/library*`, coaching catalog | GET/POST/PATCH | Trainer capability, tenant scope, permission |
| Trainer sessions/check-ins | `/api/trainer/sessions*`, follow-up/check-ins | GET/POST/PATCH | Trainer capability, client ownership, idempotency for state changes |
| Trainer commerce | `/api/trainer/packages*`, purchases, payments, refunds | GET/POST/PATCH/DELETE | Packages/payments capability, ledger transaction, idempotency, tenant scope |
| Member portal | `/api/member-portal/*` | POST/GET/PATCH as applicable | Portal session and member identity; no generic tenant trust |
| Platform Admin | `/api/platform-admin/*`, `/api/platform/*` | GET/POST/PATCH | PlatformAdmin role and explicit tenant IDs for scoped actions |
| Plans/entitlements | `/api/saas/*`, Platform Admin plan APIs | GET/POST/PATCH | Owner/platform role, compatibility, lifecycle, feature/limit middleware |

### Backend-only APIs

The route source includes server endpoints used by scheduled jobs, maintenance, orchestration, health, audit, backup, or service-to-service flows. These are not expected to have a direct screen. They remain documented at module level above and must not be exposed as UI-only security boundaries. Auth/cron/role middleware is the source of truth.

## Feature Catalog and entitlements

The central catalog is `src/services/feature-catalog.js`; capability resolution and limits are in `src/services/capability-service.js`; plan persistence/lifecycle is in `src/services/saas-service.js` and migration `030-plan-entitlements.sql`.

### Catalog coverage

| Feature key | Tenant type | Limits | Main surfaces |
| --- | --- | --- | --- |
| `dashboard` | Gym | — | Dashboard/analytics |
| `members` | Gym | `maxMembers` | Members/memberships |
| `attendance` | Gym | — | Attendance/QR |
| `coaching` | Gym, Trainer | — | Training/coaching |
| `nutrition` | Gym, Trainer | — | Diet/nutrition |
| `ai` | Gym, Trainer | `maxAiGenerations` | Intelligence/auto generation |
| `library` | Gym, Trainer | — | Exercise/muscle/food library |
| `pricing` | Gym | — | Membership pricing |
| `payments` | Gym, Trainer | — | Payment ledgers/commerce |
| `finance` | Gym | — | Expenses/monthly finance |
| `day_passes` | Gym | — | Day passes |
| `reports` | Gym, Trainer | — | Reports |
| `store` | Gym | — | Store/POS |
| `inventory` | Gym | — | Inventory/stock |
| `branches` | Gym | `maxBranches` | Branch operations |
| `bar` | Gym | — | Bar/recipes |
| `portal` | Gym, Trainer | — | Member/client portals |
| `branding` | Gym, Trainer | `maxStorageMb` | Branding/settings |
| `team` | Gym, Trainer | `maxUsers` | Tenant accounts/permissions |
| `backup` | Gym | `maxStorageMb` | Backup/recovery |
| `audit` | Gym | — | Activity/audit |
| `clients` | Trainer | `maxClients` | Trainer clients/profile |
| `assessments` | Trainer | — | Assessments/measurements |
| `progress` | Trainer | — | Progress |
| `goals` | Trainer | — | Goals |
| `sessions` | Trainer | — | Sessions/calendar |
| `packages` | Trainer | — | Packages/session balances |
| `notifications` | Trainer | — | Notifications |
| `tasks` | Trainer | — | Action center |
| `templates` | Trainer | — | Training/nutrition templates |
| `prioritySupport` | Gym, Trainer | — | Commercial support |

**Catalog count:** 31 canonical entries. Legacy aliases such as `intelligence → ai` are normalization aliases, not additional features.

### Limit matrix

| Limit key | Domain | Enforcement source | Direct API status |
| --- | --- | --- | --- |
| `maxMembers` | Gym members | Tenant request-limit guard and server count | Unit/source PASS; authenticated API NOT VERIFIED |
| `maxClients` | Trainer clients | Trainer route/service count; legacy `maxMembers` fallback | Unit/source PASS; authenticated API NOT VERIFIED |
| `maxUsers` | Team/accounts | Central request-limit guard | Unit/source PASS; authenticated API NOT VERIFIED |
| `maxBranches` | Gym branches | Branch service/request guard | Unit/source PASS; authenticated API NOT VERIFIED |
| `maxAiGenerations` | AI | Server generation accounting | Unit/source PASS; authenticated API NOT VERIFIED |
| `maxStorageMb` | Branding/backup/storage | Server byte accounting | Unit/source PASS; live storage target NOT VERIFIED |

### Enforcement audit

The static route-to-catalog audit found 7 literal `/api/saas/*` paths without a normal feature mapping: subscription, plans, feature catalog, subscription requests, and payment-proof operations. This is an intentional commercial compatibility exception: owners must be able to inspect/request/renew subscription access even when an operational feature is denied. These routes remain behind authenticated tenant resolution and owner-only permission boundaries; they are not UI-only exemptions.

All other literal tenant-domain routes resolved to a canonical feature/capability or a documented shared boundary in the source audit. Direct API, wrong-plan, wrong-tenant-type, and live limit matrix execution requires an approved QA tenant and is `NOT VERIFIED` in this run.

## Plan lifecycle and compatibility

The existing `saas_plans`/`saas_plan_features` model remains the source of truth; no parallel plans system was introduced.

- Tenant type compatibility is stored and checked server-side.
- Canonical feature rows preserve explicit `false` values.
- Legacy `features_json` and `max_members` compatibility snapshots remain readable.
- `active`, `disabled`, and `archived` lifecycle states are validated server-side.
- Last-active-plan protection prevents disabling all active plans.
- Hard delete is replaced by audited archive/soft-delete behavior.
- Subscription snapshots preserve historical feature/limit state.
- Scheduled plan changes validate future compatibility.
- Current-plan/upgrade presentation exists in the tenant and Platform Admin surfaces.

Static/unit enforcement coverage is `PASS`. Real browser plan CRUD, upgrade/downgrade, expiry/suspension, scheduled-change, and direct API bypass tests are `NOT VERIFIED` without credentials and an approved QA DB.

## Branch and Section contract

The additive migration `database/migrations/029-branch-sections.sql` defines:

- `gym_branch_sections` owned by a Gym tenant and branch;
- `section_type` constrained to `men`, `women`, or `mixed`;
- membership-section access;
- attendance `section_id` and an index for tenant/branch/section/date;
- an idempotent Mixed section backfill for each active branch and legacy access/attendance attribution.

`Mixed` means the legacy operational/default section; it does not infer or rewrite member gender. The migration is additive and preserves existing rows. Runtime branch/section validation is source-covered. Real data filtering across Dashboard, Members, Memberships, Attendance, Renewals, Reports, and Monthly Finance requires authenticated tenant data and is `NOT VERIFIED` here.

## Browser and visual QA

### Automated browser evidence

| Suite | Result | Scope |
| --- | --- | --- |
| `npm run test:visual:complete` | PASS | 858 evidence items; 19 Gym views, 9 Platform panels, 6 registration steps, 6 portal surfaces, 9 Store views, 5 portal tools, 29 dialogs; page errors/console errors/failed responses = 0 |
| `npm run test:visual` | PASS | Login and app layout at 375/430/768/1024/1440/1920; dialogs; portal light/dark; print |
| `npm run qa:ui` | PASS | Complete UI + screen discovery and browser verification |
| Headful Chrome local Trainer structural pass | PASS | Trainer shell, navigation routes, no Gym navigation, no Gym bootstrap request under fixture harness |
| Headful Chrome public Production smoke | PASS | Public login surface at 1440x900, no overflow, no observed Console errors, CSS `main.css?v=79` loaded |

The complete UI runner required two QA-harness corrections, not product changes:

1. Trainer structural visual QA now opens the shipped `.html` entry with the guarded bootstrap stubbed, instead of expecting an unauthenticated request to pass `/trainer-workspace`.
2. Login style QA accepts the current direct-login auth stage as well as the optional gateway stage.

### Viewport/theme coverage

The style runner covered 375, 430, 768, 1024, 1440, and 1920 widths plus dialogs, portal light/dark and print. The complete UI runner covered the generated surface matrix. Additional requested widths 320, 360, 390, 414 and 1366 are represented by source/visual artifacts and mobile structural checks, but a full authenticated interaction pass at every width is `NOT VERIFIED`.

### Accessibility

The structural runner reported 1,156 unnamed-interactive observations as a review signal. This is not an axe/WCAG conformance result. Keyboard/focus/semantics are source-covered in important components, but full automated WCAG, contrast audit, screen-reader review, and authenticated dialog focus behavior are `NOT VERIFIED`.

## Issue register

| ID | Area | Type | Root cause | Fix | Verification |
| --- | --- | --- | --- | --- | --- |
| `QA-001` | Trainer structural runner | QA harness | Guarded Trainer route correctly redirected because no credentials were available | Use `.html` structural entry and stub only authenticated bootstrap in the QA harness; production guard unchanged | `test:visual:complete`, `qa:ui` PASS |
| `QA-002` | Login style runner | QA harness | Runner required an obsolete `gateway` stage while current runtime legitimately starts at `login` | Accept the actual direct-login state or the optional gateway state, never a blank surface | `test:visual` PASS |
| `QA-003` | Authenticated UI E2E harness | QA harness | Optional Gateway button existed in the DOM but was hidden; without credentials the hook attempted to click it and timed out | Skip authenticated Gym UI tests immediately when `QA_OWNER_*` is absent; click Gateway only when visible | Full `npm run test:e2e` rerun: 12 passed, 8 skipped, 0 failed |
| `AUDIT-001` | Authenticated flows | Verification | No safe QA credentials/approved staging target in this execution environment | No code bypass; mark real login, tenant API, RLS, plan lifecycle and data flows NOT VERIFIED | Open |
| `AUDIT-002` | Live DB/schema | Verification | Static readiness can validate source, but live schema evidence requires an explicitly approved non-production target | Do not run `qa:rls`/`qa:tenancy` against unknown `.env` target | Open/blocked by target approval |
| `AUDIT-003` | Accessibility | Verification | No full WCAG engine/session evidence in current run | Keep the runner signal honest; schedule authenticated axe/manual pass | Open |

## Duplicate/performance observations

| Observation | Evidence | Impact | Recommended follow-up |
| --- | --- | --- | --- |
| Plan/capability/branding metadata can be requested by multiple surface bootstraps | Source and browser harness network instrumentation | Possible duplicate startup reads | Measure with an authenticated trace before introducing caching |
| Trainer library uses separate exercises/muscles/foods views | Trainer route composition and browser route tests | Intentional separation, payloads should remain paginated | Keep server pagination; measure payload sizes with QA tenant |
| CSS validator reports existing `!important` and repeated auth/platform token declarations | `npm run build` warning | Cascade maintenance risk, not a failing build | Consolidate tokens in a separate CSS cleanup task after computed-style evidence |
| Static route docs are module-level in this file | 337 handlers/262 paths are source-derived | Avoid stale hand-written endpoint prose | Generate a machine-readable route/API appendix in a later documentation task |

## Final evidence summary

| Area | Status | Evidence/limitation |
| --- | --- | --- |
| Source discovery and generated inventory | PASS | 8 HTML, 19 Gym views, 9 Platform panels, 6 registration steps, 6 portal roots, 9 Store views, 5 tools, 29 dialogs, 184 forms |
| Feature Catalog coverage | PASS (static) | 31 canonical catalog entries; aliases normalized |
| Plan mapping/enforcement | PASS (unit/static) | Central capability middleware and limits; live matrix NOT VERIFIED |
| Branch/Section contract | PASS (static) | Migration/idempotency/semantics source-covered; live data filtering NOT VERIFIED |
| Responsive structural QA | PASS | Complete runner and style runner; authenticated interactions NOT VERIFIED |
| Light/Dark structural QA | PASS | Style runner and source checks |
| RTL structural QA | PASS | HTML/CSS/source checks; full authenticated interaction NOT VERIFIED |
| Console/resource diagnostics | PASS for tested public/structural runs | 0 page errors, 0 console errors, 0 failed responses in complete runner |
| Unit tests | PASS | 346 passed, 0 failed |
| Backup tests | PASS | 58 passed, 0 failed |
| Build | PASS | CSS/anatomy build passed; existing style warnings remain |
| QA Gate | PASS | `QA_GATE_PASSED` |
| Database readiness | PASS static | Live schema/restore/RLS not verified |
| npm audit | PASS | 0 vulnerabilities |
| Production database modified | NO | No write request/migration issued |
| Commit/Push/Deploy | NOT DONE | Explicitly withheld per task instruction |

## Browser evidence reconciliation

This section deliberately separates real authenticated execution from structural fixture coverage.

### Extension connection result

| Check | Result | Evidence |
| --- | --- | --- |
| Extension detected | NO | No Browser Extension/Chrome Connector tool was exposed in the current tool registry; only `mcp__node_repl__js` was available |
| Extension connected | NO | No extension session/connector handle exists in this execution |
| Can control the user's visible browser | NO | The available tool can launch a separate headful Chrome on the execution host, but cannot attach to or mirror the user's browser window |
| Independent headful Chrome | YES, separate host window | Local and Production public screenshots/evaluations were captured through the persistent headful Chrome session |

### Screen evidence matrix

The generated inventory has 91 top-level screen/surface records using the following non-overlapping accounting model: 8 HTML entry surfaces + 19 active Gym hash views + 9 Platform Admin panels + 6 registration steps + 6 portal roots + 9 Store subviews + 5 portal tools + 29 overlays. The 20 nested view/step hooks and 184 forms are component/action records under those surfaces, not additional top-level screens. Trainer Studio's 23 nested routes are separately listed in the Trainer section and are not silently omitted.

| Screen group | Count | Real E2E | Structural | Visual | Desktop | Tablet | Mobile | Light | Dark | Console | Network | API enforcement | Evidence | Status |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| Public/auth entry pages | 8 | 0 | 8 | 8 | PASS | PASS | PASS | PASS | PASS | 0 errors | 0 failed responses | N/A/public boundary | headful smoke + complete UI report | PASS (public only) |
| Gym hash views | 19 | 0 | 19 | 19 | PASS | PASS | PASS | PASS | PASS | 0 in structural run | 0 in structural run | NOT VERIFIED | `complete-ui-qa.json`, `test:visual` | NOT VERIFIED authenticated |
| Platform Admin panels | 9 | 0 | 9 | 9 | PASS | PASS | PASS | PASS | PASS | 0 in structural run | 0 in structural run | NOT VERIFIED | generated inventory + structural run | NOT VERIFIED authenticated |
| Registration steps | 6 | 0 | 6 | 6 | PASS | PASS | PASS | PASS | PASS | 0 in public run | 0 in public run | Public validation only | headful blank validation + complete UI | PASS structural; submit NOT VERIFIED |
| Member/Client portal roots | 6 | 0 | 6 | 6 | PASS | PASS | PASS | PASS | PASS | 0 in structural run | 0 in structural run | NOT VERIFIED | portal structural report | NOT VERIFIED authenticated |
| Store subviews | 9 | 0 | 9 | 9 | PASS | PASS | PASS | PASS | PASS | 0 in structural run | 0 in structural run | NOT VERIFIED | complete UI report | NOT VERIFIED authenticated |
| Portal tools | 5 | 0 | 5 | 5 | PASS | PASS | PASS | PASS | PASS | 0 in structural run | 0 in structural run | NOT VERIFIED | complete UI report | NOT VERIFIED authenticated |
| Dialog/overlay surfaces | 29 | 0 | 29 | 29 | PASS | PASS | PASS | PASS | PASS | 0 in structural run | 0 in structural run | NOT VERIFIED | dialog viewport evidence | NOT VERIFIED authenticated actions |
| Trainer Studio nested routes | 23 | 0 | 23 | 23 | PASS | PASS | PASS | PASS | PASS | 0 in fixture run | no failed fixture responses | NOT VERIFIED real tenant | `test:e2e` Trainer fixture + headful structural screenshot | Structural/visual only |
| **Top-level reconciliation** | **91** | **0** | **91** | **91** | **PASS** | **PASS** | **PASS** | **PASS** | **PASS** | **0 observed** | **0 observed** | **NOT VERIFIED auth** | Reports listed above | **No unaccounted top-level surface** |

### E2E result reconciliation

| Category | Count | Status | Explanation |
| --- | ---: | --- | --- |
| Real authenticated E2E | 0 | NOT VERIFIED | No `QA_OWNER_*` credentials; no Auth bypass used |
| Structural/mocked browser E2E | 12 | PASS | Forced-password and Trainer Studio tests use explicit local fixtures; they are not real tenant proof |
| Authenticated UI cases skipped | 8 | NOT VERIFIED | Gym tabs/mobile/modal/lazy-load cases skipped by the corrected harness because credentials were absent |
| Browser test failures after correction | 0 | PASS | The previous 8 timeouts were harness failures and were eliminated by the skip guard |
| Structural-only screen records | 91 top-level + 23 Trainer routes | PASS | DOM/layout/overflow/theme checks completed; data/API writes not proven |

### API coverage reconciliation

| API inventory | Discovered | Documented/classified | Real API execution | Gap |
| --- | ---: | ---: | ---: | --- |
| Route handlers | 337 | 337 by route module/count and domain matrix | 0 authenticated writes; public/anonymous boundary only | Exact request/response evidence for authenticated handlers remains NOT VERIFIED |
| Unique literal paths | 262 | 262 accounted for by route modules and capability audit | Public GET/anonymous denial subset only | Dynamic parameter expansion and response schemas need approved QA trace |
| Canonical catalog features | 31 | 31 | Static/unit enforcement only | Live plan matrix NOT VERIFIED |
| Limit keys | 6 | 6 | Static/unit enforcement only | Below/at/above/bypass live tests NOT VERIFIED |
| Permissions/roles | Source catalog | Documented in source-backed matrix | Anonymous boundary only | Role-by-role browser/API evidence NOT VERIFIED |

**Reconciliation result:** every discovered top-level surface is accounted for in the generated inventory and this document. The difference is not hidden: `Real authenticated E2E = 0`, `Structural-only = 91 top-level surfaces (+23 Trainer nested routes)`, `NOT VERIFIED = all authenticated data/action/API enforcement cases`, `FAIL = 0 after QA-harness correction`.

### E2E skipped-flow detail

These are the exact eight Playwright cases that were skipped, not silently counted as passes:

- Gym `all application tabs open without layout breakage` — Desktop — `NOT VERIFIED: QA_OWNER_* credentials are not configured`.
- Gym `mobile UI remains compact and usable` — Desktop project — same credential blocker.
- Gym `members modal and action menu stay inside the viewport` — Desktop project — same credential blocker.
- Gym `initial dashboard load keeps heavy feature scripts lazy and stable` — Desktop project — same credential blocker.
- The same four cases under the Mobile project — same credential blocker.

The 12 passing Playwright cases are three forced-password fixture cases and three Trainer Studio fixture cases, each executed in Desktop and Mobile projects. They prove the guarded client composition and no-Gym Trainer fixture behavior, not a real tenant session.

### Database/role gate detail

| Gate | Result | Reason |
| --- | --- | --- |
| `npm run qa:rls` | BLOCKED/NOT VERIFIED | Explicit approved local/development/test/staging target is required; no DB connection was attempted |
| `npm run qa:tenancy` | BLOCKED/NOT VERIFIED | Same target guard; no tenant rows or writes were touched |
| `npm run qa:platform-admin` | SKIPPED/NOT VERIFIED | `AUTH_PLATFORM_ADMIN_*` / `QA_PLATFORM_ADMIN_*` credentials are absent |

## Remaining gaps and exact blockers

1. Authenticated Browser QA for Gym Owner, Assistant, PlatformAdmin, Independent Trainer and portal identities cannot be marked PASS without safe QA credentials.
2. Direct API limit bypass, wrong tenant type, IDOR, RLS, Branch/Section data filtering, Plan lifecycle writes, upgrade/downgrade, and payment/portal flows need an explicitly approved local/staging DB target. The current `.env` contains a DB connection variable whose value was not exposed or used for writes.
3. Full WCAG/axe and manual assistive-technology verification remains `NOT VERIFIED`.
4. Production authenticated smoke and live asset/runtime verification beyond the public login page remains `NOT VERIFIED`.

## Final status

`NOT READY — structural/local QA PASS with authenticated and live-database verification limitations`
