# 13 — Security Model

## Current server authority

Staff authentication uses scrypt password verification, random server-side sessions, SHA-256 token hashes in `gym_auth_sessions`, HttpOnly SameSite cookies, expiry/revocation, active-user checks, rate limiting, same-origin protections, and safe error responses (`src/services/auth-service.js`, `src/middleware/auth.middleware.js`). Production cookies are Secure.

Member Portal uses a separate membership-code HMAC lookup and portal session secret/ring. Raw codes are not logged; encrypted owner-reveal material and audit rows are stored for controlled owner flows.

## Mobile threat model

Threats include stolen device, rooted/jailbroken device, token theft, replay, tenant/branch ID tampering, stale entitlement cache, deep-link injection, malicious uploads, PII leakage in logs/screenshots, network interception, notification previews, and offline database extraction.

## Rules

- The backend remains the final authorization authority.
- Use platform secure storage for refresh/session material only after an approved transport contract; never put secrets, portal codes, or credentials in ordinary storage/logs.
- Logout must revoke/clear server session and wipe scoped caches.
- Tenant/branch/section identifiers are hints; server revalidates ownership/access and RLS context.
- Entitlement/permission changes invalidate cached navigation and data; cached true cannot grant access.
- Deep links must carry non-sensitive references and reauthenticate/re-resolve context.
- Uploads use server MIME/signature/size validation and private storage; no bucket credentials in the app.
- Redact PII, tokens, codes, request bodies, and auth headers from telemetry.
- Consider screenshot blocking only for explicitly sensitive surfaces; do not claim it as a server security boundary.
- Certificate pinning/root detection are risk decisions, not substitutes for TLS/backend auth; record them in an ADR if adopted.
