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
 *   base    = R(θ)·(bar_reach + 0.35 s, −0.9 s) + (0, bar_rise)
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
  const b = rot(c.bar_reach + SLIDE_DX * s, SLIDE_DY * s, effectiveBarRoll(c));
  return { x: barClamp.x + b.x, y: barClamp.y + b.y + (c.bar_rise ?? 0) };
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
  /** sagittal bar centreline: clamp, tops, ramp, station, bend front, drop bottom, drop end */
  sagittal: ContactPoint[];
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
  const tops = { x: barClamp.x, y: barClamp.y + rise };
  // The bar runs on under the hood body, then bends down into the drop.
  const under = rot(16, -22, pitchDeg);
  const front = { x: station.x + under.x, y: station.y + under.y };
  const bottomY = tops.y - dropDepth;
  const front2 = { x: Math.max(front.x, station.x + 8) + 6, y: (front.y + bottomY) / 2 };
  const dropBottom = { x: front.x - 22, y: bottomY };
  const dropEnd = { x: dropBottom.x - 72, y: bottomY + 2 };
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
    sagittal: [barClamp, tops, ramp, station, front, front2, dropBottom, dropEnd],
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
  const [c, tops, , station, front, front2, dropBottom, dropEnd] = ck.sagittal;
  const hx = ck.hoodWidth / 2;
  const dx = ck.dropWidth / 2;
  const sweep = Math.tan(ck.backsweepDeg * D2R);
  const z = (v: number) => sideZ * v + 0; // +0 turns −0 into 0
  const topsEnd = Math.max(80, hx - 40);
  const pts: Vec3[] = [
    [c.x, c.y, z(0)],
    [c.x, c.y, z(22)],
    [c.x, c.y + ck.rise * 0.5, z(44)],
    [tops.x - sweep * (66 - 22), tops.y, z(66)],
    [tops.x - sweep * (topsEnd - 22), tops.y, z(topsEnd)],
    [(tops.x + station.x) / 2 - sweep * (hx - 22) * 0.5, Math.max(tops.y, station.y) + 1, z(hx - 6)],
    [station.x, station.y, z(hx)],
    [front.x, front.y, z(hx + (dx - hx) * 0.2)],
    [front2.x, front2.y, z(hx + (dx - hx) * 0.6)],
    [dropBottom.x, dropBottom.y, z(dx)],
    [dropEnd.x, dropEnd.y, z(dx + 4)],
  ];
  // Collapse coincident points (zero rise) so the spline has no zero-length spans.
  return pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1], p[2] - pts[i - 1][2]) > 0.5);
}

export { HOOD_MODELS };
