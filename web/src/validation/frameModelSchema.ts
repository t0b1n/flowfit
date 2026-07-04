import type { FrameModel, FrameGeometry, SizeData } from "../frameCatalog";

const BAD_CHAR_RE = /[<>&`\x00]/;

const inRange = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;

const optInRange = (v: unknown, min: number, max: number): boolean =>
  v == null || inRange(v, min, max);

const safeStr = (v: unknown, max = 200): v is string =>
  typeof v === "string" &&
  v.trim().length >= 1 &&
  v.length <= max &&
  !BAD_CHAR_RE.test(v) &&
  /[a-z0-9]/i.test(v);

export type ValidationResult =
  | { ok: true; value: Omit<FrameModel, "id"> }
  | { ok: false; errors: string[] };

export function validateFrameModelInput(raw: unknown): ValidationResult {
  const errors: string[] = [];
  if (!raw || typeof raw !== "object") {
    return { ok: false, errors: ["Payload must be an object."] };
  }
  const r = raw as Record<string, unknown>;

  if (!safeStr(r.brand)) errors.push("brand: required string ≤200 chars, no <>&` characters.");
  if (!safeStr(r.model)) errors.push("model: required string ≤200 chars, no <>&` characters.");
  if (!safeStr(r.category)) errors.push("category: required string ≤200 chars.");
  if (!safeStr(r.popularity)) errors.push("popularity: required string ≤200 chars.");
  if (!inRange(r.launch_year, 1950, 2100)) errors.push("launch_year: integer 1950–2100.");

  if (!Array.isArray(r.sources)) {
    errors.push("sources: must be an array.");
  } else if (r.sources.length > 10) {
    errors.push("sources: max 10 entries.");
  } else {
    r.sources.forEach((u, i) => {
      if (typeof u !== "string" || !u.startsWith("https://")) {
        errors.push(`sources[${i}]: must be an https:// URL.`);
      }
    });
  }

  if (!Array.isArray(r.sizes) || r.sizes.length === 0) {
    errors.push("sizes: must be a non-empty array.");
  } else if (r.sizes.length > 20) {
    errors.push("sizes: max 20 entries.");
  } else {
    r.sizes.forEach((s, i) => validateSize(s, i, errors));
  }

  for (const k of Object.keys(r)) {
    if (!ALLOWED_TOP.has(k)) errors.push(`Unknown field: ${k}`);
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, value: r as Omit<FrameModel, "id"> };
}

const ALLOWED_TOP = new Set([
  "brand",
  "model",
  "launch_year",
  "category",
  "popularity",
  "sources",
  "sizes",
]);

const ALLOWED_SIZE = new Set([
  "size",
  "geometry",
  "wheelbase",
  "front_center",
  "trail",
  "top_tube_effective",
  "standover",
  "bb_height",
  "seat_tube_ct",
  "head_tube",
  "stockCockpit",
]);

const ALLOWED_GEO = new Set<keyof FrameGeometry>([
  "stack",
  "reach",
  "head_angle_deg",
  "seat_angle_deg",
  "bb_drop",
  "chainstay_length",
  "fork_length",
  "fork_offset",
  "wheel_radius",
  "wheelbase",
  "seat_tube_ct",
  "head_tube",
  "top_tube_effective",
]);

function validateSize(raw: unknown, i: number, errors: string[]): void {
  if (!raw || typeof raw !== "object") {
    errors.push(`sizes[${i}]: must be object.`);
    return;
  }
  const s = raw as Record<string, unknown>;
  if (!safeStr(s.size)) errors.push(`sizes[${i}].size: required label.`);
  if (!s.geometry || typeof s.geometry !== "object") {
    errors.push(`sizes[${i}].geometry: required object.`);
    return;
  }
  const g = s.geometry as Record<string, unknown>;
  if (!inRange(g.stack, 200, 900)) errors.push(`sizes[${i}].geometry.stack: 200–900 mm.`);
  if (!inRange(g.reach, 200, 600)) errors.push(`sizes[${i}].geometry.reach: 200–600 mm.`);
  if (!inRange(g.head_angle_deg, 50, 90)) errors.push(`sizes[${i}].geometry.head_angle_deg: 50–90°.`);
  if (!inRange(g.seat_angle_deg, 50, 90)) errors.push(`sizes[${i}].geometry.seat_angle_deg: 50–90°.`);
  if (!inRange(g.bb_drop, -100, 150)) errors.push(`sizes[${i}].geometry.bb_drop: -100–150 mm.`);
  if (!inRange(g.chainstay_length, 350, 550)) errors.push(`sizes[${i}].geometry.chainstay_length: 350–550 mm.`);
  if (!inRange(g.fork_length, 300, 700)) errors.push(`sizes[${i}].geometry.fork_length: 300–700 mm.`);
  if (!inRange(g.fork_offset, 0, 100)) errors.push(`sizes[${i}].geometry.fork_offset: 0–100 mm.`);
  if (!inRange(g.wheel_radius, 200, 400)) errors.push(`sizes[${i}].geometry.wheel_radius: 200–400 mm (340 for 700c).`);
  if (!optInRange(g.wheelbase, 800, 1400)) errors.push(`sizes[${i}].geometry.wheelbase: 800–1400 mm.`);
  if (!optInRange(g.seat_tube_ct, 300, 800)) errors.push(`sizes[${i}].geometry.seat_tube_ct: 300–800 mm.`);
  if (!optInRange(g.head_tube, 50, 400)) errors.push(`sizes[${i}].geometry.head_tube: 50–400 mm.`);
  if (!optInRange(g.top_tube_effective, 400, 700)) errors.push(`sizes[${i}].geometry.top_tube_effective: 400–700 mm.`);
  for (const k of Object.keys(g)) {
    if (!ALLOWED_GEO.has(k as keyof FrameGeometry)) {
      errors.push(`sizes[${i}].geometry: unknown field ${k}.`);
    }
  }

  if (!optInRange(s.wheelbase, 800, 1400)) errors.push(`sizes[${i}].wheelbase: 800–1400 mm.`);
  if (!optInRange(s.front_center, 400, 900)) errors.push(`sizes[${i}].front_center: 400–900 mm.`);
  if (!optInRange(s.trail, 30, 120)) errors.push(`sizes[${i}].trail: 30–120 mm.`);
  if (!optInRange(s.top_tube_effective, 400, 700)) errors.push(`sizes[${i}].top_tube_effective: 400–700 mm.`);
  if (!optInRange(s.standover, 500, 950)) errors.push(`sizes[${i}].standover: 500–950 mm.`);
  if (!optInRange(s.bb_height, 200, 400)) errors.push(`sizes[${i}].bb_height: 200–400 mm.`);
  if (!optInRange(s.seat_tube_ct, 300, 800)) errors.push(`sizes[${i}].seat_tube_ct: 300–800 mm.`);
  if (!optInRange(s.head_tube, 50, 400)) errors.push(`sizes[${i}].head_tube: 50–400 mm.`);

  for (const k of Object.keys(s)) {
    if (!ALLOWED_SIZE.has(k)) errors.push(`sizes[${i}]: unknown field ${k}.`);
  }
}

export type FrameModelInput = Omit<FrameModel, "id">;
export type FrameSizeInput = SizeData;
