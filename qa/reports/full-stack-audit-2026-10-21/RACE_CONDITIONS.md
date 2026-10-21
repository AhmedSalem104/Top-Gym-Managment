# Concurrency and idempotency audit

## Confirmed patterns

- `src/services/auth-service.js` `mobileRefresh()` selects active/unexpired refresh row, then performs `UPDATE ... WHERE id=@id AND revoked_at IS NULL`, but does not inspect affected rows before creating new access and refresh sessions. Two concurrent requests can both pass the SELECT; one update may affect zero rows and still mint sessions. **Potential replay/rotation race confirmed by code sequence; no dynamic exploit test performed.**
- `src/services/member-service.js` contains payment idempotency-key hashing and lookup with `UPDLOCK,HOLDLOCK`, operation fingerprint conflict checking, plus transaction helper usage. This is positive evidence for that path; end-to-end DB constraint/transaction guarantees require migration/schema verification.
- `src/services/member-subscription-service.js` documents transactional/idempotency support in the existing audit notes; exact coverage of every write mode should be mapped before asserting universal protection.
- `src/services/attendance-service.js` check-in inserts and catches SQL duplicate key errors, suggesting expected unique constraint handling. The deployed constraint/index, transaction isolation and race response are NOT VERIFIED. Check-out reads existing record then updates by ID; concurrent checkouts should be tested for stable semantics.
- Backup actions have rate limiting and dedicated release/recovery verification, but concurrency/restore isolation was not tested.

## Safe remediation proposal (not implemented)

For refresh rotation, atomically consume exactly one active row (conditional `UPDATE ... OUTPUT` or equivalent transaction/locking), require one affected row before issuing replacement tokens, and test two synchronized refresh requests: exactly one succeeds. Keep token hash storage and revocation behavior. Review family/session revocation semantics and mobile blueprint before changing the shared auth contract.

For attendance, inspect approved migration ledger/schema for unique key covering tenant/member/date/scope semantics, then execute isolated synthetic concurrency test in staging. Do not create an index or modify the live schema from this audit.

## Unverified

No concurrent requests, retries, client double-submit, network-loss-after-commit, multi-process race, database deadlock, or idempotency replay was run. Mobile contract docs were not changed because this is an audit-only finding, not an implementation.
