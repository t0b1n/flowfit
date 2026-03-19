"""
Tests comparing backend (3D mannequin) contact-point positions against frontend
(2D overlay) contact-point positions for the three rider contact points:

  cleat   — foot/pedal contact (bottom dead centre)
  saddle  — seat / ischial contact
  hoods   — hand/brake-lever contact

The bug pattern follows test_3d_vs_overlay.py: the 3D mannequin is driven by
backend synthesize_bike() while the 2D overlay uses frontend synthesizeBike()
(geometry.ts).  Where the two implementations compute a point differently the
3D tube endpoints will not align with the green 2D overlay lines.

──────────────────────────────────────────────────────────────────────────────
Expected results:

  PASS — cleat: both implementations now use BDC (y = −crank_length).
          An older version used crank_angle_rad = 0 which placed the cleat
          horizontally forward of the BB (x = +crank_length, y = 0).  If that
          old logic survives anywhere these tests will catch it.

  PASS — saddle: identical formula in backend and frontend.

  FAIL — hoods: the two implementations diverge.
           Backend:  hoods.y = barClamp.y + bar_drop + hood_drop_offset
           Frontend: hoods.y = barClamp.y + sin(hoodAngle) * hoodLength
                                          + hood_drop_offset
          bar_drop is *not used* in the frontend formula; instead the front end
          projects along hoodAngle = max(8°, stem_angle + 6°).  For default
          components (bar_drop=0, stem_angle=−6°) the mismatch is ≈14 mm; with
          bar_drop=−40 it grows to ≈54 mm.
──────────────────────────────────────────────────────────────────────────────
"""
from __future__ import annotations

import math

import pytest

from bikegeo_core import Components, FrameGeometry
from bikegeo_core.coords import Vec2
from bikegeo_core.geometry import synthesize_bike
from bikegeo_core.mannequin3d import solve_pose_3d
from bikegeo_core.models import RiderAnthropometrics


# ── Fixtures ───────────────────────────────────────────────────────────────────

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


def _components(**overrides) -> Components:
    base = dict(
        crank_length=172.5,
        cleat_setback=0.0,
        saddle_rail_length=80.0,
        saddle_clamp_offset=540.0,
        stem_length=100.0,
        stem_angle_deg=-6.0,
        spacer_stack=10.0,
        bar_reach=80.0,
        bar_drop=0.0,          # use default of 0 first; override for parametrised tests
        hood_reach_offset=24.6,
        hood_drop_offset=0.0,
        bar_width=400.0,
        hood_width=380.0,
        stance_width=155.0,
        saddle_stack=52.0,
        seatpost_offset=0.0,
        saddle_rail_offset=0.0,
        pedal_stack_height=12.0,
    )
    base.update(overrides)
    return Components(**base)


# ── Python replica of frontend synthesizeBike() contact-point logic ──────────
#
# Only the three contact-point positions are replicated here.

def _frontend_contact_points(frame: FrameGeometry, comp: Components) -> dict[str, Vec2]:
    """
    Replicates the subset of geometry.ts synthesizeBike() that places
    cleat, saddle, and hoods.  Uses the same math as the TypeScript source.
    """
    seat_angle = math.radians(frame.seat_angle_deg)

    # ── Cleat (BDC) ────────────────────────────────────────────────────────
    # TS: const crankEnd = { x: -cleat_setback, y: -crank_length };
    cleat = Vec2(
        -comp.cleat_setback,
        -comp.crank_length,
    )

    # ── Saddle ─────────────────────────────────────────────────────────────
    # TS: saddleClamp = { x: -cos(seatAngle)*saddle_clamp_offset - seatpost_offset,
    #                     y:  sin(seatAngle)*saddle_clamp_offset }
    saddle_clamp = Vec2(
        -math.cos(seat_angle) * comp.saddle_clamp_offset - comp.seatpost_offset,
        math.sin(seat_angle) * comp.saddle_clamp_offset,
    )
    saddle = Vec2(
        saddle_clamp.x + comp.saddle_rail_offset,
        saddle_clamp.y + comp.saddle_stack,
    )

    # ── Hoods ───────────────────────────────────────────────────────────────
    # TS: steererTop = { x: reach, y: stack + spacer_stack }
    steerer_top = Vec2(frame.reach, frame.stack + comp.spacer_stack)
    stem_angle = math.radians(comp.stem_angle_deg)
    bar_clamp = Vec2(
        steerer_top.x + math.cos(stem_angle) * comp.stem_length,
        steerer_top.y + math.sin(stem_angle) * comp.stem_length,
    )
    # TS: hoodAngle = max(8°, stem_angle_deg + 6°)
    #     hoodLength = bar_reach + hood_reach_offset
    #     hoods.x = barClamp.x + cos(hoodAngle) * hoodLength
    #     hoods.y = barClamp.y + sin(hoodAngle) * hoodLength + hood_drop_offset
    # NOTE: bar_drop is NOT used in the frontend formula.
    hood_angle = math.radians(max(8.0, comp.stem_angle_deg + 6.0))
    hood_length = comp.bar_reach + comp.hood_reach_offset
    hoods = Vec2(
        bar_clamp.x + math.cos(hood_angle) * hood_length,
        bar_clamp.y + math.sin(hood_angle) * hood_length + comp.hood_drop_offset,
    )

    return dict(cleat=cleat, saddle=saddle, hoods=hoods, bar_clamp=bar_clamp)


# ── Helpers ────────────────────────────────────────────────────────────────────

MATCH_TOL = 1.0  # mm


def _dist(a: Vec2, b: Vec2) -> float:
    return math.hypot(a.x - b.x, a.y - b.y)


# ══════════════════════════════════════════════════════════════════════════════
# Cleat: must be at BDC, not horizontal
# ══════════════════════════════════════════════════════════════════════════════

def test_cleat_is_at_bottom_dead_centre():
    """
    The cleat must sit directly below the BB at (−cleat_setback, −crank_length).
    An earlier version used crank_angle_rad = 0, placing the cleat horizontally
    forward of the BB at (crank_length − cleat_setback, 0).
    """
    comp = _components(crank_length=172.5, cleat_setback=12.0)
    bike = synthesize_bike(_frame(), comp)

    assert abs(bike.cleat.x - (-comp.cleat_setback)) < MATCH_TOL, (
        f"cleat.x = {bike.cleat.x:.2f}, expected {-comp.cleat_setback:.2f} "
        f"(horizontal-crank bug would give x = {comp.crank_length - comp.cleat_setback:.2f})"
    )
    assert abs(bike.cleat.y - (-comp.crank_length)) < MATCH_TOL, (
        f"cleat.y = {bike.cleat.y:.2f}, expected {-comp.crank_length:.2f} "
        f"(horizontal-crank bug would give y = 0)"
    )


def test_cleat_not_horizontal():
    """
    Explicit regression: cleat.y must NOT be 0 (the horizontal-crank artifact).
    """
    comp = _components()
    bike = synthesize_bike(_frame(), comp)
    assert bike.cleat.y < -1.0, (
        f"cleat.y = {bike.cleat.y:.2f} — looks like the crank is horizontal "
        f"instead of pointing down to BDC (expected ≈ {-comp.crank_length:.1f})"
    )


def test_cleat_3d_matches_2d_overlay():
    """
    Cleat contact point in 3D backend vs 2D overlay: both should use BDC.
    """
    comp = _components()
    bike = synthesize_bike(_frame(), comp)
    fe = _frontend_contact_points(_frame(), comp)

    delta = _dist(bike.cleat, fe["cleat"])
    assert delta < MATCH_TOL, (
        f"Cleat mismatch: backend ({bike.cleat.x:.2f}, {bike.cleat.y:.2f}) vs "
        f"frontend ({fe['cleat'].x:.2f}, {fe['cleat'].y:.2f}), delta={delta:.2f} mm"
    )


@pytest.mark.parametrize("setback", [0.0, 6.0, 14.0])
def test_cleat_setback_consistent(setback):
    """Cleat setback is applied rearward (−x) consistently in both implementations."""
    comp = _components(cleat_setback=setback)
    bike = synthesize_bike(_frame(), comp)
    fe = _frontend_contact_points(_frame(), comp)

    assert abs(bike.cleat.x - (-setback)) < MATCH_TOL, (
        f"Backend cleat.x = {bike.cleat.x:.2f}, expected {-setback:.2f}"
    )
    delta = _dist(bike.cleat, fe["cleat"])
    assert delta < MATCH_TOL, (
        f"cleat_setback={setback}: backend vs frontend delta={delta:.2f} mm"
    )


# ══════════════════════════════════════════════════════════════════════════════
# Saddle: same formula in both — should pass
# ══════════════════════════════════════════════════════════════════════════════

def test_saddle_3d_matches_2d_overlay():
    """
    Saddle contact point: identical formula in backend and frontend.
    """
    comp = _components()
    bike = synthesize_bike(_frame(), comp)
    fe = _frontend_contact_points(_frame(), comp)

    delta = _dist(bike.saddle, fe["saddle"])
    assert delta < MATCH_TOL, (
        f"Saddle mismatch: backend ({bike.saddle.x:.2f}, {bike.saddle.y:.2f}) vs "
        f"frontend ({fe['saddle'].x:.2f}, {fe['saddle'].y:.2f}), delta={delta:.2f} mm"
    )


@pytest.mark.parametrize("saddle_clamp_offset", [500.0, 600.0, 700.0])
def test_saddle_position_consistent_across_heights(saddle_clamp_offset):
    """Saddle height must agree between backend and frontend for various offsets."""
    comp = _components(saddle_clamp_offset=saddle_clamp_offset)
    bike = synthesize_bike(_frame(), comp)
    fe = _frontend_contact_points(_frame(), comp)

    delta = _dist(bike.saddle, fe["saddle"])
    assert delta < MATCH_TOL, (
        f"saddle_clamp_offset={saddle_clamp_offset}: delta={delta:.2f} mm"
    )


# ══════════════════════════════════════════════════════════════════════════════
# Hoods: different formulas — will FAIL
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.xfail(strict=True, reason="BUG 5: hoods formula divergence — backend uses bar_drop, frontend uses sin(hoodAngle)*hoodLength")
def test_hoods_3d_matches_2d_overlay():
    """
    Hoods contact point:

      Backend:  hoods.x = barClamp.x + bar_reach + hood_reach_offset
                hoods.y = barClamp.y + bar_drop   + hood_drop_offset

      Frontend: hood_angle = max(8°, stem_angle_deg + 6°)
                hood_length = bar_reach + hood_reach_offset
                hoods.x = barClamp.x + cos(hood_angle) * hood_length
                hoods.y = barClamp.y + sin(hood_angle) * hood_length
                                     + hood_drop_offset
                (bar_drop is NOT used in the frontend formula)

    With stem_angle_deg=−6° → hood_angle=8°, hood_length=104.6 mm:
      Backend  hoods.y = barClamp.y + bar_drop
      Frontend hoods.y = barClamp.y + sin(8°) × 104.6 ≈ barClamp.y + 14.6 mm

    For bar_drop=0 the vertical delta is ≈14.6 mm.
    For bar_drop=−40 the vertical delta grows to ≈54.6 mm.

    EXPECTED TO FAIL — this test exposes the hoods contact-point bug.
    """
    comp = _components()  # bar_drop=0, stem_angle_deg=−6
    bike = synthesize_bike(_frame(), comp)
    fe = _frontend_contact_points(_frame(), comp)

    # Quantify the expected mismatch for the error message
    hood_angle = math.radians(max(8.0, comp.stem_angle_deg + 6.0))
    hood_length = comp.bar_reach + comp.hood_reach_offset
    fe_y_offset = math.sin(hood_angle) * hood_length
    be_y_offset = comp.bar_drop

    delta = _dist(bike.hoods, fe["hoods"])
    assert delta < MATCH_TOL, (
        f"Hoods mismatch: backend ({bike.hoods.x:.2f}, {bike.hoods.y:.2f}) vs "
        f"frontend ({fe['hoods'].x:.2f}, {fe['hoods'].y:.2f}), delta={delta:.2f} mm\n"
        f"Backend  y-offset from bar_clamp: bar_drop = {be_y_offset:+.2f} mm\n"
        f"Frontend y-offset from bar_clamp: sin({math.degrees(hood_angle):.1f}°) × "
        f"{hood_length:.1f} = {fe_y_offset:+.2f} mm\n"
        f"bar_drop is unused in the frontend hoods formula."
    )


@pytest.mark.xfail(strict=True, reason="BUG 5: hoods formula divergence — backend uses bar_drop, frontend uses sin(hoodAngle)*hoodLength")
@pytest.mark.parametrize("bar_drop,stem_angle_deg", [
    (0.0,   -6.0),   # default — ~14 mm delta
    (-40.0, -6.0),   # aggressive bars — ~54 mm delta
    (20.0,  -6.0),   # positive bar_drop (unusual)
    (0.0,   10.0),   # upward stem — hoodAngle = max(8, 16) = 16°
])
def test_hoods_mismatch_magnitude(bar_drop, stem_angle_deg):
    """
    Parametrised: shows the hoods position delta across several setups.
    All should FAIL (and the failure messages quantify the visual misalignment).
    """
    comp = _components(bar_drop=bar_drop, stem_angle_deg=stem_angle_deg)
    bike = synthesize_bike(_frame(), comp)
    fe = _frontend_contact_points(_frame(), comp)

    hood_angle = math.radians(max(8.0, comp.stem_angle_deg + 6.0))
    hood_length = comp.bar_reach + comp.hood_reach_offset

    delta = _dist(bike.hoods, fe["hoods"])
    assert delta < MATCH_TOL, (
        f"bar_drop={bar_drop}, stem_angle={stem_angle_deg}°: "
        f"backend ({bike.hoods.x:.1f}, {bike.hoods.y:.1f}) vs "
        f"frontend ({fe['hoods'].x:.1f}, {fe['hoods'].y:.1f}), "
        f"delta={delta:.2f} mm "
        f"[hood_angle={math.degrees(hood_angle):.1f}°, hood_length={hood_length:.1f} mm]"
    )


def test_hoods_bar_clamp_agrees():
    """
    Control test: bar_clamp is computed identically in backend and frontend.
    This confirms that the hoods divergence starts from the hoods formula,
    not from bar_clamp.
    """
    comp = _components()
    bike = synthesize_bike(_frame(), comp)
    fe = _frontend_contact_points(_frame(), comp)

    # Backend bar_clamp
    stem_angle = math.radians(comp.stem_angle_deg)
    steerer_y = _frame().stack + comp.spacer_stack
    bc_x_be = _frame().reach + math.cos(stem_angle) * comp.stem_length
    bc_y_be = steerer_y + math.sin(stem_angle) * comp.stem_length

    delta_x = abs(bike.bar_clamp.x - fe["bar_clamp"].x)
    delta_y = abs(bike.bar_clamp.y - fe["bar_clamp"].y)
    assert delta_x < MATCH_TOL and delta_y < MATCH_TOL, (
        f"bar_clamp mismatch: backend ({bike.bar_clamp.x:.2f}, {bike.bar_clamp.y:.2f}) "
        f"vs frontend ({fe['bar_clamp'].x:.2f}, {fe['bar_clamp'].y:.2f})"
    )


# ══════════════════════════════════════════════════════════════════════════════
# Cleat setback: 3D mannequin ankle must reflect cleat_setback
# ══════════════════════════════════════════════════════════════════════════════

def _rider() -> RiderAnthropometrics:
    return RiderAnthropometrics(
        height=1780.0,
        thigh_length=420.0,
        shank_length=390.0,
        torso_length=580.0,
        upper_arm_length=320.0,
        forearm_length=270.0,
        foot_length=265.0,
        shoulder_width=380.0,
        hip_width=330.0,
        hip_joint_offset=95.0,
    )


@pytest.mark.parametrize("setback", [0.0, 6.0, 12.0, 14.0])
def test_cleat_setback_propagates_to_ankle_3d(setback):
    """
    The 3D mannequin ankle must sit at (−cleat_setback, −crank_length + pedal_stack_height).
    This verifies the backend is self-consistent: cleat_setback shifts the pedal
    axle rearward (−x) and that shift propagates through to the ankle joint.

    Bug E (FitBuilderMode.tsx): bikeForMannequin uses idealContacts.cleat (x=0,
    ignoring setback) instead of bike.cleat (x=−cleat_setback).  The 2D overlay
    ankle.x is therefore always 0 regardless of cleat_setback, while the 3D
    mannequin ankle shifts correctly.  Fix: use bike.cleat in bikeForMannequin.

    This Python test verifies the backend 3D is correct (should PASS).
    The frontend overlay discrepancy requires a JS fix in FitBuilderMode.tsx.
    """
    comp = _components(cleat_setback=setback)
    bike = synthesize_bike(_frame(), comp)
    pts3d = solve_pose_3d(bike, comp, _rider())

    expected_x = -setback
    expected_y = -comp.crank_length + comp.pedal_stack_height

    assert abs(pts3d["ankle_l"].x - expected_x) < MATCH_TOL, (
        f"setback={setback}: ankle_l.x = {pts3d['ankle_l'].x:.2f}, expected {expected_x:.2f}"
    )
    assert abs(pts3d["ankle_l"].y - expected_y) < MATCH_TOL, (
        f"setback={setback}: ankle_l.y = {pts3d['ankle_l'].y:.2f}, expected {expected_y:.2f}"
    )
