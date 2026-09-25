# 12 — Mobile Design System

## Direction

HeroUI is a visual/UX reference only; its Web components are not assumed to run in React Native. Logic Fit Mobile needs native components using the existing Logic Fit visual language: clean SaaS hierarchy, tokenized spacing, surfaces, radius, focus states, and restrained motion.

## Token groups

Define one native token source for semantic colors (surface, text, muted, border, accent, success, warning, danger, info), typography scale, spacing, radii, elevation, icon sizes, motion durations, and safe-area/keyboard constants. Light/dark values must be semantic; features must not hardcode raw colors.

## Required primitives

Buttons (primary/secondary/danger/ghost/loading/disabled), text/email/phone/number inputs, selects, checkbox/radio/switch, cards, list rows, avatar, tabs, badge/status, bottom sheets, dialogs, toast/banner, skeleton, empty/error/offline, feature-unavailable, expired, suspended, and plan-limit states.

## Arabic-first behavior

- RTL is a first-class layout direction; English is supported without mirroring numeric/phone content incorrectly.
- Phone and numeric values use LTR islands with Arabic labels.
- Icon direction must be semantic: arrows mirror; neutral icons do not.
- Typography must support Arabic line height, dynamic text, and truncation without hiding actions.

## Accessibility and platforms

Every control needs an accessible label/state, visible focus or platform focus indication, minimum touch target, contrast, dynamic text behavior, keyboard-safe forms, and screen-reader order. Verify iOS and Android separately for sheets, back behavior, keyboard, safe areas, and elevation/shadow rendering.

## Motion

Motion is short, interruptible, reduced-motion aware, and never required to understand state. Loading/skeleton and error transitions must not create layout jumps.
