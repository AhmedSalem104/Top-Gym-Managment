# Muscle anatomy assets

## Source and license

The local muscle illustrations are rendered from one source only:

- **Source:** BodyParts3D / Anatomography
- **API:** `https://lifesciencedb.jp/bp3d/API/image`
- **Catalog mapping:** `data/anatomy/bodyparts3d/isa_parts_list_e.txt` and `partof_parts_list_e.txt`
- **Anatomy identifiers:** FMA concept IDs supplied by BodyParts3D
- **License:** CC BY-SA 2.1 Japan
- **Required attribution:** `BodyParts3D, Copyright 2008 Life Science Integrated Database Center, licensed under CC BY-SA 2.1 Japan.`

The official source allows rendered images to be copied, modified, and distributed under the same license. The source also warns that coverage is incomplete and that some concepts may contain modelling or concept-mapping errors; this is why the manifest keeps uncertain records in `manual-review` instead of assigning an unrelated picture.

## Local structure

```text
public/
  assets/muscles/{canonical-slug}/
    front.webp
    back.webp
    side.webp
  data/muscle-assets.json
```

`public/data/muscle-assets.json` is the runtime manifest. Each record contains:

`systemMuscleId → canonicalName → sourceAnatomyIds (FMA) → assetSlug → imageAssets`

The manifest keeps system records separate from canonical anatomy structures, so gym aliases and group records can reuse one verified source render without changing database IDs or API contracts.

## Visual contract

Every generated image uses the same BodyParts3D API configuration:

- 320 × 420 output
- `#F8FAFC` background
- neutral muscle model in `#CBD5E1`
- selected structure(s) highlighted in `#E06A2B`
- fixed front, back, and left-side camera views
- WebP compression at build time

Unmatched records intentionally use the shared UI fallback and are listed in the manifest with `status: "manual-review"`.

## Regeneration and QA

The source lists are kept locally so mapping is reproducible without relying on a live fuzzy search:

```powershell
node scripts/build-muscle-mapping.js
python scripts/download-muscle-assets.py --workers 3
node scripts/validate-muscle-assets.js
```

The downloader is a one-time asset-generation tool. The running application only reads the local manifest and local WebP files; it does not call the external anatomy API.
