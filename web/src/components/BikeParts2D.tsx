import React from "react";

import type { ContactPoint } from "../types";

const SPOKE_COUNT = 12;
const HUB_RADIUS = 14;

// Side-view wheel: tyre band + rim + hub + low-opacity spokes.
// Colors inherit from the surrounding .geometry-layer--a/b wrapper.
export const Wheel2D: React.FC<{
  axle: ContactPoint; // bike coords (y up)
  tyreRadius: number;
  rimRadius: number;
}> = ({ axle, tyreRadius, rimRadius }) => {
  const cx = axle.x;
  const cy = -axle.y;
  const spokes = Array.from({ length: SPOKE_COUNT }, (_, i) => {
    const a = (i / SPOKE_COUNT) * Math.PI * 2 + Math.PI / SPOKE_COUNT;
    return (
      <line
        key={i}
        x1={cx + HUB_RADIUS * Math.cos(a)}
        y1={cy + HUB_RADIUS * Math.sin(a)}
        x2={cx + rimRadius * Math.cos(a)}
        y2={cy + rimRadius * Math.sin(a)}
        className="geometry-spoke"
      />
    );
  });
  return (
    <g>
      <circle cx={cx} cy={cy} r={tyreRadius} className="geometry-tyre" />
      <circle cx={cx} cy={cy} r={rimRadius} className="geometry-wheel" />
      <circle cx={cx} cy={cy} r={rimRadius - 7} className="geometry-rim-inner" />
      {spokes}
      <circle cx={cx} cy={cy} r={HUB_RADIUS} className="geometry-hub" />
    </g>
  );
};

// Chainring at the BB, crank arm to the pedal spindle, and a pedal body.
export const Drivetrain2D: React.FC<{
  bb: ContactPoint;       // bike coords
  crankEnd: ContactPoint; // pedal spindle, bike coords
}> = ({ bb, crankEnd }) => (
  <g>
    <circle cx={bb.x} cy={-bb.y} r={62} className="geometry-chainring" />
    <circle cx={bb.x} cy={-bb.y} r={48} className="geometry-chainring geometry-chainring--inner" />
    <line
      x1={bb.x} y1={-bb.y}
      x2={crankEnd.x} y2={-crankEnd.y}
      className="geometry-crank"
    />
    <line
      x1={crankEnd.x - 42} y1={-crankEnd.y}
      x2={crankEnd.x + 42} y2={-crankEnd.y}
      className="geometry-pedal"
    />
  </g>
);

const normalizeAngle = (a: number) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a <= -Math.PI) a += Math.PI * 2;
  return a;
};

// Interior-angle arc at a body joint between two adjacent segments.
// Points are bike coords (y up); the label sits on the arc bisector.
export const JointAngleArc: React.FC<{
  joint: ContactPoint;
  a: ContactPoint;
  b: ContactPoint;
  label: string;
  color: string;
  radius?: number;
  labelRadiusFactor?: number;
}> = ({ joint, a, b, label, color, radius = 68, labelRadiusFactor = 1.55 }) => {
  const jx = joint.x;
  const jy = -joint.y;
  const a1 = Math.atan2(-a.y - jy, a.x - jx);
  const a2 = Math.atan2(-b.y - jy, b.x - jx);
  const delta = normalizeAngle(a2 - a1);
  const sweep = delta > 0 ? 1 : 0;
  const x1 = jx + radius * Math.cos(a1);
  const y1 = jy + radius * Math.sin(a1);
  const x2 = jx + radius * Math.cos(a2);
  const y2 = jy + radius * Math.sin(a2);
  const mid = a1 + delta / 2;
  const lr = radius * labelRadiusFactor;
  return (
    <g className="joint-angle">
      <path
        d={`M ${x1} ${y1} A ${radius} ${radius} 0 0 ${sweep} ${x2} ${y2}`}
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        opacity={0.9}
      />
      <text
        x={jx + lr * Math.cos(mid)}
        y={jy + lr * Math.sin(mid)}
        textAnchor="middle"
        dominantBaseline="middle"
        className="joint-angle__label"
        style={{ fill: color }}
      >
        {label}
      </text>
    </g>
  );
};
