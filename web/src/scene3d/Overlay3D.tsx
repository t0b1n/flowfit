import React from "react";
import { BandGauge } from "../design/BandGauge";
import { MetricRail } from "../design/MetricRail";
import { Readout } from "../design/Readout";
import { SpecTable } from "../design/SpecTable";
import { BrandMark } from "../design/BrandMark";
import {
  METRICS,
  METRIC_BY_ID,
  formatDelta,
  formatMetric,
  metricBand,
  metricStatus,
  type MetricId,
} from "../fitMetrics";
import { POSTURE_PRESET, type PosturePreset } from "../geometry";
import type { Geometry3DResponse } from "../bike3d";

const dd = (d: Date) =>
  `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getFullYear()).slice(2)}`;

export interface Overlay3DProps {
  geo: Geometry3DResponse;
  bands: PosturePreset | undefined;
  values: Partial<Record<MetricId, number>>;
  /** Previous-fit values for deltas (track D). */
  was?: Partial<Record<MetricId, number>>;
  focused: MetricId;
  pinned: MetricId[];
  onFocus: (id: MetricId) => void;
  onTogglePin: (id: MetricId) => void;
  onReset: () => void;
  specsOpen: boolean;
  onToggleSpecs: () => void;
  fitLabel?: string;
}

/** Header (top-left), readout + spec panel (top-right), band legend, Metric Rail (bottom). */
export const Overlay3D: React.FC<Overlay3DProps> = ({
  geo, bands, values, was, focused, pinned, onFocus, onTogglePin, onReset, specsOpen, onToggleSpecs, fitLabel,
}) => {
  const b = bands ?? POSTURE_PRESET;
  const delta = (id: MetricId) => (was?.[id] != null && values[id] != null ? formatDelta(id, values[id]! - was[id]!) : "");
  const bigDef = METRIC_BY_ID[focused];
  const bigVal = values[focused];
  const band = metricBand(focused, b);
  const pinList = pinned.filter((p) => p !== focused && values[p] != null);

  const c = geo.components;
  const f = geo.frame;
  const n = (v: number | undefined, d = 0) => (v == null ? "—" : v.toFixed(d));
  const saddleH = values.saddle_height;

  const railItems = METRICS.filter((d) => values[d.id] != null).map((d) => ({
    id: d.id,
    code: d.code,
    label: d.short,
    value: formatMetric(d.id, values[d.id]!),
    unit: d.unit,
    delta: delta(d.id),
    status: metricStatus(d.id, values[d.id]!, b),
  }));

  return (
    <div className="b3-overlay">
      <div className="b3-head">
        <BrandMark size={22} />
        <span className="b3-head__meta">
          {fitLabel ?? "FIT —"} · {b.name.toUpperCase()} · {dd(new Date())}
        </span>
      </div>

      <div className="b3-right">
        {bigVal != null && (
          <div className="b3-readout">
            <Readout size="big" eyebrow={`${bigDef.code} · ${bigDef.label}`} value={formatMetric(focused, bigVal)} unit={bigDef.unit} delta={delta(focused)} />
            {band && <BandGauge value={bigVal} band={band} was={was?.[focused]} />}
            {pinList.length > 0 && (
              <div className="b3-pins">
                {pinList.map((id) => {
                  const d = METRIC_BY_ID[id];
                  const bd = metricBand(id, b);
                  return (
                    <div key={id}>
                      <Readout size="medium" eyebrow={`${d.code} · ${d.short}`} value={formatMetric(id, values[id]!)} unit={d.unit} delta={delta(id)} />
                      {bd && <BandGauge value={values[id]!} band={bd} mini />}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        <button type="button" className="b3-specs-toggle ff-pill ff-pill--ghost" onClick={onToggleSpecs} aria-expanded={specsOpen}>
          Specs
        </button>
        <div className={`b3-spec${specsOpen ? " b3-spec--open" : ""}`}>
          <SpecTable
            sections={[
              {
                title: "Components",
                rows: [
                  { label: "Saddle height", value: n(saddleH), unit: "mm", delta: delta("saddle_height") },
                  { label: "Saddle setback", value: n(values.setback), unit: "mm", delta: delta("setback") },
                  { label: "Setback to nose tip", value: n(values.setback_nose), unit: "mm", delta: delta("setback_nose") },
                  { label: "Stem", value: `${n(c.stem_length)} × ${n(c.stem_angle_deg)}`, unit: "mm·°" },
                  { label: "Spacers", value: n(c.spacer_stack), unit: "mm" },
                  { label: "Stem height", value: n(c.stem_height), unit: "mm" },
                  { label: "Crank", value: n(c.crank_length, 1), unit: "mm" },
                ],
              },
              {
                title: "Frame",
                rows: [
                  { label: "Stack / Reach", value: `${n(f.stack)} / ${n(f.reach)}`, unit: "mm" },
                  { label: "Seat / Head", value: `${n(f.seat_angle_deg, 1)} / ${n(f.head_angle_deg, 1)}`, unit: "°" },
                ],
              },
            ]}
            summary={values.drop != null ? { label: "Drop", value: `${n(values.drop)} mm` } : undefined}
          />
        </div>
      </div>

      <div className="b3-foot">
        <span className="b3-foot__legend">
          <i className="ff-dot ff-dot--in" /> In band <i className="ff-dot ff-dot--near" /> Near <i className="ff-dot ff-dot--out" /> Out
        </span>
        <span className="b3-foot__keys">Click = focus · ⇧ click = pin (3) · 1–9 · Esc</span>
        <span className="b3-foot__cam">View ¾ · FOV 30 · Units mm</span>
      </div>

      <div className="b3-rail">
        <MetricRail
          items={railItems}
          focused={focused}
          pinned={pinned}
          onFocus={(id) => onFocus(id as MetricId)}
          onTogglePin={(id) => onTogglePin(id as MetricId)}
          onReset={onReset}
          keyboard
        />
      </div>
    </div>
  );
};
