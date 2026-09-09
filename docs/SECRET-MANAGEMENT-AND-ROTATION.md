# Logic Fit Secret Management and Rotation

## Scope and safety boundary

This document describes the source-level secret lifecycle. It does not rotate,
copy, print, or change any production secret. It also does not change database
schema, RLS, tenant isolation, DNS, Vercel configuration, VPS configuration,
or production traffic.

Git is the source of truth for code. A managed secret provider is the source of
truth for secret values. The application runtime receives secrets through its
deployment environment only. Production SQL remains the source of truth for
persistent records, and object storage remains the source of truth for files.

## Secret inventory

The runtime secret ring currently covers these cryptographic purposes:

| Purpose | Classification | Consumers | Persistent data depends on it? | Current contract |
| --- | --- | --- | --- | --- |
| Membership code | A — encryption/data key and B — HMAC key | membership-code service, member-code portal lookup | Yes: `membership_code_hash` and `membership_code_ciphertext` | `MEMBERSHIP_CODE_SECRET_CURRENT` |
| Member portal session | C — session/token key | member portal sessions, visitor analytics hashes, subscription idempotency | Yes: session/token and idempotency hashes | `MEMBER_PORTAL_SESSION_SECRET_CURRENT` |
| Public registration | B — HMAC/capability key | registration access tokens and idempotency hashes | Yes: public registration request hashes | `PUBLIC_REGISTRATION_SECRET_CURRENT` |

The broader runtime inventory is classified as follows; only names and
ownership are documented, never values:

| Secret/credential family | Classification | Consumer | Persistent data depends on it? | Rotation note |
| --- | --- | --- | --- | --- |
| `MSSQL_CONNECTION_STRING` / `DATABASE_URL` | D — infrastructure credential | SQL pool and read/write services | No, but database access depends on it | Rotate in the provider and validate pool connectivity |
| `OBJECT_STORAGE_*` secret/session credentials and `BACKUP_STORAGE_*` aliases | D/E — infrastructure/provider credential | object storage and backup adapters | Files remain in storage; access depends on it | Rotate provider-side with read/write verification |
| `CACHE_GATEWAY_TOKEN` | D — infrastructure credential | optional cache gateway | No; SQL fallback remains authoritative | Rotate gateway and app together |
| `CRON_SECRET` | F — bootstrap/operation credential | scheduled job endpoints | No | Overlap only if the job scheduler supports it |
| `AUTH_OWNER_PASSWORD`, `AUTH_PLATFORM_ADMIN_PASSWORD` | F — bootstrap credential | local/bootstrap provisioning helpers | Existing password hashes do not derive from the current env value | Change through the normal account-password workflow |
| `QA_*`, `DR_*`, and migration confirmation variables | F — test/operation credential | QA, recovery, and guarded scripts | No | Isolate from Production and never commit values |

Other environment credentials remain infrastructure or provider credentials,
including SQL, object storage, Redis gateway, cron, authentication bootstrap,
and QA/deployment-only values. They are not cryptographic data keys and are not
handled by the secret ring. Their names and presence must still be managed by
the deployment secret provider; their values must never be committed.

## Ring semantics

Each purpose has a bounded two-slot ring:

```text
CURRENT + optional PREVIOUS
```

The purpose-specific names are:

| Purpose | Current | Previous | Version metadata |
| --- | --- | --- | --- |
| Membership code | `MEMBERSHIP_CODE_SECRET_CURRENT` | `MEMBERSHIP_CODE_SECRET_PREVIOUS` | `MEMBERSHIP_CODE_SECRET_CURRENT_VERSION`, `MEMBERSHIP_CODE_SECRET_PREVIOUS_VERSION` |
| Member portal session | `MEMBER_PORTAL_SESSION_SECRET_CURRENT` | `MEMBER_PORTAL_SESSION_SECRET_PREVIOUS` | `MEMBER_PORTAL_SESSION_SECRET_CURRENT_VERSION`, `MEMBER_PORTAL_SESSION_SECRET_PREVIOUS_VERSION` |
| Public registration | `PUBLIC_REGISTRATION_SECRET_CURRENT` | `PUBLIC_REGISTRATION_SECRET_PREVIOUS` | `PUBLIC_REGISTRATION_SECRET_CURRENT_VERSION`, `PUBLIC_REGISTRATION_SECRET_PREVIOUS_VERSION` |

Writes always use `CURRENT`. Verification tries `CURRENT` first and then
`PREVIOUS`, when configured. There is no unbounded key history. Version values
identify the key lifecycle independently from the existing membership code
issuance/version field; no database key-version column is introduced by this
change.

The legacy names remain accepted temporarily:

- `MEMBERSHIP_CODE_SECRET`
- `MEMBER_PORTAL_SESSION_SECRET`
- `PUBLIC_REGISTRATION_SECRET`

An explicit purpose-specific current value takes precedence. If it is absent,
the matching legacy alias is used and a metadata-only fallback metric is
incremented. The old aliases are deprecated and should be removed only after
every runtime has purpose-specific values.

There is no membership-code fallback to `SESSION_SECRET`, an owner password,
a database connection string, or another unrelated credential. A missing
family current secret fails closed. Portal and registration aliases are
compatibility inputs for their own families only; they are never inherited by
another family.

## First rotation legacy bridge

The first transition from a provider-managed legacy value is represented inside
the application process without exposing the legacy plaintext. Each secret
family has its own bridge and a bounded two-slot ring:

| Configuration | Effective current | Effective previous | Mode |
| --- | --- | --- | --- |
| Legacy alias only | Legacy alias | None | `LEGACY` |
| Legacy alias + explicit current | Explicit current | Same-family legacy alias | `TRANSITION` |
| Explicit current + explicit previous | Explicit current | Explicit previous | `EXPLICIT_RING` |
| Explicit current only | Explicit current | None | `CURRENT_ONLY` |

The precedence is uniform: explicit `*_CURRENT` wins over the same-family
legacy alias. Explicit `*_PREVIOUS` wins over the legacy bridge. An explicit
previous value is never accepted without a usable current value. The metadata
exposes only family, mode, presence flags, and `previousSource` (`explicit`,
`legacy_bridge`, or `none`). It does not expose values, hashes, fingerprints,
lengths, or derived key material.

The bridge is strictly family-local:

- `MEMBERSHIP_CODE_SECRET*` is used only for membership HMAC and encryption.
- `MEMBER_PORTAL_SESSION_SECRET*` is used only for portal sessions, visitor
  hashes, and portal idempotency.
- `PUBLIC_REGISTRATION_SECRET*` is used only for registration tokens and
  idempotency.

Adding or rotating a membership current value cannot change the portal or
registration effective key. `SESSION_SECRET` and all other unrelated values
are rejected as fallbacks. New writes use current; verification is current
then previous. A read never performs an automatic rewrap or Production DB
write. Previous retirement requires measured zero usage, completion of the
applicable data/token grace period, and a verified recovery copy.

## Membership codes

New codes use the membership current secret for both HMAC-SHA256 lookup hashing
and AES-256-GCM encryption. A lookup derives a bounded candidate list and
checks current before previous. A ciphertext is decrypted with current before
previous. If the previous key succeeds, only a counter is recorded; no code,
hash, ciphertext, tenant data, or secret is logged.

The existing `membership_code_hash` and
`membership_code_ciphertext` values depend on the secret that created them.
Changing the only active key without a compatibility window would therefore
break lookup or decryption. This implementation prepares an explicit,
tenant-scoped optimistic `rewrapMemberCodeIfPrevious` operation, but no read
path invokes it. Production rewrap requires a separately approved batch or
controlled workflow with transaction/concurrency/audit decisions.

The existing `membership_code_version` remains the code issuance/revocation
version. A future schema proposal may add an independent key version so a row
can identify which ring slot produced its ciphertext. That proposal is not
executed here and is not required for dual-read compatibility.

## Member portal sessions and idempotency

New portal session tokens, visitor hashes, and subscription request idempotency
hashes use the member-portal current secret. Existing values can be validated
with the previous secret during the approved grace period. No automatic session
rewrap or database write occurs during a read. The grace period must be based
on the configured session/token/idempotency lifetimes and observed previous-key
usage, not an invented fixed duration.

After previous-key usage reaches zero for at least the longest applicable
retention window, operators may remove `PREVIOUS` in a separate change. A
portal session rotation must account for the configured portal session expiry,
visitor analytics retention, and pending subscription-request idempotency
lifetime before removal.

## Public registration

New access tokens and idempotency hashes use the public-registration current
secret. Existing request access and idempotency values validate with previous
during the compatibility window. Replays matched through the previous key
continue using their compatible legacy access token; new requests are written
with current.

Registration tokens currently have a bounded token shape, while the database
request lifecycle is the authoritative status boundary. Future token-expiry
introduction must preserve status access for open requests, provide a token
reissue path, and be deployed only with an explicit compatibility window. This
change does not alter expiry or existing registration data.

## Safe metrics

The ring exposes counters only:

- `secret_fallback_usage`
- `membership_secret_current_validation`
- `membership_secret_previous_validation`
- `membership_secret_previous_decrypt`
- `portal_secret_current_validation`
- `portal_secret_previous_validation`
- `registration_secret_current_validation`
- `registration_secret_previous_validation`

Metrics never contain values, tokens, hashes, ciphertext, session identifiers,
member codes, or tenant-sensitive payloads.

## Rotation state machine

```text
ACTIVE_CURRENT
    ↓ provision new current while retaining old value as previous
CURRENT(new) + PREVIOUS(old)
    ↓ dual-read / new-write
grace period and migration planning
    ↓ previous usage is zero after the longest valid lifetime
CURRENT(new) only
    ↓ remove deprecated aliases after all runtimes migrate
purpose-specific current contract only
```

For persistent encrypted data, never delete the old key before proving that
all dependent rows have been migrated or are no longer needed. Never rotate
all three purposes as one opaque operation; rotate one purpose at a time.

## Provider and recovery recommendation

**Primary secret store:** a dedicated encrypted secret manager or the existing
CI/deployment secret store with access control and audit history. Vercel's
encrypted runtime variables alone are not a recovery strategy because their
plaintext values are not retrievable for disaster recovery.

**Recovery copy:** an independently encrypted offline recovery record held by
the authorized system owner, protected by a separate recovery key or password
manager and subject to an access log. It must not be stored in Git, the VPS
application directory, a database dump, an unencrypted document, or a public
artifact.

**Access policy:** least privilege; deployment reads only the variables needed
by that runtime, operators do not print values, and recovery access is
break-glass and audited.

**Backup policy:** back up the encrypted secret-manager metadata and the
independently encrypted recovery record. Test restoration in an isolated QA
environment without changing Production. Do not back up plaintext `.env`
files into application or database backups.

No production secret was moved, changed, generated as a replacement, or
rotated by this implementation.

## Environment contract

`.env.example` contains names and safe placeholders only. Required current
values must be supplied by the deployment secret provider. Previous values are
rotation-only and optional. Legacy aliases remain temporarily supported as
same-family compatibility inputs during the first transition.

Critical cryptographic purposes fail closed when no current value is available.
An unrelated `SESSION_SECRET` cannot become a membership encryption/HMAC key.
In Production, the server validates the effective three-purpose ring before it
starts accepting traffic. During the transition, each purpose must have its own
current or same-family legacy alias; a different family's value never satisfies
the check. Local/test environments keep lazy feature validation so they can
exercise missing-secret failure cases without requiring Production credentials.

## Controlled rotation runbooks

### Rotation 1 — membership code secret

1. Inventory all runtimes and confirm recovery copy availability.
2. Deploy the legacy-bridge semantics to every reader while the existing
   `MEMBERSHIP_CODE_SECRET` remains available inside the trusted runtime.
3. Provision the new value as `MEMBERSHIP_CODE_SECRET_CURRENT`. When the old
   alias and the new current coexist, the application treats the old alias as
   `MEMBERSHIP_CODE_SECRET_PREVIOUS` inside the membership family only. If the
   provider can safely assign an explicit previous value, it takes precedence.
4. Set the current/previous versions and verify health before changing any
   provider value or removing the old alias.
5. Verify current writes, previous HMAC lookup, previous decryption, metrics,
   and tenant/RLS boundaries.
6. Run an approved, tenant-safe rewrap process only after its transaction,
   optimistic-concurrency, audit, rollback, and rate-limit design is approved.
7. Remove `PREVIOUS` only after all dependent data is current or retired and
   previous usage is zero for the measured retention window.
8. Roll back by restoring the last known-good ring assignment; never discard
   the only key that can read persistent rows.

### Rotation 2 — member portal session secret

1. Confirm the recovery copy and measure configured session, visitor, and
   idempotency lifetimes.
2. Move the old value to `MEMBER_PORTAL_SESSION_SECRET_PREVIOUS` and provision
   the new current value.
3. Deploy dual validation before issuing new sessions/tokens.
4. Verify existing sessions, idempotent requests, logout, expiry, and 401
   behavior without logging token material.
5. Keep previous through the longest measured lifetime plus the approved
   operational grace window, then remove it after previous usage is zero.
6. Roll back the ring assignment if validation errors appear; do not mass
   invalidate sessions without a separate security decision.

### Rotation 3 — public registration secret

1. Confirm the recovery copy and inventory open registration requests and their
   access/idempotency lifecycle.
2. Move the old value to `PUBLIC_REGISTRATION_SECRET_PREVIOUS` and provision
   the new current value.
3. Deploy dual validation before generating new public tokens.
4. Verify current and previous status/proof/idempotency access and wrong-key
   denial.
5. Keep previous until all compatible open requests are closed, reissued, or
   otherwise covered by an approved expiry policy, then remove it after zero
   previous usage.
6. Roll back the ring assignment if needed; do not rewrite registration rows
   as an emergency shortcut.

## New-secret checklist

- What does it protect?
- Is persistent data derived from it?
- Is it cryptographic, an infrastructure credential, or a bootstrap secret?
- Which provider owns the primary value?
- Where is the independently encrypted recovery copy?
- How is rotation performed and rolled back?
- What is the measured grace period?
- Does it need an independent version?
- What happens if it is lost?
- What happens if it changes?
- Are values absent from Git, logs, screenshots, docs, dumps, and support output?

## What never to do

- Never use `SESSION_SECRET`, passwords, connection strings, or unrelated
  credentials as a cryptographic fallback.
- Never put a real value in `.env.example`, source, tests, documentation, or
  committed fixtures.
- Never delete an old persistent-data key before compatibility and recovery
  are proven.
- Never perform lazy rewrap as an unreviewed side effect of a read request.
- Never disable RLS, tenant checks, permissions, or plan enforcement during a
  rotation.
- Never rotate Production secrets, change provider values, or alter database
  schema as part of this source-only hardening change.
