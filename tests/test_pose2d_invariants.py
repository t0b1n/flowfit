"""Invariants of the 2D pose solve (solve_pose_2d_full).

Ported from the former 2D-vs-3D mirror test files when the backend 3D
export pipeline was removed (the 3D view is now built client-side from the
same code as the 2D view). These tests cover the surviving IK core:
limb-length preservation, anatomical sanity, and degenerate-reach clamping.
"""

from __future__ import annotations

from bikegeo_core.geometry import synthesize_bike
from bikegeo_core.mannequin2d import solve_pose_2d_full
from bikegeo_core.models import Components, FrameGeometry, RiderAnthropometrics

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


def _bike():
    return synthesize_bike(_frame(), _components())


# Feasible fixture (saddle low enough that limbs can reach): with
# hip_joint_offset=95 and saddle_stack=75, saddle_clamp_offset=400 leaves a
# hip-to-ankle gap of ≈722 mm (≈89 % of thigh+shank=810 mm) — a realistic fit.

def _feasible_bike():
    return synthesize_bike(_frame(), _components(saddle_clamp_offset=400))


def _feasible_2d_joints():
    _, joints = solve_pose_2d_full(_feasible_bike(), _rider())
    return joints


# ── Basic viability ───────────────────────────────────────────────────────────

def test_solve_pose_2d_full_does_not_crash():
    """The pose solve must run with default pedal_stack_height routing."""
    _, joints = solve_pose_2d_full(_bike(), _rider())
    assert joints is not None


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
    """2D elbow-to-hand distance must be approximately forearm_length.
    The wrist is at forearm_length - palm_length from elbow; the hand
    extends to the hoods position at full forearm reach."""
    j2 = _feasible_2d_joints()
    r = _rider()
    # elbow→hand should be close to forearm_length (hand is at the hoods)
    dist_hand = ((j2.hand.x - j2.elbow.x) ** 2 + (j2.hand.y - j2.elbow.y) ** 2) ** 0.5
    assert abs(dist_hand - r.forearm_length) < 1.0, (
        f"elbow→hand dist={dist_hand:.4f}, expected ~{r.forearm_length}"
    )
    # wrist should be at forearm_length - palm_length from elbow
    palm_length = 0.055 * r.height
    expected_wrist_dist = r.forearm_length - palm_length
    dist_wrist = ((j2.wrist.x - j2.elbow.x) ** 2 + (j2.wrist.y - j2.elbow.y) ** 2) ** 0.5
    assert abs(dist_wrist - expected_wrist_dist) < 1.0, (
        f"elbow→wrist dist={dist_wrist:.4f}, expected ~{expected_wrist_dist:.4f}"
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
    """Shoulder-to-hand distance must be less than upper_arm + forearm so the
    arm IK has a valid solution (circles intersect).  The outer IK places the
    shoulder at arm_length - 0.1 mm from the hand, so reach ≈ arm_len - 0.1."""
    r = _rider()
    _, j2 = solve_pose_2d_full(_feasible_bike(), r)
    reach = ((j2.hand.x - j2.shoulder.x) ** 2 + (j2.hand.y - j2.shoulder.y) ** 2) ** 0.5
    arm_len = r.upper_arm_length + r.forearm_length
    assert reach < arm_len, (
        f"shoulder-to-hand dist {reach:.4f} must be < arm len {arm_len}"
    )
    # And the reach should be close to the full arm length (within 1 mm)
    assert reach > arm_len - 1.0, (
        f"shoulder-to-hand dist {reach:.4f} unexpectedly far below arm len {arm_len}"
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
