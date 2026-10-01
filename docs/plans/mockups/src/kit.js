// Shared primitives: limb lathe builder and helpers (used by 3D; 2D uses the same numbers).
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
