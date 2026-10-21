# SEO / AEO / GEO audit

## Product context

The application is primarily an authenticated SaaS workspace with member portal, registration/onboarding and trainer workspace pages. Private authenticated screens should not be indexed. Public marketing pages, if hosted separately, were not located or audited in this code-only pass.

## Static evidence

- Some sensitive/utility pages set `noindex,nofollow` (change-password, member portal, gym/trainer registration, trainer workspace per public HTML scan in prior discovery).
- No `robots.txt` or sitemap file was found in the inspected `public` file list.
- Page title/meta/canonical/Open Graph consistency across all HTML pages was not exhaustively reconciled in this pass; deployment-host aliases and rendered routes are unknown.

## Recommendations

- Define explicit indexability policy per host and page. Keep app/login/admin/member portal/private pages noindex; do not block authentication pages in robots in a way that reveals or breaks access control.
- If there are public gym/marketing pages, define canonical host, unique title/description, canonical URL, OG metadata, sitemap only for indexable pages, and localized Arabic/English metadata.
- AEO/GEO claims require actual public content and entity data; do not inject artificial FAQ/schema markup into authenticated operations UI.
- Verify response headers and rendered metadata on the public deployment before changing anything.

No crawler, search console, public URL fetch, structured-data validation, or indexing status was checked. Discoverability status: **NOT VERIFIED**.
