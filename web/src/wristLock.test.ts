import { describe, expect, it } from "vitest";
import { buildMannequin, buildRider, wristAngleDeg, DEFAULT_RIDER_FIT } from "./geometry";
import type { BikeSketch } from "./types";

const bike = {
  saddle: { x: -100, y: 720 },
  hoods: { x: 420, y: 600 },
  cleat: { x: 0, y: -172 },
} as unknown as BikeSketch;
const rider = buildRider(DEFAULT_RIDER_FIT);

describe("wrist lock", () => {
  // Hood pitch of 0 with a deep trunk drops the elbow and bends the wrist.
  const free = buildMannequin(bike, rider, 400, 0, 25, 30, 0, null);

  it("is a no-op when off or not needed", () => {
    expect(free.wristLockShiftMm).toBe(0);
    const loose = buildMannequin(bike, rider, 400, 0, 25, 30, 0, 180);
    expect(loose.shoulder).toEqual(free.shoulder);
  });

  it("holds the wrist at the limit by shifting the shoulder", () => {
    const limit = Math.abs(wristAngleDeg(free)) - 8;
    const locked = buildMannequin(bike, rider, 400, 0, 25, 30, 0, limit);
    expect(Math.abs(wristAngleDeg(locked))).toBeLessThanOrEqual(limit + 0.01);
    expect(locked.wristLockShiftMm).toBeGreaterThan(0);
    expect(locked.hands).toEqual(free.hands);
  });
});
