# Payment Ledger Reconciliation

## Current result

The September report used the collection-date contract:

```sql
paid_at >= '2026-09-01'
AND paid_at < '2026-10-01'
```

For Top Gym, the audited total was 5,280 EGP across 16 ledger rows. Transaction 366 was an exact duplicate of transaction 365 for the same member and membership: both represented 350 EGP, while transaction 366 was the legacy subscription row linked to source payment 3932.

The correction preserved transaction 366 and marked it `is_voided=1` with a reason and UTC audit timestamp. It did not delete the row, rewrite `paid_at`, or change the related `gym_payments` summary. The active September ledger total is now 4,930 EGP across 15 rows.

The remaining 15 rows still have `paid_at=2026-09-01`. Their `created_at` values are UTC; values close to 22:00–23:00 UTC are after midnight on 1 September in the configured Africa/Cairo timezone. No date was moved without evidence of the actual collection date.

## Future payment contract

- `paid_at` is the collection date and is stored separately from member registration date and membership start/end dates.
- The server validates the date and rejects future dates.
- Positive payment deltas create independent ledger transactions; historical transactions are not rewritten.
- Reports, analytics, finance summaries, platform revenue, and member payment history exclude voided ledger corrections.
- Browser payment mutations send an `Idempotency-Key`; only its SHA-256 digest is stored.
- A replay with the same key and matching operation is safe; reusing a key for a different operation is rejected.

## Controlled commands

Run from the repository root. Do not put secrets in the command line or documentation.

```powershell
# schema migration: use the existing guarded migration workflow and an explicit environment confirmation
$env:MIGRATION_ENV='production'
$env:MIGRATION_PRODUCTION_CONFIRM='I_UNDERSTAND_PRODUCTION_MIGRATION'
npm run migrate:tenancy
Remove-Item Env:MIGRATION_ENV,Env:MIGRATION_PRODUCTION_CONFIRM

# inspect the known fingerprint without changing data
npm run reconcile:payment-ledger

# apply only the known duplicate after fingerprint verification
$env:PAYMENT_LEDGER_REPAIR_CONFIRM='I_UNDERSTAND_PAYMENT_LEDGER_REPAIR'
npm run reconcile:payment-ledger -- --apply
Remove-Item Env:PAYMENT_LEDGER_REPAIR_CONFIRM

# verify the already-corrected state without changing data
npm run reconcile:payment-ledger -- --verify
```

The repair tool is intentionally narrow: it can only void the audited transaction 366 when all expected IDs, tenant, membership, amount, type, source payment, and collection date match. It never deletes payment facts.

## Reconciliation policy

If a remaining `paid_at` value is wrong, correct it only through an authorized, auditable financial correction procedure backed by the actual collection evidence. Do not set all September rows to August merely because their UTC `created_at` is in August.
