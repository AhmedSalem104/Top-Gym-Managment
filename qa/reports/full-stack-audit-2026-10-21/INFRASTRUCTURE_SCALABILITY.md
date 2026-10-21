# Infrastructure and scalability audit

## Repository-described topology

- `infra/caddy/sites/application.caddy`: Caddy serves `getlogicfit.com` / `www`, gzip, request body max 25MB, reverse proxies to `127.0.0.1:3017`, with 2s dial and 120s response/read/write timeouts.
- `infra/docker/daemon.json`: JSON logs bounded to 20MB × 5 files.
- `infra/systemd/`: daily backup service/timer, attendance auto-checkout service/timer, Caddy service; additional cache gateway service exists under `infra/redis`.
- `src/config/env.js`: optional cache gateway; cache disabled by default when `CACHE_ENABLED` absent; bounded timeout/namespace config. This is a source default, not deployed state.
- Production release is Git-triggered with canonical guarded pipeline per AGENTS and `docs/PRODUCTION-CICD.md`; rollback/health gates are defined in source/docs.

## Scalability observations (not capacity conclusions)

- A single local reverse-proxy upstream is described by the checked-in Caddy config. This is consistent with a single-host deployment file but does not prove actual topology or prohibit an upstream/load balancer elsewhere.
- SQL pool limits apply per process; total DB connections scale with process/instance count. Need deployment inventory before capacity assessment.
- In-memory rate limits and other per-process caches do not coordinate across multiple instances.
- Caddy timeouts are long relative to interactive UI; no evidence shows they cause slow requests. Measure server timing before tuning.
- No CDN/object-storage provider, autoscaling policy, replication/failover, WAF, network topology, CPU/RAM sizing, backup age, or RPO/RTO evidence was available.

## Required operational evidence

Redacted release attestation: deployed SHA, runtime/Node, instance count, proxy hops, DB pool totals, cache driver/enabled state, object-storage provider status, TLS/cert health, backup verification metadata, alerting, resource utilization and incident windows. Do not expose secrets.

No production endpoint, host, SSH, provider dashboard, or service was contacted.
