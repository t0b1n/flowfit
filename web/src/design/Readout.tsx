import React from "react";

/**
 * Big (dot-matrix) or medium readout. Big size is `--readout-big-size` (104px default; hosts set
 * 72px in the 2D stage and 56px on mobile). Numbers are tabular so they never change width.
 */
export const Readout: React.FC<{
  size: "big" | "medium";
  value: React.ReactNode;
  unit?: string;
  eyebrow?: React.ReactNode;
  /** e.g. "▲ 3°" (see formatDelta); rendered in accent-text. */
  delta?: string;
  /** Muted trailing text on the delta line, e.g. "vs FIT 02 (147°)". */
  deltaNote?: React.ReactNode;
  className?: string;
}> = ({ size, value, unit, eyebrow, delta, deltaNote, className }) => (
  <div className={`ff-readout ff-readout--${size}${className ? ` ${className}` : ""}`}>
    {eyebrow != null && <div className="ff-eyebrow">{eyebrow}</div>}
    <div className="ff-readout__value">
      {value}
      {unit && <sup>{unit}</sup>}
    </div>
    {(delta || deltaNote) && (
      <div className="ff-readout__delta">
        {delta} {deltaNote != null && <span>{deltaNote}</span>}
      </div>
    )}
  </div>
);
