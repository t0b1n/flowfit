import React, { useLayoutEffect, useMemo, useState } from "react";
import { BandGauge } from "../design/BandGauge";
import { CalloutLayer, type CalloutAnchor } from "../design/CalloutLayer";
import { MetricRail } from "../design/MetricRail";
import { Readout } from "../design/Readout";
import {
  METRICS,
  METRIC_BY_ID,
  computeAll,
  formatDelta,
  formatMetric,
  metricBand,
  metricStatus,
  useMetricFocus,
  type MetricId,
  type Vec3,
} from "../fitMetrics";
import { POSTURE_PRESET, type PedalStrokeLUT } from "../geometry";
import type { BikeSketch, MannequinSketch } from "../types";
import type { V } from "./draw2d";

/** Where each metric's callout points on the 2D side view, in bike mm. */
export function metricAnchors2D(m: MannequinSketch, bike: BikeSketch, lut: PedalStrokeLUT): Record<MetricId, V> {
  return {
    knee_ext_bdc: m.knee,
    knee_flex_tdc: lut.poses[0].knee,
    hip: m.hip,
    trunk: m.spineJoint,
    shoulder: m.shoulder,
    elbow_flex: m.elbow,
    kops: m.knee,
    saddle_height: bike.saddle,
    setback: bike.saddle,
    drop: bike.hoods,
    reach: bike.hoods,
  };
}

/** Preferred leader direction (screen px) per metric in the side view (rider faces right). */
export const SIDE_PREFER: Partial<Record<MetricId, [number, number]>> = {
  trunk: [-90, -60],
  hip: [-110, -30],
  knee_ext_bdc: [100, 60],
  knee_flex_tdc: [110, -40],
  shoulder: [60, -90],
  elbow_flex: [90, -40],
  kops: [100, 90],
  saddle_height: [-120, 50],
  setback: [-120, 80],
  drop: [100, -50],
  reach: [100, -80],
};

/** Metric inputs for the registry, from the 2D sketches (no 3D scene needed). */
export function metricValues(m: MannequinSketch, bike: BikeSketch, lut: PedalStrokeLUT) {
  const pts = new Map<string, Vec3>([
    ["saddle", [bike.saddle.x, bike.saddle.y, 0]],
    ["hoods_r", [bike.hoods.x, bike.hoods.y, 0]],
    ["hoods_l", [bike.hoods.x, bike.hoods.y, 0]],
  ]);
  return computeAll({ m, lut, pts });
}

export interface StageOverlayProps {
  mannequin: MannequinSketch;
  bike: BikeSketch;
  strokeMetrics: PedalStrokeLUT;
  /** SVG to project anchors through (side view only); omit for views without callouts. */
  svgRef?: React.RefObject<SVGSVGElement>;
  viewBox?: string;
  /** Previous-fit values for deltas (track D). */
  was?: Partial<Record<MetricId, number>>;
}

/** Readout (top-right), Metric Rail (bottom) and callouts for the focused + pinned metrics. */
export const StageOverlay: React.FC<StageOverlayProps> = ({ mannequin, bike, strokeMetrics, svgRef, viewBox, was }) => {
  const { focused, pinned, focus, togglePin, reset } = useMetricFocus();
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [px, setPx] = useState<Partial<Record<MetricId, { x: number; y: number }>>>({});

  const values = useMemo(() => metricValues(mannequin, bike, strokeMetrics), [mannequin, bike, strokeMetrics]);
  const anchors = useMemo(() => metricAnchors2D(mannequin, bike, strokeMetrics), [mannequin, bike, strokeMetrics]);
  const shown: MetricId[] = useMemo(() => [focused, ...pinned.filter((p) => p !== focused)], [focused, pinned]);

  useLayoutEffect(() => {
    const wrap = wrapRef.current?.parentElement; // the .s2d-wrap host (the overlay itself may be display:contents)
    if (!wrap) return;
    const measure = () => {
      const r = wrap.getBoundingClientRect();
      setBox({ w: r.width, h: r.height });
      const svg = svgRef?.current;
      const ctm = svg?.getScreenCTM();
      if (!svg || !ctm) return setPx({});
      const out: Partial<Record<MetricId, { x: number; y: number }>> = {};
      for (const id of shown) {
        const a = anchors[id];
        const p = svg.createSVGPoint();
        p.x = a.x;
        p.y = -a.y;
        const s = p.matrixTransform(ctm);
        out[id] = { x: s.x - r.left, y: s.y - r.top };
      }
      setPx(out);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [svgRef, viewBox, anchors, shown]);

  const callouts: CalloutAnchor[] = shown.flatMap((id) => (px[id] ? [{ id, x: px[id]!.x, y: px[id]!.y, hot: id === focused }] : []));

  const bigDef = METRIC_BY_ID[focused];
  const bigVal = values[focused];
  const band = metricBand(focused, POSTURE_PRESET);
  const delta = (id: MetricId) => (was?.[id] != null && values[id] != null ? formatDelta(id, values[id]! - was[id]!) : "");

  const railItems = METRICS.filter((d) => values[d.id] != null).map((d) => {
    const v = values[d.id]!;
    return {
      id: d.id,
      code: d.code,
      label: d.short,
      value: formatMetric(d.id, v),
      unit: d.unit === "mm" ? "mm" : "°",
      delta: delta(d.id),
      status: metricStatus(d.id, v, POSTURE_PRESET),
    };
  });

  return (
    <div className="stage-overlay" ref={wrapRef}>
      {box.w > 0 && svgRef && <CalloutLayer anchors={callouts} width={box.w} height={box.h} prefer={SIDE_PREFER} values={values} />}
      <div className="stage-overlay__readout">
        {bigVal != null && (
          <>
            <Readout
              size="big"
              eyebrow={`${bigDef.code} · ${bigDef.label}`}
              value={formatMetric(focused, bigVal)}
              unit={bigDef.unit}
              delta={delta(focused)}
            />
            {band && <BandGauge value={bigVal} band={band} was={was?.[focused]} />}
          </>
        )}
        {pinned.filter((p) => p !== focused && values[p] != null).length > 0 && (
          <div className="stage-overlay__pins">
            {pinned
              .filter((p) => p !== focused && values[p] != null)
              .map((id) => {
                const def = METRIC_BY_ID[id];
                const b = metricBand(id, POSTURE_PRESET);
                return (
                  <div key={id}>
                    <Readout size="medium" eyebrow={`${def.code} · ${def.short}`} value={formatMetric(id, values[id]!)} unit={def.unit} delta={delta(id)} />
                    {b && <BandGauge value={values[id]!} band={b} mini />}
                  </div>
                );
              })}
          </div>
        )}
      </div>
      <div className="stage-overlay__rail">
        <MetricRail
          items={railItems}
          focused={focused}
          pinned={pinned}
          onFocus={(id) => focus(id as MetricId)}
          onTogglePin={(id) => togglePin(id as MetricId)}
          onReset={reset}
          keyboard
        />
      </div>
    </div>
  );
};
