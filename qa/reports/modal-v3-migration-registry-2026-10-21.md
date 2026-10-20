# Modal V3 migration registry — 2026-10-21

## Scope and evidence

This registry is limited to MOD-001 through MOD-040 from [the read-only inventory](modal-popup-inventory-2026-10-20.md). It distinguishes visual migration from feature-workflow verification: shared V3 classes, tokens and layout were applied to all entries, but the visual fixture does not replace feature-specific API, permission or data-state tests. No APIs, database, permissions or business handlers were changed.

**Result:** 40/40 entries opted into Modal V3. **Status:** 40 `MIGRATED — PARTIALLY VERIFIED`; 0 fully functionally verified; 0 blocked at the shared visual layer. Before screenshots were not captured before this change. After screenshots are shared-fixture evidence, not screenshots of each feature's live data.

Actual after artifacts:

- [Desktop 1440px — Arabic RTL, Light](../artifacts/modal-v3/v3-desktop-rtl-light.png)
- [Mobile 390px — Arabic RTL, Light](../artifacts/modal-v3/v3-mobile-rtl-light.png)
- [MOD-040 portal detail-card surface](../artifacts/modal-v3/v3-portal-details.png)

The browser visual test instantiates all 39 native IDs and checks V3 class assignment. It sweeps 320, 375, 430, 768, 1024, 1440 and 1920px with RTL/LTR and Light/Dark; all 39 are opened at 1440 RTL Light. Six representative variants are opened at each combination. MOD-040 card sizing, centering and overlay bounds are checked in a Member Portal host fixture. This is not a claim that all feature-specific dialog forms were visually captured.

| ID | Experience | Source / owner | V3 variant | Status / evidence |
|---|---|---|---|---|
| MOD-001 | Registration choice | `public/index.html`; generated `public/login.html`; `public/js/auth-ui.js` | Selection | MIGRATED — PARTIALLY VERIFIED; class and auth surface tested, route navigation not re-run |
| MOD-002 | Login recovery guidance | `public/index.html`; generated `public/login.html`; `public/js/auth-ui.js` | Confirmation | MIGRATED — PARTIALLY VERIFIED; visual fixture, no auth workflow/API change |
| MOD-003 | Dashboard data scope | `public/index.html`; `public/js/branch-context.js` | Selection | MIGRATED — PARTIALLY VERIFIED; V3 fixture; existing branch cascade test run |
| MOD-004 | Member payment method editor | `public/index.html`; `public/js/pages/management/member-payment-methods.js` | Form | MIGRATED — PARTIALLY VERIFIED; V3 registry only; draft/apply/publish workflow not re-run |
| MOD-005 | Daily class / day pass | `public/index.html`; `public/js/day-passes.js` | Form | MIGRATED — PARTIALLY VERIFIED; fixture only; persistence not exercised |
| MOD-006 | Expense editor | `public/index.html`; `public/js/pages/finance/monthly-finance.js` | Form | MIGRATED — PARTIALLY VERIFIED; financial API untouched; no write workflow executed |
| MOD-007 | Add/edit member | `public/index.html`; `public/js/app.js`; member feature modules | Form | MIGRATED — PARTIALLY VERIFIED; geometry covered by shared fixture; member submit not verified in this pass |
| MOD-008 | Membership action (freeze/renew/payment/refund) | `public/index.html`; `public/js/app.js`; `public/js/button-loading.js` | Specialized | MIGRATED — PARTIALLY VERIFIED; sensitive modes not submitted; shared geometry only |
| MOD-009 | Membership plan editor | `public/index.html`; `public/js/button-loading.js` | Form | MIGRATED — PARTIALLY VERIFIED; owner permission and plan save not re-run |
| MOD-010 | Membership type editor | `public/index.html`; `public/js/app.js` | Form | MIGRATED — PARTIALLY VERIFIED; permission/data workflow not re-run |
| MOD-011 | Member details tabs | `public/index.html`; `public/js/member-details-ui.js`; member detail modules | Details | MIGRATED — PARTIALLY VERIFIED; specialized tabs retained; data tabs not runtime-tested in this migration |
| MOD-012 | Attendance QR scanner | `public/index.html`; `public/js/pages/attendance/attendance.js` | Specialized | MIGRATED — PARTIALLY VERIFIED; camera permission/stream lifecycle not exercised |
| MOD-013 | Digital membership QR card | `public/index.html`; `public/js/member-digital-card.js` | Specialized | MIGRATED — PARTIALLY VERIFIED; existing digital-card browser test passed |
| MOD-014 | Dynamic branch creation | `public/js/branch-context.js` | Form | MIGRATED — PARTIALLY VERIFIED; existing branch modal cascade and viewport tests passed |
| MOD-015 | Backup restore | `public/dialogs/backup.html`; `public/js/pages/management/backup.js` | Destructive | MIGRATED — PARTIALLY VERIFIED; no restore executed; backup integrity logic untouched |
| MOD-016 | Assistant account / permissions | `public/dialogs/permissions.html`; `public/js/pages/management/auth-users.js` | Form | MIGRATED — PARTIALLY VERIFIED; no role/permission mutation executed |
| MOD-017 | Library item add/edit | `public/dialogs/library.html`; `public/js/pages/library/library.js` | Form | MIGRATED — PARTIALLY VERIFIED; existing library dialog accessibility test passed |
| MOD-018 | Library item details | `public/dialogs/library.html`; `public/js/pages/library/library.js` | Details | MIGRATED — PARTIALLY VERIFIED; visual fixture and existing library dialog test passed |
| MOD-019 | External trainee registration | `public/dialogs/coaching.html`; `public/js/pages/coaching/coaching.js` | Form | MIGRATED — PARTIALLY VERIFIED; fragment viewport fixture passed; save not submitted |
| MOD-020 | Training/nutrition builder | `public/dialogs/coaching.html`; `public/js/pages/coaching/coaching.js` | Wizard | MIGRATED — PARTIALLY VERIFIED; content/step/PDF workflows not fully exercised |
| MOD-021 | Coaching profile | `public/dialogs/coaching.html`; `public/js/pages/coaching/coaching.js` | Details | MIGRATED — PARTIALLY VERIFIED; fragment geometry passed; async profile states not tested |
| MOD-022 | Coaching body measurement | `public/js/pages/coaching/coaching.js` | Form | MIGRATED — PARTIALLY VERIFIED; dynamic ID mapping covered; persistence not run |
| MOD-023 | Coaching daily check-in | `public/js/pages/coaching/coaching.js` | Form | MIGRATED — PARTIALLY VERIFIED; dynamic ID mapping covered; persistence not run |
| MOD-024 | Coaching subscription | `public/js/pages/coaching/coaching.js` | Form | MIGRATED — PARTIALLY VERIFIED; dynamic ID mapping covered; no financial action run |
| MOD-025 | Coaching client edit | `public/js/pages/coaching/coaching.js` | Edit | MIGRATED — PARTIALLY VERIFIED; dynamic ID mapping covered; save not submitted |
| MOD-026 | Coaching session scheduling | `public/js/pages/coaching/coaching.js` | Specialized | MIGRATED — PARTIALLY VERIFIED; dynamic ID mapping covered; scheduling constraints not re-run |
| MOD-027 | Coaching meal log | `public/js/pages/coaching/coaching.js` | Form | MIGRATED — PARTIALLY VERIFIED; dynamic ID mapping covered; save not submitted |
| MOD-028 | Trainer Workspace client form | `public/trainer-workspace.html`; `public/js/trainer-workspace.js` | Form | MIGRATED — PARTIALLY VERIFIED; trainer dialog visual suite not completed in the interrupted regression batch |
| MOD-029 | Trainer client details | `public/trainer-workspace.html`; `public/js/trainer-workspace.js` | Details | MIGRATED — PARTIALLY VERIFIED; feature runtime not re-verified |
| MOD-030 | Trainer client timeline | `public/trainer-workspace.html`; `public/js/trainer-workspace.js` | Details | MIGRATED — PARTIALLY VERIFIED; feature runtime not re-verified |
| MOD-031 | Trainer measurement | `public/trainer-workspace.html`; `public/js/trainer-workspace.js` | Form | MIGRATED — PARTIALLY VERIFIED; feature submit not re-run |
| MOD-032 | Trainer check-in | `public/trainer-workspace.html`; `public/js/trainer-workspace.js` | Form | MIGRATED — PARTIALLY VERIFIED; feature submit not re-run |
| MOD-033 | Trainer package | `public/trainer-workspace.html`; `public/js/trainer-workspace.js` | Form | MIGRATED — PARTIALLY VERIFIED; package/capability behavior not re-run |
| MOD-034 | Trainer session | `public/trainer-workspace.html`; `public/js/trainer-workspace.js` | Specialized | MIGRATED — PARTIALLY VERIFIED; scheduling workflow not re-run |
| MOD-035 | Trainer package purchase | `public/trainer-workspace.html`; `public/js/trainer-workspace.js` | Specialized | MIGRATED — PARTIALLY VERIFIED; financial operation not executed |
| MOD-036 | Trainer payment | `public/trainer-workspace.html`; `public/js/trainer-workspace.js` | Specialized | MIGRATED — PARTIALLY VERIFIED; financial operation not executed |
| MOD-037 | Dynamic Platform Admin action modes | `public/platform-admin.html`; `public/js/platform-admin.js` | Specialized | MIGRATED — PARTIALLY VERIFIED; modes not executed; authorization retained |
| MOD-038 | Platform registration credentials | `public/platform-admin.html`; `public/js/platform-admin.js` | Specialized | MIGRATED — PARTIALLY VERIFIED; credential-display lifecycle not exercised |
| MOD-039 | SaaS subscription request | `public/js/pages/saas/saas.js` | Form | MIGRATED — PARTIALLY VERIFIED; existing SaaS request suite was started but not completed |
| MOD-040 | Member Portal library details | `public/js/member-portal-library.js`; `public/css/pages/member-portal.css` | Specialized details card | MIGRATED — PARTIALLY VERIFIED; V3 card centering/compact-height/overlay bounds passed in fixture; live data flow not re-run |

## Excluded overlays and ownership

No source changes were made to SweetAlert2 call sites or `public/css/components/modals.css`; there is no `.swal2-*` selector in the V3 block. Toasts, notification center, drawers, dropdowns, popovers, context menus and tooltips are not given V3 classes. The V3 registry is explicit by ID and contains exactly 39 native dialog IDs; MOD-040 is the one separately marked portal-card variant.

## Rollback

Revert only the V3 token declarations, V3 block in `modal-foundation.css`, `v3VariantById`/action decoration in `dialog-enhancements.js`, MOD-001/002 auth markup and login CSS source inclusion, MOD-040 card class decoration, generated build outputs, spec update, and this registry. Do not revert unrelated working-tree files or the original inventory report.
