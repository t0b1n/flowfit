import { describe, expect, it } from "vitest";
import { CASSETTE, CHAINRING, RD } from "./bikeProfiles";
import { RING_REST, bikeChain, chainLoop, chainShift, pitchRadius } from "./chain";

const BB = { x: 404, y: -70 };
const AXLE = { x: 0, y: 0 };

describe("chain loop", () => {
  const loop = bikeChain(BB, AXLE);

  it("is a closed loop of an even number of 12.7 mm links", () => {
    expect(loop.links % 2).toBe(0);
    expect(Math.abs(loop.pitch - CASSETTE.pitch) / CASSETTE.pitch).toBeLessThan(0.01);
    const a = loop.at(0);
    const b = loop.at(loop.length);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(1e-6);
  });

  it("leaves each wheel exactly tangent: points stay on the wheels' pitch circles", () => {
    const wheels = [
      { c: BB, r: pitchRadius(CHAINRING.big.teeth) },
      { c: AXLE, r: pitchRadius(CASSETTE.teeth[6]) },
      { c: { x: RD.upper.x, y: RD.upper.y }, r: pitchRadius(RD.pulleyTeeth) },
      { c: { x: RD.lower.x, y: RD.lower.y }, r: pitchRadius(RD.pulleyTeeth) },
    ];
    for (const l of loop.legs) {
      if (l.kind !== "arc") continue;
      const w = wheels.find((q) => Math.hypot(q.c.x - l.centre[0], q.c.y - l.centre[1]) < 1e-9)!;
      expect(l.r).toBeCloseTo(w.r, 9);
      expect(l.sweep).toBeGreaterThanOrEqual(0);
    }
    // heading is continuous where a straight run meets an arc
    for (let i = 0; i < loop.legs.length; i++) {
      const a = loop.at(loop.legs.slice(0, i + 1).reduce((s, l) => s + l.length, 0) - 1e-4);
      const b = loop.at(loop.legs.slice(0, i + 1).reduce((s, l) => s + l.length, 0) + 1e-4);
      const d = Math.atan2(Math.sin(a.angle - b.angle), Math.cos(a.angle - b.angle));
      expect(Math.abs(d)).toBeLessThan(1e-3);
    }
  });

  it("is about as long as twice the chainstay plus its wraps", () => {
    expect(loop.length).toBeGreaterThan(2 * 404);
    expect(loop.length).toBeLessThan(2 * 404 + 1000);
  });

  it("runs a simple two-wheel belt as the textbook length", () => {
    const r = 10;
    const belt = chainLoop([
      { x: 0, y: 0, r, turn: 1 },
      { x: 100, y: 0, r, turn: 1 },
    ]);
    expect(belt.length).toBeCloseTo(2 * 100 + 2 * Math.PI * r, 6);
  });

  describe("pedalling", () => {
    const T = CHAINRING.big.teeth;
    const R = pitchRadius(T);

    it("seats the rollers in the big ring's tooth gaps at any crank angle", () => {
      for (const alpha of [0, 0.7, -2.4, 5.1]) {
        const shift = chainShift(loop, alpha);
        for (let i = 0; i < loop.links; i++) {
          const p = loop.at(i * loop.pitch + shift);
          if (Math.abs(Math.hypot(p.x - BB.x, p.y - BB.y) - R) > 1e-6) continue; // not on the ring
          const theta = Math.atan2(p.y - BB.y, p.x - BB.x);
          const tooth = (2 * Math.PI) / T;
          const phase = (((theta - alpha - RING_REST - Math.PI / T) % tooth) + tooth) % tooth;
          expect(Math.min(phase, tooth - phase)).toBeLessThan(0.01);
        }
      }
    });

    it("runs the top run toward the ring when the crank turns clockwise (forward pedalling)", () => {
      // clockwise = the crank angle decreasing; links on the top run (heading −x along the loop) must move +x
      const probe = loop.at(loop.legs[0].length + 100); // well inside the top run
      expect(Math.cos(probe.angle)).toBeLessThan(-0.99); // heading −x
      const before = loop.at(loop.legs[0].length + 100 + chainShift(loop, 0));
      const after = loop.at(loop.legs[0].length + 100 + chainShift(loop, -0.1));
      expect(after.x - before.x).toBeGreaterThan(0);
      expect(after.x - before.x).toBeCloseTo(R * 0.1, 0);
    });
  });
});
