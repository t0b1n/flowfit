from __future__ import annotations

from dataclasses import dataclass, field
from math import cos, radians, sin
from typing import Any

from .coords import Vec3
from .geometry import BikePoints, synthesize_bike
from .mannequin3d import solve_pose_3d
from .models import SetupOutput

EXPORT_VERSION = "1.0.0"


@dataclass
class GeometryPoint:
    name: str
    pos: Vec3
    group: str  # "frame" | "mannequin" | "wheel_center"


@dataclass
class GeometryEdge:
    a: str
    b: str
    group: str  # "frame" | "mannequin_leg" | "mannequin_arm" | "mannequin_torso"


@dataclass
class BikeGeoExport:
    version: str
    points: list[GeometryPoint]
    edges: list[GeometryEdge]
    pose_metrics: dict[str, float]
    frame: dict[str, float]
    components: dict[str, float]
    rider: dict[str, float]
    constraints: dict[str, Any]


_FRAME_EDGES: list[tuple[str, str]] = [
    # Diamond main frame
    ("bb", "seat_cluster"),
    ("seat_cluster", "seat_tube_top"),
    ("seat_cluster", "head_tube_top"),
    ("bb", "head_tube_bottom"),
    ("head_tube_top", "head_tube_bottom"),
    # Bilateral chainstays: BB centre → lateral rear-dropout points
    ("bb", "chainstay_l"),
    ("bb", "chainstay_r"),
    # Bilateral seatstays: seat-tube top → same lateral rear-dropout points
    ("seat_cluster", "chainstay_l"),
    ("seat_cluster", "chainstay_r"),
    # Bilateral fork blades: fork crown → lateral front-dropout points
    ("head_tube_bottom", "fork_l"),
    ("head_tube_bottom", "fork_r"),
    # Seatpost (straight along seat tube axis to clamp — saddle rendered separately)
    ("seat_tube_top", "seatpost_top"),
    # Cockpit: steerer/spacers follow head angle, then stem, then handlebar
    ("head_tube_top", "steerer_top"),     # steerer + spacers (along head angle)
    ("steerer_top", "bar_clamp"),          # stem
    ("bar_clamp", "bar_top_l"),            # bar top lateral spread
    ("bar_clamp", "bar_top_r"),
    ("bar_top_l", "hoods_l"),              # ramps down to hoods
    ("bar_top_r", "hoods_r"),
    ("hoods_l", "bar_drop_l"),             # drops below hoods
    ("hoods_r", "bar_drop_r"),
]

_LEG_EDGES: list[tuple[str, str]] = [
    ("cleat_l", "ankle_l"),
    ("ankle_l", "knee_l"),
    ("knee_l", "hip_l"),
    ("cleat_r", "ankle_r"),
    ("ankle_r", "knee_r"),
    ("knee_r", "hip_r"),
    ("hip_l", "hip_r"),
]

_TORSO_EDGES: list[tuple[str, str]] = [
    ("hip_center", "shoulder_center"),
]

_ARM_EDGES: list[tuple[str, str]] = [
    ("shoulder_l", "elbow_l"),
    ("elbow_l", "wrist_l"),
    ("shoulder_r", "elbow_r"),
    ("elbow_r", "wrist_r"),
    ("shoulder_l", "shoulder_r"),
]

_FRAME_PT_NAMES = {
    "bb", "rear_axle", "front_axle", "saddle", "saddle_clamp",
    "seatpost_top",
    "steerer_top", "bar_clamp", "hoods_l", "hoods_r",
    "cleat_l", "cleat_r",
    "seat_cluster", "seat_tube_top", "head_tube_top", "head_tube_bottom",
    "chainstay_l", "chainstay_r", "fork_l", "fork_r",
    "bar_top_l", "bar_top_r", "bar_drop_l", "bar_drop_r",
}

_MANNEQUIN_PT_NAMES = {
    "ankle_l", "ankle_r", "knee_l", "knee_r",
    "hip_l", "hip_r", "hip_center",
    "shoulder_l", "shoulder_r", "shoulder_center",
    "elbow_l", "elbow_r", "wrist_l", "wrist_r",
}


def _pt_group(name: str) -> str:
    if name in _FRAME_PT_NAMES:
        return "frame"
    return "mannequin"


def _add_frame_structural_points(
    pts_3d: dict[str, Vec3],
    bike_points: BikePoints,
    setup_output: SetupOutput,
) -> None:
    """Inject structural frame/cockpit points into pts_3d for rendering."""
    frame = setup_output.frame
    components = setup_output.components

    # ── Head tube ────────────────────────────────────────────────────────────
    pts_3d["head_tube_top"] = Vec3(frame.reach, frame.stack, 0.0)

    head_angle_rad = radians(frame.head_angle_deg)
    head_axis_x = cos(head_angle_rad)
    head_axis_y = -sin(head_angle_rad)
    fork_off_x = sin(head_angle_rad)
    fork_off_y = cos(head_angle_rad)
    fa = bike_points.front_axle
    if frame.head_tube is not None:
        pts_3d["head_tube_bottom"] = Vec3(
            frame.reach + head_axis_x * frame.head_tube,
            frame.stack + head_axis_y * frame.head_tube,
            0.0,
        )
    else:
        pts_3d["head_tube_bottom"] = Vec3(
            fa.x - head_axis_x * frame.fork_length - fork_off_x * frame.fork_offset,
            fa.y - head_axis_y * frame.fork_length - fork_off_y * frame.fork_offset,
            0.0,
        )

    # ── Seat tube top ─────────────────────────────────────────────────────────
    seat_angle_rad = radians(frame.seat_angle_deg)
    if frame.seat_tube_ct is not None:
        seat_tube_top_dist = frame.seat_tube_ct
    else:
        seat_tube_top_y = frame.stack * 0.84
        seat_tube_top_dist = seat_tube_top_y / sin(seat_angle_rad)
    pts_3d["seat_tube_top"] = Vec3(
        -cos(seat_angle_rad) * seat_tube_top_dist,
        sin(seat_angle_rad) * seat_tube_top_dist,
        0.0,
    )
    if frame.top_tube_effective is not None:
        seat_cluster_x = frame.reach - frame.top_tube_effective
        seat_cluster_dist = min(
            seat_tube_top_dist,
            max(0.0, -seat_cluster_x / max(cos(seat_angle_rad), 1e-6)),
        )
        pts_3d["seat_cluster"] = Vec3(
            -cos(seat_angle_rad) * seat_cluster_dist,
            sin(seat_angle_rad) * seat_cluster_dist,
            0.0,
        )
    else:
        pts_3d["seat_cluster"] = pts_3d["seat_tube_top"]

    # ── Saddle clamp / seatpost top (at rail clamp position) ─────────────────
    pts_3d["saddle_clamp"] = Vec3(
        -cos(seat_angle_rad) * components.saddle_clamp_offset - components.seatpost_offset,
        sin(seat_angle_rad) * components.saddle_clamp_offset,
        0.0,
    )
    pts_3d["seatpost_top"] = Vec3(
        pts_3d["saddle_clamp"].x,
        pts_3d["saddle_clamp"].y,
        0.0,
    )

    # ── Bilateral chainstays (±38 mm Z) ──────────────────────────────────────
    ra = bike_points.rear_axle
    pts_3d["chainstay_l"] = Vec3(ra.x, ra.y, +38.0)
    pts_3d["chainstay_r"] = Vec3(ra.x, ra.y, -38.0)

    # ── Bilateral fork blades (±25 mm Z) ─────────────────────────────────────
    pts_3d["fork_l"] = Vec3(fa.x, fa.y, +25.0)
    pts_3d["fork_r"] = Vec3(fa.x, fa.y, -25.0)

    # ── Handlebar bilateral points ────────────────────────────────────────────
    bar_w = components.bar_width
    hood_w = components.hood_width if components.hood_width is not None else bar_w
    half_bar = bar_w / 2.0
    half_hood = hood_w / 2.0

    bc = pts_3d["bar_clamp"]
    # Bar tops: laterally spread from bar clamp at same XY position
    pts_3d["bar_top_l"] = Vec3(bc.x, bc.y, +half_bar)
    pts_3d["bar_top_r"] = Vec3(bc.x, bc.y, -half_bar)

    # Drops: vertically below the hood positions, ~130 mm drop
    hl = pts_3d["hoods_l"]
    hr = pts_3d["hoods_r"]
    _DROP_DEPTH = 130.0
    pts_3d["bar_drop_l"] = Vec3(hl.x, hl.y - _DROP_DEPTH, +half_hood)
    pts_3d["bar_drop_r"] = Vec3(hr.x, hr.y - _DROP_DEPTH, -half_hood)


def build_export(setup_output: SetupOutput, bike_points: BikePoints) -> BikeGeoExport:
    pts_3d = solve_pose_3d(bike_points, setup_output.components, setup_output.rider)
    _add_frame_structural_points(pts_3d, bike_points, setup_output)

    points = [
        GeometryPoint(name=name, pos=pos, group=_pt_group(name))
        for name, pos in pts_3d.items()
    ]

    edges: list[GeometryEdge] = []
    for a, b in _FRAME_EDGES:
        edges.append(GeometryEdge(a=a, b=b, group="frame"))
    for a, b in _LEG_EDGES:
        edges.append(GeometryEdge(a=a, b=b, group="mannequin_leg"))
    for a, b in _TORSO_EDGES:
        edges.append(GeometryEdge(a=a, b=b, group="mannequin_torso"))
    for a, b in _ARM_EDGES:
        edges.append(GeometryEdge(a=a, b=b, group="mannequin_arm"))

    pose_metrics = setup_output.pose_metrics.model_dump()

    frame_dict = setup_output.frame.model_dump()
    components_dict = {
        k: v for k, v in setup_output.components.model_dump().items()
        if v is not None
    }
    rider_dict = {
        k: v for k, v in setup_output.rider.model_dump().items()
        if v is not None
    }
    constraints_dict = setup_output.constraints.model_dump()

    return BikeGeoExport(
        version=EXPORT_VERSION,
        points=points,
        edges=edges,
        pose_metrics=pose_metrics,
        frame=frame_dict,
        components=components_dict,
        rider=rider_dict,
        constraints=constraints_dict,
    )
