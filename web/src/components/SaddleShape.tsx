import React from "react";

import type { ContactPoint } from "../types";

// Saddle silhouette drawn in bike coordinates (y up, flipped to SVG y here).
export const SaddleShape: React.FC<{
  contact: ContactPoint; // saddle surface
  clamp: ContactPoint;   // visual seatpost head / rail support
  className?: string;
}> = ({ contact, clamp, className }) => {
  const cx = contact.x;
  const cy = -contact.y;
  const clampSvgX = clamp.x;
  const clampSvgY = -clamp.y;
  const w = 120;
  const h = 25;
  const r = 8;
  const d = [
    `M ${cx - w + r},${cy}`,
    `L ${cx + w - r},${cy}`,
    `Q ${cx + w},${cy} ${cx + w},${cy + r}`,
    `L ${cx + w},${cy + h - r}`,
    `Q ${cx + w},${cy + h} ${cx + w - r},${cy + h}`,
    `L ${cx - w + r},${cy + h}`,
    `Q ${cx - w},${cy + h} ${cx - w},${cy + h - r}`,
    `L ${cx - w},${cy + r}`,
    `Q ${cx - w},${cy} ${cx - w + r},${cy}`,
    "Z",
  ].join(" ");
  return (
    <g className={className}>
      <path d={d} className="geometry-saddle-body" />
      <line x1={cx - 40} y1={cy + h} x2={clampSvgX} y2={clampSvgY} className="geometry-saddle-rail" />
      <line x1={cx + 40} y1={cy + h} x2={clampSvgX} y2={clampSvgY} className="geometry-saddle-rail" />
      <circle cx={clampSvgX} cy={clampSvgY} r={4} className="geometry-saddle-clamp" />
    </g>
  );
};
