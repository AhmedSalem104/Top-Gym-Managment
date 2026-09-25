# 11 — Technical Architecture

## Direction

The intended client is React Native + TypeScript. Expo is a candidate, not a settled dependency: the decision depends on private uploads, secure storage, deep links, notifications, native build/release requirements, and the final supported device matrix. See ADRs and `21-OPEN-QUESTIONS.md`.

## Proposed dependency direction

```text
screens/features
 -> application use-cases/view models
 -> central API/auth/context/capability services
 -> infrastructure adapters (HTTP, secure storage, persistence, notifications)
```

Suggested areas are `app`, `core`, `api`, `auth`, `navigation`, `design-system`, `features`, `services`, `stores`, `schemas`, `types`, `localization`, and `utils`; the final tree must be derived after API contract tooling is chosen.

## Central services

API client, auth/session, secure storage, tenant/branch/section context, effective entitlements/permissions, feature availability, limits, uploads, phone normalization/display, WhatsApp/deep links, notifications, localization, theme, logging/error mapping, network status, and cache invalidation are shared services. Feature modules may consume them but must not recreate them.

## Contract typing

The current server has no OpenAPI source. The mobile foundation should first create reviewed schemas/types from actual controllers/services/tests, then add contract tests. Transport DTOs should be separated from domain/view models to prevent web-shaped payloads from leaking into UI.

## Navigation and native concerns

Use native stack/tab/sheet primitives with explicit deep-link mapping. Handle safe areas, keyboard avoidance, Android back, iOS gestures, RTL direction, dynamic text, and file pickers as platform adapters. Web hash routes, DOM selectors, cookie assumptions, print/download behavior, and browser storage do not transfer directly.

## State ownership

Server state belongs to a query/cache layer with scope-aware keys. Ephemeral UI state belongs to feature/local state. Auth/session/security state belongs to the auth service. Tenant/branch/section changes invalidate scoped query keys before refetch.
