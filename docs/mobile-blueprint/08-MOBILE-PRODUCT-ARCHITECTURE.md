# 08 — Mobile Product Architecture

## Product shape

Mobile is a role-first product with separate workspace experiences over the same backend contracts:

```text
App shell
 ├─ authenticated staff session
 │   ├─ Gym workspace
 │   ├─ Independent Trainer workspace
 │   └─ Platform Admin workspace
 └─ Member Portal entry/session
```

The app must resolve session, tenant, tenant type, subscription, capabilities, permissions, and context before exposing protected navigation.

## Workspace navigation proposals

### Gym

Primary tabs: Home, Members, Attendance, Finance, More. Quick actions: check-in, add member, collect payment, day pass. Branch and section context belongs in a persistent context switcher above data-heavy surfaces. Reports, subscriptions, pricing, coaching, nutrition, store, inventory, bar, branding, team, backup, audit and notifications are secondary destinations based on effective access.

### Independent Trainer

Primary tabs: Today, Clients, Sessions, Plans, More. Quick actions: add client, schedule session, record check-in/measurement, create training/nutrition plan, action-center task. Packages, payments, reports, library, AI, goals, templates, notifications and client portal access are secondary destinations.

### Member Portal

Entry is a code screen, not staff login. After lookup, show a focused member dashboard: membership/status, payments, attendance/occupancy where available, library/tools, notifications, feedback and subscription requests. No staff navigation or member directory.

### Platform Admin

Primary tabs: Overview, Tenants, Plans, Requests, More. Use explicit target-tenant context for tenant actions. Dense audit/backup/payment-proof surfaces are secondary and read-heavy on mobile; mutation flows require deliberate confirmation.

## Architecture rules

- Features depend on central API/auth/context/entitlement services, not on each other’s storage.
- Business rules stay on the backend; mobile models are transport/view models.
- Every feature receives an explicit workspace/context and effective capability state.
- Mutations expose loading, retry, idempotency, and server error mapping.
- Shared design-system primitives are native and tokenized; feature screens do not hardcode global values.
