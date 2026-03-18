from __future__ import annotations

import json
from pathlib import Path

from .coords import Vec3
from .geometry_export import BikeGeoExport, GeometryEdge, GeometryPoint


def load_json(path: Path) -> BikeGeoExport:
    """Reload an Option A structured JSON export."""
    data = json.loads(Path(path).read_text())

    points = [
        GeometryPoint(
            name=p["name"],
            pos=Vec3(*p["pos"]),
            group=p["group"],
        )
        for p in data["points"]
    ]

    edges = [
        GeometryEdge(a=e["a"], b=e["b"], group=e["group"])
        for e in data["edges"]
    ]

    return BikeGeoExport(
        version=data["version"],
        points=points,
        edges=edges,
        pose_metrics=data["pose_metrics"],
        frame=data["frame"],
        components=data["components"],
        rider=data["rider"],
        constraints=data["constraints"],
    )
