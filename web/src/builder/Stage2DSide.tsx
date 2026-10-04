import React, { useRef } from "react";
import { BikeFitAnnotations, BikeGeometryAnnotations, type FrameMeasurementVisibility } from "../BikeAnnotations";
import type { FrameGeometry, SizeData } from "../frameCatalog";
import type { buildRider, PedalStrokeLUT } from "../geometry";
import type { BikeSketch, Components, ContactPoint, FitWarning, MannequinSketch } from "../types";
import { DebugLegend, DebugStyle } from "../debug";
import { CockpitDrawing, DiscBrakes, DriveSide, FarCrank, FrameDrawing, NearCrank, Wheel } from "./BikeDrawing2D";
import { buildFigure, figureSkeleton, v, type V } from "./draw2d";
import { legacy2d } from "./legacy2d";
import { OrthoScene } from "../scene3d/OrthoScene";
import type { Geometry3DResponse } from "../bike3d";
import { useTheme } from "../design/useTheme";
import { StageOverlay } from "./StageOverlay";
import { buildCockpit, type Cockpit } from "../cockpit";
import { CockpitSide, WristMarker } from "./Cockpit2D";
import { METRICS, useMetricFocus } from "../fitMetrics";
import type { RiderVisibility } from "./shared";
import type { CompareTarget } from "../fits/capture";

export interface Stage2DSideProps {
  /** the 3D scene data: the bike and rider are drawn by rendering it orthographically under this SVG */
  geo3d: Geometry3DResponse;
  viewBox: string;
  activeBounds: { minX: number; maxX: number; minY: number; maxY: number };
  groundY: number;
  bike: BikeSketch;
  effectiveFrame: FrameGeometry;
  riderVisibility: RiderVisibility;
  rider: ReturnType<typeof buildRider>;
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
  /** Fit to compare against (D-ui): drawn as an accent dashed ghost, and fed to the readout as deltas. */
  compare?: CompareTarget | null;
  showKops?: boolean;
  /** dev-only: colour every component (see src/debug.tsx) */
  debug?: boolean;
  /** cockpit to draw as a dashed ghost (cockpit focus compare) */
  ghostCockpit?: Cockpit | null;
  /** always show the wrist-angle marker (cockpit focus); otherwise it follows the ANGLES layer */
  showWrist?: boolean;
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

/** Drive-side leg and torso of the comparison fit (near-side points, sagittal x/y), `FIT 02 ┄` label at the hip. */
const GhostLines: React.FC<{ compare: CompareTarget }> = ({ compare }) => {
  const P = new Map(compare.points.map((p) => [p.name, p.pos]));
  const chain = (names: string[]) => names.map((n) => P.get(n)).filter((p): p is [number, number, number] => !!p);
  const leg = chain(["hip_r", "knee_r", "ankle_r", "cleat_r"]);
  const torso = chain(["hip_r", "spine_joint", "shoulder_r", "neck_base_center", "head_center"]);
  const pts = (l: Array<[number, number, number]>) => l.map((p) => `${p[0]},${-p[1]}`).join(" ");
  const hip = P.get("hip_r");
  return (
    <g className="s2d-ghost">
      {leg.length > 1 && <polyline points={pts(leg)} />}
      {torso.length > 1 && <polyline points={pts(torso)} />}
      {hip && (
        <text x={hip[0] - 150} y={-hip[1] + 40} className="s2d-ghost__label">
          {compare.label.toUpperCase()} ┄
        </text>
      )}
    </g>
  );
};

export const Stage2DSide: React.FC<Stage2DSideProps> = ({
  geo3d,
  debug,
  viewBox,
  activeBounds,
  groundY,
  bike,
  effectiveFrame,
  riderVisibility,
  rider,
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
  compare,
  showKops,
  ghostCockpit,
  showWrist,
}) => {
  const cockpit = buildCockpit(bike.barClamp, components);
  const svgRef = useRef<SVGSVGElement>(null);
  const { focused, pinned } = useMetricFocus();
  const R = effectiveFrame.wheel_radius;
  const farPose = strokeMetrics.poses[0];
  // The near foot sits on the pedal unless the leg can't reach it, then it hangs above (cleat = IK ankle − stack).
  const nearFootCleat = v(mannequin.ankle.x, mannequin.ankle.y - components.pedal_stack_height);
  const legacy = legacy2d();
  const [theme] = useTheme();
  const figInput = {
    ...mannequin,
    cleat: nearFootCleat,
    far: { knee: farPose.knee, ankle: farPose.ankle, cleat: farPose.cleat },
    riderHeightMm: rider.height,
    footLengthMm: rider.foot_length,
  };
  // outline polygons only for the legacy drawing; the skeleton overlay needs just bones and joints
  const fig = legacy ? buildFigure(figInput) : { ...figureSkeleton(figInput), farLeg: [], farShoe: "", farArm: [], torso: [], nearLeg: [], nearShoe: "", nearArm: [], head: "", glove: "" };
  const polys = (list: string[], part?: string, cls = "s2d-clay") => list.map((p, i) => <polygon key={i} className={cls} points={p} data-part={part} />);
  const visibleParts = riderVisibility;

  return (
    <div className="s2d-wrap">
    {debug && <DebugStyle />}
    <div className="s2d-stack">
    {!legacy && (
      <OrthoScene
        geo={geo3d}
        strokeLUT={strokeMetrics}
        stanceWidth={components.stance_width ?? 155}
        view="side"
        viewBox={viewBox}
        look="flat"
        theme={theme}
        debug={debug}
        visibility={riderVisibility}
      />
    )}
    <svg ref={svgRef} viewBox={viewBox} className={`geometry-svg s2d${debug ? " s2d-debug" : ""}${showWrist ? " s2d--cockpit-focus" : ""}`}>
      <line className="s2d-ground" x1={activeBounds.minX} y1={groundY} x2={activeBounds.maxX} y2={groundY} />
      <Ruler
        minX={activeBounds.minX}
        maxX={activeBounds.maxX}
        groundY={groundY}
        marks={[
          { x: bike.rearAxle.x, label: "R.AXLE" },
          { x: bike.bb.x, label: "BB 0" },
          { x: bike.frontAxle.x, label: `F.AXLE · WB ${Math.round(bike.frontAxle.x - bike.rearAxle.x)}` },
        ]}
      />

      {legacy && (
        <>
      {/* far (left) side: limbs, brakes and crank behind the frame; the drive side is drawn in front of it */}
      <g className="s2d-far">
        {visibleParts.legs && polys(fig.farLeg, "leg")}
        {visibleParts.feet && fig.farShoe && <polygon data-part="shoe" className="s2d-shoe" points={fig.farShoe} />}
        {visibleParts.arms && polys(fig.farArm, "arm")}
      </g>
      <Wheel axle={bike.rearAxle} radius={R} />
      <Wheel axle={bike.frontAxle} radius={R} />
      <DiscBrakes bike={bike} />
      <FarCrank bike={bike} farSpindle={visibleParts.legs ? farPose.spindle : null} />
      <FrameDrawing bike={bike} cockpit={cockpit} />
      <DriveSide bike={bike} />
      <NearCrank bike={bike} cleatCrankEnd={v(bike.cleat.x + components.cleat_setback, bike.cleat.y)} />

      {/* near body */}
      <g>
        {visibleParts.torso && polys(fig.torso, "torso")}
        {visibleParts.legs && polys(fig.nearLeg, "leg")}
        {visibleParts.feet && <polygon data-part="shoe" className="s2d-shoe" points={fig.nearShoe} />}
        {visibleParts.arms && polys(fig.nearArm, "arm")}
        {visibleParts.head && <polygon data-part="torso" className="s2d-clay" points={fig.head} />}
      </g>
      <CockpitDrawing cockpit={cockpit} />
      {visibleParts.arms && <polygon data-part="arm" className="s2d-glove" points={fig.glove} />}
        </>
      )}
      {ghostCockpit && <CockpitSide cockpit={ghostCockpit} ghost />}
      {visibleParts.arms && (showWrist || showJointAngles) && <WristMarker mannequin={mannequin} hoodRollDeg={cockpit.hoodRollDeg} />}

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

      {/* comparison fit: the previous leg and torso as accent dashed hairlines */}
      {compare && <GhostLines compare={compare} />}
      {/* KOPS: knee plumb at the 3 o'clock crank position */}
      {showKops && (() => {
        const q = strokeMetrics.poses[Math.round(strokeMetrics.samples / 4)];
        return (
          <g className="s2d-kops">
            <line x1={q.knee.x} y1={-q.knee.y} x2={q.knee.x} y2={-q.spindle.y + 60} />
            <line x1={q.knee.x} y1={-q.spindle.y} x2={q.spindle.x} y2={-q.spindle.y} />
            <circle cx={q.spindle.x} cy={-q.spindle.y} r={8} />
            <text x={q.knee.x + 14} y={-q.spindle.y + 40} className="geometry-label">
              KOPS {strokeMetrics.kopsOffsetMm >= 0 ? "+" : "−"}{Math.abs(Math.round(strokeMetrics.kopsOffsetMm))}
            </text>
          </g>
        );
      })()}

      {/* ideal contacts: registration crosshairs */}
      {visibleParts.contactMarkers &&
        (["saddle", "hoods", "cleat"] as const).map((contact) => {
          const pt = idealContacts[contact];
          return (
            <g key={contact}>
              <line x1={pt.x - 18} y1={-pt.y} x2={pt.x + 18} y2={-pt.y} className="geometry-target" />
              <line x1={pt.x} y1={-pt.y - 18} x2={pt.x} y2={-pt.y + 18} className="geometry-target" />
              <text x={pt.x + 12} y={-pt.y - 12} className="geometry-label geometry-label--target">
                {contact === "cleat" ? "PEDAL" : `IDEAL ${contact.toUpperCase()}`}
              </text>
            </g>
          );
        })}

      {warnings
        .filter((w) => w.severity !== "ok")
        .map((w) => {
          // Pedal: the gap is between the lifted foot and the pedal it can't reach.
          const actual = w.contact === "saddle" ? bike.saddle : w.contact === "hoods" ? bike.hoods : nearFootCleat;
          const ideal = idealContacts[w.contact];
          return (
            <g key={w.contact}>
              <line className="s2d-gap" x1={actual.x} y1={-actual.y} x2={ideal.x} y2={-ideal.y} />
              <text className="geometry-label s2d-gap-label" x={(actual.x + ideal.x) / 2 + 8} y={-((actual.y + ideal.y) / 2)}>
                {w.contact === "cleat" ? `FOOT OFF PEDAL · ${w.distance.toFixed(0)} mm` : `${w.distance.toFixed(0)} mm`}
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
    </div>
      {debug && <DebugLegend />}
      <StageOverlay mannequin={mannequin} bike={bike} strokeMetrics={strokeMetrics} svgRef={svgRef} viewBox={viewBox} was={compare?.metrics} />
    </div>
  );
};
