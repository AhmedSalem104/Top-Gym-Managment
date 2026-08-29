# Private object storage boundary

## Current status

The repository now contains a provider-neutral private object-storage
contract in `src/services/object-storage-service.js`. It is intentionally not
activated: the current payment-proof, branding and backup paths remain
database-backed until an approved external provider and credentials are
available.

This is an architecture seam, not a claim that Object Storage is active in
Production.

## Safety contract

- Every key is generated under `tenants/{tenantId}/private/{category}/`.
- The original filename is metadata only; it is never used as the object key.
- Reads and deletes reject a key belonging to another tenant.
- Path traversal, absolute paths, control characters and invalid categories
  are rejected.
- MIME type, byte size and SHA-256 checksum are validated before a provider
  receives an object.
- The service exposes no public URL operation. Private access must be through
  an authenticated application route or a future short-lived signed access
  flow.
- A missing provider fails closed with
  `OBJECT_STORAGE_PROVIDER_NOT_CONFIGURED`; it never silently writes to a
  public location.

## Adapter contract

An approved provider adapter must implement:

```text
putPrivateObject({ tenantId, key, originalName, contentType, size, checksum, body })
getPrivateObject({ tenantId, key })
deletePrivateObject({ tenantId, key })
```

The adapter must keep objects private, preserve the tenant prefix, enforce
server-side authorization, and return only a temporary signed response when
the application explicitly needs file access. Public permanent URLs are not
part of the contract.

## Planned mapping

| Current/private domain | Category | Activation state |
| --- | --- | --- |
| SaaS payment proofs | `payment-proofs` | Provider pending |
| Branding assets | `branding` | Provider pending |
| Backup archives | `backups` | Provider and restore test pending |
| Generated exports/PDFs | `exports` | Provider pending |

No database migration or live storage path was changed by introducing this
boundary. Provider activation requires a staging migration/cutover plan,
private-access verification, tenant-isolation tests, deletion/recovery tests
and an approved credential decision.
