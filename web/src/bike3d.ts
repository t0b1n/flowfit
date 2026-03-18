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
  mannequin_leg: 55,
  mannequin_arm: 35,
  mannequin_torso: 80,
};

// Which tube name to use for a given edge a→b pair
const EDGE_TUBE_NAME: Record<string, string> = {
  "bb→seat_tube_top": "seat_tube",
  "seat_tube_top→head_tube_top": "top_tube",
  "bb→head_tube_bottom": "down_tube",
  "head_tube_top→head_tube_bottom": "head_tube",
  "bb→chainstay_l": "chainstay",
  "bb→chainstay_r": "chainstay",
  "seat_tube_top→chainstay_l": "seatstay",
  "seat_tube_top→chainstay_r": "seatstay",
  "head_tube_bottom→fork_l": "fork",
  "head_tube_bottom→fork_r": "fork",
  "seat_tube_top→saddle_clamp": "seatpost",
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
