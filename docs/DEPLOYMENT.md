# Deployment

## Vercel

The project deploys as a zero-config Express application using `server.js`. The entrypoint imports Express directly so Vercel can detect the framework, while `public/**` is served by Vercel's static asset CDN. The application reads `database/**` and `data/**` at runtime for SQL schema and library initialization. The Vercel cron configuration triggers `GET /api/backup/daily` at `0 12 * * *`. The endpoint must verify the configured cron authorization before performing a backup.

## Required environment

Use the variables listed in `.env.example`, including:

```text
NODE_ENV=production
MSSQL_CONNECTION_STRING=...
APP_TIMEZONE=Africa/Cairo
CRON_SECRET=...
AUTH_OWNER_EMAIL=...
AUTH_OWNER_NAME=TOP GYM Owner
AUTH_OWNER_PASSWORD=...
AUTH_SESSION_DAYS=7
AUTH_PLATFORM_ADMIN_EMAIL=platform-admin@example.com
AUTH_PLATFORM_ADMIN_NAME=Platform Admin
AUTH_PLATFORM_ADMIN_PASSWORD=...
PLATFORM_ADMIN_HOST=admin.voltyks.app
DEFAULT_TENANT_SLUG=top-gym
```

Never commit real values. SQL Server must accept encrypted connections from the deployment environment.

### SQL pool settings

`src/database/pool.js` creates one reusable `mssql` pool per Node/Vercel
instance. The defaults are intentionally conservative:

```text
MSSQL_CONNECTION_TIMEOUT=30000
MSSQL_REQUEST_TIMEOUT=120000
MSSQL_POOL_MAX=10
MSSQL_POOL_MIN=0
MSSQL_POOL_IDLE_TIMEOUT_MS=30000
```

Pool limits are per serverless instance, not a global connection budget. Do not
increase `MSSQL_POOL_MAX` until Staging/Production workload evidence confirms
that the SQL host can absorb the additional concurrency. `MSSQL_POOL_MIN=0`
allows idle instances to release connections; the application still reuses one
pool within a warm instance.

The repository does not claim live connection capacity or timeout behavior from
these configuration values. Those require a safe Staging/Production check and
remain in `docs/PRODUCTION-VERIFICATION-DEBT.md`.

### Runtime consistency and process-local limits

The supported runtime is Node 24 (`package.json`, `.nvmrc`, and the CI workflow
must use the same major version). The login, sensitive-write and member-portal
rate-limit guards also cap their in-memory key stores as a local memory-safety
fallback. They do not provide a global quota across Vercel instances; a shared
rate-limit backend still requires a separate production decision and
verification.

## Deployment checklist

1. Install with the lockfile.
2. Configure SQL Server connectivity and auth bootstrap values.
3. Run `npm run migrate:tenancy` once against the target database, then verify with `npm run qa:tenancy`.
4. Run `npm run qa:gate` and `npm run build`.
5. Run database-dependent smoke/E2E checks against a safe test database.
6. Deploy.
7. Verify `/api/health`, login, Owner/Assistant access and one read-only domain flow.
8. Verify that the cron backup is authorized and recorded.

## Serverless constraints

Vercel instances are not durable workers. Do not depend on local temporary files as permanent backup storage or on process memory for sessions/rate limits across instances. Sessions are stored in SQL Server; backup archive durability and retention should be reviewed before treating the current archive implementation as the only disaster-recovery copy.
