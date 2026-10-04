/**
 * Chain links for the 3D bike: instanced side plates and rollers placed along the closed path of `design/chain.ts`.
 * A 12-speed chain is ~5.4 mm wide; links alternate between inner plates (nested) and outer plates (on the outside).
 */
import * as THREE from "three";
import type { ChainPath } from "./design/chain";

/** Plate end radius, waist half-height, thickness; roller radius / length; plate stations (mm from the chain centre). */
const PLATE = { endR: 4.2, waist: 3.1, thick: 0.9, outerZ: 2.35, innerZ: 1.45 };
const ROLLER = { r: 3.3, len: 4.2 };

/** One side plate: a peanut shape between two roller centres `pitch` apart, extruded in z about 0. */
function plateGeometry(pitch: number): THREE.BufferGeometry {
  const { endR: R, waist, thick } = PLATE;
  const h = pitch / 2;
  const ctl = 2 * waist - R; // control point that puts the waist at `waist`
  const sh = new THREE.Shape();
  sh.moveTo(-h, -R);
  sh.quadraticCurveTo(0, -ctl, h, -R);
  sh.absarc(h, 0, R, -Math.PI / 2, Math.PI / 2, false);
  sh.quadraticCurveTo(0, ctl, -h, R);
  sh.absarc(-h, 0, R, Math.PI / 2, (3 * Math.PI) / 2, false);
  const g = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: false, curveSegments: 5 });
  g.translate(0, 0, -thick / 2);
  return g;
}

function rollerGeometry(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(ROLLER.r, ROLLER.r, ROLLER.len, 12, 1);
  g.rotateX(Math.PI / 2); // axis along z
  return g;
}

/**
 * The chain as one group at lateral station `z` (the chain line). `plateMat` and `rollerMat` are the two metals;
 * `prim` is the caller's shape-keyed geometry cache.
 */
export function buildChain(
  path: ChainPath,
  z: number,
  plateMat: THREE.Material,
  rollerMat: THREE.Material,
  prim: <G extends THREE.BufferGeometry>(key: string, build: () => G) => G,
): THREE.Group {
  const g = new THREE.Group();
  g.name = "chain";
  const n = path.links;
  const plates = new THREE.InstancedMesh(prim(`chain|plate|${path.pitch.toFixed(2)}`, () => plateGeometry(path.pitch)), plateMat, 2 * n);
  const rollers = new THREE.InstancedMesh(prim("chain|roller", rollerGeometry), rollerMat, n);
  const dummy = new THREE.Object3D();
  const pts = Array.from({ length: n + 1 }, (_, i) => path.at(i * path.pitch));
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const off = i % 2 === 0 ? PLATE.innerZ : PLATE.outerZ;
    for (const side of [1, -1]) {
      dummy.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, z + side * off);
      dummy.rotation.set(0, 0, angle);
      dummy.updateMatrix();
      plates.setMatrixAt(2 * i + (side > 0 ? 0 : 1), dummy.matrix);
    }
    dummy.position.set(a.x, a.y, z);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    rollers.setMatrixAt(i, dummy.matrix);
  }
  plates.instanceMatrix.needsUpdate = true;
  rollers.instanceMatrix.needsUpdate = true;
  g.add(plates, rollers);
  return g;
}
