/**
 * Rider body shape numbers shared by the 3D mannequin and the 2D side-view silhouette.
 * STUB: DS lands the numbers from master plan §5.5 / mockups/src/rider3.js; track E owns and may refine this file.
 * Base physique: lean endurance cyclist, gender-neutral (narrow V-taper, modest muscle), 1800 mm. Radii scale with
 * height only (and the legs with their own length, riderMesh.segScale). All lengths in mm. Joint positions always come from the
 * app's IK; this file only holds radii and shapes.
 */

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Gaussian bump: bump(t, centre, width). */
export const bump = (t: number, c: number, w: number) => Math.exp(-((t - c) ** 2) / (2 * w * w));
const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export type SegmentName = "thigh" | "calf" | "upperArm" | "forearm" | "torso" | "neck";

/**
 * Muscle bulge: radius += amp · gauss(t; centre, width) · max(0, cos θ)^spread towards `dir`.
 * Directions are relative to the bone: `ant` = anterior (the way the knee/elbow points on the thigh, the
 * biceps side on the arm), `post` = posterior, `med`/`lat` = towards/away from the body midline (z).
 */
export type BulgeDir = "ant" | "post" | "med" | "lat" | "ant+med" | "post+med" | "post+lat";

export interface Bulge {
  dir: BulgeDir;
  /** Station along the bone, 0 = proximal. */
  t: number;
  /** Gaussian width in t. */
  w: number;
  amp: number;
  spread: number;
}

export interface SegmentProfile {
  /** Base radius at t ∈ [0,1] along the bone (before muscle bulges and CAL). */
  radius: (t: number) => number;
  bulges: Bulge[];
  /** Cross-section scale (sx, sz) applied after the lathe. */
  scale: [number, number];
}

export const PROFILES: Record<SegmentName, SegmentProfile> = {
  thigh: {
    radius: (t) => lerp(86, 50, t) + 6 * bump(t, 0.3, 0.2),
    bulges: [
      { dir: "ant", t: 0.45, w: 0.22, amp: 11, spread: 2 }, // rectus / vastus mass
      { dir: "ant+med", t: 0.84, w: 0.08, amp: 7, spread: 3 }, // VMO teardrop
      { dir: "lat", t: 0.45, w: 0.2, amp: 6, spread: 2 }, // vastus lateralis sweep
      { dir: "post", t: 0.35, w: 0.2, amp: 6, spread: 2 }, // hamstrings
    ],
    scale: [1, 0.92],
  },
  calf: {
    radius: (t) => lerp(42, 20, t) - 2 * bump(t, 0.85, 0.1),
    bulges: [
      { dir: "post+med", t: 0.3, w: 0.13, amp: 26, spread: 3 }, // gastrocnemius medial head
      { dir: "post+lat", t: 0.26, w: 0.11, amp: 18, spread: 3 }, // lateral head
      { dir: "post", t: 0.48, w: 0.14, amp: 8, spread: 2 }, // soleus
      { dir: "med", t: 0.45, w: 0.14, amp: 8, spread: 2 }, // soleus medial flare
      { dir: "lat", t: 0.3, w: 0.16, amp: 7, spread: 2 }, // tibialis / peroneals
    ],
    scale: [1, 0.92],
  },
  upperArm: {
    radius: (t) => lerp(36, 28, t),
    bulges: [
      { dir: "ant", t: 0.52, w: 0.18, amp: 6, spread: 2 }, // biceps
      { dir: "post", t: 0.38, w: 0.2, amp: 6, spread: 2 }, // triceps
      { dir: "lat", t: 0.2, w: 0.14, amp: 8, spread: 2 }, // deltoid insertion
    ],
    scale: [1, 1],
  },
  forearm: {
    radius: (t) => lerp(31, 18, t),
    bulges: [
      { dir: "ant", t: 0.18, w: 0.14, amp: 8, spread: 2 },
      { dir: "lat", t: 0.22, w: 0.15, amp: 6, spread: 2 }, // forearm flare
    ],
    scale: [1, 0.86],
  },
  /** V-taper torso: waist pinch, broad ribcage/lats, chest. Width taper and front-to-back depth below. */
  torso: {
    radius: (t) => 85 - 14 * bump(t, 0.36, 0.13) + 14 * bump(t, 0.78, 0.16),
    bulges: [],
    scale: [1, 1],
  },
  neck: { radius: () => 36, bulges: [], scale: [1, 1] },
};

/**
 * Torso half-width (z, mm at 1800 mm) along the trunk for a lean, neutral build: pelvis ~120, ribcage ~145, a mild
 * waist. `torsoWidth` is the ratio to the base radius, so the size factor stays in `PROFILES.torso`.
 */
const torsoHalfWidth = (t: number) => lerp(120, 145, smoothstep(0.12, 0.8, t)) - 6 * bump(t, 0.38, 0.12);
/** Torso lateral (sz) / front-to-back (sx) multipliers along the trunk (V-taper), before CAL. */
export const torsoWidth = (t: number) => torsoHalfWidth(t) / PROFILES.torso.radius(t);
export const torsoDepth = (t: number) => lerp(1.0, 1.15, smoothstep(0.3, 0.85, t));

/** Extra world-space masses (centre offsets are relative to the joint; sizes are ellipsoid semi-axes). */
export const MASSES = {
  deltoid: { semiAxes: [33, 43, 31] as [number, number, number], outboard: 14 },
  lats: { semiAxes: [74, 32, 22] as [number, number, number] },
  glute: { semiAxes: [52, 48, 50] as [number, number, number] },
  knee: { radius: 44, depthScale: 0.9 },
  elbow: { radius: 30 },
  ankle: { radius: 29 },
} as const;

/**
 * Per-station width calibration (lean endurance build, originally fitted to a pro-rider photo, §5.5, then slimmed: calves
 * and thighs were far heavier than a lean rider's): a multiplier per station,
 * linear between stations and flat beyond. Scales both the base profile and the muscle bulges (torso: depth only).
 * Stomach is deliberately set to 80% of the measured depth.
 */
export const CAL: Record<SegmentName, ReadonlyArray<readonly [number, number]>> = {
  thigh: [[0.25, 0.9], [0.5, 0.92], [0.75, 0.96]],
  calf: [[0.25, 1.0], [0.5, 1.12], [0.75, 1.2]],
  upperArm: [[0.25, 1.1], [0.5, 0.95], [0.75, 1.0]],
  forearm: [[0.25, 1.1], [0.5, 1.15], [0.75, 1.0]],
  torso: [[0.3, 1.0], [0.5, 1.05], [0.7, 0.92]],
  neck: [[0.5, 1.1]],
};

export const calAt = (segment: SegmentName, t: number): number => {
  const c = CAL[segment];
  if (t <= c[0][0]) return c[0][1];
  for (let i = 0; i < c.length - 1; i++) {
    if (t <= c[i + 1][0]) return lerp(c[i][1], c[i + 1][1], (t - c[i][0]) / (c[i + 1][0] - c[i][0]));
  }
  return c[c.length - 1][1];
};

/**
 * Plain clay head: deformed unit sphere (x, y, z on the unit sphere) → mm, in the head-local frame
 * (+x gaze, +y up, +z left). No facial features, no ears, no helmet. In 2D the profile is the z = 0 slice.
 * Head-local gaze angle = neck angle − 78°.
 */
export function headDeform(x: number, y: number, z: number): [number, number, number] {
  // Adult male head: ~195 mm long, ~155 mm wide, ~225 mm crown to chin.
  let X = x * 97;
  let Y = y * 112 + 18; // raised along the neck so the chin clears the shoulders
  let Z = z * 77;
  const low = smoothstep(0, -1, y); // 0 at the equator → 1 at the chin
  Z *= 1 - 0.22 * low; // jaw narrows
  X = X > 0 ? X * (1 - 0.1 * low) + 6 * low : X * (1 - 0.22 * low); // rounded occiput, chin forward of the jaw line
  Y += 8 * low * low;
  if (X > 0) X -= 7 * Math.max(0, x) ** 6; // flatter face
  return [X, Y, Z];
}

/** Neck thickness factor, so there is a visible gap under the chin and behind the skull. */
export const NECK_SLIM = 0.82;

/** Head gaze offset from the neck direction, in degrees. */
export const HEAD_GAZE_OFFSET_DEG = 78;

/** Measured widths (mm, side view) of the ORIGINAL pro-rider photo; the CAL above is now slimmer than this. Kept for reference; 25%/50%/75% along each bone (torso 30/50/70). */
export const REFERENCE_WIDTHS_MM = {
  thigh: [179, 165, 131],
  calf: [122, 119, 89],
  upperArm: [102, 87, 74],
  forearm: [81, 71, 51],
  torso: [224, 239, 255], // stomach is built at 80% (184), a design choice
  neck: [106],
} as const;

// ── Spine ───────────────────────────────────────────────────────────────────

/** mm: the back bend is spread over this arc length (30–50 cm). */
export const SPINE_BEND_LENGTH = 400;

export interface SpinePath {
  /** total length, hip → shoulder along the path */
  len: number;
  /** point and unit tangent at arc length s (s < 0 / s > len extrapolate straight along the end tangents) */
  at(s: number): { p: { x: number; y: number }; t: { x: number; y: number } };
}

type Pt2 = { x: number; y: number };

const straightPath = (hip: Pt2, shoulder: Pt2): SpinePath => {
  const dx = shoulder.x - hip.x;
  const dy = shoulder.y - hip.y;
  const len = Math.hypot(dx, dy) || 1;
  const t = { x: dx / len, y: dy / len };
  return { len, at: (s) => ({ p: { x: hip.x + t.x * s, y: hip.y + t.y * s }, t }) };
};

/**
 * Hip → shoulder spine as straight → circular arc → straight, ending exactly at `shoulder`. The lower straight
 * runs along hip → spineJoint (the solver's hinge) and the upper one along spineJoint → shoulder, so the path
 * turns by the same angle as the solver's hinge but spreads it over `L` mm. Shoulder (and every metric) unchanged.
 */
export function spinePath(hip: Pt2, spineJoint: Pt2, shoulder: Pt2, L = SPINE_BEND_LENGTH): SpinePath {
  const l0 = Math.hypot(spineJoint.x - hip.x, spineJoint.y - hip.y);
  const l1 = Math.hypot(shoulder.x - spineJoint.x, shoulder.y - spineJoint.y);
  if (l0 < 1 || l1 < 1) return straightPath(hip, shoulder);
  const d0 = { x: (spineJoint.x - hip.x) / l0, y: (spineJoint.y - hip.y) / l0 };
  const d1 = { x: (shoulder.x - spineJoint.x) / l1, y: (shoulder.y - spineJoint.y) / l1 };
  const phi = Math.atan2(d0.x * d1.y - d0.y * d1.x, d0.x * d1.x + d0.y * d1.y);
  if (Math.abs(phi) < (0.5 * Math.PI) / 180) return straightPath(hip, shoulder);
  const n0 = { x: -d0.y, y: d0.x };
  const sin = Math.sin(phi);
  const cos = Math.cos(phi);
  const det = sin;

  let arc = L;
  let a = -1;
  let b = -1;
  let C = { x: 0, y: 0 };
  for (; arc >= 50; arc *= 0.8) {
    C = { x: (arc / phi) * (sin * d0.x + (1 - cos) * n0.x), y: (arc / phi) * (sin * d0.y + (1 - cos) * n0.y) };
    const rx = shoulder.x - hip.x - C.x;
    const ry = shoulder.y - hip.y - C.y;
    a = (rx * d1.y - ry * d1.x) / det;
    b = (d0.x * ry - d0.y * rx) / det;
    if (a >= 0 && b >= 0) break;
  }
  if (!(a >= 0 && b >= 0)) {
    // the arc does not fit between the two legs: fall back to the solver's hinge
    arc = 0;
    a = l0;
    b = l1;
    C = { x: 0, y: 0 };
  }
  const A = { x: hip.x + a * d0.x, y: hip.y + a * d0.y };
  const B = arc > 0 ? { x: A.x + C.x, y: A.y + C.y } : A;
  const len = a + arc + b;
  return {
    len,
    at(s) {
      if (s <= a) return { p: { x: hip.x + d0.x * s, y: hip.y + d0.y * s }, t: d0 };
      if (s >= a + arc) return { p: { x: B.x + d1.x * (s - a - arc), y: B.y + d1.y * (s - a - arc) }, t: d1 };
      const psi = (phi * (s - a)) / arc;
      const k = arc / phi;
      return {
        p: { x: A.x + k * (Math.sin(psi) * d0.x + (1 - Math.cos(psi)) * n0.x), y: A.y + k * (Math.sin(psi) * d0.y + (1 - Math.cos(psi)) * n0.y) },
        t: { x: Math.cos(psi) * d0.x + Math.sin(psi) * n0.x, y: Math.cos(psi) * d0.y + Math.sin(psi) * n0.y },
      };
    },
  };
}
