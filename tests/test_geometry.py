from __future__ import annotations

import math

from bikegeo_core import Components, FrameGeometry
from bikegeo_core.geometry import synthesize_bike
from bikegeo_core.geometry_export import build_export
from bikegeo_core.models import ContactPoint, ContactPoints, RiderAnthropometrics, SetupInput
from bikegeo_core.presets import ENDURANCE
from bikegeo_core.solver import solve_setup


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
    points = synthesize_bike(_frame(), _components())

    assert points.steerer_top.x == 380.0
    assert points.steerer_top.y == 560.0


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

    assert high.steerer_top.y - low.steerer_top.y == 20.0
    assert high.bar_clamp.y - low.bar_clamp.y == 20.0
    assert high.hoods.y - low.hoods.y == 20.0


def test_cleat_setback_moves_cleat_behind_pedal_spindle() -> None:
    no_setback = synthesize_bike(_frame(), _components(cleat_setback=0.0))
    setback = synthesize_bike(_frame(), _components(cleat_setback=15.0))

    # BDC: cleat is directly below BB at x = -cleat_setback
    assert no_setback.cleat.x == 0.0
    assert setback.cleat.x == -15.0
    assert setback.cleat.y == no_setback.cleat.y


def _setup_input(frame: FrameGeometry) -> SetupInput:
    return SetupInput(
        frame=frame,
        components=_components(),
        target_contact_points=ContactPoints(
            saddle=ContactPoint(x=0.0, y=700.0),
            hoods=ContactPoint(x=400.0, y=600.0),
            cleat=ContactPoint(x=0.0, y=-170.0),
        ),
        rider=RiderAnthropometrics(
            height=1800.0,
            thigh_length=430.0,
            shank_length=430.0,
            torso_length=600.0,
            upper_arm_length=320.0,
            forearm_length=280.0,
            foot_length=270.0,
            shoulder_width=400.0,
        ),
        preset=ENDURANCE,
    )


def test_geometry_export_uses_catalog_head_tube_length() -> None:
    frame = FrameGeometry(
        **_frame().model_dump(),
        head_tube=120.0,
    )
    result = solve_setup(_setup_input(frame))
    export = build_export(result, synthesize_bike(result.frame, result.components))
    pts = {p.name: p.pos for p in export.points}

    head_tube_top = pts["head_tube_top"]
    head_tube_bottom = pts["head_tube_bottom"]
    head_tube_length = math.hypot(
        head_tube_bottom.x - head_tube_top.x,
        head_tube_bottom.y - head_tube_top.y,
    )

    assert round(head_tube_length, 6) == frame.head_tube


def test_geometry_export_separates_seat_cluster_from_seat_tube_top() -> None:
    frame = FrameGeometry(
        **_frame().model_dump(),
        seat_tube_ct=740.0,
        top_tube_effective=550.0,
    )
    result = solve_setup(_setup_input(frame))
    export = build_export(result, synthesize_bike(result.frame, result.components))
    pts = {p.name: p.pos for p in export.points}

    seat_cluster = pts["seat_cluster"]
    seat_tube_top = pts["seat_tube_top"]

    assert seat_tube_top.y > seat_cluster.y
    assert round(result.frame.reach - seat_cluster.x, 6) == frame.top_tube_effective


def test_visible_seatpost_extension_uses_post_top_not_clamp_center() -> None:
    frame = FrameGeometry(
        **_frame().model_dump(),
        seat_tube_ct=500.0,
    )
    components = _components(saddle_clamp_offset=650.0)
    result = solve_setup(_setup_input(frame).model_copy(update={"components": components}))
    export = build_export(result, synthesize_bike(result.frame, result.components))
    pts = {p.name: p.pos for p in export.points}

    seat_tube_top = pts["seat_tube_top"]
    seatpost_top = pts["seatpost_top"]
    visible_extension = math.hypot(
        seatpost_top.x - seat_tube_top.x,
        seatpost_top.y - seat_tube_top.y,
    )
    old_clamp_based_extension = components.saddle_clamp_offset - frame.seat_tube_ct

    assert round(visible_extension, 6) == 185.0
    assert round(old_clamp_based_extension, 6) == 150.0
    assert visible_extension > old_clamp_based_extension
