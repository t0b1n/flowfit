import React from "react";
import { PEDAL_BODY, SOLE_ABOVE_SPINDLE } from "../design/foot";
import { lerp } from "../design/riderBody";
import { buildFrontalMannequin, buildRider } from "../geometry";
import type { PedalStrokeLUT } from "../geometry";
import type { BikeSketch, Components, MannequinSketch } from "../types";
import { DebugLegend, DebugStyle } from "../debug";
import { ellipse, pts, seg, tube, v } from "./draw2d";
import { FORK, forkFrame, forkFrontOutline } from "../design/fork";
import { HUB } from "../design/bikeProfiles";
import { StageOverlay } from "./StageOverlay";
import { buildCockpit, type Cockpit } from "../cockpit";
import { CockpitFront, UciAnnotation } from "./Cockpit2D";
import { legacy2d } from "./legacy2d";
import { OrthoScene } from "../scene3d/OrthoScene";
import type { Geometry3DResponse } from "../bike3d";
import { useTheme } from "../design/useTheme";
import type { RiderVisibility } from "./shared";

export interface Stage2DFrontProps {
  /** the 3D scene data: the bike and rider are drawn by rendering it orthographically (from the front) under this SVG */
  geo3d: Geometry3DResponse;
  frontalMannequin: ReturnType<typeof buildFrontalMannequin>;
  rider: ReturnType<typeof buildRider>;
  components: Components;
  mannequin: MannequinSketch;
  groundY: number;
  bike: BikeSketch;
  strokeMetrics: PedalStrokeLUT;
  riderVisibility: RiderVisibility;
  weightKg: number;
  wheelRadius: number;
  compare?: import("../fits/capture").CompareTarget | null;
  /** dev-only: colour every component (see src/debug.tsx) */
  debug?: boolean;
  ghostCockpit?: Cockpit | null;
  showUci?: boolean;
  /** frame the cockpit and hands instead of the whole bike (cockpit focus) */
  zoomCockpit?: boolean;
}


/** Crank arm lateral offset from the BB centreline (matches the 3D crank root). */
const CRANK_Z = 52;

const poly = (cls: string, points: string, part?: string) => <polygon className={cls} points={points} data-part={part} />;

/** Front view: the same language as the side view, front-on. Hairline measurements, clay rider, frame/carbon bike. */
export const Stage2DFront: React.FC<Stage2DFrontProps> = ({
  geo3d,
  frontalMannequin: fm,
  rider,
  components,
  mannequin,
  groundY,
  riderVisibility,
  bike,
  strokeMetrics,
  weightKg,
  wheelRadius: R,
  compare,
  debug,
  ghostCockpit,
  showUci,
  zoomCockpit,
}) => {
  const legacy = legacy2d();
  const [theme] = useTheme();
  const hs = rider.height / 1800;
  const wk = (sens: number) => hs * Math.pow(weightKg / 75, sens);
  const cockpit = buildCockpit(bike.barClamp, components);
  const halfW = Math.max(rider.shoulder_width, components.bar_width, components.bar_drop_width ?? 0) / 2 + 150;
  const svgTop = -mannequin.head.y - 80;
  const svgH = groundY + mannequin.head.y + 160;
  const viewBox = zoomCockpit
    ? (() => {
        const cw = Math.max(cockpit.dropWidth, cockpit.hoodWidth, rider.shoulder_width * 0.8) / 2 + 150;
        const top = Math.max(mannequin.elbow.y, cockpit.sagittal[1].y + cockpit.hood.peak) + 90;
        const bottom = cockpit.sagittal[6].y - 140;
        return `${-cw} ${-top} ${cw * 2} ${top - bottom}`;
      })()
    : `${-halfW} ${svgTop} ${halfW * 2} ${svgH}`;
  const ft = bike.frontAxle;
  const hb = bike.headTubeBottom;
  const ht = bike.headTubeTop;
  const { u: forkU, len: forkLen } = forkFrame(hb, ft);
  const forkFront = forkFrontOutline(forkLen);
  // Left leg is the far leg, a half-stroke ahead: its knee and ankle sit at that crank angle's heights (the right leg is at BDC).
  const farPose = strokeMetrics.poses[0];
  const farCleatY = farPose.cleat.y;
  const kneeL = v(fm.kneeL.x, farPose.knee.y);
  const ankleL = v(fm.ankleL.x, farPose.ankle.y);
  const thigh = (t: number) => wk(0.35) * (lerp(86, 50, t) + 8) * 0.95;
  const shin = (t: number) => wk(0.15) * (lerp(40, 20, t) + 6);
  const upper = (t: number) => wk(0.2) * lerp(36, 28, t) * 1.15;
  const fore = (t: number) => wk(0.1) * lerp(31, 18, t);
  const shoulderMidY = (fm.shoulderR.y + fm.shoulderL.y) / 2;
  const hipMidY = (fm.hipR.y + fm.hipL.y) / 2;
  const thighHalf = wk(0.35) * 60;
  const torso = [
    [fm.shoulderR.x - 30 * hs, shoulderMidY],
    [fm.shoulderL.x + 30 * hs, shoulderMidY],
    [fm.hipL.x + thighHalf, hipMidY],
    [fm.hipR.x - thighHalf, hipMidY],
  ]
    .map(([x, y]) => `${x},${-y}`)
    .join(" ");

  return (
    <div className="s2d-wrap">
      {debug && <DebugStyle />}
      <div className="s2d-stack">
      {!legacy && (
        <OrthoScene
          geo={geo3d}
          strokeLUT={strokeMetrics}
          weightKg={weightKg}
          stanceWidth={components.stance_width ?? 155}
          view="front"
          viewBox={viewBox}
          look="flat"
          theme={theme}
          debug={debug}
          visibility={riderVisibility}
        />
      )}
      <svg viewBox={viewBox} className={`geometry-svg s2d${debug ? " s2d-debug" : ""}${zoomCockpit ? " s2d--cockpit-focus" : ""}`}>
        <line className="s2d-ground" x1={-halfW} y1={groundY} x2={halfW} y2={groundY} />
        <line className="s2d-gap" x1={0} y1={groundY} x2={0} y2={svgTop} />

        {legacy && (
          <>
        {/* frame behind the rider: down tube, BB shell, cranks, saddle */}
        {poly("s2d-frame", tube(v(0, 0), v(0, hb.y), 24, 22), "down_tube")}
        <ellipse className="s2d-frame" cx={0} cy={0} rx={34} ry={30} data-part="bb_shell" />
        {/* BB axle; each crank arm is seen end-on as a vertical bar offset from the BB, the pedal spindle runs outboard to the pedal under the shoe */}
        <rect data-part="crank" className="s2d-carbon" x={-CRANK_Z} y={-9} width={CRANK_Z * 2} height={18} />
        {[
          [fm.ankleR.x, bike.cleat.y],
          [fm.ankleL.x, farCleatY],
        ].map(([ax, py], i) => {
          const sx = ax < 0 ? -1 : 1;
          const cx = sx * CRANK_Z;
          return (
            <g key={i}>
              {poly("s2d-carbon", tube(v(cx, 0), v(cx, py), 15, 11), "crank")}
              <rect data-part="pedal" className="s2d-carbon" x={Math.min(cx, ax)} y={-py - 6} width={Math.abs(ax - cx)} height={12} />
              <rect data-part="pedal" className="s2d-carbon" x={ax - PEDAL_BODY[2] / 2} y={-py - PEDAL_BODY[1] / 2} width={PEDAL_BODY[2]} height={PEDAL_BODY[1]} />
            </g>
          );
        })}
        <rect data-part="saddle" className="s2d-saddle-front" x={-60} y={-bike.saddle.y} width={120} height={26} />

        {/* rider */}
        <g>
          {riderVisibility.legs && (
            <>
              {poly("s2d-clay", seg(fm.hipL, kneeL, thigh), "leg")}
              {poly("s2d-clay", seg(kneeL, v(ankleL.x, ankleL.y + 28 * hs), shin), "leg")}
              {poly("s2d-clay", seg(fm.hipR, fm.kneeR, thigh), "leg")}
              {poly("s2d-clay", seg(fm.kneeR, v(fm.ankleR.x, fm.ankleR.y + 28 * hs), shin), "leg")}
            </>
          )}
          {riderVisibility.feet && (
            <>
              {poly("s2d-shoe", ellipse(v(fm.ankleR.x, bike.cleat.y + SOLE_ABOVE_SPINDLE + 26 * hs), 44 * hs, 26 * hs), "shoe")}
              {poly("s2d-shoe", ellipse(v(fm.ankleL.x, farCleatY + SOLE_ABOVE_SPINDLE + 26 * hs), 44 * hs, 26 * hs), "shoe")}
            </>
          )}
          {riderVisibility.torso && <polygon data-part="torso" className="s2d-clay" points={torso} />}
          {riderVisibility.arms && (
            <>
              {poly("s2d-clay", ellipse(fm.shoulderR, 52 * hs, 56 * hs), "arm")}
              {poly("s2d-clay", ellipse(fm.shoulderL, 52 * hs, 56 * hs), "arm")}
            </>
          )}
          {riderVisibility.head && (
            <>
              {poly("s2d-clay", seg(v(0, shoulderMidY), fm.head, () => wk(0.25) * 44 * 1.2), "torso")}
              {poly("s2d-clay", ellipse(fm.head, 76 * hs, 108 * hs), "torso")}
            </>
          )}
        </g>

        {/* front end: wheel, fork, head tube, stem and bars (in front of the legs) */}
        {/* front hub seen end-on: thru-axle, shell, spoke flanges and the rotor on the rider's left (+x), behind the tyre */}
        <g data-part="wheel">
          <rect className="s2d-rotor-front" x={24 - 1.5} y={-(ft.y + 78)} width={3} height={156} />
          <rect className="s2d-hub" x={-(FORK.halfSpread + 10)} y={-ft.y - HUB.axleR} width={2 * (FORK.halfSpread + 10)} height={2 * HUB.axleR} rx={2} />
          <rect className="s2d-hub" x={-HUB.shellHalf} y={-ft.y - HUB.shellR} width={2 * HUB.shellHalf} height={2 * HUB.shellR} rx={5} />
          {[-1, 1].map((sd) => (
            <rect key={sd} className="s2d-hub" x={sd * HUB.flangeZ - HUB.flangeT / 2} y={-ft.y - HUB.flangeR} width={HUB.flangeT} height={2 * HUB.flangeR} rx={2} />
          ))}
        </g>
        <rect data-part="wheel" className="s2d-tyre-front" x={-14} y={-(ft.y + R)} width={28} height={2 * R} rx={14} />
        <rect data-part="wheel" className="s2d-rim-front" x={-11} y={-(ft.y + R - 28)} width={22} height={2 * (R - 28)} rx={6} />
        <rect data-part="head_tube" className="s2d-frame" x={-19} y={-ht.y} width={38} height={ht.y - hb.y} />
        {/* fork (design/fork.ts): blades arching into each other under the head tube, one piece */}
        <polygon data-part="fork" className="s2d-frame" points={pts(forkFront.map(([z, s]) => [z, hb.y + forkU.y * s]))} />
        <rect data-part="spacers" className="s2d-carbon" x={-17} y={-bike.steererTop.y} width={34} height={bike.steererTop.y - ht.y} />
        {/* steerer clamp: steererTop → 2·stemPivot − steererTop, i.e. stem_height along the leaning steerer, seen from the front */}
        <rect data-part="stem" className="s2d-carbon" x={-22} y={-(2 * bike.stemPivot.y - bike.steererTop.y)} width={44} height={2 * (bike.stemPivot.y - bike.steererTop.y)} rx={6} />
        <CockpitFront cockpit={cockpit} showUci={showUci} />
          </>
        )}
        {!legacy && showUci && <UciAnnotation cockpit={cockpit} />}
        {ghostCockpit && <CockpitFront cockpit={ghostCockpit} ghost />}

        {legacy && (
          <>
        {riderVisibility.arms && (
          <>
            {poly("s2d-clay", seg(fm.shoulderR, fm.elbowR, upper), "arm")}
            {poly("s2d-clay", seg(fm.elbowR, fm.handsR, fore), "arm")}
            {poly("s2d-clay", seg(fm.shoulderL, fm.elbowL, upper), "arm")}
            {poly("s2d-clay", seg(fm.elbowL, fm.handsL, fore), "arm")}
            {poly("s2d-glove", ellipse(fm.handsR, 26, 30), "arm")}
            {poly("s2d-glove", ellipse(fm.handsL, 26, 30), "arm")}
          </>
        )}
          </>
        )}
      </svg>
      </div>
      {debug && <DebugLegend />}
      <StageOverlay mannequin={mannequin} bike={bike} strokeMetrics={strokeMetrics} was={compare?.metrics} />
    </div>
  );
};
