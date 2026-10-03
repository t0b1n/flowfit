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
  spinePath,
  type SegmentName,
  type SpinePath,
} from "./design/riderBody";
import { GeometryCache, computeNormals, k1, k3, normalsWanted, withNormals } from "./scene3d/geometryCache";

export type P3 = [number, number, number];

const Y = new THREE.Vector3(0, 1, 0);
const v3 = (p: P3) => new THREE.Vector3(p[0], p[1], p[2]);

// ── Reference limbs ─────────────────────────────────────────────────────────
//
// A body lathe's shape is a function of t = y / len (radius profile, muscle bulges, calibration), times the size factor k
// for radii and bulge heights. So one reference limb, built once at length `len0` and k = 1, becomes any rider's limb by a
// vertex remap: x, z × k; the shaft's y × len / len0; the two rounded end caps (y < 0, y > len0) × k, so they keep their
// shape. Normals follow with the inverse transpose (shaft) or unchanged (caps). No lathe build, bulge loop or
// computeVertexNormals per slider tick. `?unitlimbs=0` (DEV) switches back to building every limb from scratch.

export const UNIT_LIMBS: boolean = !(
  import.meta.env.DEV &&
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("unitlimbs") === "0"
);

const unitRefs = new Map<string, THREE.BufferGeometry>();
const unitRef = (key: string, build: () => THREE.BufferGeometry) => {
  let g = unitRefs.get(key);
  if (!g) {
    g = withNormals(true, build);
    unitRefs.set(key, g);
  }
  return g;
};

/** Remap the reference lathe `unit` (built at `len0`, k = 1) to length `len` and size factor `k`. */
export function scaleLathe(unit: THREE.BufferGeometry, len0: number, len: number, k: number): THREE.BufferGeometry {
  const s = len / len0;
  const up = unit.attributes.position as THREE.BufferAttribute;
  const un = unit.attributes.normal as THREE.BufferAttribute | undefined;
  const pos = new Float32Array(up.count * 3);
  const nrm = un && normalsWanted() ? new Float32Array(up.count * 3) : null;
  for (let i = 0; i < up.count; i++) {
    const y = up.getY(i);
    const cap = y < 0 || y > len0;
    pos[i * 3] = up.getX(i) * k;
    pos[i * 3 + 1] = y < 0 ? y * k : y > len0 ? len + (y - len0) * k : y * s;
    pos[i * 3 + 2] = up.getZ(i) * k;
    if (nrm && un) {
      const nx = un.getX(i), ny = un.getY(i), nz = un.getZ(i);
      if (cap) {
        nrm[i * 3] = nx; nrm[i * 3 + 1] = ny; nrm[i * 3 + 2] = nz;
      } else {
        const a = nx / k, b = ny / s, c = nz / k;
        const l = Math.hypot(a, b, c) || 1;
        nrm[i * 3] = a / l; nrm[i * 3 + 1] = b / l; nrm[i * 3 + 2] = c / l;
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  if (nrm) g.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
  // own copies: disposing this geometry must not free buffers shared with the reference
  if (unit.attributes.uv) g.setAttribute("uv", unit.attributes.uv.clone());
  if (unit.index) g.setIndex(unit.index.clone());
  return g;
}

/**
 * A body lathe for a rider: from the cached reference when `UNIT_LIMBS`, else `exact()`. `unitKey` identifies the
 * reference shape (everything but length and size); `unit()` builds it at `len0`, k = 1.
 */
function bodyLathe(unitKey: string, len0: number, len: number, k: number, unit: () => THREE.BufferGeometry, exact: () => THREE.BufferGeometry): THREE.BufferGeometry {
  if (!UNIT_LIMBS) return exact();
  return scaleLathe(unitRef(unitKey, unit), len0, len, k);
}

/** Reference lengths (mm at 1800 mm / 75 kg) the shared reference limbs are built at. */
export const LIMB_LEN0 = { thigh: 440, calf: 430, upperArm: 300, forearm: 260, torso: 520, neck: 120, trap: 110, hand: 120, pelvis: 280, shoe: 270 } as const;

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
  computeNormals(g);
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
  computeNormals(g);
  return g;
}

// ── Rider ───────────────────────────────────────────────────────────────────

export interface RiderMeshOpts {
  /** inward hood rotation (deg): the hands roll with the hoods */
  handRollDeg?: number;
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

/**
 * Bend a torso lathe (local +Y = spine, local x = fore-aft, local z = lateral) onto `path`. The rest lathe sits 10 mm
 * behind the hip (`s = y − 10`), as the straight torso was placed by `orientBetween`. Only x/y move; at 0° bend this
 * reproduces the straight torso. The returned geometry is in world coordinates: the mesh gets an identity transform.
 */
export function bendTorso(geom: THREE.BufferGeometry, path: SpinePath): THREE.BufferGeometry {
  const p = geom.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const { p: c, t } = path.at(p.getY(i) - 10);
    // image of local +X under the rotation taking +Y to t
    p.setXYZ(i, c.x + t.y * x, c.y - t.x * x, p.getZ(i));
  }
  p.needsUpdate = true;
  computeNormals(geom);
  geom.computeBoundingSphere();
  geom.computeBoundingBox();
  return geom;
}

const roundBulges = (b: LocalBulge[]) => JSON.stringify(b, (_, x) => (typeof x === "number" ? Math.round(x * 1000) / 1000 : x));

/** The muscled lathe for body segment `seg` at length `len` and size factor `k` (`bulges` resolved, amplitudes at k = 1). */
export function muscleLimb(seg: SegmentName, len: number, k: number, bulges: LocalBulge[]): THREE.BufferGeometry {
  const prof = PROFILES[seg];
  const len0 = LIMB_LEN0[seg as keyof typeof LIMB_LEN0] as number;
  return bodyLathe(
    `limb|${seg}|${roundBulges(bulges)}|${prof.scale}`,
    len0,
    len,
    k,
    () => muscleLimbGeometry(len0, (t) => prof.radius(t), bulges, (t) => calAt(seg, t), prof.scale),
    () => muscleLimbGeometry(len, (t) => prof.radius(t) * k, bulges.map((u) => ({ ...u, amp: u.amp * k })), (t) => calAt(seg, t), prof.scale),
  );
}

/** Mesh for one limb segment a→b, from the shared profile table. Positioned at `a`; local +Y runs a→b. */
export function limbMesh(
  seg: SegmentName,
  a: P3,
  b: P3,
  mat: THREE.Material,
  opts: { weightKg: number; heightMm: number; anteriorWorld: THREE.Vector3; sideZ: 1 | -1 },
  cache?: GeometryCache,
): THREE.Mesh {
  const prof = PROFILES[seg];
  const k = segScale(seg, opts.weightKg, opts.heightMm);
  const len = v3(a).distanceTo(v3(b));
  const unitBulges = resolveBulges(prof.bulges, a, b, opts.anteriorWorld, opts.sideZ);
  const bulges = unitBulges.map((u) => ({ ...u, amp: u.amp * k }));
  const build = () => muscleLimb(seg, len, k, unitBulges);
  const geom = cache
    ? cache.get(`limb|${seg}|${k1(len)}|${k3(k)}|${JSON.stringify(bulges, (_, x) => (typeof x === "number" ? Math.round(x * 1000) / 1000 : x))}|${prof.scale}`, build)
    : build();
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

const ellipsoid = (c: P3, r: P3, mat: THREE.Material, rotZ = 0, cache?: GeometryCache) => {
  const m = new THREE.Mesh(cache ? cache.get("sphere40x24", () => new THREE.SphereGeometry(1, 40, 24)) : new THREE.SphereGeometry(1, 40, 24), mat);
  m.scale.set(r[0], r[1], r[2]);
  m.position.set(c[0], c[1], c[2]);
  m.rotation.z = rotZ;
  return m;
};

/** A shaped clay head: the same `headDeform` as the 2D silhouette, oriented along the gaze. */
export function headMesh(headCenter: P3, neckBase: P3, mat: THREE.Material, cache?: GeometryCache): THREE.Mesh {
  const build = () => {
    const g = new THREE.SphereGeometry(1, 64, 48);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const [X, Y2, Z] = headDeform(p.getX(i), p.getY(i), p.getZ(i));
      p.setXYZ(i, X, Y2, Z);
    }
    computeNormals(g);
    return g;
  };
  const g = cache ? cache.get("head", build) : build();
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
export function buildRiderMeshes(pts: Map<string, P3>, mat: THREE.Material, opts: RiderMeshOpts, cache?: GeometryCache): THREE.Group {
  const g = new THREE.Group();
  g.name = "mannequin-root";
  /** add `obj` to the rider, tagged with the body part the 2D Layers toggles address (legs, arms, torso, head, shoe) */
  const add = (obj: THREE.Object3D, part: "torso" | "arm" | "head" | "leg" | "shoe") => {
    obj.userData.part = part;
    g.add(obj);
  };
  const get = (n: string) => pts.get(n);
  const hs = opts.heightMm / 1800;
  const o = { weightKg: opts.weightKg, heightMm: opts.heightMm };

  const hipC = get("hip_center");
  const shC = get("shoulder_center");
  const spine = get("spine_joint");
  const neckBase = get("neck_base_center");
  const head = get("head_center");
  if (!hipC || !shC || !neckBase || !head) return g;

  // Torso: pelvis → waist → ribcage → chest, V-taper (width) and depth from calibration. The spine runs hip → shoulder
  // as a smooth curve (spinePath); the shoulder is the solver's, only the surface bends.
  const path = spinePath({ x: hipC[0], y: hipC[1] }, spine ? { x: spine[0], y: spine[1] } : { x: (hipC[0] + shC[0]) / 2, y: (hipC[1] + shC[1]) / 2 }, { x: shC[0], y: shC[1] });
  const kt = segScale("torso", opts.weightKg, opts.heightMm);
  const torsoLathe = (len: number, k: number) => {
    const tg = limbGeometry(len, (t) => PROFILES.torso.radius(t) * k, 40, 56);
    const tp = tg.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < tp.count; i++) {
      const t = Math.min(1, Math.max(0, tp.getY(i) / len));
      tp.setX(i, tp.getX(i) * torsoDepth(t) * calAt("torso", t));
      tp.setZ(i, tp.getZ(i) * torsoWidth(t));
    }
    computeNormals(tg);
    return tg;
  };
  const buildTorso = () =>
    bodyLathe("torso", LIMB_LEN0.torso, path.len, kt, () => torsoLathe(LIMB_LEN0.torso, 1), () => torsoLathe(path.len, kt));
  const rest = cache ? cache.get(`torso|${k1(path.len)}|${k3(kt)}`, buildTorso) : buildTorso();
  // The bent surface is in world coordinates, so its key carries the three spine points as well as the rest shape.
  const bentKey = `torsoBent|${k1(path.len)}|${k3(kt)}|${[hipC, spine ?? hipC, shC].map((q) => `${k1(q[0])},${k1(q[1])}`).join("|")}`;
  const torso = new THREE.Mesh(cache ? cache.get(bentKey, () => bendTorso(rest.clone(), path)) : bendTorso(rest.clone(), path), mat);
  torso.userData.seg = "torso";
  add(torso, "torso");

  const trunkA = Math.atan2(shC[1] - hipC[1], shC[0] - hipC[0]);
  for (const s of [1, -1] as const) {
    // glutes over the saddle
    add(ellipsoid([hipC[0] - 52 * hs, hipC[1] - 20 * hs, s * 54 * hs], [MASSES.glute.semiAxes[0] * hs, MASSES.glute.semiAxes[1] * hs, MASSES.glute.semiAxes[2] * hs], mat, trunkA * 0.3, cache), "torso");
  }
  // pelvis bar (hip_r ↔ hip_l)
  const hipR = get("hip_r");
  const hipL = get("hip_l");
  if (hipR && hipL) {
    const pr = 46 * hs; // reference-matched pelvis: end caps must not read as hip balls
    const pelLen = Math.abs(hipR[2] - hipL[2]) + 2 * pr;
    const pelGeom = () => bodyLathe("pelvis", LIMB_LEN0.pelvis, pelLen, pr / 46, () => limbGeometry(LIMB_LEN0.pelvis, () => 46, 8, 36), () => limbGeometry(pelLen, () => pr, 8, 36));
    const pel = new THREE.Mesh(cache ? cache.get(`lathe|pelvis|${k1(pelLen)}|${k1(pr)}`, pelGeom) : pelGeom(), mat);
    pel.position.set(hipC[0] - 16 * hs, hipC[1] - 4 * hs, -(Math.abs(hipR[2]) + pr));
    pel.rotation.x = Math.PI / 2;
    pel.rotation.z = 0;
    // lathe axis is +Y; rotate so it runs along +Z
    pel.quaternion.setFromUnitVectors(Y, new THREE.Vector3(0, 0, 1));
    add(pel, "torso");
  }

  // Arms + shoulders (per side)
  for (const s of [1, -1] as const) {
    const side = s === 1 ? "r" : "l"; // +Z is the rider's right
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
      0,
      cache,
    );
    dl.quaternion.setFromUnitVectors(Y, up);
    add(dl, "arm");
    add(limbMesh("upperArm", sh, el, mat, { ...o, anteriorWorld: ant, sideZ: s }, cache), "arm");
    add(ellipsoid(el, [MASSES.elbow.radius * hs, MASSES.elbow.radius * hs, MASSES.elbow.radius * hs], mat, 0, cache), "arm");
    add(limbMesh("forearm", el, wr, mat, { ...o, anteriorWorld: sagittalNormal(el, wr, true), sideZ: s }, cache), "arm");
    if (hd) {
      const handLen = v3(wr).distanceTo(v3(hd)) + 28;
      const handGeom = () => bodyLathe("hand", LIMB_LEN0.hand, handLen, hs, () => limbGeometry(LIMB_LEN0.hand, (t) => lerp(24, 21, t), 8, 24), () => limbGeometry(handLen, (t) => lerp(24, 21, t) * hs, 8, 24));
      const hm = new THREE.Mesh(cache ? cache.get(`lathe|hand|${k1(handLen)}|${k3(hs)}`, handGeom) : handGeom(), mat);
      hm.scale.set(0.78, 1, 1.3);
      orientBetween(hm, v3(wr), v3(hd).add(v3(hd).sub(v3(wr)).normalize().multiplyScalar(28)));
      // roll the flattened palm about its own axis with the hoods (top of the hand toward the centreline)
      if (opts.handRollDeg) hm.rotateY((-s * opts.handRollDeg * Math.PI) / 180);
      add(hm, "arm");
    }
  }
  // trapezius slope
  for (const s of [1, -1] as const) {
    const sh = get(shoulderName(s));
    if (!sh) continue;
    const trapLen = v3(neckBase).distanceTo(v3(sh));
    const trapGeom = () => bodyLathe("trap", LIMB_LEN0.trap, trapLen, hs, () => limbGeometry(LIMB_LEN0.trap, (t) => lerp(42, 36, t), 8, 24), () => limbGeometry(trapLen, (t) => lerp(42, 36, t) * hs, 8, 24));
    const tm = new THREE.Mesh(cache ? cache.get(`lathe|trap|${k1(trapLen)}|${k3(hs)}`, trapGeom) : trapGeom(), mat);
    orientBetween(tm, v3(neckBase).add(new THREE.Vector3(-20, -6, 0)), v3(sh).add(new THREE.Vector3(0, 0, s * 18 * hs)));
    add(tm, "torso");
  }
  // neck + plain clay head
  const kn = segScale("neck", opts.weightKg, opts.heightMm) * calAt("neck", 0.5);
  const neckLen = v3(neckBase).distanceTo(v3(head));
  const neckGeom = () => bodyLathe("neck", LIMB_LEN0.neck, neckLen, kn, () => limbGeometry(LIMB_LEN0.neck, (t) => lerp(44, 40, t), 8, 24), () => limbGeometry(neckLen, (t) => lerp(44, 40, t) * kn, 8, 24));
  const neck = new THREE.Mesh(cache ? cache.get(`lathe|neck|${k1(neckLen)}|${k3(kn)}`, neckGeom) : neckGeom(), mat);
  orientBetween(neck, v3(shC).add(new THREE.Vector3(-12, -22, 0)), v3(head).add(new THREE.Vector3(-26, -44, 0)));
  neck.userData.seg = "neck";
  add(neck, "torso");
  add(headMesh(head, neckBase, mat, cache), "head");

  // Legs (static pose) when AnimatedLegs is not mounted
  if (opts.includeLegs) {
    for (const s of [1, -1] as const) {
      const side = s === 1 ? "r" : "l"; // +Z is the rider's right
      const hip = get(`hip_${side}`);
      const kn2 = get(`knee_${side}`);
      const an = get(`ankle_${side}`);
      if (!hip || !kn2 || !an) continue;
      add(limbMesh("thigh", hip, kn2, mat, { ...o, anteriorWorld: sagittalNormal(hip, kn2, true), sideZ: s }, cache), "leg");
      add(ellipsoid(kn2, [MASSES.knee.radius * hs, MASSES.knee.radius * hs, MASSES.knee.radius * hs * MASSES.knee.depthScale], mat, 0, cache), "leg");
      add(limbMesh("calf", kn2, an, mat, { ...o, anteriorWorld: sagittalNormal(kn2, an, true), sideZ: s }, cache), "leg");
      add(ellipsoid(an, [MASSES.ankle.radius * hs, MASSES.ankle.radius * hs, MASSES.ankle.radius * hs], mat, 0, cache), "leg");
      if (opts.feet) add(ellipsoid([an[0] + 62 * hs, an[1] - 42 * hs, an[2]], [118 * hs, 40 * hs, 44 * hs], mat, 0, cache), "shoe");
    }
  }
  return g;
}

const shoulderName = (s: 1 | -1) => (s === 1 ? "shoulder_r" : "shoulder_l");

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
  const kneeY = ankleY + (d("knee_r", "ankle_r") || 440 * hs);
  const hipY = kneeY + (d("hip_r", "knee_r") || 440 * hs);
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
  for (const [side, z] of [["r", 1], ["l", -1]] as const) {
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
