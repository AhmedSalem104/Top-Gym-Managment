# Logic Fit Codex Operating Instructions

## Leadership model

- The primary Codex session is the **Lead Agent** and owns the final technical decision.
- The Lead is responsible for architecture, dependency ordering, security review, integration, regression, release decisions, and the final report.
- When parallel work is useful, organize three specialist workstreams:
  1. **Backend / SQL / API** — services, repositories, transactions, request context, API contracts, and database performance.
  2. **Frontend / Runtime / Architecture** — screens, initialization, navigation, network behavior, rendering, product separation, and UX performance.
  3. **Infrastructure / Cache / QA** — Redis, storage, runtime operations, deployment verification, browser QA, and observability.
- Specialists provide findings, evidence, affected files, dependencies, risks, and tests to the Lead. They do not make independent architectural or release decisions.

## How agents work together

- Inspect the existing Logic Fit architecture before creating a new service, helper, API, or UI pattern.
- Respect the real ownership boundaries already present in the modular monolith: shared services and contracts are coordinated by the Lead; a shared file has one designated editor at a time.
- Do not make blind merges or overwrite another workstream's changes. The Lead reviews intent, diff, tests, security, compatibility, and measured benefit before integration.
- If a finding crosses workstream boundaries, hand it to the Lead for reassignment instead of implementing a parallel solution.
- Prefer small, evidence-based changes. Preserve existing APIs, business behavior, tenant isolation, RLS, permissions, capabilities, plans, branch/section scope, and product boundaries.

## Required execution loop

For every meaningful change:

`Inspect → Measure or reproduce → Identify root cause → Fix → Test → Re-measure → Integrate`

- A passing build alone is not performance evidence.
- Do not report a duplicate or bottleneck without fixing it when the safe fix is within scope.
- Keep before/after evidence for performance-sensitive changes.
- Use idempotent initialization, request deduplication, and shared context only when they match the existing runtime architecture.

## Safety and release rules

- Git is the source of truth. Do not hand-edit production files on the VPS.
- Never place secrets in source, Git, documentation, screenshots, logs, command arguments, or tracked environment files.
- Do not weaken authentication, tenant isolation, RLS, permissions, capabilities, plan enforcement, or session security for a test or optimization.
- Do not run destructive production operations, schema/migration/RLS changes, DNS changes, or high-risk infrastructure changes without the explicit approval required by the task.
- Before release, the Lead must isolate the intended files, inspect the staged diff, run applicable tests, scan for secrets, and verify the exact commit deployed.
- Preserve a rollback path and verify health, affected behavior, assets, console/network behavior, and security boundaries after deployment.

## SQL Server tenant/RLS inspection rule

- Any direct SQL Server inspection of tenant-scoped data must establish the same `tenant_id`, authenticated user context where relevant, and tenant/RLS session context used by the application request (including the effective tenant mode).
- A query executed in platform scope, without session context, or with a missing tenant context can be intentionally filtered by RLS and return a misleading zero; never treat that result as proof that the tenant has no data.
- Before reporting a tenant count, correlate the browser/API request with its resolved runtime, deployed SHA, tenant context, `DB_NAME()`, a non-secret database-server fingerprint, and the server-side service/query result.
- If the application tenant context cannot be reproduced safely, report the result as `NOT VERIFIED` rather than guessing or changing production data. These inspections remain read-only unless the task explicitly authorizes a separately reviewed mutation.

## Financial ledger truth

- `src/services/financial-ledger-service.js` is the shared semantic boundary for Gym membership collections. A migrated `subscription` snapshot linked to a `gym_payments` source is not a second cash event when the matching append-only `payment` transaction is proven by the full source/payment fingerprint and timestamps.
- Preserve every historical ledger row; do not delete or rewrite financial facts to correct reporting. Reporting paths must use the central actual-collection/refund semantics and the existing tenant/branch/section scope helpers.
- Gross collections include only non-voided positive collection transactions after migrated-snapshot exclusion. Explicit subscription refund adjustments are reported separately and reduce net once; outstanding balances and discounts are not cash collections.
- `branch_id` on newly created financial rows is assigned from the validated membership scope. Historical `branch_id IS NULL` rows require evidence-led review and must never be bulk-attributed by runtime code.
- Runtime member/payment requests may perform read-only schema readiness checks only. DDL, ledger backfills, and historical reconciliation belong to the approved migration/release pipeline.

## Specialist handoff format

## Production release and migration pipeline

- The canonical production release entry point is `npm run release:production`.
- When the user asks to deploy, publish, upload, or says `ارفع`, the Lead uses that pipeline when deployment access is available. Do not ask the user to run migrations manually.
- The pipeline is the single ordered flow: exact Git SHA preflight, local gates, release lock, official production backup and verification, migration-ledger discovery, manifest safety classification, only pending `SAFE_AUTOMATIC` migrations, RLS/Tenancy gate, immutable candidate health/smoke, cutover, exact-SHA verification, and rollback audit.
- The migration ledger remains the only source of truth for applied migrations. `database/migration-manifest.json` is safety/checksum metadata, never a second history store. Historical migrations must not be rerun because of filename order; migrations `029` and `030` are forbidden for the current release.
- Backup verification must use the existing Logic Fit backup/recovery service. A successful process exit without verified metadata, checksum, payload integrity, and coverage is not sufficient.
- The release lock covers backup, migration, and deployment together. A live concurrent lock fails closed; stale-lock recovery is explicit and auditable.
- Deployment uses the canonical SSH identity reference `logicfit-vps-admin` from local release configuration; private keys and secrets never enter Git, arguments, logs, docs, or tracked environment files.
- Agent 1 reviews database/migration/RLS/security gates, Agent 2 reviews feature/browser/UI smoke, and Agent 3 reviews backup/deployment/performance/rollback. The Lead integrates their evidence and makes the final release decision.
- A migration that is destructive, ambiguous, non-transactional, non-backward-compatible, or lacks verified recovery requires explicit review. Prefer expand/contract migrations so the previous application release remains runnable.

Each specialist reports to the Lead using:

`FINDING → ROOT CAUSE → PROPOSED FIX → FILES AFFECTED → DEPENDENCIES → RISKS → TESTS → BEFORE/AFTER EVIDENCE`

### Automatic production delivery

- A successful push/update to `main` is the Production deployment trigger.
- The Lead uses the existing `npm run release:production` pipeline; normal
  releases fetch the exact Git SHA on the VPS and do not SCP the full source
  archive or edit the running directory in place.
- The pipeline classifies code-only versus migration releases. Code-only
  releases skip unnecessary Production backup and migration work. Migration
  releases require the existing verified backup gate, authoritative ledger,
  manifest safety gate, RLS/Tenancy gate, candidate health/smoke, and exact-SHA
  cutover checks.
- The migration ledger remains the only applied-history source. Never infer
  pending state from filenames, never replay historical migrations, and never
  rerun 029 or 030.
- One release lock covers both migration and deployment. A concurrent release
  fails safely; the newest valid `main` SHA is allowed to proceed after the
  prior run finishes.
- GitHub Actions supplies only the encrypted CI SSH identity needed to invoke
  the runner. Private keys and secrets never enter source, Git, docs, logs,
  command output, or tracked environment files.
- A failed release leaves the prior healthy Production container running and
  preserves the prior immutable release for rollback. Manual SSH/publish
  instructions are emergency fallback only, not the normal path.

## Codex Agent Operating Policy

This section is a permanent operating reference for delegation, adaptive
agent routing, context discipline, token efficiency, and safe verification.
The existing security, SQL/RLS, financial-ledger, and production-release
rules above remain authoritative; where rules overlap, the stricter rule
applies.

### Operating priorities

- Optimize for correctness, security, data integrity, explicit user
  requirements, verification, maintainability, token efficiency, then speed.
- Token efficiency must remove waste, never required engineering work,
  security checks, tenant isolation, migration safety, or regression testing.
- The Lead Agent owns architecture, dependency ordering, security review,
  integration, regression, release decisions, and the final report.

### Orchestration and delegation

- The Lead should orchestrate non-trivial work: understand the request,
  search narrowly, classify risk, split separable workstreams, delegate when
  useful, collect compressed findings, implement the smallest correct change,
  verify, integrate, and review the final diff.
- Use the minimum necessary agents. Delegate before duplicating clearly
  separable exploration or specialist work; do not create agents for
  appearance or post-hoc review.
- Suitable workstreams include Frontend/Runtime, Backend/API, Database/SQL,
  Auth/Security, Performance, Infrastructure/Cache, UI/UX, Browser/E2E,
  Testing, Migration, and independent verification.
- Every workstream has one owner. Never let multiple agents edit the same
  shared file concurrently without explicit coordination.
- Specialists provide evidence, files, dependencies, risks, and tests; they
  do not make independent architecture or release decisions.

### Complexity and escalation

- Simple work: `Understand → Locate → Implement → Targeted Verify → Done`.
- Medium work: targeted exploration, specialist implementation when useful,
  related tests, and diff review.
- Complex or high-risk work: specialized exploration, compressed findings,
  smallest implementation, independent verification where warranted,
  regression, and final diff review.
- Use the least expensive reasoning level that is reliable. Escalate only for
  ambiguity, conflicting evidence, security/data risk, migration uncertainty,
  concurrency, or repeated meaningful failure.
- Do not retry the same failed action without inspecting and changing the
  diagnosis or evidence.

### Plan, explore, and hand off once

- Search before reading broadly. Use `rg`, `git grep`, symbols, routes,
  imports, references, and targeted file reads.
- Reuse confirmed findings. Do not make downstream agents repeat repository
  exploration unless evidence conflicts or the code changed materially.
- A confirmed plan is reusable; do not re-plan independently for every
  implementer.
- Pass compressed handoffs, not full transcripts:

  `Objective → Finding → Evidence → Files/symbols → Decision → Next action → Constraints → Verification`

- Default specialist output is:

  `Finding → Evidence → Files → Recommended action → Verification`

- Do not request chain-of-thought, oversized logs, full repository dumps, or
  repeated explanations of known architecture.

### Context and parallelism

- Give each agent only the objective, relevant facts/files, constraints,
  expected behavior, and required verification.
- Load context progressively: minimum context, attempt, identify missing
  evidence, then load only the needed sections.
- Run independent workstreams in parallel when safe; do not parallelize work
  with unresolved dependencies or conflicting editors.
- Maintain a compact working map of files, symbols, behavior, root cause,
  modifications, and verification status.

### Implementation discipline

- For meaningful changes use:

  `Inspect → Measure or reproduce → Identify root cause → Fix → Test → Re-measure → Integrate`

- Implement the smallest correct change. Do not add unrelated refactors,
  formatting churn, dependency changes, temporary artifacts, or scope
  expansion.
- Preserve existing APIs, business behavior, authentication, authorization,
  permissions, capabilities, plans, branch/section scope, RLS, tenant
  isolation, and product boundaries.
- Do not weaken a security or data-integrity control to unblock a test.

### Search, output, testing, and failure discipline

- Avoid duplicate reads and large raw output. Filter tests, builds, logs,
  SQL, Docker, and Git output to the evidence needed for the decision.
- Verify progressively:

  `Targeted Test → Related Suite → Build/Static Checks → Broader Regression when risk requires`

- A passing build alone is not performance or browser evidence.
- Use browser/E2E and visual verification for UI changes, server-side checks
  for permissions/entitlements, and transaction/migration gates for data
  changes.
- Never claim PASS without running the check. Use `NOT VERIFIED` when safe
  verification is unavailable.

### Git, production, and communication

- Git is the source of truth. After implementation review `git diff`, the
  affected files, dependency paths, targeted tests, secret scan, and
  `git diff --check` as appropriate.
- Do not use Production as a test environment. Prefer fixtures or QA data,
  preserve rollback paths, and follow the existing release pipeline.
- Do not deploy, mutate production data, run migrations, or alter schema/RLS
  without the explicit authorization and gates required by the task and the
  existing release rules above.
- Communicate briefly: report root cause, change, evidence, remaining risk,
  and production status. Do not narrate every command or repeat the request.

### Adaptive workflow and stop conditions

- Simple: `Understand → Search Narrowly → Implement → Targeted Verify → Diff → Report`.
- Medium: `Understand → Search → Split if Useful → Specialist → Implement → Tests → Diff → Report`.
- Complex: `Understand → Classify Risk → Split → Explore → Compress Findings → Implement → Verify → Regression → Diff → Report`.
- Stop a workstream when its objective/evidence is complete, it reaches
  another owner's dependency, it finds an escalation risk, or required safe
  information is unavailable.
- Do not continue exploring merely because more code exists.

### Permanent formula

`Understand + Search Narrowly + Delegate Before Duplicating Work + Right Specialist + Plan Once + Explore Once + Reuse Findings + Compress Handoffs + Parallelize Safely + Smallest Correct Change + Risk-Based Verification + Review Diff + Evidence-Based Report`

## Current UI Design Contract

The approved Logic Fit visual baseline is **TailAdmin/Tailwind — Calm Data
Workspace**, implemented in the existing HTML + Vanilla JavaScript stack.
TailAdmin is the primary visual reference; React, Next.js, and other UI
frameworks are not part of this project.

- Logic Fit remains Arabic-only and RTL-only: every product document, page,
  and shared component uses `<html lang="ar" dir="rtl">`.
- Preserve Logic Fit's blue/deep-navy identity and Cairo typography.
- Use semantic design tokens for color, typography, spacing, radius, borders,
  shadows, focus, status, motion, and responsive breakpoints. Themes change
  token values; feature CSS must not recreate component themes.
- Shared ownership is mandatory:

  `Tokens → Shared Component Foundation → Layout/App Shell → Feature Composition`

- Buttons, inputs, selects, cards, tables, modals, dropdowns, tabs, filters,
  pagination, navigation, statuses, and feedback states each have one visual
  owner and documented variants. The current shared CSS owners live in the
  Tailwind source and `shared-components.source.css`.
- Feature/page CSS is limited to composition, layout, and genuinely
  feature-specific content. It must not redefine shared component shells.
- Before creating CSS or a component, search for and reuse the existing shared
  owner. Extend a documented variant when needed; do not create a duplicate
  implementation or a page-specific patch layer.
- Do not add arbitrary overrides, specificity wars, or new `!important` rules.
  Legacy rules may be removed or scoped only after consumer and browser
  evidence proves they are no longer required.
- RTL is first-class and the only supported UI direction. Use logical CSS
  properties (`margin-inline`, `padding-inline`, `inset-inline`) where
  possible. Do not add LTR UI, language toggles, or LTR-only visual layouts.
- Responsive behavior must recompose at the established breakpoints and must
  remain usable from 1920px through 320px without overflow, clipping,
  overlap, or hidden actions.
- Light and dark themes must use the same component contract and semantic
  tokens. Interactive states require visible focus, keyboard support, adequate
  touch targets, accessible labels, and reduced-motion support.
- UI migration must preserve IDs, events, APIs, routes, business logic,
  permissions, entitlements, tenant isolation, RLS, authentication, phone
  behavior, and financial behavior.
- Every future UI change or new screen MUST follow the Logic Fit Design
  System. Before implementation: inspect the shared owner, define any
  documented variant, verify CSS ownership, and run browser visual QA in
  Arabic RTL, Light, Dark, and representative desktop/mobile viewports.
