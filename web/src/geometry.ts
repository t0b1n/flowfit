import { getSizeData } from "./frameCatalog";
import type {
  BikeSketch,
  ComponentDeltas,
  Components,
  ContactPoint,
  FitWarning,
  IdealContacts,
  MannequinSketch,
  RiderFit,
  SeatpostRecommendation,
} from "./types";
import type { Geometry3DPoint, Geometry3DEdge } from "./bike3d";
import { FrameGeometry } from "./frameCatalog";

export const DEFAULT_TYRE_SIZE = 28;

export const DEFAULT_COMPONENTS: Components = {
  crank_length: 165,
  cleat_setback: 0,
  saddle_rail_length: 80,
  saddle_clamp_offset: 700,
  stem_length: 120,
  stem_angle_deg: -6,
  spacer_stack: 10,
  bar_reach: 80,
  bar_drop: 0,
  hood_reach_offset: 24.6,
  hood_drop_offset: 0,
  bar_width: 370,
  hood_width: null,
  stance_width: null,
  saddle_stack: 55,
  seatpost_offset: 0,
  saddle_rail_offset: 0,
  pedal_stack_height: 12,
};

export const DEFAULT_RIDER = {
  height: 1800,
  thigh_length: 430,
  shank_length: 430,
  torso_length: 600,
  upper_arm_length: 320,
  forearm_length: 280,
  foot_length: 290,
  shoulder_width: 400,
  hip_width: null as null,
  stance_width: null as null,
  flexibility: 1,
};

export const DEFAULT_RIDER_FIT: RiderFit = {
  height: 1760,
  inseam: 860, // floor-to-crotch inseam, mm
  targetKneeFlexDeg: 10,
};

export const DEFAULT_TARGETS = {
  saddle: { x: 0, y: 700 },
  hoods: { x: 430, y: 610 },
  cleat: { x: 0, y: -172.5 },
};

/** Distance (along seat tube) of the visible offset/bend section of the seatpost */
const SEATPOST_BEND_LENGTH = 40;

export const MANNEQUIN_PRESETS = {
  endurance: { trunkAngleDeg: 55, forearmHorizontalBias: 0.2, elbowBarHeightBias: 0.1 },
  race: { trunkAngleDeg: 33, forearmHorizontalBias: 1.1, elbowBarHeightBias: 1.3 },
  fast: { trunkAngleDeg: 43, forearmHorizontalBias: 0.65, elbowBarHeightBias: 0.8 },
} as const;

export type MannequinPresetKey = keyof typeof MANNEQUIN_PRESETS;

export const radiansFromDegrees = (deg: number) => (deg * Math.PI) / 180;

export type BodyMeasurements = {
  shoulderWidth: number;
  torsoLength: number;
  upperArmLength: number;
  forearmLength: number;
  /** Distance from ischial tuberosity (saddle contact) to hip joint centre (femoral head).
   *  Anatomically: ~90–100 mm in most adults. Affects saddle height and leg kinematics. */
  hipJointOffset: number;
  /** Shoe/foot length in mm. Derived from EU shoe size; only affects visual rendering. */
  footLength: number;
};

export const buildRider = (fit: RiderFit, body?: Partial<BodyMeasurements>) => {
  const heightScale = fit.height / 1800;
  return {
    ...DEFAULT_RIDER,
    height: fit.height,
    thigh_length: fit.inseam * 0.53,
    shank_length: fit.inseam * 0.47,
    torso_length: body?.torsoLength ?? DEFAULT_RIDER.torso_length * heightScale,
    upper_arm_length: body?.upperArmLength ?? DEFAULT_RIDER.upper_arm_length * heightScale,
    forearm_length: body?.forearmLength ?? DEFAULT_RIDER.forearm_length * heightScale,
    foot_length: body?.footLength ?? DEFAULT_RIDER.foot_length * heightScale,
    shoulder_width: body?.shoulderWidth ?? DEFAULT_RIDER.shoulder_width * heightScale,
    hip_joint_offset: body?.hipJointOffset ?? 95,
  };
};

export const withTyreSize = (frame: FrameGeometry, tyreSizeMm: number): FrameGeometry => ({
  ...frame,
  wheel_radius: frame.wheel_radius - DEFAULT_TYRE_SIZE + tyreSizeMm,
});

export const deriveSaddleTarget = (
  frame: FrameGeometry,
  components: Components,
  saddleHeightFromBb: number,
  referenceCrankLength: number
) => {
  const seatAngle = radiansFromDegrees(frame.seat_angle_deg);
  const effectiveSaddleHeight = saddleHeightFromBb + (components.crank_length - referenceCrankLength);
  return {
    x: -Math.cos(seatAngle) * effectiveSaddleHeight,
    y: Math.sin(seatAngle) * effectiveSaddleHeight,
    effectiveSaddleHeight,
  };
};

export const estimateSeatTubeTopDistance = (frame: FrameGeometry) => {
  if (frame.seat_tube_ct != null) return frame.seat_tube_ct;
  const seatAngle = radiansFromDegrees(frame.seat_angle_deg);
  const seatTubeTopY = frame.stack * 0.84;
  return seatTubeTopY / Math.sin(seatAngle);
};

export const distanceBetweenPoints = (a: ContactPoint, b: ContactPoint) =>
  Math.hypot(b.x - a.x, b.y - a.y);

export const exposedSeatpostLength = (bike: Pick<BikeSketch, "seatTubeTop" | "seatpostTop">) =>
  distanceBetweenPoints(bike.seatTubeTop, bike.seatpostTop);

const pointAlongSeatTube = (frame: FrameGeometry, distance: number): ContactPoint => {
  const seatAngle = radiansFromDegrees(frame.seat_angle_deg);
  return {
    x: -Math.cos(seatAngle) * distance,
    y: Math.sin(seatAngle) * distance,
  };
};

const seatTubeDistanceForX = (frame: FrameGeometry, x: number): number | null => {
  const seatAngle = radiansFromDegrees(frame.seat_angle_deg);
  const cosSeat = Math.cos(seatAngle);
  if (Math.abs(cosSeat) < 1e-6) return null;
  return -x / cosSeat;
};

export const circleIntersections = (
  a: ContactPoint,
  b: ContactPoint,
  radiusA: number,
  radiusB: number,
  preferUpper: boolean
): [ContactPoint, ContactPoint] => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const distance = Math.max(Math.hypot(dx, dy), 1e-6);
  const clampedDistance = Math.min(distance, radiusA + radiusB - 1e-6);
  const baseDistance = (radiusA ** 2 - radiusB ** 2 + clampedDistance ** 2) / (2 * clampedDistance);
  const height = Math.sqrt(Math.max(radiusA ** 2 - baseDistance ** 2, 0));
  const baseX = a.x + (baseDistance * dx) / clampedDistance;
  const baseY = a.y + (baseDistance * dy) / clampedDistance;
  const offsetX = (-dy * height) / clampedDistance;
  const offsetY = (dx * height) / clampedDistance;
  const p1 = { x: baseX + offsetX, y: baseY + offsetY };
  const p2 = { x: baseX - offsetX, y: baseY - offsetY };
  return preferUpper ? (p1.y > p2.y ? [p1, p2] : [p2, p1]) : p1.y < p2.y ? [p1, p2] : [p2, p1];
};

export const buildMannequin = (
  bike: BikeSketch,
  rider: ReturnType<typeof buildRider>,
  barWidth: number = 0,
  pedalStackHeight: number = 0,
  targetTrunkAngleDeg?: number
): MannequinSketch => {
  // The ischial tuberosity (sit bones) contacts the saddle; the hip joint centre
  // (femoral head) is hip_joint_offset mm above, where the femur actually rotates.
  const saddleContact = bike.saddle;
  const hipJoint: ContactPoint = {
    x: saddleContact.x,
    y: saddleContact.y + rider.hip_joint_offset,
  };

  const ankle = { x: bike.cleat.x, y: bike.cleat.y + pedalStackHeight };
  const [knee] = circleIntersections(saddleContact, ankle, rider.thigh_length, rider.shank_length, true);

  const targetHands = bike.hoods;

  let shoulder: ContactPoint;
  let trunkAngle: number;

  if (targetTrunkAngleDeg !== undefined) {
    // Forward kinematics: place shoulder from trunk angle slider
    trunkAngle = radiansFromDegrees(targetTrunkAngleDeg);
    shoulder = {
      x: hipJoint.x + Math.cos(trunkAngle) * rider.torso_length,
      y: hipJoint.y + Math.sin(trunkAngle) * rider.torso_length,
    };
  } else {
    // Backward compatible: closed-chain IK from hip→hoods
    const armLengthFull = rider.upper_arm_length + rider.forearm_length - 0.1;
    const [ikShoulder] = circleIntersections(hipJoint, targetHands, rider.torso_length, armLengthFull, true);
    shoulder = ikShoulder;
    trunkAngle = Math.atan2(shoulder.y - hipJoint.y, shoulder.x - hipJoint.x);
  }

  // Each hood is barWidth/2 laterally off the centreline. Project arm segments
  // into the sagittal plane by distributing the lateral offset proportionally.
  const lateralOffset = barWidth / 2;
  const totalArm = rider.upper_arm_length + rider.forearm_length;
  const upperArm2D = Math.sqrt(Math.max(0, rider.upper_arm_length ** 2 - (lateralOffset * rider.upper_arm_length / totalArm) ** 2));
  const forearm2D  = Math.sqrt(Math.max(0, rider.forearm_length  ** 2 - (lateralOffset * rider.forearm_length  / totalArm) ** 2));
  const maxReach2D = upperArm2D + forearm2D;
  const toHands = { x: targetHands.x - shoulder.x, y: targetHands.y - shoulder.y };
  const toHandsDist = Math.hypot(toHands.x, toHands.y);
  const hands: ContactPoint = (toHandsDist > maxReach2D && toHandsDist > 1e-6)
    ? {
        x: shoulder.x + (toHands.x / toHandsDist) * maxReach2D,
        y: shoulder.y + (toHands.y / toHandsDist) * maxReach2D,
      }
    : targetHands;

  const [elbowCandidateA, elbowCandidateB] = circleIntersections(
    shoulder,
    hands,
    upperArm2D,
    forearm2D,
    false
  );
  // Pick the elbow on the same side of the shoulder→hands line as the BB (0, 0).
  const sdx = hands.x - shoulder.x;
  const sdy = hands.y - shoulder.y;
  const bbSide = sdx * (0 - shoulder.y) - sdy * (0 - shoulder.x);
  const sideA  = sdx * (elbowCandidateA.y - shoulder.y) - sdy * (elbowCandidateA.x - shoulder.x);
  const elbow =
    Math.abs(bbSide) < 1e-4 || Math.sign(sideA) === Math.sign(bbSide)
      ? elbowCandidateA
      : elbowCandidateB;

  // Head direction: starts at ~55° from horizontal when trunk is flat (aero),
  // decreasing neckAngle toward 0° as trunk rises to vertical (upright).
  // Formula: neckAngle = 55° − 0.6 × trunkAngle → head_direction ≈ 55° + 0.4 × trunkAngle
  const neckAngle = (55 * Math.PI) / 180 - 0.6 * Math.max(trunkAngle, 0);
  const neckLength = 185 * rider.height / 1800;
  const head = {
    x: shoulder.x + Math.cos(trunkAngle + neckAngle) * neckLength,
    y: shoulder.y + Math.sin(trunkAngle + neckAngle) * neckLength,
  };
  return { hip: saddleContact, knee, ankle, shoulder, elbow, hands, head };
};

export type FrontalMannequin = {
  ankleL: ContactPoint; ankleR: ContactPoint;
  kneeL: ContactPoint;  kneeR: ContactPoint;
  hipL: ContactPoint;   hipR: ContactPoint;
  shoulderL: ContactPoint; shoulderR: ContactPoint;
  elbowL: ContactPoint; elbowR: ContactPoint;
  handsL: ContactPoint; handsR: ContactPoint;
  head: ContactPoint;
};

export const buildFrontalMannequin = (
  mannequin: MannequinSketch,
  rider: ReturnType<typeof buildRider>,
  barWidth: number
): FrontalMannequin => {
  const halfBar = barWidth / 2;
  const halfShoulder = rider.shoulder_width / 2;
  const halfStance = halfShoulder * 0.72;
  const totalArm = rider.upper_arm_length + rider.forearm_length;
  const halfElbow = halfShoulder + (halfBar - halfShoulder) * (rider.upper_arm_length / totalArm);

  const mkLR = (lateral: number, y: number) => ({
    L: { x: -lateral, y },
    R: { x: lateral, y },
  });

  const ankle    = mkLR(halfStance,        mannequin.ankle.y);
  const knee     = mkLR(halfStance * 0.95, mannequin.knee.y);
  const hip      = mkLR(halfStance * 0.8,  mannequin.hip.y);
  const shoulder = mkLR(halfShoulder,      mannequin.shoulder.y);
  const elbow    = mkLR(halfElbow,         mannequin.elbow.y);
  const hands    = mkLR(halfBar,           mannequin.hands.y);

  return {
    ankleL: ankle.L,    ankleR: ankle.R,
    kneeL:  knee.L,     kneeR:  knee.R,
    hipL:   hip.L,      hipR:   hip.R,
    shoulderL: shoulder.L, shoulderR: shoulder.R,
    elbowL: elbow.L,    elbowR: elbow.R,
    handsL: hands.L,    handsR: hands.R,
    head: { x: 0, y: mannequin.head.y },
  };
};

export const angleAtPoint = (a: ContactPoint, vertex: ContactPoint, c: ContactPoint) => {
  const va = { x: a.x - vertex.x, y: a.y - vertex.y };
  const vc = { x: c.x - vertex.x, y: c.y - vertex.y };
  const dot = va.x * vc.x + va.y * vc.y;
  const mag = Math.max(Math.hypot(va.x, va.y) * Math.hypot(vc.x, vc.y), 1e-6);
  const cosTheta = Math.min(1, Math.max(-1, dot / mag));
  return (Math.acos(cosTheta) * 180) / Math.PI;
};

export const buildSetup = (
  frame: FrameGeometry,
  components: Components,
  targets: typeof DEFAULT_TARGETS,
  rider: ReturnType<typeof buildRider>
) => ({
  frame,
  components,
  target_contact_points: targets,
  rider,
  preset: {
    name: "Endurance",
    trunk_angle: { min_deg: 50, max_deg: 60, weight: 1 },
    hip_angle: { min_deg: 95, max_deg: 105, weight: 1 },
    shoulder_flexion: { min_deg: 70, max_deg: 90, weight: 1 },
    elbow_flexion: { min_deg: 10, max_deg: 25, weight: 0.5 },
    knee_extension: { min_deg: 140, max_deg: 150, weight: 1 },
    shoulder_abduction: null,
  },
  schema_version: "0.1.0",
});

export const synthesizeBike = (
  sizeData: ReturnType<typeof getSizeData>,
  frame: FrameGeometry,
  components: Components
): BikeSketch => {
  const bb = { x: 0, y: 0 };
  const axleY = frame.bb_drop;
  const rearAxle = {
    x: -Math.sqrt(Math.max(frame.chainstay_length ** 2 - axleY ** 2, 0)),
    y: axleY,
  };
  const seatAngle = radiansFromDegrees(frame.seat_angle_deg);
  const headAngle = radiansFromDegrees(frame.head_angle_deg);
  const headAxis = { x: Math.cos(headAngle), y: -Math.sin(headAngle) };
  const forkOffsetDirection = { x: Math.sin(headAngle), y: Math.cos(headAngle) };
  const wheelbase =
    sizeData.wheelbase ?? (sizeData.front_center ? sizeData.front_center - rearAxle.x : undefined);

  const frontAxle = {
    x: wheelbase
      ? rearAxle.x + wheelbase
      : rearAxle.x + frame.fork_offset + frame.wheel_radius * 2,
    y: axleY,
  };
  const headTubeTop = { x: frame.reach, y: frame.stack };
  const headTubeBottom = frame.head_tube != null
    ? {
        x: headTubeTop.x + headAxis.x * frame.head_tube,
        y: headTubeTop.y + headAxis.y * frame.head_tube,
      }
    : {
        x: frontAxle.x - headAxis.x * frame.fork_length - forkOffsetDirection.x * frame.fork_offset,
        y: frontAxle.y - headAxis.y * frame.fork_length - forkOffsetDirection.y * frame.fork_offset,
      };
  const seatTubeTopDistance = estimateSeatTubeTopDistance(frame);
  const seatTubeTop = pointAlongSeatTube(frame, seatTubeTopDistance);
  const seatClusterDistance = (() => {
    if (sizeData.top_tube_effective == null) return seatTubeTopDistance;
    const distance = seatTubeDistanceForX(frame, headTubeTop.x - sizeData.top_tube_effective);
    if (distance == null) return seatTubeTopDistance;
    return Math.max(0, Math.min(seatTubeTopDistance, distance));
  })();
  const seatCluster = pointAlongSeatTube(frame, seatClusterDistance);

  const saddleClamp = {
    x: -Math.cos(seatAngle) * components.saddle_clamp_offset - components.seatpost_offset,
    y: Math.sin(seatAngle) * components.saddle_clamp_offset,
  };
  // Seatpost top is at the rail clamp position (no head extension)
  const seatpostTop = { ...saddleClamp };
  const bendDist = Math.max(0, components.saddle_clamp_offset - SEATPOST_BEND_LENGTH);
  const seatpostBend = {
    x: -Math.cos(seatAngle) * bendDist,
    y: Math.sin(seatAngle) * bendDist,
  };
  const saddle = {
    x: saddleClamp.x + components.saddle_rail_offset,
    y: saddleClamp.y + components.saddle_stack,
  };
  const crankEnd = {
    x: -components.cleat_setback,
    y: -components.crank_length,
  };
  const cleat = { x: crankEnd.x, y: crankEnd.y };

  const steererTop = { x: headTubeTop.x, y: headTubeTop.y + components.spacer_stack };
  const stemAngle = radiansFromDegrees(components.stem_angle_deg);
  const barClamp = {
    x: steererTop.x + Math.cos(stemAngle) * components.stem_length,
    y: steererTop.y + Math.sin(stemAngle) * components.stem_length,
  };
  const hoodAngle = radiansFromDegrees(Math.max(8, components.stem_angle_deg + 6));
  const hoodLength = components.bar_reach + components.hood_reach_offset;
  const hoods = {
    x: barClamp.x + Math.cos(hoodAngle) * hoodLength,
    y: barClamp.y + Math.sin(hoodAngle) * hoodLength + components.hood_drop_offset,
  };

  return {
    bb,
    rearAxle,
    frontAxle,
    seatCluster,
    seatTubeTop,
    headTubeBottom,
    headTubeTop,
    saddle,
    saddleClamp,
    seatpostTop,
    seatpostBend,
    cleat,
    crankEnd,
    steererTop,
    barClamp,
    hoods,
  };
};

export const boundsForBikes = (
  bikes: BikeSketch[],
  targets: typeof DEFAULT_TARGETS,
  wheelRadius: number
) => {
  const points = bikes.flatMap((bike) => [
    bike.bb,
    bike.rearAxle,
    bike.frontAxle,
    bike.seatCluster,
    bike.seatTubeTop,
    bike.headTubeBottom,
    bike.headTubeTop,
    bike.saddle,
    bike.seatpostTop,
    bike.cleat,
    bike.crankEnd,
    bike.steererTop,
    bike.barClamp,
    bike.hoods,
    targets.saddle,
    targets.hoods,
    targets.cleat,
  ]);
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    minX: Math.min(...xs) - wheelRadius - 80,
    maxX: Math.max(...xs) + wheelRadius + 80,
    minY: Math.min(...ys) - wheelRadius - 90,
    maxY: Math.max(...ys) + 120,
  };
};

export const expandBoundsForMannequins = (
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
  mannequins: Array<MannequinSketch | null>
) => {
  const points = mannequins
    .filter((m): m is MannequinSketch => m !== null)
    .flatMap((m) => [m.hip, m.knee, m.ankle, m.shoulder, m.elbow, m.hands, m.head]);

  if (!points.length) return bounds;

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    minX: Math.min(bounds.minX, Math.min(...xs) - 80),
    maxX: Math.max(bounds.maxX, Math.max(...xs) + 80),
    minY: Math.min(bounds.minY, Math.min(...ys) - 120),
    maxY: Math.max(bounds.maxY, Math.max(...ys) + 120),
  };
};

// ── Mode 1: Fit Builder helpers ──────────────────────────────────────────────

/**
 * Find the saddle_clamp_offset (along the seat tube) that gives the target
 * knee extension angle. Uses bisection on the circle-intersection IK.
 */
export const idealContactsFromRider = (
  rider: ReturnType<typeof buildRider>,
  targetKneeExtensionDeg: number,
  targetTrunkAngleDeg: number,
  crankLength: number,
  seatAngleDeg: number,
  barWidth: number = 0,
  pedalStackHeight: number = 0,
  saddleStack: number = 0
): IdealContacts => {
  const seatAngle = radiansFromDegrees(seatAngleDeg);
  const cleat: ContactPoint = { x: 0, y: -crankLength };
  // Ankle IK point is above the pedal axle by the foot stack
  const ankle: ContactPoint = { x: 0, y: -crankLength + pedalStackHeight };

  // Bisect saddle_clamp_offset so that knee extension (measured at the hip joint
  // centre, not the saddle surface) matches the target.
  // Cap at 179.9° — 180° is physically unachievable (circleIntersections always
  // returns 180°−ε when the leg is over-extended), which causes the bisection to
  // diverge to the upper bound instead of converging.
  const clampedTargetExt = Math.min(targetKneeExtensionDeg, 179.9);
  let lo = 400;
  let hi = 950;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    const saddleMid: ContactPoint = {
      x: -Math.cos(seatAngle) * mid,
      y: Math.sin(seatAngle) * mid + saddleStack,
    };
    const [knee] = circleIntersections(saddleMid, ankle, rider.thigh_length, rider.shank_length, true);
    const ext = angleAtPoint(saddleMid, knee, ankle);
    if (ext < clampedTargetExt) {
      lo = mid; // saddle too low → raise
    } else {
      hi = mid; // saddle too high → lower
    }
  }

  const saddleOffset = (lo + hi) / 2;
  const saddle: ContactPoint = {
    x: -Math.cos(seatAngle) * saddleOffset,
    y: Math.sin(seatAngle) * saddleOffset + saddleStack,
  };
  const hipJoint: ContactPoint = {
    x: saddle.x,
    y: saddle.y + rider.hip_joint_offset,
  };

  // Shoulder from trunk angle and torso length, measured from hip joint centre.
  const trunkRad = radiansFromDegrees(targetTrunkAngleDeg);
  const shoulder: ContactPoint = {
    x: hipJoint.x + Math.cos(trunkRad) * rider.torso_length,
    y: hipJoint.y + Math.sin(trunkRad) * rider.torso_length,
  };

  // Ideal hoods: extend arm from shoulder along perpendicular-to-trunk direction
  // at a reach distance computed from a 15° elbow flexion target.
  const targetElbowInteriorRad = radiansFromDegrees(165); // 180 - 15° flex
  const armReach3D = Math.sqrt(
    rider.upper_arm_length ** 2 +
      rider.forearm_length ** 2 -
      2 * rider.upper_arm_length * rider.forearm_length * Math.cos(targetElbowInteriorRad)
  );
  // Each hood is barWidth/2 laterally off the centreline; reduce to side-view reach.
  const armReach = Math.sqrt(Math.max(0, armReach3D ** 2 - (barWidth / 2) ** 2));
  // Arm direction: perpendicular to trunk pointing forward-down
  const armAngle = trunkRad - Math.PI / 2;
  const hoods: ContactPoint = {
    x: shoulder.x + Math.cos(armAngle) * armReach,
    y: shoulder.y + Math.sin(armAngle) * armReach,
  };

  return { saddle, hoods, cleat };
};

/** Severity thresholds in mm */
const FIT_WARN_OK = 15;
const FIT_WARN_BAD = 30;

export const fitWarnings = (ideal: IdealContacts, actual: BikeSketch): FitWarning[] => {
  const pairs: Array<["saddle" | "hoods" | "cleat", ContactPoint, ContactPoint]> = [
    ["saddle", ideal.saddle, actual.saddle],
    ["hoods", ideal.hoods, actual.hoods],
    ["cleat", ideal.cleat, actual.cleat],
  ];

  return pairs.map(([contact, idealPt, actualPt]) => {
    const deltaX = actualPt.x - idealPt.x;
    const deltaY = actualPt.y - idealPt.y;
    const distance = Math.hypot(deltaX, deltaY);
    const severity: "ok" | "warning" | "bad" =
      distance < FIT_WARN_OK ? "ok" : distance < FIT_WARN_BAD ? "warning" : "bad";
    return { contact, deltaX, deltaY, distance, severity };
  });
};

/** Delta of solver-adjustable components. */
export const computeComponentDeltas = (ref: Components, target: Components): ComponentDeltas => ({
  saddle_clamp_offset: target.saddle_clamp_offset - ref.saddle_clamp_offset,
  spacer_stack: target.spacer_stack - ref.spacer_stack,
  stem_length: target.stem_length - ref.stem_length,
  stem_angle_deg: target.stem_angle_deg - ref.stem_angle_deg,
});

/** Maximum saddle rail height (from BB) for most integrated seat mast systems */
export const ISP_MAX_BB_TO_RAIL_MM = 680;
/** Minimum lateral offset (saddleClamp.x − saddle.x) that requires a setback seatpost */
export const SETBACK_THRESHOLD_MM = 15;

export const seatpostRecommendation = (
  saddle: ContactPoint,
  saddleClamp: ContactPoint,
): SeatpostRecommendation => {
  const bbToRailDistance = Math.hypot(saddleClamp.x, saddleClamp.y);
  const requiredSetback = saddleClamp.x - saddle.x;

  if (bbToRailDistance > ISP_MAX_BB_TO_RAIL_MM) {
    return {
      bbToRailDistance,
      requiredSetback,
      type: "integrated-only",
      note: `Rail distance ${Math.round(bbToRailDistance)} mm exceeds typical ISP range`,
    };
  }
  if (requiredSetback > SETBACK_THRESHOLD_MM) {
    return {
      bbToRailDistance,
      requiredSetback,
      type: "setback",
      note: `~${Math.round(requiredSetback)} mm setback required`,
    };
  }
  return {
    bbToRailDistance,
    requiredSetback,
    type: "straight",
    note: "Inline / straight seatpost",
  };
};

export const BAR_REACH_MIN_MM = 40;
export const BAR_REACH_MAX_MM = 130;

/**
 * Given a target hoods position and the current bar clamp location, compute
 * the bar reach needed to position the hoods there.
 *
 * Returns null if the result is outside [BAR_REACH_MIN_MM, BAR_REACH_MAX_MM].
 *
 * Approximation: ignores hood_drop_offset (usually 0). Error is typically <2mm.
 */
export const barReachNeeded = (
  targetHoods: ContactPoint,
  barClamp: ContactPoint,
  hoodReachOffset: number
): number | null => {
  const hoodLength = Math.hypot(targetHoods.x - barClamp.x, targetHoods.y - barClamp.y);
  const reach = hoodLength - hoodReachOffset;
  if (reach < BAR_REACH_MIN_MM || reach > BAR_REACH_MAX_MM) return null;
  return reach;
};

// ── 3D bilateral expansion of 2D mannequin ──────────────────────────────────

const _DEFAULT_STANCE_WIDTH = 155;
const _DEFAULT_HIP_WIDTH = 200;

const _LEG_EDGES: [string, string][] = [
  ["cleat_l", "ankle_l"], ["ankle_l", "knee_l"], ["knee_l", "hip_l"],
  ["cleat_r", "ankle_r"], ["ankle_r", "knee_r"], ["knee_r", "hip_r"],
  ["hip_l", "hip_r"],
];
const _TORSO_EDGES: [string, string][] = [
  ["hip_center", "shoulder_center"],
];
const _ARM_EDGES: [string, string][] = [
  ["shoulder_l", "elbow_l"], ["elbow_l", "wrist_l"],
  ["shoulder_r", "elbow_r"], ["elbow_r", "wrist_r"],
  ["shoulder_l", "shoulder_r"],
];

/**
 * Bilaterally expand a 2D sagittal-plane mannequin into 3D points and edges.
 * Ports the logic from bikegeo_core/mannequin3d.py.
 */
export function buildMannequin3DPoints(
  mannequin: MannequinSketch,
  rider: ReturnType<typeof buildRider>,
  components: Components,
): { points: Geometry3DPoint[]; edges: Geometry3DEdge[] } {
  const hoodW = components.hood_width ?? components.bar_width;
  const stanceW = components.stance_width ?? _DEFAULT_STANCE_WIDTH;
  const hipW = rider.hip_width ?? _DEFAULT_HIP_WIDTH;
  const shoulderW = rider.shoulder_width;

  const halfStance = stanceW / 2;
  const halfHip = hipW / 2;
  const halfHood = hoodW / 2;
  const halfShoulder = shoulderW / 2;

  const points: Geometry3DPoint[] = [];
  const p = (name: string, x: number, y: number, z: number) => {
    points.push({ name, pos: [x, y, z], group: "mannequin" });
  };

  // Legs at ±half_stance
  p("cleat_l", mannequin.ankle.x, mannequin.ankle.y - (components.pedal_stack_height || 0), +halfStance);
  p("cleat_r", mannequin.ankle.x, mannequin.ankle.y - (components.pedal_stack_height || 0), -halfStance);
  p("ankle_l", mannequin.ankle.x, mannequin.ankle.y, +halfStance);
  p("ankle_r", mannequin.ankle.x, mannequin.ankle.y, -halfStance);
  p("knee_l", mannequin.knee.x, mannequin.knee.y, +halfStance);
  p("knee_r", mannequin.knee.x, mannequin.knee.y, -halfStance);

  // Hips at ±half_hip + centerline
  p("hip_l", mannequin.hip.x, mannequin.hip.y, +halfHip);
  p("hip_r", mannequin.hip.x, mannequin.hip.y, -halfHip);
  p("hip_center", mannequin.hip.x, mannequin.hip.y, 0);

  // Shoulders at ±half_shoulder + centerline
  p("shoulder_l", mannequin.shoulder.x, mannequin.shoulder.y, +halfShoulder);
  p("shoulder_r", mannequin.shoulder.x, mannequin.shoulder.y, -halfShoulder);
  p("shoulder_center", mannequin.shoulder.x, mannequin.shoulder.y, 0);

  // Elbows at ±half_shoulder
  p("elbow_l", mannequin.elbow.x, mannequin.elbow.y, +halfShoulder);
  p("elbow_r", mannequin.elbow.x, mannequin.elbow.y, -halfShoulder);

  // Wrists at ±half_hood
  p("wrist_l", mannequin.hands.x, mannequin.hands.y, +halfHood);
  p("wrist_r", mannequin.hands.x, mannequin.hands.y, -halfHood);

  const edges: Geometry3DEdge[] = [];
  for (const [a, b] of _LEG_EDGES) {
    edges.push({ a, b, group: "mannequin_leg" });
  }
  for (const [a, b] of _TORSO_EDGES) {
    edges.push({ a, b, group: "mannequin_torso" });
  }
  for (const [a, b] of _ARM_EDGES) {
    edges.push({ a, b, group: "mannequin_arm" });
  }

  return { points, edges };
}
