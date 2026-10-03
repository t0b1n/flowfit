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
import type { Geometry3DPoint, Geometry3DEdge, Geometry3DResponse } from "./bike3d";
import { FrameGeometry } from "./frameCatalog";
import { buildCockpit, hoodContact } from "./cockpit";

export const DEFAULT_TYRE_SIZE = 28;

export const DEFAULT_COMPONENTS: Components = {
  crank_length: 165,
  cleat_setback: 0,
  saddle_rail_length: 80,
  saddle_clamp_offset: 700,
  stem_length: 120,
  stem_angle_deg: -6,
  spacer_stack: 10,
  stem_height: 40,
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
  weight: 75,  // kg — drives anatomical radius scaling
  // Knee flexion at max extension of the stroke: 35° is the middle of the
  // knee_extension band (140–150°), i.e. the dynamic 30–40° fitting range.
  targetKneeFlexDeg: 35,
};

export const DEFAULT_TARGETS = {
  saddle: { x: 0, y: 700 },
  hoods: { x: 430, y: 610 },
  cleat: { x: 0, y: -172.5 },
};

/** Distance (along seat tube) of the visible offset/bend section of the seatpost */
const SEATPOST_BEND_LENGTH = 40;

export const MANNEQUIN_PRESETS = {
  endurance: { trunkAngleDeg: 55, backBendDeg: 5, forearmHorizontalBias: 0.2, elbowBarHeightBias: 0.1 },
  race: { trunkAngleDeg: 33, backBendDeg: 12, forearmHorizontalBias: 1.1, elbowBarHeightBias: 1.3 },
  fast: { trunkAngleDeg: 43, backBendDeg: 8, forearmHorizontalBias: 0.65, elbowBarHeightBias: 0.8 },
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
  const hipOffset = body?.hipJointOffset ?? 95;
  // The IK chain runs from hip joint center (above the saddle by hipOffset) to
  // ankle. Inseam measures sit-bones-to-floor, so the articulating leg length
  // is inseam + hipOffset.
  const articulatingLeg = fit.inseam + hipOffset;
  return {
    ...DEFAULT_RIDER,
    height: fit.height,
    thigh_length: articulatingLeg * 0.53,
    shank_length: articulatingLeg * 0.47,
    torso_length: body?.torsoLength ?? DEFAULT_RIDER.torso_length * heightScale,
    upper_arm_length: body?.upperArmLength ?? DEFAULT_RIDER.upper_arm_length * heightScale,
    forearm_length: body?.forearmLength ?? DEFAULT_RIDER.forearm_length * heightScale,
    foot_length: body?.footLength ?? DEFAULT_RIDER.foot_length * heightScale,
    shoulder_width: body?.shoulderWidth ?? DEFAULT_RIDER.shoulder_width * heightScale,
    hip_joint_offset: hipOffset,
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

/** The palm drapes this far below the hood platform line (deg). */
export const HAND_DRAPE_DEG = 26;
/** Wrist-to-contact distance as a fraction of palm length (the contact is mid-palm). */
const HAND_WRIST_FRACTION = 0.62;

/**
 * Wrist angle (deg) in the sagittal plane: the hand's direction (wrist→hands) relative to the forearm (elbow→wrist).
 * Positive = extension (hand tipped up, back of the hand toward the forearm), negative = flexion.
 */
export const wristAngleDeg = (m: MannequinSketch): number => {
  const fa = Math.atan2(m.wrist.y - m.elbow.y, m.wrist.x - m.elbow.x);
  const ha = Math.atan2(m.hands.y - m.wrist.y, m.hands.x - m.wrist.x);
  let d = ((ha - fa) * 180) / Math.PI;
  while (d > 180) d -= 360;
  while (d <= -180) d += 360;
  return d;
};

/**
 * Two-bone leg IK from the hip joint to the pedal target (the IK "ankle": the
 * pedal spindle plus the shoe/pedal stack). The knee is the anterior solution.
 *
 * When the target is beyond thigh + shank the leg cannot stretch: it locks
 * straight along the hip→target line and the foot stops short of the pedal.
 * `pedalGapMm` is how far short (0 when the foot reaches).
 */
export const solveLeg = (
  hip: ContactPoint,
  target: ContactPoint,
  thigh: number,
  shank: number,
): { knee: ContactPoint; ankle: ContactPoint; pedalGapMm: number } => {
  const dx = target.x - hip.x;
  const dy = target.y - hip.y;
  const distance = Math.max(Math.hypot(dx, dy), 1e-6);
  const legLength = thigh + shank;
  if (distance >= legLength) {
    const ux = dx / distance;
    const uy = dy / distance;
    return {
      knee: { x: hip.x + ux * thigh, y: hip.y + uy * thigh },
      ankle: { x: hip.x + ux * legLength, y: hip.y + uy * legLength },
      pedalGapMm: distance - legLength,
    };
  }
  const [kneeA, kneeB] = circleIntersections(hip, target, thigh, shank, true);
  // Anterior side: with the chord running hip→ankle, a positive cross product places the knee forward.
  const crossA = dx * (kneeA.y - hip.y) - dy * (kneeA.x - hip.x);
  return { knee: crossA >= 0 ? kneeA : kneeB, ankle: target, pedalGapMm: 0 };
};

/** Interior knee angle (°) for a hip→ankle distance; 180 when the leg is straight or short of the pedal. */
const kneeAngleForDistance = (distance: number, thigh: number, shank: number) => {
  const cos = (thigh ** 2 + shank ** 2 - distance ** 2) / (2 * thigh * shank);
  return (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI;
};

/** Hip→ankle distance that gives an interior knee angle (°). */
const distanceForKneeAngle = (angleDeg: number, thigh: number, shank: number) =>
  Math.sqrt(thigh ** 2 + shank ** 2 - 2 * thigh * shank * Math.cos(radiansFromDegrees(angleDeg)));

export const buildMannequin = (
  bike: BikeSketch,
  rider: ReturnType<typeof buildRider>,
  barWidth: number = 0,
  pedalStackHeight: number = 0,
  targetTrunkAngleDeg?: number,
  backBendDeg: number = 0,
  /** hood platform pitch (deg): when given, the hand lies along the hood instead of continuing the forearm */
  hoodPitchDeg?: number,
): MannequinSketch => {
  // The ischial tuberosity (sit bones) contacts the saddle; the hip joint centre
  // (femoral head) is hip_joint_offset mm above, where the femur actually rotates.
  const saddleContact = bike.saddle;
  const hipJoint: ContactPoint = {
    x: saddleContact.x,
    y: saddleContact.y + rider.hip_joint_offset,
  };

  const pedalTarget = { x: bike.cleat.x, y: bike.cleat.y + pedalStackHeight };
  const { knee, ankle, pedalGapMm } = solveLeg(hipJoint, pedalTarget, rider.thigh_length, rider.shank_length);

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

  // Spine joint at 40% from hip toward shoulder (closer to hip = lumbar/thoracic split)
  const SPINE_FRACTION = 0.4;
  const spineJoint: ContactPoint = {
    x: hipJoint.x + (shoulder.x - hipJoint.x) * SPINE_FRACTION,
    y: hipJoint.y + (shoulder.y - hipJoint.y) * SPINE_FRACTION,
  };

  // Back bend: rotate upper torso (shoulder) around spine_joint hinge.
  // Positive backBendDeg = forward rounding (kyphosis), negative = arched (lordosis).
  if (backBendDeg !== 0) {
    const bendRad = radiansFromDegrees(-backBendDeg); // negate: positive bend = rotate shoulder down/forward
    const cos = Math.cos(bendRad);
    const sin = Math.sin(bendRad);
    const dx = shoulder.x - spineJoint.x;
    const dy = shoulder.y - spineJoint.y;
    shoulder = {
      x: spineJoint.x + dx * cos - dy * sin,
      y: spineJoint.y + dx * sin + dy * cos,
    };
    // Update trunk angle to reflect the bent posture
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
  const handGapMm = Math.max(0, toHandsDist - maxReach2D);
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

  // Wrist: positioned along elbow→hands vector at (forearm − palm_length) from elbow
  const palmLength = 0.055 * rider.height;
  const forearmNoPalm = Math.max(0, (rider.forearm_length - palmLength));
  const elbowToHandsDx = hands.x - elbow.x;
  const elbowToHandsDy = hands.y - elbow.y;
  const elbowToHandsDist = Math.max(Math.hypot(elbowToHandsDx, elbowToHandsDy), 1e-6);
  // Hands follow the hood: the palm lies along the hood platform, draped HAND_DRAPE_DEG below it, and the
  // wrist sits one palm length behind the contact. The elbow (and so every arm metric) is unchanged.
  const wrist: ContactPoint = hoodPitchDeg === undefined
    ? {
        x: elbow.x + (elbowToHandsDx / elbowToHandsDist) * forearmNoPalm,
        y: elbow.y + (elbowToHandsDy / elbowToHandsDist) * forearmNoPalm,
      }
    : {
        x: hands.x - Math.cos(radiansFromDegrees(hoodPitchDeg - HAND_DRAPE_DEG)) * palmLength * HAND_WRIST_FRACTION,
        y: hands.y - Math.sin(radiansFromDegrees(hoodPitchDeg - HAND_DRAPE_DEG)) * palmLength * HAND_WRIST_FRACTION,
      };

  // Head direction: use upper-torso angle (spine_joint → shoulder) for head orientation
  const upperTrunkAngle = Math.atan2(shoulder.y - spineJoint.y, shoulder.x - spineJoint.x);
  const neckAngle = (55 * Math.PI) / 180 - 0.6 * Math.max(upperTrunkAngle, 0);
  const neckLength = 185 * rider.height / 1800;
  const headDir = upperTrunkAngle + neckAngle;
  const head = {
    x: shoulder.x + Math.cos(headDir) * neckLength,
    y: shoulder.y + Math.sin(headDir) * neckLength,
  };
  // Neck base: 15% along shoulder→head vector
  const neckBase: ContactPoint = {
    x: shoulder.x + (head.x - shoulder.x) * 0.15,
    y: shoulder.y + (head.y - shoulder.y) * 0.15,
  };

  return { hip: hipJoint, knee, ankle, shoulder, elbow, wrist, hands, head, neckBase, spineJoint, pedalGapMm, handGapMm };
};

export type FrontalMannequin = {
  ankleR: ContactPoint; ankleL: ContactPoint;
  kneeR: ContactPoint;  kneeL: ContactPoint;
  hipR: ContactPoint;   hipL: ContactPoint;
  shoulderR: ContactPoint; shoulderL: ContactPoint;
  elbowR: ContactPoint; elbowL: ContactPoint;
  wristR: ContactPoint; wristL: ContactPoint;
  handsR: ContactPoint; handsL: ContactPoint;
  head: ContactPoint;
  neckBase: ContactPoint;
  spineJoint: ContactPoint;
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
  const palmLength = 0.055 * rider.height;
  const forearmNoPalmRatio = Math.max(0, (rider.forearm_length - palmLength)) / Math.max(rider.forearm_length, 1e-6);
  const halfWrist = halfElbow + (halfBar - halfElbow) * forearmNoPalmRatio;

  const mkLR = (lateral: number, y: number) => ({
    R: { x: -lateral, y }, // front view: the rider's right is on the viewer's left
    L: { x: lateral, y },
  });

  const ankle    = mkLR(halfStance,        mannequin.ankle.y);
  const knee     = mkLR(halfStance * 0.95, mannequin.knee.y);
  const hip      = mkLR(halfStance * 0.8,  mannequin.hip.y);
  const shoulder = mkLR(halfShoulder,      mannequin.shoulder.y);
  const elbow    = mkLR(halfElbow,         mannequin.elbow.y);
  const wrist    = mkLR(halfWrist,         mannequin.wrist.y);
  const hands    = mkLR(halfBar,           mannequin.hands.y);

  return {
    ankleR: ankle.R,    ankleL: ankle.L,
    kneeR:  knee.R,     kneeL:  knee.L,
    hipR:   hip.R,      hipL:   hip.L,
    shoulderR: shoulder.R, shoulderL: shoulder.L,
    elbowR: elbow.R,    elbowL: elbow.L,
    wristR: wrist.R,    wristL: wrist.L,
    handsR: hands.R,    handsL: hands.L,
    head: { x: 0, y: mannequin.head.y },
    neckBase: { x: 0, y: mannequin.neckBase.y },
    spineJoint: { x: 0, y: mannequin.spineJoint.y },
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

// ── Posture preset bands ──────────────────────────────────────────────────────
// Single source of truth: sent to the backend solver AND used by the in-scene
// analytics to color joint angles by band status.

export interface AngleBand {
  min_deg: number;
  max_deg: number;
  weight: number;
}

export interface PosturePreset {
  name: string;
  trunk_angle: AngleBand;
  hip_angle: AngleBand;
  shoulder_flexion: AngleBand;
  elbow_flexion: AngleBand;
  knee_extension: AngleBand;
  knee_flexion_tdc: AngleBand;
}

export const POSTURE_PRESET: PosturePreset = {
  name: "Endurance",
  trunk_angle: { min_deg: 50, max_deg: 60, weight: 1 },
  hip_angle: { min_deg: 95, max_deg: 105, weight: 1 },
  shoulder_flexion: { min_deg: 70, max_deg: 90, weight: 1 },
  elbow_flexion: { min_deg: 10, max_deg: 25, weight: 0.5 },
  knee_extension: { min_deg: 140, max_deg: 150, weight: 1 },
  knee_flexion_tdc: { min_deg: 100, max_deg: 115, weight: 0.5 },
};

export type BandStatus = "in" | "near" | "out";

/** "near" = inside the band but within 15% of its width of an edge, or outside by ≤3°. */
export const bandStatus = (value: number, band: AngleBand): BandStatus => {
  const width = band.max_deg - band.min_deg;
  const margin = width * 0.15;
  if (value >= band.min_deg && value <= band.max_deg) {
    return value < band.min_deg + margin || value > band.max_deg - margin ? "near" : "in";
  }
  return value >= band.min_deg - 3 && value <= band.max_deg + 3 ? "near" : "out";
};

// ── Pedal-stroke solver (client-side, powers the 3D pedaling animation) ──────
//
// Crank angle convention matches the backend: 0° = TDC, 90° = crank forward
// (3 o'clock, KOPS position), 180° = BDC. The lookup table stores the
// reference-leg pose per sample; the opposite leg reads the table at +180°.

export type LegPose = {
  spindle: ContactPoint;
  /** Shoe cleat; lifts off the spindle when the leg can't reach it (see pedalGapMm). */
  cleat: ContactPoint;
  ankle: ContactPoint;
  knee: ContactPoint;
};

export interface PedalStrokeLUT {
  samples: number;
  poses: LegPose[];
  kneeExtensionDeg: number[];
  /** Foot-to-pedal gap per sample (0 = foot on the pedal). */
  pedalGapMm: number[];
  /** Largest foot-to-pedal gap over the stroke; > 0 means the saddle is too high to reach the pedals. */
  maxPedalGapMm: number;
  kopsOffsetMm: number;
  kneeFlexionTdcDeg: number;
  kneeFlexionBdcDeg: number;
  /** Knee extension at the most extended point of the stroke (where fit targets are measured). */
  kneeExtensionMaxDeg: number;
  /** Sample index of kneeExtensionMaxDeg. */
  maxExtensionIndex: number;
  crankLength: number;
  hip: ContactPoint;
  /** Anatomical ankle-joint setback behind the pedal spindle (drawn geometry
   *  only — the IK solves from the spindle; see buildMannequin3DPoints). */
  ankleSetbackMm: number;
}

export function solvePedalStroke(
  hip: ContactPoint,
  bb: ContactPoint,
  crankLength: number,
  cleatSetback: number,
  pedalStackHeight: number,
  rider: ReturnType<typeof buildRider>,
  samples = 72,
): PedalStrokeLUT {
  const poses: LegPose[] = [];
  const kneeExtensionDeg: number[] = [];
  const pedalGapMm: number[] = [];

  for (let i = 0; i < samples; i++) {
    const theta = (i / samples) * 2 * Math.PI;
    const spindle = {
      x: bb.x + crankLength * Math.sin(theta),
      y: bb.y + crankLength * Math.cos(theta),
    };
    const target = { x: spindle.x - cleatSetback, y: spindle.y + pedalStackHeight };
    const leg = solveLeg(hip, target, rider.thigh_length, rider.shank_length);
    const cleat = { x: leg.ankle.x, y: leg.ankle.y - pedalStackHeight };

    poses.push({ spindle, cleat, ankle: leg.ankle, knee: leg.knee });
    kneeExtensionDeg.push(angleAtPoint(hip, leg.knee, leg.ankle));
    pedalGapMm.push(leg.pedalGapMm);
  }

  const quarter = Math.round(samples / 4);       // 90° — crank forward
  const half = Math.round(samples / 2);          // 180° — BDC
  // The most extended point is where the pedal is farthest from the hip (≈ 5 o'clock); fall back to the
  // largest gap when the leg is straight over a range of samples.
  let maxExtensionIndex = 0;
  for (let i = 1; i < samples; i++) {
    const better =
      kneeExtensionDeg[i] > kneeExtensionDeg[maxExtensionIndex] + 1e-9 ||
      (Math.abs(kneeExtensionDeg[i] - kneeExtensionDeg[maxExtensionIndex]) <= 1e-9 && pedalGapMm[i] > pedalGapMm[maxExtensionIndex]);
    if (better) maxExtensionIndex = i;
  }

  return {
    samples,
    poses,
    kneeExtensionDeg,
    pedalGapMm,
    maxPedalGapMm: Math.max(...pedalGapMm),
    kopsOffsetMm: poses[quarter].knee.x - poses[quarter].spindle.x,
    kneeFlexionTdcDeg: 180 - kneeExtensionDeg[0],
    kneeFlexionBdcDeg: 180 - kneeExtensionDeg[half],
    kneeExtensionMaxDeg: kneeExtensionDeg[maxExtensionIndex],
    maxExtensionIndex,
    crankLength,
    hip,
    ankleSetbackMm: rider.foot_length * 0.19 * (rider.height / 1800),
  };
}

const lerpPoint = (a: ContactPoint, b: ContactPoint, t: number): ContactPoint => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

/** Interpolated leg pose at an arbitrary crank angle (5° samples → sub-mm error). */
export function legPoseAt(lut: PedalStrokeLUT, angleDeg: number): LegPose {
  const a = ((angleDeg % 360) + 360) % 360;
  const f = (a / 360) * lut.samples;
  const i0 = Math.floor(f) % lut.samples;
  const i1 = (i0 + 1) % lut.samples;
  const t = f - Math.floor(f);
  const p0 = lut.poses[i0];
  const p1 = lut.poses[i1];
  return {
    spindle: lerpPoint(p0.spindle, p1.spindle, t),
    cleat: lerpPoint(p0.cleat, p1.cleat, t),
    ankle: lerpPoint(p0.ankle, p1.ankle, t),
    knee: lerpPoint(p0.knee, p1.knee, t),
  };
}

/** Interpolated knee extension angle (degrees) at an arbitrary crank angle. */
export function kneeExtensionAt(lut: PedalStrokeLUT, angleDeg: number): number {
  const a = ((angleDeg % 360) + 360) % 360;
  const f = (a / 360) * lut.samples;
  const i0 = Math.floor(f) % lut.samples;
  const i1 = (i0 + 1) % lut.samples;
  const t = f - Math.floor(f);
  return lut.kneeExtensionDeg[i0] + (lut.kneeExtensionDeg[i1] - lut.kneeExtensionDeg[i0]) * t;
}

/** Stem rating (degrees from the steerer normal, as printed on the stem) → angle above horizontal. */
export const stemAngleFromHorizontal = (stemAngleDeg: number, headAngleDeg: number) => stemAngleDeg + (90 - headAngleDeg);

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

  // Spacers and the stem clamp stack along the steerer (the head-tube axis, leaning back), not straight up.
  const steererUp = { x: -headAxis.x, y: -headAxis.y };
  const steererTop = {
    x: headTubeTop.x + steererUp.x * components.spacer_stack,
    y: headTubeTop.y + steererUp.y * components.spacer_stack,
  };
  // The clamp's bottom sits on the spacer stack, so the pivot is half the clamp height further up the steerer.
  const halfClamp = (components.stem_height ?? 40) / 2;
  const stemPivot = { x: steererTop.x + steererUp.x * halfClamp, y: steererTop.y + steererUp.y * halfClamp };
  // stem_angle_deg is the manufacturer rating: measured from the normal to the steerer, so on a 73° head tube a
  // −6° stem rises 11° above horizontal and a −17° stem is level.
  const stemAngleAbsDeg = stemAngleFromHorizontal(components.stem_angle_deg, frame.head_angle_deg);
  const stemAngle = radiansFromDegrees(stemAngleAbsDeg);
  const barClamp = {
    x: stemPivot.x + Math.cos(stemAngle) * components.stem_length,
    y: stemPivot.y + Math.sin(stemAngle) * components.stem_length,
  };
  // Hood contact from the shared cockpit model (mirrored in bikegeo_core/geometry.py).
  const hoods = hoodContact(barClamp, components);

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
    stemPivot,
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
    .flatMap((m) => [m.hip, m.knee, m.ankle, m.shoulder, m.elbow, m.wrist, m.hands, m.head, m.neckBase, m.spineJoint]);

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
 * Saddle contact point (on the seat-tube line, shifted by saddleXOffset) that gives
 * `targetKneeExtensionDeg` at the most extended point of the pedal stroke.
 *
 * The IK ankle runs on a circle of radius crankLength centred at
 * (−cleatSetback, pedalStackHeight), so the largest hip→ankle distance is
 * |hip − centre| + crankLength (≈ 5 o'clock, on the hip–BB line). Bisects the
 * clamp offset so that distance matches the target knee angle.
 */
export const saddleForKneeExtension = (
  rider: ReturnType<typeof buildRider>,
  targetKneeExtensionDeg: number,
  crankLength: number,
  seatAngleDeg: number,
  pedalStackHeight: number = 0,
  saddleStack: number = 0,
  cleatSetback: number = 0,
  saddleXOffset: number = 0,
): ContactPoint => {
  const seatAngle = radiansFromDegrees(seatAngleDeg);
  const centre: ContactPoint = { x: -cleatSetback, y: pedalStackHeight };
  const targetDistance =
    distanceForKneeAngle(Math.min(targetKneeExtensionDeg, 180), rider.thigh_length, rider.shank_length) - crankLength;
  const saddleAt = (offset: number): ContactPoint => ({
    x: -Math.cos(seatAngle) * offset + saddleXOffset,
    y: Math.sin(seatAngle) * offset + saddleStack,
  });
  let lo = 300;
  let hi = 1100;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    const saddle = saddleAt(mid);
    const hip = { x: saddle.x, y: saddle.y + rider.hip_joint_offset };
    if (distanceBetweenPoints(hip, centre) < targetDistance) lo = mid; // saddle too low → raise
    else hi = mid;
  }
  return saddleAt((lo + hi) / 2);
};

/** Max knee extension (°) over the stroke for a hip joint position (no IK needed). */
export const maxKneeExtensionForHip = (
  rider: ReturnType<typeof buildRider>,
  hip: ContactPoint,
  crankLength: number,
  pedalStackHeight: number = 0,
  cleatSetback: number = 0,
) =>
  kneeAngleForDistance(
    distanceBetweenPoints(hip, { x: -cleatSetback, y: pedalStackHeight }) + crankLength,
    rider.thigh_length,
    rider.shank_length,
  );

export const idealContactsFromRider = (
  rider: ReturnType<typeof buildRider>,
  targetKneeExtensionDeg: number,
  targetTrunkAngleDeg: number,
  crankLength: number,
  seatAngleDeg: number,
  barWidth: number = 0,
  pedalStackHeight: number = 0,
  saddleStack: number = 0,
  cleatSetback: number = 0,
  saddleXOffset: number = 0,
): IdealContacts => {
  const cleat: ContactPoint = { x: -cleatSetback, y: -crankLength };
  const saddle = saddleForKneeExtension(
    rider, targetKneeExtensionDeg, crankLength, seatAngleDeg, pedalStackHeight, saddleStack, cleatSetback, saddleXOffset,
  );
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

export const idealContactsFromSaddleHeight = (
  rider: ReturnType<typeof buildRider>,
  saddleHeightMm: number,
  targetTrunkAngleDeg: number,
  crankLength: number,
  seatAngleDeg: number,
  barWidth: number = 0,
  saddleStack: number = 0,
  cleatSetback: number = 0,
  saddleXOffset: number = 0,
): IdealContacts => {
  const seatAngle = radiansFromDegrees(seatAngleDeg);
  const cleat: ContactPoint = { x: -cleatSetback, y: -crankLength };

  const clampOffset = (saddleHeightMm - saddleStack) / Math.sin(seatAngle);
  const saddle: ContactPoint = {
    x: -Math.cos(seatAngle) * clampOffset + saddleXOffset,
    y: saddleHeightMm,
  };
  const hipJoint: ContactPoint = {
    x: saddle.x,
    y: saddle.y + rider.hip_joint_offset,
  };

  const trunkRad = radiansFromDegrees(targetTrunkAngleDeg);
  const shoulder: ContactPoint = {
    x: hipJoint.x + Math.cos(trunkRad) * rider.torso_length,
    y: hipJoint.y + Math.sin(trunkRad) * rider.torso_length,
  };

  const targetElbowInteriorRad = radiansFromDegrees(165);
  const armReach3D = Math.sqrt(
    rider.upper_arm_length ** 2 +
      rider.forearm_length ** 2 -
      2 * rider.upper_arm_length * rider.forearm_length * Math.cos(targetElbowInteriorRad)
  );
  const armReach = Math.sqrt(Math.max(0, armReach3D ** 2 - (barWidth / 2) ** 2));
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
/** Foot-to-pedal gap (mm) below which the foot counts as on the pedal (numerical noise). */
const PEDAL_GAP_TOLERANCE_MM = 0.5;

const severityForDistance = (distance: number): FitWarning["severity"] =>
  distance < FIT_WARN_OK ? "ok" : distance < FIT_WARN_BAD ? "warning" : "bad";

const worse = (a: FitWarning["severity"], b: FitWarning["severity"]): FitWarning["severity"] => {
  const rank = { ok: 0, warning: 1, bad: 2 } as const;
  return rank[a] >= rank[b] ? a : b;
};

/**
 * Hood target from the rider's actual shoulder: the hands should sit on the
 * hoods with elbow flexion inside the posture band. Returns the closest point
 * on the shoulder→hoods line that satisfies the band (the hoods themselves when
 * they already do) and how far the hoods are from it.
 */
export const hoodFit = (
  mannequin: MannequinSketch,
  hoods: ContactPoint,
  rider: ReturnType<typeof buildRider>,
  barWidth: number,
  bands: PosturePreset = POSTURE_PRESET,
) => {
  // Same sagittal projection of the arm segments as buildMannequin.
  const lateralOffset = barWidth / 2;
  const totalArm = rider.upper_arm_length + rider.forearm_length;
  const upper = Math.sqrt(Math.max(0, rider.upper_arm_length ** 2 - (lateralOffset * rider.upper_arm_length / totalArm) ** 2));
  const fore = Math.sqrt(Math.max(0, rider.forearm_length ** 2 - (lateralOffset * rider.forearm_length / totalArm) ** 2));
  const reachAtFlex = (flexDeg: number) =>
    Math.sqrt(upper ** 2 + fore ** 2 - 2 * upper * fore * Math.cos(radiansFromDegrees(180 - flexDeg)));
  const minReach = reachAtFlex(bands.elbow_flexion.max_deg);
  const maxReach = reachAtFlex(bands.elbow_flexion.min_deg);

  const dx = hoods.x - mannequin.shoulder.x;
  const dy = hoods.y - mannequin.shoulder.y;
  const d = Math.max(Math.hypot(dx, dy), 1e-6);
  const targetReach = Math.min(maxReach, Math.max(minReach, d));
  const target: ContactPoint = {
    x: mannequin.shoulder.x + (dx / d) * targetReach,
    y: mannequin.shoulder.y + (dy / d) * targetReach,
  };
  return {
    target,
    /** + = hoods too far from the shoulder, − = too close (mm, along the shoulder→hoods line). */
    excessReachMm: d - targetReach,
    handGapMm: mannequin.handGapMm ?? 0,
    elbowFlexDeg: 180 - angleAtPoint(mannequin.shoulder, mannequin.elbow, mannequin.hands),
    shoulderDeg: angleAtPoint(mannequin.hip, mannequin.shoulder, mannequin.elbow),
  };
};

export type FitWarningInputs = {
  ideal: IdealContacts;
  bike: BikeSketch;
  hood: ReturnType<typeof hoodFit>;
  stroke: PedalStrokeLUT;
  /** Highest saddle (mm above BB) at which the foot still reaches the pedal. */
  maxSaddleHeightMm: number;
  bands?: PosturePreset;
};

export const fitWarnings = ({ ideal, bike, hood, stroke, maxSaddleHeightMm, bands = POSTURE_PRESET }: FitWarningInputs): FitWarning[] => {
  // Saddle: distance from the target saddle point.
  const sdx = bike.saddle.x - ideal.saddle.x;
  const sdy = bike.saddle.y - ideal.saddle.y;
  const saddleDistance = Math.hypot(sdx, sdy);
  const saddle: FitWarning = {
    contact: "saddle",
    deltaX: sdx,
    deltaY: sdy,
    distance: saddleDistance,
    severity: severityForDistance(saddleDistance),
  };

  // Hoods: the hands must reach them, with elbow (and shoulder) inside their bands.
  const elbowBand = bands.elbow_flexion;
  const shoulderBand = bands.shoulder_flexion;
  const hdx = bike.hoods.x - hood.target.x;
  const hdy = bike.hoods.y - hood.target.y;
  const hoodDistance = Math.abs(hood.excessReachMm);
  let hoodSeverity: FitWarning["severity"];
  let hoodMessage: string;
  if (hood.handGapMm > PEDAL_GAP_TOLERANCE_MM) {
    hoodSeverity = "bad";
    hoodMessage = `Hands ${hood.handGapMm.toFixed(0)} mm short of the hoods with straight arms. Bring the hoods ~${hoodDistance.toFixed(0)} mm closer or raise the trunk.`;
  } else {
    // Inside the band = on target; the "near" margin used for colouring would flag fits that are fine.
    const st = bandStatus(hood.elbowFlexDeg, elbowBand);
    const inBand = hood.elbowFlexDeg >= elbowBand.min_deg && hood.elbowFlexDeg <= elbowBand.max_deg;
    hoodSeverity = inBand ? "ok" : st === "near" ? "warning" : "bad";
    const flex = `elbow flex ${hood.elbowFlexDeg.toFixed(0)}° (band ${elbowBand.min_deg}–${elbowBand.max_deg}°)`;
    hoodMessage =
      hood.excessReachMm > 0.5
        ? `Hands on the hoods, ${flex}. Hoods ~${hoodDistance.toFixed(0)} mm too far.`
        : hood.excessReachMm < -0.5
        ? `Hands on the hoods, ${flex}. Hoods ~${hoodDistance.toFixed(0)} mm too close.`
        : `Hands on the hoods, ${flex}.`;
  }
  if (hood.shoulderDeg < shoulderBand.min_deg || hood.shoulderDeg > shoulderBand.max_deg) {
    hoodSeverity = worse(hoodSeverity, "warning");
    hoodMessage += ` Shoulder angle ${hood.shoulderDeg.toFixed(0)}° (band ${shoulderBand.min_deg}–${shoulderBand.max_deg}°).`;
  }
  const hoods: FitWarning = {
    contact: "hoods",
    deltaX: hdx,
    deltaY: hdy,
    distance: hoodDistance,
    severity: hoodSeverity,
    message: hoodMessage,
  };

  // Pedal: does the foot stay on it through the whole stroke?
  const gap = stroke.maxPedalGapMm;
  const reaches = gap <= PEDAL_GAP_TOLERANCE_MM;
  const cleat: FitWarning = {
    contact: "cleat",
    deltaX: 0,
    deltaY: reaches ? 0 : gap,
    distance: reaches ? 0 : gap,
    severity: reaches ? "ok" : "bad",
    message: reaches
      ? "Foot stays on the pedal through the whole stroke."
      : `Saddle too high: the leg is fully straight and the foot lifts ${gap.toFixed(0)} mm off the pedal at the bottom of the stroke. Highest reachable saddle ≈ ${Math.floor(maxSaddleHeightMm)} mm.`,
  };

  return [saddle, hoods, cleat];
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
 * the bar reach needed to position the hoods there. Bar reach is horizontal
 * (see synthesizeBike), so only the x gap counts; a height gap needs stem or
 * spacer changes instead.
 *
 * Returns null if the result is outside [BAR_REACH_MIN_MM, BAR_REACH_MAX_MM].
 */
export const barReachNeeded = (
  targetHoods: ContactPoint,
  barClamp: ContactPoint,
  hoodReachOffset: number
): number | null => {
  const reach = targetHoods.x - barClamp.x - hoodReachOffset;
  if (reach < BAR_REACH_MIN_MM || reach > BAR_REACH_MAX_MM) return null;
  return reach;
};

// ── 3D bilateral expansion of 2D mannequin ──────────────────────────────────

const _DEFAULT_STANCE_WIDTH = 155;
const _DEFAULT_HIP_WIDTH = 200;

const _MANNEQUIN_EDGES: [string, string, string][] = [
  // Feet (tapered cylinder)
  ["cleat_r", "ankle_r", "mannequin_foot"],
  ["cleat_l", "ankle_l", "mannequin_foot"],
  // Shins
  ["ankle_r", "knee_r", "mannequin_shin"],
  ["ankle_l", "knee_l", "mannequin_shin"],
  // Thighs
  ["knee_r", "hip_r", "mannequin_thigh"],
  ["knee_l", "hip_l", "mannequin_thigh"],
  // Hip bar
  ["hip_r", "hip_l", "mannequin_hip_bar"],
  // Torso — lower
  ["hip_center", "spine_joint", "mannequin_lower_torso"],
  // Torso — upper
  ["spine_joint", "shoulder_center", "mannequin_upper_torso"],
  // Neck
  ["neck_base_center", "head_center", "mannequin_neck"],
  // Shoulder bar
  ["shoulder_r", "shoulder_l", "mannequin_shoulder_bar"],
  // Upper arms
  ["shoulder_r", "elbow_r", "mannequin_upper_arm"],
  ["shoulder_l", "elbow_l", "mannequin_upper_arm"],
  // Forearms
  ["elbow_r", "wrist_r", "mannequin_forearm"],
  ["elbow_l", "wrist_l", "mannequin_forearm"],
  // Hands (capsule)
  ["wrist_r", "hand_r", "mannequin_hand"],
  ["wrist_l", "hand_l", "mannequin_hand"],
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

  const pedalStack = components.pedal_stack_height || 0;

  // Anatomical ankle joint sits ~19% of foot length behind the ball of the
  // foot / pedal spindle. The 2D side view draws the shin to this shifted
  // point (visualAnkleX in FitBuilderMode); use the same convention here so
  // the 3D knee bend reads identically. The IK itself solves with the
  // unshifted ankle in both views.
  const ankleSetback = rider.foot_length * 0.19 * (rider.height / 1800);

  // Right leg (+Z, drive side): the 2D fit pose, crank at bottom dead center,
  // matching the near leg of the 2D side view.
  p("cleat_r", mannequin.ankle.x, mannequin.ankle.y - pedalStack, +halfStance);
  p("ankle_r", mannequin.ankle.x - ankleSetback, mannequin.ankle.y, +halfStance);
  p("knee_r", mannequin.knee.x, mannequin.knee.y, +halfStance);

  // Left leg (−Z): posed at the opposed crank position (top dead center) so the
  // rider isn't impossibly pedaling with both feet down. The pedal spindle
  // sits at (0, −crank_length) from the BB (origin), so the opposed spindle is
  // at +crank_length; the cleat keeps its setback. Same leg IK as the 2D view.
  const pedalL2d = { x: -components.cleat_setback, y: components.crank_length + pedalStack };
  const hip2d = { x: mannequin.hip.x, y: mannequin.hip.y };
  const legL = solveLeg(hip2d, pedalL2d, rider.thigh_length, rider.shank_length);
  const ankleL2d = legL.ankle;
  const kneeL2d = legL.knee;
  p("cleat_l", ankleL2d.x, ankleL2d.y - pedalStack, -halfStance);
  p("ankle_l", ankleL2d.x - ankleSetback, ankleL2d.y, -halfStance);
  p("knee_l", kneeL2d.x, kneeL2d.y, -halfStance);

  // Hips at ±half_hip + centerline
  p("hip_r", mannequin.hip.x, mannequin.hip.y, +halfHip);
  p("hip_l", mannequin.hip.x, mannequin.hip.y, -halfHip);
  p("hip_center", mannequin.hip.x, mannequin.hip.y, 0);

  // Spine joint (centerline)
  p("spine_joint", mannequin.spineJoint.x, mannequin.spineJoint.y, 0);

  // Shoulders at ±half_shoulder + centerline
  p("shoulder_r", mannequin.shoulder.x, mannequin.shoulder.y, +halfShoulder);
  p("shoulder_l", mannequin.shoulder.x, mannequin.shoulder.y, -halfShoulder);
  p("shoulder_center", mannequin.shoulder.x, mannequin.shoulder.y, 0);

  // Neck base + head (centerline)
  p("neck_base_center", mannequin.neckBase.x, mannequin.neckBase.y, 0);
  p("head_center", mannequin.head.x, mannequin.head.y, 0);

  // Elbows at ±half_shoulder
  p("elbow_r", mannequin.elbow.x, mannequin.elbow.y, +halfShoulder);
  p("elbow_l", mannequin.elbow.x, mannequin.elbow.y, -halfShoulder);

  // Wrists and hands on the hoods; inward hood rotation moves the palm toward the centreline.
  const handHalf = buildCockpit({ x: 0, y: 0 }, components).contactHalfWidth;
  p("wrist_r", mannequin.wrist.x, mannequin.wrist.y, +(halfHood + handHalf) / 2);
  p("wrist_l", mannequin.wrist.x, mannequin.wrist.y, -(halfHood + handHalf) / 2);
  p("hand_r", mannequin.hands.x, mannequin.hands.y, +handHalf);
  p("hand_l", mannequin.hands.x, mannequin.hands.y, -handHalf);

  const edges: Geometry3DEdge[] = [];
  for (const [a, b, group] of _MANNEQUIN_EDGES) {
    edges.push({ a, b, group });
  }

  return { points, edges };
}

// ── Full 3D scene graph (bike + mannequin) ───────────────────────────────────
//
// Built entirely client-side from the same BikeSketch / MannequinSketch the
// 2D view renders, so the 2D and 3D views agree by construction. The output
// shape matches the former /geometry3d response (and stays loadable by
// houdini/load_bikegeo.py via the dev-toolbar JSON export).

const _FRAME_EDGES: [string, string][] = [
  // Diamond main frame
  ["bb", "seat_cluster"],
  ["seat_cluster", "seat_tube_top"],
  ["seat_cluster", "head_tube_top"],
  ["bb", "head_tube_bottom"],
  ["head_tube_top", "head_tube_bottom"],
  // Bilateral chainstays: BB centre → lateral rear-dropout points
  ["bb", "chainstay_r"],
  ["bb", "chainstay_l"],
  // Bilateral seatstays: seat-tube top → same lateral rear-dropout points
  ["seat_cluster", "chainstay_r"],
  ["seat_cluster", "chainstay_l"],
  // Bilateral fork blades: fork crown → lateral front-dropout points
  ["head_tube_bottom", "fork_r"],
  ["head_tube_bottom", "fork_l"],
  // Seatpost (straight along seat tube axis to clamp — saddle rendered separately)
  ["seat_tube_top", "seatpost_top"],
  // Cockpit: steerer/spacers follow head angle, then stem, then handlebar
  ["head_tube_top", "steerer_top"],
  ["steerer_top", "stem_pivot"],
  ["stem_pivot", "bar_clamp"],
  ["bar_clamp", "bar_top_r"],
  ["bar_clamp", "bar_top_l"],
  ["bar_top_r", "hoods_r"],
  ["bar_top_l", "hoods_l"],
  ["hoods_r", "bar_drop_r"],
  ["hoods_l", "bar_drop_l"],
];

/** Lateral half-spread of the rear dropouts / fork dropouts (mm). */
const _CHAINSTAY_HALF_SPREAD = 38;
const _FORK_HALF_SPREAD = 25;
/** Visual seatpost head extension above the rail clamp centre (mm). */
const _SEATPOST_HEAD_EXTENSION = 5;

const _numericEntries = (obj: object): Record<string, number> =>
  Object.fromEntries(
    Object.entries(obj).filter(([, v]) => typeof v === "number")
  ) as Record<string, number>;

export function buildGeometry3D(
  frame: FrameGeometry,
  components: Components,
  rider: ReturnType<typeof buildRider>,
  bike: BikeSketch,
  mannequin: MannequinSketch,
  strokeLUT?: PedalStrokeLUT,
): Geometry3DResponse {
  const hoodW = components.hood_width ?? components.bar_width;
  const stanceW = components.stance_width ?? _DEFAULT_STANCE_WIDTH;
  const halfHood = hoodW / 2;
  const halfStance = stanceW / 2;

  const points: Geometry3DPoint[] = [];
  const p = (name: string, pt: ContactPoint, z = 0) => {
    points.push({ name, pos: [pt.x, pt.y, z], group: "frame" });
  };

  // Centerline frame points — straight from the 2D sketch
  p("bb", bike.bb);
  p("rear_axle", bike.rearAxle);
  p("front_axle", bike.frontAxle);
  p("saddle", bike.saddle);
  p("saddle_clamp", bike.saddleClamp);
  p("seat_cluster", bike.seatCluster);
  p("seat_tube_top", bike.seatTubeTop);
  p("head_tube_top", bike.headTubeTop);
  p("head_tube_bottom", bike.headTubeBottom);
  p("steerer_top", bike.steererTop);
  p("stem_pivot", bike.stemPivot);
  p("bar_clamp", bike.barClamp);

  // Seatpost head extends a short distance past the clamp along the seat
  // tube so the rendered post is not truncated at the rail support.
  const seatAngle = radiansFromDegrees(frame.seat_angle_deg);
  p("seatpost_top", {
    x: bike.saddleClamp.x - Math.cos(seatAngle) * _SEATPOST_HEAD_EXTENSION,
    y: bike.saddleClamp.y + Math.sin(seatAngle) * _SEATPOST_HEAD_EXTENSION,
  });

  // Bilateral frame points (positive Z = rider's left)
  // Cockpit points from the shared cockpit model (the 3D bar and hood meshes read `cockpit` directly).
  const cockpit = buildCockpit(bike.barClamp, components);
  p("hoods_r", bike.hoods, +cockpit.contactHalfWidth);
  p("hoods_l", bike.hoods, -cockpit.contactHalfWidth);
  p("cleat_r", bike.cleat, +halfStance);
  p("cleat_l", bike.cleat, -halfStance);
  p("chainstay_r", bike.rearAxle, +_CHAINSTAY_HALF_SPREAD);
  p("chainstay_l", bike.rearAxle, -_CHAINSTAY_HALF_SPREAD);
  p("fork_r", bike.frontAxle, +_FORK_HALF_SPREAD);
  p("fork_l", bike.frontAxle, -_FORK_HALF_SPREAD);
  const [, ckTops, , , , , ckDropBottom] = cockpit.sagittal;
  p("bar_top_r", ckTops, +cockpit.hoodWidth / 2);
  p("bar_top_l", ckTops, -cockpit.hoodWidth / 2);
  p("bar_drop_r", ckDropBottom, +cockpit.dropWidth / 2);
  p("bar_drop_l", ckDropBottom, -cockpit.dropWidth / 2);

  // Mannequin — the same bilateral expansion the 2D mannequin drives.
  // Pushed after the frame points so duplicate names (cleat_r/cleat_l)
  // resolve to the mannequin pose in name→position maps.
  const mann = buildMannequin3DPoints(mannequin, rider, components);
  points.push(...mann.points);

  const edges: Geometry3DEdge[] = [
    ..._FRAME_EDGES.map(([a, b]) => ({ a, b, group: "frame" })),
    ...mann.edges,
  ];

  const trunkAngleDeg =
    (Math.atan2(
      mannequin.shoulder.y - mannequin.hip.y,
      mannequin.shoulder.x - mannequin.hip.x
    ) * 180) / Math.PI;
  const pose_metrics: Record<string, number> = {
    trunk_angle_deg: trunkAngleDeg,
    hip_angle_deg: angleAtPoint(mannequin.shoulder, mannequin.hip, mannequin.knee),
    shoulder_flexion_deg: angleAtPoint(mannequin.hip, mannequin.shoulder, mannequin.elbow),
    elbow_flexion_deg: 180 - angleAtPoint(mannequin.shoulder, mannequin.elbow, mannequin.hands),
    knee_extension_deg: angleAtPoint(mannequin.hip, mannequin.knee, mannequin.ankle),
    ...(strokeLUT
      ? {
          knee_flexion_tdc_deg: strokeLUT.kneeFlexionTdcDeg,
          knee_extension_max_deg: strokeLUT.kneeExtensionMaxDeg,
          kops_offset_mm: strokeLUT.kopsOffsetMm,
        }
      : {}),
  };

  return {
    version: "1.1.0",
    points,
    edges,
    pose_metrics,
    frame: _numericEntries(frame),
    components: _numericEntries(components),
    rider: _numericEntries(rider),
    constraints: {},
    cockpit,
  };
}
