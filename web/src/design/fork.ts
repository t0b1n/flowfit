/**
 * Carbon road fork profile (after the ENVE Road fork: straight tapered blades, a full rounded crown shoulder that
 * runs into the blade's leading edge, rounded thru-axle dropout tips). Shared by the 2D side view (filled outline)
 * and the 3D meshes (lofted blades + extruded crown), so the two views agree by construction.
 *
 * The blade follows the crown → axle chord, so the same profile fits any fork length, offset and head angle: the
 * crown top sits at the head-tube bottom and the dropout tip is a half-disc round the front axle. Widths are in mm,
 * measured off the chord: `front` toward the leading edge, `rear` toward the wheel's back, `lat` half-width across
 * the bike. Approximated from a three-quarter product photo; proportions, not a dimension drawing.
 */
export type ForkStation = [d: number, front: number, rear: number, lat: number];

export const FORK = {
  /** stations measured down from the crown top (head-tube bottom) */
  crown: [
    [0, 23, 23, 15],
    [6, 27, 25, 15],
    [18, 28, 22, 14],
    [40, 24, 17, 13],
    [75, 19.5, 14.5, 12],
    [130, 17.5, 13.5, 11.5],
  ] as ForkStation[],
  /** stations measured up from the front axle; the blade tapers linearly between the two tables */
  tip: [
    [100, 15.5, 12, 10],
    [40, 14, 11, 8.5],
    [16, 14, 12.5, 7],
    [0, 14, 14, 7],
  ] as ForkStation[],
  /** crown depth (down the chord) drawn as one solid across both blades in 3D */
  crownDepth: 40,
  /** thru-axle end cap radius (2D) */
  axleCapR: 8,
};

type P2 = { x: number; y: number };

export interface ForkFrame {
  /** unit chord, crown → axle */
  u: P2;
  /** unit normal toward the leading edge (forward) */
  n: P2;
  len: number;
}

export interface ForkSection {
  /** point on the chord, in bike coordinates */
  c: P2;
  front: number;
  rear: number;
  lat: number;
}

export function forkFrame(crown: P2, axle: P2): ForkFrame {
  const dx = axle.x - crown.x;
  const dy = axle.y - crown.y;
  const len = Math.hypot(dx, dy) || 1;
  const u = { x: dx / len, y: dy / len };
  // chord points down, so (−u.y, u.x) points forward
  return { u, n: { x: -u.y, y: u.x }, len };
}

/** Sections crown → axle (the dropout's round tip is not included; see `forkOutline`). */
export function forkSections(crown: P2, axle: P2): ForkSection[] {
  const { u, len } = forkFrame(crown, axle);
  const tipFrom = FORK.tip.map(([d, f, r, l]) => [len - d, f, r, l] as ForkStation);
  // a short fork drops the crown stations that would overlap the dropout
  const stations = [...FORK.crown.filter(([d]) => d < tipFrom[0][0]), ...tipFrom];
  return stations.map(([d, front, rear, lat]) => ({ c: { x: crown.x + u.x * d, y: crown.y + u.y * d }, front, rear, lat }));
}

/** Side outline (bike coordinates, y up): leading edge down, round dropout tip, trailing edge back up. */
export function forkOutline(crown: P2, axle: P2, tipSteps = 12): Array<[number, number]> {
  const { u, n } = forkFrame(crown, axle);
  const secs = forkSections(crown, axle);
  const front = secs.map(({ c, front: f }) => [c.x + n.x * f, c.y + n.y * f] as [number, number]);
  const rear = secs.map(({ c, rear: r }) => [c.x - n.x * r, c.y - n.y * r] as [number, number]);
  const r = FORK.tip[FORK.tip.length - 1][1];
  const tip: Array<[number, number]> = [];
  for (let i = 1; i < tipSteps; i++) {
    const a = (i / tipSteps) * Math.PI; // from +n through +u to −n
    tip.push([axle.x + (n.x * Math.cos(a) + u.x * Math.sin(a)) * r, axle.y + (n.y * Math.cos(a) + u.y * Math.sin(a)) * r]);
  }
  return [...front, ...tip, ...rear.reverse()];
}

/** The crown block's side outline: the top `FORK.crownDepth` mm of `forkOutline`, closed across the chord. */
export function forkCrownOutline(crown: P2, axle: P2): Array<[number, number]> {
  const { u, n } = forkFrame(crown, axle);
  const secs = forkSections(crown, axle).filter(({ c }) => (c.x - crown.x) * u.x + (c.y - crown.y) * u.y <= FORK.crownDepth);
  const front = secs.map(({ c, front: f }) => [c.x + n.x * f, c.y + n.y * f] as [number, number]);
  const rear = secs.map(({ c, rear: r }) => [c.x - n.x * r, c.y - n.y * r] as [number, number]);
  return [...front, ...rear.reverse()];
}
