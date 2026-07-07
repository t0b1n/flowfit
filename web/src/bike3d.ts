/**
 * bike3d.ts — Pure geometry helper for the 3D frame renderer.
 *
 * Converts a Geometry3DResponse (from /geometry3d) into a list of Tube3D
 * descriptors that BikeScene3D renders as cylinder meshes.
 *
 * Coordinate system (matches backend origin = bb, units mm):
 *   X — forward,  Y — up,  Z — lateral (positive = rider's left)
 */

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
