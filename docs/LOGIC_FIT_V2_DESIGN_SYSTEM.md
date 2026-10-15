# Logic Fit Design System V2

**Status:** Canonical UI specification; implementation and migration are tracked separately.  
**Identity:** Original, professional, Vercel/Geist-inspired Logic Fit UI. This is not a pixel copy of another product.  
**Functional rule:** presentation only; existing application behavior remains authoritative.

## 1. Brand foundations

- Primary brand: Azure Blue `#0070F3`. Use semantic tokens, never page-specific copies.
- Preserve semantic success, warning, danger, information, tenant branding and domain-specific visualization colors. Do not mechanically replace every blue hue.
- Arabic: Tajawal. English: Geist Sans. When fonts cannot load, provide language-appropriate sans-serif fallbacks and keep text visible with `font-display: swap`.
- Icon style: Lucide outline geometry, approximately 1.75–2 stroke. One shared icon source and a compact icon subset; do not add per-screen icon libraries or emoji.
- Arabic is RTL; English is LTR. Prefer CSS logical properties; isolate phones, dates, emails, amounts and identifiers as LTR/numeric content.
- Light and Dark are mappings of the same semantic roles and component hierarchy, not separate page designs.

## 2. Token contract

`public/css/tokens.css` is the only canonical source for design values and theme maps. Theme-scoped values in that file are intentional mode mappings, not duplicate owners. Component and feature CSS consumes tokens; it does not redefine global theme values.

### Color roles

| Role | Contract |
|---|---|
| Azure scale | 50 `#EAF3FF`, 100 `#D6E8FF`, 200 `#ADD1FF`, 300 `#80B8FF`, 400 `#4C9AFF`, 500 `#0070F3`, 600 `#0061DD`, 700 `#0052C7`, 800 `#003F99`, 900 `#002B66` |
| Primary | `#0070F3`; hover/active may use darker accessible steps in Light and lighter steps in Dark while preserving the Azure identity |
| Surfaces | app canvas, surface, elevated surface, input and inverse/navigation surface |
| Text | primary, secondary, muted, disabled, inverse |
| Border | default, subtle, strong, interactive, focus |
| Semantic | success, warning, danger, info; each has foreground/surface/border roles |
| Interaction | focus ring, selected, hover, pressed, disabled, overlay |

Runtime tenant branding remains supported. The default Logic Fit brand is Azure; a tenant's explicitly configured branding must continue to resolve through the existing branding contract.

### Typography

| Token role | V2 target |
|---|---|
| Page title | 24px, weight 600 |
| Main body | 14px, weight 400, line-height 1.6 |
| Secondary | 13px, weight 400 |
| Emphasis | weight 500 |
| Headings | weight 600; line height tuned to heading size |
| Compact data | 12–13px only where density/accessibility permit |

Use tabular figures for aligned numerical columns. Labels remain visible; placeholder is not a label. Print typography has its own semantic mapping while using the same type roles.

### Spacing, shape, elevation and size

- Spacing rhythm: 4px base and 8px primary rhythm; compose section gaps from semantic spacing tokens.
- Buttons radius 8px. Inputs radius 8px. Cards radius 10px. Dialog radius 10px.
- Elevation is restrained: border-first surfaces, low shadows for floating layers only.
- Icon sizes: 16px compact/table, 18px navigation, 20px common button, 24px prominent content.
- Button heights: small 32px, medium 40px, large 44px; touch targets must still reach 44px when used on touch surfaces.
- Select a shared z-index scale for content, sticky elements, menus, overlay, modal and toast. Do not resolve stacking bugs by arbitrary per-page z-index escalation.

## 3. Canonical owners

The active owner map must be verified against consumer tests before old CSS is removed.

| Primitive | Canonical owner (current source boundary) |
|---|---|
| Tokens/theme maps | `public/css/tokens.css`; theme behavior in `public/js/theme.js` |
| Typography | `public/css/typography.css` |
| Buttons/icon buttons | `public/css/components/buttons.css` |
| Forms/inputs | `public/css/components/forms.css`; phone-specific contract remains `phone-inputs.css` |
| Cards/surfaces | `public/css/components/cards.css` |
| Tables | `public/css/components/tables.css` |
| Pagination | `public/css/components/pagination.css` and `public/js/pagination.js` |
| Badges/alerts/feedback/empty/loading | respective existing `components/{badges,alerts,feedback,empty-states,loading}.css` owners |
| Tabs | `public/css/components/tabs.css` |
| Dropdowns | `public/css/components/dropdowns.css` |
| Dialog foundation | `public/css/components/modal-foundation.css`; domain dialogs own content and lifecycle |
| Notifications | `public/css/components/notifications.css`, `public/js/notification-center.js` |
| Gym navigation shell | `public/css/components/navigation-shell.css`, `public/js/page-tabs.js` |
| Print | `public/css/print.css` plus a narrowly scoped domain print source where existing behavior requires it |
| Feature composition | existing `public/css/pages/<feature>.css`; may not redefine shared primitive semantics |

One primitive has one visual owner. A feature may compose primitives but may not redefine their shared geometry/state. Domain-specific layouts are permitted when they express unique information structure rather than a second visual system.

## 4. Component behavior contracts

- **Buttons:** solid, outline, ghost, soft, destructive and link variants; default, hover, pressed, focus-visible, loading and disabled. Loading preserves width and async semantics.
- **Inputs:** 32/40/44px compact/standard/large controls, persistent label, helper/error association, focus, disabled, readonly and required. Preserve Smart Phone Input parsing and validation.
- **Select/data dropdown:** preserve options, values, keyboard selection, search contracts and dismissal; anchored on desktop and bounded mobile sheet only when a compatible owner can preserve behavior. Action menus are not data selects.
- **Checkbox/radio/switch:** native semantic state and accessible focus; do not create new business toggles.
- **Cards:** 10px radius, 16px standard padding, 12px content gap; headers/footers/dividers are optional compositions.
- **Tables:** header >=44px, rows >=52px, 14px cells, 13px headers, 16px horizontal cell padding. Preserve columns/actions. Record-oriented mobile tables may become cards; comparative/financial data may retain contained scrolling where it protects information integrity.
- **Dialogs/alerts/toasts:** 10px dialog radius, responsive bounds, keyboard/focus/escape lifecycle preserved. Toast position follows locale direction, but delivery queue/timing/dismiss semantics are unchanged unless explicitly approved.
- **Badges:** semantic soft colors, 6px radius and 22/26/30px sizes. Never alter business status meanings.
- **Tabs/segmented controls:** preserve route, selected value, lazy loading and event behavior. Mobile may adapt width/scroll without hiding destinations.
- **Navigation:** preserve item inventory, routes, permission visibility, group membership semantics, branch context and deep links. Collapsed/mobile forms retain access to all authorized destinations.

## 5. Responsive and accessibility rules

QA targets: 320, 375, 390, 768, 1024, 1440 and 1920px. The expected layout is intentionally adapted at each width; never merely scale desktop. No unintended page overflow, clipped actions/menus, hidden permission-gated controls or unreadable financial values.

All controls need keyboard operation, visible focus, semantic names/roles/states and touch-sized targets. Contrast target is WCAG AA for normal text; state meaning cannot rely on color alone. Respect `prefers-reduced-motion`, safe areas and browser zoom. Visual and accessibility acceptance must be evidenced in the browser, not inferred from CSS declarations.

## 6. Localization

New/modified user-facing text has Arabic and English presentation. Machine values, enum codes, API payloads, routes and business identifiers are not translated. Locale-specific formatting may affect presentation only. Do not change account/session persistence to store a locale without an approved contract. For now, use the existing in-memory/page locale source and keep any new persistence decision separate.

## 7. Legacy migration and cleanup

No legacy file is removed by filename or age alone. Map selectors to HTML/JS consumers and generated outputs, migrate each consumer to canonical V2 owners, run functional and visual checks, then delete only proven-dead visual rules. Keep necessary print/domain CSS and behavioral classes. Never edit `main.css` or other generated files by hand; use the existing build pipeline and review resulting artifacts.

The former `visual-redesign.css` layer was retired on 2026-10-11 after its remaining rules were reconciled with canonical owners and targeted unit/browser verification passed. Do not recreate that file or another parallel global layer. Continue the same consumer-mapping, migration, and verification process for any other legacy stylesheet before removing it. No `fix.css`, `overrides.css`, or new global layer is permitted.

## 8. Evidence required for screen acceptance

For each real route/view and role-dependent composition, record before/after screenshots, tested locale, theme, viewport, relevant states, preserved actions/contracts and test command/results. Print acceptance additionally requires actual rendered PDF/print preview inspection for existing formats and short/long content. Mark unrun or inaccessible cases honestly; do not infer coverage from a static inventory.

## 9. Login entry presentation

The public Logic Fit login uses the existing centralized theme and locale controls at the top edge of the page, outside the authentication card. On desktop, divide the content area into two balanced columns: the login form occupies one half, and the three existing translated product-benefit items occupy the other half as a transparent, borderless region with unboxed line icons. At tablet and mobile widths, stack the login form and benefits without horizontal overflow. Keep the form card centered in its column with a 460px maximum width, opaque theme-aware surface, 16px login-specific radius, and 32px desktop / 24px mobile padding. The locally hosted `logic-fit-login-gym.webp` asset is the photographic backdrop; retain the navy contrast overlay but do not blur, soften, or filter the image. Fit the composition within ordinary viewport heights where possible while retaining natural scrolling on unusually short viewports or when the on-screen keyboard reduces available space. Login fields and submit control are 48px high, and the account row contains only the existing remember-me control. The forgot-password link is omitted from the visible login presentation; preserve its existing DOM integration, recovery dialog and underlying reset/help behavior without changing authentication contracts. Copyright year is rendered from the current runtime year and its rights label follows the selected locale.
