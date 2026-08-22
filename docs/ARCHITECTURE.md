# Architecture

## Intent

TOP GYM is a modular monolith. The goal is clear dependency direction and safe incremental extraction, not a rewrite or a collection of empty folders.

## Request path

```text
HTTP request
  -> security middleware
  -> session/auth/permission middleware
  -> route module
  -> validator (where present)
  -> controller
  -> service
  -> repository or database adapter
  -> SQL Server
  -> controller response
```

`server.js` is the composition root. `src/app.js` creates the Express application and infrastructure middleware. `src/routes/index.js` composes domain route modules. Controllers do not own SQL or business calculations.

## Layer rules

### Routes

Route modules declare HTTP methods, paths, middleware and controller functions. They do not execute SQL.

### Controllers

Controllers translate `req.params`, `req.query` and `req.body` into service calls and map results to the existing response contract. They do not know browser details or database schema.

### Services

Services own business rules, validation that is domain-specific, calculations, orchestration and transaction decisions. They do not receive Express `req`/`res` objects.

### Repositories

Repositories own parameterized SQL for a coherent aggregate. Current explicit repositories are `member.repository.js`, `expense.repository.js`, `user.repository.js`, and `session.repository.js`. The remaining large services still contain legacy SQL and are future extraction targets.

### Database

- `src/database/pool.js`: one reusable `mssql` connection pool.
- `src/database/transaction.js`: transaction helper.
- `src/database/index.js`: canonical database entrypoint and idempotent schema initialization.
- `src/db.js`: compatibility wrapper for legacy callers.

## Backend map

```text
src/
  app.js
  config/
  controllers/
  database/
  middleware/
  permissions/
  repositories/
  routes/
  services/
  utils/
```

The route domains are auth, members, attendance, finance, dashboard, library, reports, pricing, coaching and backup. Public route names remain unchanged.

## Frontend map

The browser still uses one stable HTML shell and hash navigation. `public/js/core/api.js` is the shared fetch boundary for new code. `public/js/core/permissions.js` controls tab visibility, while the backend remains the security authority. Feature scripts are loaded once by `feature-loader.js` and grouped under `public/js/pages/` and `public/js/integrations/`; dashboard enhancements, member details, reports and the smart assistant are intentionally deferred until their screen or interaction is relevant.

The member/dashboard/pricing legacy shell remains in `public/js/app.js`. It should be split by behavior only with browser coverage for dialogs and event delegation; moving it mechanically would create more risk than value.

## Dependency direction

```text
routes -> controllers -> services -> repositories -> database
middleware -> services/permissions
frontend pages -> frontend API services/core API -> REST API
```

Repositories must not import controllers. Services must not import routes. Database modules must not depend on HTTP.

## Safe refactor protocol

1. Capture route, response, database and selector behavior.
2. Move one domain or boundary.
3. Keep compatibility exports where an old import is public internally.
4. Run Node syntax checks, module-load checks, QA Gate and domain tests.
5. Verify permissions and browser behavior.
6. Commit the smallest coherent change.

## Known boundaries to improve later

- Split `member-service.js` into membership, pricing, payments and member-profile services.
- Split `coaching-service.js` into workout, diet, measurement, session and meal-log services.
- Split `library-service.js` into exercise, food, muscle and asset services.
- Move runtime table creation into reviewed migrations.
- Split the legacy frontend shell after adding focused E2E coverage.
