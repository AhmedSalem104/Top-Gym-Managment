# Roles and permissions

## Roles

### Owner

The Owner can access all eight application areas: `dashboard`, `members`, `trainees`, `management`, `attendance`, `expenses`, `library`, and `reports`. The Owner can also manage pricing, backups/restores, finance and Assistant accounts.

### Assistant

The Assistant can access `members`, `trainees`, `attendance`, and `library`. Coaching operations attached to client/external-trainee records remain available because they are part of the permitted operational paths. Finance, analytics, reports, backups and user management are denied.

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
