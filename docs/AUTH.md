# TOP GYM Authentication

## Bootstrap

The first `Owner` account is created once when the authentication tables are ready. Set these server-side environment variables before the first deployment:

```text
AUTH_OWNER_EMAIL=owner@example.com
AUTH_OWNER_NAME=TOP GYM Owner
AUTH_OWNER_PASSWORD=<long-random-password>
AUTH_SESSION_DAYS=7
```

The bootstrap password is only used to create the first account. It is never returned by an API and is stored only as a password hash.

## Model

Authentication uses two SQL Server tables:

- `dbo.gym_users`: `id`, `full_name`, `email`, `email_normalized`, `password_hash`, `role`, `status`, login timestamps.
- `dbo.gym_auth_sessions`: a random session token hash, user id, expiry, revocation timestamp, and request metadata.

Supported roles are `Owner` and `Assistant`. Owners are always `Active`; assistants can be `Active` or `Disabled`.

Passwords use Node.js built-in `crypto.scrypt` with a per-user random salt and a timing-safe comparison. The browser receives an `HttpOnly`, `SameSite=Lax` session cookie; it never receives a password, password hash, role token, or permission source of truth. Sessions are stored server-side, expire after `AUTH_SESSION_DAYS`, and are revoked on logout, assistant disable, and password reset.

## Permissions

- `Owner`: all eight application tabs plus account management.
- `Assistant`: `المشتركون`, `متدرب خارجى`, `الحضور والانصراف`, and `المكتبة`, including the coaching operations attached to client records. Finance, dashboard analytics, pricing management, reports, backups, and user management are denied by the backend.

The frontend hides unavailable tabs for usability only. Every protected API request is authorized again on the backend.

## Endpoints

- `GET /api/auth/session`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- Owner only: `GET/POST/PUT /api/auth/users` and `PATCH /api/auth/users/:id/status`

Login failures use a generic message. Disabled accounts receive a dedicated disabled-account message. Login attempts are rate-limited per IP/email pair.
