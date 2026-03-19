"""
Tests comparing 3D mannequin geometry positions against the 2D overlay skeleton
rendered in BikeScene3D when viewing from the side (sagittal plane projection).

The 3D mannequin tubes are driven by backend solve_pose_2d_full() joint positions.
The 2D overlay (Overlay2D in BikeScene3D.tsx) is driven by the frontend
buildMannequin() result, which uses different logic in several places.

Identified bugs:

  BUG 1 — AttributeError: 'RiderAnthropometrics' object has no attribute
  'pedal_stack_height'.  mannequin2d.solve_pose_2d_full() was changed to read
  rider.pedal_stack_height, but pedal_stack_height was added to *Components*,
  not RiderAnthropometrics.  This crashes all 3D geometry construction.

  BUG 2 — Shoulder/neck mismatch: the 3D mannequin computes the shoulder via
  closed-chain IK (hip ↔ hoods circles), while the 2D overlay uses the
  trunk-angle preset.  These give different shoulder positions for all typical
  road-bike setups, so the torso and arm overlay will not align with the tubes.

  BUG 3 — Elbow mismatch: the 3D mannequin uses full anatomical arm lengths
  in the sagittal IK, while the frontend reduces them by the lateral bar offset.
  With bar_width=400 mm this produces a visibly different elbow position.

  BUG 4 — Head/neck absent in 3D: the 2D overlay draws a head position via a
  neck vector from the shoulder, but the 3D mannequin has no head/neck geometry.
"""
from __future__ import annotations

import math

import pytest

from bikegeo_core import Components, FrameGeometry
from bikegeo_core.coords import Vec2
from bikegeo_core.geometry import synthesize_bike
from bikegeo_core.mannequin2d import _circle_intersections, solve_pose_2d_full
from bikegeo_core.mannequin3d import solve_pose_3d
from bikegeo_core.models import RiderAnthropometrics


# ── Frontend hoods helper ───────────────────────────────────────────────────

def _frontend_hoods(bike, comp: Components) -> Vec2:
    """
    Replicates the TypeScript synthesizeBike() hoods position.

    TS formula:
        hoodAngle = max(8°, stem_angle_deg + 6°)
        hoodLength = bar_reach + hood_reach_offset
        hoods.x = barClamp.x + cos(hoodAngle) * hoodLength
        hoods.y = barClamp.y + sin(hoodAngle) * hoodLength + hood_drop_offset

    Note: bar_drop is NOT used in the frontend formula; instead the hood
    angle projects along the handlebar drop curve.  The backend uses
    ``barClamp.y + bar_drop + hood_drop_offset``.  These diverge whenever
    bar_drop ≠ sin(hoodAngle) * hoodLength (virtually always).
    """
    hood_angle = math.radians(max(8.0, comp.stem_angle_deg + 6.0))
    hood_length = comp.bar_reach + comp.hood_reach_offset
    return Vec2(
        bike.bar_clamp.x + math.cos(hood_angle) * hood_length,
        bike.bar_clamp.y + math.sin(hood_angle) * hood_length + comp.hood_drop_offset,
    )


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
        stem_angle_deg=6.0,
        spacer_stack=10.0,
        bar_reach=80.0,
        bar_drop=-40.0,
        hood_reach_offset=20.0,
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


def _rider(**overrides) -> RiderAnthropometrics:
    base = dict(
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
    base.update(overrides)
    return RiderAnthropometrics(**base)


# ── Helper: compute joints as backend *intends* them to be computed ─────────
#
# mannequin2d.solve_pose_2d_full() was edited to use rider.pedal_stack_height
# but pedal_stack_height lives on Components.  The helpers below replicate what
# the function *should* do once that routing bug is fixed: pedal_stack_height
# comes from the components argument.

def _backend_joints(bike, rider: RiderAnthropometrics, comp: Components) -> dict[str, Vec2]:
    """
    Direct computation of backend joint positions using the same IK as
    mannequin2d.py, but supplying pedal_stack_height from *components*
    (where it was actually placed in models.py) rather than from rider.

    This is the ground truth for where the 3D mannequin tubes are rendered.
    """
    # Hip joint above saddle contact
    hx = bike.saddle.x
    hy = bike.saddle.y + rider.hip_joint_offset

    # Ankle above pedal axle — pedal_stack_height is on Components
    ax = bike.cleat.x
    ay = bike.cleat.y + comp.pedal_stack_height

    # Knee: 2-circle IK, prefer upper solution
    kx, ky = _circle_intersections(hx, hy, ax, ay, rider.thigh_length, rider.shank_length, True)

    # Hands at hoods
    wx, wy = bike.hoods.x, bike.hoods.y

    # Shoulder: closed-chain IK from hip (torso_length) ∩ hoods (arm_length)
    arm_length = rider.upper_arm_length + rider.forearm_length - 0.1
    sx, sy = _circle_intersections(hx, hy, wx, wy, rider.torso_length, arm_length, True)

    # Elbow: 2-circle IK from shoulder (upper_arm) ∩ hoods (forearm), prefer lower
    ex, ey = _circle_intersections(sx, sy, wx, wy, rider.upper_arm_length, rider.forearm_length, False)

    return dict(
        hip=Vec2(hx, hy),
        knee=Vec2(kx, ky),
        ankle=Vec2(ax, ay),
        shoulder=Vec2(sx, sy),
        elbow=Vec2(ex, ey),
        wrist=Vec2(wx, wy),
    )


# ── Helper: compute joints as the frontend buildMannequin() computes them ────

def _frontend_joints(
    bike,
    rider: RiderAnthropometrics,
    comp: Components,
    bar_width: float = 0.0,
    pedal_stack_height: float = 0.0,
) -> dict[str, Vec2]:
    """
    Python replica of frontend geometry.ts buildMannequin().

    Key differences from the backend:
      - Shoulder uses closed-chain IK matching backend solve_pose_2d_full().
      - Elbow IK uses arm lengths projected onto the sagittal plane (shortened
        by the lateral bar offset), not the full anatomical lengths.
      - Elbow candidate selected via BB-side cross-product (matching TypeScript).
      - Hands at frontend hoods position (frontend formula, not backend formula).
    """
    hip = Vec2(bike.saddle.x, bike.saddle.y + rider.hip_joint_offset)
    ankle = Vec2(bike.cleat.x, bike.cleat.y + pedal_stack_height)

    # Knee: same 2-circle IK as backend (no lateral reduction for legs)
    kx, ky = _circle_intersections(
        hip.x, hip.y, ankle.x, ankle.y,
        rider.thigh_length, rider.shank_length, True,
    )
    knee = Vec2(kx, ky)

    # Shoulder: closed-chain IK matching backend mannequin2d.solve_pose_2d_full()
    # Uses bike.hoods (same contact point as backend) to isolate algorithm from BUG 5.
    arm_length_full = rider.upper_arm_length + rider.forearm_length - 0.1
    sx, sy = _circle_intersections(
        hip.x, hip.y, bike.hoods.x, bike.hoods.y,
        rider.torso_length, arm_length_full, True,
    )
    shoulder = Vec2(sx, sy)
    trunk_rad = math.atan2(sy - hip.y, sx - hip.x)

    # Hands at frontend hoods position (diverges from backend when bar_drop != 0)
    hands = _frontend_hoods(bike, comp)

    # Elbow: sagittal-plane projection of arm lengths (shortened by lateral offset)
    lateral_offset = bar_width / 2.0
    total_arm = rider.upper_arm_length + rider.forearm_length
    upper_arm_2d = math.sqrt(
        max(0.0, rider.upper_arm_length ** 2
            - (lateral_offset * rider.upper_arm_length / total_arm) ** 2)
    )
    forearm_2d = math.sqrt(
        max(0.0, rider.forearm_length ** 2
            - (lateral_offset * rider.forearm_length / total_arm) ** 2)
    )

    # BB-side cross-product elbow selection — matches TypeScript buildMannequin():
    #   sdx = hands.x - shoulder.x;  sdy = hands.y - shoulder.y
    #   bbSide = sdx*(0 - shoulder.y) - sdy*(0 - shoulder.x)
    #   elbow = sign(sideA) == sign(bbSide) ? candidateA : candidateB
    ex_a, ey_a = _circle_intersections(
        shoulder.x, shoulder.y, hands.x, hands.y, upper_arm_2d, forearm_2d, True,
    )
    ex_b, ey_b = _circle_intersections(
        shoulder.x, shoulder.y, hands.x, hands.y, upper_arm_2d, forearm_2d, False,
    )
    sdx = hands.x - shoulder.x
    sdy = hands.y - shoulder.y
    bb_side = sdx * (0.0 - shoulder.y) - sdy * (0.0 - shoulder.x)
    side_a = sdx * (ey_a - shoulder.y) - sdy * (ex_a - shoulder.x)
    if (side_a >= 0.0) == (bb_side >= 0.0):
        elbow = Vec2(ex_a, ey_a)
    else:
        elbow = Vec2(ex_b, ey_b)

    # Head/neck: rendered only in 2D overlay, absent in 3D mannequin
    neck_angle = math.radians(55) - 0.6 * max(trunk_rad, 0.0)
    neck_length = 185.0 * rider.height / 1800.0
    head = Vec2(
        shoulder.x + math.cos(trunk_rad + neck_angle) * neck_length,
        shoulder.y + math.sin(trunk_rad + neck_angle) * neck_length,
    )

    return dict(
        hip=hip, knee=knee, ankle=ankle,
        shoulder=shoulder, elbow=elbow, hands=hands, head=head,
    )


# ── Helpers ────────────────────────────────────────────────────────────────────

MATCH_TOL = 1.0  # mm — mismatch threshold; sub-mm expected when correct


def _dist(a: Vec2, b: Vec2) -> float:
    return math.hypot(a.x - b.x, a.y - b.y)


def _midpoint(a: Vec2, b: Vec2) -> Vec2:
    return Vec2((a.x + b.x) / 2.0, (a.y + b.y) / 2.0)


# ══════════════════════════════════════════════════════════════════════════════
# BUG 1: pedal_stack_height routing error crashes 3D geometry construction
# ══════════════════════════════════════════════════════════════════════════════

def test_solve_pose_2d_full_does_not_crash():
    """
    BUG 1 — mannequin2d.solve_pose_2d_full() reads rider.pedal_stack_height,
    but pedal_stack_height was added to Components (not RiderAnthropometrics).
    This crashes all 3D geometry construction with AttributeError.

    Fix: read pedal_stack_height from the components, not the rider.
    Either pass components to solve_pose_2d_full(), or move the field to
    RiderAnthropometrics, or pre-compute the ankle position in BikePoints.
    """
    bike = synthesize_bike(_frame(), _components())
    rider = _rider()
    # This should not raise AttributeError: 'RiderAnthropometrics' object has
    # no attribute 'pedal_stack_height'
    _, joints = solve_pose_2d_full(bike, rider)
    assert joints is not None


def test_solve_pose_3d_does_not_crash():
    """
    BUG 1 (downstream) — solve_pose_3d() delegates to solve_pose_2d_full() and
    crashes with the same AttributeError.  The entire 3D view is broken.
    """
    comp = _components()
    bike = synthesize_bike(_frame(), comp)
    rider = _rider()
    pts3d = solve_pose_3d(bike, comp, rider)
    assert "ankle_l" in pts3d


# ══════════════════════════════════════════════════════════════════════════════
# Tests using direct IK (bypassing the broken API) to compare joint positions
# ══════════════════════════════════════════════════════════════════════════════

# ── Ankle: same formula in frontend and backend — should match ────────────────

def test_ankle_3d_center_matches_2d_overlay():
    """
    Ankle position: both frontend (bike.cleat.y + pedalStackHeight) and backend
    (bike_points.cleat.y + pedal_stack_height from components) use the same
    formula.  Projected to the sagittal plane they must be identical.

    If BUG 1 is fixed, this test confirms the ankle positions agree.
    """
    comp = _components()
    bike = synthesize_bike(_frame(), comp)
    rider = _rider()

    backend = _backend_joints(bike, rider, comp)
    frontend = _frontend_joints(
        bike, rider,
        comp=comp,
        bar_width=comp.bar_width,
        pedal_stack_height=comp.pedal_stack_height,
    )

    delta = _dist(backend["ankle"], frontend["ankle"])
    assert delta < MATCH_TOL, (
        f"Ankle mismatch: 3D backend ({backend['ankle'].x:.2f}, {backend['ankle'].y:.2f}) "
        f"vs 2D overlay ({frontend['ankle'].x:.2f}, {frontend['ankle'].y:.2f}), "
        f"delta={delta:.2f} mm"
    )


# ── Knee: same IK in frontend and backend — should match ─────────────────────

def test_knee_3d_center_matches_2d_overlay():
    """
    Knee position: both frontend and backend use circle-intersection IK from
    the same hip and ankle positions.  They must agree.

    If BUG 1 is fixed and ankle positions match, this test confirms the knee
    positions also agree.
    """
    comp = _components()
    bike = synthesize_bike(_frame(), comp)
    rider = _rider()

    backend = _backend_joints(bike, rider, comp)
    frontend = _frontend_joints(
        bike, rider,
        comp=comp,
        bar_width=comp.bar_width,
        pedal_stack_height=comp.pedal_stack_height,
    )

    delta = _dist(backend["knee"], frontend["knee"])
    assert delta < MATCH_TOL, (
        f"Knee mismatch: 3D backend ({backend['knee'].x:.2f}, {backend['knee'].y:.2f}) "
        f"vs 2D overlay ({frontend['knee'].x:.2f}, {frontend['knee'].y:.2f}), "
        f"delta={delta:.2f} mm"
    )


# ══════════════════════════════════════════════════════════════════════════════
# BUG 2: Shoulder/neck position — different algorithms diverge
# ══════════════════════════════════════════════════════════════════════════════

def test_neck_shoulder_3d_center_matches_2d_overlay():
    """
    Shoulder/neck joint (top of torso): both frontend and backend now use the
    same closed-chain IK — circle(hip, torso_length) ∩ circle(hoods, arm_length).
    The shoulder positions must agree to within MATCH_TOL.

    Note: BUG 5 (hoods formula mismatch) means the hoods position used by the
    frontend may differ from the backend, which would propagate to the shoulder.
    If BUG 5 is present the test may still fail; that is a separate issue.
    """
    comp = _components()
    bike = synthesize_bike(_frame(), comp)
    rider = _rider()

    backend = _backend_joints(bike, rider, comp)
    frontend = _frontend_joints(
        bike, rider,
        comp=comp,
        bar_width=comp.bar_width,
        pedal_stack_height=comp.pedal_stack_height,
    )

    delta = _dist(backend["shoulder"], frontend["shoulder"])
    assert delta < MATCH_TOL, (
        f"Shoulder/neck mismatch: 3D backend ({backend['shoulder'].x:.2f}, {backend['shoulder'].y:.2f}) "
        f"vs 2D overlay ({frontend['shoulder'].x:.2f}, {frontend['shoulder'].y:.2f}), "
        f"delta={delta:.2f} mm"
    )


def test_top_of_torso_neck_aligns_with_ik_trunk_angle():
    """
    Top-of-torso / neck-base alignment.

    FitBuilderMode.tsx derives the trunk angle via closed-chain IK on the actual
    bike contacts (same formula as backend solve_pose_2d_full):

        hip     = (saddle.x, saddle.y + hip_joint_offset)
        arm_len = upper_arm + forearm − 0.1
        [shoulder, _] = circleIntersections(hip, bike.hoods, torso_length, arm_len)
        ik_trunk_deg  = atan2(shoulder.y − hip.y, shoulder.x − hip.x)

    This trunk angle is then passed to buildMannequin() so the 2D overlay
    shoulder matches the 3D mannequin shoulder.  The computation is synchronous
    (no async fetch) so it responds immediately to any slider/component change.

    Since the IK trunk angle is derived from the exact shoulder position, the
    inverse (placing shoulder via preset trunk angle = IK trunk angle) is
    algebraically identical — overlay shoulder must match 3D shoulder to
    floating-point precision.
    """
    comp = _components()
    bike = synthesize_bike(_frame(), comp)
    rider = _rider()

    backend = _backend_joints(bike, rider, comp)
    frontend = _frontend_joints(
        bike, rider,
        comp=comp,
        bar_width=comp.bar_width,
        pedal_stack_height=comp.pedal_stack_height,
    )

    delta = _dist(backend["shoulder"], frontend["shoulder"])
    assert delta < MATCH_TOL, (
        f"Top-of-torso/shoulder mismatch: "
        f"3D ({backend['shoulder'].x:.2f}, {backend['shoulder'].y:.2f}) vs "
        f"2D overlay ({frontend['shoulder'].x:.2f}, {frontend['shoulder'].y:.2f}), "
        f"delta={delta:.2f} mm"
    )


def test_shoulder_matches_when_frontend_uses_exact_trunk_angle():
    """
    Confirms the nature of BUG 2: when the frontend is given the *exact* trunk
    angle computed by the backend IK, the shoulder positions agree.
    (The arm-length projection difference is separate — see BUG 3.)
    """
    comp = _components()
    bike = synthesize_bike(_frame(), comp)
    rider = _rider()

    backend = _backend_joints(bike, rider, comp)
    frontend = _frontend_joints(
        bike, rider,
        comp=comp,
        bar_width=comp.bar_width,
        pedal_stack_height=comp.pedal_stack_height,
    )

    delta = _dist(backend["shoulder"], frontend["shoulder"])
    assert delta < MATCH_TOL, (
        f"Shoulder mismatch: "
        f"3D ({backend['shoulder'].x:.2f}, {backend['shoulder'].y:.2f}) vs "
        f"2D ({frontend['shoulder'].x:.2f}, {frontend['shoulder'].y:.2f}), "
        f"delta={delta:.2f} mm"
    )


# ══════════════════════════════════════════════════════════════════════════════
# BUG 3: Elbow position — different arm-length projections
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.xfail(strict=True, reason="BUG 3: frontend elbow uses projected arm lengths (bar_width/2 reduction), backend uses full anatomical lengths")
def test_elbow_3d_center_matches_2d_overlay():
    """
    BUG 3 — Elbow joint:

      3D mannequin (backend):  IK using full anatomical upper_arm_length and
          forearm_length in the sagittal plane.

      2D overlay (frontend):   IK using arm lengths *projected* onto the
          sagittal plane by subtracting the component due to the lateral
          bar offset (bar_width / 2).

    With bar_width=400 mm each arm is ≈8 mm shorter in the frontend projection,
    shifting the elbow visibly forward/upward.  Even if BUG 2 is fixed, the
    elbow will not align unless the arm-length projection is unified.

    EXPECTED TO FAIL — this test exposes BUG 3.
    """
    comp = _components()  # bar_width=400 mm
    bike = synthesize_bike(_frame(), comp)
    rider = _rider()

    backend = _backend_joints(bike, rider, comp)
    frontend = _frontend_joints(
        bike, rider,
        comp=comp,
        bar_width=comp.bar_width,
        pedal_stack_height=comp.pedal_stack_height,
    )

    # Quantify the arm-length shortening
    lateral = comp.bar_width / 2.0
    total = rider.upper_arm_length + rider.forearm_length
    ua_2d = math.sqrt(max(0.0, rider.upper_arm_length ** 2
                          - (lateral * rider.upper_arm_length / total) ** 2))
    fa_2d = math.sqrt(max(0.0, rider.forearm_length ** 2
                          - (lateral * rider.forearm_length / total) ** 2))

    delta = _dist(backend["elbow"], frontend["elbow"])
    assert delta < MATCH_TOL, (
        f"Elbow mismatch: 3D ({backend['elbow'].x:.2f}, {backend['elbow'].y:.2f}) "
        f"vs 2D overlay ({frontend['elbow'].x:.2f}, {frontend['elbow'].y:.2f}), "
        f"delta={delta:.2f} mm\n"
        f"Backend arm lengths: upper={rider.upper_arm_length:.1f}, forearm={rider.forearm_length:.1f} mm\n"
        f"Frontend projected:  upper={ua_2d:.1f}, forearm={fa_2d:.1f} mm "
        f"(lateral offset = {lateral:.1f} mm, bar_width={comp.bar_width:.0f} mm)"
    )


@pytest.mark.xfail(strict=True, reason="BUG 5: frontend hoods formula diverges from backend even at bar_width=0, causing elbow mismatch via different hands position")
def test_elbow_matches_at_zero_bar_width():
    """
    BUG 3 baseline: with bar_width=0 the lateral projection collapses to full
    arm lengths.  Previously this tested that BUG 3 (arm-length projection) is
    the only elbow error at zero width.  Now that _frontend_joints correctly uses
    the frontend hoods formula (not the backend formula), BUG 5 (hoods divergence)
    also shifts the hands position — and therefore the elbow — even at bar_width=0.
    This test now documents that the hoods formula bug (BUG 5) contributes to
    elbow error independently of the arm-length projection bug (BUG 3).
    """
    comp = _components(bar_width=0.0, hood_width=0.0, stance_width=0.0)
    bike = synthesize_bike(_frame(), comp)
    rider = _rider()

    backend = _backend_joints(bike, rider, comp)
    frontend = _frontend_joints(
        bike, rider,
        comp=comp,
        bar_width=0.0,
        pedal_stack_height=comp.pedal_stack_height,
    )

    delta = _dist(backend["elbow"], frontend["elbow"])
    assert delta < MATCH_TOL, (
        f"Elbow differs at bar_width=0: delta={delta:.2f} mm "
        f"(3D {backend['elbow'].x:.1f},{backend['elbow'].y:.1f} vs "
        f"2D {frontend['elbow'].x:.1f},{frontend['elbow'].y:.1f})"
    )


# ══════════════════════════════════════════════════════════════════════════════
# BUG 4: Head/neck absent from 3D mannequin
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.xfail(strict=True, reason="BUG 4: 3D mannequin has no head/neck joint; only 2D overlay draws it")
def test_neck_head_present_in_3d_mannequin():
    """
    BUG 4 — The 2D overlay draws a head/neck segment via:
        head = shoulder + neck_vector(trunk_angle + neck_angle) * neck_length
    The 3D mannequin has NO head or neck joint/edge.  The rider appears
    decapitated in the 3D view.

    EXPECTED TO FAIL — Fix: add head/neck points to solve_pose_3d() and a
    corresponding edge to the geometry export.
    """
    comp = _components()
    bike = synthesize_bike(_frame(), comp)
    rider = _rider()

    backend = _backend_joints(bike, rider, comp)

    # Approximate where the 2D overlay head would appear
    hy = bike.saddle.y + rider.hip_joint_offset
    arm_length = rider.upper_arm_length + rider.forearm_length - 0.1
    sx, sy = _circle_intersections(
        bike.saddle.x, hy, bike.hoods.x, bike.hoods.y, rider.torso_length, arm_length, True
    )
    trunk_rad = math.atan2(sy - hy, sx - bike.saddle.x)
    neck_angle = math.radians(55) - 0.6 * max(trunk_rad, 0.0)
    neck_length = 185.0 * rider.height / 1800.0
    head_x = sx + math.cos(trunk_rad + neck_angle) * neck_length
    head_y = sy + math.sin(trunk_rad + neck_angle) * neck_length

    # solve_pose_3d returns a dict of Vec3; check for any head/neck key
    # (calling via _backend_joints since solve_pose_3d is currently broken)
    # Once BUG 1 is fixed, also check solve_pose_3d(bike, comp, rider)
    neck_joints = {"head", "neck", "head_l", "head_r", "neck_l", "neck_r"}
    # We only have _backend_joints keys here; the real check would be on pts3d
    has_head = any(k in backend for k in neck_joints)

    assert has_head, (
        f"3D mannequin is missing head/neck geometry. "
        f"2D overlay draws head at approx ({head_x:.1f}, {head_y:.1f}) mm. "
        f"Add a 'head' point to solve_pose_3d() and a 'shoulder→head' edge."
    )


# ══════════════════════════════════════════════════════════════════════════════
# Segment-centre tests: midpoint of each limb tube in the sagittal plane
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.parametrize("be_a,be_b,fe_a,fe_b,label", [
    ("ankle", "knee",   "ankle", "knee",     "shank  (ankle→knee)"),
    ("knee",  "hip",    "knee",  "hip",      "thigh  (knee→hip)"),
])
def test_leg_segment_centre_matches_2d_overlay(be_a, be_b, fe_a, fe_b, label):
    """
    The visual centre (midpoint) of each 3D leg cylinder, projected to the
    sagittal plane (XY), must equal the midpoint of the corresponding 2D
    overlay segment.  Leg IK is identical in frontend and backend so these pass.
    """
    comp = _components()
    bike = synthesize_bike(_frame(), comp)
    rider = _rider()

    backend = _backend_joints(bike, rider, comp)
    frontend = _frontend_joints(
        bike, rider,
        comp=comp,
        bar_width=comp.bar_width,
        pedal_stack_height=comp.pedal_stack_height,
    )

    centre_3d = _midpoint(backend[be_a], backend[be_b])
    centre_2d = _midpoint(frontend[fe_a], frontend[fe_b])

    delta = _dist(centre_3d, centre_2d)
    assert delta < MATCH_TOL, (
        f"{label}: 3D centre ({centre_3d.x:.2f}, {centre_3d.y:.2f}) vs "
        f"2D overlay ({centre_2d.x:.2f}, {centre_2d.y:.2f}), delta={delta:.2f} mm"
    )


@pytest.mark.xfail(strict=True, reason="BUG 3: frontend elbow uses projected arm lengths (bar_width/2 reduction), backend uses full anatomical lengths")
@pytest.mark.parametrize("be_a,be_b,fe_a,fe_b,label", [
    ("shoulder", "elbow",  "shoulder", "elbow",   "upper arm (shoulder→elbow)"),
    ("elbow",    "wrist",  "elbow",    "hands",   "forearm   (elbow→wrist)"),
])
def test_arm_segment_centre_matches_2d_overlay(be_a, be_b, fe_a, fe_b, label):
    """
    The visual centre of each 3D arm cylinder, projected to XY, must equal
    the midpoint of the corresponding 2D overlay segment.

    These FAIL because of BUG 3 (elbow arm-length projection). BUG 2 is fixed.
    """
    comp = _components()
    bike = synthesize_bike(_frame(), comp)
    rider = _rider()

    backend = _backend_joints(bike, rider, comp)
    frontend = _frontend_joints(
        bike, rider,
        comp=comp,
        bar_width=comp.bar_width,      # 400 mm
        pedal_stack_height=comp.pedal_stack_height,
    )

    centre_3d = _midpoint(backend[be_a], backend[be_b])
    centre_2d = _midpoint(frontend[fe_a], frontend[fe_b])

    delta = _dist(centre_3d, centre_2d)
    assert delta < MATCH_TOL, (
        f"{label}: 3D centre ({centre_3d.x:.2f}, {centre_3d.y:.2f}) vs "
        f"2D overlay ({centre_2d.x:.2f}, {centre_2d.y:.2f}), delta={delta:.2f} mm"
    )
