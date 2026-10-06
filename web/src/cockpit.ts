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
  /** sagittal bar centreline: clamp, tops, ramp, then the bend and drop from its start to the end */
  sagittal: ContactPoint[];
  /** lowest point of the drop on the centreline */
  dropBottom: ContactPoint;
  /** per drop point (sagittal[3…]): flare from hood width (0) to drop width (1) at the bottom; 1…2 along the ramp beyond it */
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
 * Bar centreline from the start of the upper bend to the end of the drop, in clamp-relative mm
 * (x forward, y up from the tops, roll 0), after a maker's side drawing (e.g. 79 reach / 125 drop / R45).
 * The tops run level to the start of a R45 bend that turns the bar straight down at `reach`; from there a long
 * elliptical sweep carries it down and rearward into a short level end. The ellipse's semi-axes are `depth − 45`
 * high and ~140 long (for a 125 drop), which keeps the curvature continuous with the R45 bend, so the drop has no
 * straight section. `depth` is the vertical distance from the tops to the lowest point of the centreline.
 */
function dropCurve(reach: number, depth: number): { pts: ContactPoint[]; bottom: number; flare: number[] } {
  const R1 = 45;
  const b = Math.max(depth - R1, 20);
  const a = 110 + 0.4 * b;
  const TAIL = 20;
  const pts: ContactPoint[] = [];
  const arc: number[] = [];
  let s = 0;
  const push = (x: number, y: number) => {
    const prev = pts[pts.length - 1];
    if (prev) s += Math.hypot(x - prev.x, y - prev.y);
    pts.push({ x, y });
    arc.push(s);
  };
  push(reach - R1, 0);
  for (const deg of [30, 60]) push(reach - R1 + R1 * Math.sin(deg * D2R), -R1 * (1 - Math.cos(deg * D2R)));
  push(reach, -R1);
  const apex = pts.length - 1;
  const cx = reach - a;
  for (const deg of [15, 30, 45, 60, 75, 90]) push(cx + a * Math.cos(deg * D2R), -R1 - b * Math.sin(deg * D2R));
  const bottom = pts.length - 1;
  push(cx - TAIL, -R1 - b);

  const sApex = arc[apex], sBottom = arc[bottom], sEnd = arc[arc.length - 1];
  // 0 at the hood and through the upper bend, reaching 1 (the drop width) at the bottom, then 1 → 2 along the end
  // (a few mm of extra toe-out at its tip)
  const flare = arc.map((v) =>
    v <= sApex ? 0 : v <= sBottom ? ((v - sApex) / (sBottom - sApex)) ** 1.2 : 1 + (v - sBottom) / (sEnd - sBottom),
  );
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
  const at = (x: number, y: number): ContactPoint => {
    const d = rot(x, y, rollDeg);
    return { x: barClamp.x + d.x, y: barClamp.y + d.y };
  };
  const tops = at(0, rise);
  // The bar is laid out for roll = 0 about the clamp centre, then rotated with the roll (the hoods rotate about it too).
  const curve = dropCurve(c.bar_reach, dropDepth);
  const drop = curve.pts.map((p) => at(p.x, p.y + rise));
  const dropBottom = drop[curve.bottom];
  const ramp = at(curve.pts[0].x / 2, rise + 1);
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
    sagittal: [barClamp, tops, ramp, ...drop],
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
 * the bend → flared drop. Shared by the 3D sweep and tests.
 */
export function barCenterline3D(ck: Cockpit, sideZ: 1 | -1): Vec3[] {
  const [c, tops, ramp, ...drop] = ck.sagittal;
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
    [ramp.x - sweep * (hx - 22) * 0.5, ramp.y, z(hx - 6)],
    ...drop.map((p, i): Vec3 => {
      const f = ck.dropFlare[i];
      return [p.x, p.y, z(f <= 1 ? hx + (dx - hx) * f : dx + 4 * (f - 1))];
    }),
  ];
  // Collapse coincident points (zero rise) so the spline has no zero-length spans.
  return pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1], p[2] - pts[i - 1][2]) > 0.5);
}

export { HOOD_MODELS };
