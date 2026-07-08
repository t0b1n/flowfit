from __future__ import annotations

from dataclasses import dataclass
from math import cos, radians, sin, sqrt

import numpy as np

from .coords import Vec2
from .models import Components, FrameGeometry


@dataclass
class BikePoints:
    bb: Vec2
    rear_axle: Vec2
    front_axle: Vec2
    saddle: Vec2
    steerer_top: Vec2
    bar_clamp: Vec2
    hoods: Vec2
    cleat: Vec2


def _seat_tube_direction(frame: FrameGeometry) -> Vec2:
    angle_rad = radians(frame.seat_angle_deg)
    return Vec2(-cos(angle_rad), sin(angle_rad))


def _head_tube_direction(frame: FrameGeometry) -> Vec2:
    angle_rad = radians(frame.head_angle_deg)
    return Vec2(cos(angle_rad), -sin(angle_rad))


def pedal_spindle_at_angle(bb: Vec2, crank_length: float, crank_angle_deg: float) -> Vec2:
    """Pedal spindle position for a crank at the given angle.

    Convention: 0° = TDC (crank straight up), 90° = crank forward
    (3 o'clock, the KOPS reference position), 180° = BDC.
    """
    a = radians(crank_angle_deg)
    return Vec2(bb.x + crank_length * sin(a), bb.y + crank_length * cos(a))


def cleat_at_crank_angle(bb: Vec2, components: Components, crank_angle_deg: float) -> Vec2:
    """Cleat contact point at the given crank angle (foot kept level)."""
    spindle = pedal_spindle_at_angle(bb, components.crank_length, crank_angle_deg)
    return Vec2(spindle.x - components.cleat_setback, spindle.y)


def synthesize_bike(frame: FrameGeometry, components: Components) -> BikePoints:
    bb = Vec2(0.0, 0.0)

    axle_y = frame.bb_drop
    if abs(axle_y) > frame.chainstay_length:
        raise ValueError(
            f"bb_drop ({axle_y} mm) exceeds chainstay_length ({frame.chainstay_length} mm): "
            "geometry is physically impossible."
        )
    rear_axle_x = -sqrt(frame.chainstay_length**2 - axle_y**2)
    rear_axle = Vec2(rear_axle_x, axle_y)
    front_axle_x = (
        rear_axle.x + frame.wheelbase
        if frame.wheelbase is not None
        else rear_axle.x + frame.fork_offset + frame.wheel_radius * 2.0
    )
    front_axle = Vec2(front_axle_x, axle_y)

    seat_dir = _seat_tube_direction(frame)
    saddle_clamp = Vec2(
        bb.x + seat_dir.x * components.saddle_clamp_offset - components.seatpost_offset,
        bb.y + seat_dir.y * components.saddle_clamp_offset,
    )
    saddle = Vec2(
        saddle_clamp.x + components.saddle_rail_offset,
        saddle_clamp.y + components.saddle_stack,
    )

    steerer_top = Vec2(
        bb.x + frame.reach,
        bb.y + frame.stack + components.spacer_stack,
    )

    # numpy trig so array-valued stem parameters (the solver's component
    # grid) broadcast through; identical doubles for plain floats.
    stem_angle_rad = np.radians(components.stem_angle_deg)
    stem_dir = Vec2(np.cos(stem_angle_rad), np.sin(stem_angle_rad))
    bar_clamp = Vec2(
        steerer_top.x + stem_dir.x * components.stem_length,
        steerer_top.y + stem_dir.y * components.stem_length,
    )

    hoods = Vec2(
        bar_clamp.x + components.bar_reach + components.hood_reach_offset,
        bar_clamp.y + components.bar_drop + components.hood_drop_offset,
    )

    # BDC = crank pointing straight down (crank angle 180°)
    cleat = Vec2(
        bb.x - components.cleat_setback,
        bb.y - components.crank_length,
    )

    return BikePoints(
        bb=bb,
        rear_axle=rear_axle,
        front_axle=front_axle,
        saddle=saddle,
        steerer_top=steerer_top,
        bar_clamp=bar_clamp,
        hoods=hoods,
        cleat=cleat,
    )
