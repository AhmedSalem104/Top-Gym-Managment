---
name: ui-ux-review
description: Review an existing Logic Fit interface for usability, clarity, interaction quality, and accessibility. Use for UX audits or before/after design review; do not implement unless asked.
---

# Logic Fit UI/UX review

Review the real application rather than judging a detached mockup. Follow `AGENTS.md` and the V2 design specification. This skill is for evidence-led evaluation; a review request alone does not authorize code changes.

## Review method

1. Identify the user role, task, route, relevant state, and preserved workflow. Inspect the owning page/module and shared design-system components.
2. Review information architecture and hierarchy: labels, grouping, scan order, primary/secondary actions, density, repeated copy, and discoverability.
3. Review interactions: keyboard and focus order, loading/disabled/error/success/empty states, validation, dismissal, confirmation, and whether control semantics match behavior.
4. Review data-heavy content: search, filters, sort, pagination, status meaning, table/card parity, long values, and action discoverability.
5. Review Arabic RTL and English LTR, theme contrast, responsive composition, zoom/text scaling, and applicable WCAG 2.2 AA concerns.
6. Separate observed defects from subjective opportunities. Cite source locations and browser screenshots/tests where available; state when evidence is source-only or synthetic.

## Finding format

For each significant finding provide:

- **Problem and evidence** — what is observed and where.
- **Affected component / severity** — Critical, High, Medium, or Low, with rationale.
- **User impact** — which task or user is affected.
- **Recommendation** — smallest improvement consistent with V2.
- **Complexity** — Small, Medium, or Large.
- **Behavior impact** — None, or precisely what behavior would change and why approval is needed.

End with elements that must remain unchanged, the recommended implementation sequence, and unverified cases. Do not invent user research, API behavior, permission findings, contrast measurements, or browser results. Do not recommend a change solely because it is fashionable.
