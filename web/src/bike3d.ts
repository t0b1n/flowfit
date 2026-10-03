/**
 * bike3d.ts — Pure geometry helper for the 3D frame renderer.
 *
 * Converts a Geometry3DResponse (from /geometry3d) into a list of Tube3D
 * descriptors that BikeScene3D renders as cylinder meshes.
 *
 * Coordinate system (matches backend origin = bb, units mm):
 *   X — forward,  Y — up,  Z — lateral (positive = rider's right, the drive side)
 */

import * as THREE from "three";
import { debugMaterial, partForTube } from "./debug";
import { CHAINRING, HUB, RIM, SEATSTAY_DROP, STEM, TUBE_PROFILE, type TubeName } from "./design/bikeProfiles";
import { limbGeometry, orientBetween } from "./riderMesh";
import { forkFrame, forkSpine } from "./design/fork";
import type { Cockpit } from "./cockpit";
import { GeometryCache, computeNormals, k1 } from "./scene3d/geometryCache";

export interface Geometry3DPoint {
  name: string;
  pos: [number, number, number];
  group: string;
}

export interface Geometry3DEdge {
  a: string;
  b: string;
  group: string;
}

export interface Geometry3DResponse {
  version: string;
  points: Geometry3DPoint[];
  edges: Geometry3DEdge[];
  pose_metrics: Record<string, number>;
  frame: Record<string, number>;
  components: Record<string, number>;
  rider: Record<string, number>;
  constraints: Record<string, unknown>;
  /** cockpit model (bar centreline, hood placement); absent in older JSON exports */
  cockpit?: Cockpit;
}

export interface Tube3D {
  start: [number, number, number];
  end: [number, number, number];
  /** Outer radius in mm */
  radius: number;
  group: string;
  /** Resolved tube name (e.g. "down_tube", "stem") — drives material choice */
  name: string;
}

// Tube radii by edge group / tube name
const TUBE_RADIUS: Record<string, number> = {
  // frame structural
  seat_tube: 14,
  top_tube: 14,
  down_tube: 16,
  head_tube: 16,
  chainstay: 12,
  seatstay: 8,
  fork: 10,
  seatpost: 8,
  steerer: 14,
  stem: 11,
  bar: 11,
  bar_ramp: 9,
  bar_drop: 9,
  // fallback by group
  frame: 10,
};

// Which tube name to use for a given edge a→b pair
const EDGE_TUBE_NAME: Record<string, string> = {
  "bb→seat_cluster": "seat_tube",
  "seat_cluster→seat_tube_top": "seat_tube",
  "seat_cluster→head_tube_top": "top_tube",
  "bb→head_tube_bottom": "down_tube",
  "head_tube_top→head_tube_bottom": "head_tube",
  "bb→chainstay_r": "chainstay",
  "bb→chainstay_l": "chainstay",
  "seat_cluster→chainstay_r": "seatstay",
  "seat_cluster→chainstay_l": "seatstay",
  "head_tube_bottom→fork_r": "fork",
  "head_tube_bottom→fork_l": "fork",
  "seat_tube_top→seatpost_top": "seatpost",
  "head_tube_top→steerer_top": "steerer",
  "steerer_top→stem_pivot": "stem_clamp",
  "stem_pivot→bar_clamp": "stem",
  "bar_clamp→bar_top_r": "bar",
  "bar_clamp→bar_top_l": "bar",
  "bar_top_r→hoods_r": "bar_ramp",
  "bar_top_l→hoods_l": "bar_ramp",
  "hoods_r→bar_drop_r": "bar_drop",
  "hoods_l→bar_drop_l": "bar_drop",
};

function edgeKey(a: string, b: string): string {
  return `${a}→${b}`;
}

function tubeName(a: string, b: string, group: string): string {
  return EDGE_TUBE_NAME[edgeKey(a, b)] ?? group;
}

function tubeRadius(a: string, b: string, group: string): number {
  const key = edgeKey(a, b);
  const name = EDGE_TUBE_NAME[key];
  if (name) return TUBE_RADIUS[name] ?? TUBE_RADIUS[group] ?? 8;
  return TUBE_RADIUS[group] ?? 8;
}

export function buildTubes(
  points: Geometry3DPoint[],
  edges: Geometry3DEdge[]
): Tube3D[] {
  const ptMap = new Map<string, [number, number, number]>();
  for (const p of points) {
    ptMap.set(p.name, p.pos);
  }

  const tubes: Tube3D[] = [];
  for (const edge of edges) {
    const start = ptMap.get(edge.a);
    const end = ptMap.get(edge.b);
    if (!start || !end) continue;
    tubes.push({
      start,
      end,
      radius: tubeRadius(edge.a, edge.b, edge.group),
      group: edge.group,
      name: tubeName(edge.a, edge.b, edge.group),
    });
  }
  return tubes;
}

export function getWheelCenters(points: Geometry3DPoint[]): {
  rear: [number, number, number] | null;
  front: [number, number, number] | null;
} {
  const rear = points.find((p) => p.name === "rear_axle")?.pos ?? null;
  const front = points.find((p) => p.name === "front_axle")?.pos ?? null;
  return { rear, front };
}

export function getNamedPoint(
  points: Geometry3DPoint[],
  name: string
): [number, number, number] | null {
  return points.find((p) => p.name === name)?.pos ?? null;
}

// ── Mannequin primitives ────────────────────────────────────────────────────

export type PrimitiveType = "cylinder" | "sphere" | "capsule" | "tapered_cylinder";

export interface MannequinPart3D {
  type: PrimitiveType;
  start: [number, number, number];
  end: [number, number, number];
  radiusStart: number;
  radiusEnd: number;
  group: string;
}

interface PartSpec {
  type: PrimitiveType;
  baseRadius: number;
  /** Weight sensitivity exponent: radius = baseRadius * (weight/75)^sensitivity */
  sensitivity: number;
  /** For tapered_cylinder: end radius base value */
  baseRadiusEnd?: number;
}

// Base radii derived from 2D SVG stroke widths (strokeWidth = diameter, so radius = strokeWidth/2).
// 2D reference at height=1800: torso 175, thigh 110, shin 82, upper arm 70, forearm 55, head 88r.
export const MANNEQUIN_EDGE_SPEC: Record<string, PartSpec> = {
  mannequin_foot:          { type: "tapered_cylinder", baseRadius: 41, sensitivity: 0.10, baseRadiusEnd: 25 },
  mannequin_shin:          { type: "cylinder",         baseRadius: 48, sensitivity: 0.15 },
  mannequin_thigh:         { type: "cylinder",         baseRadius: 65, sensitivity: 0.35 },
  mannequin_hip_bar:       { type: "cylinder",         baseRadius: 75, sensitivity: 0.40 },
  mannequin_lower_torso:   { type: "cylinder",         baseRadius: 95, sensitivity: 0.45 },
  mannequin_upper_torso:   { type: "cylinder",         baseRadius: 105, sensitivity: 0.45 },
  mannequin_neck:          { type: "cylinder",         baseRadius: 28, sensitivity: 0.25 },
  mannequin_shoulder_bar:  { type: "cylinder",         baseRadius: 35, sensitivity: 0.20 },
  mannequin_upper_arm:     { type: "cylinder",         baseRadius: 35, sensitivity: 0.20 },
  mannequin_forearm:       { type: "cylinder",         baseRadius: 28, sensitivity: 0.10 },
  mannequin_hand:          { type: "capsule",          baseRadius: 23, sensitivity: 0.05 },
};

// Joint sphere radii — smaller than adjacent limbs so they sit recessed in articulation gaps.
export const MANNEQUIN_JOINT_SPEC: Record<string, PartSpec> = {
  head_center:      { type: "sphere", baseRadius: 88, sensitivity: 0.05 },
  spine_joint:      { type: "sphere", baseRadius: 80, sensitivity: 0.45 },
  shoulder_r:       { type: "sphere", baseRadius: 30, sensitivity: 0.20 },
  shoulder_l:       { type: "sphere", baseRadius: 30, sensitivity: 0.20 },
  elbow_r:          { type: "sphere", baseRadius: 28, sensitivity: 0.20 },
  elbow_l:          { type: "sphere", baseRadius: 28, sensitivity: 0.20 },
  wrist_r:          { type: "sphere", baseRadius: 22, sensitivity: 0.10 },
  wrist_l:          { type: "sphere", baseRadius: 22, sensitivity: 0.10 },
  hip_r:            { type: "sphere", baseRadius: 55, sensitivity: 0.40 },
  hip_l:            { type: "sphere", baseRadius: 55, sensitivity: 0.40 },
  knee_r:           { type: "sphere", baseRadius: 52, sensitivity: 0.35 },
  knee_l:           { type: "sphere", baseRadius: 52, sensitivity: 0.35 },
  ankle_r:          { type: "sphere", baseRadius: 34, sensitivity: 0.15 },
  ankle_l:          { type: "sphere", baseRadius: 34, sensitivity: 0.15 },
};

/** Fraction of segment length to trim from EACH end to reveal joint spheres */
export const GAP_FRACTION = 0.06;

export function scaleRadius(base: number, weightKg: number, sensitivity: number): number {
  const w = weightKg / 75;
  return base * Math.pow(w, sensitivity);
}

// Leg points/edges are excluded from the declarative mannequin when the
// pedaling animation owns them (AnimatedLegs mutates their transforms per frame).
export const LEG_POINT_NAMES = new Set([
  "cleat_r", "cleat_l", "ankle_r", "ankle_l", "knee_r", "knee_l",
]);
export const LEG_EDGE_GROUPS = new Set([
  "mannequin_foot", "mannequin_shin", "mannequin_thigh",
]);

/**
 * Build mannequin part descriptors from 3D points and edges.
 * Supports sphere joints, cylinders, capsules, and tapered cylinders.
 * Body part radii scale anatomically with rider weight.
 */
export function buildMannequinParts(
  points: Geometry3DPoint[],
  edges: Geometry3DEdge[],
  weightKg: number = 75,
): MannequinPart3D[] {
  const ptMap = new Map<string, [number, number, number]>();
  for (const p of points) {
    ptMap.set(p.name, p.pos);
  }

  const parts: MannequinPart3D[] = [];

  // Edge-based parts (cylinders, tapered cylinders, capsules)
  // Inset each segment to create articulation gaps that reveal joint spheres
  for (const edge of edges) {
    const spec = MANNEQUIN_EDGE_SPEC[edge.group];
    if (!spec) continue;
    const startPt = ptMap.get(edge.a);
    const endPt = ptMap.get(edge.b);
    if (!startPt || !endPt) continue;
    const r1 = scaleRadius(spec.baseRadius, weightKg, spec.sensitivity);
    const r2 = spec.baseRadiusEnd != null
      ? scaleRadius(spec.baseRadiusEnd, weightKg, spec.sensitivity)
      : r1;

    // Inset start/end along segment axis to create articulation gap
    const dx = endPt[0] - startPt[0];
    const dy = endPt[1] - startPt[1];
    const dz = endPt[2] - startPt[2];
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    let start: [number, number, number] = startPt;
    let end: [number, number, number] = endPt;
    if (len > 1) {
      const inset = len * GAP_FRACTION;
      const nx = dx / len, ny = dy / len, nz = dz / len;
      start = [startPt[0] + nx * inset, startPt[1] + ny * inset, startPt[2] + nz * inset];
      end = [endPt[0] - nx * inset, endPt[1] - ny * inset, endPt[2] - nz * inset];
    }

    parts.push({ type: spec.type, start, end, radiusStart: r1, radiusEnd: r2, group: edge.group });
  }

  // Joint spheres
  for (const [name, spec] of Object.entries(MANNEQUIN_JOINT_SPEC)) {
    const pos = ptMap.get(name);
    if (!pos) continue;
    const r = scaleRadius(spec.baseRadius, weightKg, spec.sensitivity);
    parts.push({ type: "sphere", start: pos, end: pos, radiusStart: r, radiusEnd: r, group: `joint_${name}` });
  }

  return parts;
}

// ── Modern disc road bike meshes (master plan §1 "Bike", 3D plan Phase 6) ─────────────────────────
//
// Positions still come from the edge graph; only shapes change: tapered tubes (design/bikeProfiles),
// one-piece arched fork (design/fork.ts), junction fillets, carbon deep rims, 2× drivetrain parts (cassette,
// derailleurs, chain), flat-mount disc rotors and calipers, bottle + cage, STI hoods and levers.
// Crankset and chainrings live in AnimatedLegs (they move with the pedal stroke).


export interface BikeMaterials {
  frame: THREE.Material;
  carbon: THREE.Material;
  tyre: THREE.Material;
  spoke: THREE.Material;
  alloy: THREE.Material;
  rotor: THREE.Material;
  bottle: THREE.Material;
  tape: THREE.Material;
  /** silver cogs; `cassetteEdge` is a BackSide dark material drawn as a thin outline around each cog */
  cassette?: THREE.Material;
  cassetteEdge?: THREE.Material;
}

type V3 = [number, number, number];
const vv = (p: V3) => new THREE.Vector3(p[0], p[1], p[2]);
const lerpN = (a: number, b: number, t: number) => a + (b - a) * t;

const taperMesh = (a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, mat: THREE.Material, seg: number, cache?: GeometryCache): THREE.Mesh => {
  const len = a.distanceTo(b);
  const build = () => limbGeometry(len, (t) => lerpN(r0, r1, t), seg, 20);
  const m = new THREE.Mesh(cache ? cache.get(`taper|${k1(len)}|${r0}|${r1}|${seg}`, build) : build(), mat);
  orientBetween(m, a, b);
  return m;
};

/** Flat-ended cylinder a → b (radius r0 at a, r1 at b): exactly |a→b| long, unlike `taper`'s round caps. */
const cylinderMesh = (a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, mat: THREE.Material, cache?: GeometryCache): THREE.Mesh => {
  const len = a.distanceTo(b);
  const build = () => new THREE.CylinderGeometry(r1, r0, len, 28);
  const m = new THREE.Mesh(cache ? cache.get(`cyl|${k1(len)}|${r0}|${r1}`, build) : build(), mat);
  m.position.copy(a).lerp(b, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return m;
};

const FRAME_TUBES = new Set<string>(["down_tube", "seat_tube", "top_tube", "head_tube", "chainstay", "seatstay"]);

/**
 * The rim as a closed solid: `RIM.section` revolved about the axle (axis → Y here, rotated to Z by the mesh).
 * LatheGeometry points its normals to the right of the profile's direction of travel (x = radius, y = lateral), so the
 * section is traversed counter-clockwise, which puts the solid on the left and the faces outward on every wall.
 */
export function rimGeometry(R: number): THREE.LatheGeometry {
  let pts = RIM.section.map(([dr, y]) => new THREE.Vector2(R - dr, y));
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    area += a.x * b.y - b.x * a.y;
  }
  if (area < 0) pts = pts.reverse(); // clockwise → counter-clockwise
  pts.push(pts[0].clone()); // close the loop
  return new THREE.LatheGeometry(pts, 120);
}

function addWheel(g: THREE.Group, c: V3, R: number, mats: BikeMaterials, opts: { disc: boolean; rotorR: number; caliperAngle: number }, cache?: GeometryCache) {
  const taper = (a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, mat: THREE.Material, seg = 6) => taperMesh(a, b, r0, r1, mat, seg, cache);
  /** wheel parts depend only on the wheel radius / rotor radius: placement is the mesh transform */
  const part = <G extends THREE.BufferGeometry>(key: string, build: () => G): G => (cache ? cache.get(`wheel|${key}`, build) : build());
  const w = new THREE.Group();
  w.position.set(c[0], c[1], c[2]);
  const tyre = new THREE.Mesh(part(`tyre|${R}`, () => new THREE.TorusGeometry(R - 14, 14, 18, 88)), mats.tyre);
  w.add(tyre);
  // Carbon deep rim: lathe profile around the axle (axis → Z)
  const rim = new THREE.Mesh(part(`rim|${R}`, () => rimGeometry(R)), mats.carbon);
  rim.rotation.x = Math.PI / 2;
  w.add(rim);
  if (opts.disc) {
    const disc = new THREE.Mesh(part(`disc|${R}`, () => new THREE.CylinderGeometry(R - 74, R - 74, 18, 64, 1)), mats.carbon);
    disc.rotation.x = Math.PI / 2;
    w.add(disc);
  } else {
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      // from the hub flanges (alternating sides) to the spoke bed of the rim
      const flange = i % 2 === 0 ? HUB.flangeZ : -HUB.flangeZ;
      const s = new THREE.Vector3(HUB.flangeR * Math.cos(a), HUB.flangeR * Math.sin(a), flange);
      const e = new THREE.Vector3((R - RIM.spokeBed) * Math.cos(a), (R - RIM.spokeBed) * Math.sin(a), 0);
      w.add(taper(s, e, 1.1, 1.1, mats.spoke, 1));
    }
  }
  const hub = new THREE.Mesh(part("hub", () => new THREE.CylinderGeometry(HUB.shellR, HUB.shellR, 2 * HUB.shellHalf, 16, 1)), mats.alloy);
  hub.rotation.x = Math.PI / 2;
  w.add(hub);
  // Disc rotor on the rider's left (−Z, non-drive) side: ring + 6 spokes, flat-mount caliper
  const rr = opts.rotorR;
  const ring = new THREE.Mesh(part(`ring|${rr}`, () => new THREE.RingGeometry(rr - 16, rr, 64)), mats.rotor);
  ring.position.z = -24;
  (ring.material as THREE.Material).side = THREE.DoubleSide;
  w.add(ring);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const s = new THREE.Vector3(14 * Math.cos(a), 14 * Math.sin(a), -24);
    const e = new THREE.Vector3((rr - 16) * Math.cos(a), (rr - 16) * Math.sin(a), -24);
    w.add(taper(s, e, 4, 4, mats.rotor, 1));
  }
  // the caliper straddles the outer edge of the rotor (its long side tangent to it) at the angle the frame or fork puts it
  const cal = new THREE.Mesh(part("caliper", () => new THREE.BoxGeometry(60, 26, 18)), mats.alloy);
  cal.position.set(Math.cos(opts.caliperAngle) * (rr - 6), Math.sin(opts.caliperAngle) * (rr - 6), -24);
  cal.rotation.z = opts.caliperAngle - Math.PI / 2;
  w.add(cal);
  g.add(w);
}

/** The fork as one mesh: sections swept along `forkSpine` (dropout → blade → arch → blade → dropout). Each section
 *  is an ellipse fuller toward the leading edge, in the plane of the forward normal and the spine's in-plane normal. */
function forkGeometry(crown: { x: number; y: number }, axle: { x: number; y: number }, zc: number, halfSpread: number, ringN = 20): THREE.BufferGeometry {
  const { u, n, len } = forkFrame(crown, axle);
  const N = new THREE.Vector3(n.x, n.y, 0);
  const pos: number[] = [];
  const spine = forkSpine(len, halfSpread);
  for (const p of spine) {
    const t = new THREE.Vector3(u.x * p.ts, u.y * p.ts, p.tz);
    const B = t.cross(N).normalize(); // b = t × n: with n, the section plane
    const c = new THREE.Vector3(crown.x + u.x * p.s, crown.y + u.y * p.s, zc + p.z);
    for (let j = 0; j < ringN; j++) {
      const th = (j / ringN) * Math.PI * 2;
      const x = Math.cos(th) * (Math.cos(th) > 0 ? p.front : p.rear);
      const y = Math.sin(th) * p.lat;
      pos.push(c.x + N.x * x + B.x * y, c.y + N.y * x + B.y * y, c.z + B.z * y);
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < spine.length - 1; i++) {
    for (let j = 0; j < ringN; j++) {
      const a = i * ringN + j;
      const b = i * ringN + ((j + 1) % ringN);
      idx.push(a, b, a + ringN, b, b + ringN, a + ringN); // outward: b × t = n at θ = 0
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  computeNormals(geo);
  return geo;
}

/**
 * Builds the static bike: tapered frame tubes, ENVE-style fork, fillets, wheels (deep carbon rims, rotors,
 * calipers), rear cassette, derailleurs and chain, bottle and cage. The swept handlebar and the saddle stay
 * in BikeScene3D. Named "bike-root".
 */
export function buildBikeMeshes(points: Geometry3DPoint[], tubes: Tube3D[], wheelRadius: number, mats: BikeMaterials, opts: { discRear: boolean; debug?: boolean; integratedStem?: boolean; cache?: GeometryCache }): THREE.Group {
  const g = new THREE.Group();
  g.name = "bike-root";
  const cache = opts.cache;
  const taper = (a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, mat: THREE.Material, seg = 6) => taperMesh(a, b, r0, r1, mat, seg, cache);
  const cylinder = (a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, mat: THREE.Material) => cylinderMesh(a, b, r0, r1, mat, cache);
  /** fixed-size primitives (shape numbers in the key, placement is the mesh transform) */
  const prim = <G extends THREE.BufferGeometry>(key: string, build: () => G): G => (cache ? cache.get(key, build) : build());
  const P = new Map(points.map((p) => [p.name, p.pos as V3]));
  /** debug mode: flat per-part colour instead of the real material */
  const pick = (part: string, m: THREE.Material): THREE.Material => (opts.debug ? debugMaterial(partForTube(part)) : m);
  const bb = P.get("bb");
  const cl = P.get("seat_cluster");
  const ht = P.get("head_tube_top");
  const hb = P.get("head_tube_bottom");
  if (!bb || !cl || !ht || !hb) return g;
  const seatDir = vv(cl).sub(vv(bb)).normalize();

  // Stem steerer clamp: steerer_top → stem_pivot is its lower half along the head-tube axis (synthesizeBike puts both
  // on it), so the clamp runs steerer_top → 2·stem_pivot − steerer_top: exactly stem_height long, flat ends.
  const sTop = P.get("steerer_top");
  const sPiv = P.get("stem_pivot");
  const clamp = sTop && sPiv ? { bottom: vv(sTop), top: vv(sPiv).multiplyScalar(2).sub(vv(sTop)) } : null;

  // Frame tubes (tapered), seatpost, steerer, stem
  for (const t of tubes) {
    const a = vv(t.start);
    const b = vv(t.end);
    if (t.name === "fork") continue; // curved blades below
    if (t.name === "bar" || t.name === "bar_ramp" || t.name === "bar_drop") continue; // swept handlebar in the scene
    if (FRAME_TUBES.has(t.name)) {
      const [r0, r1] = TUBE_PROFILE[t.name as TubeName];
      if (t.name === "head_tube") g.add(cylinder(b, a, r0, r1, pick(t.name, mats.frame))); // bottom → top, flat top under the spacers
      else if (t.name === "seatstay") g.add(taper(a.clone().addScaledVector(seatDir, -SEATSTAY_DROP), b, r0, r1, pick(t.name, mats.frame)));
      else g.add(taper(a, b, r0, r1, pick(t.name, mats.frame)));
    } else if (t.name === "seatpost") {
      g.add(taper(a, b, TUBE_PROFILE.seatpost[0], TUBE_PROFILE.seatpost[1], pick("seatpost", mats.carbon)));
    } else if (t.name === "steerer") {
      // spacer stack: the steerer between the head tube top and the stem, along the head-tube axis (none at 0 spacers)
      if (clamp && clamp.bottom.distanceTo(vv(ht)) > 0.5) g.add(cylinder(vv(ht), clamp.bottom, STEM.spacerR, STEM.spacerR, pick("spacers", mats.carbon)));
    } else if (t.name === "stem_clamp") {
      // the stem is one object: this steerer clamp plus the arm below
      if (clamp) g.add(cylinder(clamp.bottom, clamp.top, STEM.clampR, STEM.clampR, pick("stem", mats.carbon)));
    } else if (t.name === "stem") {
      // a one-piece bar-stem draws its own fused arm (cockpit3d.ts)
      if (!opts.integratedStem) {
        g.add(taper(a, b, STEM.armR[0], STEM.armR[1], pick("stem", mats.carbon)));
        // bar clamp body around the bar (the bar itself is drawn in the scene)
        const bc = new THREE.Mesh(prim(`cyl|barclamp|${STEM.barClampR}|${STEM.barClampWidth}`, () => new THREE.CylinderGeometry(STEM.barClampR, STEM.barClampR, STEM.barClampWidth, 28)), pick("stem", mats.carbon));
        bc.position.copy(b);
        bc.rotation.x = Math.PI / 2; // axis along the bar (lateral, Z)
        g.add(bc);
      }
    } else {
      g.add(taper(a, b, t.radius, t.radius, pick(t.name, mats.frame)));
    }
  }

  // Fork (design/fork.ts): one moulded piece, blades arching into each other under the head tube; thru-axle across
  const forkR = P.get("fork_r");
  const forkL = P.get("fork_l");
  if (forkR && forkL) {
    const crown = { x: hb[0], y: hb[1] };
    const axle = { x: forkR[0], y: forkR[1] };
    const zc = (forkR[2] + forkL[2]) / 2;
    const half = Math.abs(forkR[2] - forkL[2]) / 2;
    const forkKey = `fork|${k1(crown.x)}|${k1(crown.y)}|${k1(axle.x)}|${k1(axle.y)}|${k1(zc)}|${k1(half)}`;
    g.add(new THREE.Mesh(cache ? cache.get(forkKey, () => forkGeometry(crown, axle, zc, half)) : forkGeometry(crown, axle, zc, half), pick("fork", mats.frame)));
    g.add(cylinder(new THREE.Vector3(axle.x, axle.y, zc - half - 6), new THREE.Vector3(axle.x, axle.y, zc + half + 6), HUB.axleR, HUB.axleR, pick("fork", mats.alloy)));
  }

  // Junction fillets
  const ball = (p: V3, r: number, m: THREE.Material) => {
    const s = new THREE.Mesh(prim(`ball|${r}`, () => new THREE.SphereGeometry(r, 20, 16)), m);
    s.position.set(p[0], p[1], p[2]);
    g.add(s);
  };
  ball(bb, 30, pick("bb_shell", mats.frame));
  ball(cl, 18, pick("bb_shell", mats.frame));
  ball(P.get("head_tube_top")!, TUBE_PROFILE.head_tube[1] + 2, pick("head_tube", mats.frame));
  ball(P.get("head_tube_bottom")!, TUBE_PROFILE.head_tube[0] + 2, pick("head_tube", mats.frame));

  // Bottle + cage on the seat tube (on the front, between the legs)
  const perp = new THREE.Vector3(seatDir.y, -seatDir.x, 0);
  const b0 = vv(bb).addScaledVector(vv(cl).sub(vv(bb)), 0.22).addScaledVector(perp, 60);
  const b1 = vv(bb).addScaledVector(vv(cl).sub(vv(bb)), 0.66).addScaledVector(perp, 60);
  g.add(taper(b0, b1, 37, 34, pick("bottle", mats.bottle), 8));
  g.add(taper(b0.clone().addScaledVector(perp, -2), b1.clone().addScaledVector(perp, -2), 39, 36, pick("bottle", mats.alloy), 8));

  // Wheels
  const rear = P.get("rear_axle");
  const front = P.get("front_axle");
  const wheelMats: BikeMaterials = opts.debug
    ? { ...mats, carbon: debugMaterial("wheel"), tyre: debugMaterial("wheel"), spoke: debugMaterial("wheel"), alloy: debugMaterial("wheel"), rotor: debugMaterial("brakes") }
    : mats;
  // Calipers (wheel-local angle from +x, counter-clockwise, side view with the bike facing +x): the rear one sits on the
  // chainstay/seat stay above and ahead of the axle (about 2 o'clock); the front one is on the back of the fork leg,
  // just above the axle height (about 9:30).
  if (rear) addWheel(g, rear, wheelRadius, wheelMats, { disc: opts.discRear, rotorR: 70, caliperAngle: 0.87 }, cache);
  if (front) addWheel(g, front, wheelRadius, wheelMats, { disc: false, rotorR: 80, caliperAngle: 2.7 }, cache);

  // Rear cassette, derailleur and chain (drive side = rider's right = +Z; forward +x, up +y makes +Z the right-hand side)
  if (rear) {
    const { cassette } = CHAINRING;
    for (let i = 0; i < cassette.rings; i++) {
      const r = lerpN(cassette.outerRadius, cassette.innerRadius, i / (cassette.rings - 1));
      const z = 42 + i * 3.9;
      const c = new THREE.Mesh(prim(`cog|${r}`, () => new THREE.CylinderGeometry(r, r, 2.2, 48)), pick("drivetrain", mats.cassette ?? mats.alloy));
      c.rotation.x = Math.PI / 2;
      c.position.set(rear[0], rear[1], z);
      g.add(c);
      if (mats.cassetteEdge && !opts.debug) {
        // back faces only: the ring just outside the cog's rim shows as a dark edge against the next cog behind
        const e = new THREE.Mesh(prim(`cogedge|${r}`, () => new THREE.CylinderGeometry(r + 1.4, r + 1.4, 2.2, 48)), mats.cassetteEdge);
        e.rotation.x = Math.PI / 2;
        e.position.set(rear[0], rear[1], z);
        g.add(e);
      }
    }
    const up = new THREE.Vector3(rear[0] + 8, rear[1] - 58, 58);
    const lo = new THREE.Vector3(rear[0] + 28, rear[1] - 118, 58);
    g.add(taper(vv(rear).add(new THREE.Vector3(-6, -8, 64)), vv(rear).add(new THREE.Vector3(-22, -36, 72)), 13, 12, pick("drivetrain", mats.carbon), 4));
    g.add(taper(vv(rear).add(new THREE.Vector3(-22, -36, 72)), up.clone().add(new THREE.Vector3(-4, 4, 8)), 12, 12, pick("drivetrain", mats.carbon), 4));
    g.add(taper(up, lo, 10, 10, pick("drivetrain", mats.carbon), 4));
    for (const p of [up, lo]) {
      const pu = new THREE.Mesh(prim("pulley", () => new THREE.CylinderGeometry(17, 17, 8, 24)), pick("drivetrain", mats.alloy));
      pu.rotation.x = Math.PI / 2;
      pu.position.copy(p).add(new THREE.Vector3(0, 0, 6));
      g.add(pu);
    }
    // Chain: big ring top → cassette top; ring bottom → pulleys → cassette bottom
    const ringTop = new THREE.Vector3(bb[0], bb[1] + CHAINRING.big.root, 46);
    const ringBot = new THREE.Vector3(bb[0], bb[1] - CHAINRING.big.root, 46);
    const cogTop = new THREE.Vector3(rear[0], rear[1] + 40, 50);
    const cogBot = new THREE.Vector3(rear[0], rear[1] - 40, 50);
    const run = (pts: THREE.Vector3[]) => {
      for (let i = 0; i < pts.length - 1; i++) g.add(taper(pts[i], pts[i + 1], 3.5, 3.5, pick("drivetrain", mats.alloy), 1));
    };
    run([ringTop, cogTop]);
    run([ringBot, lo.clone().add(new THREE.Vector3(-12, -17, 0)), lo.clone().add(new THREE.Vector3(17, 0, 0)), up.clone().add(new THREE.Vector3(17, 0, 0)), up.clone().add(new THREE.Vector3(-12, 17, 0)), cogBot]);
    // Front derailleur
    const fd = new THREE.Mesh(prim("box|front-derailleur", () => new THREE.BoxGeometry(70, 26, 12)), pick("drivetrain", mats.alloy));
    fd.position.set(bb[0] + (cl[0] - bb[0]) * 0.27, bb[1] + (cl[1] - bb[1]) * 0.27, 62);
    fd.rotation.z = Math.atan2(seatDir.y, seatDir.x) - Math.PI / 2 + 0.25;
    g.add(fd);
  }
  return g;
}

/** STI hood bodies + brake levers for both sides (the swept bar itself stays in BikeScene3D). */
export function buildHoods(points: Geometry3DPoint[], mats: BikeMaterials, debug = false): THREE.Group {
  const g = new THREE.Group();
  g.name = "hoods-root";
  const P = new Map(points.map((p) => [p.name, p.pos as V3]));
  for (const side of ["l", "r"] as const) {
    const hood = P.get(`hoods_${side}`);
    const barTop = P.get(`bar_top_${side}`);
    if (!hood || !barTop) continue;
    const at = vv(hood);
    const dir = at.clone().sub(vv(barTop)).normalize();
    const start = at.clone().addScaledVector(dir, -26).add(new THREE.Vector3(0, -26, 0));
    const end = at.clone().addScaledVector(dir, 46).add(new THREE.Vector3(0, 14, 0));
    const body = new THREE.Mesh(
      limbGeometry(start.distanceTo(end), (t) => 16 + 10 * Math.exp(-((t - 0.7) ** 2) / (2 * 0.2 * 0.2)) + 4 * Math.exp(-((t - 0.95) ** 2) / (2 * 0.08 * 0.08)), 16, 20),
      debug ? debugMaterial("hood") : mats.tape,
    );
    orientBetween(body, start, end);
    g.add(body);
    // Lever: curved blade down and forward
    const curve = new THREE.QuadraticBezierCurve3(at.clone().addScaledVector(dir, 44).add(new THREE.Vector3(0, -4, 0)), at.clone().addScaledVector(dir, 70).add(new THREE.Vector3(0, -70, 0)), at.clone().addScaledVector(dir, 22).add(new THREE.Vector3(0, -130, 0)));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 5, 8, false), debug ? debugMaterial("lever") : mats.carbon));
  }
  return g;
}
