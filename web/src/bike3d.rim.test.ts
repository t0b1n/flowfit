import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { rimGeometry } from "./bike3d";
import { RIM } from "./design/bikeProfiles";

describe("rimGeometry", () => {
  const R = 340;
  const g = rimGeometry(R);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const nrm = g.attributes.normal as THREE.BufferAttribute;
  const idx = g.index!;

  it("is a closed solid with faces pointing out (positive signed volume)", () => {
    let vol = 0;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (let i = 0; i < idx.count; i += 3) {
      a.fromBufferAttribute(pos, idx.getX(i));
      b.fromBufferAttribute(pos, idx.getX(i + 1));
      c.fromBufferAttribute(pos, idx.getX(i + 2));
      vol += a.dot(b.clone().cross(c)) / 6;
    }
    expect(vol).toBeGreaterThan(0);
  });

  it("vertex normals agree with the face winding (not inverted)", () => {
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
    let agree = 0, total = 0;
    for (let i = 0; i < idx.count; i += 3) {
      const ia = idx.getX(i), ib = idx.getX(i + 1), ic = idx.getX(i + 2);
      a.fromBufferAttribute(pos, ia); b.fromBufferAttribute(pos, ib); c.fromBufferAttribute(pos, ic);
      const face = b.clone().sub(a).cross(c.clone().sub(a));
      if (face.lengthSq() < 1e-9) continue;
      n.fromBufferAttribute(nrm, ia).add(new THREE.Vector3().fromBufferAttribute(nrm, ib)).add(new THREE.Vector3().fromBufferAttribute(nrm, ic));
      total++;
      if (face.dot(n) > 0) agree++;
    }
    expect(agree / total).toBeGreaterThan(0.99);
  });

  it("outer sidewalls face sideways and the spoke bed faces the hub", () => {
    // the lathe axis is Y: a vertex on the +Y sidewall (y ≈ 13 mm) must have a +Y normal; on the spoke bed (radius R − 72) a normal pointing to the axis
    let sidewall = 0, bed = 0;
    for (let i = 0; i < pos.count; i++) {
      const r = Math.hypot(pos.getX(i), pos.getZ(i));
      if (Math.abs(pos.getY(i) - 13) < 0.01 && nrm.getY(i) > 0.5) sidewall++;
      if (Math.abs(r - (R - RIM.spokeBed)) < 0.01 && Math.abs(pos.getY(i)) < 3.1) {
        const radial = (pos.getX(i) * nrm.getX(i) + pos.getZ(i) * nrm.getZ(i)) / r;
        if (radial < -0.5) bed++;
      }
    }
    expect(sidewall).toBeGreaterThan(0);
    expect(bed).toBeGreaterThan(0);
  });
});
