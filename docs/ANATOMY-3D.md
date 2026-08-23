# TOP GYM Anatomy Explorer

The member portal contains a lazy-loaded anatomy explorer. The Three.js
viewer is model-provider agnostic: the model can be replaced by regenerating
the same GLB path and mapping manifest without changing the portal APIs or
business logic.

## Current production asset

The current asset is generated from the official BodyParts3D 4.0 ISA OBJ
archive:

```text
public/assets/anatomy/top-gym-anatomy.glb
/assets/anatomy/top-gym-anatomy.glb
```

The archive is the official 99% polygon-reduced BodyParts3D distribution. It
contains separate OBJ elements that are kept as separate selectable GLB
meshes. The web build uses `EXT_meshopt_compression` and
`KHR_mesh_quantization`; Three.js loads these through its bundled Meshopt
decoder.

### License and attribution

The current official BodyParts3D license page, updated 2025-02-27, lists the
database under CC BY 4.0 and requests this attribution:

> BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International

The project records the source and attribution in:

```text
docs/ANATOMY-BODYPARTS3D-REPORT.json
public/data/anatomy-muscle-mapping.json
public/assets/anatomy/README.md
```

The OBJ headers in the downloaded archive contain an older CC BY-SA 2.1 Japan
notice. That historical notice is preserved in the report for provenance; the
current official license page is the source used for the current archive
license. If the upstream archive changes its notice again, review the license
before rebuilding or redistributing the derivative.

Official sources:

- [BodyParts3D license](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html)
- [Official download page](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html)
- [Official LATEST archive index](https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/)

## Architecture

```text
Member Portal
└── member-portal-library.js
    ├── existing image/anatomy fallback
    └── lazy load → member-portal-anatomy.js
        └── AnatomyViewer
            ├── AnatomyModelLoader (GLB + Meshopt/Draco support)
            ├── CameraController (orbit, zoom, pan, presets, focus)
            ├── MuscleSelector (mouse and touch raycasting)
            ├── MuscleHighlighter (selected mesh + dimmed peers)
            └── MuscleMapping (mesh → gym_muscles.id)
```

The viewer requests the existing public library APIs only:

```text
/api/member-portal/library/options
/api/member-portal/library/muscles/:id
/api/member-portal/library/exercises
/api/member-portal/library/exercises/:id
/api/member-portal/library/foods
/api/member-portal/library/foods/:id
```

The mapping layer never treats a BodyParts3D name as business logic. It reads
`public/data/anatomy-muscle-mapping.json`, resolves a mesh to the current
`gym_muscles.id`, and then uses the existing library APIs.

## Mesh naming convention

Every generated selectable mesh follows:

```text
TG_MUSCLE_<gym_muscles.id>_<slug>_<BodyParts3D element id>
```

Examples:

```text
TG_MUSCLE_29_biceps_FJ1234
TG_MUSCLE_102_peroneus-longus_FJ1410
```

The final element identifier makes every source element unique while the
numeric ID keeps the mapping stable. If another model is supplied later, only
the GLB and the explicit mapping manifest should change.

## Conservative mapping policy

The build pipeline accepts only existing `exact-name` and
`documented-alias` mappings from the current muscle asset manifest. Generic
group aliases are not promoted into the 3D model automatically. When two
system records compete for the same BodyParts3D element and there is no
strictly more-specific documented candidate, the element is recorded as
`ambiguous` and excluded. Nothing is guessed silently.

The generated report lists every `unmapped` system muscle and every ambiguous
element. This is intentional: a future mapping review can add explicit,
auditable mappings without changing the viewer.

## Rebuilding the asset

The archive and its official element map are deliberately not downloaded by
the normal application build. This keeps CI and deployment lightweight. After
reading the official license, download:

```text
isa_BP3D_4.0_obj_99.zip
isa_element_parts.txt
```

Then run:

```bash
npm run build:anatomy:bodyparts3d -- \
  --archive path/to/isa_BP3D_4.0_obj_99.zip \
  --element-map path/to/isa_element_parts.txt
```

The pipeline extracts only the required official OBJ entries, computes clean
normals, assigns a neutral PBR material, exports GLB, applies Meshopt
compression, writes the mapping manifest, and creates the machine-readable
report. It does not modify SQL Server, add a migration, or change tenant
architecture.

## Runtime behavior

- Three.js and the GLB are loaded only when the member opens the exercise
  explorer.
- Loading progress is shown in the portal stage.
- Front, back, left, right, reset, orbit, zoom, pan, mouse hover, touch, and
  click selection are supported.
- Selecting a mapped mesh highlights it, dims other mapped meshes, focuses the
  camera on the selected muscle, and loads its exercises from the existing
  API.
- If WebGL, the GLB, or the mapping resources fail, the existing image and
  interactive fallback remains available.
- The viewer clones materials after loading because the optimized GLB shares a
  single material for download size; this preserves independent highlighting
  without increasing the GLB size.
- `dispose()` releases the renderer, controls, geometries, materials, and
  animation frame when the portal closes or changes section.

## Quality and performance notes

The asset report is the source of truth for the generated file size,
triangles, vertices, mesh count, and mapping coverage:

```text
docs/ANATOMY-BODYPARTS3D-REPORT.json
```

This model is an interactive fitness reference, not a medical diagnostic
tool. The archive is already polygon-reduced by BodyParts3D; visual review on
desktop and mobile is required before describing it as a clinical-quality
reference.

## Validation

```bash
npm run check:anatomy
npm run build:anatomy
npm run build
npm run qa:gate
```

For browser QA, verify desktop and mobile rendering, RTL labels, touch
rotation/zoom, camera presets, mapped muscle selection, fallback behavior, and
that the GLB request occurs only after opening the exercise explorer.
