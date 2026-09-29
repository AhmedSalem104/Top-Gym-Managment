# 04 — Business Rules

This document records current behavior as rules, not UI labels. Sources are listed per section; application services remain executable truth.

## Tenant lifecycle

- Canonical tenant types are `gym` and `independent_trainer` (`src/tenancy/tenant-types.js`, migration 014).
- Existing legacy tenants are backfilled to `gym`.
- Tenant statuses include operational `trial`/`active` and non-operational `expired`/`suspended`/`archived` according to `saas-service.js` and schema checks. Expiry reconciliation marks active/trial subscriptions and tenants expired when dates pass.
- Archived tenants are blocked from login/operation; expired/suspended data is retained and recovery/billing paths remain available where explicitly allowed.

## Subscription and plan rules

- A subscription has current status plus snapshot values for term, price, limits, and features (`src/services/saas-service.js`, migrations 011/015/030/036).
- Plan compatibility is explicit by tenant type; incompatible plan changes fail closed.
- Scheduled changes are applied under transaction/locking rules and must remain compatible.
- Plan lifecycle values are active, disabled, archived; hard deletion is not the normal model.
- Effective access is: trusted tenant type → implemented capabilities → compatible plan → snapshot/features → tenant overrides → user permission. Subscription status gates operational capability.

## Branches and sections

- Branches are a core Gym capability; they are not a commercial add-on for Independent Trainer tenants (`feature-catalog.js`, branch services, migration 037).
- `maxBranches` is sourced from the current plan for the core branch contract; other limits use subscription snapshot semantics unless the service explicitly says otherwise.
- Branch, membership, attendance, commerce, finance and user-access records carry tenant/branch scope where defined.
- Sections belong to a branch. Membership section access and attendance section IDs must remain tenant/branch consistent (migration 029, `branch-service.js`).
- A selected branch must not cause a member row to display an unrelated or fabricated membership; branch switch refreshes authoritative data.

## Members and memberships

- Members and memberships are tenant-scoped; branch/section eligibility is a separate scope layer.
- Membership creation/update can include pricing, term, payment and branch access and is guarded by permissions and financial semantics.
- Freeze/resume/renew/refund are explicit transitions; permissions and validation are service-owned.
- Membership code issuance/reveal/resend/rotate is an audited security flow; the raw code is not logged.

## Finance and payments

- `financial-ledger-service.js` defines actual collection/refund semantics. A migrated subscription snapshot linked to a `gym_payments` source is not a second cash event when the matching append-only payment transaction is proven.
- Historical ledger rows are preserved. New branch attribution uses validated membership scope; historical null branch IDs are not bulk-attributed by runtime code.
- Payment proofs are validated by MIME/signature/size and stored through private object storage metadata; proof approval is a Platform Admin review flow.

## Attendance and day passes

- Attendance check-in/out is tenant/branch/section scoped and permission-protected; scheduled auto-checkout is a separate server job.
- Day passes have pricing/list/summary/create/update/void and WhatsApp-opened state; writes are Gym-scoped and permission-checked.

## Trainer rules

- Trainer routes are available only to `independent_trainer` tenants. Client, training, nutrition, measurement, check-in, goals, session, package, payment, task, template and AI operations are tenant/client scoped and permission/entitlement/limit guarded.
- `maxClients` is the trainer client limit; legacy plans may fall back to `maxMembers`.
- Package purchases, payments and refunds are separate commercial operations; session status changes and client timeline are distinct coaching operations.

## Member Portal rules

- Portal lookup uses a membership code, resolves the code owner by HMAC, then performs tenant-scoped reads. It does not accept a tenant slug as an authorization grant.
- Portal sessions are separate from staff sessions and expire. The portal exposes only the member’s own scoped view.
- Portal notifications, feedback, subscription requests and proof uploads are separate contracts with rate limits and audit/validation where applicable.

## Phone rules

- Current UI input is Egyptian local mobile format; backend canonical storage/search is E.164 through `src/services/phone-service.js` and the generated/browser formatter.
- Formatting is presentation-only. Duplicate detection and lookup normalize before comparison.
- Do not add country selection or infer country from GPS/IP in mobile without a new reviewed contract; current source has an optional server-side IP signal but the current UI contract is Egypt-first.

## Uploads, WhatsApp, notifications

- Uploads require validated type/size/signature and private storage; mobile must use multipart/approved upload contracts, not public filesystem assumptions.
- WhatsApp behavior is link/template rendering and audited open/send-related state; no server-side WhatsApp provider contract is inferred from a browser link.
- Staff and member notifications are tenant/recipient scoped; read state is explicit and notification tables avoid SQL Server multiple cascade paths.

## Atomicity/idempotency

Transactions are used for membership/payment/subscription/branch and other multi-row operations where the service requires them. Trainer tasks/templates and selected writes carry idempotency keys. Mobile must preserve server-provided idempotency behavior and retry only documented safe operations.

## SaaS subscription request + proof lifecycle

- An authenticated tenant Owner submits a plan/term request with exactly one payment-proof file through `POST /api/saas/subscription-requests/submit` as multipart data. Supported images/PDFs are checked by declared type, signature, and the 4 MiB size limit.
- The client contract is atomic: success is returned only after request, proof metadata, audit entry, and notification records commit. Private storage is written and verified before the SQL transaction; storage is compensated if the transaction fails. The client must not report success before the API response.
- Each tenant can have at most one request in canonical `pending` status. Any existing pending row blocks a new request even if it has no proof metadata; it is never repurposed as a new request. The service locks the tenant row before checking pending state, while the filtered unique tenant index is the final database guard against concurrent requests. Clients show the persisted pending request instead of create UI, prevent in-flight duplicate submits, and reconcile an ambiguous timeout against latest request history before retry because there is no idempotency-key contract. Only approval or rejection releases the tenant to submit another request. `under_review` is not a persisted status in the current schema.
- Lifecycle is `pending -> approved | rejected`, once only. Approval requires valid proof and changes subscription state; rejection records the decision. Repeated/concurrent review is rejected.
- Gym proof reads are authenticated and tenant-scoped. Files remain private and return validated image/PDF content inline; a public storage URL is not an authorization mechanism. Platform Admin uses separately authorized review and proof endpoints.
- Successful submission persists notifications for PlatformAdmin (`saas_subscription_request_created`) and tenant Owner/Assistant (`saas_subscription_request_submitted`) with category `subscription`. Approval/rejection produces a persistent tenant decision notification in the same category. Read/unread state is server-persisted.
- Admin email is a post-commit side effect to the configured administrative recipient. Mail failure must not roll back a valid pending request or be reported to the Gym as submission failure; it is safely recorded and does not change request state.
- Registration and in-app subscription requests share active terms from `saas_plan_terms` and the shared server pricing function. `amountDue = max(0, roundMoney(price) - roundMoney(discountAmount))`; client-supplied amount is not accepted. Request amount/email reflect amount due, while the active subscription price snapshot retains the catalog term price according to the existing subscription snapshot contract.
- Approval rechecks current term and currency before applying the plan/duration. If pricing changed, `409 SAAS_TERM_PRICE_CHANGED` prevents approval and requires a current-price request. Previously created pending requests at the current undiscounted catalog price remain reviewable; this compatibility does not affect new request pricing.
- When approval replaces a tenant subscription, an unexpired paid subscription created by the reviewed-payment flow (`status='active'` or `suspended`, `source='manual'`, positive `price_snapshot`) carries its remaining time forward: expiry is the selected term added to `max(approval time, current paid expires_at)`. Same-plan and different-plan requests follow the same rule; the approved plan takes effect immediately and its term is appended after the paid expiry. Trial, expired, absent, complimentary/admin, and bootstrap subscriptions do not contribute time, preventing unintended free extension. A pending scheduled plan change does not alter this expiry base and remains scoped to its referenced subscription; it does not change the newly inserted subscription.

## Failure rules

Missing/expired auth → `401`; forbidden role/permission → `403`; feature not included → `SAAS_FEATURE_NOT_INCLUDED`; incompatible tenant/plan → `SAAS_PLAN_TENANT_TYPE_MISMATCH`; wrong tenant type for Trainer → `TRAINER_ROUTE_NOT_FOUND`; missing tenant context fails closed. Error mapping must not expose SQL, stack traces, credentials, or connection strings.
