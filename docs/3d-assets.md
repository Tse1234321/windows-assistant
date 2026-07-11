# Dashboard 3D asset workflow

The Dashboard data universe uses one small, project-owned GLB kit plus a procedural Three.js fallback. The checked-in runtime file is [dashboard-data-universe.glb](../src/assets/3d/dashboard-data-universe.glb); it contains the central platform, lower deck, two orbit rings, and a core-shell source mesh. The live Earth, atmosphere, node network, labels, background, and connections remain data-driven at runtime.

## Provenance and license

- Author/source: generated in this repository from `scripts/3d/generate-dashboard-assets.mjs`.
- License: the repository MIT license; no third-party mesh, texture, font, HDRI, or paid add-on is embedded.
- Runtime format: binary glTF 2.0 (`.glb`), self-contained and texture-free.
- Coordinates: metres, Y-up, origin-centred; the equatorial platform is centred at the world origin.
- Intended use: reusable low-poly physical accents for the Dashboard split-globe data core.
- Current generated size: 108,760 bytes; validation rejects files larger than 1.5 MB.

## Rebuild and validate without Blender

Node.js and the repository's existing Three.js dependency are sufficient:

```powershell
npm run assets:3d
```

This executes the deterministic Three.js exporter and then verifies the GLB header, declared length, glTF version, required named nodes, payload budget, and absence of textures. To validate an existing file without rebuilding it:

```powershell
npm run assets:3d:validate
```

Vite imports the file through `GLTFLoader` and fingerprints it in `dist/assets`. If loading or decoding fails, the procedural platform and core stay visible and the surrounding semantic directory remains usable.

## Blender authoring path

Blender CLI was not present in PATH, configured environment variables, `%ProgramFiles%`, or the common per-user installation locations during the 2026-07-11 verification, so no Blender export or Blender visual validation is claimed. A reproducible Blender 4.x/5.x script is prepared at `scripts/3d/generate_dashboard_assets.py`. It accepts optional `--output` and `--blend-output` arguments after Blender's `--` separator. After installing the free Blender application, run:

```powershell
$blender = (Get-ChildItem "$env:ProgramFiles\Blender Foundation" -Recurse -Filter blender.exe |
  Sort-Object FullName -Descending | Select-Object -First 1).FullName
& $blender --background --factory-startup --python scripts/3d/generate_dashboard_assets.py -- `
  --output src/assets/3d/dashboard-data-universe.glb `
  --blend-output scripts/3d/generated/dashboard-data-universe.blend
npm run assets:3d:validate
```

The generated `.blend` source is kept under the ignored `scripts/3d/generated/` directory, while the validated GLB is the only runtime asset. The script prints the Blender version, both output paths, and file sizes. Review material appearance in the packaged Electron runtime after any Blender regeneration because Blender and Three.js lighting are not identical.

## Asset contract

Required named nodes are `AssetPlatform`, `AssetLowerDeck`, `AssetCoreShell`, `AssetRingPrimary`, and `AssetRingSecondary`. Keep those names stable or update both the runtime loader and validator. Keep materials texture-free unless a future change documents texture source, redistribution rights, color space, dimensions, memory cost, and failure behavior.

For replacements, preserve the Y-up/metre/origin contract, remove cameras and lights, apply transforms, recompute normals, remove hidden geometry, and keep the 1.5 MB initial-payload budget unless a measured visual benefit justifies changing it.
