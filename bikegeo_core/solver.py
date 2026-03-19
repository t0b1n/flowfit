from __future__ import annotations

from typing import Tuple

import numpy as np

from .constraints import evaluate_component_constraints, evaluate_posture_constraints, merge_constraint_results
from .geometry import BikePoints, synthesize_bike
from .mannequin2d import solve_pose_2d
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


def _grid_search_components(
    setup: SetupInput,
    saddle_heights: np.ndarray,
    spacer_stacks: np.ndarray,
    stem_lengths: np.ndarray,
    stem_angles: np.ndarray,
) -> Tuple[Components, BikePoints]:
    best_components = setup.components
    best_points = synthesize_bike(setup.frame, best_components)
    best_pose = solve_pose_2d(best_points, setup.rider, setup.components.pedal_stack_height)
    best_obj = _objective(
        (setup.target_contact_points.saddle.x, setup.target_contact_points.saddle.y),
        (setup.target_contact_points.hoods.x, setup.target_contact_points.hoods.y),
        best_points,
        best_pose,
        setup.preset,
    )

    for sh in saddle_heights:
        for ss in spacer_stacks:
            for sl in stem_lengths:
                for sa in stem_angles:
                    base = setup.components.model_dump()
                    base.update(
                        saddle_clamp_offset=float(sh),
                        spacer_stack=float(ss),
                        stem_length=float(sl),
                        stem_angle_deg=float(sa),
                    )
                    components = Components(**base)
                    points = synthesize_bike(setup.frame, components)
                    pose = solve_pose_2d(points, setup.rider, components.pedal_stack_height)
                    obj = _objective(
                        (setup.target_contact_points.saddle.x, setup.target_contact_points.saddle.y),
                        (setup.target_contact_points.hoods.x, setup.target_contact_points.hoods.y),
                        points,
                        pose,
                        setup.preset,
                    )
                    if obj < best_obj:
                        best_obj = obj
                        best_components = components
                        best_points = points

    return best_components, best_points


def solve_setup(setup: SetupInput) -> SetupOutput:
    saddle_heights = np.linspace(
        setup.target_contact_points.saddle.y - 20.0,
        setup.target_contact_points.saddle.y + 20.0,
        9,
    )
    spacer_stacks = np.linspace(
        max(0.0, setup.components.spacer_stack - 10.0),
        setup.components.spacer_stack + 10.0,
        5,
    )
    stem_lengths = np.linspace(
        max(60.0, setup.components.stem_length - 20.0),
        setup.components.stem_length + 20.0,
        5,
    )
    stem_angles = np.array([-6.0, -7.0, -8.0])

    components, bike_points = _grid_search_components(
        setup=setup,
        saddle_heights=saddle_heights,
        spacer_stacks=spacer_stacks,
        stem_lengths=stem_lengths,
        stem_angles=stem_angles,
    )

    pose_metrics: PoseMetrics = solve_pose_2d(bike_points=bike_points, rider=setup.rider, pedal_stack_height=components.pedal_stack_height)
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
