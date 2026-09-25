# 00 — Project Charter

## Purpose

Create a durable contract map so a future `logic-fit-mobile` can reuse current Logic Fit capabilities without losing API behavior, tenant isolation, authorization, entitlements, limits, validation, or role workflows.

## Explicit non-goals

- No React Native project is created in this phase.
- No Web/Backend behavior, API, schema, migration, data, pricing, permissions, or production configuration is changed.
- No business rule is reimplemented in documentation as executable logic.

## Product principle

The future mobile application is **not** a screen-for-screen Web port. Web defines capabilities and business contracts. Mobile UX will be organized around role, job-to-be-done, frequency, priority, context, speed, clarity, and one-handed use. Several Web screens may become one mobile flow; one dense Web screen may become several focused steps.

## Backend authority

The Backend remains authoritative for authentication, tenant and tenant type, subscription and status, entitlements, permissions, limits, branch/section access, validation, calculations, and data isolation. Mobile must consume effective server responses and must never encode commercial rules such as `plan === 'pro'` or grant access based on cached UI state.

## Evidence standard

Every current-system statement in this blueprint cites a source path or a verified existing document. When source and documentation disagree, executable source wins for current implementation and the conflict is listed in `21-OPEN-QUESTIONS.md`.

## Acceptance for future implementation

A mobile phase may close only when its traceability rows, API contract tests, role/tenant tests, security tests, RTL/theme tests, and failure-state tests are updated. Critical or high unresolved questions block the relevant phase.
