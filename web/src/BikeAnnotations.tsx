import React from "react";
import type { BikeSketch } from "./types";
import type { FrameGeometry, SizeData } from "./frameCatalog";

// ── Drawing constants (all in mm, bike-space scale) ───────────────────────────
const AH = 5;    // arrowhead half-width
const AL = 12;   // arrowhead leg length
const EG = 6;    // gap between feature and extension line start
const EO = 10;   // extension line overshoot past dim line
const ARC_R = 72; // angle arc radius

// ── Arrowhead ─────────────────────────────────────────────────────────────────
// dx,dy: unit vector pointing TOWARD the arrow tip
const Arrow: React.FC<{ x: number; y: number; dx: number; dy: number }> = ({ x, y, dx, dy }) => {
  const px = -dy; const py = dx;
  return (
    <g>
      <line x1={x} y1={y} x2={x - dx * AL + px * AH} y2={y - dy * AL + py * AH} className="ann-line" />
      <line x1={x} y1={y} x2={x - dx * AL - px * AH} y2={y - dy * AL - py * AH} className="ann-line" />
    </g>
  );
};

// ── Horizontal dimension ───────────────────────────────────────────────────────
const HorizDim: React.FC<{
  x1: number; x2: number;   // left and right endpoints of dim line (SVG coords)
  y: number;                // y of dim line
  eY1?: number; eY2?: number; // y of each feature point (for extension lines)
  label: string;
  labelAbove?: boolean;
}> = ({ x1, x2, y, eY1, eY2, label, labelAbove = true }) => {
  const left = Math.min(x1, x2);
  const right = Math.max(x1, x2);
  const mid = (left + right) / 2;
  const ly = labelAbove ? y - 8 : y + 22;

  const extLine = (fx: number, fy: number | undefined) => {
    if (fy === undefined) return null;
    const ds = Math.sign(y - fy) || 1;
    return <line x1={fx} y1={fy + EG * ds} x2={fx} y2={y + EO * (-ds)} className="ann-ext" />;
  };

  return (
    <g>
      {extLine(x1, eY1)}
      {extLine(x2, eY2)}
      <line x1={left} y1={y} x2={right} y2={y} className="ann-line" />
      <Arrow x={left} y={y} dx={-1} dy={0} />
      <Arrow x={right} y={y} dx={1} dy={0} />
      <text x={mid} y={ly} textAnchor="middle" className="ann-label">{label}</text>
    </g>
  );
};

// ── Vertical dimension ─────────────────────────────────────────────────────────
const VertDim: React.FC<{
  y1: number; y2: number;   // top and bottom of dim line (SVG coords, y1 < y2)
  x: number;                // x of dim line
  eX1?: number; eX2?: number;
  label: string;
  labelRight?: boolean;
}> = ({ y1, y2, x, eX1, eX2, label, labelRight = true }) => {
  const top = Math.min(y1, y2);
  const bot = Math.max(y1, y2);
  const mid = (top + bot) / 2;
  const lx = labelRight ? x + 8 : x - 8;

  const extLine = (fy: number, fx: number | undefined) => {
    if (fx === undefined) return null;
    const ds = Math.sign(x - fx) || 1;
    return <line x1={fx + EG * ds} y1={fy} x2={x + EO * (-ds)} y2={fy} className="ann-ext" />;
  };

  return (
    <g>
      {extLine(y1, eX1)}
      {extLine(y2, eX2)}
      <line x1={x} y1={top} x2={x} y2={bot} className="ann-line" />
      <Arrow x={x} y={top} dx={0} dy={-1} />
      <Arrow x={x} y={bot} dx={0} dy={1} />
      <text
        x={lx} y={mid}
        textAnchor={labelRight ? "start" : "end"}
        dominantBaseline="middle"
        className="ann-label"
      >
        {label}
      </text>
    </g>
  );
};

// ── Angle annotation ───────────────────────────────────────────────────────────
// Shows a small arc from `fromDeg` to `toDeg` (SVG angles: 0=right, 90=down, CW positive).
// Draws a plumb reference line and labels with the conventional angle from horizontal.
const AngleDim: React.FC<{
  cx: number; cy: number;
  fromDeg: number; toDeg: number; // arc sweeps CW from fromDeg to toDeg
  label: string;
  refLineDeg?: number; // draw a reference line at this SVG angle
  refLineLen?: number;
}> = ({ cx, cy, fromDeg, toDeg, label, refLineDeg, refLineLen = ARC_R + 20 }) => {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const x1 = cx + ARC_R * Math.cos(toRad(fromDeg));
  const y1 = cy + ARC_R * Math.sin(toRad(fromDeg));
  const x2 = cx + ARC_R * Math.cos(toRad(toDeg));
  const y2 = cy + ARC_R * Math.sin(toRad(toDeg));
  // Label at midpoint of arc, slightly outside
  const midRad = toRad((fromDeg + toDeg) / 2);
  const lr = ARC_R * 1.6;
  const lx = cx + lr * Math.cos(midRad);
  const ly = cy + lr * Math.sin(midRad);

  return (
    <g>
      {refLineDeg !== undefined && (
        <line
          x1={cx} y1={cy}
          x2={cx + refLineLen * Math.cos(toRad(refLineDeg))}
          y2={cy + refLineLen * Math.sin(toRad(refLineDeg))}
          className="ann-ext"
        />
      )}
      {/* sweep-flag=1 = CW in SVG screen coords */}
      <path d={`M ${x1} ${y1} A ${ARC_R} ${ARC_R} 0 0 1 ${x2} ${y2}`} fill="none" className="ann-line" />
      <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" className="ann-label">
        {label}
      </text>
    </g>
  );
};

// ── Fit position annotations ──────────────────────────────────────────────────
// Shows rider-contact measurements: saddle height, setback, saddle↔hoods reach
// & drop, bar width. These change dynamically as components are adjusted.

export const BikeFitAnnotations: React.FC<{
  bike: BikeSketch;
  barWidth: number; // mm, centre-to-centre
}> = ({ bike, barWidth }) => {
  // SVG coords throughout (y = -bikeY)
  const bb      = { x: 0,              y: 0 };
  const saddle  = { x: bike.saddle.x,  y: -bike.saddle.y };
  const hoods   = { x: bike.hoods.x,   y: -bike.hoods.y };

  // Derived measurements (in bike/mm space, positive = meaningful direction)
  const saddleHeight   = Math.round(bike.saddle.y);
  const saddleSetback  = Math.round(-bike.saddle.x);
  const hoodsDrop      = Math.round(bike.saddle.y - bike.hoods.y);
  // 2D forward projection (side-view x only)
  const hoodsFwdReach  = Math.round(bike.hoods.x - bike.saddle.x);
  // 3D corrected: each hood is barWidth/2 laterally off-centre; saddle is on the centreline
  const hoodsLateral   = barWidth / 2;
  const hoodsReach3D   = Math.round(Math.sqrt(hoodsFwdReach ** 2 + hoodsLateral ** 2));

  // Placement logic — keep dims in clear space, away from the frame tubes
  const saddleDimX   = saddle.x - 90;           // vertical dims left of saddle
  const saddleSetY   = saddle.y - 50;            // horiz setback dim: above saddle
  const sToHReachY   = hoods.y - 55;             // horiz saddle↔hoods dim: above hoods
  const sToHDropX    = hoods.x + 75;             // vertical drop dim: right of hoods
  const barIndY      = hoods.y + 45;             // bar-width indicator: below hoods

  return (
    <g className="bike-fit-annotations">

      {/* ── Saddle height from BB ── */}
      <VertDim
        y1={saddle.y} y2={bb.y}
        x={saddleDimX}
        eX1={saddle.x} eX2={bb.x}
        label={`${saddleHeight}`}
        labelRight={false}
      />

      {/* ── Saddle setback from BB ── */}
      <HorizDim
        x1={bb.x} x2={saddle.x}
        y={saddleSetY}
        eY1={bb.y} eY2={saddle.y}
        label={`${saddleSetback} SB`}
        labelAbove={true}
      />

      {/* ── Saddle → hoods: horizontal reach ── */}
      <HorizDim
        x1={saddle.x} x2={hoods.x}
        y={sToHReachY}
        eY1={saddle.y} eY2={hoods.y}
        label={`${hoodsFwdReach}→${hoodsReach3D}`}
        labelAbove={true}
      />

      {/* ── Saddle → hoods: vertical drop ── */}
      <VertDim
        y1={saddle.y} y2={hoods.y}
        x={sToHDropX}
        eX1={saddle.x} eX2={hoods.x}
        label={`${hoodsDrop} drop`}
        labelRight={true}
      />

      {/* ── Bar width indicator ──
            Bar width is a lateral (into-the-page) measurement. In the 2D
            side view we represent it as a horizontal span centered on the
            hoods contact, drawn as a standard dimension line at barIndY.
            The tick marks make it clear this is a cross-section measurement. */}
      <g>
        {/* tick marks */}
        <line x1={hoods.x - barWidth / 2} y1={barIndY - 12} x2={hoods.x - barWidth / 2} y2={barIndY + 12} className="ann-ext" />
        <line x1={hoods.x + barWidth / 2} y1={barIndY - 12} x2={hoods.x + barWidth / 2} y2={barIndY + 12} className="ann-ext" />
        {/* span line with inward arrows */}
        <line x1={hoods.x - barWidth / 2} y1={barIndY} x2={hoods.x + barWidth / 2} y2={barIndY} className="ann-line" />
        <Arrow x={hoods.x - barWidth / 2} y={barIndY} dx={-1} dy={0} />
        <Arrow x={hoods.x + barWidth / 2} y={barIndY} dx={1} dy={0} />
        <text x={hoods.x} y={barIndY + 22} textAnchor="middle" className="ann-label">
          {barWidth} bars
        </text>
      </g>

    </g>
  );
};

export const FRAME_MEASUREMENT_IDS = [
  "stack",
  "reach",
  "effectiveTopTube",
  "headTubeLength",
  "headTubeAngle",
  "seatTubeAngle",
  "seatTubeLength",
  "bbDrop",
  "chainstay",
  "wheelbase",
  "forkLength",
  "forkOffset",
] as const;

export type FrameMeasurementId = typeof FRAME_MEASUREMENT_IDS[number];
export type FrameMeasurementVisibility = Record<FrameMeasurementId, boolean>;

// ── Main component ─────────────────────────────────────────────────────────────
export const BikeGeometryAnnotations: React.FC<{
  bike: BikeSketch;
  frame: FrameGeometry;
  sizeData: SizeData;
  visibleMeasurements: FrameMeasurementVisibility;
}> = ({ bike, frame, sizeData, visibleMeasurements }) => {
  // Convert all key points to SVG coords (x same, y = -bikeY)
  const bb    = { x: 0, y: 0 };
  const htTop = { x: frame.reach, y: -frame.stack };
  const htBot = { x: bike.headTubeBottom.x, y: -bike.headTubeBottom.y };
  const ettSeat = sizeData.top_tube_effective != null
    ? { x: htTop.x - sizeData.top_tube_effective, y: htTop.y }
    : { x: bike.seatCluster.x, y: htTop.y };
  const stTop = { x: bike.seatTubeTop.x,    y: -bike.seatTubeTop.y };
  const rearA = { x: bike.rearAxle.x,       y: -bike.rearAxle.y };
  const frontA = { x: bike.frontAxle.x,     y: -bike.frontAxle.y };

  // Head tube length in mm (Euclidean distance between tube endpoints)
  const htLen = Math.round(frame.head_tube ?? Math.hypot(htTop.x - htBot.x, htTop.y - htBot.y));

  // Effective top tube is horizontal from the seat tube axis at HT-top height.
  const ettLen = Math.round(sizeData.top_tube_effective ?? (htTop.x - ettSeat.x));

  // Placement offsets
  const dimRightX  = htTop.x + 85;
  const dimTopY    = Math.min(htTop.y, stTop.y) - 60;
  const dimBotY    = Math.max(rearA.y, bb.y) + 80;
  const dimWbY     = dimBotY + 70;
  const forkDimY   = dimWbY + 52;
  const forkDimX   = frontA.x + 60;
  const seatTubeDimX = stTop.x - 60;

  // Seat tube angle: SVG angle of the tube's downward extension = sa° from rightward
  const sa = frame.seat_angle_deg;
  // Head tube angle: SVG angle of tube's downward extension = ha° from rightward
  const ha = frame.head_angle_deg;
  const wheelbase = sizeData.wheelbase ?? Math.round(frontA.x - rearA.x);
  const seatTubeLength = frame.seat_tube_ct ?? null;

  return (
    <g className="bike-geo-annotations">

      {visibleMeasurements.stack && (
        <VertDim
          y1={htTop.y} y2={bb.y}
          x={dimRightX}
          eX1={htTop.x} eX2={bb.x}
          label={`${frame.stack}`}
          labelRight={true}
        />
      )}

      {visibleMeasurements.reach && (
        <HorizDim
          x1={bb.x} x2={htTop.x}
          y={dimTopY}
          eY1={bb.y} eY2={htTop.y}
          label={`${frame.reach}`}
          labelAbove={true}
        />
      )}

      {visibleMeasurements.effectiveTopTube && (
        <HorizDim
          x1={ettSeat.x} x2={htTop.x}
          y={dimTopY + 45}
          eY1={ettSeat.y} eY2={htTop.y}
          label={`${ettLen} ETT`}
          labelAbove={true}
        />
      )}

      {visibleMeasurements.headTubeLength && (
        <VertDim
          y1={htTop.y} y2={htBot.y}
          x={htTop.x + 55}
          eX1={htTop.x} eX2={htBot.x}
          label={`${htLen} HT`}
          labelRight={true}
        />
      )}

      {visibleMeasurements.seatTubeLength && seatTubeLength !== null && (
        <VertDim
          y1={stTop.y} y2={bb.y}
          x={seatTubeDimX}
          eX1={stTop.x} eX2={bb.x}
          label={`${Math.round(seatTubeLength)} ST`}
          labelRight={false}
        />
      )}

      {visibleMeasurements.bbDrop && (
        <VertDim
          y1={rearA.y} y2={bb.y}
          x={rearA.x + 55}
          eX1={rearA.x} eX2={bb.x}
          label={`${frame.bb_drop}`}
          labelRight={false}
        />
      )}

      {visibleMeasurements.chainstay && (
        <HorizDim
          x1={rearA.x} x2={bb.x}
          y={dimBotY}
          eY1={rearA.y} eY2={bb.y}
          label={`${frame.chainstay_length}`}
          labelAbove={false}
        />
      )}

      {visibleMeasurements.wheelbase && (
        <HorizDim
          x1={rearA.x} x2={frontA.x}
          y={dimWbY}
          eY1={rearA.y} eY2={frontA.y}
          label={`${Math.round(wheelbase)} WB`}
          labelAbove={false}
        />
      )}

      {visibleMeasurements.forkLength && (
        <VertDim
          y1={htBot.y} y2={frontA.y}
          x={forkDimX}
          eX1={htBot.x} eX2={frontA.x}
          label={`${Math.round(frame.fork_length)} FL`}
          labelRight={true}
        />
      )}

      {visibleMeasurements.forkOffset && (
        <HorizDim
          x1={htBot.x} x2={frontA.x}
          y={forkDimY}
          eY1={htBot.y} eY2={frontA.y}
          label={`${Math.round(frame.fork_offset)} FO`}
          labelAbove={false}
        />
      )}

      {visibleMeasurements.seatTubeAngle && (
        <AngleDim
          cx={bb.x} cy={bb.y}
          fromDeg={sa} toDeg={90}
          label={`${sa.toFixed(0)}°`}
          refLineDeg={90}
        />
      )}

      {visibleMeasurements.headTubeAngle && (
        <AngleDim
          cx={htBot.x} cy={htBot.y}
          fromDeg={ha} toDeg={90}
          label={`${ha.toFixed(1)}°`}
          refLineDeg={90}
        />
      )}

    </g>
  );
};
