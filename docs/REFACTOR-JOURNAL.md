# Refactor Journal

## 2026-08-19 — CSS Design System restoration

### Scope

Restored the presentation layer after the legacy stylesheets were removed. The DOM, IDs, data attributes, event listeners, API contracts, authentication, permissions, database, and print JavaScript were intentionally left unchanged.

### Changes

- Added a single `public/css/main.css` entrypoint.
- Added centralized tokens, reset, typography, layout, utilities, responsive, and print layers.
- Added shared component styles for buttons, forms, cards, tables, dialogs, tabs, badges, alerts, navigation, dropdowns, pagination, loading, and empty states.
- Added page styles for login, dashboard, members, external trainees, memberships, attendance, expenses, coaching, nutrition, library, and reports.
- Added Cairo-first typography and explicit LTR handling for technical/numeric values.
- Added a no-overflow responsive strategy and internal table/dialog scrolling.
- Replaced the disabled `build:css` no-op with `scripts/validate-styles.js`.
- Extended the QA Gate to require the active CSS surface.

### Browser findings fixed during this phase

- Initial auth load could create document overflow because the app shell remained in layout while authentication was pending. The shell is now removed from layout until auth resolves.
- Mobile navigation actions exceeded the available width. Mobile controls now compact or hide secondary labels/actions without changing their IDs or event behavior.
- Dynamically moved dashboard snapshot statistics had no shared layout rules and SVG icons could expand to their intrinsic size. Snapshot styles and a global `.ui-icon` size were added in the correct layers.
- Tablet page tabs were allowed to expand the document instead of using a contained horizontal scroller. The responsive navigation now contains the tab strip.

### Verification

Static validation passed after the changes. Browser checks covered login and forced unauthenticated dashboard rendering at 375, 430, 768, 1024, 1440, and 1920px. Database-dependent end-to-end login remains environment-dependent and is reported separately rather than being represented as a false pass.
