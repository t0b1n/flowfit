/**
 * bike3d.ts — Pure geometry helper for the 3D frame renderer.
 *
 * Converts a Geometry3DResponse (from /geometry3d) into a list of Tube3D
 * descriptors that BikeScene3D renders as cylinder meshes.
 *
 * Coordinate system (matches backend origin = bb, units mm):
 *   X — forward,  Y — up,  Z — lateral (positive = rider's left)
 */

import * as THREE from "three";
import { CHAINRING, RIM, SEATSTAY_DROP, TUBE_PROFILE, type TubeName } from "./design/bikeProfiles";
import { limbGeometry, orientBetween } from "./riderMesh";

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
  "bb→chainstay_l": "chainstay",
  "bb→chainstay_r": "chainstay",
  "seat_cluster→chainstay_l": "seatstay",
  "seat_cluster→chainstay_r": "seatstay",
  "head_tube_bottom→fork_l": "fork",
  "head_tube_bottom→fork_r": "fork",
  "seat_tube_top→seatpost_top": "seatpost",
  "head_tube_top→steerer_top": "steerer",
  "steerer_top→bar_clamp": "stem",
  "bar_clamp→bar_top_l": "bar",
  "bar_clamp→bar_top_r": "bar",
  "bar_top_l→hoods_l": "bar_ramp",
  "bar_top_r→hoods_r": "bar_ramp",
  "hoods_l→bar_drop_l": "bar_drop",
  "hoods_r→bar_drop_r": "bar_drop",
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
  shoulder_l:       { type: "sphere", baseRadius: 30, sensitivity: 0.20 },
  shoulder_r:       { type: "sphere", baseRadius: 30, sensitivity: 0.20 },
  elbow_l:          { type: "sphere", baseRadius: 28, sensitivity: 0.20 },
  elbow_r:          { type: "sphere", baseRadius: 28, sensitivity: 0.20 },
  wrist_l:          { type: "sphere", baseRadius: 22, sensitivity: 0.10 },
  wrist_r:          { type: "sphere", baseRadius: 22, sensitivity: 0.10 },
  hip_l:            { type: "sphere", baseRadius: 55, sensitivity: 0.40 },
  hip_r:            { type: "sphere", baseRadius: 55, sensitivity: 0.40 },
  knee_l:           { type: "sphere", baseRadius: 52, sensitivity: 0.35 },
  knee_r:           { type: "sphere", baseRadius: 52, sensitivity: 0.35 },
  ankle_l:          { type: "sphere", baseRadius: 34, sensitivity: 0.15 },
  ankle_r:          { type: "sphere", baseRadius: 34, sensitivity: 0.15 },
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
  "cleat_l", "cleat_r", "ankle_l", "ankle_r", "knee_l", "knee_r",
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
// curved fork blades + crown, junction fillets, carbon deep rims, 2× drivetrain parts (cassette,
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
}

type V3 = [number, number, number];
const vv = (p: V3) => new THREE.Vector3(p[0], p[1], p[2]);
const lerpN = (a: number, b: number, t: number) => a + (b - a) * t;

const taper = (a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, mat: THREE.Material, seg = 6): THREE.Mesh => {
  const m = new THREE.Mesh(limbGeometry(a.distanceTo(b), (t) => lerpN(r0, r1, t), seg, 20), mat);
  orientBetween(m, a, b);
  return m;
};

const FRAME_TUBES = new Set<string>(["down_tube", "seat_tube", "top_tube", "head_tube", "chainstay", "seatstay"]);

function addWheel(g: THREE.Group, c: V3, R: number, mats: BikeMaterials, opts: { disc: boolean; rotorR: number }) {
  const w = new THREE.Group();
  w.position.set(c[0], c[1], c[2]);
  const tyre = new THREE.Mesh(new THREE.TorusGeometry(R - 14, 14, 18, 88), mats.tyre);
  w.add(tyre);
  // Carbon deep rim: lathe profile around the axle (axis → Z)
  const prof = RIM.lathe.map(([dr, y]) => new THREE.Vector2(R - dr, y));
  const rim = new THREE.Mesh(new THREE.LatheGeometry(prof, 120), mats.carbon);
  rim.rotation.x = Math.PI / 2;
  w.add(rim);
  if (opts.disc) {
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(R - 74, R - 74, 18, 64, 1), mats.carbon);
    disc.rotation.x = Math.PI / 2;
    w.add(disc);
  } else {
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const flange = i % 2 === 0 ? 16 : -16;
      const s = new THREE.Vector3(20 * Math.cos(a), 20 * Math.sin(a), flange);
      const e = new THREE.Vector3((R - RIM.spokeEnd) * Math.cos(a), (R - RIM.spokeEnd) * Math.sin(a), 0);
      w.add(taper(s, e, 1.1, 1.1, mats.spoke, 1));
    }
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, 64, 16, 1), mats.alloy);
  hub.rotation.x = Math.PI / 2;
  w.add(hub);
  // Disc rotor on the near (left, +Z) side: ring + 6 spokes, flat-mount caliper
  const rr = opts.rotorR;
  const ring = new THREE.Mesh(new THREE.RingGeometry(rr - 16, rr, 64), mats.rotor);
  ring.position.z = 24;
  (ring.material as THREE.Material).side = THREE.DoubleSide;
  w.add(ring);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const s = new THREE.Vector3(14 * Math.cos(a), 14 * Math.sin(a), 24);
    const e = new THREE.Vector3((rr - 16) * Math.cos(a), (rr - 16) * Math.sin(a), 24);
    w.add(taper(s, e, 4, 4, mats.rotor, 1));
  }
  const cal = new THREE.Mesh(new THREE.BoxGeometry(60, 26, 18), mats.alloy);
  cal.position.set(Math.cos(0.9) * (rr + 8), Math.sin(0.9) * (rr + 8), 24);
  cal.rotation.z = 0.9 - Math.PI / 2;
  w.add(cal);
  g.add(w);
}

/**
 * Builds the static bike: tapered frame tubes, curved fork, fillets, wheels (deep carbon rims, rotors,
 * calipers), rear cassette, derailleurs and chain, bottle and cage. The swept handlebar and the saddle stay
 * in BikeScene3D. Named "bike-root".
 */
export function buildBikeMeshes(points: Geometry3DPoint[], tubes: Tube3D[], wheelRadius: number, mats: BikeMaterials, opts: { discRear: boolean }): THREE.Group {
  const g = new THREE.Group();
  g.name = "bike-root";
  const P = new Map(points.map((p) => [p.name, p.pos as V3]));
  const bb = P.get("bb");
  const cl = P.get("seat_cluster");
  const ht = P.get("head_tube_top");
  const hb = P.get("head_tube_bottom");
  if (!bb || !cl || !ht || !hb) return g;
  const seatDir = vv(cl).sub(vv(bb)).normalize();
  const htDown = vv(hb).sub(vv(ht)).normalize();

  // Frame tubes (tapered), seatpost, steerer, stem
  for (const t of tubes) {
    const a = vv(t.start);
    const b = vv(t.end);
    if (t.name === "fork") continue; // curved blades below
    if (t.name === "bar" || t.name === "bar_ramp" || t.name === "bar_drop") continue; // swept handlebar in the scene
    if (FRAME_TUBES.has(t.name)) {
      const [r0, r1] = TUBE_PROFILE[t.name as TubeName];
      if (t.name === "head_tube") g.add(taper(b, a, r0, r1, mats.frame)); // profile runs bottom → top
      else if (t.name === "seatstay") g.add(taper(a.clone().addScaledVector(seatDir, -SEATSTAY_DROP), b, r0, r1, mats.frame));
      else g.add(taper(a, b, r0, r1, mats.frame));
    } else if (t.name === "seatpost") {
      g.add(taper(a, b, TUBE_PROFILE.seatpost[0], TUBE_PROFILE.seatpost[1], mats.carbon));
    } else if (t.name === "steerer") {
      g.add(taper(a, b, 17, 17, mats.carbon));
    } else if (t.name === "stem") {
      g.add(taper(a, b, 19, 16, mats.carbon));
    } else {
      g.add(taper(a, b, t.radius, t.radius, mats.frame));
    }
  }

  // Fork: curved blades from the crown to the dropouts, plus a crown bar
  for (const side of ["l", "r"] as const) {
    const drop = P.get(`fork_${side}`);
    if (!drop) continue;
    const crown = vv(hb);
    crown.z = drop[2];
    const ctrl = crown.clone().addScaledVector(htDown, 200).add(new THREE.Vector3(8, 0, 0));
    ctrl.z = drop[2];
    const curve = new THREE.QuadraticBezierCurve3(crown, ctrl, vv(drop));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 40, TUBE_PROFILE.fork_blade[0], 12, false), mats.frame));
  }
  const forkL = P.get("fork_l");
  const forkR = P.get("fork_r");
  if (forkL && forkR) {
    const c1 = vv(hb); c1.z = forkL[2];
    const c2 = vv(hb); c2.z = forkR[2];
    g.add(taper(c1, c2, TUBE_PROFILE.fork_crown[0], TUBE_PROFILE.fork_crown[1], mats.frame));
  }

  // Junction fillets
  const ball = (p: V3, r: number, m: THREE.Material) => {
    const s = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 16), m);
    s.position.set(p[0], p[1], p[2]);
    g.add(s);
  };
  ball(bb, 30, mats.frame);
  ball(cl, 18, mats.frame);
  ball(P.get("head_tube_top")!, TUBE_PROFILE.head_tube[1] + 2, mats.frame);
  ball(P.get("head_tube_bottom")!, TUBE_PROFILE.head_tube[0] + 2, mats.frame);

  // Bottle + cage on the seat tube (on the front, between the legs)
  const perp = new THREE.Vector3(seatDir.y, -seatDir.x, 0);
  const b0 = vv(bb).addScaledVector(vv(cl).sub(vv(bb)), 0.22).addScaledVector(perp, 60);
  const b1 = vv(bb).addScaledVector(vv(cl).sub(vv(bb)), 0.66).addScaledVector(perp, 60);
  g.add(taper(b0, b1, 37, 34, mats.bottle, 8));
  g.add(taper(b0.clone().addScaledVector(perp, -2), b1.clone().addScaledVector(perp, -2), 39, 36, mats.alloy, 8));

  // Wheels
  const rear = P.get("rear_axle");
  const front = P.get("front_axle");
  if (rear) addWheel(g, rear, wheelRadius, mats, { disc: opts.discRear, rotorR: 70 });
  if (front) addWheel(g, front, wheelRadius, mats, { disc: false, rotorR: 80 });

  // Rear cassette, derailleur and chain (drive side = −Z)
  if (rear) {
    const { cassette } = CHAINRING;
    for (let i = 0; i < cassette.rings; i++) {
      const r = lerpN(cassette.outerRadius, cassette.innerRadius, i / (cassette.rings - 1));
      const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 2.2, 36), mats.alloy);
      c.rotation.x = Math.PI / 2;
      c.position.set(rear[0], rear[1], -42 - i * 3.9);
      g.add(c);
    }
    const up = new THREE.Vector3(rear[0] + 8, rear[1] - 58, -58);
    const lo = new THREE.Vector3(rear[0] + 28, rear[1] - 118, -58);
    g.add(taper(vv(rear).add(new THREE.Vector3(-6, -8, -64)), vv(rear).add(new THREE.Vector3(-22, -36, -72)), 13, 12, mats.carbon, 4));
    g.add(taper(vv(rear).add(new THREE.Vector3(-22, -36, -72)), up.clone().add(new THREE.Vector3(-4, 4, -8)), 12, 12, mats.carbon, 4));
    g.add(taper(up, lo, 10, 10, mats.carbon, 4));
    for (const p of [up, lo]) {
      const pu = new THREE.Mesh(new THREE.CylinderGeometry(17, 17, 8, 24), mats.alloy);
      pu.rotation.x = Math.PI / 2;
      pu.position.copy(p).add(new THREE.Vector3(0, 0, -6));
      g.add(pu);
    }
    // Chain: big ring top → cassette top; ring bottom → pulleys → cassette bottom
    const ringTop = new THREE.Vector3(bb[0], bb[1] + CHAINRING.big.root, -58);
    const ringBot = new THREE.Vector3(bb[0], bb[1] - CHAINRING.big.root, -58);
    const cogTop = new THREE.Vector3(rear[0], rear[1] + 40, -50);
    const cogBot = new THREE.Vector3(rear[0], rear[1] - 40, -50);
    const run = (pts: THREE.Vector3[]) => {
      for (let i = 0; i < pts.length - 1; i++) g.add(taper(pts[i], pts[i + 1], 3.5, 3.5, mats.alloy, 1));
    };
    run([ringTop, cogTop]);
    run([ringBot, lo.clone().add(new THREE.Vector3(-12, -17, 0)), lo.clone().add(new THREE.Vector3(17, 0, 0)), up.clone().add(new THREE.Vector3(17, 0, 0)), up.clone().add(new THREE.Vector3(-12, 17, 0)), cogBot]);
    // Front derailleur
    const fd = new THREE.Mesh(new THREE.BoxGeometry(70, 26, 12), mats.alloy);
    fd.position.set(bb[0] + (cl[0] - bb[0]) * 0.27, bb[1] + (cl[1] - bb[1]) * 0.27, -66);
    fd.rotation.z = Math.atan2(seatDir.y, seatDir.x) - Math.PI / 2 + 0.25;
    g.add(fd);
  }
  return g;
}

/** STI hood bodies + brake levers for both sides (the swept bar itself stays in BikeScene3D). */
export function buildHoods(points: Geometry3DPoint[], mats: BikeMaterials): THREE.Group {
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
      mats.tape,
    );
    orientBetween(body, start, end);
    g.add(body);
    // Lever: curved blade down and forward
    const curve = new THREE.QuadraticBezierCurve3(at.clone().addScaledVector(dir, 44).add(new THREE.Vector3(0, -4, 0)), at.clone().addScaledVector(dir, 70).add(new THREE.Vector3(0, -70, 0)), at.clone().addScaledVector(dir, 22).add(new THREE.Vector3(0, -130, 0)));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 5, 8, false), mats.carbon));
  }
  return g;
}
