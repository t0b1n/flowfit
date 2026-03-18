from __future__ import annotations

from .models import (
    Components,
    ConstraintResult,
    ConstraintStatus,
    ConstraintViolation,
    PoseMetrics,
    PosePreset,
)


def evaluate_component_constraints(components: Components) -> ConstraintResult:
    violations: list[ConstraintViolation] = []

    if components.spacer_stack < 0.0:
        violations.append(
            ConstraintViolation(
                name="spacer_stack_min",
                value=components.spacer_stack,
                min_allowed=0.0,
                message="Spacer stack cannot be negative.",
            )
        )

    status = ConstraintStatus.FEASIBLE if not violations else ConstraintStatus.FEASIBLE_WITH_COMPROMISES
    return ConstraintResult(status=status, violations=violations)


def evaluate_posture_constraints(pose: PoseMetrics, preset: PosePreset) -> ConstraintResult:
    violations: list[ConstraintViolation] = []

    def check_band(name: str, value: float, band_min: float, band_max: float) -> None:
        if value < band_min or value > band_max:
            violations.append(
                ConstraintViolation(
                    name=name,
                    value=value,
                    min_allowed=band_min,
                    max_allowed=band_max,
                    message=f"{name} outside preset band",
                )
            )

    check_band("trunk_angle", pose.trunk_angle_deg, preset.trunk_angle.min_deg, preset.trunk_angle.max_deg)
    check_band("hip_angle", pose.hip_angle_deg, preset.hip_angle.min_deg, preset.hip_angle.max_deg)
    check_band(
        "shoulder_flexion",
        pose.shoulder_flexion_deg,
        preset.shoulder_flexion.min_deg,
        preset.shoulder_flexion.max_deg,
    )
    check_band(
        "elbow_flexion",
        pose.elbow_flexion_deg,
        preset.elbow_flexion.min_deg,
        preset.elbow_flexion.max_deg,
    )
    check_band(
        "knee_extension",
        pose.knee_extension_deg,
        preset.knee_extension.min_deg,
        preset.knee_extension.max_deg,
    )

    status = ConstraintStatus.FEASIBLE if not violations else ConstraintStatus.FEASIBLE_WITH_COMPROMISES
    return ConstraintResult(status=status, violations=violations)


def merge_constraint_results(*results: ConstraintResult) -> ConstraintResult:
    violations: list[ConstraintViolation] = []
    worst_status = ConstraintStatus.FEASIBLE
    for r in results:
        violations.extend(r.violations)
        if r.status == ConstraintStatus.INFEASIBLE:
            worst_status = ConstraintStatus.INFEASIBLE
        elif r.status == ConstraintStatus.FEASIBLE_WITH_COMPROMISES and worst_status == ConstraintStatus.FEASIBLE:
            worst_status = ConstraintStatus.FEASIBLE_WITH_COMPROMISES
    return ConstraintResult(status=worst_status, violations=violations)

