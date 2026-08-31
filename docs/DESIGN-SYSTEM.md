# Logic Fit Design System

The UI uses one Vanilla CSS production entrypoint: `public/css/main.css`. The HTML shell links this file once in `<head>` so authenticated and unauthenticated states receive the same deterministic style surface without JavaScript-injected CSS. The editable layer graph lives in `public/css/main.source.css`; the build expands it into one browser asset.

## Load order

```text
main.source.css
  -> tokens.css
  -> reset.css
  -> typography.css
  -> layout.css
  -> utilities.css
  -> components/*
  -> pages/*
  -> responsive.css
  -> print.css
  -> build output: main.css (one browser request)
```

`build:css` validates the import graph and generates the production bundle, then fails on missing files, circular imports, unbalanced braces, empty media queries, undefined custom properties, active imports left in the bundle, duplicate stylesheet links, or missing print coverage. Edit the layer files, not the generated `main.css` artifact.

## Visual language

TOP GYM uses a light blue-gray SaaS workspace with white surfaces, royal blue actions, restrained status colors, subtle borders, and low-elevation shadows. The interface is Arabic-first and RTL; it is intentionally operational rather than neon or gaming-oriented.

## Tokens

All shared values live in `tokens.css`:

- Surfaces: `--color-bg`, `--color-surface`, `--color-surface-muted`, `--color-surface-elevated`
- Actions: `--color-primary`, `--color-primary-hover`, `--color-primary-soft`
- Text: `--color-text`, `--color-text-soft`, `--color-text-muted`, `--color-text-subtle`
- Status: `--color-success`, `--color-warning`, `--color-danger`, `--color-info` and their soft variants
- Shape: `--radius-xs` through `--radius-xl` and `--radius-pill`
- Spacing: `--space-1` through `--space-12`
- Type: `--font-xs` through `--font-3xl`, Cairo-first `--font-body`, and numeric `--font-latin`
- Elevation and motion: `--shadow-*`, `--transition-*`, `--focus-ring`

Do not add a page-level hex value when a token expresses the same intent. If a new semantic value is needed, add it to `tokens.css` first.

## Components

Shared component styles live in `public/css/components/`:

- Buttons: `.btn`, `.btn-primary`, `.btn-light`, `.btn-ghost`, `.btn-danger`, `.btn-icon`
- Forms: `.field`, `.form-field`, `.form-grid`, `.input-group`, `.field-error`
- Surfaces: `.panel`, `.card`, `.stat-card`
- Data: `table`, `.table-scroll`, `.table-actions`, `.pagination`
- Feedback: `.badge-*`, `.alert-*`, `.loading`, `.empty-state`
- Overlays: `dialog`, `.modal-body`, `.dialog-actions`, `.dropdown-menu`
- Navigation: `.topbar`, `.page-tabs`, `.page-tab`, `.sidebar-link`

Every interactive component has a visible `:focus-visible` state, a disabled state where relevant, and a touch target of at least 40–44px. Destructive actions use the danger color and do not rely on color alone when their label is available.

## Layout and breakpoints

The application page container is `min(1440px, 100% - 32px)` on desktop and contracts to 12px/16px gutters on smaller screens. The supported QA widths are:

```text
<= 379px     compact mobile, single-column KPI layout
380–767px    mobile, card/grid layout and contained table scroll
768–991px    tablet, compact navigation and stacked page sections
992–1199px   small laptop, two-column operational layout
1200–1439px  laptop, full desktop components with reduced gaps
>= 1440px    desktop, capped workspace width
```

Tables are contained in `.table-scroll`/`.table-wrap`; the document itself must not gain horizontal overflow. Dialog bodies scroll internally when content is long.

## RTL and LTR

The shell is `dir="rtl"`. Email, phone, dates, IDs, URLs, and currency calculations use LTR direction where it improves readability. Use `.numeric` or `data-numeric="true"` for tabular numbers without changing surrounding Arabic alignment.

## Loading, empty, and error states

Use `.loading`/`.skeleton` for content that is not ready, `.empty-state` for valid empty results, and `.alert-danger` or `.error-message` for recoverable failures. Keep the component height close to the expected content height to avoid layout jumps.

## Performance and lazy loading

The initial shell loads only the core authentication, routing, state, API, global interaction and WhatsApp support. In browser QA this is 12 JavaScript requests and one flattened CSS request before deferred dashboard work starts. Feature modules are loaded once by `feature-loader.js`:

- Dashboard finance, daily passes, alerts and analytics are scheduled after the first dashboard paint.
- Member details and attendance modules load when the members workspace is opened; the member-details event has a replay-safe fallback.
- Reports, library, coaching, print and permissions modules load only when their tab or action is used.
- The smart assistant loads after authentication and the first interaction window, without changing its permission checks.
- The login-only gym background is applied only after the session is known to be unauthenticated, so authenticated refreshes do not download it.

Use versioned script and stylesheet URLs so Vercel can safely cache immutable assets. Avoid adding a direct `<script>` for a module already registered in `feature-loader.js`.

## Print

`print.css` hides authentication, navigation, app actions, dialogs, toast, and pagination. It removes screen-only shadows and overflow restrictions, keeps tables inside the printable width, and applies `break-inside: avoid` to cards and images. Feature-specific print code remains in `public/js/integrations/print-enhancements.js` and is not changed by the CSS layer.

## Accessibility and motion

Use semantic buttons and labels already present in the HTML. Do not remove focus outlines. Motion is limited to small transforms, color transitions, and loading indicators. `prefers-reduced-motion: reduce` shortens transitions and stops long-running animation effects.

## Safe extension rules

1. Add a token before adding a new shared value.
2. Fix shared behavior in `components/`, not in a page file.
3. Use `pages/` only for layout unique to one screen.
4. Keep selectors shallow and avoid `!important`; the existing exceptions are limited to hidden/print/reduced-motion guarantees.
5. Run `npm run build:css` and `npm run qa:gate` after styling changes.

## Platform-wide UI foundation

The current shared foundation is loaded last from
`public/css/components/ui-foundation.css`. It does not introduce a second
palette or a component framework. It reinforces the existing token graph for
focus rings, touch targets, surface hierarchy, input sizing, contained table
scrolling, dialog bounds, safe-area spacing and reduced motion across the Gym
Application, Platform Admin, Member Portal and Register Gym surfaces.

The interaction contract is implemented by `public/js/ui-feedback.js` and the
compatibility bridge in `public/js/button-loading.js`:

- asynchronous buttons keep their width, become disabled and expose
  `aria-busy` while the request is pending;
- loading copy is context-aware (`جاري الحفظ...`, `جاري الاعتماد...`,
  `جاري الرفع...`, etc.);
- success is emitted only by the caller after the server result is confirmed;
- errors use safe caller-provided messages and are announced through the live
  region; and
- delegated handling covers buttons rendered after the initial page load.

The Gym Application also exposes a shared Kiosk mode through
`public/js/kiosk.js`. It is a persisted shell preference, available from the
topbar and the Attendance screen, and hides only the Gym App chrome while
keeping the active operational view available. A fixed exit control, Escape,
and optional browser fullscreen support provide an explicit way back. Platform
Admin, Member Portal and Register Gym remain separate surfaces and are not
changed by this mode.

`scripts/qa-complete-ui.js` is a structural visual runner. It checks the
actual shipped DOM at 13 viewport widths, light/dark evidence widths, all 18
active app sections, Platform Admin panels, Member Portal roots, Store
subviews, Member Portal tools, Register Gym steps and all 20 dialog roots. It
must run against the Express application
server (`QA_BASE_URL=http://127.0.0.1:3000` locally), not a static file server.
It is not a substitute for authenticated workflow, WCAG conformance or
production-device verification; those are reported separately.

## Gym application navigation behavior

The Gym Application uses two deliberate navigation compositions. At desktop
widths (1200px and above), the right-to-left rail is a real layout track: it
starts collapsed to icons, expands smoothly on hover/focus, and can remain
expanded when pinned. The expanded track never covers the topbar or the page
canvas.

At widths below 1200px, the desktop rail is removed from the page flow. The
topbar exposes a labelled menu button that opens a right-side drawer with all
available section labels, a close button, an accessible backdrop, internal
scrolling for long navigation, and focus return to the trigger. This keeps
mobile navigation readable and prevents the old icon-only rail from taking
over the viewport. The drawer uses the existing sidebar tokens and respects
`prefers-reduced-motion`.
