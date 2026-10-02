/**
 * Geometry helpers for the 2D side view. Everything is computed in bike coordinates (y up, mm) and
 * converted to SVG (y down) when a point string is produced. Shapes come from the same profile tables as
 * the 3D meshes: `design/riderBody.ts` and `design/bikeProfiles.ts`.
 */
import { shoeAxis, shoeRadius } from "../design/foot";
import { HEAD_GAZE_OFFSET_DEG, bump, calAt, headDeform, lerp, torsoDepth, type SegmentName } from "../design/riderBody";
import type { ContactPoint } from "../types";

export type V = ContactPoint;

export const v = (x: number, y: number): V => ({ x, y });
export const add = (a: V, b: V, k = 1): V => v(a.x + b.x * k, a.y + b.y * k);
export const sub = (a: V, b: V): V => v(a.x - b.x, a.y - b.y);
export const norm = (a: V): V => {
  const l = Math.hypot(a.x, a.y) || 1;
  return v(a.x / l, a.y / l);
};

/** [x, y] pairs in bike coords → SVG `points` string (y flipped). */
export const pts = (arr: Array<[number, number]>) => arr.map(([x, y]) => `${x.toFixed(1)},${(-y).toFixed(1)}`).join(" ");

/** Convex hull of the points of several `pts()` polygon strings, as one polygon string (one object drawn as one shape). */
export function hullOf(...polys: string[]): string {
  const p: Array<[number, number]> = polys
    .flatMap((s) => s.trim().split(/\s+/))
    .map((t) => t.split(",").map(Number) as [number, number])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const build = (list: Array<[number, number]>) => {
    const h: Array<[number, number]> = [];
    for (const q of list) {
      while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], q) <= 0) h.pop();
      h.push(q);
    }
    h.pop();
    return h;
  };
  const hull = [...build(p), ...build([...p].reverse())];
  return hull.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
}

/** Outline of a tapered limb: radius `prof(t)` along a→b, with round caps. */
export function seg(a: V, b: V, prof: (t: number) => number, n = 18): string {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L = Math.hypot(dx, dy) || 1;
  const ux = dx / L;
  const uy = dy / L;
  const nx = -uy;
  const ny = ux;
  const left: Array<[number, number]> = [];
  const right: Array<[number, number]> = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const r = prof(t);
    const cx = a.x + dx * t;
    const cy = a.y + dy * t;
    left.push([cx + nx * r, cy + ny * r]);
    right.push([cx - nx * r, cy - ny * r]);
  }
  const cap = (c: V, r: number, a0: number) => {
    const o: Array<[number, number]> = [];
    for (let i = 0; i <= 10; i++) {
      const ang = a0 + (i / 10) * Math.PI;
      o.push([c.x + Math.cos(ang) * r, c.y + Math.sin(ang) * r]);
    }
    return o;
  };
  const ang = Math.atan2(uy, ux);
  return pts([...left, ...cap(b, prof(1), ang - Math.PI / 2), ...right.reverse(), ...cap(a, prof(0), ang + Math.PI / 2)]);
}

export const tube = (a: V, b: V, r0: number, r1: number) => seg(a, b, (t) => lerp(r0, r1, t), 6);

export function ellipse(c: V, rx: number, ry: number, rot = 0, n = 36): string {
  const o: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.cos(a) * rx;
    const y = Math.sin(a) * ry;
    o.push([c.x + x * Math.cos(rot) - y * Math.sin(rot), c.y + x * Math.sin(rot) + y * Math.cos(rot)]);
  }
  return pts(o);
}

/** Toothed ring outline. */
export function gear(c: V, teeth: number, outer: number, root: number): string {
  const o: Array<[number, number]> = [];
  for (let i = 0; i < teeth * 2; i++) {
    const a = (i / (teeth * 2)) * Math.PI * 2;
    const r = i % 2 ? root : outer;
    o.push([c.x + Math.cos(a) * r, c.y + Math.sin(a) * r]);
  }
  return pts(o);
}

// ── Rider ───────────────────────────────────────────────────────────────────

/** Weight sensitivity per segment (same exponents as MANNEQUIN_EDGE_SPEC). */
const SENSITIVITY: Record<SegmentName, number> = {
  thigh: 0.35,
  calf: 0.15,
  upperArm: 0.2,
  forearm: 0.1,
  torso: 0.45,
  neck: 0.25,
};

export interface LegPose {
  knee: V;
  ankle: V;
  cleat: V;
}

export interface FigurePolys {
  farLeg: string[];
  farShoe: string;
  farArm: string[];
  /** torso, pelvis, glute, neck, deltoid: drawn first */
  torso: string[];
  nearLeg: string[];
  nearShoe: string;
  nearArm: string[];
  head: string;
  glove: string;
  /** bone segments for the skeleton overlay, bike coords */
  bones: Array<[V, V]>;
  joints: V[];
}

export interface FigureInput {
  hip: V;
  knee: V;
  ankle: V;
  shoulder: V;
  elbow: V;
  wrist: V;
  hands: V;
  head: V;
  neckBase: V;
  spineJoint: V;
  cleat: V;
  /** far (right) leg pose, from the pedal-stroke LUT at the opposite crank angle */
  far: LegPose | null;
  riderHeightMm: number;
  /** rider.foot_length (mm, before height scaling) */
  footLengthMm: number;
  weightKg: number;
}

export function buildFigure(f: FigureInput): FigurePolys {
  const hs = f.riderHeightMm / 1800;
  const k = (seg_: SegmentName) => hs * Math.pow(f.weightKg / 75, SENSITIVITY[seg_]);
  const thigh = (t: number) => k("thigh") * calAt("thigh", t) * (lerp(86, 50, t) + 12 * bump(t, 0.3, 0.2));
  const calf = (t: number) => k("calf") * calAt("calf", t) * (lerp(40, 20, t) + 6 * bump(t, 0.3, 0.14));
  const upperArm = (t: number) => k("upperArm") * calAt("upperArm", t) * (lerp(36, 28, t) + 7 * bump(t, 0.45, 0.2));
  const forearm = (t: number) => k("forearm") * calAt("forearm", t) * (lerp(31, 18, t) + 6 * bump(t, 0.18, 0.14));
  const torsoProf = (t: number) =>
    k("torso") * calAt("torso", t) * (98 - 16 * bump(t, 0.36, 0.13) + 20 * bump(t, 0.78, 0.16)) * torsoDepth(t);

  const footLen = f.footLengthMm * hs;
  const visAnkle = (an: V, cleat: V): V => v(cleat.x - footLen * 0.19, an.y);

  const shoe = (_an: V, cleat: V): string => {
    const a = shoeAxis(cleat, footLen * 0.19, hs);
    return seg(v(a.heel.x, a.heel.y), v(a.toe.x, a.toe.y), (t) => shoeRadius(t, hs));
  };

  const ax = Math.atan2(f.shoulder.y - f.hip.y, f.shoulder.x - f.hip.x);
  const cosA = Math.cos(ax);
  const sinA = Math.sin(ax);
  const torso: string[] = [
    seg(v(f.hip.x - cosA * 10, f.hip.y - sinA * 10), v(f.shoulder.x - cosA * 18, f.shoulder.y - sinA * 18), torsoProf, 28),
    ellipse(v(f.hip.x - 16, f.hip.y - 4), 80 * hs, 78 * hs),
    ellipse(v(f.hip.x - 52 * hs, f.hip.y - 20 * hs), 62 * hs, 56 * hs, ax * 0.3),
    seg(v(f.neckBase.x - 20, f.neckBase.y - 6), f.shoulder, (t) => lerp(42, 36, t) * hs),
    seg(v(f.shoulder.x - 12, f.shoulder.y - 22), v(f.head.x - 26, f.head.y - 44), (t) => k("neck") * calAt("neck", 0.5) * lerp(44, 40, t)),
  ];
  const ua = Math.atan2(f.elbow.y - f.shoulder.y, f.elbow.x - f.shoulder.x);
  torso.push(ellipse(v(f.shoulder.x + Math.cos(ua) * 24, f.shoulder.y + Math.sin(ua) * 24), 58 * hs, 48 * hs, ua));

  const nearArm = [seg(f.shoulder, f.elbow, upperArm), seg(f.elbow, f.wrist, forearm)];

  const nearLeg = [seg(f.hip, f.knee, thigh), seg(f.knee, visAnkle(f.ankle, f.cleat), calf)];
  const farLeg = f.far
    ? [seg(f.hip, f.far.knee, thigh), seg(f.far.knee, visAnkle(f.far.ankle, f.far.cleat), calf)]
    : [];

  const na = Math.atan2(f.head.y - f.neckBase.y, f.head.x - f.neckBase.x);
  const gaze = na - (HEAD_GAZE_OFFSET_DEG * Math.PI) / 180;
  const head: Array<[number, number]> = [];
  for (let i = 0; i < 120; i++) {
    const a = (i / 120) * Math.PI * 2;
    const [X, Y] = headDeform(Math.cos(a), Math.sin(a), 0);
    head.push([f.head.x + X * Math.cos(gaze) - Y * Math.sin(gaze), f.head.y + X * Math.sin(gaze) + Y * Math.cos(gaze)]);
  }

  const wx = f.hands.x - f.wrist.x;
  const wy = f.hands.y - f.wrist.y;
  const wl = Math.hypot(wx, wy) || 1;
  const glove = seg(
    v(f.wrist.x + wx * 0.05, f.wrist.y + wy * 0.05),
    v(f.hands.x + (wx / wl) * 28, f.hands.y + (wy / wl) * 28),
    (t) => lerp(25, 21, t),
  );

  const bones: Array<[V, V]> = [
    [f.hip, f.spineJoint],
    [f.spineJoint, f.shoulder],
    [f.shoulder, f.neckBase],
    [f.neckBase, f.head],
    [f.hip, f.knee],
    [f.knee, v(f.cleat.x - footLen * 0.19, f.ankle.y)],
    [f.shoulder, f.elbow],
    [f.elbow, f.wrist],
    [f.wrist, f.hands],
  ];

  return {
    farLeg,
    farShoe: f.far ? shoe(f.far.ankle, f.far.cleat) : "",
    farArm: [seg(f.shoulder, f.elbow, upperArm), seg(f.elbow, f.wrist, forearm)],
    torso,
    nearLeg,
    nearShoe: shoe(f.ankle, f.cleat),
    nearArm,
    head: pts(head),
    glove,
    bones,
    joints: [f.hip, f.spineJoint, f.shoulder, f.elbow, f.wrist, f.knee, v(f.cleat.x - footLen * 0.19, f.ankle.y)],
  };
}
