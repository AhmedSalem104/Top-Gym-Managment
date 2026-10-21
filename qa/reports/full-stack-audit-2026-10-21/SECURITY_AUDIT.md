# Security audit (static source review)

## Positive controls observed

- `src/middleware/security.middleware.js`: disables `X-Powered-By`; emits `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, camera self-only Permissions-Policy; conditional HSTS on positively recognized HTTPS; JSON body limit 1MB; API responses `no-store`; static HTML revalidation and versioned asset immutable policy; compression.
- `src/services/auth-service.js`: password hashing uses scrypt (confirmed from source read), opaque random session tokens, hashed token storage through session repository, and session revocation. Cookie policy is documented/implemented with HttpOnly, SameSite=Lax and Secure for HTTPS (verify runtime proxy recognition).
- Parameterized SQL is the documented route; `src/database/pool.js` propagates tenant session context. `mssql` TLS encryption defaults true and certificate trust false.
- Production workflow includes `npm audit --audit-level=high`, tests, QA/build and canonical release entrypoint per repository standards.
- Upload/body sizes and backup limits exist in source/config; complete endpoint-by-endpoint upload review remains needed.

## Material concerns / verification

- The inspected security middleware does not set a Content-Security-Policy header. This is a static finding; determine whether CSP is set by Caddy/CDN or HTML meta before declaring absent in production. Introduce CSP only after inventorying inline scripts, external assets and report-only rollout.
- CSRF posture must be reviewed per cookie-authenticated mutation and actual SameSite/cross-origin deployment. No dynamic CSRF test was run.
- CORS policy, XSS sinks, IDOR, object-level permission checks, SSRF, upload content validation, secrets rotation, dependency advisories and session fixation require dedicated tests/review. Not certified here.
- Historical `docs/SECURITY-AUDIT.md` (2026-08-29) records legacy secret fallback/rollout sensitivity, process-local limits, CSRF/XSS/IDOR/auth matrix pending staging, SQL TLS requirements and restore rehearsal debt. These are historical notes, not evidence of current production configuration or exploitation.
- Mobile refresh race is detailed in `RACE_CONDITIONS.md`.

## Status

No DAST, SAST rerun, npm audit, penetration test, secrets scan, authenticated test, or production response-header check was executed. Security certification: **NOT VERIFIED**.
