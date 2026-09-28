# 16 — Testing and Quality

## Existing evidence

Current repository tests include Node unit tests, browser Playwright tests, CSS/build/style/Smoke/QA gates, database readiness/security tests, backup/recovery tests, phone/feature/plan/tenant/trainer/member portal coverage, and production smoke/release self-tests.

## Mobile test layers

1. Unit: parsers, DTO schemas, error mapping, cache keys, context reducers, pure view models.
2. Component: RTL/LTR, theme, dynamic text, states, accessibility labels, keyboard/safe-area behavior.
3. Integration: API client/session/bootstrap, tenant/branch/section invalidation, upload adapters, deep links.
4. Contract: every mobile endpoint maps to a real route and response/error schema.
5. E2E: cold start, login/restore/logout, Gym, Trainer, Member Portal, Platform Admin, denied/expired/limit/error flows.
6. Device matrix: Android/iOS, small/large phones, tablet where supported, Arabic/English, Light/Dark, offline/slow network.

## Role × feature minimum matrix

| Role | Core tests |
| --- | --- |
| Gym Owner | dashboard, members, membership/payment, attendance, branches/sections, finance, reports, store, settings, entitlements/limits |
| Gym Assistant | allowed read/write permissions, denied Owner-only actions, branch access |
| Trainer Owner | clients, sessions, coaching/nutrition, measurements/goals, packages/payments, tasks/templates, plan limits |
| PlatformAdmin | platform scope, explicit target tenant, plan/subscription/override/audit/backup controls |
| Member Portal | code lookup, own-member isolation, session expiry, membership/payments/attendance/feedback/requests |

## Security/regression cases

Cross-tenant IDs, stale branch/section, expired/suspended plan, feature false, limit reached, revoked session, malformed upload, replay/idempotency, rate limits, RLS, PII logging, and raw code/token persistence are blocking tests.

## Subscription request and notification contract cases

| Scenario | Required evidence |
| --- | --- |
| Gym request submit | Multipart with exactly one image/PDF proof returns pending request; duplicate in-flight submit is blocked; ambiguous timeout reconciles from history before retry. |
| Pending rules | Second completed pending request is rejected; incomplete pending request follows service completion contract; approve/reject is one-time and conflicts on stale state. |
| Proof | Gym can fetch only own tenant proof; PlatformAdmin uses separate route; body is actual image/PDF with correct content type; unauthenticated and cross-tenant access are rejected; no public storage fallback. |
| Transaction/failure | SQL failure compensates private object write; request/proof/audit/notification persistence is atomic; post-commit email failure does not report request failure or cause resubmission. |
| Notifications | New request generates PlatformAdmin and tenant audience events with `category=subscription`; recipient/audience is correct; unread count/list/read state persist; decision notification prompts authoritative refresh. |
| Review | PlatformAdmin-only queue/proof/approve/reject; approval requires proof and updates subscription; rejection persists decision; Gym receives resulting state and persistent notification. |
