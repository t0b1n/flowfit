import React from "react";
import { BikeFitAnnotations, BikeGeometryAnnotations, type FrameMeasurementVisibility } from "../BikeAnnotations";
import { JointAngleArc } from "../components/BikeParts2D";
import type { FrameGeometry, SizeData } from "../frameCatalog";
import type { buildRider, PedalStrokeLUT } from "../geometry";
import type { BikeSketch, Components, ContactPoint, FitWarning, MannequinSketch } from "../types";
import { CockpitDrawing, DrivetrainFar, FrameDrawing, NearHardware, Wheel } from "./BikeDrawing2D";
import { buildFigure, v } from "./draw2d";
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
  const footLenVis = rider.foot_length * (rider.height / 1800) * 0.19;
  const nearKnee = { joint: mannequin.knee, a: mannequin.hip, b: v(bike.cleat.x - footLenVis, mannequin.ankle.y) };

  return (
    <svg viewBox={viewBox} className="geometry-svg s2d">
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
          <JointAngleArc {...nearKnee} color="var(--ink)" />
          <JointAngleArc joint={mannequin.hip} a={mannequin.shoulder} b={v(mannequin.hip.x + 300, mannequin.hip.y)} color="var(--ink)" radius={90} />
          <JointAngleArc joint={mannequin.elbow} a={mannequin.shoulder} b={mannequin.wrist} color="var(--ink)" radius={52} />
        </g>
      )}

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
  );
};
