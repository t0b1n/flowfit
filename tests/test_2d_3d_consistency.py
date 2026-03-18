"""
Tests that the 3D mannequin is a faithful bilateral expansion of the 2D mannequin.
Every joint's X and Y in 3D must match the corresponding 2D joint exactly,
since mannequin3d is defined as a pure sagittal-plane expansion.
"""
from __future__ import annotations

import pytest

from bikegeo_core import Components, FrameGeometry
from bikegeo_core.geometry import synthesize_bike
from bikegeo_core.mannequin2d import solve_pose_2d_full
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


# ── Helpers ───────────────────────────────────────────────────────────────────

def _bike():
    return synthesize_bike(_frame(), _components())


def _2d_joints():
    _, joints = solve_pose_2d_full(_bike(), _rider())
    return joints


def _3d_pts():
    return solve_pose_3d(_bike(), _components(), _rider())


# ── XY consistency for every mannequin joint ──────────────────────────────────

@pytest.mark.parametrize("joint_name,pt3d_key", [
    ("hip",      "hip_l"),
    ("hip",      "hip_r"),
    ("hip",      "hip_center"),
    ("knee",     "knee_l"),
    ("knee",     "knee_r"),
    ("ankle",    "ankle_l"),
    ("ankle",    "ankle_r"),
    ("shoulder", "shoulder_l"),
    ("shoulder", "shoulder_r"),
    ("shoulder", "shoulder_center"),
    ("elbow",    "elbow_l"),
    ("elbow",    "elbow_r"),
    ("wrist",    "wrist_l"),
    ("wrist",    "wrist_r"),
])
def test_3d_joint_xy_matches_2d(joint_name, pt3d_key):
    """Every 3D joint's XY must equal the corresponding 2D joint."""
    joints2d = _2d_joints()
    pts3d = _3d_pts()

    j2 = getattr(joints2d, joint_name)
    j3 = pts3d[pt3d_key]

    assert abs(j3.x - j2.x) < TOLERANCE, (
        f"{pt3d_key}.x ({j3.x:.4f}) != {joint_name}_2d.x ({j2.x:.4f})"
    )
    assert abs(j3.y - j2.y) < TOLERANCE, (
        f"{pt3d_key}.y ({j3.y:.4f}) != {joint_name}_2d.y ({j2.y:.4f})"
    )


# ── Structural anchors: 3D frame points match 2D mannequin fixed points ────────

def test_saddle_3d_matches_hip_2d():
    """The 3D saddle point must be at the same XY as the 2D hip (= saddle)."""
    j2 = _2d_joints()
    pts3d = _3d_pts()
    bike = _bike()

    # 3D saddle XY == bike_points.saddle == 2D hip
    assert abs(pts3d["saddle"].x - j2.hip.x) < TOLERANCE
    assert abs(pts3d["saddle"].y - j2.hip.y) < TOLERANCE
    # sanity: bike saddle == 2D hip
    assert abs(bike.saddle.x - j2.hip.x) < TOLERANCE
    assert abs(bike.saddle.y - j2.hip.y) < TOLERANCE


def test_hoods_3d_matches_wrist_2d():
    """The 3D hoods_l/r XY must match the 2D wrist (= hoods contact point)."""
    j2 = _2d_joints()
    pts3d = _3d_pts()
    bike = _bike()

    for key in ("hoods_l", "hoods_r"):
        assert abs(pts3d[key].x - j2.wrist.x) < TOLERANCE, f"{key}.x mismatch"
        assert abs(pts3d[key].y - j2.wrist.y) < TOLERANCE, f"{key}.y mismatch"
    # sanity: bike hoods == 2D wrist
    assert abs(bike.hoods.x - j2.wrist.x) < TOLERANCE
    assert abs(bike.hoods.y - j2.wrist.y) < TOLERANCE


def test_cleat_3d_matches_ankle_2d():
    """The 3D cleat_l/r XY must match the 2D ankle (= cleat at BDC)."""
    j2 = _2d_joints()
    pts3d = _3d_pts()
    bike = _bike()

    for key in ("cleat_l", "cleat_r"):
        assert abs(pts3d[key].x - j2.ankle.x) < TOLERANCE, f"{key}.x mismatch"
        assert abs(pts3d[key].y - j2.ankle.y) < TOLERANCE, f"{key}.y mismatch"
    # sanity: bike cleat == 2D ankle
    assert abs(bike.cleat.x - j2.ankle.x) < TOLERANCE
    assert abs(bike.cleat.y - j2.ankle.y) < TOLERANCE


# ── Feasible fixture (saddle low enough that limbs can reach) ────────────────
#
# With saddle_clamp_offset=700 the hip-to-cleat gap is ~829 mm which exceeds
# thigh+shank=810 mm — the circles can't intersect.  Use 540 mm instead;
# the resulting gap is ~672 mm (≈83 % extension), a realistic cycling fit.

def _feasible_bike():
    return synthesize_bike(_frame(), _components(saddle_clamp_offset=540))


def _feasible_2d_joints():
    _, joints = solve_pose_2d_full(_feasible_bike(), _rider())
    return joints


# ── Limb-length preservation in the sagittal plane ──────────────────────────

def test_thigh_length_preserved_2d():
    """2D knee must be exactly thigh_length from hip (feasible geometry)."""
    j2 = _feasible_2d_joints()
    r = _rider()
    dist = ((j2.knee.x - j2.hip.x) ** 2 + (j2.knee.y - j2.hip.y) ** 2) ** 0.5
    assert abs(dist - r.thigh_length) < TOLERANCE, (
        f"thigh dist={dist:.4f}, expected {r.thigh_length}"
    )


def test_shank_length_preserved_2d():
    """2D ankle must be exactly shank_length from knee (feasible geometry)."""
    j2 = _feasible_2d_joints()
    r = _rider()
    dist = ((j2.ankle.x - j2.knee.x) ** 2 + (j2.ankle.y - j2.knee.y) ** 2) ** 0.5
    assert abs(dist - r.shank_length) < TOLERANCE, (
        f"shank dist={dist:.4f}, expected {r.shank_length}"
    )


def test_upper_arm_length_preserved_2d():
    """2D elbow must be exactly upper_arm_length from shoulder."""
    j2 = _feasible_2d_joints()
    r = _rider()
    dist = ((j2.elbow.x - j2.shoulder.x) ** 2 + (j2.elbow.y - j2.shoulder.y) ** 2) ** 0.5
    assert abs(dist - r.upper_arm_length) < TOLERANCE, (
        f"upper_arm dist={dist:.4f}, expected {r.upper_arm_length}"
    )


def test_forearm_length_preserved_2d():
    """2D wrist must be exactly forearm_length from elbow."""
    j2 = _feasible_2d_joints()
    r = _rider()
    dist = ((j2.wrist.x - j2.elbow.x) ** 2 + (j2.wrist.y - j2.elbow.y) ** 2) ** 0.5
    assert abs(dist - r.forearm_length) < TOLERANCE, (
        f"forearm dist={dist:.4f}, expected {r.forearm_length}"
    )


def test_torso_length_preserved_2d():
    """2D shoulder must be exactly torso_length from hip."""
    j2 = _feasible_2d_joints()
    r = _rider()
    dist = ((j2.shoulder.x - j2.hip.x) ** 2 + (j2.shoulder.y - j2.hip.y) ** 2) ** 0.5
    assert abs(dist - r.torso_length) < TOLERANCE, (
        f"torso dist={dist:.4f}, expected {r.torso_length}"
    )


# ── Anatomical sanity: shoulder above hip, trunk angle positive ───────────────

def test_shoulder_is_above_hip_for_typical_road_bike():
    """Shoulder must be higher (greater Y) than the hip — the trunk leans forward,
    not downward. This was broken when trunk_angle used hoods.y - saddle.y (negative
    for most road bikes), placing the shoulder at handlebar height."""
    _, j2 = solve_pose_2d_full(_bike(), _rider())
    assert j2.shoulder.y > j2.hip.y, (
        f"shoulder y ({j2.shoulder.y:.1f}) must be above hip y ({j2.hip.y:.1f})"
    )


def test_trunk_angle_positive_for_typical_road_bike():
    """trunk_angle_deg should be positive (above horizontal) for a road bike where
    the saddle is higher than the hoods."""
    metrics, _ = solve_pose_2d_full(_bike(), _rider())
    assert metrics.trunk_angle_deg > 0, (
        f"trunk_angle_deg={metrics.trunk_angle_deg:.1f} should be > 0"
    )


def test_arm_can_reach_hoods():
    """Shoulder-to-wrist distance must be less than upper_arm + forearm so the
    arm IK has a valid solution (circles intersect).  The outer IK places the
    shoulder at arm_length - 0.1 mm from the wrist, so reach ≈ arm_len - 0.1."""
    r = _rider()
    _, j2 = solve_pose_2d_full(_feasible_bike(), r)
    reach = ((j2.wrist.x - j2.shoulder.x) ** 2 + (j2.wrist.y - j2.shoulder.y) ** 2) ** 0.5
    arm_len = r.upper_arm_length + r.forearm_length
    assert reach < arm_len, (
        f"shoulder-to-wrist dist {reach:.4f} must be < arm len {arm_len}"
    )
    # And the reach should be close to the full arm length (within 1 mm)
    assert reach > arm_len - 1.0, (
        f"shoulder-to-wrist dist {reach:.4f} unexpectedly far below arm len {arm_len}"
    )


def test_overstretched_knee_on_hip_ankle_line():
    """When limbs can't reach, knee must sit on the hip-ankle line at thigh_length from hip."""
    # saddle_clamp_offset=700 creates hip-ankle dist ≈ 829 mm > 420+390=810 mm
    bike = synthesize_bike(_frame(), _components(saddle_clamp_offset=700))
    r = _rider()
    _, j2 = solve_pose_2d_full(bike, r)

    # thigh length still preserved from hip
    thigh_dist = ((j2.knee.x - j2.hip.x) ** 2 + (j2.knee.y - j2.hip.y) ** 2) ** 0.5
    assert abs(thigh_dist - r.thigh_length) < TOLERANCE, (
        f"overstretched thigh dist={thigh_dist:.4f}, expected {r.thigh_length}"
    )

    # knee must lie on the line between hip and ankle (h=0 in clamped case)
    hip_ankle_dist = ((j2.ankle.x - j2.hip.x) ** 2 + (j2.ankle.y - j2.hip.y) ** 2) ** 0.5
    unit_x = (j2.ankle.x - j2.hip.x) / hip_ankle_dist
    unit_y = (j2.ankle.y - j2.hip.y) / hip_ankle_dist
    expected_knee_x = j2.hip.x + r.thigh_length * unit_x
    expected_knee_y = j2.hip.y + r.thigh_length * unit_y
    # The clamp epsilon introduces a sub-0.05 mm perpendicular deviation; use a
    # loose tolerance here — the important invariant is thigh_length above.
    assert abs(j2.knee.x - expected_knee_x) < 0.05
    assert abs(j2.knee.y - expected_knee_y) < 0.05


# ── Z-symmetry of bilateral pairs ─────────────────────────────────────────────

@pytest.mark.parametrize("l_key,r_key", [
    ("ankle_l", "ankle_r"),
    ("knee_l", "knee_r"),
    ("hip_l", "hip_r"),
    ("shoulder_l", "shoulder_r"),
    ("elbow_l", "elbow_r"),
    ("wrist_l", "wrist_r"),
    ("hoods_l", "hoods_r"),
    ("cleat_l", "cleat_r"),
])
def test_bilateral_pairs_are_z_mirrors(l_key, r_key):
    """Left and right joints must share the same X, Y and have equal-and-opposite Z."""
    pts = _3d_pts()
    l, r = pts[l_key], pts[r_key]

    assert abs(l.x - r.x) < TOLERANCE, f"{l_key}.x != {r_key}.x"
    assert abs(l.y - r.y) < TOLERANCE, f"{l_key}.y != {r_key}.y"
    assert abs(l.z + r.z) < TOLERANCE, f"{l_key}.z + {r_key}.z != 0"


# ── Cross-check with different rider proportions ──────────────────────────────

@pytest.mark.parametrize("thigh,shank", [
    (400.0, 370.0),
    (450.0, 410.0),
    (380.0, 360.0),
])
def test_3d_hip_knee_ankle_xy_consistent_across_rider_sizes(thigh, shank):
    """Regardless of rider dimensions, 3D joints must still project onto 2D joints."""
    r = _rider(thigh_length=thigh, shank_length=shank)
    bike = synthesize_bike(_frame(), _components())
    _, j2 = solve_pose_2d_full(bike, r)
    pts3d = solve_pose_3d(bike, _components(), r)

    for joint, key in [("hip", "hip_l"), ("knee", "knee_l"), ("ankle", "ankle_l")]:
        j2pt = getattr(j2, joint)
        j3pt = pts3d[key]
        assert abs(j3pt.x - j2pt.x) < TOLERANCE, (
            f"thigh={thigh},shank={shank}: {key}.x mismatch"
        )
        assert abs(j3pt.y - j2pt.y) < TOLERANCE, (
            f"thigh={thigh},shank={shank}: {key}.y mismatch"
        )
