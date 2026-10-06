/**
 * cockpit.ts — the single source of cockpit geometry (stem → bar → hoods).
 *
 * Every consumer goes through here: synthesizeBike() takes the hood contact
 * point from hoodContact(), the 2D side/front drawings and the 3D bar/hood
 * meshes take their shapes from buildCockpit(). bikegeo_core/geometry.py
 * mirrors hoodContact() line for line, so /solve and the stage agree.
 *
 * Sagittal model (x forward, y up, origin at the bar clamp centre):
 *   θ  = bar roll: the angle of the clamp→hood reach line above horizontal.
 *        null = 0: the hoods sit straight ahead of the clamp, independent of the stem.
 *   s  = hood slide along the bend (+ = lower, further round the curve).
 *   base    = R(θ)·(bar_reach + 0.35 s, −0.9 s + bar_rise)   (the riser rotates with the bar)
 *   pitch   = θ − 0.45°·s
 *   contact = clamp + base + R(pitch)·(hood_reach_offset, 0) + (0, hood_drop_offset)
 * bar_drop describes the drops, not the hoods. With rise = slide = 0 and bar_roll = null this is
 * clamp + (bar_reach + hood_reach_offset, hood_drop_offset).
 */
import type { Components, ContactPoint } from "./types";
import { HOOD_MODELS, hoodModelFor, type HoodModel } from "./hoodModels";

const D2R = Math.PI / 180;

/** Forward/down travel of the hood per mm of slide, and its nose-down tilt per mm. */
export const SLIDE_DX = 0.35;
export const SLIDE_DY = -0.9;
export const SLIDE_PITCH_DEG = -0.45;

/** Bar defaults when a field is missing (saved fits predate these fields). */
export const COCKPIT_DEFAULTS = {
  bar_rise: 0,
  bar_drop_depth: 125,
  bar_backsweep_deg: 0,
  hood_slide_mm: 0,
  hood_roll_deg: 0,
  cockpit_build: "two_piece" as const,
};

/** UCI limits (as reported for 2026; see the plan page). */
export const UCI = { minOutsideWidth: 400, minInnerHoods: 280, maxDropBox: 65, maxLeverTiltDeg: 10 };

export const BAR_RADIUS = 11.9; // 23.8 mm bar

/**
 * Bar roll in effect. null = 0: bar reach is horizontal and fitters rotate the bar to the rider's setup
 * independently of the stem, so by default the hoods sit straight ahead of the clamp.
 */
export function effectiveBarRoll(c: Components): number {
  return c.bar_roll_deg ?? 0;
}

export function hoodPitchDeg(c: Components): number {
  return effectiveBarRoll(c) + SLIDE_PITCH_DEG * (c.hood_slide_mm ?? 0);
}

const rot = (x: number, y: number, deg: number): ContactPoint => {
  const a = deg * D2R;
  return { x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a) };
};

/** Point on the bar where the hood clamps (before the hood's own reach offset). */
export function hoodBase(barClamp: ContactPoint, c: Components): ContactPoint {
  const s = c.hood_slide_mm ?? 0;
  const b = rot(c.bar_reach + SLIDE_DX * s, SLIDE_DY * s + (c.bar_rise ?? 0), effectiveBarRoll(c));
  return { x: barClamp.x + b.x, y: barClamp.y + b.y };
}

/** The rider's hand contact on the hoods — the point the fit, IK and solver use. */
export function hoodContact(barClamp: ContactPoint, c: Components): ContactPoint {
  const base = hoodBase(barClamp, c);
  const off = rot(c.hood_reach_offset, 0, hoodPitchDeg(c));
  return { x: base.x + off.x, y: base.y + off.y + c.hood_drop_offset };
}

export type CockpitBuild = "two_piece" | "integrated";

export interface Cockpit {
  build: CockpitBuild;
  hood: HoodModel;
  /** bar roll actually in effect (deg) */
  rollDeg: number;
  /** hood platform pitch (deg); 0 = the photo's own attitude */
  pitchDeg: number;
  /** inward hood rotation (deg) */
  hoodRollDeg: number;
  clamp: ContactPoint;
  contact: ContactPoint;
  /** hood mesh origin (bar centre under the hood), placed so the profile's palm point lands on `contact` */
  station: ContactPoint;
  /** sagittal bar centreline: clamp, tops, ramp, station, then the drop (upper bend, drop, lower bend, ramp end) */
  sagittal: ContactPoint[];
  /** lowest point of the drop on the centreline */
  dropBottom: ContactPoint;
  /** per drop point (sagittal[4…]): flare from hood width (0) to drop width (1) at the bottom; 1…2 along the ramp beyond it */
  dropFlare: number[];
  rise: number;
  dropDepth: number;
  backsweepDeg: number;
  /** centre-to-centre widths */
  hoodWidth: number;
  dropWidth: number;
  /** lateral (z) of the hood centre after inward rotation moves the palm */
  contactHalfWidth: number;
  uci: UciReport;
}

export interface UciReport {
  outsideWidth: number;
  innerHoods: number;
  dropBox: number;
  leverTiltDeg: number;
  ok: { outsideWidth: boolean; innerHoods: boolean; dropBox: boolean; leverTilt: boolean };
}

/** Hood half-width (mm) used for the UCI inner-hood measurement. */
const HOOD_HALF_THICK = 15;

export function uciReport(hoodWidth: number, dropWidth: number, hoodRollDeg: number, hood: HoodModel): UciReport {
  const hx = hoodWidth / 2;
  const dx = dropWidth / 2;
  // Inward rotation leans the hood top toward the centreline: the inner edge at peak height moves in.
  const lean = hood.peak * Math.sin(hoodRollDeg * D2R) + HOOD_HALF_THICK * Math.cos(hoodRollDeg * D2R);
  const innerHoods = 2 * (hx - Math.max(HOOD_HALF_THICK, lean));
  const outsideWidth = 2 * Math.max(hx, dx) + 2 * BAR_RADIUS;
  const dropBox = dx + BAR_RADIUS - (hx - BAR_RADIUS);
  return {
    outsideWidth,
    innerHoods,
    dropBox,
    leverTiltDeg: hoodRollDeg,
    ok: {
      outsideWidth: outsideWidth >= 400,
      innerHoods: innerHoods >= 280,
      dropBox: dropBox <= 65,
      leverTilt: hoodRollDeg <= 10,
    },
  };
}

/**
 * Bar centreline from the hood station down through the drop, in station-local mm (x forward, y up, roll 0).
 * The bar leaves the station heading forward and rounds the upper bend into the drop, which leans back a few
 * degrees; the lower bend turns it rearward and the ramp rises slightly to the end. `depth` is the vertical
 * distance from the station to the lowest point of the centreline; bends tighten if it is too short for them.
 */
function dropCurve(depth: number): { pts: ContactPoint[]; bottom: number; flare: number[] } {
  const LEAN = 98 * D2R; // heading at the end of the upper bend: 8° past straight down
  const RAMP = 4 * D2R; // the ramp rises this much toward its end
  const k1 = 1 - Math.cos(LEAN);
  const k2 = 1 + Math.cos(LEAN);
  const need = 32 * k1 + 45 * k2;
  const d = Math.max(depth, 30);
  const sc = Math.min(1, d / need);
  const r1 = 32 * sc;
  const r2 = 45 * sc;
  const straight = Math.max(0, d - r1 * k1 - r2 * k2) / Math.sin(LEAN);
  const TAIL = 60;

  // Walk the path with heading φ measured clockwise from forward (so φ = 90° is straight down), emitting
  // points as arc length grows.
  const pts: ContactPoint[] = [];
  const arc: number[] = [];
  let x = 0, y = 0, s = 0;
  const arcTo = (r: number, from: number, to: number, steps: number) => {
    for (let i = 1; i <= steps; i++) {
      const a0 = from + ((to - from) * (i - 1)) / steps;
      const a1 = from + ((to - from) * i) / steps;
      x += r * (Math.sin(a1) - Math.sin(a0));
      y += r * (Math.cos(a1) - Math.cos(a0));
      s += r * (a1 - a0);
      pts.push({ x, y });
      arc.push(s);
    }
  };
  const line = (len: number, heading: number, steps: number) => {
    for (let i = 0; i < steps; i++) {
      x += (Math.cos(heading) * len) / steps;
      y += (-Math.sin(heading) * len) / steps;
      s += len / steps;
      pts.push({ x, y });
      arc.push(s);
    }
  };
  arcTo(r1, 0, LEAN, 3);
  if (straight > 4) line(straight, LEAN, straight > 30 ? 2 : 1);
  arcTo(r2, LEAN, Math.PI, 3);
  const bottom = pts.length - 1;
  line(TAIL, Math.PI + RAMP, 2);

  const sBottom = arc[bottom];
  const sEnd = arc[arc.length - 1];
  // 0 → 1 reaching the drop width at the bottom, then 1 → 2 over the ramp (a few mm of extra toe-out at its end)
  const flare = arc.map((a) => (a <= sBottom ? (a / sBottom) ** 1.5 : 1 + (a - sBottom) / (sEnd - sBottom)));
  return { pts, bottom, flare };
}

export function buildCockpit(barClamp: ContactPoint, c: Components, hoodModelId?: string): Cockpit {
  const hood = hoodModelFor(hoodModelId ?? c.hood_model);
  const rollDeg = effectiveBarRoll(c);
  const pitchDeg = hoodPitchDeg(c);
  const hoodRollDeg = c.hood_roll_deg ?? 0;
  const rise = c.bar_rise ?? COCKPIT_DEFAULTS.bar_rise;
  const dropDepth = c.bar_drop_depth ?? COCKPIT_DEFAULTS.bar_drop_depth;
  const contact = hoodContact(barClamp, c);
  const pc = rot(hood.contact[0], hood.contact[1], pitchDeg);
  const station = { x: contact.x - pc.x, y: contact.y - pc.y };
  const riseVec = rot(0, rise, rollDeg);
  const tops = { x: barClamp.x + riseVec.x, y: barClamp.y + riseVec.y };
  // The bar runs on under the hood body, then bends down into the drop.
  // The drops are laid out for roll = 0, relative to the hood station, then the whole bar rotates
  // about the clamp centre: the drops swing with the hoods.
  const flat = effectiveBarRoll(c) === 0 ? { ...c } : { ...c, bar_roll_deg: 0 };
  const station0 = (() => {
    const p0 = rot(hood.contact[0], hood.contact[1], hoodPitchDeg(flat));
    const c0 = hoodContact(barClamp, flat);
    return { x: c0.x - p0.x, y: c0.y - p0.y };
  })();
  const bottomY = barClamp.y + rise - dropDepth;
  const curve = dropCurve(station0.y - bottomY);
  const swing = (p: ContactPoint): ContactPoint => {
    const d = rot(p.x, p.y, rollDeg);
    return { x: station.x + d.x, y: station.y + d.y };
  };
  const drop = curve.pts.map(swing);
  const dropBottom = drop[curve.bottom];
  const ramp = { x: (tops.x + station.x) / 2, y: Math.max(tops.y, station.y) + 2 };
  const hoodWidth = c.hood_width ?? c.bar_width;
  const dropWidth = c.bar_drop_width ?? hoodWidth;
  const contactHalfWidth = hoodWidth / 2 - hood.contact[1] * Math.sin(hoodRollDeg * D2R);
  return {
    build: c.cockpit_build ?? COCKPIT_DEFAULTS.cockpit_build,
    hood,
    rollDeg,
    pitchDeg,
    hoodRollDeg,
    clamp: barClamp,
    contact,
    station,
    sagittal: [barClamp, tops, ramp, station, ...drop],
    dropBottom,
    dropFlare: curve.flare,
    rise,
    dropDepth,
    backsweepDeg: c.bar_backsweep_deg ?? COCKPIT_DEFAULTS.bar_backsweep_deg,
    hoodWidth,
    dropWidth,
    contactHalfWidth,
    uci: uciReport(hoodWidth, dropWidth, hoodRollDeg, hood),
  };
}

export type Vec3 = [number, number, number];

/**
 * 3D bar centreline for one side (sideZ = +1 rider's right, −1 left), in bike
 * coordinates. Clamp section → riser S-bend → tops (with backsweep) → ramp to
 * the hood station → bend → flared drop. Shared by the 3D sweep and tests.
 */
export function barCenterline3D(ck: Cockpit, sideZ: 1 | -1): Vec3[] {
  const [c, tops, , station, ...drop] = ck.sagittal;
  const hx = ck.hoodWidth / 2;
  const dx = ck.dropWidth / 2;
  const sweep = Math.tan(ck.backsweepDeg * D2R);
  const z = (v: number) => sideZ * v + 0; // +0 turns −0 into 0
  const topsEnd = Math.max(80, hx - 40);
  const pts: Vec3[] = [
    [c.x, c.y, z(0)],
    [c.x, c.y, z(22)],
    [c.x + (tops.x - c.x) * 0.5, c.y + (tops.y - c.y) * 0.5, z(44)],
    [tops.x - sweep * (66 - 22), tops.y, z(66)],
    [tops.x - sweep * (topsEnd - 22), tops.y, z(topsEnd)],
    [(tops.x + station.x) / 2 - sweep * (hx - 22) * 0.5, Math.max(tops.y, station.y) + 1, z(hx - 6)],
    [station.x, station.y, z(hx)],
    ...drop.map((p, i): Vec3 => {
      const f = ck.dropFlare[i];
      return [p.x, p.y, z(f <= 1 ? hx + (dx - hx) * f : dx + 4 * (f - 1))];
    }),
  ];
  // Collapse coincident points (zero rise) so the spline has no zero-length spans.
  return pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1], p[2] - pts[i - 1][2]) > 0.5);
}

export { HOOD_MODELS };
