"""Hood contact model: Python mirror of web/src/cockpit.ts.

The fixture values in web/src/cockpit.fixtures.json are produced by the same
cases run through the TypeScript implementation (web/src/cockpit.test.ts), so
/solve and the stage agree to the micrometre.
"""
from __future__ import annotations

import json
import math
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


def test_legacy_default_matches_historical_frontend_formula() -> None:
    comp = _components()
    p = hood_contact(Vec2(500.0, 600.0), comp)
    ang = math.radians(max(8, comp.stem_angle_deg + 6))
    length = comp.bar_reach + comp.hood_reach_offset
    assert p.x == pytest.approx(500.0 + math.cos(ang) * length, abs=1e-9)
    assert p.y == pytest.approx(600.0 + math.sin(ang) * length, abs=1e-9)


def test_rise_lifts_hoods_by_exactly_the_rise() -> None:
    low = hood_contact(Vec2(0, 0), _components())
    high = hood_contact(Vec2(0, 0), _components(bar_rise=20.0))
    assert high.y - low.y == pytest.approx(20.0)
    assert high.x == pytest.approx(low.x)


def test_hood_roll_has_no_sagittal_effect() -> None:
    a = hood_contact(Vec2(0, 0), _components())
    b = hood_contact(Vec2(0, 0), _components(hood_roll_deg=8.0))
    assert (a.x, a.y) == (b.x, b.y)


def test_broadcasts_over_array_stem_angles() -> None:
    comp = _components().model_copy(update=dict(stem_angle_deg=np.array([-17.0, -6.0, 6.0])))
    p = hood_contact(Vec2(0, 0), comp)
    for i, sa in enumerate([-17.0, -6.0, 6.0]):
        single = hood_contact(Vec2(0, 0), _components(stem_angle_deg=sa))
        assert p.x[i] == pytest.approx(single.x)
        assert p.y[i] == pytest.approx(single.y)


@pytest.mark.parametrize("case", FIXTURES, ids=[c["name"] for c in FIXTURES])
def test_matches_typescript_fixture(case) -> None:
    comp = _components(**case["components"])
    p = hood_contact(Vec2(*case["clamp"]), comp)
    assert p.x == pytest.approx(case["contact"][0], abs=1e-6)
    assert p.y == pytest.approx(case["contact"][1], abs=1e-6)
