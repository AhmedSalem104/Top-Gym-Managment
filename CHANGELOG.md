# Changelog

## Unreleased

### Added

- Restored the TOP GYM Vanilla CSS Design System with one `main.css` entrypoint.
- Added shared components, page layers, responsive rules, print rules, Cairo-first typography, and accessible focus states.
- Added CSS integrity validation to `build:css` and the QA Gate.

### Fixed

- Prevented auth-state style/layout flashes by removing the hidden app shell from document layout while auth is pending.
- Prevented mobile/tablet horizontal overflow in navigation and dynamic dashboard snapshot content.
- Constrained inline SVG icons to the shared icon sizing system.
