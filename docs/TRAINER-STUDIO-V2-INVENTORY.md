# Trainer Studio V2 inventory and gap matrix

This document records the current independent-trainer product against the
actual repository. It is intentionally explicit about features that have no
current API or persistence contract; the UI does not expose fake actions for
those features.

## Runtime boundary

- Product tenant: `independent_trainer` only.
- Entry route: `/trainer-workspace`; deep links use `/trainer-workspace/<view>`.
- Server boundary: `src/routes/trainer.routes.js` uses `trainerOnly`; services
  re-check the persisted tenant type and tenant id.
- UI entry: `public/trainer-workspace.html`,
  `public/js/trainer-workspace.js`, and the V2 shell in
  `public/js/trainer-studio-v2.js`.

## Feature matrix

| Feature | Current state | Source of truth | V2 surface |
|---|---|---|---|
| Application shell | EXTENDED | trainer workspace HTML/CSS | Sidebar, route bar, mobile drawer |
| Dashboard | EXISTS / EXTENDED | `GET /api/trainer/workspace` | `/dashboard` |
| Clients | EXISTS / EXTENDED | `GET/POST/PATCH/DELETE /api/trainer/clients` | `/clients` |
| Client details/timeline | EXISTS | trainer client routes | Existing dialogs from client surface |
| Measurements | EXISTS | trainer client measurement routes | `/measurements` + client dialogs |
| Check-ins/follow-up | EXISTS | `/api/trainer/follow-up`, client check-ins | `/checkins` |
| Sessions | EXISTS / EXTENDED | `/api/trainer/sessions` | `/sessions` and `/calendar` |
| Training plans | API EXISTS / UI EXTENDED | `/api/trainer/training-plans` | `/training` |
| Nutrition plans | API EXISTS / UI EXTENDED | `/api/trainer/nutrition-plans` | `/nutrition` |
| Exercise library | REUSE | `/api/coaching/catalog` | `/exercises` |
| Packages | EXISTS | `/api/trainer/packages` | `/packages` |
| Sales/collections | EXISTS | package purchase/payment routes | `/sales` |
| Finance summary | EXISTS | trainer report/payment routes | `/finance` |
| Reports | EXISTS | `/api/trainer/reports/summary` | `/reports` |
| Client portal access | EXISTS | `/api/trainer/clients/:id/portal-access` | `/portal` + client details |
| Trainer client online payment | MISSING | no trainer portal payment request/provider contract | Not exposed |
| Renewals center | PARTIAL | package purchase data only | No separate action until rules/API exist |
| Goals | API / UI EXISTS | `gym_trainer_goals` via `/api/trainer/goals` | `/goals` |
| Notifications | DERIVED / UI EXTENDED | `/api/trainer/notifications` derives follow-up, session and package signals | `/notifications` |
| Tasks/action center | EXISTS / EXTENDED | `gym_trainer_tasks` via `/api/trainer/tasks` | `/tasks` with create/complete/dismiss actions |
| Templates | API / UI EXISTS | `gym_trainer_templates` via `/api/trainer/templates` | `/templates` |
| Progress photos | MISSING | no protected media contract | Not exposed |
| Trainer settings write flow | PARTIAL | branding/subscription APIs are separate | Read-only settings summary |

## Explicitly not part of Trainer Studio

Gym branches, gym attendance/QR, occupancy, day passes, gym Store/POS,
gym inventory, gym memberships and Gym dashboard APIs are not loaded by the
trainer shell. Their server routes remain governed by their own capability and
tenant checks.
