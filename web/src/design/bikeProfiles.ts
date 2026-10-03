/**
 * Shared bike shape numbers, consumed by the 3D meshes (`bike3d.ts`) and the 2D side view
 * (filled tapered polygons). STUB: DS lands the numbers from the plans; track E owns and may refine this file.
 * All lengths in mm. Sources: 3D plan §6 (tube radii), mockups/src/bike3.js (rim, chainrings), Shimano CS-R9200 (cassette).
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

/** Where the top and down tube centrelines meet the head tube axis: mm in from the head tube's top / bottom end. */
export const HEAD_TUBE_JOIN = { top: 22, down: 24 };

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
  /**
   * Carbon deep rim cross-section as one closed polygon, [offset below the wheel radius R (mm), lateral y (mm)]:
   * the outer skin runs from the left bead hook, down the sidewall, round the spoke bed and up the other sidewall;
   * then the U of the tyre channel (hook lips 3.5 mm thick, channel floor 8 mm below the hook) closes the loop.
   * Revolved by `rimGeometry` (bike3d.ts), which orders it so the faces point out of the solid.
   */
  section: [
    [26, -12.5],
    [40, -13],
    [58, -12],
    [68, -8],
    [72, -3],
    [72, 3],
    [68, 8],
    [58, 12],
    [40, 13],
    [26, 12.5],
    [26, 9],
    [34, 8.5],
    [34, -8.5],
    [26, -9],
  ] as ReadonlyArray<[number, number]>,
  /** Offset of the spoke bed (inner surface) below R: spokes end here. */
  spokeBed: 72,
  /** 2D side view: carbon rim band, tyre stroke and spoke widths. */
  band2D: 44,
  tyre2D: 28,
  spoke2D: 2.2,
} as const;

export const CHAINRING = {
  big: { teeth: 52, outer: 107, root: 102, hole: 86, depth: 4 },
  small: { teeth: 36, outer: 74, root: 69, hole: 54, depth: 4 },
  spiderArms: 4,
  spiderRadius: 88,
  crankRadius: [15, 10] as [number, number],
} as const;

/** Shimano Dura-Ace CS-R9200, 12-speed 11-34. Teeth are listed largest cog first (the one nearest the spokes). */
export const CASSETTE = {
  teeth: [34, 30, 27, 24, 21, 19, 17, 15, 14, 13, 12, 11] as readonly number[],
  /** chain pitch (mm) */
  pitch: 12.7,
  /** tooth height above the pitch circle */
  toothHeight: 2.2,
  /** radial depth of a tooth, tip to valley */
  toothDepth: 3.4,
  /** axial distance from the wheel centre to the largest cog */
  z0: 42,
  /** axial distance between cogs */
  spacing: 3.4,
  thickness: 2.2,
  /** black lockring on the smallest cog */
  lockringR: 19,
} as const;

/** Tip radius of a cog: pitch circle plus tooth height. */
export const cogTipRadius = (teeth: number): number => CASSETTE.pitch / 2 / Math.sin(Math.PI / teeth) + CASSETTE.toothHeight;
