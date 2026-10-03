import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { barCenterline3D, buildCockpit, hoodContact, uciReport } from "./cockpit";
import { DEFAULT_COMPONENTS } from "./geometry";
import { hoodModelFor } from "./hoodModels";
import type { Components } from "./types";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(here, "cockpit.fixtures.json");

// Same base as tests/test_cockpit.py::_components
const BASE: Components = {
  ...DEFAULT_COMPONENTS,
  crank_length: 172.5,
  stem_length: 110,
  stem_angle_deg: -6,
  bar_reach: 80,
  bar_drop: 0,
  hood_reach_offset: 24.6,
  hood_drop_offset: 0,
  bar_width: 400,
};

const CASES: Array<{ name: string; clamp: [number, number]; components: Partial<Components> }> = [
  { name: "legacy-default", clamp: [500, 600], components: {} },
  { name: "legacy-steep-stem", clamp: [480, 640], components: { stem_angle_deg: 10 } },
  { name: "rise-20", clamp: [500, 600], components: { bar_rise: 20 } },
  { name: "roll-0", clamp: [500, 600], components: { bar_roll_deg: 0 } },
  { name: "roll-12-slide-8", clamp: [500, 600], components: { bar_roll_deg: 12, hood_slide_mm: 8 } },
  { name: "slide-negative", clamp: [510, 590], components: { hood_slide_mm: -10, bar_rise: 15 } },
  { name: "drop-offsets", clamp: [500, 600], components: { bar_drop: -5, hood_drop_offset: 3, hood_reach_offset: 28 } },
  { name: "gravel-riser", clamp: [470, 620], components: { bar_rise: 50, bar_reach: 75, bar_roll_deg: 4, hood_slide_mm: 4 } },
];

const compute = () =>
  CASES.map((c) => {
    const p = hoodContact({ x: c.clamp[0], y: c.clamp[1] }, { ...BASE, ...c.components });
    return { ...c, contact: [p.x, p.y] as [number, number] };
  });

describe("hoodContact", () => {
  it("puts the hoods straight ahead of the clamp when no cockpit fields are set, whatever the stem or bar_drop", () => {
    for (const stem of [-17, -6, 10]) {
      const p = hoodContact({ x: 500, y: 600 }, { ...BASE, stem_angle_deg: stem, bar_drop: -40 });
      expect(p.x).toBeCloseTo(500 + BASE.bar_reach + BASE.hood_reach_offset, 9);
      expect(p.y).toBeCloseTo(600, 9);
    }
  });

  it("rise lifts the hoods by exactly the rise", () => {
    const a = hoodContact({ x: 0, y: 0 }, BASE);
    const b = hoodContact({ x: 0, y: 0 }, { ...BASE, bar_rise: 20 });
    expect(b.y - a.y).toBeCloseTo(20, 9);
    expect(b.x).toBeCloseTo(a.x, 9);
  });

  it("matches the shared fixture the Python mirror is tested against", () => {
    const got = compute();
    if (process.env.UPDATE_FIXTURES) writeFileSync(FIXTURE, JSON.stringify(got, null, 2) + "\n");
    const want = JSON.parse(readFileSync(FIXTURE, "utf8")) as typeof got;
    expect(got.map((g) => g.name)).toEqual(want.map((w) => w.name));
    got.forEach((g, i) => {
      expect(g.contact[0]).toBeCloseTo(want[i].contact[0], 6);
      expect(g.contact[1]).toBeCloseTo(want[i].contact[1], 6);
    });
  });
});

describe("buildCockpit", () => {
  it("places the hood mesh so its palm point lands on the contact", () => {
    for (const id of ["shimano", "sram-red"]) {
      const ck = buildCockpit({ x: 500, y: 600 }, { ...BASE, hood_model: id, bar_roll_deg: 5, hood_slide_mm: 6 });
      const hm = hoodModelFor(id);
      const a = (ck.pitchDeg * Math.PI) / 180;
      const px = ck.station.x + hm.contact[0] * Math.cos(a) - hm.contact[1] * Math.sin(a);
      const py = ck.station.y + hm.contact[0] * Math.sin(a) + hm.contact[1] * Math.cos(a);
      expect(px).toBeCloseTo(ck.contact.x, 6);
      expect(py).toBeCloseTo(ck.contact.y, 6);
    }
  });

  it("produces a 3D bar centreline that starts at the clamp and reaches the drops at their width", () => {
    const ck = buildCockpit({ x: 500, y: 600 }, { ...BASE, hood_width: 360, bar_drop_width: 420, bar_rise: 20 });
    for (const s of [1, -1] as const) {
      const pts = barCenterline3D(ck, s);
      expect(pts[0]).toEqual([500, 600, 0]);
      const last = pts[pts.length - 1];
      expect(Math.abs(last[2])).toBeCloseTo(214, 6);
      expect(Math.sign(last[2])).toBe(s);
      // tops are at clamp + rise
      expect(pts.some((p) => Math.abs(p[1] - 620) < 1e-9)).toBe(true);
    }
  });

  it("zero rise produces no zero-length spans", () => {
    const pts = barCenterline3D(buildCockpit({ x: 0, y: 0 }, BASE), 1);
    for (let i = 1; i < pts.length; i++) {
      const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]);
      expect(d).toBeGreaterThan(0.5);
    }
  });
});

describe("uciReport", () => {
  const hood = hoodModelFor("shimano");
  it("passes a typical 400 mm bar with straight hoods", () => {
    const r = uciReport(380, 400, 0, hood);
    expect(r.ok).toEqual({ outsideWidth: true, innerHoods: true, dropBox: true, leverTilt: true });
  });
  it("flags narrow hoods, big flare and over-rotated levers", () => {
    const r = uciReport(300, 460, 12, hood);
    expect(r.ok.innerHoods).toBe(false);
    expect(r.ok.dropBox).toBe(false);
    expect(r.ok.leverTilt).toBe(false);
  });
  it("inward rotation narrows the gap between the hoods", () => {
    expect(uciReport(340, 400, 8, hood).innerHoods).toBeLessThan(uciReport(340, 400, 0, hood).innerHoods);
  });
});
