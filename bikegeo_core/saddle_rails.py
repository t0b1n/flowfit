"""Saddle rail clamp range. Mirrors web/src/saddleModels.ts (S-Works Power trace) — keep the constants in sync.

Saddle-local frame: x forward, 0 = mid-length. ``saddle_rail_offset`` = 0 puts the seatpost clamp at the middle of the
straight rail section; positive slides the saddle forward (the clamp moves toward the tail).
"""
from __future__ import annotations

from dataclasses import dataclass

SADDLE_LENGTH_MM = 240.0
SADDLE_CONTACT_U = 0.68
RAIL_STRAIGHT_MIN_MM = -32.0
RAIL_STRAIGHT_MAX_MM = 35.5
SEATPOST_CLAMP_WIDTH_MM = 35.0
SEATPOST_HEAD_HEIGHT_MM = 30.0

RAIL_MID_MM = (RAIL_STRAIGHT_MIN_MM + RAIL_STRAIGHT_MAX_MM) / 2.0
CONTACT_X_MM = (0.5 - SADDLE_CONTACT_U) * SADDLE_LENGTH_MM
# Rider contact station minus clamp station at rail offset 0 (negative: the rider sits behind the clamp).
CONTACT_TO_CLAMP_MM = CONTACT_X_MM - RAIL_MID_MM

# Overshoot (mm) at which the TS fit warning turns "bad".
_HALF_TRAVEL_MM = max(0.0, (RAIL_STRAIGHT_MAX_MM - RAIL_STRAIGHT_MIN_MM - SEATPOST_CLAMP_WIDTH_MM) / 2.0)
RAIL_OFFSET_MIN_MM = -_HALF_TRAVEL_MM
RAIL_OFFSET_MAX_MM = _HALF_TRAVEL_MM


@dataclass(frozen=True)
class RailClampStatus:
    in_bounds: bool
    overshoot_mm: float
    side: str | None  # "forward" | "rear" | None


def rail_clamp_status(rail_offset: float) -> RailClampStatus:
    if rail_offset > RAIL_OFFSET_MAX_MM:
        return RailClampStatus(False, rail_offset - RAIL_OFFSET_MAX_MM, "rear")
    if rail_offset < RAIL_OFFSET_MIN_MM:
        return RailClampStatus(False, RAIL_OFFSET_MIN_MM - rail_offset, "forward")
    return RailClampStatus(True, 0.0, None)
