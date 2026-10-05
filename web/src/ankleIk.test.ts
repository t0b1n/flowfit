import { describe, expect, it } from "vitest";
import { buildRider, DEFAULT_RIDER_FIT, DEFAULT_COMPONENTS, saddleForKneeExtension, solvePedalStroke } from "./geometry";
import { drawnAnkle } from "./design/foot";

describe("leg IK solves to the true ankle", () => {
  const rider = buildRider(DEFAULT_RIDER_FIT);
  const c = DEFAULT_COMPONENTS;
  const kneeAt = (flexDeg: number) => {
    const saddle = saddleForKneeExtension(rider, 180 - flexDeg, c.crank_length, 73.5, c.pedal_stack_height, 0, 0, 0);
    const hip = { x: saddle.x, y: saddle.y + rider.hip_joint_offset };
    return solvePedalStroke(hip, { x: 0, y: 0 }, c.crank_length, 0, c.pedal_stack_height, rider);
  };

  it("target flex 0° gives a straight hip–knee–ankle line at the most extended point", () => {
    // the stroke is sampled every 5°, so the sampled maximum can sit just short of the exact one
    expect(kneeAt(0).kneeExtensionMaxDeg).toBeGreaterThan(179);
  });

  it("the drawn ankle is the IK ankle", () => {
    const lut = kneeAt(30);
    for (const p of [lut.poses[0], lut.poses[lut.maxExtensionIndex]]) {
      const d = drawnAnkle(p.cleat, rider.foot_length, c.pedal_stack_height);
      expect(d.x).toBeCloseTo(p.ankle.x, 6);
      expect(d.y).toBeCloseTo(p.ankle.y, 6);
    }
  });
});
