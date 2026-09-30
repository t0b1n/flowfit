// Shared primitives + anatomy/helmet recipes (used by 3D; 2D uses the same numbers).
import * as THREE from 'three';
export const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);
export const V2 = (p, z = 0) => V(p.x, p.y, z);
export const lerp = (a, b, t) => a + (b - a) * t;
export const bump = (t, c, w) => Math.exp(-((t - c) ** 2) / (2 * w * w));
export const d2r = d => d * Math.PI / 180;

export function limbGeometry(L, prof, seg = 36, lat = 48) {
  const pts = [], r0 = prof(0), r1 = prof(1);
  for (let i = 0; i <= 9; i++) { const a = -Math.PI / 2 + i / 9 * Math.PI / 2; pts.push(new THREE.Vector2(Math.max(1e-3, Math.cos(a) * r0), Math.sin(a) * r0)); }
  for (let i = 1; i < seg; i++) { const t = i / seg; pts.push(new THREE.Vector2(prof(t), t * L)); }
  for (let i = 0; i <= 9; i++) { const a = i / 9 * Math.PI / 2; pts.push(new THREE.Vector2(Math.max(1e-3, Math.cos(a) * r1), L + Math.sin(a) * r1)); }
  const g = new THREE.LatheGeometry(pts, lat); g.computeVertexNormals(); return g;
}
export function between(obj, a, b) { obj.position.copy(a); obj.quaternion.setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize()); return obj; }
export function limb(a, b, prof, mat, sxz) {
  const g = limbGeometry(a.distanceTo(b), prof); if (sxz) g.scale(sxz[0], 1, sxz[1]);
  const m = between(new THREE.Mesh(g, mat), a, b); m.castShadow = m.receiveShadow = true; return m;
}
export const tube = (a, b, r0, r1, mat) => limb(a, b, t => lerp(r0, r1, t), mat);
export const sphere = (p, r, mat, s = [1, 1, 1]) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 40, 24), mat); m.scale.set(...s); m.position.copy(p); m.castShadow = m.receiveShadow = true; return m; };

// ── Optimal-cyclist physique profiles (radius mm at t along bone), base = male 1800/70 kg.
// Female base scales: upper body 0.88, legs 0.95, pelvis 1.06, waist pinch stronger.
export function profiles(sex) {
  const f = sex === 'f', u = f ? .88 : 1, l = f ? .95 : 1;
  return {
    thigh: t => l * (lerp(78, 49, t) + 12 * bump(t, .32, .2) + 5 * bump(t, .8, .08)),   // vastus + VMO teardrop
    shin: t => l * (lerp(42, 26, t) + 17 * bump(t, .27, .12)),                           // strong calf, slim ankle
    upper: t => u * (lerp(38, 31, t) + 4 * bump(t, .42, .2)),                            // lean arms
    fore: t => u * (lerp(34, 21, t) + 5 * bump(t, .2, .15)),
    torso: t => u * (96 - (f ? 24 : 18) * bump(t, .4, .16) + (f ? 14 : 20) * bump(t, .8, .14)),
    torsoXZ: [.86, f ? 1.12 : 1.18],                                                        // flat back, narrow-ish chest
    neck: () => u * 46, pelvis: f ? 88 : 80, glute: f ? 62 : 56, delt: u * 44,
    head: f ? [92, 104, 72] : [96, 108, 76],
  };
}

// ── Road helmet (head-local: x forward, y up, z lateral). Returns outer-surface point for station s∈[0,1] (tail→front), lateral φ∈[-1,1].
const CR = (pts, x) => { let i = 0; while (i < pts.length - 2 && pts[i + 1][0] <= x) i++; const [x0, y0] = pts[i], [x1, y1] = pts[i + 1]; const t = Math.min(1, Math.max(0, (x - x0) / (x1 - x0))); return y0 + (y1 - y0) * (t * t * (3 - 2 * t)); };
export function helmetPoint(s, phi, k = 1) {
  // long road-helmet teardrop: peak slightly forward, long sloping tail, low rear edge
  const x = lerp(-172, 122, s);
  const xc = 8, L = x >= xc ? 116 : 182, u = (x - xc) / L;
  const top = 8 + 118 * Math.pow(Math.max(0, 1 - Math.abs(u) ** (x >= xc ? 2.2 : 1.7)), 1 / (x >= xc ? 2.2 : 1.7));
  const bot = CR([[-172, -8], [-150, -34], [-110, -52], [-60, -34], [-10, -16], [40, -2], [88, 18], [122, 30]], x);
  const w = 96 * Math.pow(Math.max(0, 1 - Math.abs((x + 16) / (x > -16 ? 140 : 162)) ** 2.3), 1 / 2.3);
  const q = 2.6, a = phi * Math.PI / 2;
  const z = w * Math.sign(Math.sin(a)) * Math.abs(Math.sin(a)) ** (2 / q);
  const y = bot + (Math.max(top, bot + 1) - bot) * Math.abs(Math.cos(a)) ** (2 / q);
  return V(x * k, y * k, z * k);
}
export function helmetGeometry(k = 1, s0 = 0, s1 = 1, p0 = -1, p1 = 1, off = 0, NS = 70, NP = 60) {
  const pos = [], idx = [];
  for (let i = 0; i <= NS; i++) for (let j = 0; j <= NP; j++) {
    const p = helmetPoint(lerp(s0, s1, i / NS), lerp(p0, p1, j / NP), k);
    if (off) { const c = V(p.x * .9, 20, 0); p.add(p.clone().sub(c).normalize().multiplyScalar(off)); }
    pos.push(p.x, p.y, p.z);
  }
  for (let i = 0; i < NS; i++) for (let j = 0; j < NP; j++) { const a = i * (NP + 1) + j, b = a + NP + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
// vent channels: (s range, φ centre, φ half-width)
export const VENTS = [[.14, .9, 0, .03], [.1, .88, .18, .04], [.1, .88, -.18, .04], [.14, .84, .38, .045], [.14, .84, -.38, .045], [.22, .78, .58, .045], [.22, .78, -.58, .045], [.3, .7, .78, .04], [.3, .7, -.78, .04]];
