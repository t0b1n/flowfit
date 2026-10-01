import type { FitSummary } from "./api";
import { formatMetric } from "../fitMetrics";

export const ddmm = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
};

/** `knee 148°` for the row meta, when the fit carries it. */
export const kneeMeta = (f: FitSummary) => {
  const v = f.metrics.knee_ext_bdc;
  return v == null ? "" : `knee ${formatMetric("knee_ext_bdc", v)}°`;
};
