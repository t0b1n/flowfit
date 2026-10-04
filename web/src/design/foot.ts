/**
 * Shoe placement shared by the 2D side view and the 3D pedalling legs. The solver puts the ball of the foot on
 * the cleat point (directly above the pedal spindle); the traced shoe (shoeModels.ts) is drawn flat with its
 * ball station over the cleat and its sole on the pedal body, so shoe, cleat and pedal always touch.
 * The drawn ankle (the end of the drawn shin) is the shoe's malleolus station inside the collar: drawing only,
 * the IK solves to the unshifted cleat in both views.
 * Points are {x, y} in mm, y up.
 */
import { lerpTable } from "../saddleModels";
import { SWORKS_TORCH, type ShoeTrace } from "../shoeModels";

/** Pedal body half-thickness (7) plus cleat (5): sole height above the spindle axis at the ball of the foot. */
export const SOLE_ABOVE_SPINDLE = 12;
/** Pedal body: length (x), thickness (y), width (z), mm. */
export const PEDAL_BODY: [number, number, number] = [92, 14, 58];

export const SHOE: ShoeTrace = SWORKS_TORCH;

export interface ShoePlacement {
  /** heel end of the shoe at ground-line height (the shoe's local origin) */
  heel: { x: number; y: number };
  /** shoe length (mm): the local frame scales uniformly by this */
  len: number;
}

/**
 * The shoe whose ball station is over `cleat`: `footLengthMm` is rider.foot_length (EU size × 6.67, i.e. the
 * shoe length). The traced sole bottom at the ball sits SOLE_ABOVE_SPINDLE above the cleat point.
 */
export function shoePlacement(cleat: { x: number; y: number }, footLengthMm: number, s: ShoeTrace = SHOE): ShoePlacement {
  const len = footLengthMm;
  return {
    heel: { x: cleat.x - s.ball * len, y: cleat.y + SOLE_ABOVE_SPINDLE - lerpTable(s.bottom, s.ball) * len },
    len,
  };
}

/** Drawn ankle offset from the cleat point: `setback` behind it, `rise` above it (mm). */
export function ankleOffset(footLengthMm: number, s: ShoeTrace = SHOE): { setback: number; rise: number } {
  const len = footLengthMm;
  return {
    setback: (s.ball - s.ankle.u) * len,
    rise: SOLE_ABOVE_SPINDLE + (s.ankle.h - lerpTable(s.bottom, s.ball)) * len,
  };
}

/** Drawn ankle point for a cleat point. */
export function drawnAnkle(cleat: { x: number; y: number }, footLengthMm: number): { x: number; y: number } {
  const o = ankleOffset(footLengthMm);
  return { x: cleat.x - o.setback, y: cleat.y + o.rise };
}
