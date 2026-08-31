# Logic Fit Responsive QA

## Scope

The complete runner covers the 5 HTML entry pages, 18 active Gym Application
views, 9 Platform Admin panels, 6 Register Gym steps, 6 Member Portal roots,
8 Store subviews, 5 Member Portal tools and 20 dialog roots. It checks the
actual DOM rather than only CSS source.

## Evidence command

```powershell
$env:QA_BASE_URL='http://127.0.0.1:3000'
npm run qa:ui
```

The runner must target the Express application server. A static server does
not execute the feature scripts and therefore cannot provide valid UI
evidence.

## Latest local evidence

| Check | Result |
|---|---|
| Viewport widths | 320, 360, 390, 430, 600, 768, 820, 1024, 1280, 1366, 1440, 1536, 1920 |
| Active Gym Application views | 18 |
| Platform Admin panels | 9 |
| Register Gym steps | 6 |
| Member Portal roots | 6 |
| Store subviews | 8 |
| Member Portal tools | 5 |
| Dialog roots | 20 |
| Evidence records | 811 |
| Horizontal overflow | 0 failures in the latest run |
| Main stylesheet duplication | 0 failures in the latest run |
| RTL document direction | 0 failures in the latest run |
| Light/dark structural checks | 0 failures in the latest run |
| Page errors / unexpected console errors / unexpected failed responses | 0 / 0 / 0 |
| Expected protected-API responses in logged-out forced states | 75 (`401`) |
| Runner result | PASS |

The evidence was produced locally on 2026-08-31 against the Express application
server (`http://127.0.0.1:3000`). It is structural visual evidence; it does not prove authenticated
workflow correctness, real tenant data, every device/browser engine, or WCAG
conformance. The latest run recorded 1,106 unnamed-interactive observations
as a review signal; these are not a WCAG result.

## Responsive decisions

- Gym tables use the existing `table-cards.js` labeling contract on small
  screens; comparison-heavy tables remain contained horizontal data views.
- Platform Admin changes from a persistent sidebar to an off-canvas menu.
- Member Portal keeps the login and service flows mobile-first.
- Register Gym keeps step navigation and action controls inside the safe area.
- Dialogs are bounded to the viewport and scroll internally.
- Page-level overflow is forbidden; any data-grid scrolling is contained by
  its own wrapper.

## Not verified

- Real mobile Safari/Chrome device sessions.
- Authenticated Owner, Assistant, Member and PlatformAdmin workflow states.
- Production font/CDN delivery and real tenant content density.
- Screen-reader and keyboard audit by an external accessibility engine.
