# Logic Fit Production CI/CD

## Source and trigger

`main` is the production source branch. A push to `main` starts the GitHub
Actions production workflow. The workflow checks out the event SHA and passes
that full SHA to the existing `npm run release:production` entry point.

Normal releases use the Git transport. The VPS fetches the requested commit
from the configured repository into an isolated bare cache and materializes
`/opt/logicfit-vps/app-<full-sha>`. The running release directory is never
updated in place and no full application archive is copied over SCP. The
archive transport remains available only as an explicitly selected emergency
fallback.

The required equality is:

`requested SHA == fetched SHA == release marker SHA == deployed SHA`

The repository URL and VPS release settings live in
`config/production-release.json`. The private SSH identity is local/CI secret
material only; it is not part of the repository.

## Ordered release gates

The existing release runner owns one lock for backup, migration, security
checks, candidate validation, and cutover. A concurrent release fails closed.

1. GitHub CI installs locked dependencies and runs unit, backup, database
   readiness, QA, build, and dependency-audit gates.
2. The VPS fetches and verifies the exact commit into the immutable release
   directory.
3. A production backup is created and verified by the existing Logic Fit
   backup/recovery service. Metadata, checksum, payload integrity, and the
   recovery point must pass.
4. The migration ledger is the only source of truth for applied migrations.
   The manifest supplies safety/checksum metadata. Only pending,
   `SAFE_AUTOMATIC` migrations in the release manifest are eligible.
5. RLS/Tenancy verification runs before candidate cutover when migrations are
   pending.
6. A candidate is started with the current production environment, health and
   public smoke are checked, and only then is the container cut over.
7. The deployed SHA and health endpoints are verified. The prior container
   and immutable release remain available for rollback.

Code-only releases do not run a production backup or migration unless the
verified release gate detects a pending migration. Migration releases require
the backup and security gates. Historical migrations are never replayed;
029 and 030 are forbidden for this deployment line.

## GitHub Actions status

The workflow records a GitHub Deployment for `production-vps`:

| User-facing phase | GitHub deployment state |
| --- | --- |
| PENDING | queued |
| BUILDING | in_progress, pre-deploy checks |
| DEPLOYING | in_progress, VPS release runner |
| SUCCESS / FAILED | success / failure |

The workflow uses repository `contents: read` and `deployments: write`. The
VPS SSH private key is supplied through an encrypted GitHub Actions secret
named `VPS_SSH_PRIVATE_KEY`, materialized only in the runner temporary
directory for the job, and removed by the runner. It must never be committed,
logged, or placed in an environment file tracked by Git.

## Rollback policy

- Before migration: keep the current container running.
- Transactional migration failure: the transaction fails and the current
  container remains active.
- Migration success followed by candidate/deploy failure: keep the prior
  compatible container and use the immutable prior release.
- Destructive or non-backward-compatible migrations are not automatic; they
  require explicit review and a verified recovery plan.

Emergency archive fallback:

`RELEASE_TRANSPORT=archive npm run release:production -- --sha <full-sha> --transport archive`

It is not the normal deployment path.

## Failure-path tests

`npm run release:self-test` covers the release gate decision table and the
Git-fetch renderer, including no-pending/already-applied no-ops, backup or
checksum failure, concurrent release, migration failure, RLS/Tenancy failure,
health failure, and SHA mismatch. These tests are synthetic and do not run
destructive operations against Production.

Every release also keeps an audit record containing only release metadata,
gate results, migration status, recovery point, and rollback target. Secrets,
tokens, hashes, payloads, and business data are not written to the audit.
