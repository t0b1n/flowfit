import pytest

from bikegeo_core import Components, FrameGeometry
from bikegeo_core.constraints import evaluate_component_constraints
from bikegeo_core.geometry import synthesize_bike
from bikegeo_core.models import ConstraintStatus
from bikegeo_core.saddle_rails import (
    CONTACT_TO_CLAMP_MM,
    RAIL_MID_MM,
    RAIL_OFFSET_MAX_MM,
    RAIL_OFFSET_MIN_MM,
    RAIL_STRAIGHT_MAX_MM,
    RAIL_STRAIGHT_MIN_MM,
    SEATPOST_CLAMP_WIDTH_MM,
    rail_clamp_status,
)


def _frame() -> FrameGeometry:
    return FrameGeometry(
        stack=550.0, reach=380.0, head_angle_deg=73.0, seat_angle_deg=73.0, bb_drop=70.0,
        chainstay_length=410.0, fork_length=370.0, fork_offset=45.0, wheel_radius=340.0,
    )


def _components(**overrides) -> Components:
    base = dict(
        crank_length=172.5, cleat_setback=0.0, saddle_rail_length=80.0, saddle_clamp_offset=700.0,
        stem_length=100.0, stem_angle_deg=-6.0, spacer_stack=10.0, bar_reach=80.0, bar_drop=0.0,
        hood_reach_offset=24.6, hood_drop_offset=0.0, bar_width=400.0, hood_width=None, stance_width=None,
    )
    base.update(overrides)
    return Components(**base)


def test_range_is_straight_section_minus_clamp_width():
    travel = RAIL_STRAIGHT_MAX_MM - RAIL_STRAIGHT_MIN_MM - SEATPOST_CLAMP_WIDTH_MM
    assert RAIL_OFFSET_MAX_MM == pytest.approx(travel / 2)
    assert RAIL_OFFSET_MIN_MM == pytest.approx(-travel / 2)
    assert 10 < RAIL_OFFSET_MAX_MM < 25


def test_contact_sits_behind_the_clamp():
    # contact station (u=0.68) is 43.2 mm behind mid-length; the straight section is centred just ahead of it
    assert CONTACT_TO_CLAMP_MM == pytest.approx(-43.2 - RAIL_MID_MM)
    assert CONTACT_TO_CLAMP_MM < -40


def test_saddle_x_follows_rail_offset_and_post_setback():
    a = synthesize_bike(_frame(), _components()).saddle
    fwd = synthesize_bike(_frame(), _components(saddle_rail_offset=10.0)).saddle
    back = synthesize_bike(_frame(), _components(seatpost_offset=10.0)).saddle
    assert fwd.x - a.x == pytest.approx(10.0)
    assert a.x - back.x == pytest.approx(10.0)
    assert fwd.y == pytest.approx(a.y)


@pytest.mark.parametrize("offset", [0.0, RAIL_OFFSET_MIN_MM, RAIL_OFFSET_MAX_MM])
def test_in_bounds(offset):
    assert rail_clamp_status(offset).in_bounds
    assert evaluate_component_constraints(_components(saddle_rail_offset=offset)).status == ConstraintStatus.FEASIBLE


def test_out_of_bounds_warns_but_is_allowed():
    over = rail_clamp_status(RAIL_OFFSET_MAX_MM + 7.0)
    assert not over.in_bounds and over.side == "rear" and over.overshoot_mm == pytest.approx(7.0)
    under = rail_clamp_status(RAIL_OFFSET_MIN_MM - 3.0)
    assert not under.in_bounds and under.side == "forward" and under.overshoot_mm == pytest.approx(3.0)

    result = evaluate_component_constraints(_components(saddle_rail_offset=RAIL_OFFSET_MAX_MM + 20.0))
    assert result.status == ConstraintStatus.FEASIBLE_WITH_COMPROMISES
    assert result.violations[0].name == "saddle_rail_offset"
    assert "rail" in result.violations[0].message
