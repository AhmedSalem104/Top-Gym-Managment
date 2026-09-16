# Logic Fit Mobile Blueprint

This document records mobile-relevant product contracts that must remain aligned
with the web application and its central services.

## Business rules

- `branches` is a core capability for every active or trial Gym subscription.
- Gym branch capacity follows the current plan configuration: Starter `1`,
  Basic `2`, Pro `5`, and Business unlimited.
- Historical subscription price and term remain snapshot values. The current
  plan `maxBranches` is the intentional dynamic exception; other resource
  limits remain snapshot-based unless a separate product decision changes them.
- Independent Trainer tenants do not receive the Gym-only Branches capability.
- Phone entry is Egypt-only in the Logic Fit UI. Users enter a local Egyptian
  mobile number such as `01015819700`; there is no country selector, country
  detection, GPS, IP, timezone, or locale inference in the phone flow.
- Backend phone identity remains canonical E.164. For example,
  `01015819700` is stored and searched as `+201015819700`.

## API catalog

| Contract | Mobile implication |
| --- | --- |
| `GET /api/saas/entitlements` | Returns effective tenant capabilities and limits. Gym `maxBranches` comes from the current plan; other limits retain snapshot semantics. |
| Branch context and branch APIs | Require a valid Gym branch context and enforce the effective branch limit server-side. |
| Member, registration, attendance, day-pass, coaching, store, branding, tenant-contact and WhatsApp phone flows | Submit local Egyptian mobile input; the server normalizes it through the central phone service. |
| Phone search and duplicate checks | Normalize to canonical E.164 before lookup; never compare display formatting. |

Legacy `+20`, `0020`, and national-significant representations remain accepted
at the domain boundary where the central parser can prove they represent the
same Egyptian number. The new UI writes local Egyptian input only. Existing
canonical E.164 data remains readable, editable, searchable, and unchanged.

## Entitlements, permissions, and limits

Effective access is resolved from authenticated tenant, tenant status,
subscription status/expiry, subscription snapshot, tenant type, feature
catalog compatibility, plan entitlements, overrides, and the resource limit.
Frontend visibility is not a security boundary. Branch APIs and resource
creation remain server-authoritative.

## Mobile product implications

- Phone fields use a `tel` input with a numeric keyboard, visible label/helper,
  LTR number rendering inside RTL screens, and stable inline error space.
- The local example placeholder is `مثال: 01015819700` and is never submitted.
- Formatting is presentation-only; WhatsApp/tel links and API payloads use the
  canonical E.164 value.
- Branch navigation and branch context are available for Gym subscriptions when
  the current plan permits the requested branch count; they are hidden for
  Independent Trainer tenants.
- The post-login shell must prove the server session first and then obtain
  effective entitlements before exposing protected navigation. Tenant branding
  is presentation-only and may load in parallel; it must never grant access.
- The first route is usable only after its existing authoritative bootstrap/data
  work completes. The welcome surface follows that readiness signal and does
  not use a fixed-duration loading timer.

## User flows

### Egyptian phone entry

`Local input → central EG parser → mobile validation → E.164 canonicalization → API/DB/search`

### Gym branch access

`Login → effective entitlements → branch context → current plan maxBranches → branch/API/navigation access`

## Traceability matrix

| Rule | Source of truth | Verification |
| --- | --- | --- |
| Gym branches are core | Feature catalog + capability service | Entitlement and branch-service tests |
| Starter/Basic/Pro/Business branch limits | Current plan configuration | Plan-entitlement unit tests and branch limit matrix |
| Trainer branches unavailable | Tenant type compatibility | Capability and navigation tests |
| Egypt-only UI | `public/js/core/phone-inputs.js` | Phone contract/browser tests |
| E.164 persistence/search | `src/services/phone-service.js` | Phone normalization and duplicate/search tests |
| Post-login readiness | Session + entitlement gate, then route bootstrap | Critical-path browser trace; app usable event; auth/entitlement regression tests |

## Blueprint changelog

### 2026-09-15

- Recorded Gym core Branches capability and dynamic current-plan branch limits.
- Recorded Egypt-only local phone UX and canonical E.164 backend contract.
- Recorded removal of country selection and automatic country detection from the
  Logic Fit phone flow.

### 2026-09-16

- Recorded the post-login loading contract: session remains the security gate,
  entitlements remain server-authoritative, branding may run in parallel, and
  the authenticated welcome surface closes on real route readiness rather than
  a fixed delay. No API or security contract changed.
