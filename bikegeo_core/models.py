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
    stem_angle_deg: float = Field(description="Manufacturer rating: degrees from the normal to the steerer (-6 is a typical road stem), not from horizontal.")
    spacer_stack: float = Field(description="Spacer stack height in mm, measured along the steerer.")
    stem_height: float = Field(40.0, ge=0, description="Height of the stem's steerer clamp in mm, along the steerer; 0 spacers puts its bottom on the head tube top.")
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
    # Cockpit (mirrors web/src/cockpit.ts; all optional so older payloads stay valid)
    bar_rise: float = Field(0.0, description="Vertical rise of the bar tops above the clamp centre, in mm.")
    bar_drop_depth: float = Field(125.0, description="Vertical depth from the tops to the drops centreline, in mm.")
    bar_drop_width: Optional[float] = Field(None, description="Drop centre-to-centre width in mm; defaults to the hood width.")
    bar_backsweep_deg: float = Field(0.0, description="Backsweep of the tops toward the rider, in degrees.")
    bar_roll_deg: Optional[float] = Field(
        None,
        description="Angle of the clamp-to-hood reach line above horizontal, in degrees; None = 0 (hoods straight ahead of the clamp).",
    )
    hood_slide_mm: float = Field(0.0, description="Hood position along the bend in mm (+ = lower, further round).")
    hood_roll_deg: float = Field(0.0, description="Inward hood rotation in degrees (lateral only; no sagittal effect).")
    cockpit_build: Optional[str] = Field(None, description="Draw option: 'two_piece' or 'integrated' (render only).")
    hood_model: Optional[str] = Field(None, description="Hood model id (render only).")


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
    hip_joint_offset: float = Field(80.0, description="Vertical offset from saddle contact to hip joint centre (femoral head), in mm.")


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
    knee_flexion_tdc: Optional[AngleBand] = None


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
    # Pedal-stroke metrics (sampled over a full crank revolution); optional so
    # metrics from the single-pose BDC solve remain valid without them.
    knee_flexion_tdc_deg: Optional[float] = Field(
        None, description="Knee flexion at top dead centre (crank angle 0°), in degrees."
    )
    knee_extension_max_deg: Optional[float] = Field(
        None, description="Maximum knee extension over the pedal stroke, in degrees."
    )
    kops_offset_mm: Optional[float] = Field(
        None,
        description="Horizontal knee-joint-to-pedal-spindle offset at crank 90° (positive = knee forward), in mm.",
    )


class SetupInput(BaseModel):
    schema_version: str = Field(default=SCHEMA_VERSION)
    frame: FrameGeometry
    components: Components
    target_contact_points: ContactPoints
    rider: RiderAnthropometrics
    preset: PosePreset
    pinned_components: List[str] = Field(default_factory=list)


class SetupOutput(BaseModel):
    schema_version: str = Field(default=SCHEMA_VERSION)
    frame: FrameGeometry
    components: Components
    contact_points: ContactPoints
    rider: RiderAnthropometrics
    preset: PosePreset
    pose_metrics: PoseMetrics
    constraints: ConstraintResult
