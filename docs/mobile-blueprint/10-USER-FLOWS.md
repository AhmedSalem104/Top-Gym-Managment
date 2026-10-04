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
2. Web uses `POST /api/auth/login`; native mobile uses `POST /api/mobile/auth/login`.
3. Server verifies the same scrypt password and active user. Web receives a server-side session cookie; native mobile receives a short-lived bearer access token and rotating refresh token.
4. Fetch session/bootstrap/effective entitlements.
5. Resolve tenant type: Gym shell or Trainer Studio; PlatformAdmin goes to platform shell.
6. Resolve branch/section context only from server-provided accessible values.

Native mobile restore calls `GET /api/mobile/auth/session` with the bearer access token. A `401` triggers one refresh attempt; invalid refresh state clears secure storage and returns to login. Logout revokes both server-side mobile sessions before local secure cleanup.

## Gym critical flows

- Member: search/list → detail → membership/payment/action; each mutation is permission, entitlement, scope, and service validated.
- Attendance: select branch/section → today/report → check-in/out; server owns current state and auto-checkout semantics.
- Attendance QR: authorized staff may obtain the stable tenant/member-bound opaque token (`GET /api/attendance/qr/:id`), scan it, resolve it under the current tenant (`POST /api/attendance/resolve-qr`), show minimal member and today's state, then submit the unchanged QR token to the existing check-in/out endpoint. The server revalidates eligibility and branch/section. Legacy readable/numeric formats remain compatibility-only; digital cards never issue them.
- Tenant-branded member card: after successful member creation, successful membership renewal, or from member details, authorized staff obtain the attendance token (never membership-code reveal), compose a card from current published tenant branding and current member/membership data, then preview/download or use native file sharing. WhatsApp fallback downloads the image and opens a prepared tenant-branded message; staff attaches and sends manually. Share failure never changes member/renewal success, and opening WhatsApp does not mean sent. Missing optional membership data is omitted; the QR only identifies a tenant-scoped member and never grants attendance authorization.
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

## Gym subscription request and secure proof preview

1. Owner loads plan/term options and request history from the authenticated tenant context. Before opening create UI, read the latest request (`GET /api/saas/subscription-requests?page=1&pageSize=1`). If it is `pending`, present plan, duration, amount, submitted date, proof status, and status; do not expose create/submit controls.
2. With no pending request, Owner selects a plan and an active duration from the server catalog, sees catalog pricing, enters optional notes, and attaches one supported image/PDF proof. Submit one `multipart/form-data` request to `POST /api/saas/subscription-requests/submit` with plan, term code, notes, and proof (never a trusted client amount).
3. Lock the client submit immediately and prevent modal dismissal while in flight. Server serializes same-tenant submissions with a tenant-row lock and the filtered unique index. Only after API success, close/reset the create form, show confirmation, and transition immediately to pending state; refresh history afterward without delaying that transition. On other errors, retain the draft where safe. A `409 SAAS_REQUEST_ALREADY_PENDING` refreshes the latest request and transitions to its pending state.
4. The request remains `pending` until Platform Admin review. History shows the persisted duration and expected amount. Approval or rejection releases the tenant to submit a later request. On an ambiguous timeout, reload latest history before retrying; this endpoint has no explicit idempotency-key contract.
5. Preview proof through authenticated `GET /api/saas/payment-proofs/:id/file`; render by returned content type (image/PDF). Never use a public storage URL or treat a proof ID as authorization.

## Platform Admin subscription review and Gym result

1. A committed new request creates persisted `subscription` notifications for PlatformAdmin (`saas_subscription_request_created`) and the tenant Owner/Assistant (`saas_subscription_request_submitted`). The Admin event also invokes the configured email path after commit.
2. Platform Admin reads the queue and persisted unread count/list, opens the request, and fetches proof through the PlatformAdmin-only proof endpoint.
3. Platform Admin sees tenant, requested plan, persisted duration, amount, proof, and status, then approves or rejects once. Approval requires valid proof and revalidates current term pricing. It applies the persisted duration to subscription snapshots and, when replacing an unexpired paid reviewed-payment subscription (`active` or `suspended`), appends the term to `max(approval time, current paid expires_at)`; trial/expired/absent/complimentary subscriptions do not contribute time. A scheduled change remains scoped to its original subscription and does not change the new expiry. Rejection records the decision. Concurrent/repeated review is a conflict.
4. The Gym receives a persistent `subscription` approved/rejected notification and refreshes unread state, request history, and effective subscription from the server. Notification is not an entitlement grant.

Notification APIs include `GET /api/notifications` (`category=subscription`, `unreadOnly`), `/unread-count`, `/:id/read`, `/read-all`, and the existing stream. Recipient, role, and tenant scope are server-derived.

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
| subscription submit timeout | outcome ambiguous; inspect tenant history before retry | never blindly resubmit; server pending uniqueness is authoritative |
| subscription proof denied/missing | `401`/`403` or scoped `404` | no public-storage fallback; do not reveal cross-tenant existence |
| subscription already pending/reviewed | `409 SAAS_REQUEST_ALREADY_PENDING` / `SAAS_REQUEST_ALREADY_REVIEWED` | reload request/review state; do not repeat mutation |
| admin email delivery failure | request remains committed; email is post-commit | preserve success/pending state; do not ask the Gym to resubmit |
| partial failure | endpoint-specific response | show per-region status; do not report mutation success optimistically |
