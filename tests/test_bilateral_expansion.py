"""
Regression tests for bilateral expansion contract between frontend and backend.

The frontend `buildMannequin3DPoints()` (geometry.ts) replicates the backend's
bilateral expansion logic from `mannequin3d.solve_pose_3d()`.  These tests
ensure the two sides agree on:
  - point names
  - edge definitions and groups
  - Z-spread rules and defaults

If either side changes point names, edges, or Z-spread rules, these tests break.
"""
from __future__ import annotations

import pytest

from bikegeo_core import Components, FrameGeometry
from bikegeo_core.geometry import synthesize_bike
from bikegeo_core.geometry_export import (
    _ARM_EDGES,
    _LEG_EDGES,
    _MANNEQUIN_PT_NAMES,
    _TORSO_EDGES,
)
from bikegeo_core.mannequin3d import solve_pose_3d
from bikegeo_core.models import RiderAnthropometrics

TOLERANCE = 1e-6


# ── Fixtures ──────────────────────────────────────────────────────────────────

def _frame() -> FrameGeometry:
    return FrameGeometry(
        stack=550.0,
        reach=380.0,
        head_angle_deg=73.0,
        seat_angle_deg=73.0,
        bb_drop=70.0,
        chainstay_length=410.0,
        fork_length=370.0,
        fork_offset=45.0,
        wheel_radius=340.0,
    )


def _components(**overrides) -> Components:
    base = dict(
        crank_length=172.5,
        cleat_setback=12.0,
        saddle_rail_length=80.0,
        saddle_clamp_offset=700.0,
        stem_length=100.0,
        stem_angle_deg=6.0,
        spacer_stack=10.0,
        bar_reach=80.0,
        bar_drop=-40.0,
        hood_reach_offset=20.0,
        hood_drop_offset=0.0,
        bar_width=400.0,
        hood_width=380.0,
        stance_width=155.0,
    )
    base.update(overrides)
    return Components(**base)


def _rider(**overrides) -> RiderAnthropometrics:
    base = dict(
        height=1780.0,
        thigh_length=420.0,
        shank_length=390.0,
        torso_length=580.0,
        upper_arm_length=320.0,
        forearm_length=270.0,
        foot_length=265.0,
        shoulder_width=380.0,
        hip_width=330.0,
    )
    base.update(overrides)
    return RiderAnthropometrics(**base)


def _bike(**comp_overrides):
    return synthesize_bike(_frame(), _components(**comp_overrides))


# ── Frontend replica of buildMannequin3DPoints ────────────────────────────────
#
# This is a Python port of the frontend bilateral expansion in geometry.ts.
# It takes the 2D mannequin joints (from the backend's solve_pose_2d_full)
# and expands them into 3D using the same rules as the frontend.

_FE_DEFAULT_STANCE_WIDTH = 155.0
_FE_DEFAULT_HIP_WIDTH = 200.0

_FE_LEG_EDGES = [
    ("cleat_l", "ankle_l"), ("ankle_l", "knee_l"), ("knee_l", "hip_l"),
    ("cleat_r", "ankle_r"), ("ankle_r", "knee_r"), ("knee_r", "hip_r"),
    ("hip_l", "hip_r"),
]
_FE_TORSO_EDGES = [
    ("hip_center", "shoulder_center"),
]
_FE_ARM_EDGES = [
    ("shoulder_l", "elbow_l"), ("elbow_l", "wrist_l"),
    ("shoulder_r", "elbow_r"), ("elbow_r", "wrist_r"),
    ("shoulder_l", "shoulder_r"),
]


def _frontend_bilateral_point_names() -> set[str]:
    """Point names produced by the frontend buildMannequin3DPoints()."""
    return {
        "cleat_l", "cleat_r",
        "ankle_l", "ankle_r",
        "knee_l", "knee_r",
        "hip_l", "hip_r", "hip_center",
        "shoulder_l", "shoulder_r", "shoulder_center",
        "elbow_l", "elbow_r",
        "wrist_l", "wrist_r",
    }


def _frontend_edge_tuples() -> set[tuple[str, str, str]]:
    """(a, b, group) tuples produced by the frontend."""
    edges: set[tuple[str, str, str]] = set()
    for a, b in _FE_LEG_EDGES:
        edges.add((a, b, "mannequin_leg"))
    for a, b in _FE_TORSO_EDGES:
        edges.add((a, b, "mannequin_torso"))
    for a, b in _FE_ARM_EDGES:
        edges.add((a, b, "mannequin_arm"))
    return edges


def _backend_edge_tuples() -> set[tuple[str, str, str]]:
    """(a, b, group) tuples from the backend geometry_export edge lists."""
    edges: set[tuple[str, str, str]] = set()
    for a, b in _LEG_EDGES:
        edges.add((a, b, "mannequin_leg"))
    for a, b in _TORSO_EDGES:
        edges.add((a, b, "mannequin_torso"))
    for a, b in _ARM_EDGES:
        edges.add((a, b, "mannequin_arm"))
    return edges


# ── Tests ─────────────────────────────────────────────────────────────────────


def test_frontend_bilateral_point_names_match_backend():
    """The mannequin point names from the frontend expansion must equal those
    from the backend's solve_pose_3d() (excluding frame-only points like bb,
    saddle, etc. which the frontend doesn't produce).

    Note: the frontend generates cleat_l/cleat_r as mannequin group points,
    while the backend classifies them as frame points (in _FRAME_PT_NAMES).
    Both sides produce the same cleat points — the difference is only in group
    assignment.  We compare against the full set of bilateral joint names that
    solve_pose_3d() returns."""
    fe_names = _frontend_bilateral_point_names()

    # The backend's canonical mannequin point names plus cleat_l/cleat_r
    # (which solve_pose_3d produces but geometry_export classifies as frame)
    pts_3d = solve_pose_3d(_bike(), _components(), _rider())
    be_bilateral_names = {
        k for k in pts_3d
        if k in _MANNEQUIN_PT_NAMES or k in ("cleat_l", "cleat_r")
    }

    assert fe_names == be_bilateral_names, (
        f"Frontend/backend mannequin point name mismatch.\n"
        f"  Frontend only: {fe_names - be_bilateral_names}\n"
        f"  Backend only:  {be_bilateral_names - fe_names}"
    )


def test_frontend_bilateral_edge_definitions_match_backend():
    """The (a, b, group) edge tuples from the frontend must equal those from
    the backend's geometry_export edge lists."""
    fe_edges = _frontend_edge_tuples()
    be_edges = _backend_edge_tuples()

    assert fe_edges == be_edges, (
        f"Frontend/backend edge mismatch.\n"
        f"  Frontend only: {fe_edges - be_edges}\n"
        f"  Backend only:  {be_edges - fe_edges}"
    )


def test_frontend_bilateral_z_spread_matches_backend():
    """For a given config, the Z offsets for each bilateral joint pair must
    match between the frontend replica and backend solve_pose_3d()."""
    comp = _components()
    rider = _rider()
    pts_3d = solve_pose_3d(_bike(), comp, rider)

    # Frontend Z-spread computation (mirrors geometry.ts)
    hood_w = comp.hood_width if comp.hood_width is not None else comp.bar_width
    stance_w = comp.stance_width if comp.stance_width is not None else _FE_DEFAULT_STANCE_WIDTH
    hip_w = rider.hip_width if rider.hip_width is not None else _FE_DEFAULT_HIP_WIDTH
    shoulder_w = rider.shoulder_width

    half_stance = stance_w / 2.0
    half_hip = hip_w / 2.0
    half_hood = hood_w / 2.0
    half_shoulder = shoulder_w / 2.0

    expected_z = {
        "cleat_l": +half_stance,   "cleat_r": -half_stance,
        "ankle_l": +half_stance,   "ankle_r": -half_stance,
        "knee_l":  +half_stance,   "knee_r":  -half_stance,
        "hip_l":   +half_hip,      "hip_r":   -half_hip,
        "hip_center": 0.0,
        "shoulder_l": +half_shoulder, "shoulder_r": -half_shoulder,
        "shoulder_center": 0.0,
        "elbow_l": +half_shoulder, "elbow_r": -half_shoulder,
        "wrist_l": +half_hood,     "wrist_r": -half_hood,
    }

    for name, expected in expected_z.items():
        actual = pts_3d[name].z
        assert abs(actual - expected) < TOLERANCE, (
            f"{name}.z: frontend expects {expected:.2f}, backend has {actual:.2f}"
        )


def test_frontend_bilateral_xy_preserves_2d_joints():
    """The XY coordinates of bilateral points must equal the 2D mannequin joint
    positions — bilateral expansion only changes Z."""
    from bikegeo_core.mannequin2d import solve_pose_2d_full

    comp = _components()
    rider = _rider()
    bike = _bike()
    _, joints = solve_pose_2d_full(bike, rider, comp.pedal_stack_height)
    pts_3d = solve_pose_3d(bike, comp, rider)

    # Map 3D point names to their corresponding 2D joint
    mapping = {
        "hip_l": "hip", "hip_r": "hip", "hip_center": "hip",
        "knee_l": "knee", "knee_r": "knee",
        "ankle_l": "ankle", "ankle_r": "ankle",
        "shoulder_l": "shoulder", "shoulder_r": "shoulder",
        "shoulder_center": "shoulder",
        "elbow_l": "elbow", "elbow_r": "elbow",
        "wrist_l": "wrist", "wrist_r": "wrist",
    }

    for pt3d_name, joint2d_name in mapping.items():
        j2 = getattr(joints, joint2d_name)
        j3 = pts_3d[pt3d_name]
        assert abs(j3.x - j2.x) < TOLERANCE, (
            f"{pt3d_name}.x ({j3.x:.4f}) != {joint2d_name}_2d.x ({j2.x:.4f})"
        )
        assert abs(j3.y - j2.y) < TOLERANCE, (
            f"{pt3d_name}.y ({j3.y:.4f}) != {joint2d_name}_2d.y ({j2.y:.4f})"
        )


def test_frontend_bilateral_with_null_widths_uses_defaults():
    """When hood_width=None, stance_width=None, and hip_width=None, the frontend
    must use the same defaults as the backend (155mm stance, 200mm hip, bar_width
    for hood_width)."""
    comp = _components(hood_width=None, stance_width=None)
    rider = _rider(hip_width=None)
    bike = synthesize_bike(_frame(), comp)
    pts_3d = solve_pose_3d(bike, comp, rider)

    # Frontend defaults (from geometry.ts)
    half_stance = _FE_DEFAULT_STANCE_WIDTH / 2.0   # 77.5
    half_hip = _FE_DEFAULT_HIP_WIDTH / 2.0         # 100.0
    half_hood = comp.bar_width / 2.0               # 200.0 (falls back to bar_width)
    half_shoulder = rider.shoulder_width / 2.0      # 190.0

    # Verify Z values match defaults
    assert abs(pts_3d["cleat_l"].z - half_stance) < TOLERANCE
    assert abs(pts_3d["cleat_r"].z - (-half_stance)) < TOLERANCE
    assert abs(pts_3d["hip_l"].z - half_hip) < TOLERANCE
    assert abs(pts_3d["hip_r"].z - (-half_hip)) < TOLERANCE
    assert abs(pts_3d["wrist_l"].z - half_hood) < TOLERANCE
    assert abs(pts_3d["wrist_r"].z - (-half_hood)) < TOLERANCE
    assert abs(pts_3d["shoulder_l"].z - half_shoulder) < TOLERANCE
    assert abs(pts_3d["shoulder_r"].z - (-half_shoulder)) < TOLERANCE
