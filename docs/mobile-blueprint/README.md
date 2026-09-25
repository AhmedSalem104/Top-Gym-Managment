# Logic Fit Mobile Blueprint

This directory is the evidence-backed, living specification for a future Logic Fit mobile client. It describes the current Web/Backend contracts; it does not create a mobile application and it is not a second implementation of business logic.

## Source of truth

Executable source is authoritative for current behavior. The main anchors are:

- `server.js`, `src/app.js`, and `src/routes/index.js` for composition and route registration.
- `src/routes/`, `src/controllers/`, `src/services/`, `src/repositories/`, and `src/middleware/` for API and business behavior.
- `src/permissions/`, `src/services/feature-catalog.js`, and `src/services/capability-service.js` for access decisions.
- `database/schema.sql` and `database/migrations/` for persistence and tenancy boundaries.
- `public/` and `public/js/` for current web consumers, not for mobile UX requirements.
- `tests/`, `qa/`, and the existing `docs/` for verification evidence and documented contracts.

The older flat file `docs/mobile-blueprint.md` is a pre-existing partial note. The directory is the canonical maintained blueprint for this discovery baseline; the flat file is retained for compatibility and is not an independent source of truth.

## How to use this blueprint

1. Read `00-PROJECT-CHARTER.md` and `01-CURRENT-SYSTEM-AUDIT.md` before designing a mobile feature.
2. Use `03-API-CATALOG.md`, `04-BUSINESS-RULES.md`, and `06-ENTITLEMENTS-PERMISSIONS-LIMITS.md` as the contract set.
3. Use `19-TRACEABILITY-MATRIX.md` before declaring a mobile capability complete.
4. Record major mobile architecture decisions in `ADR/`.
5. Keep `21-OPEN-QUESTIONS.md` limited to real unresolved decisions; do not turn uncertainty into an invented API or business rule.

## Authority by domain

| Domain | Authoritative document | Evidence anchor |
| --- | --- | --- |
| Runtime/topology | `01-CURRENT-SYSTEM-AUDIT.md` | `package.json`, `server.js`, `src/app.js` |
| API | `03-API-CATALOG.md` | 29 route modules under `src/routes/` |
| Rules/data | `04-BUSINESS-RULES.md`, `07-DATA-DOMAIN-MAP.md` | services, repositories, migrations |
| Access | `02-USERS-ROLES-WORKSPACES.md`, `06-ENTITLEMENTS-PERMISSIONS-LIMITS.md` | auth/permission/capability source |
| Mobile UX | `08-MOBILE-PRODUCT-ARCHITECTURE.md`, `09-MOBILE-INFORMATION-ARCHITECTURE.md` | proposal constrained by current contracts |
| Security/operations | `13-SECURITY.md`, `17-OBSERVABILITY.md`, `18-RELEASE-STORE.md` | middleware, release scripts, infra |
| Completeness | `19-TRACEABILITY-MATRIX.md` | cross-check of source, API, role, feature, and tests |

## Synchronization

Any change to a mobile-relevant contract must update the relevant files in this directory in the same changeset. `AGENTS.md` contains the permanent repository rule under **Mobile Blueprint Synchronization**.

## Verification baseline

- Last verified commit: `0cc7d7972a885799bc4777d02d6a3a95dc1f19b3`
- Last verified date: `2026-09-25`
- Repository branch observed: `main`
- Application: Node `24.x`, Express 4, SQL Server via `mssql`, browser UI in `public/`.
- Route declarations discovered: `347` across `29` route modules.
- Feature catalog entries: `31`.
- Permission catalog entries: `93`.

## Completeness status

| DOMAIN | DOCUMENT | STATUS | LAST VERIFIED | NOTES |
| --- | --- | --- | --- | --- |
| Repository topology | `01-CURRENT-SYSTEM-AUDIT.md` | VERIFIED | 2026-09-25 | Source tree and runtime inspected. |
| Roles/workspaces | `02-USERS-ROLES-WORKSPACES.md` | VERIFIED | 2026-09-25 | Three backend roles plus code-based Member Portal identity. |
| API inventory | `03-API-CATALOG.md` | VERIFIED | 2026-09-25 | 347 route declarations accounted for by module/domain. |
| Business rules | `04-BUSINESS-RULES.md` | VERIFIED | 2026-09-25 | Current rules traced to services and migrations; unresolved edges listed. |
| Feature catalog | `05-FEATURE-CATALOG.md` | VERIFIED | 2026-09-25 | Derived from `FEATURE_CATALOG`, not navigation labels. |
| Access model | `06-ENTITLEMENTS-PERMISSIONS-LIMITS.md` | VERIFIED | 2026-09-25 | Server authority and snapshot semantics documented. |
| Data domains | `07-DATA-DOMAIN-MAP.md` | VERIFIED | 2026-09-25 | Domain map, RLS boundary, and ID policy documented. |
| Mobile product architecture | `08-MOBILE-PRODUCT-ARCHITECTURE.md` | VERIFIED | 2026-09-25 | Proposal constrained by observed workspaces and APIs. |
| Mobile IA | `09-MOBILE-INFORMATION-ARCHITECTURE.md` | VERIFIED | 2026-09-25 | Role/task oriented, not screen-for-screen. |
| User flows | `10-USER-FLOWS.md` | VERIFIED | 2026-09-25 | Success and failure flows included. |
| Technical direction | `11-TECHNICAL-ARCHITECTURE.md` | PARTIAL | 2026-09-25 | RN/TypeScript direction recorded; implementation dependency versions remain future decisions. |
| Design system | `12-DESIGN-SYSTEM.md` | VERIFIED | 2026-09-25 | Native direction based on current Logic Fit tokens and HeroUI principles. |
| Security | `13-SECURITY.md` | VERIFIED | 2026-09-25 | Session, RLS, storage, upload, and mobile threats covered. |
| Cache/offline | `14-DATA-CACHING-OFFLINE.md` | VERIFIED | 2026-09-25 | Classification is conservative; no offline mutation is assumed. |
| Performance | `15-PERFORMANCE.md` | PARTIAL | 2026-09-25 | Budgets proposed; mobile device measurements remain future work. |
| Testing | `16-TESTING-QUALITY.md` | VERIFIED | 2026-09-25 | Matrix and gates mapped to current suites. |
| Observability | `17-OBSERVABILITY.md` | VERIFIED | 2026-09-25 | Existing health, request-id, metrics, logs, and backup evidence mapped. |
| Release/store | `18-RELEASE-STORE.md` | VERIFIED | 2026-09-25 | Production release pipeline is documented; store release is future. |
| Traceability | `19-TRACEABILITY-MATRIX.md` | VERIFIED | 2026-09-25 | All 31 catalog keys and major domains mapped. |
| Implementation phases | `20-IMPLEMENTATION-PHASES.md` | VERIFIED | 2026-09-25 | Gated phases 0–21 defined. |
| Open decisions | `21-OPEN-QUESTIONS.md` | VERIFIED | 2026-09-25 | Only non-critical decisions with evidence gaps remain. |

## Known unresolved items

The current repository does not define a mobile client, mobile push token contract, native deep-link contract, or offline mutation policy. Those are intentionally recorded as decisions, not silently invented. See `21-OPEN-QUESTIONS.md`.

## Status

**Blueprint ready for review; mobile implementation not started.**
