import React from "react";
import { BikeGeometryAnnotations, BikeFitAnnotations } from "../BikeAnnotations";
import { Drivetrain2D, JointAngleArc, Wheel2D } from "../components/BikeParts2D";
import { SaddleShape } from "../components/SaddleShape";
import { angleAtPoint } from "../geometry";
import type { ContactPoint, FitWarning } from "../types";
import type { buildRider } from "../geometry";
import type { MannequinSketch, Components } from "../types";
import { RiderVisibility } from "./shared";
import type { FrameGeometry } from "../frameCatalog";
export interface Stage2DSideProps {
  viewBox: string;
  activeBounds: { minX: number; maxX: number; minY: number; maxY: number; };
  groundY: number;
  bike: { bb: ContactPoint; rearAxle: ContactPoint; frontAxle: ContactPoint; seatCluster: ContactPoint; seatTubeTop: ContactPoint; headTubeBottom: ContactPoint; headTubeTop: ContactPoint; saddle: ContactPoint; saddleClamp: ContactPoint; seatpostTop: ContactPoint; seatpostBend: ContactPoint; cleat: ContactPoint; crankEnd: ContactPoint; steererTop: ContactPoint; barClamp: ContactPoint; hoods: ContactPoint; };
  effectiveFrame: { stack: number; reach: number; head_angle_deg: number; seat_angle_deg: number; bb_drop: number; chainstay_length: number; fork_length: number; fork_offset: number; wheel_radius: number; wheelbase?: number; seat_tube_ct?: number; head_tube?: number; top_tube_effective?: number; };
  tyreSize: number;
  riderVisibility: RiderVisibility;
  rider: ReturnType<typeof buildRider>;
  mannequin: MannequinSketch;
  showJointAngles: boolean;
  kneeFlex: number;
  kneeTone: "ok" | "bad" | "warn" | "muted";
  targetTrunkAngleDeg: number;
  idealContacts: { saddle: ContactPoint; hoods: ContactPoint; cleat: ContactPoint; };
  warnings: FitWarning[];
  severitySvgColor: (s: "ok" | "warning" | "bad") => "#4cbf7e" | "#e8a33c" | "#e05252";
  showFitPositions: boolean;
  components: Components;
  showFrameGeometry: boolean;
  sizeData: { size: string; geometry: FrameGeometry; wheelbase?: number; front_center?: number; trail?: number; top_tube_effective?: number; standover?: number; bb_height?: number; seat_tube_ct?: number; head_tube?: number; stockCockpit?: { stem_length?: number; bar_width?: number; crank_length?: number; spacer_stack?: number; }; };
  frameMeasurementVisibility: { stack: boolean; reach: boolean; effectiveTopTube: boolean; headTubeLength: boolean; headTubeAngle: boolean; seatTubeAngle: boolean; seatTubeLength: boolean; bbDrop: boolean; chainstay: boolean; wheelbase: boolean; forkLength: boolean; forkOffset: boolean; };
}

export const Stage2DSide: React.FC<Stage2DSideProps> = ({ viewBox, activeBounds, groundY, bike, effectiveFrame, tyreSize, riderVisibility, rider, mannequin, showJointAngles, kneeFlex, kneeTone, targetTrunkAngleDeg, idealContacts, warnings, severitySvgColor, showFitPositions, components, showFrameGeometry, sizeData, frameMeasurementVisibility }) => {
  return (
    <svg viewBox={viewBox} className="geometry-svg">
              <line
                x1={activeBounds.minX} y1={groundY} x2={activeBounds.maxX} y2={groundY}
                className="geometry-ground"
              />

              <g className="geometry-layer geometry-layer--a">
                <Wheel2D
                  axle={bike.rearAxle}
                  tyreRadius={effectiveFrame.wheel_radius}
                  rimRadius={Math.max(effectiveFrame.wheel_radius - tyreSize, effectiveFrame.wheel_radius - 42)}
                />
                <Wheel2D
                  axle={bike.frontAxle}
                  tyreRadius={effectiveFrame.wheel_radius}
                  rimRadius={Math.max(effectiveFrame.wheel_radius - tyreSize, effectiveFrame.wheel_radius - 42)}
                />
                <Drivetrain2D bb={bike.bb} crankEnd={bike.crankEnd} />
                <line x1={bike.rearAxle.x} y1={-bike.rearAxle.y} x2={bike.bb.x} y2={-bike.bb.y} className="geometry-frame geometry-frame--main" />
                <line x1={bike.rearAxle.x} y1={-bike.rearAxle.y} x2={bike.seatCluster.x} y2={-bike.seatCluster.y} className="geometry-frame geometry-frame--seat" />
                <line x1={bike.bb.x} y1={-bike.bb.y} x2={bike.seatCluster.x} y2={-bike.seatCluster.y} className="geometry-frame geometry-frame--seat" />
                <line x1={bike.seatCluster.x} y1={-bike.seatCluster.y} x2={bike.seatTubeTop.x} y2={-bike.seatTubeTop.y} className="geometry-frame geometry-frame--seat" />
                <line x1={bike.seatCluster.x} y1={-bike.seatCluster.y} x2={bike.headTubeTop.x} y2={-bike.headTubeTop.y} className="geometry-frame geometry-frame--front" />
                <line x1={bike.bb.x} y1={-bike.bb.y} x2={bike.headTubeBottom.x} y2={-bike.headTubeBottom.y} className="geometry-frame geometry-frame--main" />
                <line x1={bike.headTubeBottom.x} y1={-bike.headTubeBottom.y} x2={bike.headTubeTop.x} y2={-bike.headTubeTop.y} className="geometry-frame geometry-frame--front" />
                <line x1={bike.headTubeBottom.x} y1={-bike.headTubeBottom.y} x2={bike.frontAxle.x} y2={-bike.frontAxle.y} className="geometry-frame geometry-frame--front" />
                <line x1={bike.seatTubeTop.x} y1={-bike.seatTubeTop.y} x2={bike.seatpostBend.x} y2={-bike.seatpostBend.y} className="geometry-frame geometry-frame--cockpit-thin" />
                <line x1={bike.seatpostBend.x} y1={-bike.seatpostBend.y} x2={bike.seatpostTop.x} y2={-bike.seatpostTop.y} className="geometry-frame geometry-frame--cockpit-thin" />
                <line x1={bike.steererTop.x} y1={-bike.steererTop.y} x2={bike.barClamp.x} y2={-bike.barClamp.y} className="geometry-frame geometry-frame--cockpit" />
                <line x1={bike.barClamp.x} y1={-bike.barClamp.y} x2={bike.hoods.x} y2={-bike.hoods.y} className="geometry-frame geometry-frame--cockpit-thin" />
                {/* Tube-junction dots so the frame reads as welded tubes, not a wireframe */}
                {[bike.bb, bike.seatCluster, bike.headTubeTop, bike.headTubeBottom, bike.rearAxle, bike.frontAxle, bike.barClamp].map((pt, i) => (
                  <circle key={i} cx={pt.x} cy={-pt.y} r={6} className="geometry-joint" />
                ))}
                <SaddleShape contact={bike.saddle} clamp={bike.seatpostTop} className="geometry-layer--a" />
                {riderVisibility.contactMarkers && (
                  <>
                    <circle cx={bike.hoods.x} cy={-bike.hoods.y} r={6} className="geometry-node geometry-node--contact" />
                    <circle cx={bike.cleat.x} cy={-bike.cleat.y} r={6} className="geometry-node geometry-node--contact" />
                  </>
                )}
              </g>

              {(() => {
                const s = rider.height / 1800;
                // Anatomical ankle joint is ~19% of foot length behind the ball of foot.
                // Used both for shoe collar drawing and as the shank line endpoint.
                const visualAnkleX = bike.cleat.x - rider.foot_length * 0.19 * s;
                // Two-tone limb: a wider low-opacity underlay gives the stick figure volume
                const bodyLine = (x1: number, y1: number, x2: number, y2: number, sw: number) => (
                  <g>
                    <line x1={x1} y1={-y1} x2={x2} y2={-y2} className="geometry-mannequin__flesh" strokeWidth={Math.round(sw * 1.18 * s)} />
                    <line x1={x1} y1={-y1} x2={x2} y2={-y2} className="geometry-mannequin__line" strokeWidth={Math.round(sw * s)} />
                  </g>
                );
                return (
                  <g className="geometry-mannequin">
                    {/* ── Foot / shoe ── */}
                    {riderVisibility.feet && (() => {
                      const cx    = bike.cleat.x;           // ball-of-foot / cleat / pedal axle
                      const sole  = -bike.cleat.y;          // SVG y at pedal axle
                      const ankSY = -mannequin.ankle.y;     // SVG y at foot stack height above sole
                      const fl    = rider.foot_length;

                      const ankX  = visualAnkleX;           // ankle collar x (behind ball)
                      const heelX = cx - fl * 0.55 * s;    // heel
                      const toeX  = cx + fl * 0.45 * s;    // toe

                      // Shoe outline: heel → sole → toe → upper front → collar (at ankle) → heel counter
                      const d = [
                        `M ${heelX + 8 * s},${sole}`,
                        `L ${toeX - 28 * s},${sole}`,
                        `Q ${toeX},${sole} ${toeX},${sole - 26 * s}`,
                        `L ${toeX - 35 * s},${ankSY + 18 * s}`,
                        `L ${ankX + 14 * s},${ankSY + 6 * s}`,
                        `L ${ankX - 10 * s},${ankSY}`,
                        `L ${heelX + 10 * s},${ankSY + 14 * s}`,
                        'Z',
                      ].join(' ');

                      return (
                        <g>
                          <path
                            d={d}
                            fill="rgba(250,240,226,0.11)"
                            stroke="rgba(250,240,226,0.62)"
                            strokeWidth={Math.round(3.5 * s)}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          {/* Stack height: dashed line from pedal axle up to ankle joint */}
                          <line
                            x1={cx} y1={sole}
                            x2={ankX} y2={ankSY}
                            stroke="rgba(250,240,226,0.35)"
                            strokeWidth={Math.round(2.5 * s)}
                            strokeDasharray={`${6 * s} ${4 * s}`}
                          />
                          {/* Cleat / pedal axle marker — short accent tick on the sole */}
                          <line
                            x1={cx} y1={sole - 18 * s}
                            x2={cx} y2={sole + 5 * s}
                            stroke="rgba(240,53,0,0.85)"
                            strokeWidth={Math.round(3.5 * s)}
                            strokeLinecap="round"
                          />
                        </g>
                      );
                    })()}
                    {/* Pelvis: connects saddle contact (ischial tuberosity) to hip joint centre */}
                    {riderVisibility.torso && (
                      <>
                        <line
                          x1={bike.saddle.x} y1={-bike.saddle.y}
                          x2={mannequin.hip.x} y2={-mannequin.hip.y}
                          className="geometry-mannequin__line"
                          strokeWidth={Math.round(80 * s)}
                          opacity={0.45}
                        />
                        {/* Lower torso: hip → spine joint */}
                        {bodyLine(mannequin.hip.x, mannequin.hip.y, mannequin.spineJoint.x, mannequin.spineJoint.y, 160)}
                        {/* Upper torso: spine joint → shoulder */}
                        {bodyLine(mannequin.spineJoint.x, mannequin.spineJoint.y, mannequin.shoulder.x, mannequin.shoulder.y, 175)}
                      </>
                    )}
                    {riderVisibility.legs && (
                      <>
                        {bodyLine(mannequin.hip.x, mannequin.hip.y, mannequin.knee.x, mannequin.knee.y, 110)}
                        {bodyLine(mannequin.knee.x, mannequin.knee.y, visualAnkleX, mannequin.ankle.y, 82)}
                      </>
                    )}
                    {riderVisibility.arms && (
                      <>
                        {bodyLine(mannequin.shoulder.x, mannequin.shoulder.y, mannequin.elbow.x, mannequin.elbow.y, 70)}
                        {bodyLine(mannequin.elbow.x, mannequin.elbow.y, mannequin.wrist.x, mannequin.wrist.y, 55)}
                        {bodyLine(mannequin.wrist.x, mannequin.wrist.y, mannequin.hands.x, mannequin.hands.y, 45)}
                      </>
                    )}
                    {riderVisibility.head && (
                      <>
                        {/* Neck: shoulder → neck base */}
                        {bodyLine(mannequin.shoulder.x, mannequin.shoulder.y, mannequin.neckBase.x, mannequin.neckBase.y, 55)}
                        {/* Neck → head */}
                        {bodyLine(mannequin.neckBase.x, mannequin.neckBase.y, mannequin.head.x, mannequin.head.y, 45)}
                        <circle cx={mannequin.head.x} cy={-mannequin.head.y} r={Math.round(88 * s)} className="geometry-mannequin__head" strokeWidth={Math.round(4 * s)} style={{ fillOpacity: 0.22 }} />
                      </>
                    )}
                  </g>
                );
              })()}

              {/* ── On-figure joint angle arcs, color-coded by constraint status ── */}
              {showJointAngles && (
                <g>
                  <JointAngleArc
                    joint={mannequin.knee}
                    a={mannequin.hip}
                    b={{ x: bike.cleat.x - rider.foot_length * 0.19 * (rider.height / 1800), y: mannequin.ankle.y }}
                    label={`Knee ${kneeFlex.toFixed(0)}° flex`}
                    color={
                      kneeTone === "ok" ? "#4cbf7e" : kneeTone === "warn" ? "#e8a33c" : kneeTone === "bad" ? "#e05252" : "rgba(250, 240, 226, 0.85)"
                    }
                  />
                  <JointAngleArc
                    joint={mannequin.hip}
                    a={mannequin.shoulder}
                    b={{ x: mannequin.hip.x + 300, y: mannequin.hip.y }}
                    label={`Trunk ${targetTrunkAngleDeg.toFixed(0)}°`}
                    color="#5fb8c4"
                    radius={90}
                    labelRadiusFactor={1.35}
                  />
                  <JointAngleArc
                    joint={mannequin.elbow}
                    a={mannequin.shoulder}
                    b={mannequin.wrist}
                    label={`Elbow ${(180 - angleAtPoint(mannequin.shoulder, mannequin.elbow, mannequin.wrist)).toFixed(0)}°`}
                    color="rgba(250, 240, 226, 0.75)"
                    radius={52}
                  />
                </g>
              )}

              {riderVisibility.contactMarkers && (["saddle", "hoods", "cleat"] as const).map((contact) => {
                const pt = idealContacts[contact];
                const w = warnings.find((warning) => warning.contact === contact);
                const crossStyle =
                  w && w.severity !== "ok"
                    ? { stroke: w.severity === "warning" ? "#e8a33c" : "#e05252" }
                    : undefined;
                return (
                  <g key={contact}>
                    <line x1={pt.x - 18} y1={-pt.y} x2={pt.x + 18} y2={-pt.y} className="geometry-target" style={crossStyle} />
                    <line x1={pt.x} y1={-pt.y - 18} x2={pt.x} y2={-pt.y + 18} className="geometry-target" style={crossStyle} />
                    <text x={pt.x + 12} y={-pt.y - 12} className="geometry-label geometry-label--target">
                      Ideal {contact}
                    </text>
                  </g>
                );
              })}

              {warnings
                .filter((w) => w.severity !== "ok")
                .map((w) => {
                  const actual =
                    w.contact === "saddle" ? bike.saddle : w.contact === "hoods" ? bike.hoods : bike.cleat;
                  const ideal = idealContacts[w.contact];
                  return (
                    <g key={w.contact}>
                      <line
                        x1={actual.x} y1={-actual.y} x2={ideal.x} y2={-ideal.y}
                        stroke={severitySvgColor(w.severity)}
                        strokeWidth={1.5} strokeDasharray="5 3" opacity={0.8}
                      />
                      <text
                        x={(actual.x + ideal.x) / 2 + 8}
                        y={-((actual.y + ideal.y) / 2)}
                        className="geometry-label"
                        style={{ fill: severitySvgColor(w.severity), fontSize: 20 }}
                      >
                        {w.distance.toFixed(0)} mm
                      </text>
                    </g>
                  );
                })}

              {showFitPositions && (
                <BikeFitAnnotations bike={bike} barWidth={components.bar_width} />
              )}
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
