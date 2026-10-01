import React from "react";
import { CollapsibleSection } from "../components/CollapsibleSection";
import { MetricCard } from "../components/MetricCard";
import { POSTURE_PRESET, bandStatus, type BandStatus } from "../geometry";
import { SummaryTone, SummaryRow, PRESET_LABELS } from "./shared";
import type { FitWarning, ContactPoint, SeatpostType } from "../types";
import type { RiderFit, Components } from "../types";
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
  bandColor: (s: BandStatus) => "var(--teal)" | "#d4880a" | "var(--accent)";
  targetTrunkAngleDeg: number;
  preset: "endurance" | "race" | "fast";
  warnings: FitWarning[];
  severityColor: (s: "ok" | "warning" | "bad") => "var(--ok)" | "var(--warn)" | "var(--bad)";
  bike: { bb: ContactPoint; rearAxle: ContactPoint; frontAxle: ContactPoint; seatCluster: ContactPoint; seatTubeTop: ContactPoint; headTubeBottom: ContactPoint; headTubeTop: ContactPoint; saddle: ContactPoint; saddleClamp: ContactPoint; seatpostTop: ContactPoint; seatpostBend: ContactPoint; cleat: ContactPoint; crankEnd: ContactPoint; steererTop: ContactPoint; barClamp: ContactPoint; hoods: ContactPoint; };
  seatpostRec: { bbToRailDistance: number; requiredSetback: number; type: SeatpostType; note: string; };
  frameGeometryRows: [string, string][];
}

export const ResultsColumn: React.FC<ResultsColumnProps> = ({ mobilePanel, fullscreen, issueCount, actualSaddleY, saddleDelta, idealSaddleY, saddleWarning, severityTone, kneeFlex, fitMode, riderFit, kneeTone, hoodsWarning, barReachNeededValue, barReachDelta, components, barReachTone, bbToSaddleDistance, seatpostExtension, strokeMetrics, bandColor, targetTrunkAngleDeg, preset, warnings, severityColor, bike, seatpostRec, frameGeometryRows }) => {
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
            <div className="eyebrow">Fit summary</div>
            <h3>At a glance</h3>
          </div>
          {issueCount > 0 ? (
            <span className="warn-chip">{issueCount} issue{issueCount === 1 ? "" : "s"}</span>
          ) : (
            <span className="warn-chip warn-chip--ok">All on target</span>
          )}
        </div>
        <SummaryRow
          label="Saddle height"
          value={`${actualSaddleY.toFixed(0)} mm`}
          caption={`${saddleDelta >= 0 ? "+" : ""}${saddleDelta.toFixed(0)} mm vs ideal ${idealSaddleY.toFixed(0)}`}
          tone={saddleWarning ? severityTone(saddleWarning.severity) : "muted"}
        />
        <SummaryRow
          label="Knee flex at BDC"
          value={`${kneeFlex.toFixed(1)}°`}
          caption={
            fitMode === "contact"
              ? `target ${riderFit.targetKneeFlexDeg}°`
              : "follows saddle height"
          }
          tone={kneeTone}
        />
        <SummaryRow
          label="Hoods position"
          value={
            hoodsWarning
              ? hoodsWarning.severity === "ok"
                ? "On target"
                : `${hoodsWarning.distance.toFixed(0)} mm off`
              : "—"
          }
          caption={
            hoodsWarning && hoodsWarning.severity !== "ok"
              ? `ΔX ${hoodsWarning.deltaX.toFixed(0)} · ΔY ${hoodsWarning.deltaY.toFixed(0)} mm`
              : undefined
          }
          tone={hoodsWarning ? severityTone(hoodsWarning.severity) : "muted"}
        />
        <SummaryRow
          label="Bar reach"
          value={barReachNeededValue !== null ? `${Math.round(barReachNeededValue)} mm needed` : "Out of range"}
          caption={
            barReachDelta !== null
              ? `${barReachDelta >= 0 ? "+" : ""}${Math.round(barReachDelta)} mm vs current ${components.bar_reach}`
              : undefined
          }
          tone={barReachTone}
        />
      </div>

      <CollapsibleSection eyebrow="Fit Analysis" title="Ideal vs actual" defaultOpen={false}>
        <div className="metric-grid">
          <MetricCard
            title="Measured vertically from the centre of the bottom bracket axle to the top of the saddle surface. This is the height that gives your target knee flex angle at bottom dead centre."
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
            label="Knee flex at BDC"
            value={`${kneeFlex.toFixed(1)}°`}
            delta={fitMode === "contact" ? `Target ${riderFit.targetKneeFlexDeg}°` : undefined}
          />
          <MetricCard
            title="Knee flexion when the crank is at top dead centre. Values above ~115° suggest the saddle is too low or the cranks too long for your hip mobility."
            label="Knee flex at TDC"
            value={`${strokeMetrics.kneeFlexionTdcDeg.toFixed(1)}°`}
            color={bandColor(bandStatus(strokeMetrics.kneeFlexionTdcDeg, POSTURE_PRESET.knee_flexion_tdc))}
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
            <MetricCard label="Bar reach needed" value="Out of range" color="var(--bad)" />
          )}
        </div>
      </CollapsibleSection>

      <CollapsibleSection eyebrow="Warnings" title="Contact point match">
        <div className="metric-grid">
          {warnings.map((w) => (
            <MetricCard
              key={w.contact}
              label={w.contact}
              labelStyle={{ textTransform: "capitalize" }}
              value={w.severity === "ok" ? `On target (${w.distance.toFixed(0)} mm)` : `${w.distance.toFixed(0)} mm off`}
              color={severityColor(w.severity)}
              delta={
                w.severity !== "ok"
                  ? `ΔX ${w.deltaX.toFixed(0)} mm · ΔY ${w.deltaY.toFixed(0)} mm`
                  : undefined
              }
            />
          ))}
        </div>
      </CollapsibleSection>

      <CollapsibleSection eyebrow="Coordinates" title="Contact positions (from BB)" defaultOpen={false}>
        <div className="metric-grid">
          {([
            ["Saddle X", bike.saddle.x],
            ["Saddle Y", bike.saddle.y],
            ["Hoods X",  bike.hoods.x],
            ["Hoods Y",  bike.hoods.y],
            ["Cleat X",  bike.cleat.x],
            ["Cleat Y",  bike.cleat.y],
          ] as [string, number][]).map(([label, value]) => (
            <MetricCard key={label} label={label} value={`${Math.round(value)} mm`} />
          ))}
        </div>
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
                ? "var(--ok)"
                : seatpostRec.type === "setback"
                ? "var(--warn)"
                : "var(--bad)"
            }
            delta={seatpostRec.note}
          />
        </div>
      </CollapsibleSection>

      <CollapsibleSection eyebrow="Frame" title="Geometry" defaultOpen={false}>
        <div className="metric-grid">
          {frameGeometryRows.map(([label, value]) => (
            <MetricCard key={label} label={label} value={value} />
          ))}
        </div>
      </CollapsibleSection>
    </aside>
  )
  );
};
