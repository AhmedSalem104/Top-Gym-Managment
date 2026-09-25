# 09 — Mobile Information Architecture

## Shared shell

1. Cold start / session restore
2. Workspace resolver
3. Context bar: tenant, branch/section where applicable
4. Primary navigation
5. Search/filter surfaces
6. Bottom sheets/dialogs for focused actions

## Gym map

```text
Gym
├─ Home
├─ Members
│  ├─ Search/list
│  ├─ Member profile
│  ├─ Memberships/payments
│  └─ Freeze/renew/refund/code actions
├─ Attendance
├─ Finance
├─ Reports
└─ More
   ├─ Coaching/Nutrition
   ├─ Day passes
   ├─ Pricing/Subscriptions
   ├─ Branches/Sections
   ├─ Store/Inventory/Bar
   ├─ Team/Permissions
   ├─ Notifications
   ├─ Branding
   └─ Backup/Audit/Settings
```

## Trainer map

```text
Trainer
├─ Today / Action Center
├─ Clients
├─ Sessions
├─ Training plans
├─ Nutrition plans
└─ More
   ├─ Measurements/Progress/Goals
   ├─ Packages/Payments
   ├─ Library/AI
   ├─ Templates
   ├─ Notifications
   └─ Client portal
```

## Member Portal map

```text
Code entry -> Member home -> Membership | Payments | Attendance/Occupancy
                         -> Library/tools | Notifications | Feedback/Requests
```

## Platform map

Overview → Tenants → tenant detail (health, users, subscription, usage, overrides, audit, notes, backups) plus Plans, Requests, Payment Methods, and Platform Audit.

## Ergonomic rules

- Lists are virtualized/paginated; filters open in sheets on narrow screens.
- Destructive/financial operations use a review sheet and server idempotency where supported.
- Long forms use focused steps or sectioned sheets, not desktop-width dialogs.
- Tables become cards or horizontally scrollable component regions only where the current web contract requires it; the document itself must not scroll horizontally.
