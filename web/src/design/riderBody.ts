/**
 * Rider body shape numbers shared by the 3D mannequin and the 2D side-view silhouette.
 * STUB: DS lands the numbers from master plan §5.5 / mockups/src/rider3.js; track E owns and may refine this file.
 * Base physique: lean male road racer, 1800 mm / 75 kg. All lengths in mm. Joint positions always come from the
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
      { dir: "ant", t: 0.45, w: 0.22, amp: 16, spread: 2 }, // rectus / vastus mass
      { dir: "ant+med", t: 0.84, w: 0.08, amp: 10, spread: 3 }, // VMO teardrop
      { dir: "lat", t: 0.45, w: 0.2, amp: 9, spread: 2 }, // vastus lateralis sweep
      { dir: "post", t: 0.35, w: 0.2, amp: 8, spread: 2 }, // hamstrings
    ],
    scale: [1, 0.92],
  },
  calf: {
    radius: (t) => lerp(40, 20, t) - 2 * bump(t, 0.85, 0.1),
    bulges: [
      { dir: "post+med", t: 0.3, w: 0.11, amp: 30, spread: 4 }, // gastrocnemius medial head
      { dir: "post+lat", t: 0.24, w: 0.09, amp: 22, spread: 4 }, // lateral head
      { dir: "post", t: 0.5, w: 0.12, amp: 8, spread: 3 }, // soleus
      { dir: "med", t: 0.52, w: 0.12, amp: 8, spread: 3 }, // soleus medial flare
      { dir: "lat", t: 0.3, w: 0.16, amp: 5, spread: 2 }, // tibialis / peroneals
    ],
    scale: [1, 0.92],
  },
  upperArm: {
    radius: (t) => lerp(36, 28, t),
    bulges: [
      { dir: "ant", t: 0.52, w: 0.18, amp: 8, spread: 2 }, // biceps
      { dir: "post", t: 0.38, w: 0.2, amp: 9, spread: 2 }, // triceps
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
    radius: (t) => 98 - 16 * bump(t, 0.36, 0.13) + 20 * bump(t, 0.78, 0.16),
    bulges: [],
    scale: [1, 1],
  },
  neck: { radius: () => 44, bulges: [], scale: [1, 1] },
};

/** Torso lateral (sz) / front-to-back (sx) multipliers along the trunk (V-taper), before CAL. */
export const torsoWidth = (t: number) => lerp(1.08, 1.5, smoothstep(0.28, 0.86, t));
export const torsoDepth = (t: number) => lerp(1.0, 1.15, smoothstep(0.3, 0.85, t));

/** Extra world-space masses (centre offsets are relative to the joint; sizes are ellipsoid semi-axes). */
export const MASSES = {
  deltoid: { semiAxes: [48, 58, 46] as [number, number, number], outboard: 18 },
  lats: { semiAxes: [80, 36, 26] as [number, number, number] },
  glute: { semiAxes: [62, 56, 56] as [number, number, number] },
  knee: { radius: 50, depthScale: 0.9 },
  elbow: { radius: 30 },
  ankle: { radius: 29 },
} as const;

/**
 * Per-station width calibration against the reference photo of a pro rider (§5.5): a multiplier per station,
 * linear between stations and flat beyond. Scales both the base profile and the muscle bulges (torso: depth only).
 * Stomach is deliberately set to 80% of the measured depth.
 */
export const CAL: Record<SegmentName, ReadonlyArray<readonly [number, number]>> = {
  thigh: [[0.25, 0.976], [0.5, 1.003], [0.75, 1.018]],
  calf: [[0.25, 1.333], [0.5, 1.679], [0.75, 1.842]],
  upperArm: [[0.25, 1.317], [0.5, 1.086], [0.75, 1.13]],
  forearm: [[0.25, 1.289], [0.5, 1.436], [0.75, 1.18]],
  torso: [[0.3, 1.098], [0.5, 1.204], [0.7, 0.968]],
  neck: [[0.5, 1.258]],
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
  let X = x * 96;
  let Y = y * 118 - 6;
  let Z = z * 76;
  const low = smoothstep(0, -1, y); // 0 at the equator → 1 at the chin
  Z *= 1 - 0.18 * low; // jaw narrows
  X = X > 0 ? X * (1 - 0.06 * low) + 4 * low : X * (1 - 0.4 * low);
  Y += 10 * low * low;
  if (X > 0) X -= 6 * Math.max(0, x) ** 6; // flatter face
  return [X, Y, Z];
}

/** Head gaze offset from the neck direction, in degrees. */
export const HEAD_GAZE_OFFSET_DEG = 78;

/** Measured reference widths (mm, side view) the CAL was fitted to; 25%/50%/75% along each bone (torso 30/50/70). */
export const REFERENCE_WIDTHS_MM = {
  thigh: [179, 165, 131],
  calf: [122, 119, 89],
  upperArm: [102, 87, 74],
  forearm: [81, 71, 51],
  torso: [224, 239, 255], // stomach is built at 80% (184), a design choice
  neck: [106],
} as const;
