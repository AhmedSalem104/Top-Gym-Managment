# Logic Fit Frontend CSS Audit

## Scope

This audit covers the Gym Application shell, its desktop/mobile navigation,
the Smart Assistant launcher placement, the Register Gym surface, the shared
theme layers, and the generated CSS bundle. It is a presentation-only change;
existing JavaScript handlers, APIs, routes, authentication, permissions and
tenant behavior remain untouched.

## Confirmed findings

1. Shell layout rules were spread across `ui-foundation.css`, `responsive.css`,
   `theme.css`, `tabs.css`, `navbar.css`, `layout.css` and page-specific files.
   Late rules could override widths, positioning and visibility, which caused
   the rail/topbar overlap and click interception reported in the UI.
2. The Smart Assistant launcher retained an old fixed-position presentation
   even though it is rendered inside `#pageTabs`.
3. Register Gym contained a base layer plus a second appended reference layer,
   making spacing and responsive behavior dependent on cascade order.
4. The previous navigation contract did not provide a safe layout track for
   desktop hover expansion or a labelled mobile drawer presentation.

## Implemented design

- `navigation-shell.css` is now the single owner of `.app-shell`, `.topbar`,
  `.page-tabs`, `.page-tab`, shell actions, Kiosk presentation and their
  responsive states.
- Desktop: 84px collapsed rail, 292px expanded rail, smooth token-based track
  transition, focus/pin support and no content overlap.
- Mobile/tablet: labelled fixed drawer below 1200px, explicit close/backdrop,
  body scroll lock and touch-sized controls.
- Smart Assistant launcher is reset to normal flow inside the rail; its panel
  remains in `assistant.css`.
- Register Gym is one token-based adaptive layout with preserved IDs/classes.
- No new palette or theme token was introduced.

## Guardrails

The unit test `Gym App shell styles have one canonical source` checks that the
shell selectors do not return to secondary stylesheets. `main.css` remains a
generated artifact and must be regenerated with `npm run build:css`.

The only intentional shell selector exceptions are print-only rules in
`print.css`; they apply exclusively to print media and do not participate in
the screen cascade.

## Verification status

- Build and CSS validation: PASS.
- Full unit suite: PASS (214/214).
- Complete visual runner: PASS (811 evidence records, 0 page/console/failed
  response diagnostics in its forced-state matrix).
- Responsive shell probes: PASS at 390, 768, 1024, 1280, 1440 and 1920px.
- Browser E2E authenticated workflow: NOT VERIFIED without an authorized
  database/session fixture; the suite timed out before executing app actions.
