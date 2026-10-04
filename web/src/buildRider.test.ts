import { describe, expect, it } from "vitest";
import { buildRider, DEFAULT_RIDER_FIT } from "./geometry";
import { segScale } from "./riderMesh";

describe("buildRider leg proportions", () => {
  const r = buildRider(DEFAULT_RIDER_FIT);

  it("keeps the total articulating leg = inseam + hip joint offset", () => {
    expect(r.thigh_length + r.shank_length).toBeCloseTo(DEFAULT_RIDER_FIT.inseam + r.hip_joint_offset, 6);
  });

  it("gives an anthropometric thigh (femur ≈ 0.245 H) and a shank that carries the ankle-to-cleat offset", () => {
    expect(r.thigh_length / r.height).toBeGreaterThan(0.235);
    expect(r.thigh_length / r.height).toBeLessThan(0.26);
    const foot = r.shank_length - r.thigh_length;
    expect(foot / r.height).toBeCloseTo(0.045, 3);
  });

  it("follows the inseam", () => {
    const longer = buildRider({ ...DEFAULT_RIDER_FIT, inseam: DEFAULT_RIDER_FIT.inseam + 40 });
    expect(longer.thigh_length - r.thigh_length).toBeCloseTo(20, 6);
    expect(longer.shank_length - r.shank_length).toBeCloseTo(20, 6);
  });
});

describe("segScale", () => {
  it("scales with height only for non-leg segments", () => {
    expect(segScale("torso", 1800)).toBe(1);
    expect(segScale("upperArm", 1620, 123)).toBeCloseTo(0.9, 9);
  });
  it("lets leg radii follow limb length as well as height", () => {
    expect(segScale("thigh", 1800, 440)).toBeCloseTo(1, 9);
    expect(segScale("thigh", 1800, 484)).toBeGreaterThan(1);
    expect(segScale("calf", 1800, 400)).toBeLessThan(1);
  });
});
