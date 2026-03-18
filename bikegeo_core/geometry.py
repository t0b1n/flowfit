from __future__ import annotations

from dataclasses import dataclass
from math import cos, radians, sin, sqrt

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

    stem_angle_rad = radians(components.stem_angle_deg)
    stem_dir = Vec2(cos(stem_angle_rad), sin(stem_angle_rad))
    bar_clamp = Vec2(
        steerer_top.x + stem_dir.x * components.stem_length,
        steerer_top.y + stem_dir.y * components.stem_length,
    )

    hoods = Vec2(
        bar_clamp.x + components.bar_reach + components.hood_reach_offset,
        bar_clamp.y + components.bar_drop + components.hood_drop_offset,
    )

    crank_angle_rad = 0.0
    cleat = Vec2(
        bb.x + components.crank_length * cos(crank_angle_rad) - components.cleat_setback,
        bb.y + components.crank_length * sin(crank_angle_rad),
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
