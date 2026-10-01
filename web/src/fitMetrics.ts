/**
 * Single definition of every fit metric. The 2D view, 3D view, summary and fit history all read this.
 * Spec: docs/plans/3d-instrument-redesign.md §2.1 + docs/plans/site-redesign.md §4.5.
 * The formulas are the ones that used to live in `MetricsHud` / `DimensionLines3D`; do not duplicate them.
 */
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { angleAtPoint, bandStatus, type BandStatus, type PedalStrokeLUT, type PosturePreset } from "./geometry";
import type { ContactPoint, MannequinSketch } from "./types";

export type MetricId =
  | "knee_ext_bdc"
  | "knee_flex_tdc"
  | "hip"
  | "trunk"
  | "shoulder"
  | "elbow_flex"
  | "kops"
  | "saddle_height"
  | "setback"
  | "drop"
  | "reach";

export type Vec3 = [number, number, number];

export interface MetricCtx {
  /** 2D mannequin sketch (sagittal plane, BB-relative, +x forward, +y up). */
  m: MannequinSketch;
  lut?: PedalStrokeLUT;
  /** 3D points by name (`geo.points`). */
  pts: Map<string, Vec3>;
}

export interface MetricArc {
  v: ContactPoint;
  a: ContactPoint;
  c: ContactPoint;
}

export interface MetricDef {
  id: MetricId;
  /** Part code shown in chips: J1..J6 joints, C1..C5 contact/components. */
  code: string;
  /** "Knee extension · BDC" */
  label: string;
  /** "KNEE EXT" */
  short: string;
  unit: "°" | "mm";
  /** Band for the status dot; undefined → no status. */
  bandKey?: keyof PosturePreset;
  /** Null when the metric cannot be computed (e.g. no stroke LUT). */
  compute: (ctx: MetricCtx) => number | null;
  /** 3D anchor for the callout leader line (world mm). */
  anchor: (ctx: MetricCtx) => Vec3 | null;
  /** Arc rays (vertex, rayA, rayC) in 2D sagittal coords for angle metrics. */
  arc?: (ctx: MetricCtx) => MetricArc | null;
}

const pt = (ctx: MetricCtx, name: string): Vec3 | null => ctx.pts.get(name) ?? null;

const hoodsMid = (ctx: MetricCtx): Vec3 | null => {
  const l = pt(ctx, "hoods_l");
  const r = pt(ctx, "hoods_r");
  if (l && r) return [(l[0] + r[0]) / 2, (l[1] + r[1]) / 2, (l[2] + r[2]) / 2];
  return l ?? r;
};

const trunkDeg = (m: MannequinSketch) =>
  (Math.atan2(m.shoulder.y - m.hip.y, m.shoulder.x - m.hip.x) * 180) / Math.PI;

/** Order = rail order. */
export const METRICS: MetricDef[] = [
  {
    id: "knee_ext_bdc",
    code: "J3",
    label: "Knee extension · BDC",
    short: "KNEE EXT",
    unit: "°",
    bandKey: "knee_extension",
    compute: ({ lut }) => (lut ? 180 - lut.kneeFlexionBdcDeg : null),
    anchor: (ctx) => pt(ctx, "knee_l"),
    arc: ({ lut }) => {
      if (!lut) return null;
      const p = lut.poses[Math.round(lut.samples / 2)];
      return { v: p.knee, a: lut.hip, c: p.ankle };
    },
  },
  {
    id: "knee_flex_tdc",
    code: "J4",
    label: "Knee flexion · TDC",
    short: "KNEE FLEX",
    unit: "°",
    bandKey: "knee_flexion_tdc",
    compute: ({ lut }) => (lut ? lut.kneeFlexionTdcDeg : null),
    anchor: (ctx) => pt(ctx, "knee_r"),
    arc: ({ lut }) => {
      if (!lut) return null;
      const p = lut.poses[0];
      return { v: p.knee, a: lut.hip, c: p.ankle };
    },
  },
  {
    id: "hip",
    code: "J2",
    label: "Hip angle",
    short: "HIP",
    unit: "°",
    bandKey: "hip_angle",
    compute: ({ m }) => angleAtPoint(m.shoulder, m.hip, m.knee),
    anchor: (ctx) => pt(ctx, "hip_l"),
    arc: ({ m }) => ({ v: m.hip, a: m.shoulder, c: m.knee }),
  },
  {
    id: "trunk",
    code: "J1",
    label: "Trunk angle",
    short: "TRUNK",
    unit: "°",
    bandKey: "trunk_angle",
    compute: ({ m }) => trunkDeg(m),
    anchor: (ctx) => pt(ctx, "spine_joint"),
    arc: ({ m }) => ({ v: m.hip, a: m.shoulder, c: { x: m.hip.x + 100, y: m.hip.y } }),
  },
  {
    id: "shoulder",
    code: "J5",
    label: "Shoulder angle",
    short: "SHOULDER",
    unit: "°",
    bandKey: "shoulder_flexion",
    compute: ({ m }) => angleAtPoint(m.hip, m.shoulder, m.elbow),
    anchor: (ctx) => pt(ctx, "shoulder_l"),
    arc: ({ m }) => ({ v: m.shoulder, a: m.hip, c: m.elbow }),
  },
  {
    id: "elbow_flex",
    code: "J6",
    label: "Elbow flexion",
    short: "ELBOW",
    unit: "°",
    bandKey: "elbow_flexion",
    compute: ({ m }) => 180 - angleAtPoint(m.shoulder, m.elbow, m.hands),
    anchor: (ctx) => pt(ctx, "elbow_l"),
    arc: ({ m }) => ({ v: m.elbow, a: m.shoulder, c: m.hands }),
  },
  {
    id: "kops",
    code: "C5",
    label: "KOPS offset",
    short: "KOPS",
    unit: "mm",
    compute: ({ lut }) => (lut ? lut.kopsOffsetMm : null),
    anchor: (ctx) => pt(ctx, "knee_l"),
  },
  {
    id: "saddle_height",
    code: "C1",
    label: "Saddle height",
    short: "SADDLE H",
    unit: "mm",
    compute: (ctx) => pt(ctx, "saddle")?.[1] ?? null,
    anchor: (ctx) => pt(ctx, "saddle"),
  },
  {
    id: "setback",
    code: "C2",
    label: "Saddle setback",
    short: "SETBACK",
    unit: "mm",
    compute: (ctx) => {
      const s = pt(ctx, "saddle");
      return s ? -s[0] : null;
    },
    anchor: (ctx) => pt(ctx, "saddle"),
  },
  {
    id: "drop",
    code: "C3",
    label: "Saddle-to-hoods drop",
    short: "DROP",
    unit: "mm",
    compute: (ctx) => {
      const s = pt(ctx, "saddle");
      const h = hoodsMid(ctx);
      return s && h ? s[1] - h[1] : null;
    },
    anchor: (ctx) => pt(ctx, "hoods_l"),
  },
  {
    id: "reach",
    code: "C4",
    label: "Saddle-to-hoods reach",
    short: "REACH",
    unit: "mm",
    compute: (ctx) => {
      const s = pt(ctx, "saddle");
      const h = hoodsMid(ctx);
      return s && h ? h[0] - s[0] : null;
    },
    anchor: (ctx) => pt(ctx, "hoods_l"),
  },
];

export const METRIC_BY_ID = Object.fromEntries(METRICS.map((d) => [d.id, d])) as Record<MetricId, MetricDef>;

export const DEFAULT_FOCUS: MetricId = "knee_ext_bdc";

/** Every metric that can be computed in this context. */
export function computeAll(ctx: MetricCtx): Partial<Record<MetricId, number>> {
  const out: Partial<Record<MetricId, number>> = {};
  for (const d of METRICS) {
    const v = d.compute(ctx);
    if (v != null && Number.isFinite(v)) out[d.id] = v;
  }
  return out;
}

/** Display string without unit (units are rendered separately, in muted). Integers; KOPS is signed. */
export function formatMetric(id: MetricId, value: number): string {
  const r = Math.round(value);
  if (id === "kops") return r === 0 ? "0" : `${r > 0 ? "+" : "−"}${Math.abs(r)}`;
  return String(r === 0 ? 0 : r);
}

/** `▲ 3°`, `▼ 2 mm`, or "" when |delta| < 0.5. */
export function formatDelta(id: MetricId, delta: number): string {
  if (!Number.isFinite(delta) || Math.abs(delta) < 0.5) return "";
  const unit = METRIC_BY_ID[id].unit;
  return `${delta > 0 ? "▲" : "▼"} ${Math.round(Math.abs(delta))}${unit === "mm" ? " mm" : unit}`;
}

/** Band status for a metric, or null when it has no band. */
export function metricStatus(id: MetricId, value: number, bands: PosturePreset): BandStatus | null {
  const key = METRIC_BY_ID[id].bandKey;
  if (!key) return null;
  const band = bands[key];
  return typeof band === "object" && "min_deg" in band ? bandStatus(value, band) : null;
}

/** `[min, max]` of a metric's band, or null when it has none. */
export function metricBand(id: MetricId, bands: PosturePreset): [number, number] | null {
  const key = METRIC_BY_ID[id].bandKey;
  if (!key) return null;
  const band = bands[key];
  return typeof band === "object" && "min_deg" in band ? [band.min_deg, band.max_deg] : null;
}

// ── Focus / pin state, shared by the 2D and 3D views ─────────────────────────

const STORAGE_KEY = "flowfit.metrics";
export const MAX_PINS = 3;

export interface MetricFocusState {
  focused: MetricId;
  pinned: MetricId[];
}

const isId = (v: unknown): v is MetricId => typeof v === "string" && v in METRIC_BY_ID;

function readStored(): MetricFocusState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const o = JSON.parse(raw);
      const pinned = Array.isArray(o?.pinned) ? (o.pinned.filter(isId) as MetricId[]).slice(-MAX_PINS) : [];
      return { focused: isId(o?.focused) ? o.focused : DEFAULT_FOCUS, pinned };
    }
  } catch {
    /* storage blocked or corrupt: fall through */
  }
  return { focused: DEFAULT_FOCUS, pinned: [] };
}

let state: MetricFocusState = readStored();
const listeners = new Set<() => void>();

function setState(next: MetricFocusState) {
  state = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

const actions = {
  /** Focus a metric; focusing the focused one again falls back to DEFAULT_FOCUS. */
  focus(id: MetricId) {
    setState({ ...state, focused: state.focused === id ? DEFAULT_FOCUS : id });
  },
  /** Pin / unpin. A 4th pin replaces the oldest. */
  togglePin(id: MetricId) {
    const pinned = state.pinned.includes(id)
      ? state.pinned.filter((p) => p !== id)
      : [...state.pinned, id].slice(-MAX_PINS);
    setState({ ...state, pinned });
  },
  reset() {
    setState({ focused: DEFAULT_FOCUS, pinned: [] });
  },
};

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

export interface MetricFocus extends MetricFocusState {
  focus: (id: MetricId) => void;
  togglePin: (id: MetricId) => void;
  reset: () => void;
}

/** Focused metric (single) + up to 3 pinned, persisted to localStorage["flowfit.metrics"] and shared by every view. */
export function useMetricFocus(): MetricFocus {
  const s = useSyncExternalStore(subscribe, () => state, () => state);
  const focus = useCallback(actions.focus, []);
  const togglePin = useCallback(actions.togglePin, []);
  const reset = useCallback(actions.reset, []);
  return useMemo(() => ({ ...s, focus, togglePin, reset }), [s, focus, togglePin, reset]);
}
