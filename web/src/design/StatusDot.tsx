import React from "react";

export type BandStatus = "in" | "near" | "out";

const LABEL: Record<BandStatus, string> = { in: "in band", near: "near band", out: "out of band" };

/** 7 px band-status dot. The only place band colours appear; never use them as chip fills. */
export const StatusDot: React.FC<{ status: BandStatus; title?: string; className?: string }> = ({
  status,
  title,
  className,
}) => (
  <span
    role="img"
    aria-label={LABEL[status]}
    title={title ?? LABEL[status]}
    className={`ff-dot ff-dot--${status}${className ? ` ${className}` : ""}`}
  />
);
