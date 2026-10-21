# Frontend performance audit

## Evidence

- Frontend is Vanilla HTML/CSS/JS with one stable shell and hash routing (`docs/ARCHITECTURE.md`).
- Feature scripts are grouped under `public/js/pages/` and loaded by `feature-loader.js`; documentation says dashboard enhancements, details, reports and assistant work are deferred until relevant.
- Legacy `public/js/app.js` includes members/dashboard/pricing behavior and is called out as a future split candidate requiring browser coverage.
- Build creates CSS, login entry, phone formatter, anatomy assets and runtime asset-version metadata (`package.json`). Large anatomy/3D code is a candidate for deferred loading; no bundle measurement was taken.
- Static scan found 175 `/api/` text matches across 21 feature page files (154 lines), excluding a reliable runtime interpretation. This is source-site count only.

## Not measured

No browser was launched. Cold/warm load, route transition, search responsiveness, request waterfall, long tasks, bundle transfer/parse, image decode, font blocking, LCP/CLS, and INP are all **NOT MEASURED**. Do not assert a bottleneck based on file size or code age alone.

## Evidence-led candidate investigations

1. Production build and browser coverage of JS/CSS, with cache disabled then warm; include dashboard, members, member detail, attendance, coaching and PDF export.
2. Inspect whether anatomy/Three/PDF/report code is excluded until use; verify actual chunk/asset loading rather than assume splitting.
3. Capture page API waterfalls and duplicate calls for initial navigation, scope changes, tabs, search, and pagination.
4. Profile main thread and DOM update cost under realistic synthetic staging data; only then choose memoization, pagination, or virtualization.
5. Verify fonts and images with network timing and layout-shift attribution; retain existing Arabic glyph coverage.

## Safe optimization rule

Prefer existing feature loader and API cache primitives. Do not store member/financial data in shared caches or localStorage, and do not change business data freshness. Retain API cancellation/stale-response guards. Any intervention should show before/after repeated measurements under the same production build and browser/network profile.
