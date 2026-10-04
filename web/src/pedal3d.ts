/**
 * Clipless road pedal (Look Keo style) in the spindle's frame: x along the shoe (forward +x), y up, z across the
 * bike with the inboard side (spindle / crank) at −z. The left pedal is this mesh mirrored in z. The whole shape
 * stays inside design/foot.ts `PEDAL_BODY` and below the cleat (y ≤ 7.8), so the shoe still sits on it.
 */
import * as THREE from "three";
import { PEDAL_BODY } from "./design/foot";

const [LEN, THICK, WIDTH] = PEDAL_BODY;
const BEVEL = 2.5;

/** Rounded polygon outline (counter-clockwise) in (x, z) with corner radius r. */
function roundedPoly(pts: Array<[number, number]>, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i + n - 1) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const d0 = new THREE.Vector2(p0[0] - p1[0], p0[1] - p1[1]).normalize();
    const d2 = new THREE.Vector2(p2[0] - p1[0], p2[1] - p1[1]).normalize();
    const a = new THREE.Vector2(p1[0], p1[1]).addScaledVector(d0, r);
    const b = new THREE.Vector2(p1[0], p1[1]).addScaledVector(d2, r);
    if (i === 0) s.moveTo(a.x, a.y);
    else s.lineTo(a.x, a.y);
    s.quadraticCurveTo(p1[0], p1[1], b.x, b.y);
  }
  s.closePath();
  return s;
}

/** Extrude a footprint (x, z) upward from y0 by `h`, with a bevel. */
function slab(shape: THREE.Shape, y0: number, h: number, bevel: number): THREE.BufferGeometry {
  // the shape lives in the XY plane; rotateX(−90°) sends its y to −z and the extrusion (z) to +y
  const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.01, h - 2 * bevel), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 8 });
  g.translate(0, 0, bevel);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0, 0);
  g.computeVertexNormals();
  return g;
}

export interface PedalParts {
  /** tapered, rounded body */
  body: THREE.BufferGeometry;
  /** cleat recess pad on the top face */
  pad: THREE.BufferGeometry;
  /** front plate across the body */
  plate: THREE.BufferGeometry;
  /** spindle boss on the inboard side */
  boss: THREE.BufferGeometry;
}

let cached: PedalParts | null = null;

export function pedalParts(): PedalParts {
  if (cached) return cached;
  const hl = LEN / 2;
  const hw = WIDTH / 2;
  // shape y is −z after the rotation, so inboard (−z) is +y here; the outline is symmetric across the bike anyway,
  // the toe (+x) end is the narrower one
  const outline = (inset: number, toeTaper = 9): Array<[number, number]> => [
    [-hl + inset, -(hw - inset)],
    [hl - inset, -(hw - toeTaper - inset)],
    [hl - inset, hw - toeTaper - inset],
    [-hl + inset, hw - inset],
  ];
  const body = slab(roundedPoly(outline(0), 9), -THICK / 2, THICK, BEVEL);
  // cleat recess: darker rubber pad filling the heel half, just proud of the top face
  const pad = slab(roundedPoly([[-hl + 9, -(hw - 9)], [2, -(hw - 12)], [2, hw - 12], [-hl + 9, hw - 9]], 5), THICK / 2 - 0.2, 0.9, 0);
  // front plate: bright bridge across the toe half
  const plate = slab(roundedPoly([[6, -(hw - 8)], [hl - 8, -(hw - 14)], [hl - 8, hw - 14], [6, hw - 8]], 4), THICK / 2 - 0.2, 1.1, 0);
  // boss: where the pedal body meets the spindle, standing out of the inboard side
  const boss = new THREE.CylinderGeometry(12.5, 11, 24, 20, 1);
  boss.rotateX(Math.PI / 2);
  boss.translate(0, 0, -hw - 8);
  cached = { body, pad, plate, boss };
  return cached;
}
