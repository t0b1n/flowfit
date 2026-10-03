/**
 * Shared bike shape numbers, consumed by the 3D meshes (`bike3d.ts`) and the 2D side view
 * (filled tapered polygons). STUB: DS lands the numbers from the plans; track E owns and may refine this file.
 * All lengths in mm. Sources: 3D plan §6 (tube radii), mockups/src/bike3.js (rim, chainrings, cassette).
 */

export type TubeName =
  | "down_tube"
  | "seat_tube"
  | "top_tube"
  | "head_tube"
  | "chainstay"
  | "seatstay"
  | "seatpost";

/** Radius at the start and end of each tube, in the edge-graph direction named in the comment. */
export const TUBE_PROFILE: Record<TubeName, [r0: number, r1: number]> = {
  down_tube: [24, 20], // BB → head tube
  seat_tube: [17, 15],
  top_tube: [15, 17],
  head_tube: [23, 19], // bottom → top (tapered steerer)
  chainstay: [13, 8],
  seatstay: [9, 6], // upper end sits 35 mm down the seat tube ("dropped stays")
  seatpost: [13, 13], // aero post, alloy
};

/**
 * Stem and spacer sizes (mm), shared by the 2D and 3D drawings. The clamp's length along the steerer is
 * `stem_height`; these are the cross-section radii. A 1⅛" steerer is 28.6 mm, a road bar clamp 31.8 mm.
 */
export const STEM = {
  /** spacer outer radius (≈ 34 mm spacers) */
  spacerR: 17,
  /** steerer clamp half-depth fore-aft (≈ 38 mm clamp body) */
  clampR: 19,
  /** arm radius at the steerer clamp and at the bar clamp (3D) */
  armR: [17, 15] as [number, number],
  /** outer radius of the bar clamp around a 31.8 mm bar (≈ 5 mm wall) */
  barClampR: 21,
  /** bar clamp width across the bike (3D) */
  barClampWidth: 44,
};

/** Seatstay upper end is moved this far down the seat tube. */
export const SEATSTAY_DROP = 35;

/** Front hub (mm): shell radius / half-length, spoke flanges (radius, lateral station), thru-axle radius. The 3D hub
 *  and both 2D views draw these; the dropouts sit at FORK.halfSpread (design/fork.ts). */
export const HUB = { shellR: 14, shellHalf: 32, flangeR: 24, flangeZ: 28, flangeT: 5, axleR: 6 };

export const RIM = {
  /** Carbon deep rim lathe profile around the axle: [offset below wheel radius R, lateral y]. */
  lathe: [
    [27, -12],
    [60, -10],
    [72, -4],
    [73, 0],
    [72, 4],
    [60, 10],
    [27, 12],
  ] as ReadonlyArray<[number, number]>,
  /** 2D side view: carbon rim band, tyre stroke and spoke widths. */
  band2D: 44,
  tyre2D: 28,
  spoke2D: 2.2,
  /** Spokes end this far inside the wheel radius (3D). */
  spokeEnd: 84,
} as const;

export const CHAINRING = {
  big: { teeth: 52, outer: 107, root: 102, hole: 86, depth: 4 },
  small: { teeth: 36, outer: 74, root: 69, hole: 54, depth: 4 },
  spiderArms: 4,
  spiderRadius: 88,
  cassette: { rings: 11, outerRadius: 72, innerRadius: 24 },
  crankRadius: [15, 10] as [number, number],
} as const;
