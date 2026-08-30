# Security audit — static/local evidence

Last reviewed: 2026-08-29 (`72e96d8`)

This is an engineering audit of the repository and local tests. It is not a
penetration test and does not replace authenticated Staging verification.

## Verified locally

- SQL access uses parameter binding for request values; dynamic identifiers are
  selected from fixed allowlists or generated from known schema metadata.
- Session cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` in Production
  (or for an HTTPS request). Login creates a fresh random session token and
  stores only its SHA-256 digest.
- State-changing API requests enforce same-origin checks when `Origin` is
  supplied and now reject browser requests marked
  `Sec-Fetch-Site: cross-site`, including public state-changing routes before
  their allow-list handling.
- Payment-proof and branding uploads validate size, declared MIME and file
  signatures; SVG markup is checked for active/external content.
- The private object-storage boundary generates tenant-scoped keys, rejects
  traversal/cross-tenant access, validates checksum/size/MIME and fails closed
  until an approved provider is configured. It does not expose permanent
  public URLs.
- Rate-limit policy is separated from its storage backend. The bounded local
  adapter remains active, while an injectable atomic backend is ready for a
  future shared provider; backend failures do not silently bypass protection.
- Error responses and audited logs use bounded safe codes and do not emit
  passwords, cookies, tokens, SQL text or driver messages.
- Platform routes have a server-side `PlatformAdmin` boundary; tenant routes
  continue through tenant resolution, permissions and RLS context.
- HTTPS responses include HSTS with subdomain coverage; local HTTP responses do
  not set the policy accidentally.
- Tracked-environment and dependency checks pass locally.
- Synthetic seed and Tenant A/B verification tools now fail closed for
  unclassified or production-like databases; external Staging targets require
  explicit environment confirmation and a host allow-list.

## Findings and gates

| Finding | Severity | Status | Required action |
| --- | --- | --- | --- |
| Membership-code secret has compatibility fallbacks when the explicit secret is absent | High | Open / rollout-sensitive | Set a dedicated Production secret and execute a planned reissue/key migration; do not change it silently because existing encrypted codes may depend on the old source. |
| In-memory rate limits are process-local | High | Architecture ready, Production blocked | Configure and verify an approved shared backend before marketing protection across multiple Serverless instances. |
| CSRF/XSS/IDOR/auth-bypass attack matrix | Critical | Requires Staging verification | Run authenticated synthetic Tenant A/B and browser attack tests, then retest all findings. |
| SQL TLS certificate trust in deployment | High | Configuration requirement | Use `TrustServerCertificate=False` with a trusted certificate in Staging/Production and verify connectivity. |
| Private object storage and backup restore | Critical | Storage provider verified; isolated restore pending | Keep the private VPS provider active and complete an isolated restore rehearsal before Go-Live. |

## Verification boundary

No security `PASS` is claimed for external penetration testing, Production
secret rotation/operations, distributed rate limiting, or isolated restore
integrity until the corresponding evidence is recorded in
`docs/PRODUCTION-VERIFICATION-DEBT.md`. Private storage activation itself has
now been verified through the deployed Vercel-to-VPS path; restore rehearsal
remains a separate gate.
