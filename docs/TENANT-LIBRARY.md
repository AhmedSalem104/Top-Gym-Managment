# Tenant library provisioning

The Logic Fit catalog is a tenant-owned baseline. New gyms receive independent
rows for the repository seed files in `data/library/`:

- `muscles.json`
- `foods.json`
- `exercises.json`

The seed never reads Top Gym rows. Every catalog row is written with the target
`tenant_id`, and the stable `source_id` is unique only inside that tenant. RLS
remains enabled as a second protection layer, while the library service also
adds explicit tenant predicates to reads, writes, joins and reference checks.

Onboarding provisions the catalog inside the same transaction that creates the
tenant and its first Owner. A per-tenant database row lock prevents concurrent
instances from seeding the same tenant twice. The process-local in-flight map
is tenant-keyed as an additional optimization for warm serverless instances.

## Repair an existing gym

The repair command is explicit and safe-target guarded. It is intentionally not
called from a GET request.

```powershell
$env:LIBRARY_REPAIR_ENV='staging'
$env:LIBRARY_REPAIR_CONFIRM='staging'
$env:LIBRARY_REPAIR_ALLOWED_HOSTS='sql.staging.example'
$env:LIBRARY_REPAIR_TENANT_SLUG='powergym'
npm run repair:library
```

For a controlled non-production repair of all known tenants, use
`LIBRARY_REPAIR_ALL=true` instead of a tenant id/slug. Repairs run sequentially
and are idempotent. The command does not accept Top Gym as an implicit fallback.

The legacy single-column source keys are replaced by filtered unique indexes:

```text
(tenant_id, source_id) WHERE source_id IS NOT NULL
```

The runtime tenancy migration applies this change for existing databases. It
does not delete catalog rows or overwrite custom rows that do not carry a
canonical source id; canonical rows are synchronized from the repository seed
files.
