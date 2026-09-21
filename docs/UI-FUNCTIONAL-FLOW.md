# Logic Fit — As-Is Application Flow

> Reference document for the current application behavior before the next visual-system phase.
> This document describes the existing functional contract only. It does not restore legacy CSS, choose Tailwind tokens, or introduce TailAdmin components.

## Scope and evidence

This inventory was derived from the current repository state and the existing functional test surface:

- Browser/page HTML: `public/index.html`, `public/login.html`, `public/change-password.html`, `public/member-portal.html`, `public/platform-admin.html`, `public/platform-admin-forbidden.html`, `public/register-gym.html`, `public/register-trainer.html`, `public/trainer-workspace.html`.
- Frontend runtime: `public/js/app.js`, `public/js/auth-ui.js`, `public/js/page-tabs.js`, `public/js/branch-context.js`, `public/js/dialog-loader.js`, `public/js/dialog-enhancements.js`, `public/js/core/api.js`, `public/js/core/state.js`, `public/js/core/permissions.js`, `public/js/core/feature-manifest.js`, feature/page modules, and `public/js/pagination.js`.
- Backend routing: `server.js`, `src/routes/index.js`, and the route modules under `src/routes/`.
- Authorization/capability sources: `src/permissions/`, `src/middleware/`, `src/services/capability-service.js`, `src/services/saas-service.js`, and the feature catalog/plan services.
- Existing automated coverage: `tests/unit/`, `tests/e2e/`, `scripts/qa-gate.js`, and the current browser QA scripts.
- The CSS reset recovery point was used only as a comparison reference where necessary. No visual CSS was restored from it.

The current reset intentionally leaves presentation minimal. The functional contracts below remain the source of truth for a future Tailwind/TailAdmin visual migration.

## 1. Complete route map

### Browser and page entry routes

| Entry route | Current behavior | Page/source |
|---|---|---|
| `/` | Resolves platform host, authenticated role, forced-password state, trainer tenant, or Gym login/app entry. | `server.js`, `public/login.html`, `public/index.html` |
| `/platform-admin`, `/platform-admin/`, `/admin-panel`, `/admin-panel/` | Serves Platform Admin or forbidden page according to authenticated session role. | `server.js`, `public/platform-admin.html`, `public/platform-admin-forbidden.html` |
| `/member-portal` | Serves the member portal entry. | `server.js`, `public/member-portal.html` |
| `/register-gym` | Serves public Gym registration. | `server.js`, `public/register-gym.html` |
| `/register-trainer` | Serves public trainer registration. | `server.js`, `public/register-trainer.html` |
| `/trainer-workspace`, `/trainer-workspace/:view`, `/trainer-workspace/:view/:subview` | Requires authenticated `independent_trainer`; otherwise redirects to the normal entry. | `server.js`, `public/trainer-workspace.html`, `public/js/trainer-studio-v2.js` |
| `/change-password` | Serves forced-password UI only when the session requires it; otherwise redirects to the role workspace. | `server.js`, `public/change-password.html`, `public/js/auth-ui.js` |
| `/qr/:id` | Public QR/member-facing page; tenant is resolved from the request context/header/query according to the existing QR flow. | `server.js`, QR/portal modules |
| `*` | Authenticated users receive the Gym app shell; anonymous users receive the login entry. | `server.js` |

### Hash/application navigation routes

`public/js/page-tabs.js` owns normalization, visibility, selection, and panel activation for the 19 canonical application tabs:

`dashboard`, `members`, `expenses`, `reports`, `management`, `branding`, `member-payment-methods`, `saas-billing`, `backup-history`, `permissions`, `attendance`, `library`, `trainees`, `intelligence`, `feedback`, `store`, `branches`, `member-subscription-requests`, `portal-analytics`.

The current static HTML declares 17 tabs. `branches` and `backup-history` are injected/managed at runtime; legacy `platform` is removed by the runtime when present. Tab panels use `data-page-tab-panel` and the active tab uses the existing `active`/ARIA state contract.

| Navigation group | Tabs |
|---|---|
| Workspace | `dashboard`, `members`, `attendance`, `reports` |
| Location | `branches` |
| Operations | `trainees`, `library`, `store`, `intelligence`, `feedback` |
| Management | `management`, `branding`, `member-payment-methods`, `permissions`, `expenses`, `member-subscription-requests`, `portal-analytics`, `saas-billing`, `backup-history` |

### API route map

`src/routes/index.js` registers 357 route declarations across the following route modules. The route files are the canonical complete map; the table records each route family, its declaration count, and its current contract surface.

| Route family/module | Count | Current contract surface |
|---|---:|---|
| `attendance.routes.js` | 5 | Attendance list/report/member history and check-in/check-out operations. |
| `auth.routes.js` | 13 | Session, login/logout, forced password, users, permissions, assistant creation/update/reset/status. |
| `backup.routes.js` | 12 | Daily backup, status, records, history, archive, download, restore, inspect. |
| `bar.routes.js` | 10 | Menu, recipes, modifiers, shifts, sales, and waste. |
| `branch.routes.js` | 7 | Branch list/bootstrap/access, create/update/archive, and user access assignment. |
| `branding.routes.js` | 9 | Public branding/assets, draft settings/assets, publish/reset/upload/delete. |
| `coaching.routes.js` | 34 | Coaching clients, catalog, summaries, measurements, check-ins, workouts, diets, sessions, and meal logs. |
| `dashboard.routes.js` | 3 | Dashboard, analytics, and bootstrap data. |
| `day-pass.routes.js` | 9 | Day-pass pricing, list/summary, create/update/delete, opened/void state. |
| `finance.routes.js` | 4 | Monthly finance and expense CRUD. |
| `gym-registration.routes.js` | 12 | Public Gym/trainer registration, catalog, request/proof/status, and admin approval/rejection. |
| `intelligence.routes.js` | 6 | Intelligence overview/query, churn, workout/diet suggestions, refine. |
| `library.routes.js` | 6 | Library option/type/list and item CRUD. |
| `member-feedback.routes.js` | 2 | Portal feedback submission and owner list. |
| `member-portal.routes.js` | 13 | Lookup/session/payment methods/membership catalog/occupancy/library, membership-code flows, analytics. |
| `member-subscription.routes.js` | 7 | Portal subscription requests/proof and owner list/proof/approve/reject. |
| `members.routes.js` | 16 | Members list/details, create/update, freeze/resume/renew/refund/delete, memberships and payment. |
| `notification.routes.js` | 10 | Tenant/portal lists, unread/read/read-all, and stream. |
| `phone.routes.js` | 2 | Phone country metadata used by the current phone system. |
| `platform-admin.routes.js` | 42 | Admin dashboard, tenants, users, status, subscriptions, plans, usage, overrides, resets, health, audit, backups, and requests. |
| `platform.routes.js` | 13 | Platform overview, tenants, plans/catalog, registration requests, proofs, and audit. |
| `pricing.routes.js` | 8 | Pricing, plans, membership types, and membership-type CRUD. |
| `reports.routes.js` | 1 | Report entry surface. |
| `saas.routes.js` | 8 | Entitlements, subscription, plans, catalog, requests, and payment proof. |
| `stock-location.routes.js` | 7 | Stock locations and transfers. |
| `store.routes.js` | 33 | Store bootstrap/dashboard/reports, catalog, suppliers, inventory, movements, adjustments, customers, purchases, sales, returns, expenses, and member purchases. |
| `trainer.routes.js` | 61 | Trainer workspace, clients, packages, sales/purchases, reports, sessions, goals, tasks/templates, portal, measurements/check-ins, training/nutrition, payments/refunds, and notifications. |
| `whatsapp-template.routes.js` | 4 | Runtime/platform WhatsApp template operations. |
| **Total** | **357** | Registered by `src/routes/index.js`. |

Representative endpoint contracts include `/api/auth/login`, `/api/auth/session`, `/api/auth/logout`, `/api/dashboard/bootstrap`, `/api/members`, `/api/attendance`, `/api/branches/bootstrap`, `/api/saas/entitlements`, `/api/trainer/*`, and `/api/platform-admin/*`. Exact methods, parameters, middleware, and response shapes remain in their route modules and are not changed by this document.

## 2. Navigation hierarchy and App Shell

### Shell contract

The Gym shell in `public/index.html` is organized around:

- `#branchContextShell`, `#branchContextSelect`, `#sectionContextField`, `#sectionContextSelect`, and `#branchContextStatus` for branch/section scope.
- `#topAddMemberButton`, `#topPricingButton`, and `#refreshButton` for global actions.
- `#themeToggleButton`, `#globalKioskToggle`, `#authAccountBar`, and `#authLogoutButton` for user/session controls.
- `#mobileNavToggle`, `#pageTabs`, `#mobileNavClose`, and `#mobileNavBackdrop` for responsive navigation.
- `#dashboardSection` and `data-page-tab-panel` sections for page composition.

Navigation visibility is derived from tenant type, owner status, permissions, and the existing entitlement/capability result. A hidden navigation item is not the security boundary; protected routes and APIs remain server-authoritative.

### Mobile navigation

At the existing mobile breakpoint (`max-width: 767px`), the current navigation uses:

`#mobileNavToggle` → `mobile-nav-open`/`is-mobile-open` → `#pageTabs` with `aria-hidden`, `inert`, and `aria-expanded` coordination → close button/backdrop/Escape handling.

The current desktop/tablet sidebar states include `sidebar-pinned`, `is-hovered`, `sidebar-expanded`, and `sidebar-ready`; pin state persists using the existing `logic-fit.sidebar-pinned` local-storage key. These are functional state contracts, not redesign instructions.

## 3. Authentication and account flows

### Login and session bootstrap

| Entry | Action | State/screen | Next action | Result |
|---|---|---|---|---|
| `/` or `login.html` | Submit `#loginForm` with `#loginEmail` and `#loginPassword`. | `auth-ui.js` posts to `/api/auth/login`; `#loginMessage` reports errors/loading. | Fetch `/api/auth/session`; normalize user, tenant type, forced-password state, and entitlements. | Authenticated session is established or an error remains visible. |
| Authenticated session | Apply permission controls and effective entitlements. | `auth-pending` is removed only when the auth/app state is ready. | Resolve first accessible tab or role workspace. | Gym shell, trainer workspace, or forced-password flow is shown. |
| Session requires password change | Login/session succeeds but `mustChangePassword` is true. | `#forcePasswordForm` with `#forceNewPassword` and `#forceConfirmPassword`. | POST `/api/auth/change-password`. | Password is changed according to current policy, then normal workspace routing continues. |

Key sources: `public/js/auth-ui.js`, `public/js/core/api.js`, `public/js/core/state.js`, `server.js`, `src/routes/auth.routes.js`, `#authScreen`, `#saasEntryCard`, `#authLoginCard`, `#forcePasswordMessage`.

### Logout

| Entry | Action | State/screen | Next action | Result |
|---|---|---|---|---|
| Authenticated shell | Activate `#authLogoutButton`. | POST `/api/auth/logout`; UI clears current auth/session state. | Navigate to login entry. | Session is closed server-side and protected app UI is no longer usable. |

### Platform and trainer entry

Platform Admin sessions resolve to `/platform-admin`; independent trainers resolve to `/trainer-workspace`; ordinary Gym users resolve to `index.html`. Non-matching role/tenant requests are redirected by `server.js` and protected APIs enforce the final authorization independently.

## 4. Gym Admin and dashboard flows

### Gym Admin shell

| Entry | Action | State/screen | Next action | Result |
|---|---|---|---|---|
| Authenticated Gym session | Resolve tenant, status, subscription, branch/section, permissions, and entitlements. | App shell stays gated by `auth-pending` until the secure bootstrap is ready. | Load the first accessible tab and its feature module. | Tenant-scoped Gym workspace is shown with only permitted navigation. |
| Any protected tab | Select a `data-page-tab`. | `page-tabs.js` normalizes the tab and activates its panel. | Feature loader loads the module/dialogs/dependencies if needed. | Existing page state and route behavior are preserved. |

### Dashboard

| Entry | Action | State/screen | Next action | Result |
|---|---|---|---|---|
| `dashboard` tab | App/bootstrap loads dashboard data. | `#dashboardInitialSkeleton`, dashboard stats, alerts, shortcuts, and cards use loading/empty/error states. | Refresh, open shortcut, or navigate to a feature tab. | Dashboard shows tenant/branch-scoped operational summary. |
| Dashboard alerts | Search/filter `#alertsSearch` or related controls. | Alert list updates without changing the dashboard route. | Open the referenced item or clear the filter. | Matching alerts remain tenant-scoped. |
| Dashboard shortcut | Activate shortcut. | Target tab/dialog is selected and lazy feature resources load. | Continue in the target workflow. | Existing target feature opens; no new feature is created by redesign. |

## 5. Members and memberships

### Members list and search

| Entry | Action | State/screen | Next action | Result |
|---|---|---|---|---|
| `members` tab | Load member list. | `#membersSearch`, filters, status controls, list/table, pagination, and action menus become ready. | Search/filter/page or open a member. | Branch/section-scoped members are displayed. |
| Members list | Enter search/filter criteria. | `pagination.js` and member list module request the matching page. | Change page, clear filters, or select a result. | Current query/page is reflected without changing API semantics. |
| Members list | Activate add/edit action. | `#memberDialog` opens with current validation contract. | Save, cancel, or open details. | Create/update API completes or field errors remain local to the form. |

### Member details and operations

| Entry | Action | State/screen | Next action | Result |
|---|---|---|---|---|
| Member row/action menu | Open details. | `#detailsDialog`/member-details modules show member, memberships, payments, coaching, and portal context as permitted. | Renew, freeze, resume, refund, QR, payment, or close. | Operation calls the existing endpoint and refreshes the affected state. |
| Member details | Renew/freeze/resume/refund/delete. | Confirmation/loading/error/success state is shown by the current dialog/action flow. | Close or continue with the refreshed member state. | Existing business rules, ledger behavior, permissions, and tenant scope remain authoritative. |
| Member details | Open QR/portal/payment/coaching action. | `#memberQrDialog` or linked flow opens. | Print/share/close or continue in the relevant feature. | Existing QR, WhatsApp, payment, coaching, and portal contracts are preserved. |

Membership-related APIs include member membership listing, create/update/renewal/payment, branch association, refund preview/refund, and the separate member subscription request flow. Membership type/pricing management uses `management`/pricing dialogs and `/api/pricing/*` contracts.

## 6. Payments, finance, reports, and expenses

### Payments and finance

| Entry | Action | State/screen | Next action | Result |
|---|---|---|---|---|
| Member details or payment action | Create/update membership payment. | Payment form/dialog validates and submits to member/payment endpoints. | Refresh member balance/payment history. | Payment is recorded under existing branch/tenant/ledger semantics. |
| `expenses` tab | Load/filter/create/edit/delete expense. | `#expenseDialog` and finance page state show list, filters, totals, loading/errors. | Save, cancel, or refresh. | `/api/expenses` and `/api/monthly-finance` remain the source of truth. |
| Finance/report view | Request monthly finance/report. | Report loading/empty/error state. | Export/print or change period/filter. | Existing financial-ledger semantics and permissions apply. |

The shared financial boundary remains `src/services/financial-ledger-service.js`; the UI does not reinterpret historical ledger facts.

### Reports

The `reports` tab and trainer/platform report screens use the existing reports endpoints, search/filter controls, export/print actions, and loading/empty/error states. Report access is controlled by the current permission mapping; visual migration must not alter scope or data semantics.

## 7. Attendance flow

| Entry | Action | State/screen | Next action | Result |
|---|---|---|---|---|
| `attendance` tab | Load today's log and current branch/section context. | Attendance search/filter/refresh state and quick check-in area become ready. | Enter phone, scan QR, or select a member. | Existing `/api/attendance` data is shown for the active tenant/context. |
| Attendance screen | Submit phone/QR check-in or check-out. | Member result/loading/success/error state. | Continue another check or inspect the log. | Check-in/check-out endpoint applies current membership, branch, permission, and plan rules. |
| Attendance log | Search/filter/paginate. | `pagination.js`, status filters, and refresh preserve query state. | Change page or clear filters. | Matching records are shown without changing attendance logic. |

Relevant DOM/function contracts include attendance controls in `public/index.html`, the attendance feature modules, QR/phone handlers, and `/api/attendance`, `/api/attendance/report`, `/api/attendance/member/:id`.

## 8. Branch and section context

| Entry | Action | State/screen | Next action | Result |
|---|---|---|---|---|
| App shell | Load branch bootstrap. | `#branchContextShell`, `#branchContextSelect`, `#sectionContextField`, and `#branchContextStatus` show loading/available/error state. | Select a branch or section. | Current context is resolved from `/api/branches/bootstrap` and persisted by the existing context module. |
| Branch context trigger | Open menu and choose branch. | `.branch-context-field.is-open`, `.branch-context-menu`, and `.branch-context-option` state is active. | Close, Escape, outside click, or select another branch. | Context changes and affected screens refresh under the selected tenant/branch scope. |
| `branches` tab | Create/update/archive or assign access. | Branch dialog/list and confirmation states. | Save, cancel, or switch context. | Branch APIs enforce plan limits, permissions, tenant isolation, and existing branch data safety. |
| Section context | Select section where available. | Section field/options reflect the selected branch. | Navigate to a scoped feature. | Requests use the current branch/section context rather than a client-supplied untrusted scope. |

## 9. Trainer Studio flows

The trainer page entry is `/trainer-workspace` with optional `:view` and `:subview`. `public/js/trainer-studio-v2.js` and trainer feature modules own the current client-side composition.

| Entry | Action | State/screen | Next action | Result |
|---|---|---|---|---|
| Trainer workspace | Resolve trainer session and workspace view. | Trainer shell loads dashboard/client/package/report panels. | Select clients, sessions, goals, tasks/templates, training, nutrition, or reports. | Trainer-only workspace appears with trainer tenant/type permissions. |
| Clients | Search/open client. | Client profile/timeline/measurement/check-in panels. | Add measurement/check-in, open training/nutrition, package/payment action. | Existing `/api/trainer/*` and coaching contracts execute. |
| Training/Nutrition builder | Open builder and complete current steps. | Existing builder dialogs/step state/validation. | Save/print/PDF/cancel according to current flow. | Training/diet data is persisted through current APIs; redesign must preserve IDs/events. |
| Sessions/goals/tasks/templates | Create/update/list. | Feature panel/dialog loading/error/success states. | Continue editing or return to workspace. | Existing trainer business rules and tenant scope remain unchanged. |

## 10. Member Portal flows

| Entry | Action | State/screen | Next action | Result |
|---|---|---|---|---|
| `/member-portal` or QR entry | Lookup using the existing membership/portal identifier. | Portal lookup/session state. | Start portal session or retry. | Portal session is created only for the validated member/tenant context. |
| Portal session | View membership, payment methods, occupancy, library, analytics. | Portal panels and notification/read state. | Open service, payment, feedback, or library action. | Existing `/api/member-portal/*` contracts return member-scoped data. |
| Subscription request | Select membership/payment flow and submit proof where supported. | Request/proof pending/success/rejection state. | Track request or return to portal. | Existing member subscription request endpoints apply. |
| Feedback/notifications | Submit feedback, read notifications, or mark all read. | Inline success/error/unread state. | Continue portal use or logout/close. | Existing portal feedback/notification behavior is preserved. |

## 11. Platform Admin flows

| Entry | Action | State/screen | Next action | Result |
|---|---|---|---|---|
| `/platform-admin` | Resolve Platform Admin session and load dashboard. | Platform shell, tenant/plan/request/audit panels. | Choose an admin panel. | Platform-only surface is available; forbidden users receive the existing forbidden page. |
| Tenant management | List/search/create/update/suspend/archive/inspect tenant. | Tenant table, dialogs, status/health/audit state. | Save, approve, reject, or return. | Platform APIs enforce Platform Admin authorization and target tenant scope. |
| SaaS plan/catalog | View/edit plans, terms, features, limits, compatibility, overrides. | Plan/feature/catalog/request dialogs and tables. | Save/activate/disable or inspect subscription. | Existing SaaS/platform contracts remain the source of plan configuration and entitlements. |
| Registration/payment proof | Review Gym/trainer registration or payment proof. | Request/proof approval/rejection state. | Approve/reject and return to queue. | Existing registration/approval APIs execute with audit behavior. |
| Backup/audit/health | Inspect backup records, audit, health, and tenant backup state. | Details/restore confirmation and status states. | Download/inspect/restore only through existing guarded flow. | No visual migration may bypass backup, audit, or authorization checks. |

## 12. SaaS, tenant, plan, and entitlement flows

| Entry | Action | State/screen | Next action | Result |
|---|---|---|---|---|
| Authenticated app | Request `/api/saas/entitlements`. | Entitlement/bootstrap state is attached to the authenticated tenant/session. | `page-tabs.js` and feature modules filter visibility. | Backend remains the authority for feature access and limits. |
| `saas-billing`/plan screen | View current/available plans and terms. | Plan cards, current plan, term/price state, upgrade/downgrade/renew controls. | Submit request/proof or complete existing billing action. | Snapshot/term/price behavior remains unchanged. |
| Protected feature/API | Attempt route or API. | Included feature proceeds; excluded feature receives the existing blocked/error contract. | Upgrade/renew or return. | UI hiding is not a security boundary; capability/API enforcement remains server-side. |
| Platform plan management | Change plan configuration or override. | Admin plan/feature/limit/compatibility state. | Save/activate/disable and audit. | New configuration follows existing subscription/snapshot rules. |

## 13. Registration and public flows

`/register-gym` and `/register-trainer` use the existing registration HTML/JS and `gym-registration` routes for public catalog lookup, registration request, proof/status, and platform-admin review. These flows are intentionally listed separately from authenticated Gym/Trainer profiles.

## 14. Modal and dialog inventory

The current DOM contains 29 functional `<dialog>` elements. Their IDs are preserved contracts:

| Dialog ID | Functional area | Current source/lifecycle |
|---|---|---|
| `actionDialog` | Generic/action confirmation | `index.html` and dialog helpers |
| `authUserDialog` | User/assistant permissions | `dialogs/permissions.html`, permissions feature |
| `backupRestoreDialog` | Backup restore/inspection | `dialogs/backup.html`, lazy dialog loader |
| `coachingBuilderDialog` | Training/nutrition builder | `dialogs/coaching.html`, coaching loader |
| `coachingProfileDialog` | Coaching profile | `dialogs/coaching.html` |
| `dayPassDialog` | Day pass | Day-pass feature |
| `detailsDialog` | Member/details | Member details feature |
| `expenseDialog` | Expense form | Finance/expenses feature |
| `externalTraineeDialog` | External trainee | `dialogs/coaching.html` |
| `libraryDetailsDialog` | Library details | `dialogs/library.html` |
| `libraryFormDialog` | Library form | `dialogs/library.html` |
| `memberDialog` | Add/edit member | Members feature |
| `memberQrDialog` | Member QR | Member details/portal flow |
| `membershipPlanDialog` | Membership plan | Pricing/management |
| `membershipTypeDialog` | Membership type form | Pricing/management |
| `membershipTypesDialog` | Membership type list | Pricing/management |
| `platformActionDialog` | Platform action | Platform Admin |
| `platformRegistrationCredentialsDialog` | Registration credentials | Platform registration |
| `pricingDialog` | Pricing form | Pricing feature |
| `qrReaderDialog` | QR reader | Attendance/member flows |
| `trainerCheckinDialog` | Trainer check-in | Trainer Studio |
| `trainerClientDetailsDialog` | Trainer client details | Trainer Studio |
| `trainerClientDialog` | Trainer client form | Trainer Studio |
| `trainerMeasurementDialog` | Trainer measurement | Trainer Studio |
| `trainerPackageDialog` | Trainer package | Trainer Studio |
| `trainerPaymentDialog` | Trainer payment | Trainer Studio |
| `trainerPurchaseDialog` | Trainer purchase | Trainer Studio |
| `trainerSessionDialog` | Trainer session | Trainer Studio |
| `trainerTimelineDialog` | Trainer timeline | Trainer Studio |

Lazy fragments currently loaded by `dialog-loader.js` include `dialogs/backup.html`, `dialogs/coaching.html`, `dialogs/library.html`, and `dialogs/permissions.html`. Dialog open/close uses the existing HTML dialog lifecycle, `showModal()`/`close()`, close IDs/events, and `dialog-enhancements.js`. Print, PDF, WhatsApp, and receipt windows are external flows and are not reinterpreted here.

## 15. Dropdowns, menus, tabs, and panels

| Surface | DOM/contract | Behavior |
|---|---|---|
| Branch context | `#branchContextSelect`, `.branch-context-menu`, `.branch-context-option` | Open/select/close, Escape, outside click, persistence, tenant/branch scope. |
| Section context | `#sectionContextSelect`, `#sectionContextField` | Options depend on selected branch and current permissions. |
| Sidebar/page tabs | `#pageTabs`, `data-page-tab`, `data-page-tab-panel` | Normalize visible tab, activate panel, lazy-load feature. |
| Member action menu | Member action-menu module and `data-*` action markers | Per-member actions preserve permission and membership state. |
| Account menu | `#authAccountBar`, `#authLogoutButton` | Profile/account actions and logout lifecycle. |
| Theme/kiosk controls | `#themeToggleButton`, `#globalKioskToggle` | Existing theme/kiosk state behavior. |
| Platform panels | `[data-platform-panel]` and `.active` | Only active Platform Admin panel is visible. |
| Profile panels | `[data-profile-panel]` and `.active` | Only active profile panel is visible where the current page uses this contract. |

## 16. Search, filter, sorting, and pagination behavior

The current pagination contract is centralized in `public/js/pagination.js` and is consumed by members, attendance, and other list features. The following surfaces were mapped:

| Surface | Search/filter | Pagination/list behavior |
|---|---|---|
| Members | `#membersSearch`, status/branch filters | Server/list paging, action menu, branch scope. |
| Attendance | `#attendanceSearch`, status/date filters, refresh | Attendance list paging and current-context refresh. |
| Dashboard alerts | `#alertsSearch` and alert filters | Filtered alert list with empty/loading/error states. |
| Library | Library type/search/filter controls | Feature module list/detail paging where present. |
| Store | Product/customer/inventory/sales filters | Store list/report paging and scoped queries. |
| Trainer Studio | Client/package/session/task/report search/filter controls | Trainer list/panel pagination according to module. |
| Platform Admin | Tenant/request/plan/audit/backup filters | Admin tables use current paging/list contracts. |
| Reports/finance | Date/period/filter controls | Report/finance result state and export/print actions. |

## 17. Role, permission, tenant, and entitlement-dependent UI

### User/tenant roles observed

- Platform Admin (`PlatformAdmin`/platform session context).
- Gym Owner (`Owner`).
- Gym Assistant/team user (`Assistant` and the current role-permission model).
- Independent Trainer (`tenant_type=independent_trainer`).
- Member/Client portal identity is handled by the separate portal flow; it is not assumed to be the same authenticated user table without an explicit portal session.

### UI permission markers and central checks

The current HTML contains 55 explicit permission/visibility marker instances: 30 `data-owner-only`, 20 `data-required-permission`, 3 `data-platform-only`, and 2 `data-feature` markers. Additional dynamic action metadata is audited through `data-permission`, `data-member-coaching-action`, and `data-coaching-action`.

`public/js/core/permissions.js` and `auth-ui.js` apply UI visibility/disabled state from the authenticated session, but backend middleware, route permission checks, tenant context, capability service, SaaS entitlements, and SQL/RLS remain authoritative.

Important mapped examples include:

- `members.create` for add-member controls.
- `pricing.read/create/update` for pricing/membership-type controls.
- Attendance check-in/check-out permissions.
- Finance/expense permissions.
- Reports/export permission.
- Branding edit/publish/reset permission.
- Intelligence read/generate and coaching builder refinement permission.
- External trainee, library, day-pass, backup, permissions, and execution-session actions.
- Owner-only management, branches, SaaS billing, backup, requests, and portal analytics surfaces.
- Gym-only branch context and Gym navigation versus trainer workspace separation.

### Entitlement flow

`Authenticated session → tenant/status → subscription → snapshot/effective entitlements → tenant type compatibility → feature visibility → server-side capability/API guard`.

Navigation filtering is convenience only. Direct routes and APIs must continue to enforce the same current server-side entitlement and permission rules.

## 18. Functional state contract remaining after CSS reset

The current functional-state source is `public/css/functional-state.css`; it contains behavior/accessibility visibility rules only. The 15 documented rule groups are:

1. `[hidden]` and `.hidden` visibility.
2. `.visually-hidden` and `.sr-only` accessibility clipping.
3. Closed native dialogs via `dialog:not([open])`.
4. Closed branch context menu via `.branch-context-menu`.
5. Open branch context menu via `.branch-context-field.is-open .branch-context-menu`.
6. Hidden page tabs via `#pageTabs[aria-hidden="true"]`.
7. Compatibility hiding for `#coachingBuilderProgress`.
8. Notification layer hidden state.
9. Assistant/smart-helper hidden state.
10. Welcome/loading layer hidden state.
11. Auth gating via `.auth-pending .auth-screen` and `.auth-pending .app-shell`.
12. Inactive Platform panels via `[data-platform-panel]:not(.active)`.
13. Inactive profile panels via `[data-profile-panel]:not(.active)`.
14. Portal/progress visibility via `.is-visible` state classes.
15. Reduced-motion behavior via `prefers-reduced-motion`.

Runtime state contracts also include `mobile-nav-open`, `is-mobile-open`, `sidebar-pinned`, `is-hovered`, `sidebar-expanded`, `sidebar-ready`, `data-loading`, `aria-busy`, `data-auth-stage`, `active`, `is-active`, `disabled`, `inert`, and `aria-hidden`. These names and their JavaScript relationships must remain compatible during visual migration.

## 19. Existing functional test evidence

The current functional test surface includes:

- Unit suite: 527 tests.
- Browser E2E suites: `app-shell-loading.spec.js`, `branch-modal-cascade.spec.js`, `feature-entitlements.spec.js`, `forced-password.spec.js`, `freeze-whatsapp.spec.js`, `login-minimal.spec.js`, `membership-types-delete.spec.js`, `members-popups.spec.js`, `navigation-responsive.spec.js`, `phone-auto-country.spec.js`, `phone-display-formatting.spec.js`, `phone-input-validation.spec.js`, `phone-system-v2.spec.js`, `saas-plans-phase2.spec.js`, `trainer-studio-v2.spec.js`, `ui-ux.spec.js`, and `whatsapp-templates.spec.js`.
- Functional QA gate: `scripts/qa-gate.js`.
- Reset functional browser QA: `scripts/serve-browser-qa.js` plus the current visual/functional test command.

The documented test contract covers authentication, navigation, branch/modal lifecycle, phone behavior, feature entitlements, SaaS plans, membership operations, trainer flows, and WhatsApp templates. Visual acceptance is intentionally separate from this As-Is behavior document.

## DESIGN MIGRATION CONTRACT

The following rules are mandatory for the future Tailwind/TailAdmin visual phase:

- Existing Flow must remain unchanged.
- Existing routes must remain unchanged.
- Existing APIs/contracts must remain unchanged.
- Existing IDs and functional data attributes must remain compatible.
- Existing permissions/conditional visibility must remain unchanged.
- Tailwind may change presentation, not application behavior.
- TailAdmin is a future visual reference only.
- No feature may disappear because of redesign.
- No navigation item may be removed or moved without explicit approval.
- No workflow may be simplified or changed without explicit approval.

Additional preservation constraints:

- Preserve tenant isolation, RLS, authenticated session authority, entitlements, branch/section context, and server-side permission checks.
- Preserve phone validation/canonicalization and financial behavior.
- Preserve modal IDs, event listeners, `data-*` action markers, form names, API payloads, and route guards.
- Preserve functional state classes listed above; styling may change later, but behavior/state transitions may not.
- Do not restore the CSS reset recovery point as a design source.

## Documentation boundary

This file is documentation only. It does not add a route, API, feature, permission, DOM node, CSS rule, Tailwind dependency, or TailAdmin implementation.

