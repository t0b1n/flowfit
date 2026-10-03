"""Hood contact model: Python mirror of web/src/cockpit.ts.

The fixture values in web/src/cockpit.fixtures.json are produced by the same
cases run through the TypeScript implementation (web/src/cockpit.test.ts), so
/solve and the stage agree to the micrometre.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest

from bikegeo_core import Components
from bikegeo_core.coords import Vec2
from bikegeo_core.geometry import hood_contact

FIXTURES = json.loads((Path(__file__).parent.parent / "web" / "src" / "cockpit.fixtures.json").read_text())


def _components(**overrides) -> Components:
    base = dict(
        crank_length=172.5,
        cleat_setback=0.0,
        saddle_rail_length=80.0,
        saddle_clamp_offset=700.0,
        stem_length=110.0,
        stem_angle_deg=-6.0,
        spacer_stack=10.0,
        bar_reach=80.0,
        bar_drop=0.0,
        hood_reach_offset=24.6,
        hood_drop_offset=0.0,
        bar_width=400.0,
    )
    base.update(overrides)
    return Components(**base)


def test_default_puts_hoods_straight_ahead_of_the_clamp() -> None:
    # No cockpit fields set: bar reach is horizontal, independent of the stem angle, and bar_drop
    # (which describes the drops) does not move the hoods.
    for stem in (-17.0, -6.0, 10.0):
        comp = _components(stem_angle_deg=stem, bar_drop=-40.0)
        p = hood_contact(Vec2(500.0, 600.0), comp)
        assert p.x == pytest.approx(500.0 + comp.bar_reach + comp.hood_reach_offset, abs=1e-9)
        assert p.y == pytest.approx(600.0, abs=1e-9)


def test_rise_lifts_hoods_by_exactly_the_rise() -> None:
    low = hood_contact(Vec2(0, 0), _components())
    high = hood_contact(Vec2(0, 0), _components(bar_rise=20.0))
    assert high.y - low.y == pytest.approx(20.0)
    assert high.x == pytest.approx(low.x)


def test_hood_roll_has_no_sagittal_effect() -> None:
    a = hood_contact(Vec2(0, 0), _components())
    b = hood_contact(Vec2(0, 0), _components(hood_roll_deg=8.0))
    assert (a.x, a.y) == (b.x, b.y)


def test_broadcasts_over_array_bar_clamps() -> None:
    # In the solver grid the searched axes reach hood_contact through the bar clamp position.
    xs = np.array([480.0, 500.0, 520.0])
    ys = np.array([590.0, 600.0, 640.0])
    comp = _components(bar_roll_deg=6.0, hood_slide_mm=4.0, bar_rise=15.0)
    p = hood_contact(Vec2(xs, ys), comp)
    for i in range(3):
        single = hood_contact(Vec2(float(xs[i]), float(ys[i])), comp)
        assert p.x[i] == pytest.approx(single.x)
        assert p.y[i] == pytest.approx(single.y)


@pytest.mark.parametrize("case", FIXTURES, ids=[c["name"] for c in FIXTURES])
def test_matches_typescript_fixture(case) -> None:
    comp = _components(**case["components"])
    p = hood_contact(Vec2(*case["clamp"]), comp)
    assert p.x == pytest.approx(case["contact"][0], abs=1e-6)
    assert p.y == pytest.approx(case["contact"][1], abs=1e-6)
