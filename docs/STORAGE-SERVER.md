# Logic Fit VPS storage server runbook

## Purpose

This server is persistent private object storage for Logic Fit. It is not a
second SQL Server, it is not a tenant database, and it is not a replacement
for SQL Server RLS.

~~~text
Logic Fit on Vercel
        |
        | HTTPS / S3-compatible API
        v
Private object storage service on VPS
        |
        +-- backups/{tenant and platform scopes}
        +-- branding/{tenant scopes}
        +-- payment-proofs/{tenant scopes}
        +-- private media and exports

Logic Fit on Vercel  ------------------> central SQL Server
                                         tenant_id + RLS
~~~

The application has the provider-neutral adapter and generic environment
contract. The current VPS has been bootstrapped with MinIO, a persistent data
directory and a private `logicfit-private` bucket. Its S3 API and console are
bound to `127.0.0.1` for safety; public HTTPS activation remains a separate
DNS/TLS/firewall step.

## Recommended server properties

- persistent disk mounted for the object-storage data root, for example
  /srv/logicfit-storage/;
- dedicated non-root service account/container;
- automatic restart after failure and host reboot;
- private bucket with anonymous listing and reads disabled;
- S3 API exposed only through an HTTPS reverse proxy;
- administration console bound to localhost, VPN or an IP allowlist;
- firewall rules exposing only the required reverse-proxy ports;
- disk monitoring with configurable warning/critical thresholds;
- disk encryption or provider server-side encryption when available;
- a second failure domain for off-site copies when approved later.

Do not use /tmp, tmpfs, an ephemeral container volume or the Vercel
filesystem for persistent objects. If the selected server is MinIO or another
S3-compatible implementation, do not edit its physical files manually; the
S3 object key is the only application-level storage reference.

## Bucket and credential policy

Start with one private bucket such as logicfit-private unless operational
evidence requires separation. Keep private backup/proof namespaces away from
any future publishable-media bucket.

Create a dedicated application credential with only the operations and
prefixes Logic Fit needs: put, get, head and delete. Do not use the storage
root/admin credential in Vercel. Do not store credentials in a committed
compose file, repository, ticket, screenshot or chat.

## HTTPS and reverse proxy

Use a real hostname such as storage.example.com and a trusted TLS
certificate. Force HTTPS. Do not expose an admin console to the public
internet unless it is separately protected and explicitly required. Configure
the proxy with:

- no directory listing;
- no public object caching;
- upload size and timeout values suitable for compressed backups;
- normal security headers;
- correct forwarding of HTTPS to the S3 API;
- no bypass of bucket authorization.

The S3 adapter requires the application endpoint to be HTTPS. A self-signed
certificate is not suitable for the production Vercel connection.

## Vercel configuration

Set the following in the correct Vercel environment, using the secret store
for credentials:

~~~text
OBJECT_STORAGE_DRIVER=s3
OBJECT_STORAGE_ENDPOINT=https://storage.example.com
OBJECT_STORAGE_BUCKET=logicfit-private
OBJECT_STORAGE_REGION=auto
OBJECT_STORAGE_FORCE_PATH_STYLE=true
OBJECT_STORAGE_REQUEST_TIMEOUT_MS=30000
OBJECT_STORAGE_ACCESS_KEY_ID=<enter directly in Vercel>
OBJECT_STORAGE_SECRET_ACCESS_KEY=<enter directly in Vercel>
~~~

The application still accepts the legacy BACKUP_STORAGE_* names for backward
compatibility, but new deployments should use OBJECT_STORAGE_*. Do not
configure OBJECT_STORAGE_DRIVER=local on Vercel, Staging or Production.

The current VPS bootstrap uses a dedicated `logicfit-app` application
credential and an application policy limited to Logic Fit tenant/platform
object prefixes. Its secret is stored root-only on the server and is not
present in the repository. Do not copy it into chat or source control.

## Activation checklist

The project owner or server operator must perform these steps:

1. Provision the persistent disk and storage service.
2. Create the private bucket and restricted application credential.
3. Configure HTTPS, DNS and firewall rules.
4. Add the non-secret endpoint/bucket/region settings and credentials directly
   to the Vercel environment.
5. Run the guarded database migration against the approved environment.
6. Deploy the application.
7. Run an isolated synthetic object test: put, head, get/checksum and delete.
8. Create a synthetic tenant backup and verify that its registry status is
   VERIFIED.
9. Test authorized download and cross-tenant denial.
10. Test a branding upload and a payment-proof upload.
11. Confirm storage outage/missing-object behavior remains fail-closed.
12. Configure monitoring and document the first verified backup.

No production backup should be considered verified until the object has
passed checksum/read-back validation. A successful HTTP PUT alone is not
enough.

## Monitoring

At minimum monitor:

- service reachability;
- last successful synthetic verification;
- last verified tenant backup;
- last verified platform backup;
- failed/unverified uploads;
- retention cleanup failures;
- disk total, used and available capacity;
- certificate expiry;
- repeated application credential failures.

Use STORAGE_DISK_WARNING_PERCENT and STORAGE_DISK_CRITICAL_PERCENT when disk
metrics are supplied by the storage server. Do not expose credentials, bucket
internals or filesystem paths from the public health endpoint.

## Failure and recovery notes

The VPS is a primary storage failure domain. It is not, by itself, an
off-site disaster-recovery copy. Backups need an approved secondary copy
before the platform can claim protection from VPS loss.

If the storage service is down, Logic Fit must not write to local Vercel
filesystem and must not mark a backup verified. Unrelated SQL-backed
operations may continue when they do not require a file.

Tenant restore remains a logical, tenant-scoped operation. Platform restore
requires an isolated recovery environment and infrastructure operator; do
not add a normal Owner-facing full-database restore button.

## Information needed to activate

VPS bootstrap is complete, but application activation needs the following
non-secret values/decisions:

- storage HTTPS hostname and DNS record;
- selected S3-compatible server (MinIO is provisioned on the current VPS);
- private bucket name (`logicfit-private` is provisioned);
- region and path-style requirement;
- persistent mount path and disk alert thresholds;
- reverse proxy/TLS/firewall plan;
- off-site replication decision.

SSH passwords, private keys, database connection strings and storage secrets
must be supplied only through a secure operational channel. They must not be
sent in this conversation.
