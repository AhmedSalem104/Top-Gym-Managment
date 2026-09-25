# 14 — Data, Caching, and Offline

## Conservative classification

| Data | Classification | Reason |
| --- | --- | --- |
| Passwords, session secrets, cookies/tokens, raw portal codes | NEVER_PERSIST in ordinary app storage | Authentication/security material. |
| Secure session reference and device registration material if later approved | SECURE_PERSIST | Platform secure storage only; server revocation remains authoritative. |
| Effective entitlements/permissions | SHORT_CACHE | Useful for UI bootstrap; never an authorization grant. |
| Tenant/branch/section directory | SHORT_CACHE | Scope changes invalidate it. |
| Member/client lists and read-only details | SHORT_CACHE / OFFLINE_READABLE only after privacy review | PII and scope-sensitive. |
| Reports/library/catalog data | SHORT_CACHE or LONG_CACHE by sensitivity/volatility | No access decision may rely on stale values. |
| Financial balances, payment statuses, subscription status | SHORT_CACHE | Must revalidate before display of current truth or mutation. |
| Draft forms with no sensitive payload | SHORT_CACHE | Explicit per-feature policy; discard on logout/context change. |
| Payment proofs, private files, portal member data | NEVER_PERSIST by default | Sensitive/private data and storage contracts. |
| Mutations | OFFLINE_MUTATION_ALLOWED = none initially | Server has idempotency/atomicity contracts that require online authority. |

## Invalidation events

Logout, session expiry, tenant change, branch change, section change, permission change, subscription/plan/entitlement change, user switch, portal-code session expiry, and server 401/403/feature-denied responses invalidate relevant caches. A tenant or branch switch must clear all prior scoped query keys before rendering new data.

## Offline behavior

Offline mode is read-only and explicit. Show last-updated timestamps and stale state; do not let an offline cache create/check-in/pay/refund/freeze/renew/approve/permission-change or bypass plan limits. Queueing a mutation is not approved until each endpoint has an idempotency and conflict contract.
