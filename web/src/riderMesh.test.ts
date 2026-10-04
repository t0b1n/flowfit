import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { bendTorso, buildRiderMeshes, limbGeometry, orientBetween, type P3 } from "./riderMesh";
import { spinePath } from "./design/riderBody";
import { GeometryCache } from "./scene3d/geometryCache";

describe("bendTorso", () => {
  it("at 0° bend reproduces the straight torso placed by orientBetween (within 1 mm)", () => {
    const hip = { x: -60, y: 790 };
    const sh = { x: 380, y: 1010 };
    const spine = { x: hip.x + (sh.x - hip.x) * 0.4, y: hip.y + (sh.y - hip.y) * 0.4 };
    const len = Math.hypot(sh.x - hip.x, sh.y - hip.y);
    const rest = limbGeometry(len, () => 80, 12, 16);
    const bent = bendTorso(rest.clone(), spinePath(hip, spine, sh));
    const old = rest.clone();
    const mesh = new THREE.Mesh(old);
    const ax = new THREE.Vector3(sh.x - hip.x, sh.y - hip.y, 0).normalize();
    orientBetween(mesh, new THREE.Vector3(hip.x, hip.y, 0).addScaledVector(ax, -10), new THREE.Vector3(sh.x, sh.y, 0));
    mesh.updateMatrix();
    old.applyMatrix4(mesh.matrix);
    const a = bent.attributes.position as THREE.BufferAttribute;
    const b = old.attributes.position as THREE.BufferAttribute;
    let worst = 0;
    for (let i = 0; i < a.count; i++) worst = Math.max(worst, Math.hypot(a.getX(i) - b.getX(i), a.getY(i) - b.getY(i), a.getZ(i) - b.getZ(i)));
    expect(worst).toBeLessThan(1);
  });
});

describe("buildRiderMeshes with a cache", () => {
  const pts = new Map<string, P3>([
    ["hip_center", [-60, 790, 0]], ["spine_joint", [116, 878, 0]], ["shoulder_center", [380, 1010, 0]],
    ["neck_base_center", [400, 1030, 0]], ["head_center", [470, 1080, 0]],
    ["hip_r", [-60, 790, 90]], ["hip_l", [-60, 790, -90]],
    ["shoulder_r", [380, 1010, 190]], ["shoulder_l", [380, 1010, -190]],
    ["elbow_r", [500, 800, 190]], ["elbow_l", [500, 800, -190]],
    ["wrist_r", [650, 780, 190]], ["wrist_l", [650, 780, -190]],
    ["hand_r", [700, 770, 190]], ["hand_l", [700, 770, -190]],
  ]);
  const opts = { heightMm: 1800, includeLegs: false };
  const geoms = (g: THREE.Group) => new Set<THREE.BufferGeometry>(g.children.map((c) => (c as THREE.Mesh).geometry));

  it("reuses every rest geometry when only the saddle-side points move", () => {
    const cache = new GeometryCache();
    const mat = new THREE.MeshBasicMaterial();
    cache.begin();
    const a = buildRiderMeshes(pts, mat, opts, cache);
    cache.end();
    // move the whole rider up and forward: shapes (lengths) are unchanged
    const moved = new Map([...pts].map(([k, p]) => [k, [p[0] + 25, p[1] + 40, p[2]] as P3]));
    cache.begin();
    const b = buildRiderMeshes(moved, mat, opts, cache);
    cache.end();
    const ga = geoms(a);
    const shared = [...geoms(b)].filter((g) => ga.has(g)).length;
    // everything except the world-space bent torso is shared
    expect(shared).toBeGreaterThanOrEqual(geoms(b).size - 1);
  });
});
