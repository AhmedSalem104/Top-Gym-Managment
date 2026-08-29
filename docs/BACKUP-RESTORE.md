# Backup and restore

> **Current architecture note (2026-08-29):** the canonical implementation is
> now `src/services/backup-recovery-service.js` with the registry in
> `src/services/backup-registry.js`. It creates tenant-scoped records and a
> separate platform logical DR artifact, validates SHA-256/manifest integrity,
> and requires private storage for persistent recovery artifacts. The legacy
> archive endpoints remain compatibility shims and are not a global backup or
> restore mechanism. See [BACKUP-DISASTER-RECOVERY.md](./BACKUP-DISASTER-RECOVERY.md)
> for the complete current flow, permissions and verification debt.

## Operations

The canonical recovery service supports tenant create, inspect/validate,
verified download, history, logical tenant restore, retention and audit. Routes
are under `/api/backup`; PlatformAdmin Backup/DR routes are under
`/api/platform-admin/...`. The daily cron route is separately authorized;
interactive tenant actions are Owner-only. Production scheduled backups require
`CRON_SECRET`; a caller-controlled User-Agent is never accepted as a
Production authenticator.

## Safety rules

Before restore, the service validates the payload, current registry coverage,
tenant ownership, table metadata and checksum. A verified pre-restore safety
copy is mandatory, and restore operations are recorded in
`gym_backup_audit_log`. A failure must be surfaced and must not be reported as
success. The old `gym_backup_operations` table is retained only for legacy
compatibility.

## Storage warning

Vercel local files are ephemeral. New persistent artifacts require the private
object-storage adapter; when no approved provider is configured, backup writes
fail closed. `gym_backup_archives` is legacy compatibility metadata/content and
must not be treated as the platform's durable disaster-recovery copy.

## Recovery procedure

1. Use a verified tenant artifact belonging to the active gym.
2. Stop or coordinate tenant writes and confirm the backup compatibility metadata.
3. Run inspect as Owner; the upload must pass checksum and registry validation.
4. Start restore through the protected endpoint with explicit confirmation and a reason.
5. The service creates a verified pre-restore safety backup before changing rows.
6. Check `/api/health`, authentication, member counts, finance totals and library counts.
7. Review the tenant backup audit events and the safety backup record.

This procedure is for logical tenant restore only. Platform disaster recovery,
private-file recovery and isolated restore rehearsal are documented in
[BACKUP-DISASTER-RECOVERY.md](./BACKUP-DISASTER-RECOVERY.md) and remain subject
to the verification debt listed there.
