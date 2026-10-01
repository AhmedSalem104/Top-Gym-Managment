# MOB-001 — Native mobile session transport

## Status

Accepted — 2026-10-01

## Decision

Keep the existing web `HttpOnly` cookie session unchanged and add a native-only bearer contract:

- short-lived access token backed by the existing hashed `gym_auth_sessions` table;
- rotating refresh token backed by the additive `gym_mobile_refresh_sessions` table;
- server-derived session envelope for restore;
- explicit revocation on logout.

The table is provisioned by the official additive migration
`database/migrations/040-mobile-refresh-sessions.sql`; application startup does
not perform this mobile-session DDL.

The React Native client stores only the access and refresh tokens in the platform secure store. Passwords, tokens, and tenant authorization decisions are never stored in logs or source. The backend remains authoritative for user status, tenant context, permissions, entitlements, limits, and RLS context.

## Alternatives rejected

- Cookie jar adaptation: unreliable as the primary native transport and couples the client to browser behavior.
- Client-only or fake session state: unsafe and does not establish tenant/RLS context.
- Reusing a long-lived bearer token: weaker revocation and compromise window.

## Verification

The existing QA Owner account successfully completed mobile login, authenticated `/api/dashboard`, session restore after app restart, logout, and invalid-bearer rejection on the live Android emulator. Web routes remain on the original cookie contract.
