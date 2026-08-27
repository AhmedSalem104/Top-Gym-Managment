# Authentication and authorization

## Flow

```text
POST /api/auth/login
  -> validate email/password
  -> scrypt verification
  -> create random server-side session
  -> store only SHA-256 token hash in SQL Server
  -> send HttpOnly SameSite=Lax cookie
```

Every protected request passes through `src/middleware/auth.middleware.js`. The middleware loads the session from SQL Server, verifies expiry/revocation and active user status, then applies the centralized role rules. Logout revokes the session record and clears the cookie.

## User model

`dbo.gym_users` contains `id`, `full_name`, legacy `username`, `email`, unique `email_normalized`, `password_hash`, `role`, `status`, `last_login_at`, `created_at`, and `updated_at`.

`dbo.gym_auth_sessions` contains the session id, user id, token hash, expiry, revocation time, request metadata, creation time and last-seen time.

## Passwords

Passwords are hashed with Node's built-in `crypto.scrypt` using a random 16-byte salt. The encoded value stores the algorithm parameters, salt and derived key. Comparisons use `crypto.timingSafeEqual`. Passwords and hashes are never returned to the browser.

## Bootstrap

Set these server-side variables before the first deployment if no Owner exists:

```text
AUTH_OWNER_EMAIL=owner@example.com
AUTH_OWNER_NAME=TOP GYM Owner
AUTH_OWNER_PASSWORD=<long-random-password>
AUTH_SESSION_DAYS=7
AUTH_PLATFORM_ADMIN_EMAIL=platform-admin@example.com
AUTH_PLATFORM_ADMIN_NAME=Platform Admin
AUTH_PLATFORM_ADMIN_PASSWORD=<long-random-platform-password>
DEFAULT_TENANT_SLUG=top-gym
```

The bootstrap password is used only to create the first Owner hash. It is not an API response and should not be stored in source control.

Platform Admin signs in separately at `/platform-admin`. Its session and login
endpoints are tenant-neutral; `DEFAULT_TENANT_SLUG` is not used to grant a
PlatformAdmin access to Top Gym data. Tenant actions from the platform console
always include an explicit tenant id and pass through the server-side
`PlatformAdmin` guard.

## Repository boundaries

- `src/services/auth-service.js`: validation, hashing, login rules, safe user mapping, cookies and authorization facade.
- `src/repositories/user.repository.js`: user SQL operations.
- `src/repositories/session.repository.js`: session SQL operations.
- `src/middleware/auth.middleware.js`: request authentication and same-origin checks.
- `src/permissions/role-permissions.js`: role and route policy.

## Security properties

- Generic invalid-credential message.
- Disabled accounts are rejected.
- Session cookie is `HttpOnly`, `SameSite=Lax`, and `Secure` in production.
- Login and sensitive API rate limits are applied in middleware.
- Non-safe cross-origin state-changing requests are rejected.
- Assistant restrictions are enforced on the backend; hiding tabs is only UX.
- Session tokens, passwords and secrets are not logged or returned.
