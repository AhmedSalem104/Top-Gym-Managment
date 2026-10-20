---
name: responsive-design
description: Plan, implement, or verify responsive Logic Fit layouts across phone, tablet, and desktop, including RTL/LTR, themes, touch, and overflow.
---

# Logic Fit responsive design

Use this skill whenever a UI change alters layout, component sizing, navigation, tables/cards, dialogs, or interaction at different widths. Follow `AGENTS.md` and the canonical V2 responsive rules; mobile is an intentional composition, not a scaled desktop page.

## Workflow

1. Inspect existing breakpoints, tokens, app-shell constraints, DOM order, and page-specific responsive owners before changing CSS.
2. Define how content reflows, what remains visible, and how actions remain reachable. Prefer CSS Grid/Flex and logical properties; preserve semantic and keyboard order.
3. Validate relevant widths from the project matrix: 320, 360, 375, 390, 430, 768, 1024, 1280, 1440, and 1920px. Include points immediately around any changed breakpoint.
4. Check Arabic RTL and English LTR, light/dark, long labels/data, browser zoom or text enlargement where applicable, and short viewport height for overlays/forms.
5. Use the actual browser implementation and capture screenshots when browser QA is available. Inspect horizontal overflow, clipping, overlap, hidden actions, touch target usability, menu/dialog boundaries, and table/card data parity.
6. Run the focused responsive/browser checks and report exact widths and states tested. Mark unavailable cases not tested; do not infer from CSS or unit tests.

## Constraints

- Reuse existing shell and component patterns; do not create a second layout or responsive stylesheet layer.
- Do not hide useful information, shrink text to force fit, or use clipping to conceal overflow defects.
- Preserve routes, APIs, DOM hooks, actions, permissions, data contracts, and business behavior.
- Keep page-level scrolling intentional; avoid nested scrollbars unless the component needs them to preserve data access.
- Respect safe areas, virtual keyboards, reduced motion, theme tokens, and mixed-direction values.
