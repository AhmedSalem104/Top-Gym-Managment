# Architecture audit

## Confirmed shape

```text
Browser (HTML/CSS/Vanilla JS; hash navigation; lazy feature modules)
  -> Express app (`server.js`, `src/app.js`)
  -> security/request context/auth/permission middleware
  -> route modules (`src/routes/index.js`, 27 domains)
  -> controllers -> services -> explicit repositories / legacy service SQL
  -> tenant-aware `mssql` pool -> SQL Server + configured storage/cache adapters
```

`docs/ARCHITECTURE.md` describes this modular-monolith boundary and explicitly notes legacy service SQL, a large frontend shell, and runtime schema setup as future refactoring areas. SaaS control-plane routes are separated from gym tenant operations; platform-admin routes have a separate namespace, with compatibility aliases documented.

## Principal source owners

| Layer | Owners | Notes |
|---|---|---|
| Composition | `server.js`, `src/app.js`, `src/routes/index.js` | Health/liveness and route registration |
| HTTP security | `src/middleware/security.middleware.js`, auth/permission/tenant middleware | Express JSON limit 1MB, compression, API `no-store`, static cache headers |
| Domain interfaces | `src/routes/*.routes.js`, `src/controllers/*` | Domain-specific handlers and mappings |
| Business rules | `src/services/*` | Some large services still own parameterized SQL |
| Persistence | `src/repositories/*`, `src/database/*`, `src/tenancy/*` | SQL Server and tenant session context wrapper |
| Frontend | `public/*.html`, `public/js/app.js`, `public/js/core/*`, `public/js/pages/*` | Legacy shell plus lazy-loaded modules |
| Release | `.github/workflows/*`, `scripts/release-production.js`, `docs/PRODUCTION-CICD.md` | Canonical pipeline documented as `npm run release:production` |

## Coupling / maintenance observations

- The route → controller → service split is established, but repository extraction is incomplete. This is a maintenance concern, not evidence of runtime slowness.
- `public/js/app.js` remains the legacy shell for members/dashboard/pricing and is intentionally not mechanically split without browser coverage.
- Route registration is centralized, but feature fetch behavior is distributed across 21 scanned page files and shared/legacy code. An endpoint contract registry would improve traceability.
- Runtime schema readiness checks exist in legacy/domain services; DDL ownership is documented as migration pipeline. Audit every service path before claiming all runtime schema checks are read-only.
- External services (email, object storage, optional cache) are adapter/configuration based; effective production setup cannot be inferred from checked-in config.

## Architectural risks and action

| Risk | Recommendation |
|---|---|
| Large legacy service/shell ownership | Extract one domain boundary at a time after selector/API/browser coverage; avoid broad rewrite |
| Route/API catalog drift | Generate route inventory from route registration and maintain feature-to-endpoint mappings |
| Operations config unknown | Produce a redacted deployment attestation (versions, flags, topology, no secrets) as part of release evidence |
| Cross-cutting tenant behavior | Keep tenant context established before persistence; require route/service tests for scope transitions |

No architectural code change is proposed by this read-only audit.
