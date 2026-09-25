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
