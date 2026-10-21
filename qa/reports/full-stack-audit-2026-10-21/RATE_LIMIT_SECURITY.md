# Rate-limit and abuse-control audit

## Implemented source policy

`src/middleware/rate-limit.middleware.js` exposes a bounded in-memory Map adapter and policy factories:

| Policy | Defaults visible in source | Scope/key | Caveat |
|---|---:|---|---|
| Sensitive non-GET methods | 120 / 60 sec | client IP | Broad write umbrella; local store per process |
| Login attempts | 10 / 15 min | IP + normalized email | Does not establish distributed enforcement |
| Member portal writes/lookups | IP 30/min and IP+digest(code) 8/15min | portal lookup | Occupancy has separate 60/min IP and 60/15min code limits |
| Backup actions | 6 / 10 min | trusted tenant/user + IP | Per-process unless shared store injected |

Rate-limit store failures fail closed (503); exceeded quotas return 429 and `Retry-After`. Portal code is SHA-256 digested before use as a key. Store contract supports injection/fallback, but production adapter/configuration is not verified. `sensitiveRateLimit` skips GET/HEAD/OPTIONS.

## Risks / recommendations

- **Confirmed architectural limitation:** memory counters do not coordinate across Node processes or hosts. If production is single-process, this is still restart-resettable; if multi-instance, each instance has its own budget. Actual topology and configured store are NOT VERIFIED.
- Establish a documented endpoint policy matrix (login, public token/code endpoints, expensive exports/backups, sensitive mutations), keyed by trusted identity/context and IP as appropriate.
- If distributed enforcement is needed, use the existing adapter contract and approved cache gateway only after validating atomic increment+TTL, outage behavior, privacy-safe keys and tenant/user boundaries. Do not introduce Redis speculatively.
- Determine correct proxy trust hops before using request IP; deployment config says Caddy reverse proxy while env defaults production to one hop. Confirm exact chain and reject spoofable forwarded values.
- Derive thresholds from observed legitimate traffic and abuse telemetry, not arbitrary lowering.

No limits were exercised; no production traffic or rate-limit settings were inspected.
