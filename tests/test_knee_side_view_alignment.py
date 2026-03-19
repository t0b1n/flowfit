"""
Validates that the knee joint in the 3D side view is at the same position
as the knee in the 2D overlay skeleton.

In BikeScene3D, when "2D overlay" is toggled on, a green cylinder is drawn
from knee→ankle and knee→hip using mannequin2D.knee (frontend buildMannequin).
The 3D mannequin tube runs between knee_l→ankle_l and knee_l→hip_l using
positions from the backend solve_pose_3d().

On the side plane the knee appears at (knee.x, knee.y).  These must match.
"""
from __future__ import annotations

import math

import pytest

from bikegeo_core import Components, FrameGeometry
from bikegeo_core.coords import Vec2
from bikegeo_core.geometry import synthesize_bike
from bikegeo_core.mannequin2d import _circle_intersections
from bikegeo_core.mannequin3d import solve_pose_3d
from bikegeo_core.models import RiderAnthropometrics


# ── Fixtures ───────────────────────────────────────────────────────────────────

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
        cleat_setback=0.0,
        saddle_rail_length=80.0,
        saddle_clamp_offset=540.0,
        stem_length=100.0,
        stem_angle_deg=-6.0,
        spacer_stack=10.0,
        bar_reach=80.0,
        bar_drop=0.0,
        hood_reach_offset=24.6,
        hood_drop_offset=0.0,
        bar_width=400.0,
        hood_width=380.0,
        stance_width=155.0,
        saddle_stack=52.0,
        seatpost_offset=0.0,
        saddle_rail_offset=0.0,
        pedal_stack_height=12.0,
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
        hip_joint_offset=95.0,
    )
    base.update(overrides)
    return RiderAnthropometrics(**base)


# ── Frontend buildMannequin knee (2D overlay) ─────────────────────────────────

def _overlay_knee(bike, rider: RiderAnthropometrics, comp: Components) -> Vec2:
    """
    The knee position as the 2D overlay (frontend buildMannequin) computes it.

    Frontend uses the same 2-circle IK as the backend for the knee:
      hip  = (saddle.x, saddle.y + hip_joint_offset)
      ankle = (cleat.x,  cleat.y  + pedal_stack_height)
      knee = circle_intersections(hip, ankle, thigh_length, shank_length, preferUpper=True)

    pedal_stack_height is taken from components (where the model places it).
    """
    hip_x = bike.saddle.x
    hip_y = bike.saddle.y + rider.hip_joint_offset
    ankle_x = bike.cleat.x
    ankle_y = bike.cleat.y + comp.pedal_stack_height  # from components, not rider

    kx, ky = _circle_intersections(
        hip_x, hip_y, ankle_x, ankle_y,
        rider.thigh_length, rider.shank_length,
        True,  # prefer upper (anatomically correct)
    )
    return Vec2(kx, ky)


# ── Test ───────────────────────────────────────────────────────────────────────

SIDE_VIEW_TOLERANCE_MM = 1.0  # sub-mm expected; 1 mm catches any real divergence


def test_knee_side_view_3d_matches_2d_overlay():
    """
    On the side plane (XY projection, Z ignored) the knee joint rendered by
    the 3D mannequin must be at the same position as the knee drawn by the
    2D overlay skeleton.

    3D mannequin knee:  solve_pose_3d() → pts["knee_l"] projected to (x, y)
    2D overlay knee:    frontend buildMannequin() → mannequin2D.knee

    Both use the same circle-intersection IK from hip and ankle, so they should
    agree exactly when driven from the same inputs.

    This test will FAIL with AttributeError until BUG 1 is fixed:
      mannequin2d.solve_pose_2d_full() reads rider.pedal_stack_height but
      pedal_stack_height lives on Components, not RiderAnthropometrics.
    Once that routing is corrected this test should PASS.
    """
    comp = _components()
    bike = synthesize_bike(_frame(), comp)
    rider = _rider()

    # ── 3D side-view knee (drop Z, keep XY) ──────────────────────────────────
    pts3d = solve_pose_3d(bike, comp, rider)
    knee_3d = Vec2(pts3d["knee_l"].x, pts3d["knee_l"].y)

    # ── 2D overlay knee ───────────────────────────────────────────────────────
    knee_2d = _overlay_knee(bike, rider, comp)

    # ── Compare on the side plane ─────────────────────────────────────────────
    delta_x = abs(knee_3d.x - knee_2d.x)
    delta_y = abs(knee_3d.y - knee_2d.y)

    assert delta_x < SIDE_VIEW_TOLERANCE_MM and delta_y < SIDE_VIEW_TOLERANCE_MM, (
        f"Knee side-view mismatch:\n"
        f"  3D mannequin: ({knee_3d.x:.2f}, {knee_3d.y:.2f}) mm\n"
        f"  2D overlay:   ({knee_2d.x:.2f}, {knee_2d.y:.2f}) mm\n"
        f"  Δx = {delta_x:.2f} mm,  Δy = {delta_y:.2f} mm"
    )
