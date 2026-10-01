import React, { useRef } from "react";
import { BikeFitAnnotations, BikeGeometryAnnotations, type FrameMeasurementVisibility } from "../BikeAnnotations";
import type { FrameGeometry, SizeData } from "../frameCatalog";
import type { buildRider, PedalStrokeLUT } from "../geometry";
import type { BikeSketch, Components, ContactPoint, FitWarning, MannequinSketch } from "../types";
import { CockpitDrawing, DrivetrainFar, FrameDrawing, NearHardware, Wheel } from "./BikeDrawing2D";
import { buildFigure, v, type V } from "./draw2d";
import { StageOverlay } from "./StageOverlay";
import { METRICS, useMetricFocus } from "../fitMetrics";
import type { RiderVisibility } from "./shared";

export interface Stage2DSideProps {
  viewBox: string;
  activeBounds: { minX: number; maxX: number; minY: number; maxY: number };
  groundY: number;
  bike: BikeSketch;
  effectiveFrame: FrameGeometry;
  riderVisibility: RiderVisibility;
  rider: ReturnType<typeof buildRider>;
  weightKg: number;
  mannequin: MannequinSketch;
  strokeMetrics: PedalStrokeLUT;
  showJointAngles: boolean;
  idealContacts: { saddle: ContactPoint; hoods: ContactPoint; cleat: ContactPoint };
  warnings: FitWarning[];
  showFitPositions: boolean;
  components: Components;
  showFrameGeometry: boolean;
  sizeData: SizeData;
  frameMeasurementVisibility: FrameMeasurementVisibility;
}

/** mm ruler along the ground: 25 mm minor ticks, 100 mm major, accent ticks at the axles and BB. */
const Ruler: React.FC<{ minX: number; maxX: number; groundY: number; marks: Array<{ x: number; label: string }> }> = ({
  minX,
  maxX,
  groundY,
  marks,
}) => {
  const ticks: React.ReactNode[] = [];
  for (let x = Math.ceil(minX / 25) * 25; x <= maxX; x += 25) {
    const major = x % 100 === 0;
    ticks.push(
      <line key={x} className={major ? "s2d-tick s2d-tick--major" : "s2d-tick"} x1={x} x2={x} y1={groundY} y2={groundY + (major ? 22 : 12)} />,
    );
  }
  return (
    <g>
      {ticks}
      {marks.map((m) => (
        <g key={m.label}>
          <line className="s2d-tick s2d-tick--hot" x1={m.x} x2={m.x} y1={groundY - 10} y2={groundY + 30} />
          <text className="s2d-ruler-label" x={m.x} y={groundY + 58} textAnchor="middle">
            {m.label}
          </text>
        </g>
      ))}
    </g>
  );
};

/** Hairline interior-angle arc at `v` between rays to `a` and `c`; the focused one also draws its rays. */
const MetricArcShape: React.FC<{ v: V; a: V; c: V; kind: "hot" | "pin" | "dim" }> = ({ v: vx, a, c, kind }) => {
  const r = 70;
  const a1 = Math.atan2(-a.y + vx.y, a.x - vx.x);
  const a2 = Math.atan2(-c.y + vx.y, c.x - vx.x);
  let d = a2 - a1;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d <= -Math.PI) d += Math.PI * 2;
  const p = (ang: number) => `${vx.x + r * Math.cos(ang)} ${-vx.y + r * Math.sin(ang)}`;
  return (
    <g className={`s2d-arc s2d-arc--${kind}`}>
      <path d={`M ${p(a1)} A ${r} ${r} 0 0 ${d > 0 ? 1 : 0} ${p(a2)}`} fill="none" />
      {kind === "hot" && (
        <>
          <line x1={vx.x} y1={-vx.y} x2={vx.x + 1.6 * r * Math.cos(a1)} y2={-vx.y + 1.6 * r * Math.sin(a1)} />
          <line x1={vx.x} y1={-vx.y} x2={vx.x + 1.6 * r * Math.cos(a2)} y2={-vx.y + 1.6 * r * Math.sin(a2)} />
        </>
      )}
    </g>
  );
};

export const Stage2DSide: React.FC<Stage2DSideProps> = ({
  viewBox,
  activeBounds,
  groundY,
  bike,
  effectiveFrame,
  riderVisibility,
  rider,
  weightKg,
  mannequin,
  strokeMetrics,
  showJointAngles,
  idealContacts,
  warnings,
  showFitPositions,
  components,
  showFrameGeometry,
  sizeData,
  frameMeasurementVisibility,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const { focused, pinned } = useMetricFocus();
  const R = effectiveFrame.wheel_radius;
  const farPose = strokeMetrics.poses[0];
  const fig = buildFigure({
    ...mannequin,
    cleat: bike.cleat,
    far: { knee: farPose.knee, ankle: farPose.ankle, cleat: farPose.cleat },
    riderHeightMm: rider.height,
    footLengthMm: rider.foot_length,
    weightKg,
  });
  const polys = (list: string[], cls = "s2d-clay") => list.map((p, i) => <polygon key={i} className={cls} points={p} />);
  const visibleParts = riderVisibility;

  return (
    <div className="s2d-wrap">
    <svg ref={svgRef} viewBox={viewBox} className="geometry-svg s2d">
      <line className="s2d-ground" x1={activeBounds.minX} y1={groundY} x2={activeBounds.maxX} y2={groundY} />
      <Ruler
        minX={activeBounds.minX}
        maxX={activeBounds.maxX}
        groundY={groundY}
        marks={[
          { x: bike.rearAxle.x, label: "R.AXLE" },
          { x: bike.bb.x, label: "BB 0" },
          { x: bike.frontAxle.x, label: "F.AXLE" },
        ]}
      />

      {/* far side: limbs behind the bike, then the drive side */}
      <g className="s2d-far">
        {visibleParts.legs && polys(fig.farLeg)}
        {visibleParts.feet && fig.farShoe && <polygon className="s2d-shoe" points={fig.farShoe} />}
        {visibleParts.arms && polys(fig.farArm)}
      </g>
      <Wheel axle={bike.rearAxle} radius={R} />
      <Wheel axle={bike.frontAxle} radius={R} />
      <DrivetrainFar bike={bike} farSpindle={visibleParts.legs ? v(farPose.cleat.x + components.cleat_setback, farPose.cleat.y) : null} />
      <FrameDrawing bike={bike} />
      <NearHardware bike={bike} cleatCrankEnd={v(bike.cleat.x + components.cleat_setback, bike.cleat.y)} />

      {/* near body */}
      <g>
        {visibleParts.torso && polys(fig.torso)}
        {visibleParts.legs && polys(fig.nearLeg)}
        {visibleParts.feet && <polygon className="s2d-shoe" points={fig.nearShoe} />}
        {visibleParts.arms && polys(fig.nearArm)}
        {visibleParts.head && <polygon className="s2d-clay" points={fig.head} />}
      </g>
      <CockpitDrawing bike={bike} />
      {visibleParts.arms && <polygon className="s2d-glove" points={fig.glove} />}

      {/* skeleton overlay (with ANGLES) */}
      {showJointAngles && (
        <g>
          {fig.bones.map(([a, b], i) => (
            <line key={i} className="s2d-bone" x1={a.x} y1={-a.y} x2={b.x} y2={-b.y} />
          ))}
          {fig.joints.map((j, i) => (
            <circle key={i} className="s2d-joint" cx={j.x} cy={-j.y} r={9} />
          ))}
        </g>
      )}

      {/* metric arcs: focused in accent (with rays), pinned in ink 60%, the rest only with ANGLES (ink 35%) */}
      <g>
        {METRICS.map((d) => {
          const arc = d.arc?.({ m: mannequin, lut: strokeMetrics, pts: new Map() });
          if (!arc) return null;
          const isFocus = d.id === focused;
          const isPin = pinned.includes(d.id);
          if (!isFocus && !isPin && !showJointAngles) return null;
          return <MetricArcShape key={d.id} {...arc} kind={isFocus ? "hot" : isPin ? "pin" : "dim"} />;
        })}
      </g>

      {/* ideal contacts: registration crosshairs */}
      {visibleParts.contactMarkers &&
        (["saddle", "hoods", "cleat"] as const).map((contact) => {
          const pt = idealContacts[contact];
          return (
            <g key={contact}>
              <line x1={pt.x - 18} y1={-pt.y} x2={pt.x + 18} y2={-pt.y} className="geometry-target" />
              <line x1={pt.x} y1={-pt.y - 18} x2={pt.x} y2={-pt.y + 18} className="geometry-target" />
              <text x={pt.x + 12} y={-pt.y - 12} className="geometry-label geometry-label--target">
                IDEAL {contact.toUpperCase()}
              </text>
            </g>
          );
        })}

      {warnings
        .filter((w) => w.severity !== "ok")
        .map((w) => {
          const actual = w.contact === "saddle" ? bike.saddle : w.contact === "hoods" ? bike.hoods : bike.cleat;
          const ideal = idealContacts[w.contact];
          return (
            <g key={w.contact}>
              <line className="s2d-gap" x1={actual.x} y1={-actual.y} x2={ideal.x} y2={-ideal.y} />
              <text className="geometry-label s2d-gap-label" x={(actual.x + ideal.x) / 2 + 8} y={-((actual.y + ideal.y) / 2)}>
                {w.distance.toFixed(0)} mm
              </text>
            </g>
          );
        })}

      {showFitPositions && <BikeFitAnnotations bike={bike} barWidth={components.bar_width} />}
      {showFrameGeometry && (
        <BikeGeometryAnnotations
          bike={bike}
          frame={effectiveFrame}
          sizeData={sizeData}
          visibleMeasurements={frameMeasurementVisibility}
        />
      )}
    </svg>
      <StageOverlay mannequin={mannequin} bike={bike} strokeMetrics={strokeMetrics} svgRef={svgRef} viewBox={viewBox} />
    </div>
  );
};
