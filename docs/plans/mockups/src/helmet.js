// Simplified helmet built from the product photos (see buildhull.mjs): visual hull of the side + front silhouettes,
// rounded plan, hollowed for the head, vents pressed in as shallow recesses. Head-local frame (+x forward, +y up).
import * as THREE from 'three';
const G = await (await fetch(new URL('./helmet_geo.json', import.meta.url))).json();
export function buildHelmet(mat) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(G.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(G.nor, 3)); if (G.index) g.setIndex(G.index);
  const m = new THREE.Mesh(g, mat); m.castShadow = m.receiveShadow = true; return m;
}
export function helmetSide2D() { return { outline: G.outline, vents: [], edges: [] }; }
