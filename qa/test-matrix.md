# TOP GYM Test Matrix

## API and domain coverage

| ID | Area | Scenario | Expected |
|---|---|---|---|
| API-001 | Health | Database connected | 200 + connected |
| API-002 | Membership | Duplicate phone | 409 + existing member name |
| API-003 | Membership | Freeze limit exceeded | 400 and no extra freeze |
| API-004 | Finance | Partial payment | remaining equals due minus paid |
| API-005 | Finance | Expense update/delete | monthly net recalculates |
| API-006 | Attendance | Same-day duplicate check-in | 409 |
| API-007 | Attendance | Next-day check-in | allowed |
| API-008 | Attendance | Auto checkout | source is `auto` after threshold |
| API-009 | Backup | Valid gzip and bak inspect | valid + integrity verified |
| API-010 | Backup | Restore without confirmation | 400 and no restore |
| API-011 | Coaching | External trainee | no Gym membership required |
| API-012 | Training | Failed child creation | no incomplete program |
| API-013 | Nutrition | Quantity/serving calculation | totals scale correctly |
| API-014 | Library | Malformed import | rejected without partial write |
| API-015 | Reports | Empty date range | valid zero-state, no NaN |

## UI coverage

Run the UI agent against every visible tab at:

`1440px`, `1280px`, `1024px`, `768px`, `430px`, `390px`, `360px`.

Check: no horizontal overflow, no hidden action required for a primary task, no modal/dropdown clipping, correct RTL/LTR for phone/date/money, keyboard focus, reduced motion, loading/empty/error states, and print/PDF actions.

## Release thresholds

- P0/P1 findings: `0`.
- `qa:gate`: pass.
- `npm audit --audit-level=high`: pass.
- Smoke test: pass on isolated test database.
- All changed domain tests: pass.
- No unreviewed API/Schema change from UI or performance work.

