# API reference

All application endpoints are under `/api`. Protected requests require the server session cookie. Existing response shapes are intentionally preserved; this document describes the route surface rather than replacing the contract with a new envelope.

## Health and authentication

| Method | Path | Access |
|---|---|---|
| GET | `/api/health` | Public health check; database connectivity is verified |
| GET | `/api/auth/session` | Public session probe |
| POST | `/api/auth/login` | Public; email and password |
| POST | `/api/auth/logout` | Public/session-aware |
| GET | `/api/auth/users` | Owner |
| POST | `/api/auth/users` | Owner |
| PUT | `/api/auth/users/:id` | Owner |
| PATCH | `/api/auth/users/:id/status` | Owner |

## Members and membership

`/api/members` supports list, details, single-member reads, create, update, freeze, resume, renew, membership creation and delete. The payment path is `/api/memberships/:id/payments`.

## Attendance

| Method | Path |
|---|---|
| GET | `/api/attendance` |
| GET | `/api/attendance/report` |
| GET | `/api/attendance/member/:id` |
| POST | `/api/attendance/check-in` |
| POST | `/api/attendance/check-out` |

## Daily passes / day classes

Daily passes are one-time visits and are intentionally stored separately from members and recurring memberships. They do not create a member record or change an existing subscription.

| Method | Path | Access |
|---|---|---|
| GET | `/api/day-passes/pricing` | Authenticated Owner/Assistant read access |
| PUT | `/api/day-passes/pricing` | Owner |
| GET | `/api/day-passes` | Authenticated Owner/Assistant |
| GET | `/api/day-passes/summary` | Authenticated Owner/Assistant |
| POST | `/api/day-passes` | Authenticated Owner/Assistant |
| POST | `/api/day-passes/:id/whatsapp-opened` | Authenticated Owner/Assistant |
| POST | `/api/day-passes/:id/void` | Owner |

Create a visit with the visitor name, phone, configured type and payment method. The server resolves the current price and returns a prepared Arabic WhatsApp message; the browser opens WhatsApp only after the operator confirms the action.

```json
{
  "visitorName": "أحمد محمد",
  "visitorPhone": "01012345678",
  "passTypeCode": "day_gym_cardio",
  "paymentMethod": "cash"
}
```

## Coaching and nutrition

The coaching routes cover external trainees, clients, measurements, check-ins, workout programs, diet plans, workout sessions and meal logs. Both legacy program aliases remain supported:

- `/api/workoutprograms` and `/api/workout-programs`
- `/api/dietplans` and `/api/diet-plans`

Workout session paths are under `/api/workoutsessions`; meal logs are under `/api/meal-logs`.

## Finance and pricing

| Method | Path |
|---|---|
| GET | `/api/monthly-finance` |
| POST/PUT/DELETE | `/api/expenses` and `/api/expenses/:id` |
| GET | `/api/pricing` |
| PUT | `/api/pricing` and `/api/pricing/:planCode` |
| POST/PUT | `/api/pricing-plans` and `/api/pricing-plans/:planCode` |
| POST/PUT | `/api/membership-types` and `/api/membership-types/:typeCode` |

## Library and reports

| Method | Path |
|---|---|
| GET | `/api/library/options` |
| GET | `/api/library/:type` and `/api/library/:type/:id` |
| POST/PUT/DELETE | `/api/library/:type` and `/api/library/:type/:id` |
| GET | `/api/reports` |
| GET | `/api/dashboard` |
| GET | `/api/dashboard-analytics` |
| GET | `/api/bootstrap` |

## Backup

| Method | Path | Access |
|---|---|---|
| GET | `/api/backup/daily` | Authorized cron request |
| GET | `/api/backup/download` | Owner |
| GET | `/api/backup/history` | Owner |
| GET | `/api/backup/archives/:id` | Owner |
| DELETE | `/api/backup/archives/:id` | Owner |
| POST | `/api/backup/inspect` | Owner; raw upload |
| POST | `/api/backup/restore` | Owner; raw upload |

## Error behavior

Authentication and authorization retain `401` for missing/expired sessions and `403` for forbidden actions. Do not expose SQL, stack traces, credentials or connection strings in production responses.
