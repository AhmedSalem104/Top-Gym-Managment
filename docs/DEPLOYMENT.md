# Deployment

## Vercel

The project deploys as a zero-config Express application using `server.js`. The entrypoint imports Express directly so Vercel can detect the framework, while `public/**` is served by Vercel's static asset CDN. The application reads `database/**` and `data/**` at runtime for SQL schema and library initialization. The Vercel cron configuration triggers `GET /api/backup/daily` at `0 12 * * *`. The endpoint must verify the configured cron authorization before performing a backup.

`CRON_SECRET` is mandatory for Production scheduled backups. The Vercel
cron User-Agent and `x-top-gym-cron-key` fallback are development-only
conveniences; a Production request without the configured Bearer secret is
rejected.

The Express app trusts one reverse-proxy hop on Production by default because
the deployment target is Vercel. `TRUST_PROXY_HOPS=1` makes `request.ip` and
forwarded host/protocol handling reflect the original client behind that
proxy. Local development defaults to `0`; do not increase the value unless the
actual deployment topology has been verified.

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
TRUST_PROXY_HOPS=1
```

Never commit real values. SQL Server must accept encrypted connections from the deployment environment.
Production should use `TrustServerCertificate=False`; the example connection
string intentionally does not trust an unverified server certificate.

`MEMBERSHIP_CODE_SECRET` must be a long random value in Production. The
membership-code service retains compatibility fallbacks for existing
installations, but a Production deployment without the explicit secret is a
security finding and requires a planned key/reissue rollout before Go-Live.

### Migration target guard

`npm run migrate:tenancy` fails closed before opening the database when the
target is ambiguous:

- A localhost SQL Server may use `MIGRATION_ENV=local` (or the local default).
- An external Staging target must use `MIGRATION_ENV=staging`.
- Production requires `MIGRATION_ENV=production` and the exact value
  `MIGRATION_PRODUCTION_CONFIRM=I_UNDERSTAND_PRODUCTION_MIGRATION`.
- External `development`/`test` targets additionally require
  `MIGRATION_NON_PRODUCTION_CONFIRM=I_UNDERSTAND_NON_PRODUCTION_TARGET`.

The migration runner never prints the connection string or its credentials.
Do not put confirmation values in Git or reuse a Production value in a local
shell profile.

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

Safe request timing metrics are disabled by default. For a controlled
Production verification, configure both `PERFORMANCE_METRICS=true` and
`PERFORMANCE_METRICS_PRODUCTION=true`, then inspect provider log volume and
retention. The emitted fields are bounded route/status/timing metadata only;
they do not include SQL, request bodies, cookies or credentials.

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

### Standalone process shutdown

The standalone `node server.js` process closes its HTTP listener and SQL pool
on `SIGTERM`/`SIGINT`, and also closes the pool after startup failure. Vercel
imports the Express app and does not use the standalone `listen` path; its
function lifecycle still requires provider-side verification.

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
