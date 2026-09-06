# Logic Fit VPS scheduled jobs

This runbook is intentionally configuration-driven. It must be completed on
the actual VPS only after its application path, Node binary, environment
loading, storage path/provider, disk capacity and service user are verified.
No secret is stored in this document or in Git.

## Jobs

| Job | Suggested schedule | Entrypoint | Responsibility |
| --- | --- | --- | --- |
| Backup | `0 12 * * *` UTC | `node scripts/run-server-scheduled-backup.js` | Existing tenant/platform logical DR cycle, private storage verification and retention |
| Attendance auto checkout | `*/5 * * * *` UTC | `node scripts/run-server-auto-checkout.js` | Tenant-scoped stale attendance closure using the configured timeout (default 60 minutes) |

The backup and auto-checkout entrypoints use separate lock names. They must be
installed with separate log files and must not share a lock. The entrypoints
fail closed in production unless `LOGIC_FIT_JOB_STATE_DIR` points to a
non-public, writable directory owned by the application service account.

## Installation checklist

1. Verify the real release directory and Node 24 binary on the VPS.
2. Verify the process environment is loaded by the service account without
   copying secrets into a shell script or crontab line.
3. Verify the configured private object-storage provider and the MinIO/S3
   backing path. The application backup service is the source of truth for
   backup metadata, checksums, verification and retention.
4. Verify private uploads/branding/payment-proof objects and their metadata.
   The current application-level DR artifact includes database metadata; a
   separate object inventory/copy is required before claiming file/image
   restore coverage.
5. Create separate log and state directories outside `public/` with mode 750.
6. Run each entrypoint once in a non-production rehearsal, then run the
   approved production preflight and capture the last-run evidence.
7. Keep the Vercel backup cron enabled until the VPS job has completed and
   been verified. Disable the old Vercel cron only through the approved
   deployment configuration change after that gate passes.

## Safety properties

- No credentials are accepted from command-line arguments.
- Backup storage must be configured; local/Vercel temporary storage is not
  accepted as production DR storage.
- Backup idempotency and retention remain in
  `src/services/backup-recovery-service.js`.
- Auto checkout is constrained through `members.tenant_id`, and each changed
  tenant writes a safe audit event without member secrets or payment data.
- A stale/open attendance row is updated only when `check_out_at IS NULL` and
  its configured timeout has elapsed, so repeated runs are idempotent.
