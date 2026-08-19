# Database architecture

## Engine and access

The project uses Microsoft SQL Server through the `mssql` package. `src/database/pool.js` owns one reusable connection pool and parses the server-side connection string. `src/database/transaction.js` provides the transaction boundary helper.

`database/schema.sql` remains the primary idempotent schema source. Runtime compatibility setup still exists in selected services because the application has historically upgraded existing installations without destructive migrations.

## Main tables

- `members`: member identity and contact data.
- `memberships`: plan, type, start/end dates and notes.
- `membership_pricing`, `membership_types`, `membership_type_prices`: catalog and price configuration.
- `membership_freezes`: freeze periods and resume state.
- `gym_payments`, `gym_payment_transactions`: current payment summary and immutable payment events.
- `gym_expenses`: expenses and monthly summaries.
- `gym_attendance`: check-in/check-out records.
- `membership_events`: membership audit events.
- `gym_users`, `gym_auth_sessions`: authentication and sessions.
- `gym_exercises`, `gym_foods`, `gym_muscles`: library catalogs.
- `workout_programs`, `workout_routines`, `workout_exercises`, `workout_sessions`, `workout_set_logs`: training programs and execution.
- `diet_plans`, `diet_meals`, `diet_meal_items`, `meal_logs`: nutrition plans and logs.
- `body_measurements`: coaching measurements.
- `gym_backup_operations`, `gym_backup_archives`: backup history and stored archives.

## Rules

- Use parameterized SQL through `mssql` request inputs.
- Do not concatenate user values into SQL.
- Reuse the pool; do not connect per request.
- Use a transaction for multi-table operations that must be atomic.
- Add indexes only after reviewing query patterns and execution plans.
- Keep existing table/column names unless a separate migration is approved.
- Do not expose password hashes, session token hashes or backup secrets.

## Repository status

Current explicit repository boundaries are member list/details reads, expenses/monthly finance, authentication users and authentication sessions. Large legacy services still contain SQL for their own domain and are the next incremental extraction targets.
