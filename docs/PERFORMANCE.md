# Performance Baseline Runner

`npm run perf:baseline` is a permanent, read-only latency measurement tool. It sends only `GET` requests with an already-issued session cookie; it never logs in and never prints or writes cookies, tokens, credentials, response bodies, member data, or payment data.

## Local baseline

Use a session cookie from an already-running local/staging browser session. Do not place the value in Git or a committed `.env` file.

```powershell
$env:PERF_BASELINE_ENV = 'local'
$env:QA_BASE_URL = 'http://127.0.0.1:3010'
$env:PERF_TENANT_COOKIE = 'topgym_session=<existing-session-cookie>'
$env:PERF_TENANT_SLUG = 'top-gym'
$env:PERF_BASELINE_LABEL = 'before'
$env:PERF_BASELINE_SAMPLES = '5'
$env:PERF_BASELINE_WARMUPS = '1'
$env:PERF_BASELINE_CONCURRENCY = '1'
$env:PERF_BASELINE_TIMEOUT_MS = '30000'
npm run perf:baseline
```

For platform endpoints, set `PERF_PLATFORM_COOKIE` instead. Both cookies may be provided to measure both scopes. A member ID can be supplied with `PERF_MEMBER_ID`; otherwise the first ID from the bounded members page is used only in memory for the details run. `PERF_MEMBER_SEARCH` enables the optional server-side search route without writing the term to the report.

The default output is `qa/reports/baseline-<label>.json`, which is ignored by Git. To compare an after run with the default before file:

```powershell
$env:PERF_BASELINE_LABEL = 'after'
npm run perf:baseline
```

You can explicitly select another comparison file with `PERF_COMPARE_FILE` and another output path with `PERF_OUTPUT_FILE`.

## Staging guard

External targets are rejected unless all of the following are explicit:

```powershell
$env:PERF_BASELINE_ENV = 'staging'
$env:PERF_BASELINE_CONFIRM = 'staging'
$env:PERF_BASELINE_ALLOWED_HOSTS = 'staging.example.com'
$env:QA_BASE_URL = 'https://staging.example.com'
```

Production-like hostnames and `VERCEL_ENV=production` are blocked. There is no `--force` bypass. Baseline caps are deliberately conservative: 20 measured requests, 5 warm-ups, concurrency 5, and a 1,000-request total budget. This is not a load-test tool.

## Measurements

Each endpoint gets separate warm-up and measured results. Measured latency uses `performance.now()` around `fetch()`, so total API latency includes network/proxy time. If the application exposes safe `Server-Timing` metrics, the report also contains:

- `serverApplicationMs`: server-side application duration.
- `dbLatencyMs`: aggregate DB critical-path duration.
- `dbWorkMs`: sum of DB query durations, which may overlap.
- `applicationNetworkOverheadMs`: total runner latency minus DB duration; this includes network and is not pure Node execution.
- `serverApplicationOverheadMs`: server application duration minus DB duration.

When `Server-Timing` is absent, DB fields are `null` and the human report displays `DB TIMING: NOT AVAILABLE`. Only safe duration/query-count metric names are parsed; SQL text and internal details are never exposed.

The runner sends `X-Logic-Fit-Baseline: read-only`. The server rejects accidental `POST`, `PUT`, `PATCH`, and `DELETE` requests bearing that marker, and read-triggered attendance auto-checkout/subscription synchronization/catalog seeding are skipped for baseline reads. The member-portal code lookup is intentionally not included because its current contract is `POST`; only safe library `GET` endpoints are eligible.

The runner is a measurement tool, not proof of production capacity. Use its before/after data to identify slow endpoints, then inspect real SQL execution plans and run the later dedicated load-test phase with synthetic data only.
