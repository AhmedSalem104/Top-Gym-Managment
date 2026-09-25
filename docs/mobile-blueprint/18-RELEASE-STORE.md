# 18 — Release and Store Readiness

## Current Web release authority

`npm run release:production` is the canonical release entrypoint. The pipeline performs exact Git SHA preflight, worktree safety, local gates, release lock, verified backup where required, migration-ledger discovery and safety classification, security/RLS/tenancy gates, immutable candidate health/smoke, cutover, exact-SHA verification, and rollback audit. The remote runner is `scripts/release-production-remote.sh`; it uses the configured canonical SSH identity reference and never stores private keys in source.

Migration ledger is the only source of applied history; `database/migration-manifest.json` is checksum/safety metadata. Historical migrations must not be replayed; migrations 029 and 030 are explicitly forbidden for the current release path.

## Mobile release plan

Future mobile releases require separate signing keys, package identifiers, environments, privacy disclosures, store metadata, crash/telemetry configuration, OTA policy if Expo is selected, and API compatibility policy. None are present as current repository artifacts.

## Required mobile gates

Build reproducibility, type/lint/unit/component/integration/contract/E2E tests, secret scan, dependency audit, Android/iOS signing verification, environment endpoint check, deep-link check, RTL/theme/accessibility check, crash-free smoke, rollback/version compatibility, and store review checklist.
