import { describe, expect, it } from "vitest";
import * as THREE from "three";

import { SOLE_ABOVE_SPINDLE, ankleOffset, drawnAnkle, shoePlacement } from "./design/foot";
import { lerpTable } from "./saddleModels";
import { buildShoeGeometries, lateralWallFrame, openingAt, shoeSection, upperPoint } from "./shoe3d";
import { SWORKS_TORCH as S } from "./shoeModels";

const geo = buildShoeGeometries(S);
/** Bounds of the vertices the triangles actually use (the upper and lining share one vertex grid). */
const box = (g: THREE.BufferGeometry) => {
  const b = new THREE.Box3(), p = g.attributes.position, v = new THREE.Vector3();
  const idx = g.index ? Array.from(g.index.array) : Array.from({ length: p.count }, (_, i) => i);
  for (const i of idx) b.expandByPoint(v.fromBufferAttribute(p, i));
  return b;
};

describe("traced shoe geometry", () => {
  it("is finite and spans heel (u = 0) to toe (u = 1)", () => {
    for (const g of Object.values(geo)) {
      const a = g.attributes.position.array as Float32Array;
      expect(a.every(Number.isFinite)).toBe(true);
    }
    const b = box(geo.upper);
    expect(b.min.x).toBeCloseTo(0, 6);
    expect(b.max.x).toBeCloseTo(1, 6);
    expect(b.max.z - b.min.z).toBeGreaterThan(0.3); // ~0.36 L wide
    expect(b.max.z - b.min.z).toBeLessThan(0.4);
  });

  it("sole sits under the upper and touches the ground line between heel and ball", () => {
    const sb = box(geo.sole);
    expect(sb.min.y).toBeGreaterThan(-0.005);
    expect(sb.min.y).toBeLessThan(0.005);
    expect(sb.max.y).toBeLessThan(box(geo.upper).max.y);
  });

  it("lining fills the collar opening, below the rim", () => {
    const lb = box(geo.lining);
    expect(lb.min.x).toBeLessThan(0.05);
    expect(lb.max.x).toBeCloseTo(S.opening[S.opening.length - 1][0], 3);
  });

  it("BOA dials sit on the lateral (+z) wall", () => {
    const b = box(geo.boaDial);
    expect(b.min.z).toBeGreaterThan(0);
    for (const d of S.boa) {
      const { p, n } = lateralWallFrame(S, d.u, d.up);
      expect(n.z).toBeGreaterThan(0.3);
      expect(p.z).toBeGreaterThan(0.5 * lerpTable(S.lateral, d.u));
    }
  });
});

describe("shoe placement", () => {
  const cleat = { x: 40, y: -160 };
  const L = 287; // EU 43

  it("puts the sole at the ball SOLE_ABOVE_SPINDLE over the cleat, ball over the cleat", () => {
    const { heel, len } = shoePlacement(cleat, L);
    expect(len).toBe(L);
    expect(heel.x + S.ball * len).toBeCloseTo(cleat.x, 6);
    expect(heel.y + lerpTable(S.bottom, S.ball) * len).toBeCloseTo(cleat.y + SOLE_ABOVE_SPINDLE, 6);
  });

  it("drawn ankle lies inside the collar opening, below the rim", () => {
    const { heel, len } = shoePlacement(cleat, L);
    const a = drawnAnkle(cleat, L);
    const u = (a.x - heel.x) / len, h = (a.y - heel.y) / len;
    expect(openingAt(S, u)).not.toBeNull();
    expect(h).toBeLessThan(lerpTable(S.top, u));
    expect(h).toBeGreaterThan(lerpTable(S.seam, u));
    const o = ankleOffset(L);
    expect(o.setback).toBeGreaterThan(100); // a real foot: malleolus well behind the ball
  });

  it("upper cross-section runs seam → top → seam", () => {
    const c = shoeSection(S, 0.5);
    expect(upperPoint(c, 0)[1]).toBeCloseTo(c.seam, 6);
    expect(upperPoint(c, Math.PI / 2)[1]).toBeCloseTo(c.top, 6);
    expect(upperPoint(c, 0)[0]).toBeCloseTo(c.lateral, 6);
    expect(upperPoint(c, Math.PI)[0]).toBeCloseTo(-c.medial, 6);
  });
});
