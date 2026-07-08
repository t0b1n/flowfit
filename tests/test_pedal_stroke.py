import math

from fastapi.testclient import TestClient

from bikegeo_api.main import app
from bikegeo_core import (
    Components,
    ContactPoint,
    ContactPoints,
    FrameGeometry,
    RiderAnthropometrics,
    SetupInput,
)
from bikegeo_core.constraints import evaluate_posture_constraints
from bikegeo_core.geometry import cleat_at_crank_angle, pedal_spindle_at_angle, synthesize_bike
from bikegeo_core.mannequin2d import (
    _circle_intersections,
    sample_pedal_stroke,
    solve_leg_2d,
    solve_pose_2d_full,
)
from bikegeo_core.models import AngleBand, PoseMetrics
from bikegeo_core.presets import ENDURANCE
from bikegeo_core.solver import solve_setup


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
    # saddle_clamp_offset 530 gives a realistic knee extension (~150°) for the
    # 430+430 mm test legs; higher values over-extend the leg at BDC.
    base = dict(
        crank_length=172.5,
        cleat_setback=10.0,
        saddle_rail_length=80.0,
        saddle_clamp_offset=530.0,
        stem_length=100.0,
        stem_angle_deg=6.0,
        spacer_stack=10.0,
        bar_reach=80.0,
        bar_drop=-40.0,
        hood_reach_offset=20.0,
        hood_drop_offset=0.0,
        bar_width=400.0,
        hood_width=None,
        stance_width=None,
    )
    base.update(overrides)
    return Components(**base)


def _rider() -> RiderAnthropometrics:
    return RiderAnthropometrics(
        height=1800.0,
        thigh_length=430.0,
        shank_length=430.0,
        torso_length=600.0,
        upper_arm_length=320.0,
        forearm_length=280.0,
        foot_length=270.0,
        shoulder_width=400.0,
        hip_width=None,
        stance_width=None,
        flexibility=1.0,
    )


def _setup_input(**component_overrides) -> SetupInput:
    return SetupInput(
        frame=_frame(),
        components=_components(**component_overrides),
        target_contact_points=ContactPoints(
            saddle=ContactPoint(x=0.0, y=700.0),
            hoods=ContactPoint(x=400.0, y=600.0),
            cleat=ContactPoint(x=0.0, y=-170.0),
        ),
        rider=_rider(),
        preset=ENDURANCE,
    )


# ── Crank-angle geometry ──────────────────────────────────────────────────────


def test_pedal_spindle_cardinal_angles() -> None:
    components = _components()
    bike = synthesize_bike(_frame(), components)
    bb = bike.bb
    crank = components.crank_length

    tdc = pedal_spindle_at_angle(bb, crank, 0.0)
    fwd = pedal_spindle_at_angle(bb, crank, 90.0)
    bdc = pedal_spindle_at_angle(bb, crank, 180.0)
    back = pedal_spindle_at_angle(bb, crank, 270.0)

    assert math.isclose(tdc.x, bb.x, abs_tol=1e-9) and math.isclose(tdc.y, bb.y + crank, abs_tol=1e-9)
    assert math.isclose(fwd.x, bb.x + crank, abs_tol=1e-9) and math.isclose(fwd.y, bb.y, abs_tol=1e-9)
    assert math.isclose(bdc.x, bb.x, abs_tol=1e-9) and math.isclose(bdc.y, bb.y - crank, abs_tol=1e-9)
    assert math.isclose(back.x, bb.x - crank, abs_tol=1e-9) and math.isclose(back.y, bb.y, abs_tol=1e-9)


def test_cleat_at_bdc_matches_synthesize_bike() -> None:
    components = _components()
    bike = synthesize_bike(_frame(), components)
    cleat = cleat_at_crank_angle(bike.bb, components, 180.0)
    assert math.isclose(cleat.x, bike.cleat.x, abs_tol=1e-9)
    assert math.isclose(cleat.y, bike.cleat.y, abs_tol=1e-9)


# ── Leg IK regression: anterior selection equals legacy prefer-upper at BDC ──


def test_anterior_knee_matches_prefer_upper_at_bdc() -> None:
    components = _components()
    rider = _rider()
    bike = synthesize_bike(_frame(), components)

    hip_x = bike.saddle.x
    hip_y = bike.saddle.y + rider.hip_joint_offset
    ankle_x = bike.cleat.x
    ankle_y = bike.cleat.y + components.pedal_stack_height
    legacy_knee = _circle_intersections(
        hip_x, hip_y, ankle_x, ankle_y, rider.thigh_length, rider.shank_length, True
    )

    metrics, joints = solve_pose_2d_full(bike, rider, components.pedal_stack_height)
    assert math.isclose(joints.knee.x, legacy_knee[0], abs_tol=1e-6)
    assert math.isclose(joints.knee.y, legacy_knee[1], abs_tol=1e-6)


# ── Stroke sampling ───────────────────────────────────────────────────────────


def test_tdc_flexion_exceeds_bdc_flexion() -> None:
    components = _components()
    rider = _rider()
    bike = synthesize_bike(_frame(), components)
    stroke = sample_pedal_stroke(bike, components, rider)
    metrics, _ = solve_pose_2d_full(bike, rider, components.pedal_stack_height)
    bdc_flexion = 180.0 - metrics.knee_extension_deg
    assert stroke.knee_flexion_tdc_deg > bdc_flexion + 30.0


def test_max_extension_at_least_bdc_extension() -> None:
    components = _components()
    rider = _rider()
    bike = synthesize_bike(_frame(), components)
    stroke = sample_pedal_stroke(bike, components, rider)
    metrics, _ = solve_pose_2d_full(bike, rider, components.pedal_stack_height)
    assert stroke.knee_extension_max_deg >= metrics.knee_extension_deg - 1e-9
    assert stroke.knee_extension_max_deg < 180.0


def test_kops_moves_forward_with_saddle() -> None:
    rider = _rider()
    components_back = _components(saddle_rail_offset=0.0)
    components_fwd = _components(saddle_rail_offset=25.0)
    stroke_back = sample_pedal_stroke(synthesize_bike(_frame(), components_back), components_back, rider)
    stroke_fwd = sample_pedal_stroke(synthesize_bike(_frame(), components_fwd), components_fwd, rider)
    assert stroke_fwd.kops_offset_mm > stroke_back.kops_offset_mm
    assert abs(stroke_back.kops_offset_mm) < 120.0


def test_overextended_stroke_does_not_raise() -> None:
    # Saddle far too high: the leg cannot reach the pedal mid-stroke; the
    # chord clamp should pin the knee near-straight instead of raising.
    components = _components(saddle_clamp_offset=880.0)
    rider = _rider()
    bike = synthesize_bike(_frame(), components)
    stroke = sample_pedal_stroke(bike, components, rider)
    assert stroke.knee_extension_max_deg <= 180.0
    assert math.isfinite(stroke.kops_offset_mm)


# ── Constraints & solver integration ─────────────────────────────────────────


def test_knee_flexion_tdc_band_violation_fires() -> None:
    preset = ENDURANCE.model_copy(
        update={"knee_flexion_tdc": AngleBand(min_deg=100.0, max_deg=115.0, weight=0.5)}
    )
    pose = PoseMetrics(
        trunk_angle_deg=55.0,
        hip_angle_deg=100.0,
        shoulder_flexion_deg=80.0,
        elbow_flexion_deg=15.0,
        knee_extension_deg=145.0,
        knee_flexion_tdc_deg=130.0,  # above the band max
    )
    result = evaluate_posture_constraints(pose, preset)
    assert any(v.name == "knee_flexion_tdc" for v in result.violations)

    # Absent band or absent metric → no check
    result_no_band = evaluate_posture_constraints(pose, ENDURANCE)
    assert not any(v.name == "knee_flexion_tdc" for v in result_no_band.violations)


def test_solve_setup_populates_stroke_metrics() -> None:
    solved = solve_setup(_setup_input())
    assert solved.pose_metrics.knee_flexion_tdc_deg is not None
    assert solved.pose_metrics.knee_extension_max_deg is not None
    assert solved.pose_metrics.kops_offset_mm is not None
    assert solved.pose_metrics.knee_flexion_tdc_deg > 60.0


# ── API export ────────────────────────────────────────────────────────────────


def test_geometry3d_exports_stroke_metrics_and_keeps_points() -> None:
    client = TestClient(app)
    resp = client.post("/geometry3d", json={"setup": _setup_input().model_dump()})
    assert resp.status_code == 200
    data = resp.json()
    assert data["version"] == "1.1.0"
    assert "kops_offset_mm" in data["pose_metrics"]
    assert "knee_flexion_tdc_deg" in data["pose_metrics"]

    point_names = {p["name"] for p in data["points"]}
    # The pre-existing geometry contract must be unchanged
    expected = {
        "bb", "rear_axle", "front_axle", "saddle", "steerer_top", "bar_clamp",
        "hoods_l", "hoods_r", "cleat_l", "cleat_r", "ankle_l", "ankle_r",
        "knee_l", "knee_r", "hip_l", "hip_r", "hip_center", "spine_joint",
        "shoulder_l", "shoulder_r", "shoulder_center", "elbow_l", "elbow_r",
        "wrist_l", "wrist_r", "hand_l", "hand_r", "head_center",
        "neck_base_center", "head_tube_top", "head_tube_bottom",
        "seat_tube_top", "seat_cluster", "saddle_clamp", "seatpost_top",
        "chainstay_l", "chainstay_r", "fork_l", "fork_r",
        "bar_top_l", "bar_top_r", "bar_drop_l", "bar_drop_r",
    }
    assert expected.issubset(point_names)
