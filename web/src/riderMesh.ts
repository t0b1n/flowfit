/**
 * riderMesh.ts — the segmented clay mannequin ("lean male road racer"), master plan §5.5.
 *
 * Everything is a lathe limb built from the shared profile tables in design/riderBody.ts (the 2D view draws the
 * same profiles as polygons), with the muscles built into the surface: each lathe vertex's radius gets
 * `amp · gauss(t) · max(0, cos θ)^spread` towards a direction. Joint positions always come from the app's IK
 * (the `pts` map); this file only decides radii and shapes. One neutral clay material, ordinary lighting:
 * no outlines, Fresnel or glow.
 */

import * as THREE from "three";
import {
  HEAD_GAZE_OFFSET_DEG,
  MASSES,
  PROFILES,
  bump,
  calAt,
  headDeform,
  lerp,
  torsoDepth,
  torsoWidth,
  type Bulge,
  type BulgeDir,
  type SegmentName,
} from "./design/riderBody";

export type P3 = [number, number, number];

const Y = new THREE.Vector3(0, 1, 0);
const v3 = (p: P3) => new THREE.Vector3(p[0], p[1], p[2]);

// ── Lathe limbs ─────────────────────────────────────────────────────────────

/** Lathe along +Y (y = 0 at the proximal end) with rounded caps. prof(t) = radius at t ∈ [0,1] along the bone. */
export function limbGeometry(len: number, prof: (t: number) => number, seg = 28, lat = 40): THREE.LatheGeometry {
  const pts: THREE.Vector2[] = [];
  const r0 = Math.max(prof(0), 0.01);
  const r1 = Math.max(prof(1), 0.01);
  for (let i = 0; i <= 9; i++) {
    const a = -Math.PI / 2 + (i / 9) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.cos(a) * r0, Math.sin(a) * r0));
  }
  for (let i = 1; i < seg; i++) {
    const t = i / seg;
    pts.push(new THREE.Vector2(Math.max(prof(t), 0.01), t * len));
  }
  for (let i = 0; i <= 9; i++) {
    const a = (i / 9) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.cos(a) * r1, len + Math.sin(a) * r1));
  }
  const g = new THREE.LatheGeometry(pts, lat);
  g.computeVertexNormals();
  return g;
}

/** Orient `obj` so local +Y runs from a to b, positioned at a. */
export function orientBetween(obj: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3): void {
  obj.position.copy(a);
  obj.quaternion.setFromUnitVectors(Y, b.clone().sub(a).normalize());
}

/** Resolved bulge: a unit direction in the limb's LOCAL frame (±X = in-plane normal, ±Z = lateral). */
export interface LocalBulge {
  dx: number;
  dz: number;
  t: number;
  w: number;
  amp: number;
  spread: number;
}

/**
 * Resolve symbolic directions (`ant`, `post`, `med`, `lat`, …) to the limb's local frame at rest.
 * `ant` is the sagittal normal pointing forward (+x) for legs / the biceps side for arms; `lat` points
 * away from the body midline (towards the limb's own z side).
 */
export function resolveBulges(bulges: Bulge[], a: P3, b: P3, anteriorWorld: THREE.Vector3, sideZ: 1 | -1): LocalBulge[] {
  const bone = v3(b).sub(v3(a)).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(Y, bone);
  const qi = q.clone().invert();
  const base: Record<"ant" | "post" | "med" | "lat", THREE.Vector3> = {
    ant: anteriorWorld.clone().normalize(),
    post: anteriorWorld.clone().normalize().negate(),
    med: new THREE.Vector3(0, 0, -sideZ),
    lat: new THREE.Vector3(0, 0, sideZ),
  };
  const dirOf = (d: BulgeDir): THREE.Vector3 => {
    const parts = d.split("+") as Array<keyof typeof base>;
    const sum = new THREE.Vector3();
    parts.forEach((p) => sum.add(base[p]));
    return sum.normalize();
  };
  return bulges.map((u) => {
    const d = dirOf(u.dir).applyQuaternion(qi);
    d.y = 0;
    d.normalize();
    return { dx: d.x, dz: d.z, t: u.t, w: u.w, amp: u.amp, spread: u.spread };
  });
}

/** Lathe limb with muscle bulges and per-station calibration baked into the surface. */
export function muscleLimbGeometry(
  len: number,
  radius: (t: number) => number,
  bulges: LocalBulge[],
  cal: (t: number) => number = () => 1,
  scale: [number, number] = [1, 1],
  seg = 40,
  lat = 56,
): THREE.BufferGeometry {
  const g = limbGeometry(len, (t) => radius(t) * cal(t), seg, lat);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const rr = Math.hypot(x, z);
    if (rr < 1e-3) continue;
    const t = Math.min(1, Math.max(0, y / len));
    let add = 0;
    for (const u of bulges) {
      const c = (x * u.dx + z * u.dz) / rr;
      if (c > 0) add += cal(t) * u.amp * Math.exp(-((t - u.t) ** 2) / (2 * u.w * u.w)) * Math.pow(c, u.spread);
    }
    const k = (rr + add) / rr;
    p.setX(i, x * k * scale[0]);
    p.setZ(i, z * k * scale[1]);
  }
  g.computeVertexNormals();
  return g;
}

// ── Rider ───────────────────────────────────────────────────────────────────

export interface RiderMeshOpts {
  weightKg: number;
  /** rider height in mm; radii scale by height / 1800 */
  heightMm: number;
  /** false when AnimatedLegs owns the legs */
  includeLegs: boolean;
  /** bare clay feet pointing along +x (standing/T-pose; the riding pose has shoes via AnimatedLegs) */
  feet?: boolean;
}

/** Radius multiplier for a segment: (weight / 75)^sensitivity × height / 1800. */
const SENS: Record<SegmentName, number> = { thigh: 0.35, calf: 0.15, upperArm: 0.2, forearm: 0.1, torso: 0.45, neck: 0.25 };
export const segScale = (seg: SegmentName, weightKg: number, heightMm: number) => (heightMm / 1800) * Math.pow(weightKg / 75, SENS[seg]);

/** Mesh for one limb segment a→b, from the shared profile table. Positioned at `a`; local +Y runs a→b. */
export function limbMesh(
  seg: SegmentName,
  a: P3,
  b: P3,
  mat: THREE.Material,
  opts: { weightKg: number; heightMm: number; anteriorWorld: THREE.Vector3; sideZ: 1 | -1 },
): THREE.Mesh {
  const prof = PROFILES[seg];
  const k = segScale(seg, opts.weightKg, opts.heightMm);
  const len = v3(a).distanceTo(v3(b));
  const geom = muscleLimbGeometry(
    len,
    (t) => prof.radius(t) * k,
    resolveBulges(prof.bulges, a, b, opts.anteriorWorld, opts.sideZ).map((u) => ({ ...u, amp: u.amp * k })),
    (t) => calAt(seg, t),
    prof.scale,
  );
  const mesh = new THREE.Mesh(geom, mat);
  orientBetween(mesh, v3(a), v3(b));
  mesh.userData.seg = seg;
  return mesh;
}

/** Sagittal-plane normal to a→b pointing towards +x (forward) when `towardsForward`, else the other way. */
export function sagittalNormal(a: P3, b: P3, towardsForward = true): THREE.Vector3 {
  const d = v3(b).sub(v3(a)).normalize();
  const n = new THREE.Vector3(-d.y, d.x, 0);
  if (n.lengthSq() < 1e-6) return new THREE.Vector3(towardsForward ? 1 : -1, 0, 0); // bone along z (T-pose arms)
  n.normalize();
  if ((n.x < 0) === towardsForward) n.negate();
  return n;
}

const ellipsoid = (c: P3, r: P3, mat: THREE.Material, rotZ = 0) => {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24), mat);
  m.scale.set(r[0], r[1], r[2]);
  m.position.set(c[0], c[1], c[2]);
  m.rotation.z = rotZ;
  return m;
};

/** A shaped clay head: the same `headDeform` as the 2D silhouette, oriented along the gaze. */
export function headMesh(headCenter: P3, neckBase: P3, mat: THREE.Material): THREE.Mesh {
  const g = new THREE.SphereGeometry(1, 64, 48);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const [X, Y2, Z] = headDeform(p.getX(i), p.getY(i), p.getZ(i));
    p.setXYZ(i, X, Y2, Z);
  }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat);
  m.position.set(headCenter[0], headCenter[1], headCenter[2]);
  const na = Math.atan2(headCenter[1] - neckBase[1], headCenter[0] - neckBase[0]);
  m.rotation.z = na - (HEAD_GAZE_OFFSET_DEG * Math.PI) / 180;
  m.userData.seg = "head";
  return m;
}

/**
 * Builds the static clay rider from the 3D joint points (`geo.points` by name). Legs are included only when
 * `opts.includeLegs`; with a stroke LUT the legs belong to AnimatedLegs, which uses `limbMesh` too.
 * The returned group is named "mannequin-root" (the frontal-area probe keys on it).
 */
export function buildRiderMeshes(pts: Map<string, P3>, mat: THREE.Material, opts: RiderMeshOpts): THREE.Group {
  const g = new THREE.Group();
  g.name = "mannequin-root";
  const get = (n: string) => pts.get(n);
  const hs = opts.heightMm / 1800;
  const o = { weightKg: opts.weightKg, heightMm: opts.heightMm };

  const hipC = get("hip_center");
  const shC = get("shoulder_center");
  const spine = get("spine_joint");
  const neckBase = get("neck_base_center");
  const head = get("head_center");
  if (!hipC || !shC || !neckBase || !head) return g;

  // Torso: pelvis → waist → ribcage → chest, V-taper (width) and depth from calibration
  const trunkLen = v3(hipC).distanceTo(v3(shC));
  const kt = segScale("torso", opts.weightKg, opts.heightMm);
  const tg = limbGeometry(trunkLen, (t) => PROFILES.torso.radius(t) * kt, 40, 56);
  const tp = tg.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < tp.count; i++) {
    const t = Math.min(1, Math.max(0, tp.getY(i) / trunkLen));
    tp.setX(i, tp.getX(i) * torsoDepth(t) * calAt("torso", t));
    tp.setZ(i, tp.getZ(i) * torsoWidth(t));
  }
  tg.computeVertexNormals();
  const torso = new THREE.Mesh(tg, mat);
  const ax = v3(shC).sub(v3(hipC)).normalize();
  orientBetween(torso, v3(hipC).addScaledVector(ax, -10), v3(shC).addScaledVector(ax, -18));
  torso.userData.seg = "torso";
  g.add(torso);
  void spine;

  const trunkA = Math.atan2(shC[1] - hipC[1], shC[0] - hipC[0]);
  for (const s of [1, -1] as const) {
    // glutes over the saddle
    g.add(ellipsoid([hipC[0] - 52 * hs, hipC[1] - 20 * hs, s * 54 * hs], [MASSES.glute.semiAxes[0] * hs, MASSES.glute.semiAxes[1] * hs, MASSES.glute.semiAxes[2] * hs], mat, trunkA * 0.3));
  }
  // pelvis bar (hip_l ↔ hip_r)
  const hipL = get("hip_l");
  const hipR = get("hip_r");
  if (hipL && hipR) {
    const pr = (opts.feet ? 46 : 78) * hs; // standing: slimmer pelvis so the end caps don't read as hip balls
    const pel = new THREE.Mesh(limbGeometry(Math.abs(hipL[2] - hipR[2]) + 2 * pr, () => pr, 8, 36), mat);
    pel.position.set(hipC[0] - 16 * hs, hipC[1] - 4 * hs, -(Math.abs(hipL[2]) + pr));
    pel.rotation.x = Math.PI / 2;
    pel.rotation.z = 0;
    // lathe axis is +Y; rotate so it runs along +Z
    pel.quaternion.setFromUnitVectors(Y, new THREE.Vector3(0, 0, 1));
    g.add(pel);
  }

  // Arms + shoulders (per side)
  for (const s of [1, -1] as const) {
    const side = s === 1 ? "l" : "r";
    const sh = get(`shoulder_${side}`);
    const el = get(`elbow_${side}`);
    const wr = get(`wrist_${side}`);
    const hd = get(`hand_${side}`);
    if (!sh || !el || !wr) continue;
    const ant = sagittalNormal(sh, el, true);
    // deltoid, set outboard of the shoulder joint, along the upper arm
    const up = v3(el).sub(v3(sh)).normalize();
    const dl = ellipsoid(
      [sh[0] + up.x * 26 * hs, sh[1] + up.y * 26 * hs, sh[2] + s * MASSES.deltoid.outboard * hs + up.z * 26 * hs],
      [MASSES.deltoid.semiAxes[0] * hs, MASSES.deltoid.semiAxes[1] * hs, MASSES.deltoid.semiAxes[2] * hs],
      mat,
    );
    dl.quaternion.setFromUnitVectors(Y, up);
    g.add(dl);
    g.add(limbMesh("upperArm", sh, el, mat, { ...o, anteriorWorld: ant, sideZ: s }));
    g.add(ellipsoid(el, [MASSES.elbow.radius * hs, MASSES.elbow.radius * hs, MASSES.elbow.radius * hs], mat));
    g.add(limbMesh("forearm", el, wr, mat, { ...o, anteriorWorld: sagittalNormal(el, wr, true), sideZ: s }));
    if (hd) {
      const hm = new THREE.Mesh(limbGeometry(v3(wr).distanceTo(v3(hd)) + 28, (t) => lerp(24, 21, t) * hs, 8, 24), mat);
      hm.scale.set(0.78, 1, 1.3);
      orientBetween(hm, v3(wr), v3(hd).add(v3(hd).sub(v3(wr)).normalize().multiplyScalar(28)));
      g.add(hm);
    }
  }
  // trapezius slope
  for (const s of [1, -1] as const) {
    const sh = get(shoulderName(s));
    if (!sh) continue;
    const tm = new THREE.Mesh(limbGeometry(v3(neckBase).distanceTo(v3(sh)), (t) => lerp(42, 36, t) * hs, 8, 24), mat);
    orientBetween(tm, v3(neckBase).add(new THREE.Vector3(-20, -6, 0)), v3(sh).add(new THREE.Vector3(0, 0, s * 18 * hs)));
    g.add(tm);
  }
  // neck + plain clay head
  const kn = segScale("neck", opts.weightKg, opts.heightMm) * calAt("neck", 0.5);
  const neck = new THREE.Mesh(limbGeometry(v3(neckBase).distanceTo(v3(head)), (t) => lerp(44, 40, t) * kn, 8, 24), mat);
  orientBetween(neck, v3(shC).add(new THREE.Vector3(-12, -22, 0)), v3(head).add(new THREE.Vector3(-26, -44, 0)));
  neck.userData.seg = "neck";
  g.add(neck);
  g.add(headMesh(head, neckBase, mat));

  // Legs (static pose) when AnimatedLegs is not mounted
  if (opts.includeLegs) {
    for (const s of [1, -1] as const) {
      const side = s === 1 ? "l" : "r";
      const hip = get(`hip_${side}`);
      const kn2 = get(`knee_${side}`);
      const an = get(`ankle_${side}`);
      if (!hip || !kn2 || !an) continue;
      g.add(limbMesh("thigh", hip, kn2, mat, { ...o, anteriorWorld: sagittalNormal(hip, kn2, true), sideZ: s }));
      g.add(ellipsoid(kn2, [MASSES.knee.radius * hs, MASSES.knee.radius * hs, MASSES.knee.radius * hs * MASSES.knee.depthScale], mat));
      g.add(limbMesh("calf", kn2, an, mat, { ...o, anteriorWorld: sagittalNormal(kn2, an, true), sideZ: s }));
      g.add(ellipsoid(an, [MASSES.ankle.radius * hs, MASSES.ankle.radius * hs, MASSES.ankle.radius * hs], mat));
      if (opts.feet) g.add(ellipsoid([an[0] + 62 * hs, an[1] - 42 * hs, an[2]], [118 * hs, 40 * hs, 44 * hs], mat));
    }
  }
  return g;
}

const shoulderName = (s: 1 | -1) => (s === 1 ? "shoulder_l" : "shoulder_r");

/** Pure bump/lerp re-exports so consumers (AnimatedLegs) don't need the design module for tiny helpers. */
export { bump, lerp };

/**
 * Standing T-pose joint points, proportioned from an athletic-male T-pose reference (fractions of height):
 * hip→shoulder 0.272, shoulder half-width 0.108, upper arm 0.185, forearm 0.145, hand 0.06, hip half-width 0.047,
 * arms drooping 5° below horizontal. Leg lengths and the ankle height come from the rider's own fit (inseam).
 * Gaze is along +x, feet stand on `groundY`, pelvis centred at x = `centerX`. Feeds `buildRiderMeshes` unchanged.
 */
export function tPosePoints(pts: Map<string, P3>, groundY: number, centerX: number, heightMm: number): Map<string, P3> {
  const hs = heightMm / 1800;
  const d = (a: string, b: string) => {
    const pa = pts.get(a);
    const pb = pts.get(b);
    return pa && pb ? v3(pa).distanceTo(v3(pb)) : 0;
  };
  const out = new Map<string, P3>();
  const halfHip = 0.047 * heightMm;
  const halfSh = 0.108 * heightMm;
  const ankleY = groundY + 85 * hs;
  const kneeY = ankleY + (d("knee_l", "ankle_l") || 440 * hs);
  const hipY = kneeY + (d("hip_l", "knee_l") || 440 * hs);
  const shY = hipY + 0.272 * heightMm;
  const neckY = shY + 30 * hs;
  const gaze = (78 * Math.PI) / 180; // head gaze is horizontal when the neck→head angle is 78°
  const headLen = (0.114 * heightMm - 30 * hs) / Math.sin(gaze);
  const droop = (5 * Math.PI) / 180;
  out.set("hip_center", [centerX, hipY, 0]);
  out.set("spine_joint", [centerX, (hipY + shY) / 2, 0]);
  out.set("shoulder_center", [centerX, shY, 0]);
  out.set("neck_base_center", [centerX, neckY, 0]);
  out.set("head_center", [centerX + Math.cos(gaze) * headLen, neckY + Math.sin(gaze) * headLen, 0]);
  for (const [side, z] of [["l", 1], ["r", -1]] as const) {
    out.set(`hip_${side}`, [centerX, hipY, z * halfHip]);
    out.set(`knee_${side}`, [centerX, kneeY, z * halfHip * 0.95]);
    out.set(`ankle_${side}`, [centerX, ankleY, z * halfHip * 0.9]);
    let along = halfSh;
    out.set(`shoulder_${side}`, [centerX, shY, z * along]);
    for (const [name, len] of [["elbow", 0.185], ["wrist", 0.145], ["hand", 0.06]] as const) {
      along += len * heightMm * Math.cos(droop);
      out.set(`${name}_${side}`, [centerX, shY - (along - halfSh) * Math.tan(droop), z * along]);
    }
  }
  return out;
}
