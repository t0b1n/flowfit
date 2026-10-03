/**
 * Carbon road fork: one moulded piece. Seen from the front the blades rise straight from the dropouts, converge a
 * little and arch into each other under the head tube (no separate crown block); seen from the side the crown is a
 * rounded shoulder that runs into the blade's leading edge, and each dropout ends in a rounded thru-axle tip.
 *
 * Everything hangs off the crown → axle chord, so the same profile fits any fork length, offset and head angle:
 * `d` is the distance down the chord from the crown top (head-tube bottom). Widths are mm: `front` toward the
 * leading edge, `rear` toward the back, `lat` the blade's half-thickness seen from the front. The 2D side view, the
 * 2D front view and the 3D mesh all come from `forkSpine` / `forkOutline`, so they agree by construction.
 * Proportions approximated from product photos, not a dimension drawing.
 */
export type ForkStation = [d: number, front: number, rear: number, lat: number];

export const FORK = {
  /** stations measured down from the crown top; the first is the arch apex (crown bridge centreline) */
  crown: [
    [11, 27, 23, 11],
    [30, 25, 19, 10.5],
    [60, 20.5, 15.5, 10],
    [120, 18, 14, 9.5],
  ] as ForkStation[],
  /** stations measured up from the front axle; the blade tapers linearly between the two tables */
  tip: [
    [100, 15.5, 12, 8],
    [40, 14, 11, 7.5],
    [16, 14, 12.5, 7],
    [0, 14, 14, 7],
  ] as ForkStation[],
  /** blade centreline half-spread at the dropouts (100 mm front hub) */
  halfSpread: 50,
  /** blade centreline half-spread where the blades meet the arch, as a fraction of `halfSpread` */
  topSpread: 0.85,
  /** thru-axle end cap radius */
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

export function forkFrame(crown: P2, axle: P2): ForkFrame {
  const dx = axle.x - crown.x;
  const dy = axle.y - crown.y;
  const len = Math.hypot(dx, dy) || 1;
  const u = { x: dx / len, y: dy / len };
  // chord points down, so (−u.y, u.x) points forward
  return { u, n: { x: -u.y, y: u.x }, len };
}

/** Section widths `d` mm down the chord of a fork `len` long (clamped to the ends of the tables). */
export function forkWidths(d: number, len: number): { front: number; rear: number; lat: number } {
  const tipFrom = FORK.tip.map(([t, f, r, l]) => [len - t, f, r, l] as ForkStation);
  // a short fork drops the crown stations that would overlap the dropout
  const st = [...FORK.crown.filter(([c]) => c < tipFrom[0][0]), ...tipFrom];
  let i = 0;
  while (i < st.length - 2 && d > st[i + 1][0]) i++;
  const [d0, f0, r0, l0] = st[i];
  const [d1, f1, r1, l1] = st[i + 1];
  const k = Math.min(1, Math.max(0, (d - d0) / (d1 - d0 || 1)));
  return { front: f0 + (f1 - f0) * k, rear: r0 + (r1 - r0) * k, lat: l0 + (l1 - l0) * k };
}

/** Side outline (bike coordinates, y up): rounded crown cap, leading edge down, round dropout tip, trailing edge up. */
export function forkOutline(crown: P2, axle: P2, steps = 12): Array<[number, number]> {
  const { u, n, len } = forkFrame(crown, axle);
  const at = (d: number, w: number): [number, number] => [crown.x + u.x * d + n.x * w, crown.y + u.y * d + n.y * w];
  const apex = FORK.crown[0][0];
  const ds = [...FORK.crown.map(([d]) => d), ...FORK.tip.map(([d]) => len - d)].filter((d) => d >= apex && d <= len);
  const W = ds.map((d) => forkWidths(d, len));
  const out: Array<[number, number]> = [];
  // crown cap: the arch apex section seen from the side (half-ellipse over the top, rear → front)
  const a = forkWidths(apex, len);
  for (let i = 0; i < steps; i++) {
    const phi = Math.PI * (1 - i / steps);
    const w = Math.cos(phi) * (Math.cos(phi) > 0 ? a.front : a.rear);
    out.push(at(apex - Math.sin(phi) * a.lat, w));
  }
  ds.forEach((d, i) => out.push(at(d, W[i].front)));
  const r = W[W.length - 1].front;
  for (let i = 1; i < steps; i++) {
    const phi = (i / steps) * Math.PI; // dropout tip: +n through +u to −n
    out.push(at(len + Math.sin(phi) * r, Math.cos(phi) * r));
  }
  for (let i = ds.length - 1; i >= 0; i--) out.push(at(ds[i], -W[i].rear));
  return out;
}

/** One cross-section of the fork spine, in the fork plane: `s` down the chord, `z` across the bike from its centre. */
export interface ForkSpinePoint {
  s: number;
  z: number;
  /** unit tangent along the spine, in (s, z) */
  ts: number;
  tz: number;
  front: number;
  rear: number;
  lat: number;
}

/**
 * The fork's centreline as one piece: left dropout tip → left blade → arch under the head tube → right blade →
 * right dropout tip. The tips shrink to a point (the side view's round tip), closing both ends.
 */
export function forkSpine(len: number, halfSpread = FORK.halfSpread, archN = 14, bladeN = 16, tipN = 8): ForkSpinePoint[] {
  const sa = FORK.crown[0][0];
  const wt = halfSpread * FORK.topSpread;
  const sj = sa + wt * 0.9;
  // blade: straight from (sj, wt) to (len, halfSpread)
  const bl = Math.hypot(len - sj, halfSpread - wt) || 1;
  const dir = { s: (len - sj) / bl, z: (halfSpread - wt) / bl };
  // arch: cubic Bézier from the apex (tangent across the bike) into the blade (tangent along it)
  const k = 0.55;
  const P = [
    { s: sa, z: 0 },
    { s: sa, z: k * wt },
    { s: sj - dir.s * k * (sj - sa), z: wt - dir.z * k * (sj - sa) },
    { s: sj, z: wt },
  ];
  const bez = (t: number) => {
    const m = 1 - t;
    const c = [m * m * m, 3 * m * m * t, 3 * m * t * t, t * t * t];
    return { s: c.reduce((a, ci, i) => a + ci * P[i].s, 0), z: c.reduce((a, ci, i) => a + ci * P[i].z, 0) };
  };
  // the right half (z ≥ 0), apex → tip; the left half is its mirror
  const half: Array<{ s: number; z: number; w?: { front: number; rear: number; lat: number } }> = [];
  for (let i = 0; i < archN; i++) half.push(bez(i / archN));
  for (let i = 0; i <= bladeN; i++) half.push({ s: sj + dir.s * bl * (i / bladeN), z: wt + dir.z * bl * (i / bladeN) });
  const end = forkWidths(len, len);
  for (let i = 1; i <= tipN; i++) {
    const phi = (i / tipN) * (Math.PI / 2);
    const c = Math.cos(phi);
    const d = Math.sin(phi) * end.front;
    half.push({ s: len + dir.s * d, z: halfSpread + dir.z * d, w: { front: end.front * c, rear: end.rear * c, lat: end.lat * c } });
  }
  const pts = [...half.slice(1).reverse().map((p) => ({ ...p, z: -p.z })), ...half];
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const l = Math.hypot(b.s - a.s, b.z - a.z) || 1;
    return { s: p.s, z: p.z, ts: (b.s - a.s) / l, tz: (b.z - a.z) / l, ...(p.w ?? forkWidths(p.s, len)) };
  });
}

/** Front-view outline in (z, s): the spine offset by ±lat across it. Map s to height with the chord's vertical. */
export function forkFrontOutline(len: number, halfSpread = FORK.halfSpread): Array<[z: number, s: number]> {
  const sp = forkSpine(len, halfSpread);
  // in-plane normal to the spine (tz, −ts): the blade's half-thickness seen from the front
  const a = sp.map((p) => [p.z - p.ts * p.lat, p.s + p.tz * p.lat] as [number, number]);
  const b = sp.map((p) => [p.z + p.ts * p.lat, p.s - p.tz * p.lat] as [number, number]);
  return [...a, ...b.reverse()];
}
