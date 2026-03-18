from __future__ import annotations

import csv
import json
from pathlib import Path

from .geometry_export import BikeGeoExport


def _export_dict(export: BikeGeoExport) -> dict:
    return {
        "version": export.version,
        "points": [
            {"name": p.name, "pos": [p.pos.x, p.pos.y, p.pos.z], "group": p.group}
            for p in export.points
        ],
        "edges": [
            {"a": e.a, "b": e.b, "group": e.group}
            for e in export.edges
        ],
        "pose_metrics": export.pose_metrics,
        "frame": export.frame,
        "components": export.components,
        "rider": export.rider,
        "constraints": export.constraints,
    }


def export_json(export: BikeGeoExport, path: Path) -> None:
    """Option A: single structured JSON file."""
    path = Path(path)
    path.write_text(json.dumps(_export_dict(export), indent=2))


def export_csv(export: BikeGeoExport, directory: Path) -> None:
    """Option B: points.csv + edges.csv + metadata.csv in directory."""
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)

    with open(directory / "points.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["name", "x", "y", "z", "group"])
        for p in export.points:
            w.writerow([p.name, p.pos.x, p.pos.y, p.pos.z, p.group])

    with open(directory / "edges.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["a", "b", "group"])
        for e in export.edges:
            w.writerow([e.a, e.b, e.group])

    metadata: dict = {**export.pose_metrics, **export.frame, **export.components, **export.rider}
    with open(directory / "metadata.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["key", "value"])
        for k, v in metadata.items():
            w.writerow([k, v])


def export_split_json(export: BikeGeoExport, directory: Path) -> None:
    """Option C: geometry.json (points+edges) + setup.json (all metadata)."""
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)

    geometry = {
        "version": export.version,
        "points": [
            {"name": p.name, "pos": [p.pos.x, p.pos.y, p.pos.z], "group": p.group}
            for p in export.points
        ],
        "edges": [
            {"a": e.a, "b": e.b, "group": e.group}
            for e in export.edges
        ],
    }
    (directory / "geometry.json").write_text(json.dumps(geometry, indent=2))

    setup = {
        "version": export.version,
        "pose_metrics": export.pose_metrics,
        "frame": export.frame,
        "components": export.components,
        "rider": export.rider,
        "constraints": export.constraints,
    }
    (directory / "setup.json").write_text(json.dumps(setup, indent=2))
