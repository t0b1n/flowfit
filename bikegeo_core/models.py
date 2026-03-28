from __future__ import annotations

from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field, model_validator


SCHEMA_VERSION = "0.1.0"


class ConstraintStatus(str, Enum):
    FEASIBLE = "feasible"
    FEASIBLE_WITH_COMPROMISES = "feasible_with_compromises"
    INFEASIBLE = "infeasible"


class FrameGeometry(BaseModel):
    stack: float
    reach: float
    head_angle_deg: float
    seat_angle_deg: float
    bb_drop: float
    chainstay_length: float
    fork_length: float
    fork_offset: float
    wheel_radius: float
    wheelbase: Optional[float] = None
    seat_tube_ct: Optional[float] = None
    head_tube: Optional[float] = None
    top_tube_effective: Optional[float] = None


class Components(BaseModel):
    crank_length: float
    cleat_setback: float
    saddle_rail_length: float
    saddle_clamp_offset: float
    stem_length: float
    stem_angle_deg: float
    spacer_stack: float
    bar_reach: float
    bar_drop: float
    hood_reach_offset: float
    hood_drop_offset: float
    bar_width: float = Field(..., description="Effective bar width, centre-to-centre, in mm.")
    hood_width: Optional[float] = Field(
        None,
        description="Effective hood contact width; defaults to bar_width when not provided.",
    )
    stance_width: Optional[float] = Field(
        None,
        description="Effective stance width at the pedals in mm.",
    )
    saddle_stack: float = Field(75.0, description="Vertical distance from rail clamp to saddle surface, in mm.")
    seatpost_offset: float = Field(0.0, description="Horizontal setback of the clamp from the seat-tube centreline, in mm (positive = rearward).")
    saddle_rail_offset: float = Field(0.0, description="Forward/backward slide of the saddle on its rails relative to the clamp, in mm (positive = forward).")
    pedal_stack_height: float = Field(11.0, description="Height from pedal axle to cleat contact in mm.")


class ContactPoint(BaseModel):
    x: float
    y: float


class ContactPoints(BaseModel):
    saddle: ContactPoint
    hoods: ContactPoint
    cleat: ContactPoint


class RiderAnthropometrics(BaseModel):
    height: float
    thigh_length: float
    shank_length: float
    torso_length: float
    upper_arm_length: float
    forearm_length: float
    foot_length: float
    shoulder_width: float
    hip_width: Optional[float] = None
    stance_width: Optional[float] = None
    flexibility: float = Field(1.0, description="Scalar to widen/narrow posture bands.")
    hip_joint_offset: float = Field(95.0, description="Vertical offset from saddle contact to hip joint centre (femoral head), in mm.")


class AngleBand(BaseModel):
    min_deg: float
    max_deg: float
    weight: float = 1.0

    @model_validator(mode="after")
    def max_gte_min(self) -> "AngleBand":
        if self.max_deg < self.min_deg:
            raise ValueError(f"max_deg ({self.max_deg}) must be >= min_deg ({self.min_deg})")
        return self


class PosePreset(BaseModel):
    name: str
    trunk_angle: AngleBand
    hip_angle: AngleBand
    shoulder_flexion: AngleBand
    elbow_flexion: AngleBand
    knee_extension: AngleBand
    shoulder_abduction: Optional[AngleBand] = None


class ConstraintViolation(BaseModel):
    name: str
    value: float
    min_allowed: Optional[float] = None
    max_allowed: Optional[float] = None
    message: str


class ConstraintResult(BaseModel):
    status: ConstraintStatus
    violations: List[ConstraintViolation] = Field(default_factory=list)


class PoseMetrics(BaseModel):
    trunk_angle_deg: float
    hip_angle_deg: float
    shoulder_flexion_deg: float
    elbow_flexion_deg: float
    knee_extension_deg: float


class SetupInput(BaseModel):
    schema_version: str = Field(default=SCHEMA_VERSION)
    frame: FrameGeometry
    components: Components
    target_contact_points: ContactPoints
    rider: RiderAnthropometrics
    preset: PosePreset


class SetupOutput(BaseModel):
    schema_version: str = Field(default=SCHEMA_VERSION)
    frame: FrameGeometry
    components: Components
    contact_points: ContactPoints
    rider: RiderAnthropometrics
    preset: PosePreset
    pose_metrics: PoseMetrics
    constraints: ConstraintResult
