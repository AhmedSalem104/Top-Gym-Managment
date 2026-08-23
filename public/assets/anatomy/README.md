# TOP GYM Anatomy Asset

The production asset is:

```text
top-gym-anatomy.glb
```

It is generated from the official BodyParts3D 4.0 ISA OBJ archive and served
at `/assets/anatomy/top-gym-anatomy.glb`. The current official license is CC
BY 4.0. Required attribution:

> BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International

Source and license links:

- https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html
- https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html
- https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/

The archive OBJ headers contain a historical CC BY-SA 2.1 Japan notice; see
`docs/ANATOMY-BODYPARTS3D-REPORT.json` for the provenance note and generated
metrics.

## Asset contract

- Separate selectable muscle meshes.
- Mesh names follow
  `TG_MUSCLE_<gym_muscles.id>_<slug>_<BodyParts3D element id>`.
- No external textures.
- Meshopt geometry compression and glTF quantization.
- Neutral PBR material; the viewer clones it per mesh for independent
  highlighting.
- Runtime URL: `/assets/anatomy/top-gym-anatomy.glb`.

The mapping manifest is at:

```text
public/data/anatomy-muscle-mapping.json
```

The image-based anatomy explorer remains the fallback when WebGL, GLB, or
mapping resources are unavailable.
