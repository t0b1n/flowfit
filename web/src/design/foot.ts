/**
 * Shoe placement shared by the 2D side view and the 3D pedalling legs. The solver puts the ball of the foot on
 * the cleat point (directly above the pedal spindle) and the ankle ~19% of foot length behind it; the shoe is drawn
 * flat with its sole on the pedal body at the ball of the foot, so shoe, cleat and pedal always touch.
 * Points are {x, y} in mm, y up.
 */
import { bump, lerp } from "./riderBody";

/** Pedal body half-thickness (7) plus cleat (5): sole height above the spindle axis at the ball of the foot. */
export const SOLE_ABOVE_SPINDLE = 12;
/** Pedal body: length (x), thickness (y), width (z), mm. */
export const PEDAL_BODY: [number, number, number] = [92, 14, 58];

/** Shoe lathe radius at t ∈ [0,1] from heel to toe (mm, before height scaling `hs`). */
export const shoeRadius = (t: number, hs: number) => (lerp(34, 20, t) + 5 * bump(t, 0.3, 0.2)) * hs;

export interface ShoeAxis {
  heel: { x: number; y: number };
  toe: { x: number; y: number };
  len: number;
}

/** Heel→toe axis of the shoe whose ball of foot is at `cleat` (ankle setback = ankle distance behind the ball). */
export function shoeAxis(cleat: { x: number; y: number }, ankleSetbackMm: number, hs: number): ShoeAxis {
  const back = ankleSetbackMm + 38 * hs;
  const fwd = 90 * hs;
  const tBall = back / (back + fwd);
  const y = cleat.y + SOLE_ABOVE_SPINDLE + shoeRadius(tBall, hs); // axis height so the sole sits on the pedal
  return { heel: { x: cleat.x - back, y }, toe: { x: cleat.x + fwd, y }, len: back + fwd };
}
