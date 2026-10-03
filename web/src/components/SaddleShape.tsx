import React from "react";

import type { ContactPoint } from "../types";
import { SADDLE_CONTACT_U, SWORKS_POWER, contactHeight, contactX, lerpTable, type Pt, type SaddleTrace } from "../saddleModels";

const path = (pts: Pt[], at: (p: Pt) => Pt) =>
  pts.map((p, i) => { const [x, y] = at(p); return `${i ? "L" : "M"} ${x.toFixed(1)},${y.toFixed(1)}`; }).join(" ") + " Z";

// Traced saddle side view drawn in bike coordinates (y up, flipped to SVG y here). The side-profile
// top at the contact station sits on `contact`; the clamp is drawn where the seatpost head is.
export const SaddleShape: React.FC<{
  contact: ContactPoint; // saddle surface
  clamp: ContactPoint;   // visual seatpost head / rail support
  className?: string;
  trace?: SaddleTrace;
}> = ({ contact, clamp, className, trace = SWORKS_POWER }) => {
  const cx = contactX(trace, SADDLE_CONTACT_U);
  const dx = contact.x - cx;
  const dy = contact.y - contactHeight(trace, SADDLE_CONTACT_U);
  const at = ([x, y]: Pt): Pt => [x + dx, -(y + dy)];
  // the rail directly above the clamp; the seatpost head bridges any gap (saddle_stack vs the traced stack)
  const railY = lerpTable(trace.railLine, clamp.x - dx) + dy;
  return (
    <g className={className}>
      <path d={path(trace.rail, at)} className="geometry-saddle-railbody" />
      <path d={path(trace.shell, at)} className="geometry-saddle-body" />
      <line x1={clamp.x} y1={-railY} x2={clamp.x} y2={-clamp.y} className="geometry-saddle-rail" />
      <circle cx={clamp.x} cy={-clamp.y} r={4} className="geometry-saddle-clamp" />
    </g>
  );
};
