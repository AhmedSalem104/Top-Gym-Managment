# TOP GYM Design System

The UI uses one Vanilla CSS entrypoint: `public/css/main.css`. The HTML shell links this file once in `<head>` so authenticated and unauthenticated states receive the same deterministic style surface without JavaScript-injected CSS.

## Load order

```text
main.css
  -> tokens.css
  -> reset.css
  -> typography.css
  -> layout.css
  -> utilities.css
  -> components/*
  -> pages/*
  -> responsive.css
  -> print.css
```

`build:css` validates the import graph and fails on missing files, circular imports, unbalanced braces, empty media queries, undefined custom properties, duplicate stylesheet links, or missing print coverage.

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
