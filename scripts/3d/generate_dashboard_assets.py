"""Rebuild the Dashboard data-universe kit with Blender 4.x/5.x.

Run headlessly from the project root:
  blender --background --factory-startup --python scripts/3d/generate_dashboard_assets.py

The generated geometry is project-authored, texture-free, Y-up at runtime, and
distributed under the repository MIT license. Blender is a build-time tool only.
"""

import argparse
import bpy
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT = ROOT / "src" / "assets" / "3d" / "dashboard-data-universe.glb"
DEFAULT_BLEND_OUTPUT = ROOT / "scripts" / "3d" / "generated" / "dashboard-data-universe.blend"


def parse_args():
    parser = argparse.ArgumentParser(description="Generate the Dashboard data-universe GLB kit")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--blend-output", type=Path, default=DEFAULT_BLEND_OUTPUT)
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(argv)


def make_material(name, base, emission, metallic):
    material = bpy.data.materials.new(name)
    material.diffuse_color = (*base, 1.0)
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs.get("Base Color").default_value = (*base, 1.0)
    shader.inputs.get("Metallic").default_value = metallic
    shader.inputs.get("Roughness").default_value = 0.24
    emission_input = shader.inputs.get("Emission Color") or shader.inputs.get("Emission")
    if emission_input:
        emission_input.default_value = (*emission, 1.0)
    emission_strength = shader.inputs.get("Emission Strength")
    if emission_strength:
        emission_strength.default_value = 1.2
    return material


def add_cylinder(name, radius, depth, runtime_y, material):
    # Blender is Z-up; the glTF exporter maps this Z coordinate to runtime Y.
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=radius, depth=depth, location=(0, 0, runtime_y))
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(material)
    return obj


def add_torus(name, major, minor, runtime_y, material, tilt_x=0.0, tilt_y=0.0):
    # A Blender torus already lies in the XY plane with a Z normal. After Y-up
    # export that is the horizontal runtime orientation, so the primary ring
    # needs no 90-degree correction.
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major,
        minor_radius=minor,
        major_segments=96,
        minor_segments=8,
        location=(0, 0, runtime_y),
        rotation=(tilt_x, tilt_y, 0),
    )
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(material)
    return obj


ARGS = parse_args()
OUTPUT = ARGS.output.resolve()
BLEND_OUTPUT = ARGS.blend_output.resolve()

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)

cyan = make_material("CyanMetal", (0.043, 0.31, 0.47), (0.055, 0.65, 0.91), 0.78)
violet = make_material("VioletMetal", (0.15, 0.086, 0.36), (0.55, 0.36, 0.96), 0.62)
core_mat = make_material("CoreCrystal", (0.55, 0.91, 1.0), (0.13, 0.83, 0.87), 0.26)

add_cylinder("AssetPlatform", 1.25, 0.16, -0.12, cyan)
add_cylinder("AssetLowerDeck", 1.55, 0.08, -0.23, violet)
add_torus("AssetRingPrimary", 1.18, 0.028, -0.01, cyan)
add_torus("AssetRingSecondary", 1.55, 0.018, -0.17, violet, 0.12, 0.18)
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.34, location=(0, 0, 0.36))
bpy.context.object.name = "AssetCoreShell"
bpy.context.object.data.materials.append(core_mat)

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
BLEND_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_OUTPUT))
bpy.ops.export_scene.gltf(
    filepath=str(OUTPUT),
    export_format="GLB",
    export_yup=True,
    export_apply=True,
    export_materials="EXPORT",
    export_cameras=False,
    export_lights=False,
)
print(f"Blender version: {bpy.app.version_string}")
print(f"Saved source: {BLEND_OUTPUT} ({BLEND_OUTPUT.stat().st_size} bytes)")
print(f"Exported runtime asset: {OUTPUT} ({OUTPUT.stat().st_size} bytes)")
