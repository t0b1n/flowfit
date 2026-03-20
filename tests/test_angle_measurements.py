"""
Parametric knee/elbow angle measurement tests.

Tests are parametrized over (kneeFlexDeg, trunkAngleDeg) and exercise both:
  - 2D View path:    idealContactsFromRider → auto-seatpost → synthesizeBike → buildMannequin
  - 2D Overlay path: same but using backend synthesize_bike for bike contacts

Expected bugs:
  - ~4° knee flex error from saddle X offset (idealContactsFromRider ignores saddle_stack)
  - hoods formula mismatch between frontend angular projection and backend additive offsets
"""
from __future__ import annotations

import math
from typing import NamedTuple

import pytest

from bikegeo_core import Components, FrameGeometry
from bikegeo_core.coords import Vec2
from bikegeo_core.geometry import synthesize_bike
from bikegeo_core.mannequin2d import _angle_at_point, _circle_intersections
from bikegeo_core.models import RiderAnthropometrics


# ── Defaults matching the frontend ────────────────────────────────────────────

DEFAULT_HEIGHT = 1760
DEFAULT_INSEAM = 860
DEFAULT_SKELETAL_LEG = DEFAULT_INSEAM * 0.92  # ~791.2
DEFAULT_HIP_JOINT_OFFSET = 95.0

# buildRider: thigh = skeletalLeg * 0.53, shank = skeletalLeg * 0.47
DEFAULT_THIGH = DEFAULT_SKELETAL_LEG * 0.53  # ~419.3
DEFAULT_SHANK = DEFAULT_SKELETAL_LEG * 0.47  # ~371.9

HEIGHT_SCALE = DEFAULT_HEIGHT / 1800
DEFAULT_TORSO = 600 * HEIGHT_SCALE
DEFAULT_UPPER_ARM = 320 * HEIGHT_SCALE
DEFAULT_FOREARM = 280 * HEIGHT_SCALE
DEFAULT_FOOT = 290 * HEIGHT_SCALE
DEFAULT_SHOULDER_WIDTH = 400 * HEIGHT_SCALE


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
        crank_length=165.0,
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
        bar_width=370.0,
        hood_width=370.0,
        stance_width=155.0,
        saddle_stack=52.0,
        seatpost_offset=0.0,
        saddle_rail_offset=0.0,
        pedal_stack_height=12.0,
    )
    base.update(overrides)
    return Components(**base)


def _rider() -> RiderAnthropometrics:
    return RiderAnthropometrics(
        height=DEFAULT_HEIGHT,
        thigh_length=DEFAULT_THIGH,
        shank_length=DEFAULT_SHANK,
        torso_length=DEFAULT_TORSO,
        upper_arm_length=DEFAULT_UPPER_ARM,
        forearm_length=DEFAULT_FOREARM,
        foot_length=DEFAULT_FOOT,
        shoulder_width=DEFAULT_SHOULDER_WIDTH,
        hip_joint_offset=DEFAULT_HIP_JOINT_OFFSET,
    )


# ── Frontend replicas ────────────────────────────────────────────────────────


class ContactPoint(NamedTuple):
    x: float
    y: float


class IdealContacts(NamedTuple):
    saddle: ContactPoint
    hoods: ContactPoint
    cleat: ContactPoint


def _frontend_ideal_contacts(
    thigh_length: float,
    shank_length: float,
    torso_length: float,
    upper_arm_length: float,
    forearm_length: float,
    hip_joint_offset: float,
    target_knee_ext_deg: float,
    target_trunk_angle_deg: float,
    crank_length: float,
    seat_angle_deg: float,
    bar_width: float = 0.0,
    pedal_stack_height: float = 0.0,
    saddle_stack: float = 0.0,
) -> IdealContacts:
    """Replica of geometry.ts idealContactsFromRider (lines 454-530)."""
    seat_angle = math.radians(seat_angle_deg)
    cleat = ContactPoint(0.0, -crank_length)
    ankle = ContactPoint(0.0, -crank_length + pedal_stack_height)

    clamped_target_ext = min(target_knee_ext_deg, 179.9)
    lo, hi = 400.0, 950.0
    for _ in range(50):
        mid = (lo + hi) / 2
        saddle_mid_x = -math.cos(seat_angle) * mid
        saddle_mid_y = math.sin(seat_angle) * mid + saddle_stack
        hip_x = saddle_mid_x
        hip_y = saddle_mid_y + hip_joint_offset
        kx, ky = _circle_intersections(hip_x, hip_y, ankle.x, ankle.y, thigh_length, shank_length, True)
        ext = _angle_at_point(hip_x, hip_y, kx, ky, ankle.x, ankle.y)
        if ext < clamped_target_ext:
            lo = mid
        else:
            hi = mid

    saddle_offset = (lo + hi) / 2
    saddle = ContactPoint(
        -math.cos(seat_angle) * saddle_offset,
        math.sin(seat_angle) * saddle_offset + saddle_stack,
    )
    hip = ContactPoint(saddle.x, saddle.y + hip_joint_offset)

    trunk_rad = math.radians(target_trunk_angle_deg)
    shoulder = ContactPoint(
        hip.x + math.cos(trunk_rad) * torso_length,
        hip.y + math.sin(trunk_rad) * torso_length,
    )

    target_elbow_interior_rad = math.radians(165)
    arm_reach_3d = math.sqrt(
        upper_arm_length**2 + forearm_length**2
        - 2 * upper_arm_length * forearm_length * math.cos(target_elbow_interior_rad)
    )
    arm_reach = math.sqrt(max(0, arm_reach_3d**2 - (bar_width / 2) ** 2))
    arm_angle = trunk_rad - math.pi / 2
    hoods = ContactPoint(
        shoulder.x + math.cos(arm_angle) * arm_reach,
        shoulder.y + math.sin(arm_angle) * arm_reach,
    )
    return IdealContacts(saddle, hoods, cleat)


def _auto_seatpost(ideal_saddle_y: float, saddle_stack: float, seat_angle_deg: float) -> float:
    """Replica of FitBuilderMode auto-seatpost (lines 230-234).
    Returns saddle_clamp_offset."""
    seat_angle = math.radians(seat_angle_deg)
    clamp_y = ideal_saddle_y - saddle_stack
    offset = clamp_y / math.sin(seat_angle)
    return max(400.0, min(950.0, offset))


def _frontend_hoods(bar_clamp_x: float, bar_clamp_y: float, comp: Components) -> ContactPoint:
    """Replica of frontend hoods formula (geometry.ts:371-376)."""
    hood_angle = math.radians(max(8, comp.stem_angle_deg + 6))
    hood_length = comp.bar_reach + comp.hood_reach_offset
    return ContactPoint(
        bar_clamp_x + math.cos(hood_angle) * hood_length,
        bar_clamp_y + math.sin(hood_angle) * hood_length + comp.hood_drop_offset,
    )


def _frontend_bar_clamp(frame: FrameGeometry, comp: Components) -> ContactPoint:
    """Replica of frontend bar_clamp calculation."""
    steerer_top_x = frame.reach
    steerer_top_y = frame.stack + comp.spacer_stack
    stem_angle = math.radians(comp.stem_angle_deg)
    return ContactPoint(
        steerer_top_x + math.cos(stem_angle) * comp.stem_length,
        steerer_top_y + math.sin(stem_angle) * comp.stem_length,
    )


def _build_mannequin_knee_ext(
    saddle: ContactPoint,
    cleat: ContactPoint,
    thigh_length: float,
    shank_length: float,
    hip_joint_offset: float,
    pedal_stack_height: float,
) -> float:
    """Compute knee extension angle as buildMannequin does."""
    hip = ContactPoint(saddle.x, saddle.y + hip_joint_offset)
    ankle = ContactPoint(cleat.x, cleat.y + pedal_stack_height)
    kx, ky = _circle_intersections(hip.x, hip.y, ankle.x, ankle.y, thigh_length, shank_length, True)
    return _angle_at_point(hip.x, hip.y, kx, ky, ankle.x, ankle.y)


def _build_mannequin_elbow_flex(
    saddle: ContactPoint,
    hoods: ContactPoint,
    thigh_length: float,
    shank_length: float,
    torso_length: float,
    upper_arm_length: float,
    forearm_length: float,
    hip_joint_offset: float,
    bar_width: float,
    trunk_angle_deg: float,
) -> float:
    """Compute elbow flexion angle as buildMannequin does (forward kinematics)."""
    hip = ContactPoint(saddle.x, saddle.y + hip_joint_offset)

    trunk_rad = math.radians(trunk_angle_deg)
    shoulder = ContactPoint(
        hip.x + math.cos(trunk_rad) * torso_length,
        hip.y + math.sin(trunk_rad) * torso_length,
    )

    # Projected arm lengths (same as frontend)
    lateral_offset = bar_width / 2
    total_arm = upper_arm_length + forearm_length
    upper_arm_2d = math.sqrt(max(0, upper_arm_length**2 - (lateral_offset * upper_arm_length / total_arm) ** 2))
    forearm_2d = math.sqrt(max(0, forearm_length**2 - (lateral_offset * forearm_length / total_arm) ** 2))
    max_reach_2d = upper_arm_2d + forearm_2d

    to_hands_x = hoods.x - shoulder.x
    to_hands_y = hoods.y - shoulder.y
    to_hands_dist = math.hypot(to_hands_x, to_hands_y)
    if to_hands_dist > max_reach_2d and to_hands_dist > 1e-6:
        hands = ContactPoint(
            shoulder.x + (to_hands_x / to_hands_dist) * max_reach_2d,
            shoulder.y + (to_hands_y / to_hands_dist) * max_reach_2d,
        )
    else:
        hands = hoods

    # Elbow via circle intersections (prefer lower)
    ex, ey = _circle_intersections(
        shoulder.x, shoulder.y, hands.x, hands.y, upper_arm_2d, forearm_2d, False
    )
    elbow_interior = _angle_at_point(shoulder.x, shoulder.y, ex, ey, hands.x, hands.y)
    return 180.0 - elbow_interior


# ── Full pipeline helpers ─────────────────────────────────────────────────────


def _2d_view_pipeline(knee_flex_deg: float, trunk_angle_deg: float):
    """Run the full 2D view pipeline and return (knee_ext, elbow_flex, saddle, hoods, cleat)."""
    comp = _components()
    frame = _frame()
    rider = _rider()
    target_knee_ext = 180.0 - knee_flex_deg

    ideal = _frontend_ideal_contacts(
        thigh_length=rider.thigh_length,
        shank_length=rider.shank_length,
        torso_length=rider.torso_length,
        upper_arm_length=rider.upper_arm_length,
        forearm_length=rider.forearm_length,
        hip_joint_offset=rider.hip_joint_offset,
        target_knee_ext_deg=target_knee_ext,
        target_trunk_angle_deg=trunk_angle_deg,
        crank_length=comp.crank_length,
        seat_angle_deg=frame.seat_angle_deg,
        bar_width=comp.bar_width,
        pedal_stack_height=comp.pedal_stack_height,
        saddle_stack=comp.saddle_stack,
    )

    # Auto-seatpost
    clamp_offset = _auto_seatpost(ideal.saddle.y, comp.saddle_stack, frame.seat_angle_deg)
    comp_with_seatpost = _components(saddle_clamp_offset=clamp_offset)

    # synthesize bike (frontend)
    seat_angle = math.radians(frame.seat_angle_deg)
    saddle_clamp_x = -math.cos(seat_angle) * clamp_offset - comp.seatpost_offset
    saddle_clamp_y = math.sin(seat_angle) * clamp_offset
    actual_saddle = ContactPoint(
        saddle_clamp_x + comp.saddle_rail_offset,
        saddle_clamp_y + comp.saddle_stack,
    )
    actual_cleat = ContactPoint(-comp.cleat_setback, -comp.crank_length)

    # Frontend hoods
    bar_clamp = _frontend_bar_clamp(frame, comp)
    actual_hoods = _frontend_hoods(bar_clamp.x, bar_clamp.y, comp)

    # Measure knee extension via buildMannequin
    knee_ext = _build_mannequin_knee_ext(
        actual_saddle, actual_cleat,
        rider.thigh_length, rider.shank_length,
        rider.hip_joint_offset, comp.pedal_stack_height,
    )

    # Measure elbow flexion via buildMannequin
    elbow_flex = _build_mannequin_elbow_flex(
        actual_saddle, actual_hoods,
        rider.thigh_length, rider.shank_length,
        rider.torso_length, rider.upper_arm_length, rider.forearm_length,
        rider.hip_joint_offset, comp.bar_width, trunk_angle_deg,
    )

    return knee_ext, elbow_flex, actual_saddle, actual_hoods, actual_cleat


def _2d_overlay_pipeline(knee_flex_deg: float, trunk_angle_deg: float):
    """Run the full 2D overlay pipeline (backend synthesize_bike)."""
    comp = _components()
    frame = _frame()
    rider = _rider()
    target_knee_ext = 180.0 - knee_flex_deg

    ideal = _frontend_ideal_contacts(
        thigh_length=rider.thigh_length,
        shank_length=rider.shank_length,
        torso_length=rider.torso_length,
        upper_arm_length=rider.upper_arm_length,
        forearm_length=rider.forearm_length,
        hip_joint_offset=rider.hip_joint_offset,
        target_knee_ext_deg=target_knee_ext,
        target_trunk_angle_deg=trunk_angle_deg,
        crank_length=comp.crank_length,
        seat_angle_deg=frame.seat_angle_deg,
        bar_width=comp.bar_width,
        pedal_stack_height=comp.pedal_stack_height,
        saddle_stack=comp.saddle_stack,
    )

    # Auto-seatpost
    clamp_offset = _auto_seatpost(ideal.saddle.y, comp.saddle_stack, frame.seat_angle_deg)
    comp_with_seatpost = _components(saddle_clamp_offset=clamp_offset)

    # Backend synthesize_bike
    bike = synthesize_bike(frame, comp_with_seatpost)
    actual_saddle = ContactPoint(bike.saddle.x, bike.saddle.y)
    actual_cleat = ContactPoint(bike.cleat.x, bike.cleat.y)
    actual_hoods = ContactPoint(bike.hoods.x, bike.hoods.y)

    knee_ext = _build_mannequin_knee_ext(
        actual_saddle, actual_cleat,
        rider.thigh_length, rider.shank_length,
        rider.hip_joint_offset, comp.pedal_stack_height,
    )

    elbow_flex = _build_mannequin_elbow_flex(
        actual_saddle, actual_hoods,
        rider.thigh_length, rider.shank_length,
        rider.torso_length, rider.upper_arm_length, rider.forearm_length,
        rider.hip_joint_offset, comp.bar_width, trunk_angle_deg,
    )

    return knee_ext, elbow_flex, actual_saddle, actual_hoods, actual_cleat


# ── Test matrix ───────────────────────────────────────────────────────────────

KNEE_FLEX_VALUES = [5, 10, 15, 20, 30]
TRUNK_ANGLE_VALUES = [33, 43, 55, 65]

KNEE_FLEX_IDS = [f"kf{k}" for k in KNEE_FLEX_VALUES]
TRUNK_ANGLE_IDS = [f"ta{t}" for t in TRUNK_ANGLE_VALUES]

KNEE_TOLERANCE_DEG = 1.0
ELBOW_CONSISTENCY_TOLERANCE_DEG = 2.0


# ── Test 1: 2D view knee flex matches target ──────────────────────────────────

@pytest.mark.parametrize("trunk_angle_deg", TRUNK_ANGLE_VALUES, ids=TRUNK_ANGLE_IDS)
@pytest.mark.parametrize("knee_flex_deg", KNEE_FLEX_VALUES, ids=KNEE_FLEX_IDS)
def test_2d_view_knee_flex_matches_target(knee_flex_deg, trunk_angle_deg):
    """Knee flex measured on the mannequin should match the target slider value."""
    target_knee_ext = 180.0 - knee_flex_deg
    knee_ext, _, _, _, _ = _2d_view_pipeline(knee_flex_deg, trunk_angle_deg)
    measured_flex = 180.0 - knee_ext
    assert abs(measured_flex - knee_flex_deg) < KNEE_TOLERANCE_DEG, (
        f"2D view knee flex mismatch: target={knee_flex_deg}°, "
        f"measured={measured_flex:.2f}° (ext={knee_ext:.2f}°)"
    )


# ── Test 2: 2D overlay knee flex matches target ──────────────────────────────

@pytest.mark.parametrize("trunk_angle_deg", TRUNK_ANGLE_VALUES, ids=TRUNK_ANGLE_IDS)
@pytest.mark.parametrize("knee_flex_deg", KNEE_FLEX_VALUES, ids=KNEE_FLEX_IDS)
def test_2d_overlay_knee_flex_matches_target(knee_flex_deg, trunk_angle_deg):
    """Knee flex from the overlay path should also match the target."""
    knee_ext, _, _, _, _ = _2d_overlay_pipeline(knee_flex_deg, trunk_angle_deg)
    measured_flex = 180.0 - knee_ext
    assert abs(measured_flex - knee_flex_deg) < KNEE_TOLERANCE_DEG, (
        f"2D overlay knee flex mismatch: target={knee_flex_deg}°, "
        f"measured={measured_flex:.2f}° (ext={knee_ext:.2f}°)"
    )


# ── Test 3: Knee flex independent of trunk angle ─────────────────────────────

@pytest.mark.parametrize("knee_flex_deg", KNEE_FLEX_VALUES, ids=KNEE_FLEX_IDS)
def test_knee_flex_independent_of_trunk_angle(knee_flex_deg):
    """Knee IK depends only on saddle/cleat, not trunk angle."""
    extensions = []
    for ta in TRUNK_ANGLE_VALUES:
        ext, _, _, _, _ = _2d_view_pipeline(knee_flex_deg, ta)
        extensions.append(ext)
    spread = max(extensions) - min(extensions)
    assert spread < 0.1, (
        f"Knee extension varies {spread:.2f}° across trunk angles "
        f"(expected < 0.1°): {extensions}"
    )


# ── Test 4: Elbow consistent between 2D view and overlay ─────────────────────

@pytest.mark.parametrize("trunk_angle_deg", TRUNK_ANGLE_VALUES, ids=TRUNK_ANGLE_IDS)
@pytest.mark.parametrize("knee_flex_deg", KNEE_FLEX_VALUES, ids=KNEE_FLEX_IDS)
@pytest.mark.xfail(reason="BUG: frontend angular hoods vs backend additive hoods formula divergence", strict=False)
def test_elbow_consistent_between_2d_view_and_overlay(knee_flex_deg, trunk_angle_deg):
    """Elbow flex should be the same whether hoods come from frontend or backend."""
    _, elbow_view, _, _, _ = _2d_view_pipeline(knee_flex_deg, trunk_angle_deg)
    _, elbow_overlay, _, _, _ = _2d_overlay_pipeline(knee_flex_deg, trunk_angle_deg)
    assert abs(elbow_view - elbow_overlay) < ELBOW_CONSISTENCY_TOLERANCE_DEG, (
        f"Elbow flex mismatch: 2D view={elbow_view:.2f}°, "
        f"overlay={elbow_overlay:.2f}° (Δ={abs(elbow_view - elbow_overlay):.2f}°)"
    )


# ── Test 5: Elbow varies with trunk angle ────────────────────────────────────

@pytest.mark.parametrize("knee_flex_deg", KNEE_FLEX_VALUES, ids=KNEE_FLEX_IDS)
def test_elbow_varies_with_trunk_angle(knee_flex_deg):
    """Elbow bends more as trunk rises (higher trunk angle = more upright = more elbow flex)."""
    flexions = []
    for ta in TRUNK_ANGLE_VALUES:
        _, elbow, _, _, _ = _2d_view_pipeline(knee_flex_deg, ta)
        flexions.append(elbow)
    # At least some variation expected
    spread = max(flexions) - min(flexions)
    assert spread > 1.0, (
        f"Elbow flex barely varies across trunk angles (spread={spread:.2f}°): {flexions}"
    )


# ── Test 6: Elbow in sensible range ──────────────────────────────────────────

@pytest.mark.parametrize("trunk_angle_deg", TRUNK_ANGLE_VALUES, ids=TRUNK_ANGLE_IDS)
@pytest.mark.parametrize("knee_flex_deg", KNEE_FLEX_VALUES, ids=KNEE_FLEX_IDS)
def test_elbow_in_sensible_range(knee_flex_deg, trunk_angle_deg):
    """Elbow flexion should be between 0° (fully extended) and 90° (right angle)."""
    _, elbow_view, _, _, _ = _2d_view_pipeline(knee_flex_deg, trunk_angle_deg)
    assert 0 <= elbow_view <= 90, (
        f"Elbow flex out of range: {elbow_view:.2f}° (expected 0-90°)"
    )
