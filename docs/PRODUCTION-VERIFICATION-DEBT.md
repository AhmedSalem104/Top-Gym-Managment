# Production Verification Debt

This is the central list of evidence that cannot be honestly marked as passed
from source inspection or local build checks alone. A blocked subtask does not
stop safe implementation elsewhere, but a Critical item remains a Go-Live
gate.

Last reviewed: 2026-08-29  
Implementation revision covered: `24c6fb0 saas: make subscription rejection atomic`

## Status vocabulary

- `IMPLEMENTED`: the code/documentation exists and local checks cover it.
- `VERIFIED`: the required verification evidence exists in the allowed
  environment.
- `REQUIRES AUTHENTICATED VERIFICATION`: needs a real Local/Staging session.
- `REQUIRES STAGING VERIFICATION`: needs a safe shared Staging environment.
- `REQUIRES PRODUCTION VERIFICATION`: depends on the deployed infrastructure.
- `BLOCKED`: an external prerequisite is unavailable; do not claim success.
- `PENDING REAL-WORLD EVIDENCE`: requires actual pilot/capacity evidence.
- `LEGAL REVIEW REQUIRED`: implementation is not legal approval.

## Open evidence

| Phase | Requirement | Status | Why it is pending | What is needed / how to verify later | Severity / Go-Live impact |
| --- | --- | --- | --- | --- | --- |
| 1 | Authenticated `baseline-before.json` | `REQUIRES AUTHENTICATED VERIFICATION` | No safe Local/Staging session cookie is currently available. The runner must not auto-login or use a hard-coded session. | Set `QA_BASE_URL` and a session cookie in environment variables; run the read-only runner; retain only sanitized reports. | High; blocks evidence-based performance decisions. |
| 1 | Actual SQL execution plans and live index/workload audit | `REQUIRES STAGING VERIFICATION` | Plans, reads, cardinality and fragmentation cannot be inferred safely from source declarations. | Run measured priority routes against representative Staging data, capture Actual Plans/DMV evidence, then approve only justified indexes. | High; no speculative index changes allowed. |
| 2 | Production DB latency, size/growth, connection limits and live catalog | `REQUIRES STAGING/PRODUCTION VERIFICATION` | Hosted SQL capacity and latency are environment properties. | Run a non-destructive DB assessment on Staging, then repeat with approved read-only checks in Production. | Critical for capacity and Go-Live. |
| 2 | Migration rehearsal and rollback/restore rehearsal on a production-like copy | `REQUIRES STAGING VERIFICATION` | Local idempotency checks do not prove behavior on existing production data. | Snapshot/clone Staging, run migrations twice, verify schema/data, and rehearse rollback procedure without destructive Production changes. | Critical. |
| 3 | Vercel cold starts, function duration, memory, connection reuse and cache headers | `REQUIRES PRODUCTION VERIFICATION` | Local Express timing cannot prove Vercel instance behavior. | Deploy a staging/preview target, inspect function logs and headers, then verify Production after release. | High. |
| 3 | Production runtime/env/secret configuration | `REQUIRES PRODUCTION VERIFICATION` | Secrets and deployment settings are intentionally not read or committed from this workspace. | Verify Vercel env scopes, Node 24 runtime, secret rotation and deployment smoke checks in the provider dashboard. | Critical. |
| 4 | Real private Object Storage provider for proofs/backups/branding/exports | `BLOCKED` | No approved provider credentials are available; current DB-backed paths must not be falsely described as external storage. | Select/configure an approved provider, test private keys, signed URLs, MIME/size limits, tenant prefixes, deletion and recovery on Staging. | High. |
| 5 | Distributed rate limiting active across Serverless instances | `BLOCKED` | In-memory guards are process-local; no shared backend is configured. | Provision/configure an approved shared backend and run multi-instance tests for IP/user/tenant quotas and fail-safe behavior. | High for public/abuse-prone endpoints. |
| 6 | External security verification (CSRF, XSS, IDOR, upload, auth bypass, escalation) | `REQUIRES STAGING VERIFICATION` | Static review and local QA are not a penetration test. | Use synthetic tenants/accounts on Staging, execute the documented attack matrix, review findings and retest fixes. | Critical. |
| 7 | Authenticated Tenant A/B cross-tenant attack matrix | `REQUIRES AUTHENTICATED VERIFICATION` | Current automated tenancy QA verifies RLS/schema behavior but does not replace full authenticated endpoint mutation/read testing. | Create two disposable Staging tenants and test GET/POST/PATCH/DELETE with valid foreign IDs across all domains; preserve only pass/fail evidence. | Critical. |
| 8 | Central log shipping, alert delivery and incident correlation | `REQUIRES PRODUCTION VERIFICATION` | Local safe logs and request instrumentation exist; production metrics now require an explicit dual opt-in, but provider alert routing is not proven. | Trigger a synthetic error in Staging/preview, confirm request ID correlation, metrics volume and alert routing without sensitive data. | High. |
| 9 | Backup restore integrity test | `BLOCKED` | A real restore into a non-Production environment has not been performed in this workspace. | Restore an encrypted backup to an isolated database, verify relationships, tenant rows, login/access and critical records; record RPO/RTO. | Critical; backup without restore evidence is not a Go-Live pass. |
| 10–12 | Full SaaS lifecycle with real authenticated roles | `REQUIRES AUTHENTICATED VERIFICATION` | Trial/request/proof/review/approve/expire/grace/renew/reactivate needs a safe staged workflow. | Run the complete lifecycle with disposable tenants and payment-proof fixtures; verify snapshots, duplicate protection and audit events. | Critical. |
| 13 | Email/WhatsApp/SMS delivery provider | `BLOCKED` | No delivery provider is configured and no purchase/activation is authorized in this task. | Configure an approved adapter later; test event-to-delivery separation, retries, opt-out and provider failure behavior. | Medium now; High if notifications are marketed as live. |
| 14 | Final Terms, Privacy, cancellation/refund and retention text | `LEGAL REVIEW REQUIRED` | Screens/routes can be prepared, but legal wording is not an engineering approval. | Obtain jurisdiction-appropriate legal review, publish versioned documents and test consent/version records where required. | Critical commercial gate. |
| 15 | New Gym onboarding happy path | `REQUIRES AUTHENTICATED VERIFICATION` | The flow must be proven end-to-end with a disposable Gym, not only by route/build checks. | PlatformAdmin creates Gym → Owner/Trial → login → branding → dashboard; verify no Top Gym data/branding leakage. | High. |
| 16 | Real custom subdomain DNS/TLS and Host resolution | `REQUIRES PRODUCTION VERIFICATION` | Local host mapping is not proof of DNS, TLS, wildcard certificates or Host-header safety. | Test an approved staging domain, then verify DNS/TLS/canonical host behavior on the real domain. | High. |
| 17 | Versioned mobile API contract/OpenAPI and mobile auth integration | `IMPLEMENTED` for existing API readiness only; integration pending | Flutter is intentionally not being built in this cycle; a real mobile client has not exercised the contract. | Publish/validate `/api/v1` contract, run contract tests and later integrate a non-Production client with access/refresh token tests. | Medium now; required before mobile launch. |
| 18 | External Generative AI provider, quota/cost/privacy verification | `NOT STARTED` / current Hybrid Rules remains separate | No paid LLM or external provider is enabled; current intelligence must not be marketed as Generative AI. | If approved later, configure provider adapter, redaction, tenant quotas, timeout/retry and cost tests on synthetic data. | Medium; not a blocker for current Rules Intelligence. |
| 19 | Synthetic multi-tenant load test | `PENDING REAL-WORLD EVIDENCE` | No load test may run against Production, and the authenticated target/fixture environment is not ready. | Generate synthetic tenants/data and test progressively in isolated Staging; stop on unsafe DB pressure or error spikes. | Critical for capacity claims. |
| 20 | Tested capacity and first bottleneck | `PENDING REAL-WORLD EVIDENCE` | Capacity cannot be estimated from code or the current un-authenticated state. | Publish tenants/members/concurrency/RPS/p50/p95/p99/error/DB/connection results from the load run. | Critical; no scale claim without it. |
| 21 | Final Go-Live checklist | `PENDING REAL-WORLD EVIDENCE` | Critical debt above is still open. | Reconcile every item as PASS/FAIL/BLOCKED/REQUIRES PRODUCTION VERIFICATION and make a Go/Conditional Go/No-Go decision. | Critical. |
| 22 | Real pilot with 5–10 gyms | `PENDING REAL-WORLD EVIDENCE` | Pilot controls can be prepared, but no real pilot evidence exists. | Run controlled pilot, monitor incidents/support/latency/storage and document rollback/feedback. | Critical before broad launch. |
| 23 | Scale-up gate (25/50/100 gyms) | `PENDING REAL-WORLD EVIDENCE` | No pilot or capacity evidence exists. | Decide from uptime, p95/p99, errors, DB load, incidents, support volume and storage growth. | Critical; `PENDING PILOT EVIDENCE`. |

## Current Phase 1 truth

- Phase 1 remains `IN PROGRESS`.
- Static query/index/payload audit: documented.
- Baseline runner: verified by unit tests and safety guards.
- Authenticated real baseline: pending.
- `baseline-before.json`: **not produced**.
- Execution Plans/index changes: intentionally deferred.

## Current Phase 2 truth

- Static migration safety gate: `VERIFIED` locally with `npm run qa:database`.
- SaaS pending-request integrity guard: `VERIFIED` locally; duplicate pending
  requests are rejected by an application pre-check and a guarded filtered
  unique index, while existing duplicate data fails preflight safely.
- Pool timeout bounds, stale-pool recovery and close coordination: `VERIFIED`
  by unit/source checks; live database saturation and reconnect behavior remain
  environment evidence.
- Transaction cleanup ordering: `VERIFIED` with begin/callback/commit/rollback
  failure tests; a real database failure rehearsal remains pending.
- SaaS subscription rejection now updates the request and its platform audit
  record inside one guarded transaction; the full authenticated lifecycle
  rehearsal remains pending.
- Migration target safety: `VERIFIED` locally; ambiguous external targets fail
  before database access, staging is explicit, and Production requires an exact
  confirmation value. Provider-side migration rehearsal remains pending.
- Migration idempotency on an existing database, schema diff, and rollback via
  restore: `REQUIRES STAGING VERIFICATION`.

The Phase 2 local work does not promote migration, capacity, timeout or restore
claims to Production evidence. Those items remain listed above exactly once.

## Latest local verification evidence

- `npm run build`: passed; only the repository's existing `!important` review
  warnings remain.
- `npm run qa:gate`: passed.
- `npm run qa:tenancy`: passed with 63/63 protected tables,
  `unassignedRows=0`, and `crossTenantWriteBlocked=true`.
- `npm run qa:database`: passed with guarded/non-destructive migrations,
  runner/pool/transaction checks, runtime schema checks and SaaS integrity
  checks; live schema rehearsal remains pending.
- `npm run test:unit`: passed 73/73, including safe internal-error logging,
  baseline safety, pool/transaction behavior, SaaS duplicate-request guards
  and atomic subscription rejection coverage.
- Platform subscription request reads are now bounded and server-paginated;
  Platform Admin can move through the queue without loading the full request
  history into one response.
- Tenant subscription history and Platform Admin tenant-profile payment
  history are also bounded and server-paginated; post-write reads target the
  affected request instead of reloading the full history.
- `npm run test:visual` against a temporary local QA server: passed for all
  tested desktop/mobile viewports, dialogs, themes and print media.
- `npm run qa:platform-admin`: safely skipped live authentication because no
  PlatformAdmin credentials are configured in this environment.
- `node --test tests/unit/error-response.test.js tests/unit/health.test.js
  tests/unit/file-upload-validation.test.js tests/unit/branding-upload-security.test.js`:
  passed; 5xx responses and backup audit details no longer expose internal
  operation messages.
- Targeted report/baseline tests: passed; the report read-only flag is now
  supplied outside user query parameters.
- Background operation logs now retain only bounded error codes; raw SQL,
  filesystem and driver messages are not emitted by the audited coaching,
  intelligence and tenancy migration paths.
- Standalone server lifecycle: `VERIFIED` by source/unit checks for HTTP
  listener and SQL-pool shutdown; Vercel lifecycle behavior remains a
  production verification item.
- State-changing requests reject browser Fetch Metadata marked as
  `cross-site`; Origin/SameSite and external CSRF verification remain required
  for a full security sign-off.
- HTTPS security headers include conditional HSTS; actual proxy/TLS behavior
  still requires deployment verification.
- `/api/health/live` is a local/source-verified tenant-neutral liveness probe;
  provider routing and alerting still require deployment verification.

These local results do not close the authenticated baseline, live execution
plans, Staging/Production capacity, restore, or pilot evidence items above.

## Go-Live rule

No `GO` recommendation is allowed while a Critical Go-Live item is still
`BLOCKED`, `REQUIRES AUTHENTICATED VERIFICATION`, `REQUIRES STAGING
VERIFICATION`, `REQUIRES PRODUCTION VERIFICATION` or `PENDING REAL-WORLD
EVIDENCE`. This debt list must be updated with evidence links or sanitized
artifacts as each prerequisite becomes available.
