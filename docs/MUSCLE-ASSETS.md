# Muscle image assets

## Current strategy

The application keeps the existing runtime contract:

```text
public/data/muscle-assets.json
public/assets/muscles/<assetSlug>/<front|back|side>.webp
public/js/muscle-assets.js
```

The browser still receives static WebP files. Rendering is a build-time concern, so no 3D library is loaded by the production application and no anatomy model is exposed to end users.

## Modern rendering pilot

The modernized batch uses a local GLB muscle model derived from **Z-Anatomy / BodyParts3D**. The input is the `kas.glb` asset published by the [Anatomi Simulator project](https://github.com/DrMuratAltun/anatomi-simulatoru), and it is rendered with Three.js and headless Chromium.

The initial visual pilot covered:

- `acromial-part-of-deltoid`
- `clavicular-part-of-pectoralis-major`
- `long-head-of-biceps-brachii-short-head-of-biceps-brachii`

The approved batch now contains 169 modernized asset directories. It uses 480×630 WebP renders, a pale background, neutral anatomy, and TOP GYM blue for the selected muscle. Nineteen broad or unavailable structures remain on the legacy fallback and are explicitly listed in `modernization.legacyFallbackAssetSlugs`.

## Attribution and license

The Z-Anatomy model is distributed under **CC BY-SA 4.0**. Derived rendered assets must keep the required attribution and ShareAlike terms. The project also retains the original BodyParts3D attribution for the legacy assets.

- [Z-Anatomy model repository and license](https://github.com/Z-Anatomy/Models-of-human-anatomy)
- [Z-Anatomy license file](https://github.com/Z-Anatomy/Models-of-human-anatomy/blob/master/License.txt)
- [Pilot GLB source](https://github.com/DrMuratAltun/anatomi-simulatoru/blob/main/systems/kas.glb)
- [Pilot GLB data license](https://github.com/DrMuratAltun/anatomi-simulatoru/blob/main/LICENSE-DATA.md)
- [BodyParts3D / DBCLS source](https://lifesciencedb.jp/bp3d/info_en/index.html)

The GLB source model is intentionally not committed to this repository because it is a large build input. Keep it in a controlled local asset workspace or artifact store when rendering additional batches.

## Render a batch

Install dependencies, obtain an authorized copy of the GLB model, then run:

```powershell
npm install
npm run render:muscle-assets -- --model C:\path\to\kas.glb --pilot
npm run render:muscle-assets -- --model C:\path\to\kas.glb --all
```

The renderer writes the same asset paths consumed by the application. Review the generated images before committing them. Do not change the manifest mappings or rename slugs as part of a visual-only update.

## Migration workflow

1. Render a small batch.
2. Inspect front, back, and side views in the Library and muscle-details modal.
3. Run `npm run qa:muscle-assets`.
4. Check image dimensions, WebP output, broken paths, and responsive rendering.
5. Update `modernization.modernizedAssetCount` and `modernization.legacyFallbackAssetSlugs` in the manifest.
6. Commit only the approved images, renderer changes, manifest metadata, and attribution documentation.

## Rollback

The migration is asset-only. Reverting the image files and the manifest metadata restores the previous visual assets without changing APIs, database records, permissions, or frontend behavior.
