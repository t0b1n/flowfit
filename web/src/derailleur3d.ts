/**
 * derailleur3d.ts — Shimano Dura-Ace RD-R9250 style rear derailleur, hung off the frame.
 *
 * The drive-side dropout's axle end carries a hanger plate outboard of the cassette; the plate runs back and down to the
 * mount bolt, the B-knuckle sits on that bolt, two links (a thick outer one and a thin inner one) run forward to the
 * cage pivot, and the cage hangs below it around two toothed pulleys at the chain line. Positions are in `RD`
 * (design/bikeProfiles.ts); the shapes are side-view outlines extruded along Z (outboard = +Z).
 */

import * as THREE from "three";
import { RD } from "./design/bikeProfiles";

export interface DerailleurMaterials {
  /** gloss black body (links, knuckles, cage) */
  body: THREE.Material;
  /** grey titanium bolt caps and pulley hubs */
  titanium: THREE.Material;
  /** black pulley wheels */
  pulley: THREE.Material;
  /** the frame colour (hanger plate, dropout boss) */
  frame: THREE.Material;
  /** dark metal (axle end) */
  axle: THREE.Material;
}

type Circle = readonly [x: number, y: number, r: number];
type Pt = readonly [number, number];

/** Convex hull of circles [x, y, r] (side view), extruded `depth` along +Z from z = 0. */
export function hullGeometry(circles: readonly Circle[], depth: number): THREE.BufferGeometry {
  const pts = circles
    .flatMap(([cx, cy, r]) => Array.from({ length: 28 }, (_, i) => new THREE.Vector2(cx + r * Math.cos((i / 28) * Math.PI * 2), cy + r * Math.sin((i / 28) * Math.PI * 2))))
    .sort((p, q) => p.x - q.x || p.y - q.y);
  const cross = (o: THREE.Vector2, a: THREE.Vector2, b: THREE.Vector2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const hull: THREE.Vector2[] = [];
  for (const half of [pts, [...pts].reverse()]) {
    const start = hull.length;
    for (const p of half) {
      while (hull.length >= start + 2 && cross(hull[hull.length - 2], hull[hull.length - 1], p) <= 0) hull.pop();
      hull.push(p);
    }
    hull.pop();
  }
  return new THREE.ExtrudeGeometry(new THREE.Shape(hull), { depth, bevelEnabled: false });
}

/** A closed polygon with every corner rounded to radius `r`, with optional rounded window holes, extruded `depth` along +Z. */
export function roundedPolyGeometry(poly: readonly Pt[], r: number, depth: number, holes: readonly (readonly Pt[])[] = []): THREE.BufferGeometry {
  /** trace `pts` as a rounded loop into `path` (a Shape or a hole Path) */
  const trace = (path: THREE.Path, pts: readonly Pt[]) => {
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const prev = new THREE.Vector2(...pts[(i + n - 1) % n]);
      const cur = new THREE.Vector2(...pts[i]);
      const next = new THREE.Vector2(...pts[(i + 1) % n]);
      const a = prev.clone().sub(cur);
      const b = next.clone().sub(cur);
      const k = Math.min(r, a.length() / 2, b.length() / 2);
      const p0 = cur.clone().add(a.normalize().multiplyScalar(k));
      const p1 = cur.clone().add(b.normalize().multiplyScalar(k));
      if (i === 0) path.moveTo(p0.x, p0.y);
      else path.lineTo(p0.x, p0.y);
      path.quadraticCurveTo(cur.x, cur.y, p1.x, p1.y);
    }
    path.closePath();
  };
  const sh = new THREE.Shape();
  trace(sh, poly);
  for (const h of holes) {
    const hp = new THREE.Path();
    trace(hp, h);
    sh.holes.push(hp);
  }
  return new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false, curveSegments: 6 });
}

/** A toothed wheel (flat-topped teeth like the cassette's), extruded `depth` along +Z, centred on z = 0. */
export function pulleyGeometry(): THREE.BufferGeometry {
  const { pulleyTeeth: n, pulleyTip: tip, pulleyRoot: root } = RD;
  const sh = new THREE.Shape();
  const pitch = (Math.PI * 2) / n;
  const prof: Array<[number, number]> = [[0.08, root], [0.22, tip], [0.5, tip], [0.64, root], [0.92, root]];
  let first = true;
  for (let k = 0; k < n; k++) {
    for (const [f, r] of prof) {
      const a = (k + f) * pitch;
      if (first) sh.moveTo(r * Math.cos(a), r * Math.sin(a));
      else sh.lineTo(r * Math.cos(a), r * Math.sin(a));
      first = false;
    }
  }
  sh.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, 0, 7, 0, Math.PI * 2, true);
  sh.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(sh, { depth: 8, bevelEnabled: false });
  g.translate(0, 0, -4);
  return g;
}

/**
 * The derailleur as one group, positioned in bike coordinates around `rear` (the rear axle). `prim` is the caller's
 * shape-keyed geometry cache, `pick` the debug-material hook.
 */
export function buildRearDerailleur(
  rear: readonly [number, number, number],
  mats: DerailleurMaterials,
  prim: <G extends THREE.BufferGeometry>(key: string, build: () => G) => G,
  pick: (part: string, m: THREE.Material) => THREE.Material = (_p, m) => m,
): THREE.Group {
  const g = new THREE.Group();
  g.name = "rear-derailleur";
  g.position.set(rear[0], rear[1], 0);
  const { mount: M, pivot: P, upper: U, lower: L, dropZ, chainZ } = RD;
  const hangZ = dropZ + 4; // the hanger sits just outboard of the dropout face, clear of the cassette lockring
  const body = pick("drivetrain", mats.body);
  const ti = pick("drivetrain", mats.titanium);
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rotX = false) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    if (rotX) m.rotation.x = Math.PI / 2;
    g.add(m);
    return m;
  };
  /** a disc (axis Z) of radius r from z0 to z1 at (x, y) */
  const disc = (key: string, r: number, z0: number, z1: number, x: number, y: number, mat: THREE.Material) =>
    add(prim(`rd|${key}`, () => new THREE.CylinderGeometry(r, r, z1 - z0, 24)), mat, x, y, (z0 + z1) / 2, true);

  // Dropout boss on the frame, and the axle end that carries the hanger out through the cassette bore
  disc("boss", 15, dropZ - 4, dropZ + 6, 0, 0, pick("drivetrain", mats.frame));
  disc("axle", 8, dropZ, hangZ + 2, 0, 0, pick("drivetrain", mats.axle));
  // Hanger plate (frame colour): dropout boss to the mount boss
  add(prim("rd|hanger", () => hullGeometry([[0, 0, 14], [M.x, M.y, 10]], 8)), pick("drivetrain", mats.frame), 0, 0, hangZ);
  disc("axlecap", 10, hangZ + 8, hangZ + 10, 0, 0, ti);
  // Mount bolt and B-knuckle: a rounded block on the bolt with a swelling cable cover to the rear
  disc("mountbolt", 7, hangZ, hangZ + 16, M.x, M.y, ti);
  add(prim("rd|knuckle", () => roundedPolyGeometry([[-20, 12], [14, 16], [20, -10], [10, -20], [-18, -16]], 5, 14)), body, M.x, M.y, hangZ + 8);
  disc("mountcap", 9, hangZ + 21, hangZ + 23, M.x, M.y, ti);
  // Outer link: a long slab from the knuckle to the pivot, deeper at the front where the cage hangs (flat top face)
  add(
    prim("rd|link-outer", () => roundedPolyGeometry([[M.x + 6, M.y + 16], [P.x - 6, P.y + 18], [P.x + 14, P.y + 12], [P.x + 16, P.y - 12], [P.x + 2, P.y - 18], [M.x + 14, M.y - 10]].map(([x, y]) => [x - M.x, y - M.y] as const), 6, 12)),
    body, M.x, M.y, hangZ + 8,
  );
  // Inner link: thinner, below and inboard of the outer one
  add(
    prim("rd|link-inner", () => roundedPolyGeometry([[M.x + 4, M.y - 14], [P.x - 8, P.y - 8], [P.x - 2, P.y - 20], [M.x + 8, M.y - 24]].map(([x, y]) => [x - M.x, y - M.y] as const), 4, 6)),
    body, M.x, M.y, hangZ - 23,
  );
  // Cage pivot knuckle and its bolt cap, spanning from the links in to the cage plates
  disc("pivot", 13, chainZ - 10, hangZ + 14, P.x, P.y, body);
  disc("pivotcap", 8, hangZ + 14, hangZ + 16, P.x, P.y, ti);
  // Cage plates. The outer plate is one curved arm: broad at the pivot, narrowing as it sweeps back and down, then
  // flaring into a triangular foot with a window that shows the lower pulley. The inner plate is fuller.
  const rel = (c: { x: number; y: number }, r: number): Circle => [c.x - P.x, c.y - P.y, r];
  const lx = L.x - P.x;
  const ly = L.y - P.y;
  const outline: Pt[] = [
    [-20, 14], [20, 14], [30, -12], [24, -36], [16, -58], // front edge: pivot shield, then down
    [lx + 30, ly + 14], [lx + 26, ly - 24], [lx - 6, ly - 33], [lx - 34, ly - 26], [lx - 36, ly + 4], // foot round the (full-size) lower pulley
    [-36, -62], [-30, -40], [-24, -16], // back edge up to the pivot
  ];
  const window: Pt[] = [[lx - 20, ly + 12], [lx + 14, ly + 16], [lx + 6, ly - 16], [lx - 20, ly - 18]];
  add(prim("rd|cage-outer", () => roundedPolyGeometry(outline, 5, 4, [window])), body, P.x, P.y, chainZ + 10);
  add(prim("rd|cage-inner", () => hullGeometry([rel(P, 12), rel(U, 20), rel(L, 24)], 4)), body, P.x, P.y, chainZ - 14);
  // Toothed pulleys on the chain line, with titanium bolt heads through the cage
  for (const c of [U, L]) {
    // named so the animation can turn them with the chain (bike3d.ts `DriveAnim`)
    add(prim("rd|pulley", () => pulleyGeometry()), pick("drivetrain", mats.pulley), c.x, c.y, chainZ).name = c === U ? "rd-pulley-upper" : "rd-pulley-lower";
    disc(`pulleybolt|${c === L}`, 5, chainZ - 14, chainZ + 16, c.x, c.y, ti);
    disc(`pulleyhub|${c === L}`, 8, chainZ - 4, chainZ + 4, c.x, c.y, ti);
  }
  return g;
}
