import { describe, expect, it } from "vitest";
import { CALIPER, forkCaliperSeat, forkFrame, forkWidths } from "./fork";

describe("forkCaliperSeat", () => {
  const crown = { x: 590, y: 700 };
  const axle = { x: 640, y: 340 };
  const { u, n, len } = forkFrame(crown, axle);
  const s = forkCaliperSeat(crown, axle, 80);

  it("lays the base plate flush on the back of the blade, parallel to it", () => {
    // plate runs along the blade, faces out of the blade's rear (−n)
    expect(s.ax * u.x + s.ay * u.y).toBeCloseTo(-1, 6);
    expect(s.ox * n.x + s.oy * n.y).toBeCloseTo(-1, 6);
    const dx = s.x - axle.x;
    const dy = s.y - axle.y;
    const t = -(dx * u.x + dy * u.y); // up the blade
    const lateral = -(dx * n.x + dy * n.y); // behind the blade centreline
    expect(t).toBeGreaterThan(0);
    expect(lateral).toBeCloseTo(forkWidths(len - 60, len).rear, 6);
  });

  it("puts the middle of the braking track through the caliper body", () => {
    const mid = CALIPER.plateT + CALIPER.bodyDepth / 2;
    const bx = s.x + s.ox * mid - axle.x;
    const by = s.y + s.oy * mid - axle.y;
    expect(Math.hypot(bx, by)).toBeCloseTo(72, 6);
  });
});
