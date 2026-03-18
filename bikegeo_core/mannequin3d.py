from __future__ import annotations

from .coords import Vec3
from .geometry import BikePoints
from .mannequin2d import solve_pose_2d_full
from .models import Components, RiderAnthropometrics

_DEFAULT_STANCE_WIDTH = 155.0
_DEFAULT_HIP_WIDTH = 200.0


def solve_pose_3d(
    bike_points: BikePoints,
    components: Components,
    rider: RiderAnthropometrics,
) -> dict[str, Vec3]:
    """
    Expand a 2D sagittal-plane fit into 3D using bilateral Z-expansion.

    Coordinate system (origin = bottom bracket, units mm):
        X — forward (travel direction)
        Y — up
        Z — lateral (positive = rider's left)
    """
    _, joints = solve_pose_2d_full(bike_points, rider)

    hood_w = components.hood_width if components.hood_width is not None else components.bar_width
    stance_w = components.stance_width if components.stance_width is not None else _DEFAULT_STANCE_WIDTH
    hip_w = rider.hip_width if rider.hip_width is not None else _DEFAULT_HIP_WIDTH
    shoulder_w = rider.shoulder_width

    half_stance = stance_w / 2.0
    half_hip = hip_w / 2.0
    half_hood = hood_w / 2.0
    half_bar = components.bar_width / 2.0
    half_shoulder = shoulder_w / 2.0

    def _c(vec2, z: float = 0.0) -> Vec3:
        return Vec3(vec2.x, vec2.y, z)

    pts: dict[str, Vec3] = {}

    # Centerline frame points
    pts["bb"] = Vec3(bike_points.bb.x, bike_points.bb.y, 0.0)
    pts["rear_axle"] = Vec3(bike_points.rear_axle.x, bike_points.rear_axle.y, 0.0)
    pts["front_axle"] = Vec3(bike_points.front_axle.x, bike_points.front_axle.y, 0.0)
    pts["saddle"] = Vec3(bike_points.saddle.x, bike_points.saddle.y, 0.0)
    pts["steerer_top"] = Vec3(bike_points.steerer_top.x, bike_points.steerer_top.y, 0.0)
    pts["bar_clamp"] = Vec3(bike_points.bar_clamp.x, bike_points.bar_clamp.y, 0.0)

    # Bilateral hoods
    pts["hoods_l"] = Vec3(bike_points.hoods.x, bike_points.hoods.y, +half_hood)
    pts["hoods_r"] = Vec3(bike_points.hoods.x, bike_points.hoods.y, -half_hood)

    # Bilateral cleats / lower leg
    pts["cleat_l"] = Vec3(bike_points.cleat.x, bike_points.cleat.y, +half_stance)
    pts["cleat_r"] = Vec3(bike_points.cleat.x, bike_points.cleat.y, -half_stance)
    pts["ankle_l"] = Vec3(joints.ankle.x, joints.ankle.y, +half_stance)
    pts["ankle_r"] = Vec3(joints.ankle.x, joints.ankle.y, -half_stance)
    pts["knee_l"] = Vec3(joints.knee.x, joints.knee.y, +half_stance)
    pts["knee_r"] = Vec3(joints.knee.x, joints.knee.y, -half_stance)

    # Bilateral hips
    pts["hip_l"] = Vec3(joints.hip.x, joints.hip.y, +half_hip)
    pts["hip_r"] = Vec3(joints.hip.x, joints.hip.y, -half_hip)
    pts["hip_center"] = Vec3(joints.hip.x, joints.hip.y, 0.0)

    # Bilateral shoulders
    pts["shoulder_l"] = Vec3(joints.shoulder.x, joints.shoulder.y, +half_shoulder)
    pts["shoulder_r"] = Vec3(joints.shoulder.x, joints.shoulder.y, -half_shoulder)
    pts["shoulder_center"] = Vec3(joints.shoulder.x, joints.shoulder.y, 0.0)

    # Bilateral arms — elbow follows shoulder width, wrist at hood width
    pts["elbow_l"] = Vec3(joints.elbow.x, joints.elbow.y, +half_shoulder)
    pts["elbow_r"] = Vec3(joints.elbow.x, joints.elbow.y, -half_shoulder)
    pts["wrist_l"] = Vec3(joints.wrist.x, joints.wrist.y, +half_hood)
    pts["wrist_r"] = Vec3(joints.wrist.x, joints.wrist.y, -half_hood)

    return pts
