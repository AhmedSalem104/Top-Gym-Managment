# Deployment

## Vercel

The project deploys as a Node/Express entrypoint using `server.js` and `vercel.json`. The Vercel cron configuration triggers `GET /api/backup/daily` at `0 12 * * *`. The endpoint must verify the configured cron authorization before performing a backup.

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
```

Never commit real values. SQL Server must accept encrypted connections from the deployment environment.

## Deployment checklist

1. Install with the lockfile.
2. Configure SQL Server connectivity and auth bootstrap values.
3. Run `npm run qa:gate` and `npm run build`.
4. Run database-dependent smoke/E2E checks against a safe test database.
5. Deploy.
6. Verify `/api/health`, login, Owner/Assistant access and one read-only domain flow.
7. Verify that the cron backup is authorized and recorded.

## Serverless constraints

Vercel instances are not durable workers. Do not depend on local temporary files as permanent backup storage or on process memory for sessions/rate limits across instances. Sessions are stored in SQL Server; backup archive durability and retention should be reviewed before treating the current archive implementation as the only disaster-recovery copy.
