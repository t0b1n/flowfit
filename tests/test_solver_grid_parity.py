"""Parity tests for the vectorised grid search in solver.py.

The vectorised implementation must select exactly the same winning
component combination as the original scalar loop (baseline candidate,
strict-improvement comparison, first-minimum-wins tie-breaking).
"""

from __future__ import annotations

import numpy as np
import pytest

from bikegeo_core.geometry import synthesize_bike
from bikegeo_core.mannequin2d import solve_pose_raw
from bikegeo_core.models import (
    Components,
    ContactPoint,
    ContactPoints,
    FrameGeometry,
    RiderAnthropometrics,
    SetupInput,
)
from bikegeo_core.presets import ENDURANCE
from bikegeo_core.solver import _grid_search_components, _objective, solve_setup


def _scalar_grid_search(setup, saddle_heights, spacer_stacks, stem_lengths, stem_angles):
    """Reference implementation: the original per-combination scalar loop."""
    best_components = setup.components
    best_points = synthesize_bike(setup.frame, best_components)
    best_pose = solve_pose_raw(best_points, setup.rider, setup.components.pedal_stack_height)
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
                    pose = solve_pose_raw(points, setup.rider, components.pedal_stack_height)
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


def _make_setup(
    saddle_target=(-60.0, 710.0),
    hoods_target=(430.0, 620.0),
    seat_angle=73.5,
    stack=565.0,
    reach=385.0,
) -> SetupInput:
    frame = FrameGeometry(
        stack=stack,
        reach=reach,
        head_angle_deg=72.5,
        seat_angle_deg=seat_angle,
        bb_drop=70.0,
        chainstay_length=410.0,
        fork_length=370.0,
        fork_offset=45.0,
        wheel_radius=340.0,
    )
    components = Components(
        crank_length=172.5,
        cleat_setback=10.0,
        saddle_rail_length=80.0,
        saddle_clamp_offset=700.0,
        stem_length=100.0,
        stem_angle_deg=-6.0,
        spacer_stack=20.0,
        bar_reach=80.0,
        bar_drop=-125.0,
        hood_reach_offset=20.0,
        hood_drop_offset=0.0,
        bar_width=420.0,
        hood_width=None,
        stance_width=None,
        saddle_rail_offset=-12.0,
        seatpost_offset=15.0,
    )
    target = ContactPoints(
        saddle=ContactPoint(x=saddle_target[0], y=saddle_target[1]),
        hoods=ContactPoint(x=hoods_target[0], y=hoods_target[1]),
        cleat=ContactPoint(x=0.0, y=-172.5),
    )
    rider = RiderAnthropometrics(
        height=1780.0,
        thigh_length=440.0,
        shank_length=420.0,
        torso_length=610.0,
        upper_arm_length=330.0,
        forearm_length=270.0,
        foot_length=265.0,
        shoulder_width=410.0,
        flexibility=1.0,
    )
    return SetupInput(
        frame=frame,
        components=components,
        target_contact_points=target,
        rider=rider,
        preset=ENDURANCE,
    )


GRIDS = {
    "coarse": (
        np.linspace(690.0, 730.0, 5),
        np.linspace(0.0, 60.0, 4),
        np.linspace(50.0, 180.0, 6),
        np.arange(-20.0, 20.0 + 1e-9, 8.0),
    ),
    "single_axis": (
        np.linspace(690.0, 730.0, 9),
        np.array([20.0]),
        np.array([100.0]),
        np.array([-6.0]),
    ),
    "all_pinned": (
        np.array([700.0]),
        np.array([20.0]),
        np.array([100.0]),
        np.array([-6.0]),
    ),
}


@pytest.mark.parametrize("grid_name", sorted(GRIDS))
@pytest.mark.parametrize(
    "setup_kwargs",
    [
        {},
        {"saddle_target": (-90.0, 680.0), "hoods_target": (390.0, 560.0)},
        {"saddle_target": (-30.0, 745.0), "hoods_target": (470.0, 680.0), "seat_angle": 74.5},
        # Unreachable targets: the baseline components should win everywhere.
        {"saddle_target": (0.0, 700.0), "hoods_target": (5000.0, 5000.0)},
    ],
)
def test_vectorised_grid_matches_scalar_loop(grid_name, setup_kwargs):
    setup = _make_setup(**setup_kwargs)
    grids = GRIDS[grid_name]

    scalar_comp, scalar_pts = _scalar_grid_search(setup, *grids)
    vector_comp, vector_pts = _grid_search_components(setup, *grids)

    assert vector_comp.model_dump() == scalar_comp.model_dump()
    for attr in ("bb", "saddle", "steerer_top", "bar_clamp", "hoods", "cleat"):
        sv = getattr(scalar_pts, attr)
        vv = getattr(vector_pts, attr)
        assert (vv.x, vv.y) == (sv.x, sv.y), attr


def test_solve_setup_full_default_grid_is_fast_and_stable():
    """End-to-end: the default (unpinned) grid solves well under a second."""
    import time

    setup = _make_setup()
    t0 = time.perf_counter()
    out = solve_setup(setup)
    elapsed = time.perf_counter() - t0

    assert elapsed < 1.0, f"solve_setup took {elapsed:.2f}s"
    # The winner must be drawn from the searched grid (or the baseline).
    assert 0.0 <= out.components.spacer_stack <= 60.0
    assert 50.0 <= out.components.stem_length <= 180.0
    assert -20.0 <= out.components.stem_angle_deg <= 20.0
