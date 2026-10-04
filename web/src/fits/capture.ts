/**
 * Capturing and restoring a Fit Builder state. `inputs` holds every piece of state needed to restore the
 * builder; `snapshot` is what comparison reads without recomputing. Restoring tolerates missing keys (the
 * current value is kept) and ignores unknown ones, so old saved fits keep loading.
 */
import type { Geometry3DPoint } from "../bike3d";
import type { MetricId } from "../fitMetrics";
import type { BikeSelection, Components, FitMode, RiderFit } from "../types";
import type { BodyMeasurements, MannequinPresetKey } from "../geometry";
import type { FitOut, FitSnapshot } from "./api";

export const INPUTS_VERSION = 1;

export interface BuilderInputs {
  v: number;
  selection: BikeSelection;
  components: Components;
  tyreSize: number;
  riderFit: RiderFit;
  preset: MannequinPresetKey;
  trunkAngleOverride: number | null;
  backBendOverride: number | null;
  wristLockEnabled: boolean;
  wristLockMaxDeg: number;
  hoodPresetId: string;
  bodyMeasurements: Partial<BodyMeasurements>;
  pedalPresetId: string;
  shoePresetId: string;
  fitMode: FitMode;
  targetSaddleHeightMm: number;
}

type Setters = {
  [K in keyof Omit<BuilderInputs, "v">]: (value: BuilderInputs[K]) => void;
};

export function captureInputs(state: Omit<BuilderInputs, "v">): BuilderInputs {
  return { v: INPUTS_VERSION, ...state };
}

/** Applies each key that is present (and of a plausible type); everything else is left untouched. */
export function restoreInputs(raw: Record<string, unknown>, set: Setters): void {
  const has = (k: string) => Object.prototype.hasOwnProperty.call(raw, k) && raw[k] !== undefined;
  const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
  if (has("selection") && isObj(raw.selection)) set.selection(raw.selection as unknown as BikeSelection);
  if (has("components") && isObj(raw.components)) set.components(raw.components as unknown as Components);
  if (typeof raw.tyreSize === "number") set.tyreSize(raw.tyreSize);
  if (has("riderFit") && isObj(raw.riderFit)) set.riderFit(raw.riderFit as unknown as RiderFit);
  if (typeof raw.preset === "string") set.preset(raw.preset as MannequinPresetKey);
  if (raw.trunkAngleOverride === null || typeof raw.trunkAngleOverride === "number") set.trunkAngleOverride(raw.trunkAngleOverride as number | null);
  if (raw.backBendOverride === null || typeof raw.backBendOverride === "number") set.backBendOverride(raw.backBendOverride as number | null);
  if (typeof raw.wristLockEnabled === "boolean") set.wristLockEnabled(raw.wristLockEnabled);
  if (typeof raw.wristLockMaxDeg === "number") set.wristLockMaxDeg(raw.wristLockMaxDeg);
  if (typeof raw.hoodPresetId === "string") set.hoodPresetId(raw.hoodPresetId);
  if (has("bodyMeasurements") && isObj(raw.bodyMeasurements)) set.bodyMeasurements(raw.bodyMeasurements as Partial<BodyMeasurements>);
  if (typeof raw.pedalPresetId === "string") set.pedalPresetId(raw.pedalPresetId);
  if (typeof raw.shoePresetId === "string") set.shoePresetId(raw.shoePresetId);
  if (raw.fitMode === "contact" || raw.fitMode === "saddle_height") set.fitMode(raw.fitMode);
  if (typeof raw.targetSaddleHeightMm === "number") set.targetSaddleHeightMm(raw.targetSaddleHeightMm);
}

export function buildSnapshot(args: {
  metrics: Partial<Record<MetricId, number>>;
  points3d: Geometry3DPoint[];
  components: Components;
  frameLabel: string;
}): FitSnapshot {
  const comps: Record<string, number | null> = {};
  for (const [k, v] of Object.entries(args.components)) comps[k] = typeof v === "number" ? v : null;
  return {
    metrics: args.metrics,
    mannequin_points: args.points3d
      .filter((p) => p.group === "mannequin")
      .slice(0, 64)
      .map((p) => ({ name: p.name, pos: [...p.pos] as [number, number, number] })),
    components: comps,
    frame_label: args.frameLabel,
  };
}

/**
 * The thing something is compared against: a saved fit or a session snapshot. Same type for 2D and 3D.
 * (Master plan §7 "CompareTarget".)
 */
export interface CompareTarget {
  label: string;
  metrics: Partial<Record<MetricId, number>>;
  points: Geometry3DPoint[];
}

export function compareTargetFromFit(fit: FitOut): CompareTarget {
  return {
    label: fit.name,
    metrics: fit.snapshot.metrics,
    points: fit.snapshot.mannequin_points.map((p) => ({ name: p.name, pos: p.pos, group: "mannequin" })),
  };
}
