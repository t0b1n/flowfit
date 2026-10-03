from __future__ import annotations

import math

from bikegeo_core import Components, FrameGeometry
from bikegeo_core.geometry import synthesize_bike


def _frame() -> FrameGeometry:
    return FrameGeometry(
        stack=550.0,
        reach=380.0,
        head_angle_deg=73.0,
        seat_angle_deg=73.0,
        bb_drop=70.0,
        chainstay_length=410.0,
        fork_length=370.0,
        fork_offset=45.0,
        wheel_radius=340.0,
    )


def _components(**overrides: float) -> Components:
    base = dict(
        crank_length=172.5,
        cleat_setback=12.0,
        saddle_rail_length=80.0,
        saddle_clamp_offset=700.0,
        stem_length=100.0,
        stem_angle_deg=6.0,
        spacer_stack=10.0,
        bar_reach=80.0,
        bar_drop=-40.0,
        hood_reach_offset=20.0,
        hood_drop_offset=0.0,
        bar_width=400.0,
        hood_width=None,
        stance_width=None,
    )
    base.update(overrides)
    return Components(**base)


def test_stack_and_reach_anchor_the_steerer_top() -> None:
    points = synthesize_bike(_frame(), _components(spacer_stack=0.0))

    assert points.steerer_top.x == 380.0
    assert points.steerer_top.y == 550.0


def test_spacers_stack_along_the_steerer() -> None:
    points = synthesize_bike(_frame(), _components(spacer_stack=10.0))
    ha = math.radians(73.0)

    assert math.isclose(points.steerer_top.x, 380.0 - 10.0 * math.cos(ha))
    assert math.isclose(points.steerer_top.y, 550.0 + 10.0 * math.sin(ha))


def test_stem_angle_is_measured_from_the_steerer_normal() -> None:
    # On a 73° head tube a -17° stem is level, and its pivot is half the clamp height up the steerer.
    points = synthesize_bike(_frame(), _components(spacer_stack=0.0, stem_angle_deg=-17.0, stem_height=40.0))
    ha = math.radians(73.0)

    assert math.isclose(points.bar_clamp.y, 550.0 + 20.0 * math.sin(ha))
    assert math.isclose(points.bar_clamp.x, 380.0 - 20.0 * math.cos(ha) + 100.0)


def test_axles_sit_on_the_same_ground_line_using_bb_drop() -> None:
    points = synthesize_bike(_frame(), _components())
    expected_axle_y = 70.0

    assert points.rear_axle.y == expected_axle_y
    assert points.front_axle.y == expected_axle_y


def test_rear_axle_respects_chainstay_length() -> None:
    frame = _frame()
    points = synthesize_bike(frame, _components())

    chainstay_length = (points.rear_axle.x**2 + points.rear_axle.y**2) ** 0.5

    assert round(chainstay_length, 6) == frame.chainstay_length


def test_saddle_is_behind_and_above_the_bottom_bracket() -> None:
    points = synthesize_bike(_frame(), _components())

    assert points.saddle.x < 0.0
    assert points.saddle.y > 0.0


def test_spacers_raise_the_cockpit() -> None:
    low = synthesize_bike(_frame(), _components(spacer_stack=0.0))
    high = synthesize_bike(_frame(), _components(spacer_stack=20.0))

    rise = 20.0 * math.sin(math.radians(73.0))
    assert math.isclose(high.steerer_top.y - low.steerer_top.y, rise)
    assert math.isclose(high.bar_clamp.y - low.bar_clamp.y, rise)
    assert math.isclose(high.hoods.y - low.hoods.y, rise)
    # the steerer leans back, so spacers also pull the cockpit towards the rider
    assert high.bar_clamp.x < low.bar_clamp.x


def test_cleat_setback_moves_cleat_behind_pedal_spindle() -> None:
    no_setback = synthesize_bike(_frame(), _components(cleat_setback=0.0))
    setback = synthesize_bike(_frame(), _components(cleat_setback=15.0))

    # BDC: cleat is directly below BB at x = -cleat_setback
    assert no_setback.cleat.x == 0.0
    assert setback.cleat.x == -15.0
    assert setback.cleat.y == no_setback.cleat.y

