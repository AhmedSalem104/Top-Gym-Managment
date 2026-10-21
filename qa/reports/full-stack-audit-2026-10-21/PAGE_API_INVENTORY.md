# Page and API inventory (static)

## Route registration coverage

`src/routes/index.js` imports and registers 28 route modules plus `GET /api/health/live` and `GET /api/health`. A repository scan counted 366 `app.get/post/put/patch/delete` route-registration source lines under `src/routes`. This is not claimed as 366 unique effective endpoints; aliases and route composition must be normalized before an authoritative API count.

Route modules: `auth`, `backup`, `branding`, `branch`, `bar`, `attendance`, `coaching`, `dashboard`, `day-pass`, `finance`, `gym-registration`, `intelligence`, `library`, `member-feedback`, `member-portal`, `members`, `member-subscription`, `notification`, `phone`, `platform-admin`, `pricing`, `platform`, `reports`, `saas`, `stock-location`, `store`, `trainer`, `whatsapp-template` (28 total; `phone` is included in the module count).

Approximate static route-line counts by module (from `rg -c`): auth 17; backup 12; branding 9; branch 7; bar 10; attendance 7; coaching 34; dashboard 3; day-pass 9; finance 4; gym-registration 12; intelligence 6; library 6; member-feedback 2; member-portal 13; members 16; member-subscription 7; notification 10; phone 2; platform-admin 42; pricing 8; platform 13; reports 1; saas 9; stock-location 7; store 33; trainer 61; whatsapp-template 4. Count semantics include declarations and can differ from effective HTTP endpoints.

## Feature-to-route families

| User area | Frontend/source locations | API family / route source | Trigger class |
|---|---|---|---|
| Login/session | `public/login.html`, `public/js/*auth*`, `src/routes/auth.routes.js` | `/api/auth/*` | login, session, logout, password, mobile refresh |
| Members/subscriptions | `public/js/app.js`, `public/js/pages/members/*`, `src/routes/members.routes.js`, `member-subscription.routes.js` | `/api/members*`, `/api/memberships*` | list/search/details and explicit mutations |
| Attendance | `public/js/pages/attendance/*`, `src/routes/attendance.routes.js` | attendance check-in/out, daily list/summary | page load/search/action/refresh |
| Dashboard/analytics | `public/js/pages/dashboard/*`, `src/routes/dashboard.routes.js` | dashboard and analytics endpoints | selected dashboard/tabs/scope |
| Finance/reports | `public/js/pages/finance/*`, `reports/*`, route modules | finance/report endpoints | screen/filter/export |
| Coaching/library/trainer | `public/js/pages/coaching/*`, `library/*`, trainer modules | `/api/coaching*`, `/api/library*`, `/api/trainer*` | lazy screens, searches, saves |
| Platform/SaaS | management/platform modules | `/api/platform-admin/*`, `/api/platform/*`, `/api/saas/*` | role-gated operations |
| Store/bar/stock | `public/js/pages/store/*`, route modules | `/api/store*`, `/api/bar*`, `/api/stock-location*` | POS, inventory, reports |
| Member portal | `public/member-portal.html`, portal module | `/api/member-portal/*` and compatibility analytics | public-code lookup/portal actions |
| Admin utilities | backups, permissions, feedback, payment methods, WhatsApp | corresponding route modules | permission-gated management |

The table intentionally gives endpoint families where a complete route-path export is not yet normalized; exact paths remain in `src/routes/*.routes.js`. No live request was made.

## Frontend page inventory

HTML files discovered: `change-password.html`, `index.html`, `login.html`, `member-portal.html`, `platform-admin.html`, `platform-admin-forbidden.html`, `register-gym.html`, `register-trainer.html`, `trainer-workspace.html`; plus four dialog fragments under public dialogs for backup/coaching/library/permissions. Feature modules are under `public/js/pages/` (attendance, branding, coaching, dashboard/analytics, finance, intelligence, library, management, members, platform, reports, SaaS, store/bar POS, trainer).

## Limits and next evidence

Static `/api/` counts are not requests-per-page. Dynamic endpoint construction, shared `public/js/core/api.js`, `public/js/app.js`, route aliases, conditional screens and permissions prevent reliable page counts by grep. Runtime request count, duplication, status, latency and payload are **NOT MEASURED**. Next safe step: browser network capture with authorized test accounts on isolated staging, read-only workflows first; record endpoint, trigger, repeats, tenant/branch scope, cache headers, bytes, duration, and cancellation behavior.
