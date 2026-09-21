# Logic Fit Design System

## Direction and product contract

Logic Fit uses TailAdmin/Tailwind as its visual reference and the **Calm Data
Workspace** language: compact operational layouts, quiet surfaces, semantic
status colors, restrained borders, and clear data density. The product is
Arabic-only and RTL-only (`lang="ar" dir="rtl"`). Cairo remains the primary
typeface and the Logic Fit blue/deep-navy identity remains the product brand.

TailAdmin is a visual/component reference only. The application remains
HTML + Vanilla JavaScript on the existing Express/SQL Server stack; React,
Next.js, and JSX are not part of the UI architecture.

## Source of truth

The stylesheet graph is intentionally small and deterministic:

```text
public/css/tailwind.source.css
  -> Tailwind v4
  -> functional-state.css        (behavior/accessibility visibility only)
  -> shared-components.source.css (tokens and shared component contracts)
  -> public/css/main.css
  -> public/css/app-shell.css
  -> public/css/login-entry.css
```

`main.source.css` and `app-shell.source.css` both point to the same Tailwind
source. The build pipeline generates the browser artifacts; generated CSS is
never hand-edited. HTML and dialog fragments are scanned with explicit
`@source` entries. Runtime-created states use semantic classes so lazy loading
cannot purge dynamic utilities or create a second visual owner.

## Ownership model

```text
Semantic tokens
  -> shared foundation
  -> app shell/layout
  -> feature composition/content
```

`shared-components.source.css` owns the anatomy and states of buttons, form
controls, cards, data tables, badges, dropdowns, tabs, pagination, dialogs,
feedback, and context controls. Feature composition may arrange those
components in grids/workspaces, but must not redefine their shells, states,
generic spacing, or theme.

Allowed shared variants are limited to documented semantic variants such as
primary/secondary/ghost/danger/icon buttons, default/stat/summary cards,
compact/data tables, and small/medium/large/workspace dialogs. Do not add a
page-specific duplicate when a shared variant can express the need.

## Tokens and themes

Use the semantic `--lf-*` variables in `tailwind.source.css` for surfaces,
text, borders, focus, brand, success, warning, danger, info, spacing, radius,
shadows, and motion. Light and dark change token values, not component
selectors. New values must be added as semantic tokens before use.

## Responsive and RTL contract

The supported visual QA widths are 1920, 1440, 1366, 1024, 768, 430, 390,
360, and 320px. Desktop uses a real RTL sidebar layout track; tablet and
mobile recompose into a right-side drawer and single-column workspaces. The
document must never gain horizontal overflow, and mobile tables use contained
scroll or record composition where the existing screen provides it.

Use logical properties (`margin-inline`, `padding-inline`, `inset-inline`) for
new layout rules. Keep phone numbers, dates, identifiers, URLs, and currency
readable with local `dir="ltr"` data fields without introducing an LTR UI or
language switcher.

## Functional protection

The visual migration must preserve the contract in
`docs/UI-FUNCTIONAL-FLOW.md`: routes, APIs, IDs, `data-*` hooks, events,
permissions, entitlements, branch/section context, authentication, tenant
isolation, RLS, validation, and business workflows. `functional-state.css`
may contain only state/visibility/accessibility behavior such as `hidden`,
auth pending/locked, drawers, dialogs, and reduced-motion safeguards.

## Accessibility and QA

All interactive controls keep semantic labels, keyboard operation, visible
focus, accessible state attributes, adequate touch targets, and reduced-motion
support. Validate shared components in Arabic RTL, Light, Dark, and the
representative desktop/mobile widths after changes. Run:

```text
npm run build
npm run test:unit
npm run qa:gate
npm run test:visual
git diff --check
```

Do not add arbitrary `!important`, specificity escalation, legacy stylesheet
imports, page-level component overrides, or a second design system.
