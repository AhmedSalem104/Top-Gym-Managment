# Logic Fit UI Screen Inventory

This is the implementation checklist for the current Vanilla HTML/CSS/JS
application. It is derived from `scripts/discover-screens.js` and the actual
browser audit runner, not only from the visible sidebar.

## Runtime and compatibility

- Framework: Express-served Vanilla HTML/CSS/JavaScript.
- HeroUI decision: no React migration. HeroUI v3 is used as a read-only
  design-system reference through the live MCP; its semantic variants,
  composed surface patterns, focus behavior, and state language are adapted
  into the existing CSS token graph.
- Source of truth: `docs/COMPLETE-SCREEN-INVENTORY.md` plus this checklist.
- Browser evidence: `qa/reports/complete-ui-qa.json` from
  `npm run test:visual:complete`.

## Status legend

Each surface is required to reach:

`DISCOVERED → REVIEWED → UPDATED or NO_CHANGE_NEEDED → FUNCTIONAL_TESTED → VISUAL_TESTED`

The static inventory is the discovery record. The browser audit provides
layout/theme/RTL evidence across the viewport matrix; authenticated business
flows and WCAG conformance remain separate release checks.

## Entry surfaces

| Surface | Route | Source | Status |
|---|---|---|---|
| Gym application / public entry | `/` | `public/index.html` | DISCOVERED · REVIEWED · UPDATED · FUNCTIONAL_TESTED · VISUAL_TESTED |
| Member Portal | `/member-portal` | `public/member-portal.html` | DISCOVERED · REVIEWED · UPDATED · FUNCTIONAL_TESTED · VISUAL_TESTED |
| Platform Admin | `/platform-admin` | `public/platform-admin.html` | DISCOVERED · REVIEWED · UPDATED · FUNCTIONAL_TESTED · VISUAL_TESTED |
| Platform Admin forbidden | `/platform-admin-forbidden` | `public/platform-admin-forbidden.html` | DISCOVERED · REVIEWED · NO_CHANGE_NEEDED · FUNCTIONAL_TESTED · VISUAL_TESTED |
| Register Gym | `/register-gym` | `public/register-gym.html` | DISCOVERED · REVIEWED · UPDATED · FUNCTIONAL_TESTED · VISUAL_TESTED |
| Register Independent Trainer | `/register-trainer` | `public/register-trainer.html` | DISCOVERED · REVIEWED · UPDATED · FUNCTIONAL_TESTED · VISUAL_TESTED |
| Trainer Studio V2 shell | `/trainer-workspace` and `/trainer-workspace/<view>` | `public/trainer-workspace.html`, `public/js/trainer-studio-v2.js` | DISCOVERED · REVIEWED · UPDATED · FUNCTIONAL_TESTED · VISUAL_TESTED |
| Trainer Studio V2 data surfaces | `/trainer-workspace/dashboard`, `/clients`, `/calendar`, `/sessions`, `/training`, `/nutrition`, `/exercises`, `/measurements`, `/progress`, `/goals`, `/checkins`, `/packages`, `/sales`, `/renewals`, `/finance`, `/reports`, `/notifications`, `/tasks`, `/templates`, `/portal`, `/settings` | `public/js/trainer-studio-v2.js` | DISCOVERED · REVIEWED · FUNCTIONAL_TESTED · RESPONSIVE_REVIEWED · LIGHT_REVIEWED · DARK_REVIEWED · RTL_REVIEWED · ACCESSIBILITY_REVIEWED · VISUAL_TESTED |

## Gym application views

All 19 active hash views are included. `branches` is dynamically injected by
`public/js/branch-context.js` and is covered by the delegated listener in
`public/js/page-tabs.js`.

| View | Route | Status |
|---|---|---|
| Dashboard | `#dashboard` | DISCOVERED · REVIEWED · UPDATED · FUNCTIONAL_TESTED · VISUAL_TESTED |
| Members | `#members` | DISCOVERED · REVIEWED · UPDATED · FUNCTIONAL_TESTED · VISUAL_TESTED |
| Trainees | `#trainees` | DISCOVERED · REVIEWED · UPDATED · FUNCTIONAL_TESTED · VISUAL_TESTED |
| Attendance | `#attendance` | DISCOVERED · REVIEWED · UPDATED · FUNCTIONAL_TESTED · VISUAL_TESTED |
| Expenses | `#expenses` | DISCOVERED · REVIEWED · UPDATED · FUNCTIONAL_TESTED · VISUAL_TESTED |
| Reports | `#reports` | DISCOVERED · REVIEWED · UPDATED · FUNCTIONAL_TESTED · VISUAL_TESTED |
| Store / POS | `#store` | DISCOVERED · REVIEWED · UPDATED · FUNCTIONAL_TESTED · VISUAL_TESTED |
| Branches | `#branches` | DISCOVERED · REVIEWED · UPDATED · FUNCTIONAL_TESTED · VISUAL_TESTED |
| Management | `#management` | DISCOVERED · REVIEWED · UPDATED · FUNCTIONAL_TESTED · VISUAL_TESTED |
| Branding | `#branding` | DISCOVERED · REVIEWED · UPDATED · FUNCTIONAL_TESTED · VISUAL_TESTED |
| Member payment methods | `#member-payment-methods` | DISCOVERED · REVIEWED · NO_CHANGE_NEEDED · FUNCTIONAL_TESTED · VISUAL_TESTED |
| Permissions | `#permissions` | DISCOVERED · REVIEWED · UPDATED · FUNCTIONAL_TESTED · VISUAL_TESTED |
| Library | `#library` | DISCOVERED · REVIEWED · UPDATED · FUNCTIONAL_TESTED · VISUAL_TESTED |
| Intelligence | `#intelligence` | DISCOVERED · REVIEWED · NO_CHANGE_NEEDED · FUNCTIONAL_TESTED · VISUAL_TESTED |
| Feedback | `#feedback` | DISCOVERED · REVIEWED · NO_CHANGE_NEEDED · FUNCTIONAL_TESTED · VISUAL_TESTED |
| SaaS billing | `#saas-billing` | DISCOVERED · REVIEWED · UPDATED · FUNCTIONAL_TESTED · VISUAL_TESTED |
| Backup history | `#backup-history` | DISCOVERED · REVIEWED · NO_CHANGE_NEEDED · FUNCTIONAL_TESTED · VISUAL_TESTED |
| Member subscription requests | `#member-subscription-requests` | DISCOVERED · REVIEWED · NO_CHANGE_NEEDED · FUNCTIONAL_TESTED · VISUAL_TESTED |
| Portal analytics | `#portal-analytics` | DISCOVERED · REVIEWED · NO_CHANGE_NEEDED · FUNCTIONAL_TESTED · VISUAL_TESTED |

## Platform Admin, registration, portal, commerce and overlays

The complete runner covers these surfaces as a matrix rather than hiding
them behind the main navigation.

- Platform Admin panels (9): `dashboard`, `gyms`, `requests`,
  `gym-registrations`, `payment-methods`, `backups`, `plans`, `audit`,
  `settings`.
- Gym registration steps (6): steps `1` through `6`.
- Member Portal roots (6): `portalLoginPanel`, `portalResult`,
  `portalHomeView`, `portalFeedbackSection`, `portalSubscriptionSection`,
  `portalLibrarySection`.
- Store subviews (9): `pos`, `products`, `inventory`, `purchases`, `sales`,
  `suppliers`, `expenses`, `reports`, `bar`.
- Member Portal tools (5): `print`, `feedback`, `exercises`, `foods`,
  `subscription`.
- Overlay/dialog roots (29): all roots in `scripts/qa-complete-ui.js`.

Each group is `DISCOVERED · REVIEWED · NO_CHANGE_NEEDED or UPDATED ·
FUNCTIONAL_TESTED · VISUAL_TESTED` in the browser report. Dynamic forms,
filters and state hooks remain represented by the source inventory counts:
183 form/filter hooks and 69 loading/error/status hooks.

## Verification matrix

| Concern | Evidence/status |
|---|---|
| Desktop | PASS in complete browser matrix: 1024–1920px |
| Tablet | PASS in complete browser matrix: 768–820px |
| Mobile | PASS in complete browser matrix: 320–600px |
| RTL | PASS: document direction asserted as `rtl` |
| Light theme | PASS in browser matrix |
| Dark theme | PASS in browser matrix at 390/820/1440px |
| Horizontal overflow | PASS: zero failing cases in report |
| Console/page errors | PASS: zero in report |
| Branches click regression | PASS: synthetic Owner/Gym Playwright click opens `#branches` |
| Keyboard/focus | Shared focus contract implemented; full authenticated keyboard audit remains a separate verification item |
| Authenticated E2E | Existing project E2E suite remains required; this inventory does not invent a PASS result |

## Re-review checklist

Before release, rerun the inventory and the complete browser audit after any
additional UI edit. No screen may be removed from the 7 entry pages, 19 Gym
views, 9 Platform Admin panels, 6 registration steps, 6 portal roots, 9
Store views, 5 portal tools, 29 overlay roots, 183 form hooks or 69 state
hooks without an explicit architecture decision.
