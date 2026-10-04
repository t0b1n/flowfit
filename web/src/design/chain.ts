/**
 * The drive chain as one closed path in the side plane (x forward, y up, mm), shared by the 2D side view and the 3D
 * links. It wraps the big chainring, the cog in use and the two derailleur pulleys (an S-bend through the cage):
 *
 *   ring (CCW) → top run → cog (CCW) → upper pulley (CW) → lower pulley (CCW) → bottom run → ring
 *
 * Every wheel is a circle at its pitch radius. Between two circles the chain runs on their common tangent (outer
 * tangent when they turn the same way, crossing tangent when they turn opposite ways), and wraps each circle between
 * the tangent it arrives on and the one it leaves on.
 */
import { CASSETTE, CHAINRING, RD } from "./bikeProfiles";

export interface Wheel2 {
  x: number;
  y: number;
  /** pitch radius: the chain's roller centres run on it */
  r: number;
  /** +1 counter-clockwise (y up), −1 clockwise */
  turn: 1 | -1;
}

/** Pitch radius of a sprocket with `teeth` teeth on a 12.7 mm chain. */
export const pitchRadius = (teeth: number): number => CASSETTE.pitch / 2 / Math.sin(Math.PI / teeth);

/** The cog the chain sits on (middle of the cassette: the one on the chain line, 17 teeth). */
export const CHAIN_COG_TEETH = CASSETTE.teeth[6];

export type Leg =
  | { kind: "line"; from: [number, number]; to: [number, number]; length: number }
  | { kind: "arc"; centre: [number, number]; r: number; a0: number; sweep: number; turn: 1 | -1; length: number };

export interface ChainPath {
  legs: Leg[];
  length: number;
  /** number of 12.7 mm pitches (roller centres): even, so inner and outer links alternate around the loop */
  links: number;
  /** actual spacing of the roller centres: the loop length over `links` (within 1% of 12.7 mm) */
  pitch: number;
  /** point and heading (radians, direction of travel) at arc length `s` along the loop */
  at(s: number): { x: number; y: number; angle: number };
  /** the loop as polyline points, `step` mm apart (for drawing) */
  polyline(step?: number): Array<[number, number]>;
}

/** Unit-circle point where a chain moving in direction `phi` touches a wheel turning `turn` ways. */
const touch = (w: Wheel2, phi: number): [number, number] => [w.x + w.turn * w.r * Math.sin(phi), w.y - w.turn * w.r * Math.cos(phi)];

/** Heading of the tangent run that leaves wheel `a` and arrives on wheel `b`. */
function tangentHeading(a: Wheel2, b: Wheel2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  const k = (b.turn * b.r - a.turn * a.r) / d;
  return Math.atan2(dy, dx) + Math.asin(Math.max(-1, Math.min(1, -k)));
}

const TAU = Math.PI * 2;
const wrap = (a: number): number => ((a % TAU) + TAU) % TAU;

/** Closed chain loop around `wheels` (in running order). */
export function chainLoop(wheels: readonly Wheel2[]): ChainPath {
  const n = wheels.length;
  const heading = wheels.map((w, i) => tangentHeading(w, wheels[(i + 1) % n])); // leaving wheel i
  const legs: Leg[] = [];
  for (let i = 0; i < n; i++) {
    const w = wheels[i];
    const phiIn = heading[(i + n - 1) % n];
    const phiOut = heading[i];
    // heading turns the same way as the wheel, so the wrapped angle is the heading change in that direction
    const sweep = wrap(w.turn * (phiOut - phiIn));
    // the touch point at heading φ sits at polar angle φ − turn·90° on the wheel
    const a0 = phiIn - (w.turn * Math.PI) / 2;
    legs.push({ kind: "arc", centre: [w.x, w.y], r: w.r, a0, sweep, turn: w.turn, length: sweep * w.r });
    const from = touch(w, phiOut);
    const next = wheels[(i + 1) % n];
    const to = touch(next, phiOut);
    legs.push({ kind: "line", from, to, length: Math.hypot(to[0] - from[0], to[1] - from[1]) });
  }
  const length = legs.reduce((s, l) => s + l.length, 0);
  const links = 2 * Math.round(length / (2 * CASSETTE.pitch));
  const pitch = length / links;

  const at = (s0: number) => {
    let s = ((s0 % length) + length) % length;
    for (const l of legs) {
      if (s <= l.length) {
        if (l.kind === "line") {
          const t = l.length > 0 ? s / l.length : 0;
          return { x: l.from[0] + (l.to[0] - l.from[0]) * t, y: l.from[1] + (l.to[1] - l.from[1]) * t, angle: Math.atan2(l.to[1] - l.from[1], l.to[0] - l.from[0]) };
        }
        const a = l.a0 + l.turn * (s / l.r);
        return { x: l.centre[0] + l.r * Math.cos(a), y: l.centre[1] + l.r * Math.sin(a), angle: a + (l.turn * Math.PI) / 2 };
      }
      s -= l.length;
    }
    const l = legs[legs.length - 1] as Extract<Leg, { kind: "line" }>;
    return { x: l.to[0], y: l.to[1], angle: Math.atan2(l.to[1] - l.from[1], l.to[0] - l.from[0]) };
  };
  const polyline = (step = 4) => {
    const m = Math.max(8, Math.ceil(length / step));
    const pts: Array<[number, number]> = [];
    for (let i = 0; i <= m; i++) {
      const p = at((i / m) * length);
      pts.push([p.x, p.y]);
    }
    return pts;
  };
  return { legs, length, links, pitch, at, polyline };
}

/** The bike's chain: big ring at the bottom bracket, the 17T cog on the rear axle, and the two cage pulleys. */
export function bikeChain(bb: { x: number; y: number }, rearAxle: { x: number; y: number }): ChainPath {
  const pulleyR = pitchRadius(RD.pulleyTeeth);
  return chainLoop([
    { x: bb.x, y: bb.y, r: pitchRadius(CHAINRING.big.teeth), turn: 1 },
    { x: rearAxle.x, y: rearAxle.y, r: pitchRadius(CHAIN_COG_TEETH), turn: 1 },
    { x: rearAxle.x + RD.upper.x, y: rearAxle.y + RD.upper.y, r: pulleyR, turn: -1 },
    { x: rearAxle.x + RD.lower.x, y: rearAxle.y + RD.lower.y, r: pulleyR, turn: 1 },
  ]);
}
