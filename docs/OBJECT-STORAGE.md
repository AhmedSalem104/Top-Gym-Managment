# Logic Fit private object storage

## Status

The application has one provider-neutral private storage boundary in
'src/services/object-storage-service.js'. The S3-compatible adapter is
configuration-ready. A MinIO service has now been provisioned on the provided
VPS with a persistent host volume and a private bucket, but it is intentionally
bound to localhost until an HTTPS hostname, TLS and firewall policy are
configured. Vercel activation is therefore still pending.

The same runtime storage service is injected into:

- tenant and platform backup/restore flows;
- new branding uploads;
- new SaaS payment-proof uploads.

Existing SQL-backed branding/payment-proof rows remain readable. They are not
silently migrated or deleted by the metadata migration. New uploads fail
closed with a safe 503 while the provider is not configured; they never fall
back to Vercel's filesystem.

## Preserved application architecture

Logic Fit continues to use one central SQL Server database. tenant_id, the
trusted tenant context and SQL Server RLS remain the ownership boundaries.
Top Gym is an ordinary tenant. Storage keys are not a replacement for database
authorization and are never accepted as a client-controlled trust boundary.

The application does not use database-per-tenant storage, public backup URLs,
or permanent files in public/, /tmp, or a Vercel function filesystem.

## Object key contract

Keys are generated and validated server-side:

~~~text
tenants/{tenant_id}/private/{category}/{uuid}.{extension}
platform/private/{category}/{uuid}.{extension}
~~~

The current categories include backups, branding, payment-proofs and exports.
The tenant id and generated object id are the storage identity; gym names,
slugs, member names, email addresses and phone numbers are never used in
object names.

The storage service rejects absolute paths, traversal segments, control
characters, invalid categories, tenant-key mismatches and platform/tenant
scope confusion.

## Private and publishable content

Backups, payment proofs, sensitive exports and internal platform files are
strictly private. Their normal API responses expose metadata only. Downloads
must pass authentication, permission checks, trusted tenant ownership checks
and backup/file state checks. A short-lived HTTPS signed download is allowed
only after those checks.

Branding can be displayed by an application proxy route, but the storage
bucket remains private. The route resolves the current tenant server-side and
does not expose the storage endpoint, bucket credentials or a permanent
storage URL. Private backups and payment proofs use private, no-store response
policy.

## Upload and integrity rules

Every upload is validated before it reaches the provider:

- allowlisted MIME type and extension;
- bounded byte size;
- server-generated key;
- checksum (SHA-256);
- image signature/dimensions for branding;
- file signature validation for payment proofs;
- special SVG safety checks for branding.

The storage service performs PUT, HEAD and an actual GET read-back when an
expected size/checksum is supplied. A metadata-only HEAD result is not enough
to mark an upload verified. Database metadata is written only after the
object passes this verification. Provider failure, missing objects, size
mismatch or checksum mismatch remains a failure and never becomes VERIFIED.

## Adapter contract

Business services use the abstraction rather than provider-specific APIs:

~~~text
putPrivateObject
getPrivateObject
headPrivateObject
deletePrivateObject
createSignedDownload
verifyPrivateObject
~~~

The production adapter uses HTTPS and AWS Signature Version 4 for
S3-compatible endpoints. It does not implement a public URL method.
Path-style addressing can be enabled for self-hosted S3-compatible servers.
Request timeout and signed URL TTL are bounded by the application.

## Environment contract

OBJECT_STORAGE_* is the canonical contract. The original BACKUP_STORAGE_*
variables remain supported as backwards-compatible aliases for existing
deployments:

~~~text
OBJECT_STORAGE_DRIVER=s3
OBJECT_STORAGE_ENDPOINT=https://storage.example.com
OBJECT_STORAGE_BUCKET=logicfit-private
OBJECT_STORAGE_REGION=auto
OBJECT_STORAGE_ACCESS_KEY_ID=<secret-store-value>
OBJECT_STORAGE_SECRET_ACCESS_KEY=<secret-store-value>
OBJECT_STORAGE_SESSION_TOKEN=<optional-secret-store-value>
OBJECT_STORAGE_FORCE_PATH_STYLE=true
OBJECT_STORAGE_REQUEST_TIMEOUT_MS=30000
~~~

The access key and secret must be entered directly into the Vercel
Environment Variables secret store. Do not paste them into chat, source
files, committed .env files, screenshots or issue logs. Do not use a root
storage credential in Vercel; create a restricted application credential for
the Logic Fit private bucket/prefixes.

OBJECT_STORAGE_DRIVER=local is only an explicit local/test adapter. It is
rejected in Staging, Production and Vercel. The default none state is
fail-closed.

## Database metadata

Migration 010-private-object-storage-metadata.sql adds nullable storage
metadata to gym_branding_assets and saas_payment_proofs:

~~~text
storage_key
storage_provider
storage_size_bytes (branding)
storage_checksum_sha256 (branding)
storage_verified_at
~~~

Old content bytes are preserved and remain nullable for the new external
path. No existing files are moved by this migration. The tenant service
continues to apply the tenant-scoped unique keys and RLS to these tables.

## VPS/S3-compatible activation

The VPS is a storage service, not a second application database:

~~~text
Vercel Logic Fit --HTTPS/S3--> private S3-compatible service on VPS
        |
        +--------------------> central SQL Server
~~~

Use a persistent host-mounted data volume such as
/srv/logicfit-storage/. The object-storage server owns its physical layout;
operators must not edit files beneath that directory manually. Do not use
tmpfs, /tmp or an ephemeral container volume.

Recommended deployment properties:

1. dedicated non-root storage-service account/container;
2. automatic restart and persistent host volume;
3. private bucket with no anonymous listing or object reads;
4. storage API behind HTTPS at a dedicated hostname;
5. admin console bound to localhost/VPN/IP allowlist, not public;
6. firewall exposing only the reverse proxy ports required for HTTPS;
7. request-size/timeouts suitable for compressed backup artifacts;
8. disk monitoring with configurable warning/critical thresholds;
9. encrypted disk or provider server-side encryption where supported;
10. a separate off-site copy later; the VPS alone is not disaster recovery.

The repository does not include credentials, certificates or a provider
specific compose file because those are deployment secrets and an
infrastructure decision. The S3 adapter remains provider-agnostic.

## Safe activation and verification order

After the VPS is provisioned:

1. Configure the non-secret endpoint, bucket, region and path-style setting in
   Vercel; add credentials directly in the Vercel secret store.
2. Run migration 010 through the guarded migration process against the
   approved environment.
3. Deploy and confirm /api/health reports only a safe configured/provider
   status; it must not return secrets.
4. Upload a synthetic object, then verify PUT -> HEAD -> GET/checksum ->
   DELETE through a controlled integration test.
5. Create a synthetic tenant backup and require VERIFIED plus positive size
   and SHA-256.
6. Verify authorized download, cross-tenant denial and Platform Admin scope.
7. Test a branding upload and payment proof upload; confirm their SQL
   metadata contains a private key and no new BLOB bytes.
8. Test provider outage/missing object/checksum failure and confirm a safe
   failure state.

No step should mark a backup VERIFIED merely because an HTTP write returned
success.

## Failure boundaries and recovery

If the storage server is unavailable, unrelated SQL-backed application
operations may continue, while backup and file operations fail with safe
codes such as STORAGE_NOT_CONFIGURED or STORAGE_UNAVAILABLE. The application
does not fall back to local Vercel disk.

Branding and payment-proof replacement deletes an old object only after the
new database reference is committed and only when no remaining tenant row
references that key. Provider deletion failures are left for a future
reconciliation pass and do not make a committed branding change point to a
missing object.

Current logical backup artifacts carry the database metadata references for
external files; they do not automatically embed a second copy of every
external object. A provider-aware file copy/restore rehearsal and off-site
replication are still required before claiming full disaster recovery.

## Production inputs still required

The code and VPS storage service are ready for the controlled activation step,
but the repository intentionally does not contain server credentials or TLS
material. The following non-secret deployment decisions/values are still
needed:

- HTTPS storage hostname and DNS ownership;
- selected S3-compatible server and private bucket name (MinIO/private bucket
  are provisioned on the current VPS);
- region and path-style requirement;
- persistent disk/mount and disk alert thresholds;
- application credential policy and allowed bucket/prefix scope;
- off-site copy decision;
- Vercel environment scope for the variables.

Do not send SSH passwords, private keys, database connection strings or
storage secrets in this conversation. The current VPS bootstrap is complete;
the remaining activation step needs the chosen hostname plus DNS/TLS/firewall
configuration, followed by entering the generated application credential
directly into Vercel's secret store.
