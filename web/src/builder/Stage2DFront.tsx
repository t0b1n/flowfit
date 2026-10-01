import React from "react";
import type { buildFrontalMannequin, buildRider } from "../geometry";
import { RiderVisibility } from "./shared";
import type { Components, MannequinSketch } from "../types";
export interface Stage2DFrontProps {
  frontalMannequin: ReturnType<typeof buildFrontalMannequin>;
  rider: ReturnType<typeof buildRider>;
  components: Components;
  mannequin: MannequinSketch;
  groundY: number;
  riderVisibility: RiderVisibility;
}

export const Stage2DFront: React.FC<Stage2DFrontProps> = ({ frontalMannequin, rider, components, mannequin, groundY, riderVisibility }) => {
  return (
    (() => {
            const fm = frontalMannequin;
            const halfW = Math.max(rider.shoulder_width, components.bar_width) / 2 + 150;
            const svgTop = -mannequin.head.y - 80;
            const svgH = groundY + mannequin.head.y + 160;
            const frontalViewBox = `${-halfW} ${svgTop} ${halfW * 2} ${svgH}`;
            const s = rider.height / 1800;
            const mline = (x1: number, y1: number, x2: number, y2: number, sw: number) => (
              <line x1={x1} y1={-y1} x2={x2} y2={-y2} className="geometry-mannequin__line" strokeWidth={Math.round(sw * s)} />
            );
            const hipMidY = (fm.hipL.y + fm.hipR.y) / 2;
            const shoulderMidY = (fm.shoulderL.y + fm.shoulderR.y) / 2;
            return (
              <svg viewBox={frontalViewBox} className="geometry-svg">
                <line x1={-halfW} y1={groundY} x2={halfW} y2={groundY} className="geometry-ground" />
                <circle cx={0} cy={0} r={12} fill="rgba(240,53,0,0.35)" />
                <line x1={-components.bar_width / 2} y1={-mannequin.hands.y} x2={components.bar_width / 2} y2={-mannequin.hands.y} className="geometry-mannequin__line" strokeWidth={Math.round(30 * s)} opacity={0.4} />
                <g className="geometry-mannequin">
                  {/* Legs */}
                  {riderVisibility.legs && (
                    <>
                      {mline(fm.ankleL.x, fm.ankleL.y, fm.kneeL.x, fm.kneeL.y, 82)}
                      {mline(fm.kneeL.x, fm.kneeL.y, fm.hipL.x, fm.hipL.y, 110)}
                      {mline(fm.ankleR.x, fm.ankleR.y, fm.kneeR.x, fm.kneeR.y, 82)}
                      {mline(fm.kneeR.x, fm.kneeR.y, fm.hipR.x, fm.hipR.y, 110)}
                    </>
                  )}
                  {/* Torso trapezoid: wide at shoulders, tapers to hip + ½ thigh width */}
                  {riderVisibility.torso && (() => {
                    const thighHalf = Math.round(110 * s) / 2;
                    const pts = [
                      `${fm.shoulderL.x},${-shoulderMidY}`,
                      `${fm.shoulderR.x},${-shoulderMidY}`,
                      `${fm.hipR.x + thighHalf},${-hipMidY}`,
                      `${fm.hipL.x - thighHalf},${-hipMidY}`,
                    ].join(" ");
                    return (
                      <polygon
                        points={pts}
                        fill="rgba(250,240,226,0.14)"
                        stroke="rgba(250,240,226,0.68)"
                        strokeWidth={Math.round(4 * s)}
                        strokeLinejoin="round"
                      />
                    );
                  })()}
                  {/* Arms */}
                  {riderVisibility.arms && (
                    <>
                      {mline(fm.shoulderL.x, fm.shoulderL.y, fm.elbowL.x, fm.elbowL.y, 70)}
                      {mline(fm.elbowL.x, fm.elbowL.y, fm.handsL.x, fm.handsL.y, 55)}
                      {mline(fm.shoulderR.x, fm.shoulderR.y, fm.elbowR.x, fm.elbowR.y, 70)}
                      {mline(fm.elbowR.x, fm.elbowR.y, fm.handsR.x, fm.handsR.y, 55)}
                    </>
                  )}
                  {/* Neck + head */}
                  {riderVisibility.head && (
                    <>
                      {mline(0, shoulderMidY, fm.head.x, fm.head.y, 55)}
                      <circle cx={fm.head.x} cy={-fm.head.y} r={Math.round(88 * s)} className="geometry-mannequin__head" strokeWidth={Math.round(4 * s)} style={{ fillOpacity: 0.22 }} />
                    </>
                  )}
                </g>
              </svg>
            );
          })()
  );
};
