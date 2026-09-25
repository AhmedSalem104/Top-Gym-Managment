# 01 — Current System Audit

## Repository topology

Logic Fit is a Node `24.x` modular monolith (`package.json`, `.nvmrc`) using Express 4 and `mssql` for SQL Server. `server.js` is the composition root; `src/app.js` builds the base Express app; `src/routes/index.js` registers domain routes and injects controllers/services.

```text
HTTP
 -> security/request-id/rate-limit middleware
 -> auth + tenant context + permission/capability guards
 -> route module
 -> controller
 -> service/repository
 -> SQL Server / object storage / optional cache
 -> JSON or private file response
```

## Source areas inspected

| Area | Current location | Evidence |
| --- | --- | --- |
| Runtime/config | `server.js`, `src/config/env.js`, `.env.example` | Node/port/SQL/storage/session configuration. |
| HTTP composition | `src/app.js`, `src/routes/index.js` | Health, middleware, route registration. |
| Controllers | `src/controllers/` | Request-to-service translation. |
| Services | `src/services/` | Domain rules, calculations, orchestration. |
| Repositories | `src/repositories/` | Parameterized SQL for selected aggregates. |
| Auth/permissions | `src/middleware/auth.middleware.js`, `src/permissions/` | Sessions, roles, route policy. |
| Tenancy/RLS | `src/tenancy/`, `src/database/pool.js`, `database/migrations/013-*` | Async context and SQL Server session context. |
| Web | `public/*.html`, `public/js/`, `public/css/` | Hash shell, lazy feature loading, browser-only state. |
| Data | `database/schema.sql`, `database/migrations/` | Tables, constraints, indexes, migration ledger. |
| Operations | `scripts/release-production.js`, `scripts/release-production-remote.sh`, `infra/` | Build, backup, migration and deployment gates. |
| Tests | `tests/unit`, `tests/browser`, `qa/` | Contract and browser evidence. |

## Runtime contracts

- `npm start` runs `node server.js`; the server requires `MSSQL_CONNECTION_STRING` and validates startup configuration.
- `npm run build` runs CSS, login entry, phone formatter, and anatomy build/validation steps.
- `npm run test:unit` runs `tests/unit/*.test.js`.
- `npm run release:production` is the canonical production entrypoint; it requires exact SHA, clean approved worktree, release confirmation, official backup/migration/security/health gates, and exact-SHA cutover.
- Object storage is the intended private storage boundary for backups, branding, and payment proofs; local filesystem storage is not a production contract.

## Current web surfaces

The public app includes login, Gym shell, registration pages, Member Portal, Platform Admin, and Trainer Workspace (`public/*.html`). The main Gym shell uses hash navigation and lazy feature loading (`public/js/core/feature-loader.js`, `public/js/app.js`). Trainer has dedicated `trainer-workspace.html`, `trainer-workspace.js`, and `trainer-studio-v2.js`. Platform Admin has a separate HTML shell and route namespace. Member Portal has code-based entry and an isolated portal session.

## System boundaries

- Tenant scope is carried in AsyncLocalStorage and written to SQL Server `SESSION_CONTEXT` by `src/database/pool.js`.
- Platform scope is intentionally tenantless; platform actions must carry an explicit tenant id.
- `tenant_type` is metadata (`gym` or `independent_trainer`), not the RLS predicate.
- UI feature visibility is advisory. API authorization is the security boundary.
- `src/services/financial-ledger-service.js` is the semantic boundary for collection/refund reporting; historical facts are not rewritten.

## Discovery caveats

There is no mobile runtime, native push registration, native secure-storage implementation, or native deep-link registration in the repository. Mobile equivalents are proposed only in later documents and are marked future decisions where the current code has no contract.
