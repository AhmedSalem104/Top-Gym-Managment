---
name: frontend-design
description: Design or implement Logic Fit web interfaces with polished hierarchy and clear SaaS workflows. Use for visual UI work; preserve approved V2 patterns, existing structure and behavior.
---

# Logic Fit frontend design

Use this skill when implementing a web page or component, or when translating an approved visual reference into the existing application. The installed personal `frontend-design` skill may provide broader aesthetic techniques; this project skill is authoritative whenever its requirements differ.

## Project direction

- Follow `AGENTS.md` and `docs/LOGIC_FIT_V2_DESIGN_SYSTEM.md`. Logic Fit V2 is the sole visual system: Azure Blue through semantic tokens, Tajawal for Arabic, Geist Sans for English, the existing outline icon source, RTL/LTR, and the existing light/dark theme architecture.
- Aim for a refined, compact enterprise SaaS interface. Establish hierarchy through grouping, typography, spacing, and restrained semantic accents. Avoid generic template dashboards and decoration that does not help comprehension.
- Treat supplied references as evidence for layout and appearance, not as data or permission to invent behavior. Keep the current structure and content when asked for visual refinement only. Do not restore elements previously removed by an approved decision.
- Use the existing page and canonical components. Search for the owner before making a new component or variant. Feature CSS may compose real page structure; do not add parallel global styling or another component system.

## Workflow

1. Inspect the target route, owning markup/module/CSS, shared components, existing tests, and relevant design-system rules. Record the user task's functional boundaries.
2. Describe the visual objective briefly before implementation when the task is open-ended. For a tightly specified reference, follow it without inventing an alternate direction.
3. Make the smallest coherent change in the canonical owner. Preserve IDs, data attributes, event hooks, routes, APIs, permissions, and data values unless the request explicitly authorizes otherwise.
4. Check content hierarchy, alignment, states, locale direction, both themes, and responsive behavior. Use real application data paths or clearly identified synthetic fixtures; never replace runtime data with mock values.
5. Run focused checks and inspect actual browser output when available. Report the files, verified states, commands/results, and anything not verified.

## Do not

- Rebuild unrelated pages, add unrequested features, or change business behavior for visual convenience.
- Introduce raw palette copies, ad-hoc overrides, `!important`, `transition: all`, duplicate global layers, unnecessary dependencies, or a second implementation of a shared primitive.
- Treat a successful build or a generated mock screenshot as proof of visual quality.
- Claim complete browser, responsive, accessibility, or functional coverage unless the corresponding evidence was actually produced.

## Expected result

Deliver a cohesive implementation in the existing application, with the approved hierarchy and controls intact, verified in the relevant viewport/theme/locale combinations, and a concise evidence-based handoff.
