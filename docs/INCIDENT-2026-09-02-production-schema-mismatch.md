# Production Incident — Application/Database Schema Mismatch

Date: 2026-09-02

## Summary

The Production application deployment `adab363` expected Phase 3–8 database
objects that were not proven available in the Production database. The public
Gym and Independent Trainer registration catalog endpoints returned HTTP 500
with `EREQUEST`.

## Recovery

- Broken application commit: `adab363`
- Restored application commit: `80dad9b`
- Restored deployment: `gym-membership-5fkvqa5me-ahmedsalem104s-projects.vercel.app`
- Recovery mechanism: Vercel application promotion/rollback
- Database migration performed: No
- Production data modified: No
- Production environment variables modified: No
- Independent Trainer Production availability: Not yet released

## Verification

After rollback, the Production domain returned successful responses for:

- `/api/health`
- `/api/auth/session`
- `/api/public/gym-registration/catalog`

The active deployment had no HTTP 500 entries in the queried post-rollback
log window.

## Follow-up gate

Before returning to the newer application version, complete an authorized
backup, isolated restore rehearsal, canonical migration rehearsal, RLS and
tenant-isolation verification, and authenticated Gym regression against the
rehearsal database. Production database upgrade remains unauthorized.
