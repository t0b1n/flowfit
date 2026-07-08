from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .coords import Vec2
from .geometry import BikePoints, cleat_at_crank_angle, pedal_spindle_at_angle
from .models import Components, PoseMetrics, RiderAnthropometrics

# All IK helpers below are written with numpy ufuncs so they accept plain
# floats (returning numpy scalars) or broadcast arrays interchangeably. The
# solver's grid search evaluates the whole component grid through these same
# functions — there is deliberately no separate vectorised implementation.


@dataclass
class MannequinJoints2D:
    hip: Vec2
    knee: Vec2
    ankle: Vec2
    shoulder: Vec2
    elbow: Vec2
    wrist: Vec2
    hand: Vec2
    head: Vec2
    neck_base: Vec2
    spine_joint: Vec2


def _angle_at_point(ax, ay, vx, vy, cx, cy):
    """Angle in degrees at (vx,vy) formed by rays to (ax,ay) and (cx,cy)."""
    eax, eay = ax - vx, ay - vy
    ecx, ecy = cx - vx, cy - vy
    dot = eax * ecx + eay * ecy
    mag = np.sqrt(np.maximum((eax ** 2 + eay ** 2) * (ecx ** 2 + ecy ** 2), 1e-12))
    return np.degrees(np.arccos(np.clip(dot / mag, -1.0, 1.0)))


def _circle_intersections_both(ax, ay, bx, by, radius_a, radius_b):
    """Return both circle-circle intersection points as ((x1,y1), (x2,y2)).

    The chord distance is clamped so an out-of-reach target degrades to a
    near-straight limb instead of producing NaN.
    """
    dx, dy = bx - ax, by - ay
    dist = np.maximum(np.sqrt(dx ** 2 + dy ** 2), 1e-6)
    clamped = np.minimum(dist, radius_a + radius_b - 1e-6)
    base_d = (radius_a ** 2 - radius_b ** 2 + clamped ** 2) / (2 * clamped)
    h = np.sqrt(np.maximum(radius_a ** 2 - base_d ** 2, 0.0))
    bx2 = ax + (base_d * dx) / dist
    by2 = ay + (base_d * dy) / dist
    ox = (-dy * h) / dist
    oy = (dx * h) / dist
    return (bx2 + ox, by2 + oy), (bx2 - ox, by2 - oy)


def _circle_intersections(ax, ay, bx, by, radius_a, radius_b, prefer_upper: bool):
    """Return the preferred circle-circle intersection point."""
    p1, p2 = _circle_intersections_both(ax, ay, bx, by, radius_a, radius_b)
    take_p1 = p1[1] >= p2[1] if prefer_upper else p1[1] <= p2[1]
    return np.where(take_p1, p1[0], p2[0]), np.where(take_p1, p1[1], p2[1])


def _circle_intersection_anterior(ax, ay, bx, by, radius_a, radius_b):
    """Return the intersection on the anterior (forward) side of chord a→b.

    Used for knee IK: with the chord running hip→ankle (downward), the
    anatomically correct knee is forward of that line at every crank angle,
    whereas "upper" becomes ambiguous near TDC where the chord is short and
    almost vertical.
    """
    p1, p2 = _circle_intersections_both(ax, ay, bx, by, radius_a, radius_b)
    dx, dy = bx - ax, by - ay
    cross1 = dx * (p1[1] - ay) - dy * (p1[0] - ax)
    # With the chord pointing generally downward (dy < 0), a positive cross
    # product places the point on the +X (forward) side of the chord.
    take_p1 = cross1 >= 0
    return np.where(take_p1, p1[0], p2[0]), np.where(take_p1, p1[1], p2[1])


def solve_leg_2d(
    hip: Vec2,
    cleat: Vec2,
    rider: RiderAnthropometrics,
    pedal_stack_height: float,
) -> tuple[Vec2, Vec2, float]:
    """Solve the leg 2-link IK for one cleat position.

    Returns (knee, ankle, knee_extension_deg). The ankle sits
    pedal_stack_height vertically above the cleat; the knee is chosen on the
    anterior side of the hip→ankle chord.
    """
    ankle = Vec2(cleat.x, cleat.y + pedal_stack_height)
    kx, ky = _circle_intersection_anterior(
        hip.x, hip.y, ankle.x, ankle.y, rider.thigh_length, rider.shank_length
    )
    knee_extension = _angle_at_point(hip.x, hip.y, kx, ky, ankle.x, ankle.y)
    return Vec2(kx, ky), ankle, knee_extension


@dataclass
class PedalStrokeMetrics:
    """Metrics sampled over a full crank revolution (hip held fixed).

    KOPS uses the knee joint centre, not the tibial tuberosity (which sits
    roughly 10 mm anterior of it).
    """

    knee_flexion_tdc_deg: float      # 180 − extension at crank angle 0° (TDC)
    knee_extension_max_deg: float    # max extension over the sampled stroke
    knee_flexion_max_deg: float      # max flexion over the sampled stroke
    kops_offset_mm: float            # knee.x − pedal spindle.x at crank 90°


def sample_pedal_stroke(
    bike_points: BikePoints,
    components: Components,
    rider: RiderAnthropometrics,
    samples: int = 24,
) -> PedalStrokeMetrics:
    """Sample leg IK around the crank circle and summarise the stroke."""
    hip = Vec2(
        bike_points.saddle.x,
        bike_points.saddle.y + rider.hip_joint_offset,
    )
    pedal_stack = components.pedal_stack_height

    angles = {round(i * 360.0 / samples, 6) for i in range(samples)}
    angles.update((0.0, 90.0, 180.0))

    extension_by_angle: dict[float, float] = {}
    knee_by_angle: dict[float, Vec2] = {}
    for angle in angles:
        cleat = cleat_at_crank_angle(bike_points.bb, components, angle)
        knee, _, extension = solve_leg_2d(hip, cleat, rider, pedal_stack)
        extension_by_angle[angle] = extension
        knee_by_angle[angle] = knee

    max_extension = max(extension_by_angle.values())
    min_extension = min(extension_by_angle.values())
    spindle_90 = pedal_spindle_at_angle(bike_points.bb, components.crank_length, 90.0)

    return PedalStrokeMetrics(
        knee_flexion_tdc_deg=180.0 - extension_by_angle[0.0],
        knee_extension_max_deg=max_extension,
        knee_flexion_max_deg=180.0 - min_extension,
        kops_offset_mm=knee_by_angle[90.0].x - spindle_90.x,
    )


@dataclass
class RawPose2D:
    """Raw pose values — plain floats for a single bike, broadcast numpy
    arrays when the input bike points carry arrays (the solver grid)."""

    hip: tuple
    knee: tuple
    ankle: tuple
    shoulder: tuple
    elbow: tuple
    wrist: tuple
    hand: tuple
    head: tuple
    neck_base: tuple
    spine_joint: tuple
    trunk_angle_deg: object
    hip_angle_deg: object
    shoulder_flexion_deg: object
    elbow_flexion_deg: object
    knee_extension_deg: object


def solve_pose_raw(
    bike_points: BikePoints,
    rider: RiderAnthropometrics,
    pedal_stack_height: float = 11.0,
) -> RawPose2D:
    """Solve the 2D pose. Element-wise over whatever the bike points hold —
    scalars for one bike, broadcast arrays for the solver's component grid."""
    # Hip joint is above the saddle contact by hip_joint_offset
    hx = bike_points.saddle.x
    hy = bike_points.saddle.y + rider.hip_joint_offset

    # Leg via 2-link IK (thigh + shank), knee on the anterior side of the
    # hip→ankle chord (identical to the upper solution at BDC).
    knee_pt, ankle_pt, knee_extension = solve_leg_2d(
        Vec2(hx, hy), bike_points.cleat, rider, pedal_stack_height
    )
    kx, ky = knee_pt.x, knee_pt.y
    ax, ay = ankle_pt.x, ankle_pt.y

    # Hand position is at hoods; wrist is forearm_length − palm_length from elbow
    hand_x, hand_y = bike_points.hoods.x, bike_points.hoods.y

    # Shoulder via closed-chain IK: find the upper intersection of
    #   circle(hip, torso_length)  ∩  circle(hoods, upper_arm + forearm)
    # prefer_upper=True picks the anatomically correct upright position;
    # the trunk angle then adapts naturally to the bike's reach/drop geometry.
    # Subtract a negligible 0.1 mm so the shoulder sits just inside arm reach:
    # this keeps the inner elbow IK non-degenerate (h > 0) while having no
    # perceptible effect on the trunk angle or shoulder position.
    arm_length = rider.upper_arm_length + rider.forearm_length - 0.1
    sx, sy = _circle_intersections(hx, hy, hand_x, hand_y, rider.torso_length, arm_length, prefer_upper=True)

    # Trunk angle derived from the actual shoulder position
    trunk_angle_rad = np.arctan2(sy - hy, sx - hx)
    trunk_angle = np.degrees(trunk_angle_rad)

    # Elbow via 2-link IK (upper arm + forearm), prefer lower solution
    ex, ey = _circle_intersections(sx, sy, hand_x, hand_y, rider.upper_arm_length, rider.forearm_length, False)

    # Wrist: positioned along elbow→hand vector at (forearm_length − palm_length)
    palm_length = 0.055 * rider.height
    forearm_no_palm = rider.forearm_length - palm_length
    elbow_to_hand_dx = hand_x - ex
    elbow_to_hand_dy = hand_y - ey
    elbow_to_hand_dist = np.maximum(np.sqrt(elbow_to_hand_dx ** 2 + elbow_to_hand_dy ** 2), 1e-6)
    wx = ex + (elbow_to_hand_dx / elbow_to_hand_dist) * forearm_no_palm
    wy = ey + (elbow_to_hand_dy / elbow_to_hand_dist) * forearm_no_palm

    # Spine joint: midpoint of hip and shoulder (splits torso into upper/lower)
    spine_jx = (hx + sx) / 2.0
    spine_jy = (hy + sy) / 2.0

    # Head and neck base
    neck_angle = (55.0 * 3.141592653589793) / 180.0 - 0.6 * np.maximum(trunk_angle_rad, 0.0)
    neck_length = 185.0 * rider.height / 1800.0
    head_dir = trunk_angle_rad + neck_angle
    head_x = sx + np.cos(head_dir) * neck_length
    head_y = sy + np.sin(head_dir) * neck_length
    # Neck base: 15% along the shoulder→head vector (neck is short)
    neck_base_x = sx + (head_x - sx) * 0.15
    neck_base_y = sy + (head_y - sy) * 0.15

    # Joint angles (knee_extension computed with the leg IK above)
    hip_angle = _angle_at_point(sx, sy, hx, hy, kx, ky)
    shoulder_flexion = _angle_at_point(hx, hy, sx, sy, ex, ey)
    elbow_interior = _angle_at_point(sx, sy, ex, ey, hand_x, hand_y)
    elbow_flexion = 180.0 - elbow_interior

    return RawPose2D(
        hip=(hx, hy),
        knee=(kx, ky),
        ankle=(ax, ay),
        shoulder=(sx, sy),
        elbow=(ex, ey),
        wrist=(wx, wy),
        hand=(hand_x, hand_y),
        head=(head_x, head_y),
        neck_base=(neck_base_x, neck_base_y),
        spine_joint=(spine_jx, spine_jy),
        trunk_angle_deg=trunk_angle,
        hip_angle_deg=hip_angle,
        shoulder_flexion_deg=shoulder_flexion,
        elbow_flexion_deg=elbow_flexion,
        knee_extension_deg=knee_extension,
    )


def solve_pose_2d_full(
    bike_points: BikePoints,
    rider: RiderAnthropometrics,
    pedal_stack_height: float = 11.0,
) -> tuple[PoseMetrics, MannequinJoints2D]:
    """Solve 2D pose and return both metrics and joint positions."""
    raw = solve_pose_raw(bike_points, rider, pedal_stack_height)

    metrics = PoseMetrics(
        trunk_angle_deg=float(raw.trunk_angle_deg),
        hip_angle_deg=float(raw.hip_angle_deg),
        shoulder_flexion_deg=float(raw.shoulder_flexion_deg),
        elbow_flexion_deg=float(raw.elbow_flexion_deg),
        knee_extension_deg=float(raw.knee_extension_deg),
    )
    as_vec2 = lambda pt: Vec2(float(pt[0]), float(pt[1]))  # noqa: E731
    joints = MannequinJoints2D(
        hip=as_vec2(raw.hip),
        knee=as_vec2(raw.knee),
        ankle=as_vec2(raw.ankle),
        shoulder=as_vec2(raw.shoulder),
        elbow=as_vec2(raw.elbow),
        wrist=as_vec2(raw.wrist),
        hand=as_vec2(raw.hand),
        head=as_vec2(raw.head),
        neck_base=as_vec2(raw.neck_base),
        spine_joint=as_vec2(raw.spine_joint),
    )
    return metrics, joints


def solve_pose_2d(
    bike_points: BikePoints,
    rider: RiderAnthropometrics,
    pedal_stack_height: float = 11.0,
) -> PoseMetrics:
    metrics, _ = solve_pose_2d_full(bike_points, rider, pedal_stack_height)
    return metrics
