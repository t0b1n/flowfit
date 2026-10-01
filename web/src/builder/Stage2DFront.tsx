import React from "react";
import { lerp } from "../design/riderBody";
import { buildFrontalMannequin, buildRider } from "../geometry";
import type { PedalStrokeLUT } from "../geometry";
import type { BikeSketch, Components, MannequinSketch } from "../types";
import { ellipse, seg, tube, v } from "./draw2d";
import { StageOverlay } from "./StageOverlay";
import type { RiderVisibility } from "./shared";

export interface Stage2DFrontProps {
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
}


const poly = (cls: string, points: string, key?: React.Key) => <polygon key={key} className={cls} points={points} />;

/** Front view: the same language as the side view, front-on. Hairline measurements, clay rider, frame/carbon bike. */
export const Stage2DFront: React.FC<Stage2DFrontProps> = ({
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
}) => {
  const hs = rider.height / 1800;
  const wk = (sens: number) => hs * Math.pow(weightKg / 75, sens);
  const halfW = Math.max(rider.shoulder_width, components.bar_width) / 2 + 150;
  const svgTop = -mannequin.head.y - 80;
  const svgH = groundY + mannequin.head.y + 160;
  const viewBox = `${-halfW} ${svgTop} ${halfW * 2} ${svgH}`;
  const hw = components.bar_width / 2;
  const hy = mannequin.hands.y;
  const ft = bike.frontAxle;
  const hb = bike.headTubeBottom;
  const ht = bike.headTubeTop;
  const farCleatY = strokeMetrics.poses[0].cleat.y;
  const thigh = (t: number) => wk(0.35) * (lerp(86, 50, t) + 8) * 0.95;
  const shin = (t: number) => wk(0.15) * (lerp(40, 20, t) + 6);
  const upper = (t: number) => wk(0.2) * lerp(36, 28, t) * 1.15;
  const fore = (t: number) => wk(0.1) * lerp(31, 18, t);
  const shoulderMidY = (fm.shoulderL.y + fm.shoulderR.y) / 2;
  const hipMidY = (fm.hipL.y + fm.hipR.y) / 2;
  const thighHalf = wk(0.35) * 60;
  const torso = [
    [fm.shoulderL.x - 30 * hs, shoulderMidY],
    [fm.shoulderR.x + 30 * hs, shoulderMidY],
    [fm.hipR.x + thighHalf, hipMidY],
    [fm.hipL.x - thighHalf, hipMidY],
  ]
    .map(([x, y]) => `${x},${-y}`)
    .join(" ");

  return (
    <div className="s2d-wrap">
      <svg viewBox={viewBox} className="geometry-svg s2d">
        <line className="s2d-ground" x1={-halfW} y1={groundY} x2={halfW} y2={groundY} />
        <line className="s2d-gap" x1={0} y1={groundY} x2={0} y2={svgTop} />

        {/* frame behind the rider: down tube, BB shell, cranks, saddle */}
        {poly("s2d-frame", tube(v(0, 0), hb, 24, 22))}
        <ellipse className="s2d-frame" cx={0} cy={0} rx={34} ry={30} />
        {poly("s2d-carbon", tube(v(0, 0), v(fm.ankleL.x, bike.cleat.y), 13, 9))}
        {poly("s2d-carbon", tube(v(0, 0), v(fm.ankleR.x, farCleatY), 13, 9))}
        <rect className="s2d-saddle-front" x={-60} y={-bike.saddle.y} width={120} height={26} />

        {/* rider */}
        <g>
          {riderVisibility.legs && (
            <>
              {poly("s2d-clay", seg(fm.hipR, fm.kneeR, thigh))}
              {poly("s2d-clay", seg(fm.kneeR, fm.ankleR, shin))}
              {poly("s2d-clay", seg(fm.hipL, fm.kneeL, thigh))}
              {poly("s2d-clay", seg(fm.kneeL, fm.ankleL, shin))}
            </>
          )}
          {riderVisibility.feet && (
            <>
              {poly("s2d-shoe", ellipse(v(fm.ankleL.x, bike.cleat.y + 40), 38 * hs, 64 * hs))}
              {poly("s2d-shoe", ellipse(v(fm.ankleR.x, farCleatY + 40), 38 * hs, 64 * hs))}
            </>
          )}
          {riderVisibility.torso && <polygon className="s2d-clay" points={torso} />}
          {riderVisibility.arms && (
            <>
              {poly("s2d-clay", ellipse(fm.shoulderL, 52 * hs, 56 * hs))}
              {poly("s2d-clay", ellipse(fm.shoulderR, 52 * hs, 56 * hs))}
            </>
          )}
          {riderVisibility.head && (
            <>
              {poly("s2d-clay", seg(v(0, shoulderMidY), fm.head, () => wk(0.25) * 44 * 1.2))}
              {poly("s2d-clay", ellipse(fm.head, 76 * hs, 108 * hs))}
            </>
          )}
        </g>

        {/* front end: wheel, fork, head tube, stem and bars (in front of the legs) */}
        <rect className="s2d-tyre-front" x={-14} y={-(ft.y + R)} width={28} height={2 * R} rx={14} />
        <rect className="s2d-rim-front" x={-11} y={-(ft.y + R - 28)} width={22} height={2 * (R - 28)} rx={6} />
        <line className="s2d-fork-front" x1={-46} y1={-hb.y} x2={-40} y2={-ft.y} />
        <line className="s2d-fork-front" x1={46} y1={-hb.y} x2={40} y2={-ft.y} />
        <rect className="s2d-carbon" x={-48} y={-hb.y - 14} width={96} height={28} rx={6} />
        <rect className="s2d-frame" x={-19} y={-ht.y} width={38} height={ht.y - hb.y} />
        <rect className="s2d-carbon" x={-17} y={-bike.steererTop.y} width={34} height={bike.steererTop.y - ht.y} />
        <rect className="s2d-carbon" x={-22} y={-bike.barClamp.y - 18} width={44} height={36} rx={6} />
        <path
          className="s2d-bar"
          d={`M ${-hw + 30} ${-hy} L ${-hw} ${-hy} L ${-hw} ${-hy + 110} M ${hw - 30} ${-hy} L ${hw} ${-hy} L ${hw} ${-hy + 110} M ${-hw} ${-hy} L ${hw} ${-hy}`}
        />
        <circle className="s2d-hood-front" cx={-hw} cy={-hy} r={24} />
        <circle className="s2d-hood-front" cx={hw} cy={-hy} r={24} />

        {riderVisibility.arms && (
          <>
            {poly("s2d-clay", seg(fm.shoulderL, fm.elbowL, upper))}
            {poly("s2d-clay", seg(fm.elbowL, fm.handsL, fore))}
            {poly("s2d-clay", seg(fm.shoulderR, fm.elbowR, upper))}
            {poly("s2d-clay", seg(fm.elbowR, fm.handsR, fore))}
            {poly("s2d-glove", ellipse(fm.handsL, 26, 30))}
            {poly("s2d-glove", ellipse(fm.handsR, 26, 30))}
          </>
        )}
      </svg>
      <StageOverlay mannequin={mannequin} bike={bike} strokeMetrics={strokeMetrics} was={compare?.metrics} />
    </div>
  );
};
