from __future__ import annotations

from math import cos, radians, sin
from typing import Tuple

import numpy as np

from .constraints import evaluate_component_constraints, evaluate_posture_constraints, merge_constraint_results
from .geometry import BikePoints, synthesize_bike
from .mannequin2d import sample_pedal_stroke, solve_pose_2d
from .models import AngleBand, Components, ConstraintResult, ContactPoint, ContactPoints, PoseMetrics, PosePreset, SetupInput, SetupOutput


def _posture_band_penalty(value: float, band: AngleBand) -> float:
    """Quadratic penalty for deviating outside [min_deg, max_deg]; zero inside the band."""
    half_width = (band.max_deg - band.min_deg) / 2.0
    center = (band.min_deg + band.max_deg) / 2.0
    deviation = abs(value - center) - half_width
    if deviation > 0:
        return band.weight * deviation ** 2
    return 0.0


def _objective(
    target_saddle: Tuple[float, float],
    target_hoods: Tuple[float, float],
    bike_points: BikePoints,
    pose: PoseMetrics,
    preset: PosePreset,
) -> float:
    ts = np.array(target_saddle)
    th = np.array(target_hoods)
    ps = np.array([bike_points.saddle.x, bike_points.saddle.y])
    ph = np.array([bike_points.hoods.x, bike_points.hoods.y])
    cp_error = float(np.sum((ps - ts) ** 2) + np.sum((ph - th) ** 2))

    posture_penalty = (
        _posture_band_penalty(pose.trunk_angle_deg, preset.trunk_angle)
        + _posture_band_penalty(pose.hip_angle_deg, preset.hip_angle)
        + _posture_band_penalty(pose.shoulder_flexion_deg, preset.shoulder_flexion)
        + _posture_band_penalty(pose.elbow_flexion_deg, preset.elbow_flexion)
        + _posture_band_penalty(pose.knee_extension_deg, preset.knee_extension)
    )

    return cp_error + posture_penalty


def _circle_intersections_grid(
    ax: np.ndarray | float,
    ay: np.ndarray | float,
    bx: np.ndarray | float,
    by: np.ndarray | float,
    radius_a: float,
    radius_b: float,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Vectorised twin of mannequin2d._circle_intersections_both.

    Same formulas and clamps, applied element-wise over broadcast arrays.
    Returns (p1x, p1y, p2x, p2y).
    """
    dx, dy = bx - ax, by - ay
    dist = np.maximum(np.sqrt(dx ** 2 + dy ** 2), 1e-6)
    clamped = np.minimum(dist, radius_a + radius_b - 1e-6)
    base_d = (radius_a ** 2 - radius_b ** 2 + clamped ** 2) / (2 * clamped)
    h = np.sqrt(np.maximum(radius_a ** 2 - base_d ** 2, 0.0))
    bx2 = ax + (base_d * dx) / dist
    by2 = ay + (base_d * dy) / dist
    ox = (-dy * h) / dist
    oy = (dx * h) / dist
    return bx2 + ox, by2 + oy, bx2 - ox, by2 - oy


def _angle_at_point_grid(
    ax: np.ndarray | float,
    ay: np.ndarray | float,
    vx: np.ndarray | float,
    vy: np.ndarray | float,
    cx: np.ndarray | float,
    cy: np.ndarray | float,
) -> np.ndarray:
    """Vectorised twin of mannequin2d._angle_at_point (degrees at the vertex v)."""
    eax, eay = ax - vx, ay - vy
    ecx, ecy = cx - vx, cy - vy
    dot = eax * ecx + eay * ecy
    mag = np.sqrt(np.maximum((eax ** 2 + eay ** 2) * (ecx ** 2 + ecy ** 2), 1e-12))
    return np.degrees(np.arccos(np.clip(dot / mag, -1.0, 1.0)))


def _band_penalty_grid(value: np.ndarray, band: AngleBand) -> np.ndarray:
    """Vectorised twin of _posture_band_penalty."""
    half_width = (band.max_deg - band.min_deg) / 2.0
    center = (band.min_deg + band.max_deg) / 2.0
    deviation = np.abs(value - center) - half_width
    return np.where(deviation > 0, band.weight * deviation ** 2, 0.0)


def _grid_search_components(
    setup: SetupInput,
    saddle_heights: np.ndarray,
    spacer_stacks: np.ndarray,
    stem_lengths: np.ndarray,
    stem_angles: np.ndarray,
) -> Tuple[Components, BikePoints]:
    """Grid search over (saddle height, spacer stack, stem length, stem angle).

    The whole grid is evaluated with broadcast numpy arrays instead of a
    Python loop over ~34k pydantic model constructions and scalar IK solves
    (which took seconds per request). The maths mirrors synthesize_bike +
    solve_pose_2d exactly, restricted to the four searched axes; only the
    winning combination is re-synthesised through the scalar path.
    """
    frame = setup.frame
    comp = setup.components
    rider = setup.rider
    target_saddle = setup.target_contact_points.saddle
    target_hoods = setup.target_contact_points.hoods

    # Baseline candidate: the components exactly as supplied.
    best_components = comp
    best_points = synthesize_bike(frame, best_components)
    best_pose = solve_pose_2d(best_points, rider, comp.pedal_stack_height)
    best_obj = _objective(
        (target_saddle.x, target_saddle.y),
        (target_hoods.x, target_hoods.y),
        best_points,
        best_pose,
        setup.preset,
    )

    # Broadcast axes: shape (sh, ss, sl, sa) matches the original loop
    # nesting order, so first-occurrence argmin picks the same winner.
    sh = np.asarray(saddle_heights, dtype=float).reshape(-1, 1, 1, 1)
    ss = np.asarray(spacer_stacks, dtype=float).reshape(1, -1, 1, 1)
    sl = np.asarray(stem_lengths, dtype=float).reshape(1, 1, -1, 1)
    sa = np.asarray(stem_angles, dtype=float).reshape(1, 1, 1, -1)

    # Saddle position — depends only on saddle_clamp_offset.
    seat_rad = radians(frame.seat_angle_deg)
    seat_dir_x, seat_dir_y = -cos(seat_rad), sin(seat_rad)
    saddle_x = seat_dir_x * sh - comp.seatpost_offset + comp.saddle_rail_offset
    saddle_y = seat_dir_y * sh + comp.saddle_stack

    # Hoods position — depends only on (spacer_stack, stem_length, stem_angle).
    stem_rad = np.radians(sa)
    hoods_x = frame.reach + np.cos(stem_rad) * sl + comp.bar_reach + comp.hood_reach_offset
    hoods_y = frame.stack + ss + np.sin(stem_rad) * sl + comp.bar_drop + comp.hood_drop_offset

    # Cleat/ankle are constant across the grid (BDC, crank straight down).
    cleat_x = 0.0 - comp.cleat_setback
    cleat_y = 0.0 - comp.crank_length
    ankle_x = cleat_x
    ankle_y = cleat_y + comp.pedal_stack_height

    # Leg IK — hip varies only with saddle height.
    hip_x = saddle_x
    hip_y = saddle_y + rider.hip_joint_offset
    k1x, k1y, k2x, k2y = _circle_intersections_grid(
        hip_x, hip_y, ankle_x, ankle_y, rider.thigh_length, rider.shank_length
    )
    # Anterior-side knee selection (same rule as _circle_intersection_anterior).
    leg_dx, leg_dy = ankle_x - hip_x, ankle_y - hip_y
    cross1 = leg_dx * (k1y - hip_y) - leg_dy * (k1x - hip_x)
    knee_x = np.where(cross1 >= 0, k1x, k2x)
    knee_y = np.where(cross1 >= 0, k1y, k2y)
    knee_extension = _angle_at_point_grid(hip_x, hip_y, knee_x, knee_y, ankle_x, ankle_y)

    # Shoulder IK — closed chain between hip (per saddle height) and hoods
    # (per front-end combo); prefer the upper intersection.
    arm_length = rider.upper_arm_length + rider.forearm_length - 0.1
    s1x, s1y, s2x, s2y = _circle_intersections_grid(
        hip_x, hip_y, hoods_x, hoods_y, rider.torso_length, arm_length
    )
    upper = s1y >= s2y
    shoulder_x = np.where(upper, s1x, s2x)
    shoulder_y = np.where(upper, s1y, s2y)
    trunk_angle = np.degrees(np.arctan2(shoulder_y - hip_y, shoulder_x - hip_x))

    # Elbow IK — prefer the lower intersection.
    e1x, e1y, e2x, e2y = _circle_intersections_grid(
        shoulder_x, shoulder_y, hoods_x, hoods_y,
        rider.upper_arm_length, rider.forearm_length,
    )
    lower = e1y <= e2y
    elbow_x = np.where(lower, e1x, e2x)
    elbow_y = np.where(lower, e1y, e2y)

    hip_angle = _angle_at_point_grid(shoulder_x, shoulder_y, hip_x, hip_y, knee_x, knee_y)
    shoulder_flexion = _angle_at_point_grid(hip_x, hip_y, shoulder_x, shoulder_y, elbow_x, elbow_y)
    elbow_flexion = 180.0 - _angle_at_point_grid(
        shoulder_x, shoulder_y, elbow_x, elbow_y, hoods_x, hoods_y
    )

    cp_error = (
        ((saddle_x - target_saddle.x) ** 2 + (saddle_y - target_saddle.y) ** 2)
        + ((hoods_x - target_hoods.x) ** 2 + (hoods_y - target_hoods.y) ** 2)
    )
    posture_penalty = (
        _band_penalty_grid(trunk_angle, setup.preset.trunk_angle)
        + _band_penalty_grid(hip_angle, setup.preset.hip_angle)
        + _band_penalty_grid(shoulder_flexion, setup.preset.shoulder_flexion)
        + _band_penalty_grid(elbow_flexion, setup.preset.elbow_flexion)
        + _band_penalty_grid(knee_extension, setup.preset.knee_extension)
    )
    obj = cp_error + posture_penalty

    flat_idx = int(np.argmin(obj))
    if float(obj.flat[flat_idx]) < best_obj:
        i_sh, i_ss, i_sl, i_sa = np.unravel_index(flat_idx, obj.shape)
        base = comp.model_dump()
        base.update(
            saddle_clamp_offset=float(saddle_heights[i_sh]),
            spacer_stack=float(spacer_stacks[i_ss]),
            stem_length=float(stem_lengths[i_sl]),
            stem_angle_deg=float(stem_angles[i_sa]),
        )
        best_components = Components(**base)
        best_points = synthesize_bike(frame, best_components)

    return best_components, best_points


def solve_setup(setup: SetupInput) -> SetupOutput:
    pinned = set(setup.pinned_components)

    saddle_heights = (
        np.array([setup.components.saddle_clamp_offset])
        if "saddle_clamp_offset" in pinned
        else np.linspace(
            setup.target_contact_points.saddle.y - 20.0,
            setup.target_contact_points.saddle.y + 20.0,
            9,
        )
    )
    spacer_stacks = (
        np.array([setup.components.spacer_stack])
        if "spacer_stack" in pinned
        else np.linspace(0.0, 60.0, 13)
    )
    stem_lengths = (
        np.array([setup.components.stem_length])
        if "stem_length" in pinned
        else np.linspace(50.0, 180.0, 14)
    )
    stem_angles = (
        np.array([setup.components.stem_angle_deg])
        if "stem_angle_deg" in pinned
        else np.arange(-20.0, 20.0 + 1e-9, 2.0)
    )

    components, bike_points = _grid_search_components(
        setup=setup,
        saddle_heights=saddle_heights,
        spacer_stacks=spacer_stacks,
        stem_lengths=stem_lengths,
        stem_angles=stem_angles,
    )

    pose_metrics: PoseMetrics = solve_pose_2d(bike_points=bike_points, rider=setup.rider, pedal_stack_height=components.pedal_stack_height)
    # Stroke metrics only on the winning setup (too costly inside the grid search)
    stroke = sample_pedal_stroke(bike_points, components, setup.rider)
    pose_metrics = pose_metrics.model_copy(
        update={
            "knee_flexion_tdc_deg": stroke.knee_flexion_tdc_deg,
            "knee_extension_max_deg": stroke.knee_extension_max_deg,
            "kops_offset_mm": stroke.kops_offset_mm,
        }
    )
    component_constraints: ConstraintResult = evaluate_component_constraints(components=components)
    posture_constraints: ConstraintResult = evaluate_posture_constraints(
        pose=pose_metrics,
        preset=setup.preset,
    )
    constraints: ConstraintResult = merge_constraint_results(component_constraints, posture_constraints)

    contact_points = ContactPoints(
        saddle=ContactPoint(x=bike_points.saddle.x, y=bike_points.saddle.y),
        hoods=ContactPoint(x=bike_points.hoods.x, y=bike_points.hoods.y),
        cleat=ContactPoint(x=bike_points.cleat.x, y=bike_points.cleat.y),
    )

    return SetupOutput(
        frame=setup.frame,
        components=components,
        contact_points=contact_points,
        rider=setup.rider,
        preset=setup.preset,
        pose_metrics=pose_metrics,
        constraints=constraints,
    )
