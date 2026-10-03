import { describe, expect, it } from "vitest";
import { viewBoxToFrustum } from "./ortho";

describe("viewBoxToFrustum", () => {
  const vb = "-400 -1000 1600 1000"; // x −400…1200, svg y −1000…0 (bike y 0…1000)

  it("exact aspect match shows exactly the viewBox", () => {
    const f = viewBoxToFrustum(vb, 800, 500);
    expect(f.left).toBeCloseTo(-400);
    expect(f.right).toBeCloseTo(1200);
    expect(f.top).toBeCloseTo(1000);
    expect(f.bottom).toBeCloseTo(0);
  });

  it("a wider canvas shows more x and keeps the viewBox's full height centred", () => {
    const f = viewBoxToFrustum(vb, 1600, 500);
    expect(f.top).toBeCloseTo(1000);
    expect(f.bottom).toBeCloseTo(0);
    expect(f.right - f.left).toBeCloseTo(3200);
    expect((f.left + f.right) / 2).toBeCloseTo(400);
  });

  it("a taller canvas shows more y and keeps the viewBox's full width centred", () => {
    const f = viewBoxToFrustum(vb, 800, 1000);
    expect(f.left).toBeCloseTo(-400);
    expect(f.right).toBeCloseTo(1200);
    expect(f.top - f.bottom).toBeCloseTo(2000);
    expect((f.top + f.bottom) / 2).toBeCloseTo(500);
  });

  it("a square mm scale is kept: mm per px is equal in x and y", () => {
    const f = viewBoxToFrustum(vb, 640, 480);
    expect((f.right - f.left) / 640).toBeCloseTo((f.top - f.bottom) / 480);
  });
});
