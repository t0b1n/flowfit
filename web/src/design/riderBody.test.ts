import { describe, expect, it } from "vitest";
import { SPINE_BEND_LENGTH, spinePath } from "./riderBody";
import { MANNEQUIN_PRESETS } from "../geometry";

/** The hip → hinge → shoulder points exactly as `buildMannequin` builds them (geometry.ts, SPINE_FRACTION = 0.4). */
function trunk(trunkAngleDeg: number, backBendDeg: number, torsoLength = 520) {
  const hip = { x: -60, y: 790 };
  const a = (trunkAngleDeg * Math.PI) / 180;
  let shoulder = { x: hip.x + Math.cos(a) * torsoLength, y: hip.y + Math.sin(a) * torsoLength };
  const spine = { x: hip.x + (shoulder.x - hip.x) * 0.4, y: hip.y + (shoulder.y - hip.y) * 0.4 };
  const bend = (-backBendDeg * Math.PI) / 180;
  const dx = shoulder.x - spine.x;
  const dy = shoulder.y - spine.y;
  shoulder = { x: spine.x + dx * Math.cos(bend) - dy * Math.sin(bend), y: spine.y + dx * Math.sin(bend) + dy * Math.cos(bend) };
  return { hip, spine, shoulder };
}

describe("spinePath", () => {
  for (const [preset, p] of Object.entries(MANNEQUIN_PRESETS)) {
    for (const bend of [-10, 0, 5, 12, 20]) {
      it(`${preset} trunk ${p.trunkAngleDeg}° with ${bend}° back bend ends on the shoulder`, () => {
        const { hip, spine, shoulder } = trunk(p.trunkAngleDeg, bend);
        const path = spinePath(hip, spine, shoulder);
        const end = path.at(path.len);
        expect(Math.hypot(end.p.x - shoulder.x, end.p.y - shoulder.y)).toBeLessThan(0.01);
        const d1 = { x: shoulder.x - spine.x, y: shoulder.y - spine.y };
        const l1 = Math.hypot(d1.x, d1.y);
        expect(end.t.x).toBeCloseTo(d1.x / l1, 6);
        expect(end.t.y).toBeCloseTo(d1.y / l1, 6);
        const start = path.at(0);
        expect(start.p.x).toBeCloseTo(hip.x, 9);
        expect(start.p.y).toBeCloseTo(hip.y, 9);
        // straight lengths are not negative: s runs monotonically along the path (never doubles back)
        let prev = path.at(0).p;
        let total = 0;
        for (let i = 1; i <= 200; i++) {
          const q = path.at((path.len * i) / 200).p;
          total += Math.hypot(q.x - prev.x, q.y - prev.y);
          prev = q;
        }
        expect(total).toBeGreaterThan(path.len * 0.995);
        expect(total).toBeLessThan(path.len * 1.005);
      });
    }
  }

  it("bends over SPINE_BEND_LENGTH when it fits", () => {
    const { hip, spine, shoulder } = trunk(33, 12);
    const path = spinePath(hip, spine, shoulder);
    const chord = Math.hypot(shoulder.x - hip.x, shoulder.y - hip.y);
    const hinge = Math.hypot(spine.x - hip.x, spine.y - hip.y) + Math.hypot(shoulder.x - spine.x, shoulder.y - spine.y);
    // the smooth path is shorter than the hinge polyline and longer than the chord
    expect(path.len).toBeGreaterThan(chord);
    expect(path.len).toBeLessThan(hinge);
    expect(SPINE_BEND_LENGTH).toBe(400);
  });

  it("is a straight hip → shoulder line at 0° bend", () => {
    const { hip, spine, shoulder } = trunk(43, 0);
    const path = spinePath(hip, spine, shoulder);
    expect(path.len).toBeCloseTo(Math.hypot(shoulder.x - hip.x, shoulder.y - hip.y), 6);
    const mid = path.at(path.len / 2).p;
    expect(mid.x).toBeCloseTo((hip.x + shoulder.x) / 2, 6);
    expect(mid.y).toBeCloseTo((hip.y + shoulder.y) / 2, 6);
  });
});
