/**
 * cockpit3d.ts — three.js meshes for the cockpit: swept handlebar, integrated
 * bar-stem, two-piece faceplate, and the shift/brake hoods extruded from the
 * traced hood outlines (hoodModels.ts). Geometry comes only from cockpit.ts.
 *
 * Coordinates: bike mm, X forward, Y up, +Z the rider's right.
 */
import * as THREE from "three";
import { BAR_RADIUS, barCenterline3D, type Cockpit, type Vec3 } from "./cockpit";
import { debugMaterial } from "./debug";
import type { Pt } from "./hoodModels";

export interface CockpitMaterials {
  carbon: THREE.Material;
  hood: THREE.Material;
  lever: THREE.Material;
  pad: THREE.Material;
  alloy: THREE.Material;
}

const D2R = Math.PI / 180;
const Y = new THREE.Vector3(0, 1, 0);

/** Section half-extents at arc fraction u: [halfWidth along the binormal, halfHeight along the normal]. */
type SectionFn = (u: number) => [number, number];

/**
 * Sweep an elliptical section along a centripetal Catmull-Rom spline through `pts`.
 * Frames are parallel-transported from an initial "up" so flattened (aero) sections
 * keep their chord horizontal along the tops.
 */
export function sweepTube(pts: Vec3[], section: SectionFn, opts: { samples?: number; ring?: number; capEnd?: boolean; up?: THREE.Vector3 } = {}): THREE.BufferGeometry {
  const samples = opts.samples ?? 120;
  const ring = opts.ring ?? 20;
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), false, "centripetal");
  const pos: number[] = [];
  const idx: number[] = [];
  let N = new THREE.Vector3();
  for (let i = 0; i <= samples; i++) {
    const u = i / samples;
    const p = curve.getPointAt(u);
    const T = curve.getTangentAt(u).normalize();
    if (i === 0) {
      const up = (opts.up ?? Y).clone();
      N = up.sub(T.clone().multiplyScalar(up.dot(T)));
      if (N.lengthSq() < 1e-6) N.set(1, 0, 0);
      N.normalize();
    } else {
      N.sub(T.clone().multiplyScalar(N.dot(T))).normalize();
    }
    const B = new THREE.Vector3().crossVectors(T, N).normalize();
    const [hw, hh] = section(u);
    for (let j = 0; j < ring; j++) {
      const a = (j / ring) * Math.PI * 2;
      const v = p.clone().addScaledVector(B, Math.cos(a) * hw).addScaledVector(N, Math.sin(a) * hh);
      pos.push(v.x, v.y, v.z);
    }
  }
  for (let i = 0; i < samples; i++) {
    for (let j = 0; j < ring; j++) {
      const a = i * ring + j;
      const b = i * ring + ((j + 1) % ring);
      const c = (i + 1) * ring + j;
      const d = (i + 1) * ring + ((j + 1) % ring);
      idx.push(a, c, b, b, c, d);
    }
  }
  if (opts.capEnd) {
    const end = curve.getPointAt(1);
    const ci = pos.length / 3;
    pos.push(end.x, end.y, end.z);
    const base = samples * ring;
    for (let j = 0; j < ring; j++) idx.push(base + j, base + ((j + 1) % ring), ci);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Arc-length fractions of the control points (control-polygon approximation). */
function controlFractions(pts: Vec3[]): number[] {
  const L = [0];
  for (let i = 1; i < pts.length; i++) {
    L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]));
  }
  const total = L[L.length - 1] || 1;
  return L.map((l) => l / total);
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0 || 1)));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** Handlebar: both sides swept, plus a faceplate (two-piece) or a fused bar-stem (integrated). */
export function buildBar(ck: Cockpit, stemPivot: Vec3 | null, mats: CockpitMaterials, debug = false): THREE.Group {
  const g = new THREE.Group();
  g.name = "cockpit-bar";
  const barMat = debug ? debugMaterial("bar") : mats.carbon;
  const integrated = ck.build === "integrated";
  for (const s of [1, -1] as const) {
    const pts = barCenterline3D(ck, s);
    const f = controlFractions(pts);
    // indices into barCenterline3D (before any zero-length collapse, which only ever removes none of these in practice)
    const uTopsEnd = f[Math.min(4, f.length - 1)];
    const uStation = f[Math.min(6, f.length - 1)];
    const uClamp = f[Math.min(1, f.length - 1)];
    const section: SectionFn = (u) => {
      if (integrated) {
        // flattened aero tops (≈40 × 18 mm) that turn round toward the hood clamp
        const t = smooth(uTopsEnd * 0.85, uStation, u);
        return [mix(20, BAR_RADIUS, t), mix(9, BAR_RADIUS, t)];
      }
      // 31.8 mm clamp section stepping down to 23.8 mm
      const t = smooth(uClamp, uClamp + 0.05, u);
      return [mix(15.9, BAR_RADIUS, t), mix(15.9, BAR_RADIUS, t)];
    };
    g.add(new THREE.Mesh(sweepTube(pts, section, { capEnd: true }), barMat));
  }
  const c = ck.clamp;
  if (integrated && stemPivot) {
    // One-piece bar-stem: the stem body widens and flattens into the bar centre.
    const piv = new THREE.Vector3(...stemPivot);
    const cl = new THREE.Vector3(c.x, c.y, 0);
    const mid = piv.clone().lerp(cl, 0.55);
    const path: Vec3[] = [[piv.x, piv.y, 0], [mid.x, mid.y, 0], [cl.x + 6, cl.y + ck.rise * 0.25, 0]];
    const stem = sweepTube(path, (u) => [mix(19, 36, smooth(0.2, 1, u)), mix(18, 11, smooth(0, 1, u))], { samples: 40, ring: 24, capEnd: true });
    g.add(new THREE.Mesh(stem, debug ? debugMaterial("stem") : mats.carbon));
  } else {
    // Faceplate with four bolts on the front of the stem clamp.
    const plate = new THREE.Mesh(new THREE.BoxGeometry(8, 38, 50), debug ? debugMaterial("stem") : mats.carbon);
    plate.position.set(c.x + 17, c.y, 0);
    g.add(plate);
    for (const [dy, dz] of [[11, 17], [-11, 17], [11, -17], [-11, -17]]) {
      const bolt = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 3, 10), mats.alloy);
      bolt.rotation.z = Math.PI / 2;
      bolt.position.set(c.x + 22, c.y + dy, dz);
      g.add(bolt);
    }
  }
  return g;
}

function shapeFrom(pts: Pt[]): THREE.Shape {
  return new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
}

/** Extrude a side outline to `thick` mm with rounded edges that keep the outline exact. */
function extrudeOutline(pts: Pt[], thick: number, bevel: number): THREE.BufferGeometry {
  const b = Math.min(bevel, thick / 2 - 0.5);
  const g = new THREE.ExtrudeGeometry(shapeFrom(pts), {
    depth: Math.max(0.5, thick - 2 * b),
    bevelEnabled: true,
    bevelThickness: b,
    bevelSize: b,
    bevelOffset: -b,
    bevelSegments: 5,
    curveSegments: 4,
  });
  g.translate(0, 0, -(thick - 2 * b) / 2);
  g.computeVertexNormals();
  return g;
}

/** Shift/brake hoods for both sides from the traced outline, pitched and rotated in like the real thing. */
export function buildHoodMeshes(ck: Cockpit, mats: CockpitMaterials, debug = false): THREE.Group {
  const g = new THREE.Group();
  g.name = "cockpit-hoods";
  const prof = ck.hood.profile;
  const body = extrudeOutline(prof.body, ck.hood.thickness, 12);
  const lever = extrudeOutline(prof.lever, 11, 3.5);
  const pad = extrudeOutline(prof.pad, ck.hood.padOnLever ? 3 : 7, 1.2);
  for (const s of [1, -1] as const) {
    const side = new THREE.Group();
    side.add(new THREE.Mesh(body, debug ? debugMaterial("hood") : mats.hood));
    side.add(new THREE.Mesh(lever, debug ? debugMaterial("lever") : mats.lever));
    const padMesh = new THREE.Mesh(pad, debug ? debugMaterial("lever") : mats.pad);
    // Di2 pad sits proud of the blade's outer face; the SRAM paddle sits inboard, behind the blade.
    padMesh.position.z = ck.hood.padOnLever ? s * 6.5 : -s * 7;
    side.add(padMesh);
    side.position.set(ck.station.x, ck.station.y, s * (ck.hoodWidth / 2));
    const qPitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), ck.pitchDeg * D2R);
    const qRoll = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -s * ck.hoodRollDeg * D2R);
    side.quaternion.copy(qPitch.multiply(qRoll));
    g.add(side);
  }
  return g;
}
