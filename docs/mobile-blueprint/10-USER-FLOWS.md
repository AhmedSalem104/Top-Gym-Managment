# 10 — User Flows

## Shared cold start and session restore

```text
Launch
 -> load secure session reference
 -> GET /api/auth/session or portal session
 -> if staff: resolve tenant/type/subscription/entitlements/permissions/bootstrap
 -> if portal: restore portal session and member-scoped payload
 -> choose workspace/context
 -> render allowed navigation
```

No session → login or portal code entry. Expired/revoked session → clear secure state and return to entry. Never treat cached permissions as an authenticated session.

## Staff login

1. Validate email/password locally for form UX.
2. `POST /api/auth/login`.
3. Server verifies scrypt password, active user, creates server-side session cookie.
4. Fetch session/bootstrap/effective entitlements.
5. Resolve tenant type: Gym shell or Trainer Studio; PlatformAdmin goes to platform shell.
6. Resolve branch/section context only from server-provided accessible values.

## Gym critical flows

- Member: search/list → detail → membership/payment/action; each mutation is permission, entitlement, scope, and service validated.
- Attendance: select branch/section → today/report → check-in/out; server owns current state and auto-checkout semantics.
- Branch switch: invalidate branch-scoped member, attendance, finance, inventory, and dashboard queries; refetch with server context.
- Payment/proof: display server amount/status; upload proof only through validated private-storage endpoint; never infer paid state from optimistic UI.

## Trainer critical flows

Trainer login → independent tenant resolution → effective plan/entitlements → workspace → clients/sessions/coaching. Client and session operations carry opaque ids and server scope. Package/payment/refund actions require their distinct permissions. Template instantiation must use the server’s member/client validation.

## Member Portal

```text
Code entry
 -> POST /api/member-portal/lookup
 -> server HMAC resolves owning tenant/member
 -> portal session established
 -> GET /api/member-portal/session
 -> member-scoped portal data
```

Invalid/revoked/expired code → safe error and no session. Portal session expiry → return to code entry. Feedback/subscription request/proof flows validate scope and rate limits server-side.

## Platform Admin

Login at `/platform-admin` → platform session → overview → select explicit tenant → inspect/change only through platform routes. Plan status/compatibility/override changes are audited and must not be hidden behind mobile-only assumptions.

## Failure flows

| Condition | Current/server outcome | Mobile behavior |
| --- | --- | --- |
| feature not included | `403 SAAS_FEATURE_NOT_INCLUDED` | show unavailable state and plan/recovery link if allowed |
| permission denied | `403` | hide/disable action but preserve server error handling |
| limit reached | domain limit error | explain current usage/limit; no client bypass |
| expired/suspended | subscription/tenant guard, often `402` or `403` | show recovery surface; retain allowed history |
| stale branch/section | scope/not-found/error | clear stale context, refetch accessible contexts |
| network timeout | transport failure | retry idempotent reads; preserve unsent form safely |
| upload failure | storage/validation error | retain local draft only if safe; retry upload with new validation |
| partial failure | endpoint-specific response | show per-region status; do not report mutation success optimistically |
