---
name: design-system
description: Maintain or apply Logic Fit V2 tokens and canonical UI component ownership. Use when reviewing consistency, extending a component, or documenting design-system decisions.
---

# Logic Fit design system

The canonical specification is `docs/LOGIC_FIT_V2_DESIGN_SYSTEM.md`; mandatory repository constraints are in `AGENTS.md`. Use this skill for component/token consistency and design-system changes, not to authorize a broad migration.

## Ownership workflow

1. Find the token, component owner, consumers, and tests before editing. `public/css/tokens.css` is the canonical token/theme source; shared primitives have one owner documented in the V2 specification.
2. Reuse the canonical primitive or add a narrowly scoped, documented variant when a real use case requires it. Preserve existing DOM hooks and backwards-compatible behavior.
3. Use semantic color, typography, spacing, border, elevation, icon, and motion tokens. Keep tenant branding and light/dark mappings intact.
4. Keep Arabic/English labels in the centralized i18n catalog. Use logical CSS properties for direction-sensitive layout; isolate machine values such as dates, identifiers, phones, and amounts appropriately.
5. Update the canonical specification only when an implemented rule, owner, token, or component contract changes. Avoid duplicate documentation and speculative rules.
6. Validate consumers in relevant themes, locales, and viewport classes; run ownership/style checks and focused component/browser tests. Remove old styles only after mapping consumers and proving they are obsolete.

## Prohibited shortcuts

- Parallel Button/Card/Table/Modal/Navigation/token implementations or a competing design layer.
- Global CSS additions used to mask defects, arbitrary selector escalation, `!important`, inline-style bypasses, or edits to generated bundles instead of their sources.
- Removing styles or hooks based on names or age alone.
- Changing routes, APIs, business logic, authentication, permissions, data, tenant/branch scope, or user flows as a side effect of visual consistency work.
