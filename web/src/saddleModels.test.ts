import { describe, expect, it } from "vitest";
import { FRAME_CATALOG, getSizeData } from "./frameCatalog";
import { DEFAULT_COMPONENTS, SADDLE_CONTACT_TO_CLAMP_MM, synthesizeBike } from "./geometry";
import { SEATPOST_CLAMP_WIDTH_MM, SWORKS_POWER, railClampStatus, railMidX, railOffsetLimits } from "./saddleModels";

// Constants mirrored in bikegeo_core/saddle_rails.py (tests/test_saddle_rails.py)
describe("saddle rail range", () => {
  it("is the straight section minus the clamp width", () => {
    const [lo, hi] = SWORKS_POWER.railStraight;
    const { min, max } = railOffsetLimits(SWORKS_POWER);
    expect(max).toBeCloseTo((hi - lo - SEATPOST_CLAMP_WIDTH_MM) / 2);
    expect(min).toBeCloseTo(-max);
  });

  it("matches the Python mirror", () => {
    expect(railMidX(SWORKS_POWER)).toBeCloseTo(1.75);
    expect(SADDLE_CONTACT_TO_CLAMP_MM).toBeCloseTo(-44.95);
  });

  it("flags a clamp off the straight section, with the overshoot and side", () => {
    const { max, min } = railOffsetLimits(SWORKS_POWER);
    expect(railClampStatus(SWORKS_POWER, max).inBounds).toBe(true);
    const over = railClampStatus(SWORKS_POWER, max + 7);
    expect(over).toMatchObject({ inBounds: false, side: "rear" });
    expect(over.overshootMm).toBeCloseTo(7);
    expect(railClampStatus(SWORKS_POWER, min - 3)).toMatchObject({ inBounds: false, side: "forward" });
  });

  it("moves the saddle with the rail offset and puts the head bend 30 mm below the rails", () => {
    const model = FRAME_CATALOG[0];
    const sizeData = getSizeData(model.id, model.sizes[0].size);
    const a = synthesizeBike(sizeData, sizeData.geometry, DEFAULT_COMPONENTS);
    const b = synthesizeBike(sizeData, sizeData.geometry, { ...DEFAULT_COMPONENTS, saddle_rail_offset: 10 });
    expect(b.saddle.x - a.saddle.x).toBeCloseTo(10);
    const head = Math.hypot(a.seatpostTop.x - a.seatpostBend.x, a.seatpostTop.y - a.seatpostBend.y);
    expect(head).toBeGreaterThan(29.9); // 30 mm along the seat tube plus the post setback
  });
});
