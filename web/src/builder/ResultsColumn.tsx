import React from "react";
import { CollapsibleSection } from "../components/CollapsibleSection";
import { MetricCard } from "../components/MetricCard";
import { StatusDot } from "../design/StatusDot";
import { SpecTable } from "../design/SpecTable";
import { METRIC_BY_ID, computeAll, formatDelta, formatMetric, metricStatus, type MetricId } from "../fitMetrics";
import { POSTURE_PRESET, bandStatus, type BandStatus } from "../geometry";
import { SummaryTone, SummaryRow, PRESET_LABELS } from "./shared";
import type { FitWarning, ContactPoint, SeatpostType } from "../types";
import type { RiderFit, Components, MannequinSketch } from "../types";
import type { PedalStrokeLUT } from "../geometry";
export interface ResultsColumnProps {
  mobilePanel: "controls" | "results" | null;
  fullscreen: boolean;
  issueCount: number;
  actualSaddleY: number;
  saddleDelta: number;
  idealSaddleY: number;
  saddleWarning: FitWarning | undefined;
  severityTone: (s: "ok" | "warning" | "bad") => SummaryTone;
  kneeFlex: number;
  fitMode: "contact" | "saddle_height";
  riderFit: RiderFit;
  kneeTone: "ok" | "bad" | "warn" | "muted";
  hoodsWarning: FitWarning | undefined;
  barReachNeededValue: number | null;
  barReachDelta: number | null;
  components: Components;
  barReachTone: "ok" | "bad" | "warn" | "muted";
  bbToSaddleDistance: number;
  seatpostExtension: number;
  strokeMetrics: PedalStrokeLUT;
  targetTrunkAngleDeg: number;
  preset: "endurance" | "race" | "fast";
  warnings: FitWarning[];
  bike: { bb: ContactPoint; rearAxle: ContactPoint; frontAxle: ContactPoint; seatCluster: ContactPoint; seatTubeTop: ContactPoint; headTubeBottom: ContactPoint; headTubeTop: ContactPoint; saddle: ContactPoint; saddleClamp: ContactPoint; seatpostTop: ContactPoint; seatpostBend: ContactPoint; cleat: ContactPoint; crankEnd: ContactPoint; steererTop: ContactPoint; barClamp: ContactPoint; hoods: ContactPoint; };
  seatpostRec: { bbToRailDistance: number; requiredSetback: number; type: SeatpostType; note: string; };
  frameGeometryRows: [string, string][];
  mannequin: MannequinSketch;
  /** Slot for the fit history panel (track D). Rendered at the bottom of the column. */
  historySlot?: React.ReactNode;
  /** Comparison fit metrics (D-ui): shown as +n / −n beside each summary row. */
  compareMetrics?: Partial<Record<MetricId, number>>;
}

const unitSplit = (v: string): { value: string; unit?: string } => {
  const m = /^(-?[\d.,]+)\s*(\S.*)$/.exec(v);
  return m ? { value: m[1], unit: m[2] } : { value: v };
};

const ANGLE_METRICS: MetricId[] = ["knee_ext_bdc", "knee_flex_tdc", "hip", "trunk", "shoulder", "elbow_flex"];

export const ResultsColumn: React.FC<ResultsColumnProps> = ({ mobilePanel, fullscreen, issueCount, actualSaddleY, saddleDelta, idealSaddleY, saddleWarning, severityTone, kneeFlex, fitMode, riderFit, kneeTone, hoodsWarning, barReachNeededValue, barReachDelta, components, barReachTone, bbToSaddleDistance, seatpostExtension, strokeMetrics, targetTrunkAngleDeg, preset, warnings, bike, seatpostRec, frameGeometryRows, mannequin, historySlot, compareMetrics }) => {
  const angleValues = computeAll({ m: mannequin, lut: strokeMetrics, pts: new Map() });
  const angleStatuses = {
    total: ANGLE_METRICS.length,
    in: ANGLE_METRICS.filter((id) => {
      const v = angleValues[id];
      return v != null && metricStatus(id, v, POSTURE_PRESET) === "in";
    }).length,
  };
  return (
    (
    <aside
      className={`controls-panel controls-panel--dense builder-right${mobilePanel === "results" ? " mobile-open" : ""}`}
      style={{ display: fullscreen ? "none" : undefined }}
    >
      {/* ── Fit summary: the numbers that matter, always visible ── */}
      <div className="fit-summary">
        <div className="fit-summary__header">
          <div>
            <div className="ff-eyebrow">Fit summary</div>
            <h3>At a glance</h3>
          </div>
          <span className="fit-summary__count">{angleStatuses.in} of {angleStatuses.total} in band</span>
        </div>
        {ANGLE_METRICS.map((id) => {
          const v = angleValues[id];
          if (v == null) return null;
          const d = METRIC_BY_ID[id];
          const st = metricStatus(id, v, POSTURE_PRESET);
          const was = compareMetrics?.[id];
          const delta = was != null ? formatDelta(id, v - was) : "";
          return (
            <div key={id} className="fit-summary__row">
              {st ? <StatusDot status={st} /> : <span />}
              <div className="fit-summary__text">
                <span className="fit-summary__label">{d.short.charAt(0) + d.short.slice(1).toLowerCase()}</span>
              </div>
              <strong className="fit-summary__value">
                {formatMetric(id, v)}
                <small>{d.unit}</small>
              </strong>
              <i className="fit-summary__delta">{delta.replace(/^[▲▼] /, (m) => (m.startsWith("▲") ? "+" : "−"))}</i>
            </div>
          );
        })}
      </div>

      <CollapsibleSection eyebrow="Fit Analysis" title="Ideal vs actual" defaultOpen={false}>
        <div className="metric-grid">
          <MetricCard
            title="Measured vertically from the centre of the bottom bracket axle to the top of the saddle surface. This is the height that gives your target knee flex angle at the most extended point of the pedal stroke."
            label={fitMode === "saddle_height" ? "Target saddle height" : "Ideal saddle height"}
            value={`${idealSaddleY.toFixed(0)} mm`}
          />
          <MetricCard
            title="Current saddle height based on your seatpost and saddle stack settings. Measured vertically from the centre of the bottom bracket axle to the top of the saddle surface."
            label="Actual saddle height"
            value={`${actualSaddleY.toFixed(0)} mm`}
            delta={`${saddleDelta.toFixed(0)} mm vs ideal`}
          />
          <MetricCard
            title="Distance measured along the seat tube from the centre of the bottom bracket axle to the top of the saddle surface. This matches the standard tape measurement a bike fitter takes."
            label="BB to saddle"
            value={`${Math.round(bbToSaddleDistance)} mm`}
          />
          <MetricCard
            title="Visible exposed seatpost measured along the post axis from the frame top to the visible top of the post/topper."
            label="Seatpost extension"
            value={`${seatpostExtension.toFixed(0)} mm`}
          />
          <MetricCard
            title="Knee flexion at the most extended point of the pedal stroke (≈ 5 o'clock, where the pedal is farthest from the hip)."
            label="Knee flex at max ext."
            value={`${kneeFlex.toFixed(1)}°`}
            delta={fitMode === "contact" ? `Target ${riderFit.targetKneeFlexDeg}°` : undefined}
          />
          <MetricCard
            title="Knee flexion when the crank is at top dead centre. Values above ~115° suggest the saddle is too low or the cranks too long for your hip mobility."
            label="Knee flex at TDC"
            value={`${strokeMetrics.kneeFlexionTdcDeg.toFixed(1)}°`}
            color={`var(--band-${bandStatus(strokeMetrics.kneeFlexionTdcDeg, POSTURE_PRESET.knee_flexion_tdc)})`}
            delta={`Band ${POSTURE_PRESET.knee_flexion_tdc.min_deg}–${POSTURE_PRESET.knee_flexion_tdc.max_deg}°`}
          />
          <MetricCard
            title="KOPS: horizontal distance from the knee joint centre to the pedal spindle with the crank at 3 o'clock. Positive = knee ahead of the spindle. A neutral starting point is ±20 mm; it is a reference, not a rule."
            label="KOPS offset"
            value={`${strokeMetrics.kopsOffsetMm >= 0 ? "+" : ""}${strokeMetrics.kopsOffsetMm.toFixed(0)} mm`}
            delta={strokeMetrics.kopsOffsetMm > 20 ? "Knee forward of spindle" : strokeMetrics.kopsOffsetMm < -20 ? "Knee behind spindle" : "Near neutral"}
          />
          <MetricCard
            label="Trunk angle"
            value={`${targetTrunkAngleDeg}°`}
            delta={`${PRESET_LABELS[preset]} preset`}
          />
          <MetricCard label="Current bar reach" value={`${components.bar_reach} mm`} />
          {barReachNeededValue !== null ? (
            <MetricCard
              label="Bar reach needed"
              value={`${Math.round(barReachNeededValue)} mm`}
              delta={`${barReachNeededValue - components.bar_reach >= 0 ? "+" : ""}${Math.round(barReachNeededValue - components.bar_reach)} mm vs current`}
            />
          ) : (
            <MetricCard label="Bar reach needed" value="Out of range" color="var(--band-out)" />
          )}
        </div>
      </CollapsibleSection>

      <CollapsibleSection eyebrow="Warnings" title="Contact point match">
        {warnings.map((w) => {
          const st: BandStatus = w.severity === "ok" ? "in" : w.severity === "warning" ? "near" : "out";
          return (
            <div key={w.contact} className={`warn-note warn-note--${st}`}>
              <b className="warn-note__eyebrow">
                <StatusDot status={st} /> {st === "in" ? "ON TARGET" : st === "near" ? "NEAR" : "OUT"} · {w.contact === "cleat" ? "pedal" : w.contact}
              </b>
              <div>{w.message ?? (w.severity === "ok" ? `On target (${w.distance.toFixed(0)} mm)` : `${w.distance.toFixed(0)} mm off`)}</div>
              {w.severity !== "ok" && !w.message && (
                <div className="warn-note__delta">ΔX {w.deltaX.toFixed(0)} mm · ΔY {w.deltaY.toFixed(0)} mm</div>
              )}
            </div>
          );
        })}
      </CollapsibleSection>

      <CollapsibleSection eyebrow="Coordinates" title="Contact positions (from BB)" defaultOpen={false}>
        <SpecTable
          sections={[
            {
              rows: (
                [
                  ["Saddle X", bike.saddle.x],
                  ["Saddle Y", bike.saddle.y],
                  ["Hoods X", bike.hoods.x],
                  ["Hoods Y", bike.hoods.y],
                  ["Cleat X", bike.cleat.x],
                  ["Cleat Y", bike.cleat.y],
                ] as [string, number][]
              ).map(([label, value]) => ({ label, value: String(Math.round(value)), unit: "mm" })),
            },
          ]}
        />
      </CollapsibleSection>

      <CollapsibleSection eyebrow="Seatpost" title="Seatpost recommendation" defaultOpen={false}>
        <div className="metric-grid">
          <MetricCard
            label="BB to rail distance"
            value={`${Math.round(seatpostRec.bbToRailDistance)} mm`}
          />
          <MetricCard
            label="Seatpost type"
            value={<span style={{ textTransform: "capitalize" }}>{seatpostRec.type}</span>}
            color={
              seatpostRec.type === "straight"
                ? "var(--band-in)"
                : seatpostRec.type === "setback"
                ? "var(--band-near)"
                : "var(--band-out)"
            }
            delta={seatpostRec.note}
          />
        </div>
      </CollapsibleSection>

      <CollapsibleSection eyebrow="Frame" title="Geometry" defaultOpen={false}>
        <SpecTable
          sections={[{ rows: frameGeometryRows.map(([label, value]) => ({ label, ...unitSplit(value) })) }]}
        />
      </CollapsibleSection>

      {historySlot}
    </aside>
  )
  );
};
