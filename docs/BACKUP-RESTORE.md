# Backup and restore

## Operations

The backup service supports create, inspect/validate, download/archive, history, restore and archive deletion. Routes are under `/api/backup`. The daily cron route is separately authorized; interactive download, inspect and restore are Owner-only. Production scheduled backups require `CRON_SECRET`; a caller-controlled User-Agent is never accepted as a Production authenticator.

## Safety rules

Before restore, the service validates the payload, table metadata and supported structure. Restore operations are recorded in `gym_backup_operations`. A failure must be surfaced and must not be reported as success.

## Storage warning

Vercel local files are ephemeral. `gym_backup_archives` provides database-backed archive metadata/content for the existing implementation, but production retention, size limits and off-site durability should be reviewed before relying on it as the only disaster-recovery copy.

## Recovery procedure

1. Stop writes or use a maintenance window.
2. Confirm the backup file and compatibility metadata.
3. Run inspect as Owner.
4. Take a fresh backup before restore.
5. Restore through the protected endpoint.
6. Check `/api/health`, authentication, member counts, finance totals and library counts.
7. Review the backup operation record.
