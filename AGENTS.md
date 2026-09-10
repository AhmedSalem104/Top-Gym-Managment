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

## Specialist handoff format

Each specialist reports to the Lead using:

`FINDING → ROOT CAUSE → PROPOSED FIX → FILES AFFECTED → DEPENDENCIES → RISKS → TESTS → BEFORE/AFTER EVIDENCE`
