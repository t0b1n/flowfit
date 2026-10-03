import React from "react";

import type { ContactPoint } from "../types";
import { SADDLE_CONTACT_U, SWORKS_POWER, contactHeight, contactX, type Pt, type SaddleTrace } from "../saddleModels";

const path = (pts: Pt[], at: (p: Pt) => Pt) =>
  pts.map((p, i) => { const [x, y] = at(p); return `${i ? "L" : "M"} ${x.toFixed(1)},${y.toFixed(1)}`; }).join(" ") + " Z";

// Traced saddle side view drawn in bike coordinates (y up, flipped to SVG y here). The side-profile
// top at the contact station sits on `contact`, so the rails sit on the clamp when saddle_stack is the
// traced stack (the default).
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
  return (
    <g className={className}>
      <path d={path(trace.rail, at)} className="geometry-saddle-railbody" />
      <path d={path(trace.shell, at)} className="geometry-saddle-body" />
      <circle cx={clamp.x} cy={-clamp.y} r={4} className="geometry-saddle-clamp" />
    </g>
  );
};
