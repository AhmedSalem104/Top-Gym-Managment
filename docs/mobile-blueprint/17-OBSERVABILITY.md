# 17 — Observability

## Current server signals

- `/api/health/live` reports application liveness without database access.
- `/api/health` verifies SQL connectivity and reports application/database/storage/cache status.
- `request-id.middleware.js` supplies correlation ids.
- `performance-metrics.js` records request/database timing when enabled.
- Release/Smoke/backup/security scripts emit bounded safe status lines.
- Backup and audit services record operational evidence; secrets and raw portal codes must not be logged.

## Mobile signals

Use a central redacted logger with event names for app start, bootstrap, auth result category, context changes, API latency/status, cache invalidation, upload result category, navigation failure, and crash. Never log password, token, cookie, code, Authorization header, full PII, request body, or private storage key.

## Correlation

Propagate server request id where safe. Include app version, platform, build, workspace, tenant type (not sensitive tenant data), and feature category in telemetry. Do not use analytics to decide authorization. Health/availability and product analytics must remain separate.
