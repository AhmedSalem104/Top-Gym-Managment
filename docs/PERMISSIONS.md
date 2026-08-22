# Roles and permissions

## Roles

### Owner

The Owner can access all application areas, including the Owner-only `feedback` screen for member ratings. The Owner can also manage pricing, backups/restores, finance and Assistant accounts.

### Assistant

The Assistant can access `members`, `trainees`, `attendance`, and `library`. Coaching operations attached to client/external-trainee records remain available because they are part of the permitted operational paths. Finance, analytics, reports, backups, user management and member feedback are denied.

Member feedback is Owner-only: the Assistant tab is hidden and every request to
`GET /api/member-feedback` is rejected server-side with `403`. The public portal
submission endpoint accepts a membership code only and never grants the
Assistant or any session user access to the feedback list.

## Enforcement

`src/permissions/role-permissions.js` is the single backend policy module. `src/middleware/auth.middleware.js` loads the current user from the session and calls the policy before a request reaches a route.

`public/js/core/permissions.js` only controls which tabs are visible and where an Assistant is redirected. It is not a security boundary. A direct Assistant request to a forbidden API must still receive `403`.

## Policy maintenance

When adding a new domain:

1. Add the tab mapping in the frontend only for UX.
2. Add the backend route rule in `role-permissions.js`.
3. Add Owner/Assistant API tests.
4. Add direct-route E2E coverage.
5. Verify that no broad path rule accidentally exposes a sensitive endpoint.
