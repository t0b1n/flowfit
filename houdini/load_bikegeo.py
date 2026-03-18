"""
Bikegeo Python SOP loader for Houdini.

Usage:
  1. Create a Python SOP node.
  2. Add a String parameter named "bikegeo_file" pointing to a .json export
     produced by bikegeo_core.exporter.export_json().
  3. Paste this script into the Python SOP's Code tab.

The SOP creates:
  - One point per named 3D point, with "name" and "group" string attributes.
  - One open polygon (edge) per connectivity entry.
  - Detail (global) attributes for every scalar in pose_metrics, frame,
    components, and rider dicts.
"""

import json

import hou  # type: ignore  # noqa: F401 — available inside Houdini Python SOPs

node = hou.pwd()
geo = node.geometry()

path = node.parm("bikegeo_file").eval()
if not path:
    raise RuntimeError("bikegeo_file parameter is empty — set it to a .json export path.")

with open(path) as f:
    data = json.load(f)

# ── String attributes ──────────────────────────────────────────────────────────
name_attr = geo.addAttrib(hou.attribType.Point, "name", "")
group_attr = geo.addAttrib(hou.attribType.Point, "group", "")

# ── Create points ──────────────────────────────────────────────────────────────
pt_map: dict[str, hou.Point] = {}
for pt_data in data["points"]:
    x, y, z = pt_data["pos"]
    pt = geo.createPoint()
    pt.setPosition(hou.Vector3(x, y, z))
    pt.setAttribValue("name", pt_data["name"])
    pt.setAttribValue("group", pt_data["group"])
    pt_map[pt_data["name"]] = pt

# ── Create edges (open polygons) ───────────────────────────────────────────────
edge_group_attr = geo.addAttrib(hou.attribType.Prim, "group", "")

for edge in data["edges"]:
    a_name, b_name = edge["a"], edge["b"]
    if a_name not in pt_map or b_name not in pt_map:
        continue
    poly = geo.createPolygon(is_open=True)
    poly.addVertex(pt_map[a_name])
    poly.addVertex(pt_map[b_name])
    poly.setAttribValue("group", edge["group"])

# ── Detail attributes for scalar metadata ──────────────────────────────────────
scalar_meta: dict = {}
for section in ("pose_metrics", "frame", "components", "rider"):
    for k, v in data.get(section, {}).items():
        if isinstance(v, (int, float)):
            scalar_meta[k] = float(v)

for key, val in scalar_meta.items():
    # Houdini attribute names can't contain certain characters; sanitise
    safe_key = key.replace(" ", "_").replace("-", "_")
    attrib = geo.addAttrib(hou.attribType.Global, safe_key, 0.0)
    geo.setGlobalAttribValue(safe_key, val)
