# TOP GYM

TOP GYM is an Arabic, RTL gym-management modular monolith. It uses Node.js and Express on the backend, a static HTML/Vanilla JavaScript frontend, Microsoft SQL Server through `mssql`, server-side sessions, and Vercel deployment.

The project is intentionally not React, Next.js, Vue, MongoDB, or a microservice system. The current refactor keeps the existing public API, database contract, hash navigation, permissions, assets, print flows, and business behavior.

## Stack

- Node.js 18.18+
- Express 4
- Vanilla JavaScript and HTML5
- Microsoft SQL Server via `mssql`
- Session authentication with `HttpOnly` cookies
- `crypto.scrypt` password hashing
- Playwright, smoke tests, QA Gate
- Vercel serverless deployment and cron trigger

## Quick start

```powershell
npm install
Copy-Item .env.example .env
# Fill MSSQL_CONNECTION_STRING and the server-side auth values in .env
npm start
```

The application listens on `PORT` (default `3000`). The database schema is initialized idempotently at startup. Do not commit `.env`, logs, backups, or secrets.

## Current architecture

```text
Browser
  -> public/index.html
  -> hash router/page tabs + feature loader
  -> public/js/core/api.js
  -> Express app (src/app.js)
  -> src/routes/index.js
  -> route module
  -> controller
  -> service
  -> repository / database adapter
  -> SQL Server
```

### Backend layout

```text
server.js                 composition root and startup only
src/app.js                Express base app and infrastructure middleware
src/config/               environment and application constants
src/routes/               HTTP path and middleware composition
src/controllers/          HTTP input/output adapters
src/services/              domain/application behavior
src/repositories/          SQL access by aggregate
src/database/              pool, transaction, database entrypoint
src/middleware/            auth, rate limits, security, cron guards
src/permissions/           roles and backend authorization rules
src/utils/                 shared date and async helpers
```

`src/db.js` remains as a compatibility entry point. New database imports should use `src/database/`; old scripts may continue using `src/db.js` without changing behavior.

### Frontend layout

```text
public/index.html          stable HTML shell and dialogs
public/js/app.js            legacy application shell and member workflows
public/js/core/             API client, state, and tab permissions
public/js/pages/            lazy page feature modules
public/js/components/       reusable UI modules as extracted
public/js/integrations/     printing and external browser integrations
public/js/feature-loader.js on-demand feature loading
public/data/                frontend manifests and static reference data
public/assets/              exercise, muscle, logo, and image assets
```

The frontend continues to use the existing hash routes such as `#dashboard`, `#members`, `#trainees`, `#attendance`, `#library`, and `#reports`. The feature loader caches loaded scripts and the central API client owns credentials, JSON parsing, status errors, and request behavior.

## Domains and existing capabilities

- Members, memberships, pricing, payments, freezes, renewals, QR and printing
- External trainees, workout programs, diet plans, measurements, check-ins and sessions
- Attendance by phone or QR code
- Expenses and monthly finance summaries
- Exercise, food and muscle libraries with local assets
- Reports and dashboard analytics
- Backup creation, inspection, download, history and restore
- Owner and Assistant account management
- WhatsApp message preparation, not automatic sending

## Roles

- `Owner`: all application areas, finance, reports, backup/restore, pricing and Assistant account management.
- `Assistant`: members, external trainees/coaching operations attached to client records, attendance and library. Backend authorization is enforced independently from tab visibility.

See [docs/PERMISSIONS.md](docs/PERMISSIONS.md) and [docs/AUTH.md](docs/AUTH.md).

## API and database references

- [docs/API.md](docs/API.md)
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/DATABASE.md](docs/DATABASE.md)
- [docs/AUTH.md](docs/AUTH.md)
- [docs/BACKUP-RESTORE.md](docs/BACKUP-RESTORE.md)
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- [docs/EXERCISE-ASSETS.md](docs/EXERCISE-ASSETS.md)
- [docs/TOP-GYM-TECHNICAL-SPECIFICATION.md](docs/TOP-GYM-TECHNICAL-SPECIFICATION.md)

## Tests and quality gates

```powershell
npm run qa:gate
npm run build
npm run test:smoke
npm run test:e2e
npm run qa:exercise-catalog
npm run qa:exercise-content
npm run qa:muscle-assets
```

`qa:gate` performs required-file checks, JavaScript syntax checks, route-surface checks, auth-surface checks, frontend lazy-loading checks, and tracked-secret checks. Database-dependent smoke/E2E commands require a reachable test database and the appropriate environment.

## Build and styling note

The repository currently has no active stylesheet assets because a previous explicit maintenance change removed the styling layer. `npm run build` is therefore a safe no-op that reports `Styling layer disabled`. Any future Design System restoration must be a separate, intentional phase and must not be mixed with backend architecture changes.

## Refactor status

Completed safely:

- Express composition moved from the large server file into `src/app.js` and `src/routes/`.
- Controllers and route modules exist for auth, members, coaching, attendance, finance, dashboard, library, reports, pricing and backup.
- SQL pool and transaction entrypoints are centralized.
- Member reads, expenses, users and sessions have repository boundaries.
- Roles and backend route authorization are centralized.
- Frontend API, tab permissions, state and lazy feature paths are centralized.
- Services are grouped under `src/services/` and shared date utilities under `src/utils/date.js`.

Remaining deliberate technical debt:

- `member-service.js`, `coaching-service.js`, and `library-service.js` still contain multiple related workflows and should be split incrementally behind compatibility exports.
- Some dynamic schema creation remains inside services and should move to versioned migrations after a database review.
- `public/js/app.js` is still the legacy shell for members/dashboard/pricing and should be split by behavior only after browser regression coverage is expanded.
- The styling layer is intentionally disabled and is not claimed as part of this architecture refactor.

These items are documented so the next change can be scoped and tested rather than becoming a risky Big Bang rewrite.
