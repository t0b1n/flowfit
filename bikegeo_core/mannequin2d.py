from __future__ import annotations

from dataclasses import dataclass
from math import acos, atan2, cos, degrees, sin, sqrt

from .coords import Vec2
from .geometry import BikePoints
from .models import PoseMetrics, RiderAnthropometrics


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


def _angle_at_point(ax: float, ay: float, vx: float, vy: float, cx: float, cy: float) -> float:
    """Angle in degrees at (vx,vy) formed by rays to (ax,ay) and (cx,cy)."""
    eax, eay = ax - vx, ay - vy
    ecx, ecy = cx - vx, cy - vy
    dot = eax * ecx + eay * ecy
    mag = sqrt(max((eax ** 2 + eay ** 2) * (ecx ** 2 + ecy ** 2), 1e-12))
    return degrees(acos(max(-1.0, min(1.0, dot / mag))))


def _circle_intersections(
    ax: float,
    ay: float,
    bx: float,
    by: float,
    radius_a: float,
    radius_b: float,
    prefer_upper: bool,
) -> tuple[float, float]:
    """Return the preferred circle-circle intersection point."""
    dx, dy = bx - ax, by - ay
    dist = max(sqrt(dx ** 2 + dy ** 2), 1e-6)
    clamped = min(dist, radius_a + radius_b - 1e-6)
    base_d = (radius_a ** 2 - radius_b ** 2 + clamped ** 2) / (2 * clamped)
    h = sqrt(max(radius_a ** 2 - base_d ** 2, 0.0))
    bx2 = ax + (base_d * dx) / dist
    by2 = ay + (base_d * dy) / dist
    ox = (-dy * h) / dist
    oy = (dx * h) / dist
    p1 = (bx2 + ox, by2 + oy)
    p2 = (bx2 - ox, by2 - oy)
    if prefer_upper:
        return p1 if p1[1] >= p2[1] else p2
    return p1 if p1[1] <= p2[1] else p2


def solve_pose_2d_full(
    bike_points: BikePoints,
    rider: RiderAnthropometrics,
    pedal_stack_height: float = 11.0,
) -> tuple[PoseMetrics, MannequinJoints2D]:
    """Solve 2D pose and return both metrics and joint positions."""
    # Hip joint is above the saddle contact by hip_joint_offset
    hx = bike_points.saddle.x
    hy = bike_points.saddle.y + rider.hip_joint_offset
    # Ankle is above the cleat by pedal_stack_height
    ax = bike_points.cleat.x
    ay = bike_points.cleat.y + pedal_stack_height

    # Knee via 2-link IK (thigh + shank), prefer upper solution
    kx, ky = _circle_intersections(hx, hy, ax, ay, rider.thigh_length, rider.shank_length, True)

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
    trunk_angle = degrees(atan2(sy - hy, sx - hx))

    # Elbow via 2-link IK (upper arm + forearm), prefer lower solution
    ex, ey = _circle_intersections(sx, sy, hand_x, hand_y, rider.upper_arm_length, rider.forearm_length, False)

    # Wrist: positioned along elbow→hand vector at (forearm_length − palm_length)
    palm_length = 0.055 * rider.height
    forearm_no_palm = rider.forearm_length - palm_length
    elbow_to_hand_dx = hand_x - ex
    elbow_to_hand_dy = hand_y - ey
    elbow_to_hand_dist = max(sqrt(elbow_to_hand_dx ** 2 + elbow_to_hand_dy ** 2), 1e-6)
    wx = ex + (elbow_to_hand_dx / elbow_to_hand_dist) * forearm_no_palm
    wy = ey + (elbow_to_hand_dy / elbow_to_hand_dist) * forearm_no_palm

    # Spine joint: midpoint of hip and shoulder (splits torso into upper/lower)
    spine_jx = (hx + sx) / 2.0
    spine_jy = (hy + sy) / 2.0

    # Head and neck base
    neck_angle = (55.0 * 3.141592653589793) / 180.0 - 0.6 * max(atan2(sy - hy, sx - hx), 0.0)
    trunk_angle_rad = atan2(sy - hy, sx - hx)
    neck_length = 185.0 * rider.height / 1800.0
    head_dir = trunk_angle_rad + neck_angle
    head_x = sx + cos(head_dir) * neck_length
    head_y = sy + sin(head_dir) * neck_length
    # Neck base: 15% along the shoulder→head vector (neck is short)
    neck_base_x = sx + (head_x - sx) * 0.15
    neck_base_y = sy + (head_y - sy) * 0.15

    # Joint angles
    knee_extension = _angle_at_point(hx, hy, kx, ky, ax, ay)
    hip_angle = _angle_at_point(sx, sy, hx, hy, kx, ky)
    shoulder_flexion = _angle_at_point(hx, hy, sx, sy, ex, ey)
    elbow_interior = _angle_at_point(sx, sy, ex, ey, hand_x, hand_y)
    elbow_flexion = 180.0 - elbow_interior

    metrics = PoseMetrics(
        trunk_angle_deg=trunk_angle,
        hip_angle_deg=hip_angle,
        shoulder_flexion_deg=shoulder_flexion,
        elbow_flexion_deg=elbow_flexion,
        knee_extension_deg=knee_extension,
    )
    joints = MannequinJoints2D(
        hip=Vec2(hx, hy),
        knee=Vec2(kx, ky),
        ankle=Vec2(ax, ay),
        shoulder=Vec2(sx, sy),
        elbow=Vec2(ex, ey),
        wrist=Vec2(wx, wy),
        hand=Vec2(hand_x, hand_y),
        head=Vec2(head_x, head_y),
        neck_base=Vec2(neck_base_x, neck_base_y),
        spine_joint=Vec2(spine_jx, spine_jy),
    )
    return metrics, joints


def solve_pose_2d(
    bike_points: BikePoints,
    rider: RiderAnthropometrics,
    pedal_stack_height: float = 11.0,
) -> PoseMetrics:
    metrics, _ = solve_pose_2d_full(bike_points, rider, pedal_stack_height)
    return metrics
