# Logic Fit Phone System V2

## Contract

Phone input is forgiving at the presentation boundary and strict at the
canonical boundary. The selected ISO-3166-1 alpha-2 country is the source of
truth for local input. The dial code is presentation metadata only.

```json
{
  "phoneCountry": "EG",
  "phoneNational": "1015819700",
  "phone": "+201015819700"
}
```

`phone` is retained as the legacy API field during the compatibility period;
the server recalculates it and never trusts a client-supplied E.164 value.
The current database compatibility model stores the canonical E.164 value in
the existing `phone` and `phone_normalized` columns. Adding separate country
or national columns requires a future migration and is intentionally outside
normal member requests.

## Single path

The browser component (`public/js/core/phone-inputs.js`) owns the explicit
phone state: country ISO, raw input, national number, E.164 value, status and
manual-selection flag. Create, edit, registration, attendance, coaching and
trainer client forms use its submission contract.

The server boundary (`src/services/phone-service.js`) uses the full
`libphonenumber-js` metadata. It parses local trunk input, national-significant
input, international `+` input, `00` input and presentation separators, then
returns `{ countryIso2, nationalNumber, e164 }`. Validation and persistence
are performed again on the server before a transaction starts.

## Accepted Egyptian representations

With `EG` selected, these equivalent representations resolve to the same
canonical value:

- `01015819700`
- `1015819700`
- `+201015819700`
- `00201015819700`
- formatted variants containing spaces or punctuation

The national input displayed after normalization is `1015819700`; `+20` stays
in the country selector and never becomes a placeholder or input value.

## Country detection and readiness

Initial UX detection follows IP country, then timezone, browser locale and the
single central fallback. IP response contains only a country code. Manual
country selection increments the component generation and cannot be replaced
by delayed detection or catalog hydration. A phone form cannot submit without
a ready country and a valid parsed state.

## Duplicate and search behavior

Member duplicate checks compare canonical phone values inside the current
tenant transaction, with the existing serializable lock. Search derives an
exact canonical phone candidate where possible and uses `phone_normalized` for
the index-friendly equality predicate; text/name search remains available for
compatibility.

## Error contract

The server returns a domain validation error before the write transaction for
missing, unsupported, malformed, incomplete, mismatched or duplicate phones.
The browser shows the centralized translated validation message after blur or
submit, with a reserved error area so the form does not jump during typing.

## Legacy data plan

Legacy rows are not rewritten during reads or normal requests. A future
backfill must be a separate read-only dry run followed by conflict and
ambiguity review, then an explicitly approved migration. Invalid, missing,
ambiguous and post-normalization duplicate rows must be reported by count and
handled deliberately before any write.

## Safety rules

- Do not derive country from visible DOM labels, a flag, placeholder or dial code.
- Do not normalize in feature-specific submit handlers.
- Do not run DDL, schema repair or backfill from a member request.
- Do not use a global phone duplicate lookup across tenants.
- Do not silently change a manually selected country after an international paste.
- Do not log raw phones, tokens or secrets.
