from __future__ import annotations

from typing import Tuple

import numpy as np

from .constraints import evaluate_component_constraints, evaluate_posture_constraints, merge_constraint_results
from .geometry import BikePoints, synthesize_bike
from .mannequin2d import RawPose2D, sample_pedal_stroke, solve_pose_2d, solve_pose_raw
from .models import AngleBand, Components, ConstraintResult, ContactPoint, ContactPoints, PoseMetrics, PosePreset, SetupInput, SetupOutput


def _posture_band_penalty(value, band: AngleBand):
    """Quadratic penalty for deviating outside [min_deg, max_deg]; zero inside
    the band. Element-wise over scalars or broadcast arrays."""
    half_width = (band.max_deg - band.min_deg) / 2.0
    center = (band.min_deg + band.max_deg) / 2.0
    deviation = np.abs(value - center) - half_width
    return np.where(deviation > 0, band.weight * deviation ** 2, 0.0)


def _objective(
    target_saddle: Tuple[float, float],
    target_hoods: Tuple[float, float],
    bike_points: BikePoints,
    pose: RawPose2D,
    preset: PosePreset,
):
    """Contact-point error + posture-band penalty. Element-wise: evaluates one
    bike or the solver's whole broadcast component grid identically."""
    cp_error = (
        (bike_points.saddle.x - target_saddle[0]) ** 2
        + (bike_points.saddle.y - target_saddle[1]) ** 2
        + (bike_points.hoods.x - target_hoods[0]) ** 2
        + (bike_points.hoods.y - target_hoods[1]) ** 2
    )

    posture_penalty = (
        _posture_band_penalty(pose.trunk_angle_deg, preset.trunk_angle)
        + _posture_band_penalty(pose.hip_angle_deg, preset.hip_angle)
        + _posture_band_penalty(pose.shoulder_flexion_deg, preset.shoulder_flexion)
        + _posture_band_penalty(pose.elbow_flexion_deg, preset.elbow_flexion)
        + _posture_band_penalty(pose.knee_extension_deg, preset.knee_extension)
    )

    return cp_error + posture_penalty


def _grid_search_components(
    setup: SetupInput,
    saddle_heights: np.ndarray,
    spacer_stacks: np.ndarray,
    stem_lengths: np.ndarray,
    stem_angles: np.ndarray,
) -> Tuple[Components, BikePoints]:
    """Grid search over (saddle height, spacer stack, stem length, stem angle).

    The four searched axes are broadcast as an (sh, ss, sl, sa) grid carried
    inside a Components copy, and the whole grid flows through the same
    synthesize_bike / solve_pose_raw / _objective code as any single bike —
    there is no separate vectorised implementation to keep in sync. Only the
    winning combination is re-synthesised into concrete components.
    """
    comp = setup.components
    target_saddle = (setup.target_contact_points.saddle.x, setup.target_contact_points.saddle.y)
    target_hoods = (setup.target_contact_points.hoods.x, setup.target_contact_points.hoods.y)

    # Baseline candidate: the components exactly as supplied.
    best_components = comp
    best_points = synthesize_bike(setup.frame, comp)
    best_pose = solve_pose_raw(best_points, setup.rider, comp.pedal_stack_height)
    best_obj = float(_objective(target_saddle, target_hoods, best_points, best_pose, setup.preset))

    # Axis order (sh, ss, sl, sa) matches the original scalar loop nesting,
    # so first-occurrence argmin preserves the historical tie-breaking.
    # model_copy(update=...) skips validation, letting the copy carry arrays.
    grid_comp = comp.model_copy(update=dict(
        saddle_clamp_offset=np.asarray(saddle_heights, dtype=float).reshape(-1, 1, 1, 1),
        spacer_stack=np.asarray(spacer_stacks, dtype=float).reshape(1, -1, 1, 1),
        stem_length=np.asarray(stem_lengths, dtype=float).reshape(1, 1, -1, 1),
        stem_angle_deg=np.asarray(stem_angles, dtype=float).reshape(1, 1, 1, -1),
    ))
    grid_points = synthesize_bike(setup.frame, grid_comp)
    grid_pose = solve_pose_raw(grid_points, setup.rider, comp.pedal_stack_height)
    obj = _objective(target_saddle, target_hoods, grid_points, grid_pose, setup.preset)

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
        best_points = synthesize_bike(setup.frame, best_components)

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
